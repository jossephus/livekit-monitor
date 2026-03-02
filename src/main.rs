mod api;
mod config;
mod livekit_client;
mod session_store;

use std::sync::Arc;

use config::Config;
use include_dir::{include_dir, Dir};
use livekit_client::LiveKitClients;
use session_store::SessionStore;
use api::settings::SettingsInfo;
use warp::Filter;
use warp::http::header::CONTENT_TYPE;

static FRONTEND_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/frontend/dist");

fn mime_from_path(path: &str) -> &'static str {
    if path.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".js") {
        "application/javascript; charset=utf-8"
    } else if path.ends_with(".mjs") {
        "application/javascript; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".json") {
        "application/json; charset=utf-8"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        "image/jpeg"
    } else if path.ends_with(".gif") {
        "image/gif"
    } else if path.ends_with(".ico") {
        "image/x-icon"
    } else if path.ends_with(".woff") {
        "font/woff"
    } else if path.ends_with(".woff2") {
        "font/woff2"
    } else if path.ends_with(".ttf") {
        "font/ttf"
    } else if path.ends_with(".wasm") {
        "application/wasm"
    } else {
        "application/octet-stream"
    }
}

#[tokio::main]
async fn main() {
    env_logger::init();

    let config = Config::from_env().expect(
        "Missing required environment variables: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET",
    );

    log::info!(
        "Connecting to LiveKit at {} (key: {})",
        config.livekit_url,
        config.api_key
    );

    let clients = Arc::new(LiveKitClients::new(
        &config.livekit_url,
        &config.api_key,
        &config.api_secret,
    ));

    let session_store = Arc::new(
        SessionStore::new(&config.sqlite_path)
            .expect("Failed to initialize SQLite session store"),
    );

    let webhook_state =
        api::WebhookState::new(&config.api_key, &config.api_secret, session_store.clone());

    let settings_info = Arc::new(SettingsInfo {
        livekit_url: config.livekit_url.clone(),
        api_key: config.api_key.clone(),
    });

    let api_routes = api::routes(clients, webhook_state, session_store, settings_info);

    let static_files = warp::path::tail().and_then(|tail: warp::path::Tail| async move {
        let path = tail.as_str();
        match FRONTEND_DIR.get_file(path) {
            Some(file) => {
                let mime = mime_from_path(path);
                Ok::<_, warp::Rejection>(
                    warp::http::Response::builder()
                        .header(CONTENT_TYPE, mime)
                        .body(file.contents().to_vec())
                        .unwrap(),
                )
            }
            None => Err(warp::reject::not_found()),
        }
    });

    let index_html = FRONTEND_DIR
        .get_file("index.html")
        .map(|f| f.contents())
        .unwrap_or(b"<!-- index.html not found -->");

    let spa_fallback = warp::any()
        .and(warp::path::full())
        .and_then(move |path: warp::path::FullPath| {
            async move {
                if path.as_str().starts_with("/api/") {
                    Err(warp::reject::not_found())
                } else {
                    Ok::<_, warp::Rejection>(
                        warp::http::Response::builder()
                            .header(CONTENT_TYPE, "text/html; charset=utf-8")
                            .body(index_html.to_vec())
                            .unwrap(),
                    )
                }
            }
        });

    let routes = api_routes
        .or(static_files)
        .or(spa_fallback)
        .recover(api::handle_rejection);

    log::info!(
        "Starting server on port {} (frontend: embedded, sqlite: {})",
        config.port,
        config.sqlite_path,
    );
    warp::serve(routes)
        .run(([0, 0, 0, 0], config.port))
        .await;
}
