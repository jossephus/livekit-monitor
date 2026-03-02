use std::convert::Infallible;
use std::sync::Arc;

use serde::Serialize;
use warp::{Filter, Rejection, Reply};

use super::{with_session_store, ApiError};
use crate::session_store::SessionStore;

#[derive(Clone)]
pub struct SettingsInfo {
    pub livekit_url: String,
    pub api_key: String,
}

#[derive(Serialize)]
struct SettingsResponse {
    livekit_url: String,
    api_key: String,
}

pub fn routes(
    info: Arc<SettingsInfo>,
    session_store: Arc<SessionStore>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    get_settings(info).or(clear_table(session_store))
}

fn get_settings(
    info: Arc<SettingsInfo>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "settings")
        .and(warp::get())
        .and(with_settings(info))
        .map(|info: Arc<SettingsInfo>| {
            warp::reply::json(&SettingsResponse {
                livekit_url: info.livekit_url.clone(),
                api_key: info.api_key.clone(),
            })
        })
}

fn clear_table(
    session_store: Arc<SessionStore>,
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    warp::path!("api" / "clear" / String)
        .and(warp::delete())
        .and(with_session_store(session_store))
        .and_then(|group: String, store: Arc<SessionStore>| async move {
            match store.clear_table(&group) {
                Ok(deleted) => Ok::<_, Rejection>(warp::reply::json(
                    &serde_json::json!({ "deleted": deleted }),
                )),
                Err(e) => Err(warp::reject::custom(ApiError(e))),
            }
        })
}

fn with_settings(
    info: Arc<SettingsInfo>,
) -> impl Filter<Extract = (Arc<SettingsInfo>,), Error = Infallible> + Clone {
    warp::any().map(move || info.clone())
}
