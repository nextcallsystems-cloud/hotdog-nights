// Hotdog Nights — co-op relay server (host-authoritative model).
// The server is intentionally dumb: it manages rooms keyed by a short CODE and
// relays messages between players in a room. One player is the HOST and runs the
// actual game simulation in their browser; joiners send inputs and render snapshots.
//
// Run:  PORT=8765 node server.js     (needs:  npm install)
// Behind TLS (so an HTTPS GitHub Pages game can use wss://), put a reverse proxy
// in front — see README.md.

const { WebSocketServer } = require("ws");
const PORT = parseInt(process.env.PORT || "8765", 10);
const MAX_PLAYERS = 3;
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no easily-confused 0/O/1/I/L
const ROOM_TTL_MS = 1000 * 60 * 60;                   // drop idle rooms after 1h

const wss = new WebSocketServer({ port: PORT });
const rooms = new Map();   // code -> { code, hostId, players: Map<id, ws>, names: Map<id,string>, started, createdAt }
let nextId = 1;

function makeCode() {
  let code;
  do { code = Array.from({ length: 4 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join(""); }
  while (rooms.has(code));
  return code;
}
function send(ws, obj) { if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); }
function roomPlayers(room) {
  return [...room.players.keys()].map(id => ({ id, name: room.names.get(id) || "PLAYER", host: id === room.hostId }));
}
function broadcast(room, obj, exceptId) {
  for (const [id, ws] of room.players) if (id !== exceptId) send(ws, obj);
}
function leaveRoom(ws) {
  const room = ws.room; if (!room) return;
  room.players.delete(ws.id); room.names.delete(ws.id); ws.room = null;
  if (ws.id === room.hostId || room.players.size === 0) {
    broadcast(room, { t: "host_left" });           // host gone -> end the room
    rooms.delete(room.code);
  } else {
    broadcast(room, { t: "player_leave", id: ws.id });
  }
}

wss.on("connection", (ws) => {
  ws.id = nextId++; ws.isAlive = true; ws.room = null;
  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (buf) => {
    let m; try { m = JSON.parse(buf); } catch { return; }
    switch (m.t) {
      case "host": {
        if (ws.room) leaveRoom(ws);
        const code = makeCode();
        const room = { code, hostId: ws.id, players: new Map(), names: new Map(), started: false, createdAt: Date.now() };
        room.players.set(ws.id, ws); room.names.set(ws.id, (m.name || "HOST").slice(0, 14));
        rooms.set(code, room); ws.room = room;
        send(ws, { t: "hosted", code, you: ws.id, players: roomPlayers(room) });
        break;
      }
      case "join": {
        const room = rooms.get((m.code || "").toUpperCase());
        if (!room) return send(ws, { t: "error", msg: "No room with that code." });
        if (room.started) return send(ws, { t: "error", msg: "That game already started." });
        if (room.players.size >= MAX_PLAYERS) return send(ws, { t: "error", msg: "Room is full (3 max)." });
        if (ws.room) leaveRoom(ws);
        room.players.set(ws.id, ws); room.names.set(ws.id, (m.name || "PLAYER").slice(0, 14)); ws.room = room;
        send(ws, { t: "joined", code: room.code, you: ws.id, hostId: room.hostId, players: roomPlayers(room) });
        broadcast(room, { t: "player_join", id: ws.id, name: room.names.get(ws.id), players: roomPlayers(room) }, ws.id);
        break;
      }
      case "start": {                         // host starts the run
        const room = ws.room; if (!room || room.hostId !== ws.id) return;
        room.started = true; broadcast(room, { t: "start", seed: m.seed >>> 0 });
        break;
      }
      case "state": {                         // host -> all joiners (world snapshot)
        const room = ws.room; if (!room || room.hostId !== ws.id) return;
        broadcast(room, m, ws.id);
        break;
      }
      case "input": {                         // joiner -> host (controls)
        const room = ws.room; if (!room) return;
        const host = room.players.get(room.hostId); if (host) { m.from = ws.id; send(host, m); }
        break;
      }
      case "bye": leaveRoom(ws); break;
    }
  });

  ws.on("close", () => leaveRoom(ws));
  ws.on("error", () => {});
});

// Heartbeat: drop dead sockets so rooms don't get stuck on a host that vanished.
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) { try { ws.terminate(); } catch {} return; }
    ws.isAlive = false; try { ws.ping(); } catch {}
  });
}, 15000);
// Sweep idle rooms.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (now - room.createdAt > ROOM_TTL_MS && !room.started) rooms.delete(code);
}, 60000);

console.log(`Hotdog Nights co-op relay listening on :${PORT} (max ${MAX_PLAYERS}/room)`);
