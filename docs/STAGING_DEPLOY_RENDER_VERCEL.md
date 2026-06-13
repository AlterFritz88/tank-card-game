# Staging Deploy: Render + Vercel

This is the fastest private staging path for the current project shape:

- Render hosts `server/` as a Node WebSocket service.
- Vercel hosts `tank-card-game/` as a static Vite frontend.
- The same WebSocket server handles PVP and profile/account persistence.

## 1. Deploy The Server On Render

Create a new Render Web Service from the repository.

Settings:

```text
Root Directory: server
Runtime: Node
Build Command: npm install && npm run build
Start Command: npm run start
```

Environment variables:

```bash
WS_ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
PLAYER_PROFILE_DB_PATH=/var/data/player-profiles.json
PLAYER_ACCOUNT_DB_PATH=/var/data/player-accounts.json
PVP_RECONNECT_GRACE_MS=15000
PVP_MATCH_WEIGHT_TOLERANCE=12
WS_MAX_MESSAGE_BYTES=262144
WS_RATE_LIMIT_WINDOW_MS=1000
WS_RATE_LIMIT_MAX_MESSAGES=60
WS_RATE_LIMIT_BLOCK_MS=2000
```

Leave `PORT` unset unless the platform explicitly asks you to set it. The server
already reads the hosting provider's `PORT` environment variable.

Persistent disk:

```text
Mount Path: /var/data
```

After deploy, copy the Render service URL and convert it to WebSocket form:

```text
https://your-server.onrender.com
```

becomes:

```text
wss://your-server.onrender.com
```

## 2. Deploy The Client On Vercel

Create a new Vercel project from the same repository.

Settings:

```text
Root Directory: tank-card-game
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

Environment variables:

```bash
VITE_PVP_SERVER_URL=wss://your-server.onrender.com
VITE_PROFILE_SERVER_URL=wss://your-server.onrender.com
```

Deploy the client, then copy the final Vercel URL.

## 3. Connect Origin Back To The Server

Return to Render and update:

```bash
WS_ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
```

If you use a custom domain later, add it too:

```bash
WS_ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,https://panzershrek.example.com
```

Redeploy/restart the Render service after changing the env.

## 4. Private Smoke Test

Use the deployed Vercel URL:

1. Enter as a guest and check that profile data loads.
2. Create a custom deck, refresh, and confirm it is still there.
3. Start PVE and return to menu from the result screen.
4. Open two browser windows and start PVP.
5. Check matchmaking, turn timer, surrender, and disconnect.
6. Restart the Render service and confirm progress still exists.

## 5. Netlify Variant

For Netlify, keep the same client env values.

Settings:

```text
Base directory: tank-card-game
Build command: npm run build
Publish directory: tank-card-game/dist
```

Then set `WS_ALLOWED_ORIGINS` on Render to the Netlify site origin.
