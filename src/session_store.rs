use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use livekit_protocol as proto;
use rusqlite::types::Value;
use rusqlite::{params, Connection};

#[derive(Clone)]
pub struct SessionStore {
    conn: Arc<Mutex<Connection>>,
}

#[derive(Clone, Default)]
pub struct SessionsFilter {
    pub search: Option<String>,
    pub status: Option<String>,
    pub room_name: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

pub struct SessionRecord {
    pub session_id: String,
    pub room_name: String,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub duration_seconds: i64,
    pub participants: i64,
    pub status: String,
}

impl SessionStore {
    pub fn new(path: &str) -> Result<Self, String> {
        if let Some(parent) = Path::new(path).parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("failed to create sqlite directory: {e}"))?;
            }
        }

        let conn = Connection::open(path).map_err(|e| format!("failed to open sqlite: {e}"))?;
        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                room_name TEXT NOT NULL,
                started_at INTEGER NOT NULL,
                ended_at INTEGER,
                status TEXT NOT NULL DEFAULT 'active'
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_room_name ON sessions(room_name);
            CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
            CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);

            CREATE TABLE IF NOT EXISTS session_participants (
                session_id TEXT NOT NULL,
                participant_identity TEXT NOT NULL,
                first_joined_at INTEGER NOT NULL,
                PRIMARY KEY (session_id, participant_identity),
                FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
            );
            ",
        )
        .map_err(|e| format!("failed to initialize sqlite schema: {e}"))?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn handle_webhook_event(&self, event: &proto::WebhookEvent) -> Result<(), String> {
        let room_name = event
            .room
            .as_ref()
            .map(|r| r.name.clone())
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| "unknown-room".to_string());
        let timestamp = normalize_timestamp(event.created_at as i64);
        let label = format!("{:?}", event.event).to_lowercase();

        let participant_identity = event
            .participant
            .as_ref()
            .map(|p| {
                if !p.identity.is_empty() {
                    p.identity.clone()
                } else {
                    p.sid.clone()
                }
            })
            .filter(|v| !v.is_empty());

        let mut conn = self
            .conn
            .lock()
            .map_err(|_| "failed to lock sqlite connection".to_string())?;
        let tx = conn
            .transaction()
            .map_err(|e| format!("failed to start sqlite tx: {e}"))?;

        if label.contains("room_started") {
            create_session(&tx, &room_name, timestamp)?;
        }

        if label.contains("participant_joined") {
            let session_id = find_or_create_active_session(&tx, &room_name, timestamp)?;
            if let Some(identity) = participant_identity {
                tx.execute(
                    "
                    INSERT OR IGNORE INTO session_participants
                    (session_id, participant_identity, first_joined_at)
                    VALUES (?1, ?2, ?3)
                    ",
                    params![session_id, identity, timestamp],
                )
                .map_err(|e| format!("failed to insert participant: {e}"))?;
            }
        }

        if label.contains("room_finished") {
            if let Some(session_id) = find_active_session(&tx, &room_name)? {
                tx.execute(
                    "
                    UPDATE sessions
                    SET ended_at = ?2, status = 'ended'
                    WHERE session_id = ?1
                    ",
                    params![session_id, timestamp],
                )
                .map_err(|e| format!("failed to end session: {e}"))?;
            }
        }

        tx.commit()
            .map_err(|e| format!("failed to commit sqlite tx: {e}"))?;
        Ok(())
    }

    pub fn list_sessions(&self, filter: SessionsFilter) -> Result<Vec<SessionRecord>, String> {
        let mut where_clause = String::from(" WHERE 1=1");
        let mut values: Vec<Value> = vec![];

        if let Some(status) = filter.status {
            where_clause.push_str(" AND s.status = ?");
            values.push(Value::Text(status));
        }

        if let Some(room_name) = filter.room_name {
            where_clause.push_str(" AND s.room_name = ?");
            values.push(Value::Text(room_name));
        }

        if let Some(search) = filter.search {
            where_clause.push_str(" AND (s.session_id LIKE ? OR s.room_name LIKE ?)");
            let pattern = format!("%{}%", search);
            values.push(Value::Text(pattern.clone()));
            values.push(Value::Text(pattern));
        }

        let limit = i64::from(filter.limit.unwrap_or(200));
        let offset = i64::from(filter.offset.unwrap_or(0));
        values.push(Value::Integer(limit));
        values.push(Value::Integer(offset));

        let query = format!(
            "
            SELECT
                s.session_id,
                s.room_name,
                s.started_at,
                s.ended_at,
                s.status,
                (
                    SELECT COUNT(*)
                    FROM session_participants sp
                    WHERE sp.session_id = s.session_id
                ) AS participants
            FROM sessions s
            {}
            ORDER BY s.started_at DESC
            LIMIT ? OFFSET ?
            ",
            where_clause
        );

        let conn = self
            .conn
            .lock()
            .map_err(|_| "failed to lock sqlite connection".to_string())?;
        let mut stmt = conn
            .prepare(&query)
            .map_err(|e| format!("failed to prepare sessions query: {e}"))?;

        let now = now_epoch_seconds();
        let rows = stmt
            .query_map(rusqlite::params_from_iter(values), |row| {
                let started_at: i64 = row.get(2)?;
                let ended_at: Option<i64> = row.get(3)?;
                let duration_end = ended_at.unwrap_or(now);

                Ok(SessionRecord {
                    session_id: row.get(0)?,
                    room_name: row.get(1)?,
                    started_at,
                    ended_at,
                    duration_seconds: (duration_end - started_at).max(0),
                    participants: row.get(5)?,
                    status: row.get(4)?,
                })
            })
            .map_err(|e| format!("failed to query sessions: {e}"))?;

        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(row.map_err(|e| format!("failed to map session row: {e}"))?);
        }
        Ok(sessions)
    }
}

fn create_session(
    tx: &rusqlite::Transaction<'_>,
    room_name: &str,
    started_at: i64,
) -> Result<String, String> {
    let session_id = format!("{}-{}", room_name, started_at);
    tx.execute(
        "
        INSERT OR IGNORE INTO sessions
        (session_id, room_name, started_at, status)
        VALUES (?1, ?2, ?3, 'active')
        ",
        params![session_id, room_name, started_at],
    )
    .map_err(|e| format!("failed to create session: {e}"))?;
    Ok(session_id)
}

fn find_active_session(
    tx: &rusqlite::Transaction<'_>,
    room_name: &str,
) -> Result<Option<String>, String> {
    tx.query_row(
        "
        SELECT session_id
        FROM sessions
        WHERE room_name = ?1 AND status = 'active'
        ORDER BY started_at DESC
        LIMIT 1
        ",
        params![room_name],
        |row| row.get(0),
    )
    .map(Some)
    .or_else(|e| {
        if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
            Ok(None)
        } else {
            Err(format!("failed to find active session: {e}"))
        }
    })
}

fn find_or_create_active_session(
    tx: &rusqlite::Transaction<'_>,
    room_name: &str,
    started_at: i64,
) -> Result<String, String> {
    if let Some(existing) = find_active_session(tx, room_name)? {
        return Ok(existing);
    }
    create_session(tx, room_name, started_at)
}

fn now_epoch_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn normalize_timestamp(raw: i64) -> i64 {
    if raw <= 0 {
        return now_epoch_seconds();
    }
    if raw > 1_000_000_000_000 {
        raw / 1000
    } else {
        raw
    }
}
