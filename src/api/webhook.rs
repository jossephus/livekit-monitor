use std::collections::VecDeque;
use std::convert::Infallible;
use std::sync::Arc;

use livekit_api::access_token::TokenVerifier;
use livekit_api::webhooks::WebhookReceiver;
use livekit_protocol as proto;
use tokio::sync::{RwLock, broadcast};
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;
use warp::{Filter, Rejection, Reply};

use super::ApiError;
use crate::session_store::SessionStore;

const MAX_EVENTS: usize = 500;

#[derive(Clone)]
pub struct WebhookState {
    receiver: WebhookReceiver,
    events: Arc<RwLock<VecDeque<proto::WebhookEvent>>>,
    session_store: Arc<SessionStore>,
    broadcast_tx: broadcast::Sender<proto::WebhookEvent>,
}

impl WebhookState {
    pub fn new(api_key: &str, api_secret: &str, session_store: Arc<SessionStore>) -> Self {
        let verifier = TokenVerifier::with_api_key(api_key, api_secret);
        let (broadcast_tx, _) = broadcast::channel(256);
        Self {
            receiver: WebhookReceiver::new(verifier),
            events: Arc::new(RwLock::new(VecDeque::with_capacity(MAX_EVENTS))),
            session_store,
            broadcast_tx,
        }
    }
}

fn with_webhook_state(
    state: WebhookState,
) -> impl Filter<Extract = (WebhookState,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || state.clone())
}

pub fn routes(
    state: WebhookState,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    receive_webhook(state.clone())
        .or(event_stream(state.clone()))
        .or(list_events(state))
}

/// POST /api/webhook
fn receive_webhook(
    state: WebhookState,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "webhook")
        .and(warp::post())
        .and(warp::header::<String>("authorization"))
        .and(warp::body::bytes())
        .and(with_webhook_state(state))
        .and_then(handle_receive_webhook)
}

/// GET /api/webhook/events/stream (SSE)
fn event_stream(
    state: WebhookState,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "webhook" / "events" / "stream")
        .and(warp::get())
        .and(with_webhook_state(state))
        .map(|state: WebhookState| {
            let rx = state.broadcast_tx.subscribe();
            let stream = BroadcastStream::new(rx)
                .filter_map(|result| {
                    result.ok().and_then(|event| {
                        let json = serde_json::to_string(&event).ok()?;
                        Some(warp::sse::Event::default().data(json))
                    })
                })
                .map(Ok::<_, Infallible>);
            warp::sse::reply(warp::sse::keep_alive().stream(stream))
        })
}

/// GET /api/webhook/events
fn list_events(
    state: WebhookState,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "webhook" / "events")
        .and(warp::get())
        .and(with_webhook_state(state))
        .and_then(handle_list_events)
}

async fn handle_receive_webhook(
    auth_header: String,
    body: warp::hyper::body::Bytes,
    state: WebhookState,
) -> Result<impl Reply, Rejection> {
    let body_str = std::str::from_utf8(&body)
        .map_err(|e| warp::reject::custom(ApiError(format!("Invalid UTF-8 body: {e}"))))?;

    let event = state
        .receiver
        .receive(body_str, &auth_header)
        .map_err(|e| warp::reject::custom(ApiError(format!("Webhook validation failed: {e}"))))?;

    log::info!(
        "Received webhook event: {:?} for room {:?}",
        event.event,
        event.room.as_ref().map(|r| &r.name)
    );

    state
        .session_store
        .handle_webhook_event(&event)
        .map_err(|e| {
            warp::reject::custom(ApiError(format!("Failed to persist session event: {e}")))
        })?;

    if let Some(ref room) = event.room {
        if !room.name.is_empty() {
            if let Ok(json) = serde_json::to_string(room) {
                let _ = state.session_store.save_room_detail(&room.name, &json);
            }
        }
    }

    let label = format!("{:?}", event.event).to_lowercase();
    if let (Some(room), Some(participant)) = (&event.room, &event.participant) {
        if !room.name.is_empty() {
            let identity = if !participant.identity.is_empty() {
                &participant.identity
            } else {
                &participant.sid
            };
            if !identity.is_empty() {
                let is_live = !label.contains("participant_left");
                if let Ok(json) = serde_json::to_string(participant) {
                    let _ = state
                        .session_store
                        .save_participant(&room.name, identity, &json, is_live);
                }
            }
        }
    }

    if let Some(egress_info) = event.egress_info.clone() {
        state
            .session_store
            .upsert_egress_infos(&[egress_info])
            .map_err(|e| {
                warp::reject::custom(ApiError(format!("Failed to persist egress event: {e}")))
            })?;
    }

    let _ = state.broadcast_tx.send(event.clone());

    let mut events = state.events.write().await;
    if events.len() >= MAX_EVENTS {
        events.pop_front();
    }
    events.push_back(event);

    Ok(warp::reply::with_status(
        warp::reply::json(&serde_json::json!({"ok": true})),
        warp::http::StatusCode::OK,
    ))
}

async fn handle_list_events(state: WebhookState) -> Result<impl Reply, Rejection> {
    let events = state.events.read().await;
    let events_vec: Vec<&proto::WebhookEvent> = events.iter().collect();
    Ok(warp::reply::json(&events_vec))
}
