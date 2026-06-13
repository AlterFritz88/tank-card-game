# Player Identity

The client now uses a namespaced player id for every profile and PVP request.

## Current Id Format

- `guest:<local-id>` - anonymous local player profile.
- `user:<server-id>` - reserved for future registered accounts.

`getCurrentUserId()` is the main client API. It returns the active profile id and
is the value that should be sent to the PVP server and profile server.

`getGuestUserId()` returns the local guest id. It is used when the client needs a
guest fallback before login exists.

`setCurrentUserId(userId)` is the login handoff point. After successful
authentication, the client stores the server user id, for example
`user:commander_1`, and all profile/PVP requests use that id.

## Legacy Migration

Older builds stored an unprefixed UUID in `tank-card-game:player-id`. On first
load, the client migrates it to `guest:<old-id>` and stores a temporary
migration marker.

During the next profile sync, the local cached progress is saved under the new
guest id and the migration marker is cleared. This keeps existing local progress
from disappearing when the profile namespace changes.

## Server Storage

The profile server accepts `:` in player ids so `guest:<id>` and `user:<id>` are
stored as distinct keys in `server/data/player-profiles.json`.

## Account Flow

The profile WebSocket protocol supports:

- `REGISTER_ACCOUNT`
- `LOGIN_ACCOUNT`

Registration stores a salted password hash in `server/data/player-accounts.json`
and returns the new `user:<id>` profile. The client currently merges the active
guest progress into the new account during registration.

Login returns the existing `user:<id>` profile and switches the client to that
identity. Guest progress is not merged on login by default, which avoids
accidentally mixing profiles when a user logs in on someone else's device.
