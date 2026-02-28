use std::collections::VecDeque;
use std::sync::Arc;

use livekit_api::access_token::TokenVerifier;
use livekit_api::webhooks::WebhookReceiver;
use livekit_protocol as proto;
use tokio::sync::RwLock;
use warp::{Filter, Rejection, Reply};

use super::ApiError;
use crate::session_store::SessionStore;

const MAX_EVENTS: usize = 500;

#[derive(Clone)]
pub struct WebhookState {
    receiver: WebhookReceiver,
    events: Arc<RwLock<VecDeque<proto::WebhookEvent>>>,
    session_store: Arc<SessionStore>,
}

impl WebhookState {
    pub fn new(api_key: &str, api_secret: &str, session_store: Arc<SessionStore>) -> Self {
        let verifier = TokenVerifier::with_api_key(api_key, api_secret);
        Self {
            receiver: WebhookReceiver::new(verifier),
            events: Arc::new(RwLock::new(VecDeque::with_capacity(MAX_EVENTS))),
            session_store,
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
    receive_webhook(state.clone()).or(list_events(state))
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
        .map_err(|e| warp::reject::custom(ApiError(format!("Failed to persist session event: {e}"))))?;

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
