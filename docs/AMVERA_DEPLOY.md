# Staging Deploy: Amvera

Use this path if you want a Russian hosting provider for the staging build.

Amvera uses one `amvera.yaml` file in the repository root. The repository now
contains a server-oriented `amvera.yaml`, so the first Amvera app should be the
WebSocket backend.

## 1. Deploy The Server

Create an Amvera project from the repository and use the included root
`amvera.yaml`.

It deploys:

```text
Environment: Node.js server
Node image: node:22
Build: cd server && npm install && npm run build
Run: cd server && npm run start
Container port: 8787
Persistent storage mount: /data
```

Set these environment variables in the Amvera project:

```bash
PLAYER_PROFILE_DB_PATH=/data/player-profiles.json
PLAYER_ACCOUNT_DB_PATH=/data/player-accounts.json
PVP_RECONNECT_GRACE_MS=15000
PVP_MATCH_WEIGHT_TOLERANCE=12
WS_MAX_MESSAGE_BYTES=262144
WS_RATE_LIMIT_WINDOW_MS=1000
WS_RATE_LIMIT_MAX_MESSAGES=60
WS_RATE_LIMIT_BLOCK_MS=2000
```

At first, set `WS_ALLOWED_ORIGINS` to a temporary value:

```bash
WS_ALLOWED_ORIGINS=https://example.com
```

After the client is deployed, replace it with the real client origin.

When Amvera gives you the server HTTPS URL:

```text
https://your-server.amvera.io
```

use it in the client as:

```text
wss://your-server.amvera.io
```

## 2. Deploy The Client

The easiest first test is:

- server on Amvera;
- client on Vercel/Netlify using `wss://your-server.amvera.io`.

If you want the client on Amvera too, create a second Amvera project and use the
template:

```text
docs/amvera.client.yaml.example
```

For that second project, the root `amvera.yaml` must contain the client template
instead of the server template.

Set client build-time environment variables before building:

```bash
VITE_PVP_SERVER_URL=wss://your-server.amvera.io
VITE_PROFILE_SERVER_URL=wss://your-server.amvera.io
```

Then set the server variable to the real client origin:

```bash
WS_ALLOWED_ORIGINS=https://your-client-domain
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
- `containerPort` is `8787`, matching the server default.
- Do not set `HOST` unless Amvera support specifically tells you to.
