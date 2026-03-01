use std::sync::Arc;

use livekit_api::services::egress::{EgressListFilter, EgressListOptions};
use serde::Serialize;
use warp::{Filter, Rejection, Reply};

use super::{with_clients, ApiError};
use crate::livekit_client::LiveKitClients;
use crate::session_store::{EgressFilter as StoreEgressFilter, SessionStore};

pub fn routes(
    clients: Arc<LiveKitClients>,
    session_store: Arc<SessionStore>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    list_egress(clients, session_store.clone()).or(list_egress_history(session_store))
}

fn with_session_store(
    session_store: Arc<SessionStore>,
) -> impl Filter<Extract = (Arc<SessionStore>,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || session_store.clone())
}

/// GET /api/egress?room_name=optional
fn list_egress(
    clients: Arc<LiveKitClients>,
    session_store: Arc<SessionStore>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "egress")
        .and(warp::get())
        .and(warp::query::<EgressQuery>())
        .and(with_clients(clients))
        .and(with_session_store(session_store))
        .and_then(handle_list_egress)
}

#[derive(serde::Deserialize)]
struct EgressQuery {
    room_name: Option<String>,
}

#[derive(serde::Deserialize)]
struct EgressHistoryQuery {
    room_name: Option<String>,
    status: Option<String>,
    search: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
}

#[derive(Serialize)]
struct EgressHistoryResponse {
    egress_id: String,
    room_name: String,
    egress_type: String,
    status: String,
    destination: String,
    started_at: Option<i64>,
    ended_at: Option<i64>,
    updated_at: Option<i64>,
    error: String,
    details: String,
}

async fn handle_list_egress(
    query: EgressQuery,
    clients: Arc<LiveKitClients>,
    session_store: Arc<SessionStore>,
) -> Result<impl Reply, Rejection> {
    let filter = match query.room_name {
        Some(room) => EgressListFilter::Room(room),
        None => EgressListFilter::All,
    };

    let egresses = clients
        .egress
        .list_egress(EgressListOptions { filter, active: false })
        .await
        .map_err(|e| warp::reject::custom(ApiError(e.to_string())))?;

    session_store
        .upsert_egress_infos(&egresses)
        .map_err(|e| warp::reject::custom(ApiError(e)))?;

    Ok(warp::reply::json(&egresses))
}

/// GET /api/egress/history
fn list_egress_history(
    session_store: Arc<SessionStore>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "egress" / "history")
        .and(warp::get())
        .and(warp::query::<EgressHistoryQuery>())
        .and(with_session_store(session_store))
        .and_then(handle_list_egress_history)
}

async fn handle_list_egress_history(
    query: EgressHistoryQuery,
    session_store: Arc<SessionStore>,
) -> Result<impl Reply, Rejection> {
    let rows = session_store
        .list_egress_history(StoreEgressFilter {
            search: query.search,
            status: query.status,
            room_name: query.room_name,
            limit: query.limit,
            offset: query.offset,
        })
        .map_err(|e| warp::reject::custom(ApiError(e)))?;

    let response: Vec<EgressHistoryResponse> = rows
        .into_iter()
        .map(|r| EgressHistoryResponse {
            egress_id: r.egress_id,
            room_name: r.room_name,
            egress_type: r.egress_type,
            status: r.status,
            destination: r.destination,
            started_at: r.started_at,
            ended_at: r.ended_at,
            updated_at: r.updated_at,
            error: r.error,
            details: r.details,
        })
        .collect();

    Ok(warp::reply::json(&response))
}
