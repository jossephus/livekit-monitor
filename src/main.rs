mod api;
mod config;
mod livekit_client;

use std::path::PathBuf;
use std::sync::Arc;

use config::Config;
use livekit_client::LiveKitClients;
use warp::Filter;

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

    let webhook_state = api::WebhookState::new(&config.api_key, &config.api_secret);

    let api_routes = api::routes(clients, webhook_state);

    let frontend_dir = PathBuf::from(&config.frontend_dir);
    let index_path = frontend_dir.join("index.html");

    let static_files = warp::fs::dir(frontend_dir);
    let spa_fallback = warp::any()
        .and(warp::path::full())
        .and_then(move |path: warp::path::FullPath| {
            let index = index_path.clone();
            async move {
                if path.as_str().starts_with("/api/") {
                    Err(warp::reject::not_found())
                } else {
                    Ok(warp::reply::html(
                        tokio::fs::read_to_string(&index)
                            .await
                            .unwrap_or_default(),
                    ))
                }
            }
        });

    let routes = api_routes
        .or(static_files)
        .or(spa_fallback)
        .recover(api::handle_rejection);

    log::info!(
        "Starting server on port {} (frontend: {})",
        config.port,
        config.frontend_dir,
    );
    warp::serve(routes)
        .run(([0, 0, 0, 0], config.port))
        .await;
}
