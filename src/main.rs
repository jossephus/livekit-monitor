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

/// Strip the base_path prefix from a path string.
fn strip_base<'a>(base_path: &str, full_path: &'a str) -> &'a str {
    if !base_path.is_empty() {
        if let Some(rest) = full_path.strip_prefix(base_path) {
            return rest.trim_start_matches('/');
        }
    }
    full_path.trim_start_matches('/')
}

/// Build the index.html content with the base path injected.
fn build_index_html(base_path: &str) -> Vec<u8> {
    let raw = FRONTEND_DIR
        .get_file("index.html")
        .map(|f| String::from_utf8_lossy(f.contents()).to_string())
        .unwrap_or_else(|| "<!-- index.html not found -->".to_string());

    let script = format!(
        r#"<script>window.__BASE_PATH__ = "{}";</script>"#,
        base_path
    );
    let mut html = raw.replace("</head>", &format!("{}\n</head>", script));

    if !base_path.is_empty() {
        html = html.replace("href=\"/assets/", &format!("href=\"{}/assets/", base_path));
        html = html.replace("src=\"/assets/", &format!("src=\"{}/assets/", base_path));
        html = html.replace("href=\"/vite.svg\"", &format!("href=\"{}/vite.svg\"", base_path));
    }

    html.into_bytes()
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

    if !config.base_path.is_empty() {
        log::info!("Base path: {}", config.base_path);
    }

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

    let api_routes = api::routes(
        clients.clone(),
        webhook_state.clone(),
        session_store.clone(),
        settings_info.clone(),
    );

    // Static files — strips base_path prefix before lookup in embedded dir
    let base_path_for_static = config.base_path.clone();
    let static_files = warp::get()
        .and(warp::path::full())
        .and_then(move |full: warp::path::FullPath| {
            let bp = base_path_for_static.clone();
            async move {
                let path = strip_base(&bp, full.as_str());

                if path.is_empty() {
                    return Err(warp::reject::not_found());
                }

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
            }
        });

    // SPA fallback — serves index.html for non-API, non-static paths
    let index_html = build_index_html(&config.base_path);
    let base_path_for_spa = config.base_path.clone();
    let spa_fallback = warp::get()
        .and(warp::path::full())
        .and_then(move |path: warp::path::FullPath| {
            let index = index_html.clone();
            let bp = base_path_for_spa.clone();
            async move {
                let raw = path.as_str();
                let stripped = strip_base(&bp, raw);
                if stripped.starts_with("api/") || raw.starts_with("/api/") {
                    Err(warp::reject::not_found())
                } else {
                    Ok::<_, warp::Rejection>(
                        warp::http::Response::builder()
                            .header(CONTENT_TYPE, "text/html; charset=utf-8")
                            .body(index)
                            .unwrap(),
                    )
                }
            }
        });

    let base_path = config.base_path.clone();

    if base_path.is_empty() {
        // No base path — simple route setup
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
    } else {
        // With base path — mount API routes under both / and /<base_path>/
        // so it works regardless of whether the reverse proxy strips the prefix.
        let bp_segment = base_path.trim_matches('/').to_string();
        let prefixed_api = warp::path(bp_segment)
            .and(api::routes(clients, webhook_state, session_store, settings_info));

        let routes = api_routes
            .or(prefixed_api)
            .or(static_files)
            .or(spa_fallback)
            .recover(api::handle_rejection);

        log::info!(
            "Starting server on port {} (frontend: embedded, sqlite: {}, base: {})",
            config.port,
            config.sqlite_path,
            base_path,
        );
        warp::serve(routes)
            .run(([0, 0, 0, 0], config.port))
            .await;
    };
}
