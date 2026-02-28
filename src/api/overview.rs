use std::sync::Arc;

use livekit_api::services::egress::{EgressListFilter, EgressListOptions};
use livekit_api::services::ingress::IngressListFilter;
use serde::Serialize;
use warp::{Filter, Rejection, Reply};

use super::{with_clients, ApiError};
use crate::livekit_client::LiveKitClients;

pub fn routes(
    clients: Arc<LiveKitClients>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    get_overview(clients)
}

/// GET /api/overview
fn get_overview(
    clients: Arc<LiveKitClients>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "overview")
        .and(warp::get())
        .and(with_clients(clients))
        .and_then(handle_get_overview)
}

#[derive(Serialize)]
struct OverviewResponse {
    total_rooms: usize,
    total_participants: usize,
    active_egresses: usize,
    active_ingresses: usize,
}

async fn handle_get_overview(clients: Arc<LiveKitClients>) -> Result<impl Reply, Rejection> {
    let rooms = clients
        .room
        .list_rooms(vec![])
        .await
        .map_err(|e| warp::reject::custom(ApiError(e.to_string())))?;

    let total_participants: usize = rooms
        .iter()
        .map(|r| r.num_participants as usize)
        .sum();

    let egresses = clients
        .egress
        .list_egress(EgressListOptions {
            filter: EgressListFilter::All,
            active: true,
        })
        .await
        .map_err(|e| warp::reject::custom(ApiError(e.to_string())))?;

    let ingresses = clients
        .ingress
        .list_ingress(IngressListFilter::All)
        .await
        .map_err(|e| warp::reject::custom(ApiError(e.to_string())))?;

    Ok(warp::reply::json(&OverviewResponse {
        total_rooms: rooms.len(),
        total_participants,
        active_egresses: egresses.len(),
        active_ingresses: ingresses.len(),
    }))
}
