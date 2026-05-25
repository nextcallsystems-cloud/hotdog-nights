# Co-op client integration plan (next build)

Goal: 2–3 player online co-op, **Demon + MG only**, **spectate on death**, using the
host-relay server in this folder. Solo play must stay byte-for-byte unchanged.

## Netcode model
- **Host** runs the existing simulation, now over a `players[]` array instead of one
  `player`. Each frame the host applies every player's latest input, steps the world,
  and ~20–30Hz sends a `state` snapshot.
- **Joiners** are thin: send their input ~30Hz (`{mvx,mvy,aim,fire}`), render the last
  snapshot. Light **client-side prediction** of *own* movement keeps it responsive;
  reconcile to host position when snapshots arrive.
- Shared: enemies, score, night/wave, the BIG GLIZZLER. Per-player: position, HP, aim.
  A player at 0 HP becomes a **spectator** (camera follows a living teammate). Game over
  only when all players are down.

## Client work breakdown
1. **`players[]` refactor (biggest piece).** Replace the singleton `player` with
   `players[]`; `me = players[myIndex]`. Touch every spot that reads `player.`:
   movement, shooting, gun pickup, contact/glob/packet/gremlin/glizzy/glizzler/grease
   damage, camera (follow `me`), HUD (own HP + small teammate pips), lighting (a light
   per living player). Keep a `MP` flag so solo uses the exact current single-player path.
2. **Net layer.** `net.js`-style module inside the file: connect, host/join, lobby
   events, `sendInput()`, `sendState()`, snapshot apply with interpolation buffer.
3. **Serialization.** Compact snapshot: players (id,x,y,hp,aim,weapon,down), boss/glizzies/
   glizzler (x,y,hp,flip,tpWarn,tpTarget), gremlins/packets/globs/grease/crates (pos),
   bullets (pos,color), night/score/state/banner. Send deltas later if bandwidth matters;
   full snapshots are fine for 3 players at 20–30Hz.
4. **Lobby UI states:** `mp_menu` (HOST / JOIN / back), `mp_code` (enter 4 chars),
   `mp_lobby` (shows CODE + player list; host taps START). Reachable from the title via a
   **CO-OP** button; forces Demon + MG and skips difficulty/char screens.
5. **Input on joiners:** reuse keyboard/touch reads but route to `sendInput` instead of
   moving locally (except predicted own-movement).
6. **Disconnect handling:** `host_left` → return joiners to title with a notice;
   `player_leave` → that player vanishes; reconnect/`bye` on unload.
7. **Config:** `const COOP_WS = "wss://<host-to-be-decided>";` one constant. Hide/disable
   the CO-OP button until it's set (so the live solo game shows nothing half-built).

## Test plan (headless, like the existing harnesses)
- Boot the relay (`server.js`) on a local port.
- Spin up a **host sim instance** + **2 joiner instances** in Node with the canvas stub;
  drive bots; assert: all three see the same boss HP / night, joiner inputs move their
  own avatar on the host, a downed joiner spectates, the run can be won together.
- Then a real 2-browser smoke test once it's deployed behind `wss://`.

## Rough size
The `players[]` refactor + net layer + lobby is a focused multi-hundred-line change —
its own session. Server (this folder) is done; flipping co-op live needs the hosting
decision (set `COOP_WS`).
