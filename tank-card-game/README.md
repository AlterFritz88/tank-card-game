# Panzershrek Client

Frontend for the Panzershrek card tactics game.

## Requirements

- Node.js 20+
- The WebSocket server from `../server` for PVP and profile persistence

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Default local URLs:

- Client: `http://localhost:5173`
- PVP server: `ws://localhost:8787`
- Profile server: `ws://localhost:8787`

The current backend serves both PVP and profile messages through one WebSocket
server. Keep `VITE_PVP_SERVER_URL` and `VITE_PROFILE_SERVER_URL` equal unless
the profile service is split out later.

## Environment

```bash
VITE_PVP_SERVER_URL=ws://localhost:8787
VITE_PROFILE_SERVER_URL=ws://localhost:8787
```

For production, use secure WebSocket URLs:

```bash
VITE_PVP_SERVER_URL=wss://your-game-server.example.com
VITE_PROFILE_SERVER_URL=wss://your-game-server.example.com
```

## Build

```bash
npm run build
```

The static output is written to `dist/`.

## Preview

```bash
npm run preview
```
