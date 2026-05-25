# Hotdog Nights — Co-op Relay Server

A tiny WebSocket relay for **2–3 player co-op** (host-authoritative model). One player
is the **host** and runs the game simulation in their browser; the server only manages
**rooms keyed by a 4-letter CODE** and relays messages. Co-op is locked to **Demon
difficulty + MG** by the game client.

Status: server is built and self-tested (`node _selftest.js` → all green). The client
co-op layer (lobby + netcode) is the next build — see `CLIENT-PLAN.md`.

## Run locally
```
cd server
npm install
PORT=8765 node server.js
```
Then point the game at it (in the client config): `ws://localhost:8765`.

## Deploy to the SK VPS (when hosting is decided)
The game page is served over **HTTPS** (GitHub Pages), so browsers require a secure
`wss://` socket — that means a domain + TLS in front of this server.

1. Copy `server/` to the VPS and install:
   ```
   cd /opt/hotdog-coop && npm install --omit=dev
   ```
2. systemd unit `/etc/systemd/system/hotdog-coop.service`:
   ```
   [Unit]
   Description=Hotdog Nights co-op relay
   After=network.target
   [Service]
   Environment=PORT=8765
   WorkingDirectory=/opt/hotdog-coop
   ExecStart=/usr/bin/node server.js
   Restart=always
   [Install]
   WantedBy=multi-user.target
   ```
   `sudo systemctl enable --now hotdog-coop`
3. TLS via Caddy (easiest — auto Let's Encrypt). Point a subdomain
   (e.g. `hotdog.stillbooked.com`) A-record at the VPS, then in the Caddyfile:
   ```
   hotdog.stillbooked.com {
       reverse_proxy 127.0.0.1:8765
   }
   ```
   Caddy upgrades WebSocket automatically. The client then uses
   `wss://hotdog.stillbooked.com`.
   (Cloudflare Tunnel works too and needs no open port / public IP.)
4. Open the firewall only for 80/443 (Caddy); keep 8765 bound to localhost.

## Protocol (JSON over WS)
- `{t:"host", name}` → `{t:"hosted", code, you, players}`
- `{t:"join", code, name}` → `{t:"joined", code, you, hostId, players}`; others get `{t:"player_join", ...}`
- `{t:"start", seed}` (host) → broadcast `{t:"start", seed}`
- `{t:"state", ...}` (host) → relayed to joiners
- `{t:"input", ...}` (joiner) → relayed to host (server stamps `from`)
- leave/disconnect → `{t:"player_leave", id}`; if the host drops → `{t:"host_left"}` and the room closes
- errors (bad/full/started room) → `{t:"error", msg}`

Limits: 4-char codes (no confusable chars), 3 players/room, 15s heartbeat, idle rooms swept after 1h.
