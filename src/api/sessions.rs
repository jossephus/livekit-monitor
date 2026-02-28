use std::sync::Arc;

use serde::{Deserialize, Serialize};
use warp::{Filter, Rejection, Reply};

use super::ApiError;
use crate::session_store::{SessionStore, SessionsFilter};

#[derive(Deserialize)]
struct SessionsQuery {
    search: Option<String>,
    status: Option<String>,
    room_name: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
}

#[derive(Serialize)]
struct SessionResponse {
    session_id: String,
    room_name: String,
    started_at: i64,
    ended_at: Option<i64>,
    duration_seconds: i64,
    participants: i64,
    status: String,
}

fn with_session_store(
    session_store: Arc<SessionStore>,
) -> impl Filter<Extract = (Arc<SessionStore>,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || session_store.clone())
}

pub fn routes(
    session_store: Arc<SessionStore>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    list_sessions(session_store)
}

/// GET /api/sessions
fn list_sessions(
    session_store: Arc<SessionStore>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "sessions")
        .and(warp::get())
        .and(warp::query::<SessionsQuery>())
        .and(with_session_store(session_store))
        .and_then(handle_list_sessions)
}

async fn handle_list_sessions(
    query: SessionsQuery,
    session_store: Arc<SessionStore>,
) -> Result<impl Reply, Rejection> {
    if let Some(ref status) = query.status {
        if status != "active" && status != "ended" {
            return Err(warp::reject::custom(ApiError(
                "status must be one of: active, ended".to_string(),
            )));
        }
    }

    let sessions = session_store
        .list_sessions(SessionsFilter {
            search: query.search,
            status: query.status,
            room_name: query.room_name,
            limit: query.limit,
            offset: query.offset,
        })
        .map_err(|e| warp::reject::custom(ApiError(e)))?;

    let response: Vec<SessionResponse> = sessions
        .into_iter()
        .map(|s| SessionResponse {
            session_id: s.session_id,
            room_name: s.room_name,
            started_at: s.started_at,
            ended_at: s.ended_at,
            duration_seconds: s.duration_seconds,
            participants: s.participants,
            status: s.status,
        })
        .collect();

    Ok(warp::reply::json(&response))
}
