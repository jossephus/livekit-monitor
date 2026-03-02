use std::collections::HashSet;
use std::sync::Arc;

use serde::Serialize;
use warp::{Filter, Rejection, Reply};

use super::{ApiError, with_clients, with_session_store};
use crate::livekit_client::LiveKitClients;
use crate::session_store::SessionStore;

#[derive(Serialize)]
struct RoomHistoryItem {
    name: String,
    sid: String,
    created_at: Option<i64>,
    last_event_at: i64,
    status: String,
}

pub fn routes(
    clients: Arc<LiveKitClients>,
    session_store: Arc<SessionStore>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    list_rooms(clients.clone(), session_store.clone())
        .or(list_room_history(session_store.clone()))
        .or(get_room(clients.clone(), session_store.clone()))
        .or(list_participants(clients.clone(), session_store.clone()))
        .or(delete_room(clients))
}

/// GET /api/rooms
fn list_rooms(
    clients: Arc<LiveKitClients>,
    session_store: Arc<SessionStore>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "rooms")
        .and(warp::get())
        .and(with_clients(clients))
        .and(with_session_store(session_store))
        .and_then(handle_list_rooms)
}

/// GET /api/rooms/history
fn list_room_history(
    session_store: Arc<SessionStore>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "rooms" / "history")
        .and(warp::get())
        .and(with_session_store(session_store))
        .and_then(handle_list_room_history)
}

/// GET /api/rooms/:name
fn get_room(
    clients: Arc<LiveKitClients>,
    session_store: Arc<SessionStore>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "rooms" / String)
        .and(warp::get())
        .and(with_clients(clients))
        .and(with_session_store(session_store))
        .and_then(handle_get_room)
}

/// GET /api/rooms/:name/participants
fn list_participants(
    clients: Arc<LiveKitClients>,
    session_store: Arc<SessionStore>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "rooms" / String / "participants")
        .and(warp::get())
        .and(with_clients(clients))
        .and(with_session_store(session_store))
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

async fn handle_list_rooms(
    clients: Arc<LiveKitClients>,
    session_store: Arc<SessionStore>,
) -> Result<impl Reply, Rejection> {
    let rooms = clients
        .room
        .list_rooms(vec![])
        .await
        .map_err(|e| warp::reject::custom(ApiError(e.to_string())))?;

    session_store
        .reconcile_rooms_from_live(&rooms)
        .map_err(|e| warp::reject::custom(ApiError(e.to_string())))?;

    Ok(warp::reply::json(&rooms))
}

async fn handle_get_room(
    name: String,
    clients: Arc<LiveKitClients>,
    session_store: Arc<SessionStore>,
) -> Result<impl Reply, Rejection> {
    match clients.room.list_rooms(vec![name.clone()]).await {
        Ok(rooms) => {
            if let Some(room) = rooms.into_iter().next() {
                if let Ok(json) = serde_json::to_string(&room) {
                    let _ = session_store.save_room_detail(&room.name, &json);
                }
                return Ok(warp::reply::json(&room));
            }
        }
        Err(e) => {
            log::warn!("Failed to fetch live room {}: {}", name, e);
        }
    }

    match session_store.get_room_detail(&name) {
        Ok(Some(json)) => {
            let value: serde_json::Value = serde_json::from_str(&json)
                .map_err(|e| warp::reject::custom(ApiError(e.to_string())))?;
            Ok(warp::reply::json(&value))
        }
        _ => Err(warp::reject::not_found()),
    }
}

async fn handle_list_room_history(
    session_store: Arc<SessionStore>,
) -> Result<impl Reply, Rejection> {
    let rooms = session_store
        .list_room_history(Some(500))
        .map_err(|e| warp::reject::custom(ApiError(e.to_string())))?;

    let payload: Vec<RoomHistoryItem> = rooms
        .into_iter()
        .map(|room| RoomHistoryItem {
            name: room.room_name,
            sid: room.room_sid,
            created_at: room.created_at,
            last_event_at: room.last_event_at,
            status: room.status,
        })
        .collect();

    Ok(warp::reply::json(&payload))
}

async fn handle_list_participants(
    name: String,
    clients: Arc<LiveKitClients>,
    session_store: Arc<SessionStore>,
) -> Result<impl Reply, Rejection> {
    match clients.room.list_participants(&name).await {
        Ok(live_participants) => {
            let live_identities: HashSet<String> = live_participants
                .iter()
                .map(|p| {
                    if !p.identity.is_empty() {
                        p.identity.clone()
                    } else {
                        p.sid.clone()
                    }
                })
                .collect();

            let mut result: Vec<serde_json::Value> = live_participants
                .iter()
                .filter_map(|p| serde_json::to_value(p).ok())
                .collect();

            if let Ok(db_records) = session_store.get_room_participants(&name) {
                for record in db_records {
                    if !live_identities.contains(&record.identity) {
                        if let Ok(mut value) =
                            serde_json::from_str::<serde_json::Value>(&record.data_json)
                        {
                            if let Some(obj) = value.as_object_mut() {
                                obj.insert(
                                    "state".to_string(),
                                    serde_json::Value::Number(3.into()),
                                );
                            }
                            result.push(value);
                        }
                    }
                }
            }

            Ok(warp::reply::json(&result))
        }
        Err(e) => {
            log::warn!("Failed to fetch live participants for {}: {}", name, e);

            let db_records = session_store
                .get_room_participants(&name)
                .map_err(|e| warp::reject::custom(ApiError(e)))?;

            let result: Vec<serde_json::Value> = db_records
                .iter()
                .filter_map(|r| {
                    let mut value: serde_json::Value = serde_json::from_str(&r.data_json).ok()?;
                    if let Some(obj) = value.as_object_mut() {
                        obj.insert("state".to_string(), serde_json::Value::Number(3.into()));
                    }
                    Some(value)
                })
                .collect();

            Ok(warp::reply::json(&result))
        }
    }
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
