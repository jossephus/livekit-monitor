use std::convert::Infallible;
use std::sync::Arc;

use serde::Serialize;
use warp::{Filter, Rejection, Reply};

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
) -> impl Filter<Extract = (impl Reply,), Error = Rejection> + Clone {
    get_settings(info)
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

fn with_settings(
    info: Arc<SettingsInfo>,
) -> impl Filter<Extract = (Arc<SettingsInfo>,), Error = Infallible> + Clone {
    warp::any().map(move || info.clone())
}
