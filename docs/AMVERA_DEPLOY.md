# Staging Deploy: Amvera

Use this path if you want a Russian hosting provider for the staging build.

The current setup uses one Amvera app for both parts of the game:

- the frontend is built from `tank-card-game/`;
- the Node server is built from `server/`;
- the Node server serves `tank-card-game/dist`;
- PVP/profile WebSocket connections use the same domain.

## 1. Deploy The App

Create an Amvera project from the repository and use the included root
`amvera.yaml`.

It deploys:

```text
Environment: Node.js server
Node image: node:22
Build: cd tank-card-game && npm install && npm run build && cd ../server && npm install && npm run build
Run: cd server && npm run start
Container port: 8787
Persistent storage mount: /data
```

Set these environment variables in the Amvera project:

```bash
PLAYER_PROFILE_DB_PATH=/data/player-profiles.json
PLAYER_ACCOUNT_DB_PATH=/data/player-accounts.json
PVP_RECONNECT_GRACE_MS=15000
PVP_MATCH_BASE_TOLERANCE_PCT=15
PVP_MATCH_TOLERANCE_STEP_PCT=10
PVP_MATCH_TOLERANCE_STEP_MS=5000
PVP_MATCH_TOLERANCE_MAX_MS=30000
PVP_MATCH_SWEEP_INTERVAL_MS=1000
WS_MAX_MESSAGE_BYTES=262144
WS_RATE_LIMIT_WINDOW_MS=1000
WS_RATE_LIMIT_MAX_MESSAGES=60
WS_RATE_LIMIT_BLOCK_MS=2000
```

Set `WS_ALLOWED_ORIGINS` to your Amvera app origin:

```bash
WS_ALLOWED_ORIGINS=https://panzershrek-server-burdin009.amvera.io
```

With the current same-domain build, you do not need to set client variables.
If `VITE_PVP_SERVER_URL` and `VITE_PROFILE_SERVER_URL` are omitted, the client
automatically connects back to the same host:

```text
wss://panzershrek-server-burdin009.amvera.io
```

## 2. Open The Game

```text
https://panzershrek-server-burdin009.amvera.io
```

## 3. Smoke Test

1. Open the deployed client.
2. Enter as a guest.
3. Create a custom deck, refresh, and confirm it persists.
4. Start PVE and return to menu.
5. Open two browser windows and test PVP matchmaking.
6. Restart the Amvera server app and confirm progress is still present.

## 4. Notes

- Keep profile/account JSON files under `/data`; Amvera mounts persistent
  storage there.
- If `PLAYER_PROFILE_DB_PATH` / `PLAYER_ACCOUNT_DB_PATH` are not set, the server
  now auto-detects the `/data` mount and writes there. The startup log prints
  the resolved paths (`Player profiles database path: ...`). Setting the env
  vars explicitly is still recommended.
- `containerPort` is `8787`, matching the server default.
- Do not set `HOST` unless Amvera support specifically tells you to.
- `docs/amvera.client.yaml.example` is only for a separate static-client app.
  The default `amvera.yaml` now deploys the complete game in one app.
