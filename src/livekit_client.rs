use livekit_api::services::egress::EgressClient;
use livekit_api::services::ingress::IngressClient;
use livekit_api::services::room::RoomClient;

pub struct LiveKitClients {
    pub room: RoomClient,
    pub egress: EgressClient,
    pub ingress: IngressClient,
}

impl LiveKitClients {
    pub fn new(url: &str, api_key: &str, api_secret: &str) -> Self {
        Self {
            room: RoomClient::with_api_key(url, api_key, api_secret),
            egress: EgressClient::with_api_key(url, api_key, api_secret),
            ingress: IngressClient::with_api_key(url, api_key, api_secret),
        }
    }
}
