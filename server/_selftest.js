// Boots the relay in-process and drives a host + 2 joiners through the full flow.
const { spawn } = require("child_process");
const path = require("path");
const PORT = 8799;
const srv = spawn(process.execPath, [path.join(__dirname, "server.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
const log = [];
const got = { host:[], j1:[], j2:[], j4:[] };
function mk(tag){ const ws = new WebSocket("ws://127.0.0.1:"+PORT); ws.tag=tag;
  ws.addEventListener("message", e=>{ const m=JSON.parse(e.data); got[tag].push(m.t); log.push(tag+" <- "+m.t+(m.code?(" "+m.code):"")); ws._last=m; }); return ws; }
const send=(ws,o)=>ws.send(JSON.stringify(o));
function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
function open(ws){ return new Promise(r=>ws.addEventListener("open",()=>r(),{once:true})); }

(async () => {
  await wait(400);
  const host=mk("host"); await open(host);
  send(host,{t:"host",name:"MAURICE"}); await wait(120);
  const code = host._last && host._last.code;
  const j1=mk("j1"); await open(j1); send(j1,{t:"join",code,name:"DON"}); await wait(120);
  const j2=mk("j2"); await open(j2); send(j2,{t:"join",code,name:"BRENDON"}); await wait(120);
  // host starts
  send(host,{t:"start",seed:12345}); await wait(120);
  // joiner sends input -> host should receive it
  send(j1,{t:"input",mvx:1,mvy:0,aim:1.2,fire:true}); await wait(120);
  // host broadcasts a state -> joiners should receive it
  send(host,{t:"state",players:[{id:1,x:10,y:20}],boss:{x:5,y:5,hp:50}}); await wait(150);
  // a 4th joiner should be rejected (room full)
  const j4=mk("j4"); await open(j4); send(j4,{t:"join",code,name:"X"}); await wait(150);
  // host leaves -> joiners get host_left
  host.close(); await wait(200);

  const checks = {
    hostGotCode: typeof code==="string" && code.length===4,
    bothJoined: got.j1.includes("joined") && got.j2.includes("joined"),
    hostSawJoins: got.host.filter(t=>t==="player_join").length===2,
    startBroadcast: got.j1.includes("start") && got.j2.includes("start"),
    inputRelayedToHost: got.host.includes("input"),
    stateRelayedToJoiners: got.j1.includes("state") && got.j2.includes("state"),
    fourthRejected: got.j4.includes("error"),
    hostLeftNotified: got.j1.includes("host_left"),
  };
  console.log("CODE:", code);
  console.log("CHECKS:", JSON.stringify(checks));
  const pass = Object.values(checks).every(Boolean);
  console.log(pass ? "RELAY SELFTEST PASS" : "RELAY SELFTEST FAIL");
  try{ srv.kill(); }catch{}
  process.exit(pass?0:1);
})();
