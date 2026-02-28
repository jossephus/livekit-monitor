use std::sync::Arc;

use livekit_api::services::ingress::IngressListFilter;
use warp::{Filter, Rejection, Reply};

use super::{with_clients, ApiError};
use crate::livekit_client::LiveKitClients;

pub fn routes(
    clients: Arc<LiveKitClients>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    list_ingress(clients)
}

/// GET /api/ingress?room_name=optional
fn list_ingress(
    clients: Arc<LiveKitClients>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "ingress")
        .and(warp::get())
        .and(warp::query::<IngressQuery>())
        .and(with_clients(clients))
        .and_then(handle_list_ingress)
}

#[derive(serde::Deserialize)]
struct IngressQuery {
    room_name: Option<String>,
}

async fn handle_list_ingress(
    query: IngressQuery,
    clients: Arc<LiveKitClients>,
) -> Result<impl Reply, Rejection> {
    let filter = match query.room_name {
        Some(room) => IngressListFilter::Room(room),
        None => IngressListFilter::All,
    };

    let ingresses = clients
        .ingress
        .list_ingress(filter)
        .await
        .map_err(|e| warp::reject::custom(ApiError(e.to_string())))?;

    Ok(warp::reply::json(&ingresses))
}
