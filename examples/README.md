# Local LiveKit Test Stack

This compose stack runs local LiveKit + Redis + Egress + MinIO so you can place test calls and validate dashboard sessions/history and egress jobs.

## Start Stack

From `examples/`:

```bash
docker compose up -d
```

Services will be available at:

- WS URL: `ws://localhost:7880`
- API key: `devkey`
- API secret: `secret`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001` (`minioadmin` / `minioadmin`)

## Run Dashboard Against Local LiveKit

From project root:

```bash
LIVEKIT_URL=http://localhost:7880 \
LIVEKIT_API_KEY=devkey \
LIVEKIT_API_SECRET=secret \
PORT=3001 \
SQLITE_PATH=./data/dashboard.db \
cargo run
```

## Webhook Setup (for Sessions history)

Set LiveKit webhook target to your dashboard endpoint:

- `http://host.docker.internal:3001/api/webhook` (Docker Desktop)
- or `http://<your-host-ip>:3001/api/webhook`

Then generate room activity and open:

- `http://localhost:3001/sessions`

## Egress Test Flow

1. Join a room with at least one participant (for example `test-room`).
2. Start an egress job (replace output path if needed):

```bash
cat > /tmp/room-composite-egress.json <<'EOF'
{
  "room_name": "test-room",
  "layout": "speaker",
  "file_outputs": [
    { "filepath": "/out/test-room.mp4" }
  ]
}
EOF

lk --dev egress start --type room-composite /tmp/room-composite-egress.json
```

3. Open `http://localhost:3001/egress` and watch status updates.
4. List jobs from CLI if needed:

```bash
lk --dev egress list
```
