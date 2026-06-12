# Panzershrek

Panzershrek is a browser card tactics game with PVE, PVP, campaign missions,
research trees, custom decks, headquarters progression, and WebSocket-backed
profile persistence.

## Project Layout

- `tank-card-game/` - React/Vite client
- `server/` - WebSocket backend for PVP matchmaking, PVP battles, and player profiles
- `docs/` - release and design documentation

## Local Development

Run the backend:

```bash
cd server
npm install
npm run start
```

Run the client in another terminal:

```bash
cd tank-card-game
npm install
cp .env.example .env
npm run dev
```

Default URLs:

- Client: `http://localhost:5173`
- WebSocket backend: `ws://localhost:8787`

## Production Build

```bash
cd tank-card-game
npm run build
```

```bash
cd server
npm run build
```

## Release Docs

- [Deployment](docs/DEPLOYMENT.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [Project context summary](docs/project-context-summary.md)
- [Headquarters features](docs/headquarters-features.md)
