use std::sync::Arc;

use warp::{Filter, Rejection, Reply};

use super::{with_clients, ApiError};
use crate::livekit_client::LiveKitClients;

pub fn routes(
    clients: Arc<LiveKitClients>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    list_rooms(clients.clone())
        .or(get_room(clients.clone()))
        .or(list_participants(clients.clone()))
        .or(delete_room(clients))
}

/// GET /api/rooms
fn list_rooms(
    clients: Arc<LiveKitClients>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "rooms")
        .and(warp::get())
        .and(with_clients(clients))
        .and_then(handle_list_rooms)
}

/// GET /api/rooms/:name
fn get_room(
    clients: Arc<LiveKitClients>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "rooms" / String)
        .and(warp::get())
        .and(with_clients(clients))
        .and_then(handle_get_room)
}

/// GET /api/rooms/:name/participants
fn list_participants(
    clients: Arc<LiveKitClients>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "rooms" / String / "participants")
        .and(warp::get())
        .and(with_clients(clients))
        .and_then(handle_list_participants)
}

/// DELETE /api/rooms/:name
fn delete_room(
    clients: Arc<LiveKitClients>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "rooms" / String)
        .and(warp::delete())
        .and(with_clients(clients))
        .and_then(handle_delete_room)
}

async fn handle_list_rooms(clients: Arc<LiveKitClients>) -> Result<impl Reply, Rejection> {
    let rooms = clients
        .room
        .list_rooms(vec![])
        .await
        .map_err(|e| warp::reject::custom(ApiError(e.to_string())))?;

    Ok(warp::reply::json(&rooms))
}

async fn handle_get_room(name: String, clients: Arc<LiveKitClients>) -> Result<impl Reply, Rejection> {
    let rooms = clients
        .room
        .list_rooms(vec![name.clone()])
        .await
        .map_err(|e| warp::reject::custom(ApiError(e.to_string())))?;

    match rooms.into_iter().next() {
        Some(room) => Ok(warp::reply::json(&room)),
        None => Err(warp::reject::not_found()),
    }
}

async fn handle_list_participants(
    name: String,
    clients: Arc<LiveKitClients>,
) -> Result<impl Reply, Rejection> {
    let participants = clients
        .room
        .list_participants(&name)
        .await
        .map_err(|e| warp::reject::custom(ApiError(e.to_string())))?;

    Ok(warp::reply::json(&participants))
}

async fn handle_delete_room(
    name: String,
    clients: Arc<LiveKitClients>,
) -> Result<impl Reply, Rejection> {
    clients
        .room
        .delete_room(&name)
        .await
        .map_err(|e| warp::reject::custom(ApiError(e.to_string())))?;

    Ok(warp::reply::with_status(
        warp::reply::json(&serde_json::json!({"deleted": name})),
        warp::http::StatusCode::OK,
    ))
}
