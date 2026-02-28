mod api;
mod config;
mod livekit_client;

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

    let routes = api::routes(clients).recover(api::handle_rejection);

    log::info!("Starting server on port {}", config.port);
    warp::serve(routes)
        .run(([0, 0, 0, 0], config.port))
        .await;
}
