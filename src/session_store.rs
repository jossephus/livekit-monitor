use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use livekit_protocol as proto;
use rusqlite::types::Value;
use rusqlite::{Connection, params};

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

#[derive(Clone, Default)]
pub struct EgressFilter {
    pub search: Option<String>,
    pub status: Option<String>,
    pub room_name: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

pub struct EgressRecord {
    pub egress_id: String,
    pub room_name: String,
    pub egress_type: String,
    pub status: String,
    pub destination: String,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub updated_at: Option<i64>,
    pub error: String,
    pub details: String,
}

pub struct RoomHistoryRecord {
    pub room_name: String,
    pub room_sid: String,
    pub created_at: Option<i64>,
    pub last_event_at: i64,
    pub status: String,
}

pub struct ParticipantRecord {
    pub identity: String,
    pub data_json: String,
    pub updated_at: i64,
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

            CREATE TABLE IF NOT EXISTS egress_jobs (
                egress_id TEXT PRIMARY KEY,
                room_name TEXT NOT NULL,
                egress_type TEXT NOT NULL,
                status TEXT NOT NULL,
                destination TEXT NOT NULL,
                started_at INTEGER,
                ended_at INTEGER,
                updated_at INTEGER,
                error TEXT NOT NULL DEFAULT '',
                details TEXT NOT NULL DEFAULT '',
                last_seen_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_egress_jobs_room_name ON egress_jobs(room_name);
            CREATE INDEX IF NOT EXISTS idx_egress_jobs_status ON egress_jobs(status);
            CREATE INDEX IF NOT EXISTS idx_egress_jobs_started_at ON egress_jobs(started_at DESC);

            CREATE TABLE IF NOT EXISTS room_history (
                room_name TEXT PRIMARY KEY,
                room_sid TEXT NOT NULL DEFAULT '-',
                created_at INTEGER,
                last_event_at INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'inactive'
            );
            CREATE INDEX IF NOT EXISTS idx_room_history_last_event_at ON room_history(last_event_at DESC);

            CREATE TABLE IF NOT EXISTS room_details (
                room_name TEXT PRIMARY KEY,
                data_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS room_participants (
                room_name TEXT NOT NULL,
                identity TEXT NOT NULL,
                data_json TEXT NOT NULL,
                is_live INTEGER NOT NULL DEFAULT 1,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (room_name, identity)
            );
            CREATE INDEX IF NOT EXISTS idx_room_participants_room ON room_participants(room_name);
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
        let mut timestamp = normalize_timestamp(event.created_at as i64);
        if timestamp == 0 {
            timestamp = now_epoch_seconds();
        }
        let label = format!("{:?}", event.event).to_lowercase();
        let room_sid = event
            .room
            .as_ref()
            .map(|r| r.sid.clone())
            .filter(|sid| !sid.is_empty())
            .unwrap_or_else(|| "-".to_string());

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

        upsert_room_history(&tx, &room_name, &room_sid, &label, timestamp)?;

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

    pub fn list_room_history(&self, limit: Option<u32>) -> Result<Vec<RoomHistoryRecord>, String> {
        let row_limit = i64::from(limit.unwrap_or(500));

        let conn = self
            .conn
            .lock()
            .map_err(|_| "failed to lock sqlite connection".to_string())?;
        let mut stmt = conn
            .prepare(
                "
                SELECT room_name, room_sid, created_at, last_event_at, status
                FROM room_history
                ORDER BY last_event_at DESC
                LIMIT ?1
                ",
            )
            .map_err(|e| format!("failed to prepare room history query: {e}"))?;

        let rows = stmt
            .query_map(params![row_limit], |row| {
                Ok(RoomHistoryRecord {
                    room_name: row.get(0)?,
                    room_sid: row.get(1)?,
                    created_at: row.get(2)?,
                    last_event_at: row.get(3)?,
                    status: row.get(4)?,
                })
            })
            .map_err(|e| format!("failed to query room history: {e}"))?;

        let mut records = Vec::new();
        for row in rows {
            records.push(row.map_err(|e| format!("failed to map room history row: {e}"))?);
        }

        Ok(records)
    }

    pub fn reconcile_rooms_from_live(&self, rooms: &[proto::Room]) -> Result<(), String> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| "failed to lock sqlite connection".to_string())?;
        let tx = conn
            .transaction()
            .map_err(|e| format!("failed to start sqlite tx: {e}"))?;

        let now = now_epoch_seconds();

        for room in rooms {
            if room.name.is_empty() {
                continue;
            }

            let room_sid = if room.sid.is_empty() {
                "-".to_string()
            } else {
                room.sid.clone()
            };
            let created_at = to_optional_timestamp(room.creation_time);
            let last_event_at = created_at.unwrap_or(now).max(now);

            tx.execute(
                "
                INSERT INTO room_history
                (room_name, room_sid, created_at, last_event_at, status)
                VALUES (?1, ?2, ?3, ?4, 'active')
                ON CONFLICT(room_name) DO UPDATE SET
                    room_sid = CASE
                        WHEN excluded.room_sid != '-' THEN excluded.room_sid
                        ELSE room_history.room_sid
                    END,
                    created_at = COALESCE(room_history.created_at, excluded.created_at),
                    last_event_at = CASE
                        WHEN excluded.last_event_at > room_history.last_event_at THEN excluded.last_event_at
                        ELSE room_history.last_event_at
                    END,
                    status = 'active'
                ",
                params![room.name, room_sid, created_at, last_event_at],
            )
            .map_err(|e| format!("failed to upsert live room history: {e}"))?;
        }

        if rooms.is_empty() {
            tx.execute(
                "
                UPDATE room_history
                SET status = 'inactive', last_event_at = CASE WHEN last_event_at < ?1 THEN ?1 ELSE last_event_at END
                WHERE status = 'active'
                ",
                params![now],
            )
            .map_err(|e| format!("failed to mark rooms inactive: {e}"))?;
        } else {
            let placeholders = vec!["?"; rooms.len()].join(",");
            let query = format!(
                "
                UPDATE room_history
                SET status = 'inactive', last_event_at = CASE WHEN last_event_at < ?1 THEN ?1 ELSE last_event_at END
                WHERE status = 'active' AND room_name NOT IN ({})
                ",
                placeholders
            );

            let mut params_values: Vec<Value> = Vec::with_capacity(rooms.len() + 1);
            params_values.push(Value::Integer(now));
            for room in rooms {
                params_values.push(Value::Text(room.name.clone()));
            }

            tx.execute(&query, rusqlite::params_from_iter(params_values))
                .map_err(|e| format!("failed to reconcile inactive rooms: {e}"))?;
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

    pub fn upsert_egress_infos(&self, infos: &[proto::EgressInfo]) -> Result<(), String> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| "failed to lock sqlite connection".to_string())?;
        let tx = conn
            .transaction()
            .map_err(|e| format!("failed to start sqlite tx: {e}"))?;

        let now = now_epoch_seconds();
        for info in infos {
            upsert_egress_info(&tx, info, now)?;
        }

        tx.commit()
            .map_err(|e| format!("failed to commit sqlite tx: {e}"))?;
        Ok(())
    }

    pub fn list_egress_history(&self, filter: EgressFilter) -> Result<Vec<EgressRecord>, String> {
        let mut where_clause = String::from(" WHERE 1=1");
        let mut values: Vec<Value> = vec![];

        if let Some(status) = filter.status {
            where_clause.push_str(" AND e.status = ?");
            values.push(Value::Text(status));
        }

        if let Some(room_name) = filter.room_name {
            where_clause.push_str(" AND e.room_name = ?");
            values.push(Value::Text(room_name));
        }

        if let Some(search) = filter.search {
            where_clause.push_str(
                " AND (e.egress_id LIKE ? OR e.room_name LIKE ? OR e.destination LIKE ?)",
            );
            let pattern = format!("%{}%", search);
            values.push(Value::Text(pattern.clone()));
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
                e.egress_id,
                e.room_name,
                e.egress_type,
                e.status,
                e.destination,
                e.started_at,
                e.ended_at,
                e.updated_at,
                e.error,
                e.details
            FROM egress_jobs e
            {}
            ORDER BY COALESCE(e.started_at, e.last_seen_at) DESC
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
            .map_err(|e| format!("failed to prepare egress query: {e}"))?;

        let rows = stmt
            .query_map(rusqlite::params_from_iter(values), |row| {
                Ok(EgressRecord {
                    egress_id: row.get(0)?,
                    room_name: row.get(1)?,
                    egress_type: row.get(2)?,
                    status: row.get(3)?,
                    destination: row.get(4)?,
                    started_at: row.get(5)?,
                    ended_at: row.get(6)?,
                    updated_at: row.get(7)?,
                    error: row.get(8)?,
                    details: row.get(9)?,
                })
            })
            .map_err(|e| format!("failed to query egress history: {e}"))?;

        let mut records = Vec::new();
        for row in rows {
            records.push(row.map_err(|e| format!("failed to map egress row: {e}"))?);
        }

        Ok(records)
    }

    pub fn save_room_detail(&self, room_name: &str, data_json: &str) -> Result<(), String> {
        let now = now_epoch_seconds();
        let incoming: serde_json::Value = serde_json::from_str(data_json)
            .map_err(|e| format!("failed to parse incoming room json: {e}"))?;

        let conn = self
            .conn
            .lock()
            .map_err(|_| "failed to lock sqlite connection".to_string())?;

        let merged = match conn.query_row(
            "SELECT data_json FROM room_details WHERE room_name = ?1",
            params![room_name],
            |row| row.get::<_, String>(0),
        ) {
            Ok(existing_json) => {
                if let Ok(mut existing) = serde_json::from_str::<serde_json::Value>(&existing_json)
                {
                    if let (Some(base), Some(overlay)) =
                        (existing.as_object_mut(), incoming.as_object())
                    {
                        for (k, v) in overlay {
                            let is_default = match v {
                                serde_json::Value::Number(n) => {
                                    n.as_i64() == Some(0) || n.as_f64() == Some(0.0)
                                }
                                serde_json::Value::String(s) => s.is_empty(),
                                serde_json::Value::Bool(b) => !b,
                                serde_json::Value::Null => true,
                                _ => false,
                            };
                            if !is_default {
                                base.insert(k.clone(), v.clone());
                            }
                        }
                    }
                    existing
                } else {
                    incoming
                }
            }
            Err(_) => incoming,
        };

        let merged_json = serde_json::to_string(&merged)
            .map_err(|e| format!("failed to serialize merged room json: {e}"))?;

        conn.execute(
            "
            INSERT INTO room_details (room_name, data_json, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(room_name) DO UPDATE SET
                data_json = excluded.data_json,
                updated_at = excluded.updated_at
            ",
            params![room_name, merged_json, now],
        )
        .map_err(|e| format!("failed to save room detail: {e}"))?;
        Ok(())
    }

    pub fn get_room_detail(&self, room_name: &str) -> Result<Option<String>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "failed to lock sqlite connection".to_string())?;
        conn.query_row(
            "SELECT data_json FROM room_details WHERE room_name = ?1",
            params![room_name],
            |row| row.get(0),
        )
        .map(Some)
        .or_else(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                Ok(None)
            } else {
                Err(format!("failed to get room detail: {e}"))
            }
        })
    }

    pub fn save_participant(
        &self,
        room_name: &str,
        identity: &str,
        data_json: &str,
        is_live: bool,
    ) -> Result<(), String> {
        let now = now_epoch_seconds();
        let conn = self
            .conn
            .lock()
            .map_err(|_| "failed to lock sqlite connection".to_string())?;
        conn.execute(
            "
            INSERT INTO room_participants (room_name, identity, data_json, is_live, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(room_name, identity) DO UPDATE SET
                data_json = excluded.data_json,
                is_live = excluded.is_live,
                updated_at = excluded.updated_at
            ",
            params![room_name, identity, data_json, is_live as i32, now],
        )
        .map_err(|e| format!("failed to save participant: {e}"))?;
        Ok(())
    }

    pub fn get_room_participants(&self, room_name: &str) -> Result<Vec<ParticipantRecord>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "failed to lock sqlite connection".to_string())?;
        let mut stmt = conn
            .prepare(
                "
                SELECT identity, data_json, updated_at
                FROM room_participants
                WHERE room_name = ?1
                ORDER BY updated_at DESC
                ",
            )
            .map_err(|e| format!("failed to prepare participants query: {e}"))?;

        let rows = stmt
            .query_map(params![room_name], |row| {
                Ok(ParticipantRecord {
                    identity: row.get(0)?,
                    data_json: row.get(1)?,
                    updated_at: row.get(2)?,
                })
            })
            .map_err(|e| format!("failed to query participants: {e}"))?;

        let mut records = Vec::new();
        for row in rows {
            records.push(row.map_err(|e| format!("failed to map participant row: {e}"))?);
        }
        Ok(records)
    }

    pub fn clear_table(&self, group: &str) -> Result<u64, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "failed to lock sqlite connection".to_string())?;

        let tables: Vec<&str> = match group {
            "sessions" => vec!["session_participants", "sessions"],
            "rooms" => vec!["room_participants", "room_details", "room_history"],
            "egress" => vec!["egress_jobs"],
            _ => return Err(format!("unknown table group: {group}")),
        };

        let mut total = 0u64;
        for table in tables {
            let deleted = conn
                .execute(&format!("DELETE FROM {table}"), [])
                .map_err(|e| format!("failed to clear {table}: {e}"))?;
            total += deleted as u64;
        }

        Ok(total)
    }
}

fn upsert_egress_info(
    tx: &rusqlite::Transaction<'_>,
    info: &proto::EgressInfo,
    now: i64,
) -> Result<(), String> {
    let egress_id = info.egress_id.clone();
    if egress_id.is_empty() {
        return Ok(());
    }

    let room_name = if !info.room_name.is_empty() {
        info.room_name.clone()
    } else {
        "unknown-room".to_string()
    };

    let status = format!("{:?}", info.status()).to_lowercase();
    let egress_type = format!("{:?}", info.source_type()).to_lowercase();

    let destination = info
        .file_results
        .first()
        .map(|f| {
            if !f.location.is_empty() {
                f.location.clone()
            } else {
                f.filename.clone()
            }
        })
        .filter(|d| !d.is_empty())
        .or_else(|| {
            info.stream_results.first().and_then(|s| {
                if s.url.is_empty() {
                    None
                } else {
                    Some(s.url.clone())
                }
            })
        })
        .or_else(|| {
            info.segment_results
                .first()
                .map(|s| s.playlist_location.clone())
        })
        .unwrap_or_else(|| "-".to_string());

    let started_at = to_optional_timestamp(info.started_at as i64);
    let ended_at = to_optional_timestamp(info.ended_at as i64);
    let updated_at = to_optional_timestamp(info.updated_at as i64);

    tx.execute(
        "
        INSERT INTO egress_jobs
        (egress_id, room_name, egress_type, status, destination, started_at, ended_at, updated_at, error, details, last_seen_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        ON CONFLICT(egress_id) DO UPDATE SET
            room_name = excluded.room_name,
            egress_type = excluded.egress_type,
            status = excluded.status,
            destination = excluded.destination,
            started_at = COALESCE(excluded.started_at, egress_jobs.started_at),
            ended_at = COALESCE(excluded.ended_at, egress_jobs.ended_at),
            updated_at = COALESCE(excluded.updated_at, egress_jobs.updated_at),
            error = excluded.error,
            details = excluded.details,
            last_seen_at = excluded.last_seen_at
        ",
        params![
            egress_id,
            room_name,
            egress_type,
            status,
            destination,
            started_at,
            ended_at,
            updated_at,
            info.error,
            info.details,
            now
        ],
    )
    .map_err(|e| format!("failed to upsert egress info: {e}"))?;

    Ok(())
}

fn upsert_room_history(
    tx: &rusqlite::Transaction<'_>,
    room_name: &str,
    room_sid: &str,
    label: &str,
    timestamp: i64,
) -> Result<(), String> {
    let status = if label.contains("room_started") || label.contains("participant_joined") {
        "active"
    } else if label.contains("room_finished") {
        "inactive"
    } else {
        "unknown"
    };

    let created_at = if label.contains("room_started") {
        Some(timestamp)
    } else {
        None
    };

    tx.execute(
        "
        INSERT INTO room_history
        (room_name, room_sid, created_at, last_event_at, status)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(room_name) DO UPDATE SET
            room_sid = CASE
                WHEN excluded.room_sid != '-' THEN excluded.room_sid
                ELSE room_history.room_sid
            END,
            created_at = COALESCE(room_history.created_at, excluded.created_at),
            last_event_at = CASE
                WHEN excluded.last_event_at > room_history.last_event_at THEN excluded.last_event_at
                ELSE room_history.last_event_at
            END,
            status = CASE
                WHEN excluded.status = 'unknown' THEN room_history.status
                ELSE excluded.status
            END
        ",
        params![room_name, room_sid, created_at, timestamp, status],
    )
    .map_err(|e| format!("failed to upsert room history: {e}"))?;

    Ok(())
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
        return 0;
    }
    if raw > 1_000_000_000_000 {
        if raw > 1_000_000_000_000_000 {
            raw / 1_000_000_000
        } else {
            raw / 1000
        }
    } else {
        raw
    }
}

fn to_optional_timestamp(raw: i64) -> Option<i64> {
    let ts = normalize_timestamp(raw);
    if ts > 0 { Some(ts) } else { None }
}
