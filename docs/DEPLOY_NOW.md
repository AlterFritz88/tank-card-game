# First Test Deploy

Use this when you want to put the current build online for a private test.

For a concrete Render + Vercel route, use
`docs/STAGING_DEPLOY_RENDER_VERCEL.md`.

For Amvera, use `docs/AMVERA_DEPLOY.md`.

## 1. Server

Deploy `server/` as a Node service.

Install command:

```bash
npm install
```

Build command:

```bash
npm run build
```

Start command:

```bash
npm run start
```

Environment:

```bash
PORT=8787
WS_ALLOWED_ORIGINS=https://your-frontend.example.com
PLAYER_PROFILE_DB_PATH=/persistent/player-profiles.json
PLAYER_ACCOUNT_DB_PATH=/persistent/player-accounts.json
PVP_RECONNECT_GRACE_MS=15000
PVP_MATCH_BASE_TOLERANCE_PCT=15
PVP_MATCH_TOLERANCE_STEP_PCT=10
PVP_MATCH_TOLERANCE_STEP_MS=8333
PVP_MATCH_TOLERANCE_MAX_MS=50000
PVP_MATCH_SWEEP_INTERVAL_MS=1000
WS_MAX_MESSAGE_BYTES=262144
WS_RATE_LIMIT_WINDOW_MS=1000
WS_RATE_LIMIT_MAX_MESSAGES=60
WS_RATE_LIMIT_BLOCK_MS=2000
```

Notes:

- Leave `HOST` unset on most managed hosts.
- `PLAYER_PROFILE_DB_PATH` and `PLAYER_ACCOUNT_DB_PATH` must point to persistent
  storage, not a temporary deploy directory.
- Copy the server public URL as `wss://...` for the client env.

## 2. Client

Deploy `tank-card-game/` as a static Vite site.

Install command:

```bash
npm install
```

Build command:

```bash
npm run build
```

Output directory:

```text
dist
```

Environment:

```bash
VITE_PVP_SERVER_URL=wss://your-server.example.com
VITE_PROFILE_SERVER_URL=wss://your-server.example.com
```

## 3. Smoke Test

After both deploys are online:

1. Open the frontend in a clean browser profile.
2. Enter as guest and verify the account widget loads.
3. Start PVE, finish or exit, and confirm the result screen returns to menu.
4. Open two browser windows and start PVP matchmaking.
5. Confirm PVP starts, server timer moves, surrender works, and rewards sync.
6. Refresh the page and confirm progress/custom decks are still present.

## 4. If The Client Cannot Connect

Check these first:

1. Frontend env uses `wss://`, not `ws://`.
2. Server `WS_ALLOWED_ORIGINS` exactly contains the frontend origin.
3. The server host supports WebSocket upgrades.
4. Persistent data paths are writable by the server process.
