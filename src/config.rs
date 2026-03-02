use std::env;

pub struct Config {
    pub livekit_url: String,
    pub api_key: String,
    pub api_secret: String,
    pub port: u16,
    pub sqlite_path: String,
}

impl Config {
    pub fn from_env() -> Result<Self, env::VarError> {
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
        })
    }
}
