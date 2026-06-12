# Release Checklist

Use this checklist before every release candidate.

## Build

- [ ] `cd tank-card-game && npm run build` passes.
- [ ] `cd server && npm run build` passes.
- [ ] Production env uses `wss://` URLs for `VITE_PVP_SERVER_URL`.
- [ ] Production env uses `wss://` URLs for `VITE_PROFILE_SERVER_URL`.
- [ ] Server has persistent `PLAYER_PROFILE_DB_PATH` storage.
- [ ] Server WebSocket limits are configured or intentionally left at defaults.

## Fresh Player

- [ ] Open the game with empty browser storage.
- [ ] Main menu renders without errors.
- [ ] Default favorite headquarters/avatar appears.
- [ ] PVE headquarters/deck selection opens.
- [ ] PVP headquarters/deck selection opens.
- [ ] Research menu opens and shows starter branches.
- [ ] Deck builder opens.

## Profile Server

- [ ] Profile data loads from the WebSocket server.
- [ ] Profile unavailable banner appears when the server is stopped.
- [ ] Research/purchase/save deck actions are blocked while profile server is unavailable.
- [ ] Retry reconnects after the server is started again.
- [ ] Custom deck persists after browser refresh.
- [ ] Corrupted custom deck data is ignored instead of breaking deck selection.
- [ ] Custom decks with deleted/renamed cards are ignored or rebuilt.
- [ ] Custom decks with too many copies of one card are ignored.
- [ ] Battle reward is not duplicated after refresh/retry.

## PVE

- [ ] Start a battle with a stock deck.
- [ ] Start a battle with a custom deck.
- [ ] Bot receives a legal deck with the correct card count.
- [ ] Exit-to-menu works during battle.
- [ ] Victory result screen returns to menu.
- [ ] Defeat result screen returns to menu.
- [ ] Rewards are claimed and shown on the result screen.

## PVP

- [ ] With server online, two clients can match and start a battle.
- [ ] TURN_TIMER is server-driven and visible to both clients.
- [ ] Opponent hand/deck remain hidden in DevTools.
- [ ] Surrender ends the match correctly.
- [ ] Disconnect ends the match correctly for the remaining player.
- [ ] Cancel search returns to menu.
- [ ] If no opponent is found within the timer, fallback AI preview appears.
- [ ] If the PVP server is unavailable, no fallback AI starts.
- [ ] PVP error screen offers retry and menu exit.

## Campaign

- [ ] Campaign menu opens.
- [ ] Mission menu opens.
- [ ] Locked missions cannot be started.
- [ ] First unlocked mission starts.
- [ ] Campaign battle UI matches normal battle UI.
- [ ] Mission completion unlocks the next mission.

## Deck Builder

- [ ] Headquarters selection works.
- [ ] Card add/remove by click works.
- [ ] Drag and drop into deck works.
- [ ] Drag and drop out of deck works.
- [ ] Filters work by nation and unit type.
- [ ] Deck limit and copy limit are enforced.
- [ ] Non-training headquarters can only use cards from their own nation.
- [ ] Saved deck appears in both PVE and PVP menus.
- [ ] Deck preview/edit/delete work for custom decks.

## Research

- [ ] Available research nodes show correct prices.
- [ ] Missing XP/tracks are shown in red.
- [ ] Research animation appears and closes on outside click.
- [ ] Purchase animation appears and closes on outside click.
- [ ] Purchased copies are shown as stacked cards.
- [ ] Headquarters XP is shown on unlocked headquarters nodes.

## Assets And Audio

- [ ] Missing card image falls back safely.
- [ ] Missing headquarters image falls back safely.
- [ ] Missing avatar does not break battle UI.
- [ ] Missing flag does not leave a black block.
- [ ] Menu music plays.
- [ ] Battle music starts in battle.
- [ ] Cannon, card distribution, turn start, radar, and burning sounds play.

## Browser Smoke

- [ ] Chrome or Edge desktop.
- [ ] Windowed desktop resolution.
- [ ] Fullscreen desktop resolution.
- [ ] Touch/drag scrolling still works in menus.
- [ ] No white screen after navigation between menus.

## Server Guards

- [ ] Oversized WebSocket messages receive an error and do not crash the server.
- [ ] Unknown WebSocket message types receive an error and do not crash the server.
- [ ] Rapid repeated WebSocket messages are rate limited.
- [ ] Normal PVP actions are not affected by the rate limit.
