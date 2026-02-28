# Local LiveKit Test Stack

This compose stack runs a local LiveKit server + Redis so you can place test calls and validate dashboard sessions/history.

## Start LiveKit

From `examples/`:

```bash
docker compose up -d
```

LiveKit will be available at:

- WS URL: `ws://localhost:7880`
- API key: `devkey`
- API secret: `secret`

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
