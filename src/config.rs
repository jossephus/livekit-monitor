use std::env;

pub struct Config {
    pub livekit_url: String,
    pub api_key: String,
    pub api_secret: String,
    pub port: u16,
    pub sqlite_path: String,
    pub base_path: String,
}

impl Config {
    pub fn from_env() -> Result<Self, env::VarError> {
        let base_path = env::var("BASE_PATH").unwrap_or_default();
        // Normalize: strip trailing slash, ensure leading slash if non-empty
        let base_path = if base_path.is_empty() || base_path == "/" {
            String::new()
        } else {
            let bp = base_path.trim_end_matches('/');
            if bp.starts_with('/') {
                bp.to_string()
            } else {
                format!("/{}", bp)
            }
        };

        Ok(Self {
            livekit_url: env::var("LIVEKIT_URL")?,
            api_key: env::var("LIVEKIT_API_KEY")?,
            api_secret: env::var("LIVEKIT_API_SECRET")?,
            port: env::var("PORT")
                .unwrap_or_else(|_| "3000".to_string())
                .parse()
                .unwrap_or(3000),
            sqlite_path: env::var("SQLITE_PATH")
                .unwrap_or_else(|_| "./data/monitor.db".to_string()),
            base_path,
        })
    }
}
