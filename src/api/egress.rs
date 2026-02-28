use std::sync::Arc;

use livekit_api::services::egress::{EgressListFilter, EgressListOptions};
use warp::{Filter, Rejection, Reply};

use super::{with_clients, ApiError};
use crate::livekit_client::LiveKitClients;

pub fn routes(
    clients: Arc<LiveKitClients>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    list_egress(clients)
}

/// GET /api/egress?room_name=optional
fn list_egress(
    clients: Arc<LiveKitClients>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "egress")
        .and(warp::get())
        .and(warp::query::<EgressQuery>())
        .and(with_clients(clients))
        .and_then(handle_list_egress)
}

#[derive(serde::Deserialize)]
struct EgressQuery {
    room_name: Option<String>,
}

async fn handle_list_egress(
    query: EgressQuery,
    clients: Arc<LiveKitClients>,
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

    Ok(warp::reply::json(&egresses))
}
