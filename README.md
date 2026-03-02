# LiveKit Monitor

A self-hosted dashboard for monitoring LiveKit instances.

![Overview page](assets/overview.png)

## What you get

- Overview metrics (rooms, participants, active egress/ingress)
- Rooms list + room detail (participants and tracks)
- Sessions history (webhook-backed)
- Egress and ingress pages
- Settings page with connection info

## Docker image (Docker Hub)

The public image is available on Docker Hub:

- `jossephus/livekit-monitor:latest`

Pull it directly:

```bash
docker pull jossephus/livekit-monitor:latest
```

Run it locally:

```bash
docker run --rm -p 3001:3001 \
  -e LIVEKIT_URL=http://host.docker.internal:7880 \
  -e LIVEKIT_API_KEY=devkey \
  -e LIVEKIT_API_SECRET=secret \
  -e PORT=3001 \
  -e SQLITE_PATH=/data/monitor.db \
  -v livekit-monitor-data:/data \
  jossephus/livekit-monitor:latest
```

## Environment variables

- `LIVEKIT_URL` (required)
- `LIVEKIT_API_KEY` (required)
- `LIVEKIT_API_SECRET` (required)
- `PORT` (optional, default: `3000`)
- `SQLITE_PATH` (optional, default: `./data/monitor.db`)

## Webhook configuration

Sessions are powered by LiveKit webhook events. Make sure your LiveKit server registers the monitor webhook endpoint (for example, `http://host.docker.internal:3001/api/webhook`) like the `webhook.urls` entries in `examples/livekit.yaml`.

## Local development

1. Install frontend dependencies:

```bash
cd frontend
npm install
```

2. Build frontend:

```bash
npm run build
```

3. Start backend from repo root:

```bash
LIVEKIT_URL=http://localhost:7880 \
LIVEKIT_API_KEY=devkey \
LIVEKIT_API_SECRET=secret \
cargo run
```
