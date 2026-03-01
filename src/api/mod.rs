pub mod egress;
pub mod ingress;
pub mod overview;
pub mod rooms;
pub mod sessions;
pub mod webhook;

use std::convert::Infallible;
use std::sync::Arc;

use serde::Serialize;
use warp::http::StatusCode;
use warp::{Filter, Rejection, Reply};

use crate::livekit_client::LiveKitClients;
use crate::session_store::SessionStore;

pub use webhook::WebhookState;

#[derive(Debug)]
pub struct ApiError(pub String);

impl warp::reject::Reject for ApiError {}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

pub fn with_clients(
    clients: Arc<LiveKitClients>,
) -> impl Filter<Extract = (Arc<LiveKitClients>,), Error = Infallible> + Clone {
    warp::any().map(move || clients.clone())
}

pub fn routes(
    clients: Arc<LiveKitClients>,
    webhook_state: WebhookState,
    session_store: Arc<SessionStore>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    rooms::routes(clients.clone())
        .or(egress::routes(clients.clone(), session_store.clone()))
        .or(ingress::routes(clients.clone()))
        .or(overview::routes(clients))
        .or(sessions::routes(session_store))
        .or(webhook::routes(webhook_state))
}

pub async fn handle_rejection(err: Rejection) -> Result<impl Reply, Infallible> {
    let (status, message) = if let Some(e) = err.find::<ApiError>() {
        (StatusCode::INTERNAL_SERVER_ERROR, e.0.clone())
    } else if err.is_not_found() {
        (StatusCode::NOT_FOUND, "Not found".to_string())
    } else if err.find::<warp::reject::MethodNotAllowed>().is_some() {
        (StatusCode::METHOD_NOT_ALLOWED, "Method not allowed".to_string())
    } else {
        (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
    };

    Ok(warp::reply::with_status(
        warp::reply::json(&ErrorBody { error: message }),
        status,
    ))
}
