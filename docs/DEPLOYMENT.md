# Deployment

This project has two deployable parts:

- `tank-card-game/` - static Vite frontend
- `server/` - Node WebSocket backend for PVP and profile data

## Client

Build command:

```bash
cd tank-card-game
npm install
npm run build
```

Output directory:

```text
tank-card-game/dist
```

Required production environment:

```bash
VITE_PVP_SERVER_URL=wss://your-websocket-server.example.com
VITE_PROFILE_SERVER_URL=wss://your-websocket-server.example.com
```

Notes:

- Use `wss://` when the client is served over `https://`.
- The current backend handles both PVP and profile messages, so both variables
  usually point to the same server.
- If these variables are omitted, the client falls back to `ws://localhost:8787`,
  which is useful locally but wrong for production.

## Server

Start command:

```bash
cd server
npm install
npm run start
```

Build/typecheck command:

```bash
cd server
npm run build
```

Environment:

```bash
PORT=8787
WS_ALLOWED_ORIGINS=https://your-frontend.example.com
PLAYER_PROFILE_DB_PATH=./data/player-profiles.json
PLAYER_ACCOUNT_DB_PATH=./data/player-accounts.json
PVP_RECONNECT_GRACE_MS=15000
PVP_MATCH_WEIGHT_TOLERANCE=12
WS_MAX_MESSAGE_BYTES=262144
WS_RATE_LIMIT_WINDOW_MS=1000
WS_RATE_LIMIT_MAX_MESSAGES=60
WS_RATE_LIMIT_BLOCK_MS=2000
```

Optional local-only environment:

```bash
HOST=0.0.0.0
```

On most managed hosts, leave `HOST` unset and let the platform bind the process.

`WS_ALLOWED_ORIGINS` is a comma-separated list of browser origins allowed to
open the WebSocket connection. Use the deployed frontend origin, for example
`https://panzershrek.example.com`. You can add local origins while testing:

```bash
WS_ALLOWED_ORIGINS=https://panzershrek.example.com,http://localhost:5173
```

If `WS_ALLOWED_ORIGINS` is omitted, the server accepts every origin. That is
convenient for local development, but should not be used for a public build.

## Persistent Profile Data

The profile server stores player progress in a JSON file:

```text
server/data/player-profiles.json
```

The auth server stores account records and password hashes in a separate JSON
file:

```text
server/data/player-accounts.json
```

For production, make sure `PLAYER_PROFILE_DB_PATH` and `PLAYER_ACCOUNT_DB_PATH`
point to persistent storage. If the host uses ephemeral disks, player progress,
custom decks, and accounts will be lost after redeploys or restarts.

## Deployment Order

1. Deploy the WebSocket server.
2. Confirm the server is reachable with a `wss://` URL.
3. Add the frontend host to `WS_ALLOWED_ORIGINS` on the server.
4. Set `VITE_PVP_SERVER_URL` and `VITE_PROFILE_SERVER_URL` on the frontend host.
5. Build and deploy the frontend.
6. Run the release checklist.

## Known Production Warnings

The Vite build can warn about a large JavaScript chunk. This is not currently a
release blocker, but code-splitting menus/assets should be considered before a
public launch with slow networks.
