// Pedro Kart server.
// - Serves the landing page, the game ("host", a big screen) and the phone controller.
// - Rooms: each host gets a 4-letter code; phones join a room by scanning its QR / typing the code.
// - Relays messages between a room's host and its phones over WebSockets. The relay is also the
//   signaling channel for WebRTC: once phone and host connect directly, input skips the server.
// - Saves race recordings streamed by hosts.
//
// Two modes:
//   local  (default): HTTP on :8080 for the big screen, HTTPS on :8443 with a self-signed cert for
//                     phones on the same Wi-Fi (iOS only exposes motion sensors to secure pages).
//   hosted (PUBLIC_URL=https://your.domain): one HTTP listener on $PORT behind the platform's TLS.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const VENDOR = path.join(ROOT, 'node_modules', 'three', 'build');
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const HOSTED = !!PUBLIC_URL;
const HTTP_PORT = Number(process.env.PORT) || 8080;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 8443;
// Recording is on by default locally (your own games) and opt-in when hosted (strangers' data).
const RECORD = process.env.RECORD ? process.env.RECORD !== '0' : !HOSTED;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data', 'races');

const MAX_ROOMS = 2000;
const MAX_PHONES_PER_ROOM = 8;
const ROOM_GRACE_MS = 2 * 60 * 1000; // keep a room this long after its host disconnects (page reloads)
const MAX_CONTROLLER_MSG = 4096;

function lanIP() {
  const ifs = os.networkInterfaces();
  for (const name of ['en0', 'en1', ...Object.keys(ifs)]) {
    for (const a of ifs[name] || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return '127.0.0.1';
}
const IP = process.env.HOST_IP || lanIP();
const joinUrl = (code) => (HOSTED ? `${PUBLIC_URL}/j/${code}` : `https://${IP}:${HTTPS_PORT}/j/${code}`);

function ensureCert() {
  const dir = path.join(ROOT, 'certs');
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  const ipFile = path.join(dir, 'ip.txt');
  const current = fs.existsSync(ipFile) ? fs.readFileSync(ipFile, 'utf8') : '';
  if (!fs.existsSync(cert) || current !== IP) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '825',
      '-keyout', key, '-out', cert, '-subj', '/CN=Pedro Kart',
      '-addext', `subjectAltName=IP:${IP},IP:127.0.0.1,DNS:localhost`,
    ], { stdio: 'ignore' });
    fs.writeFileSync(ipFile, IP);
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

// ---------------------------------------------------------------- abuse limits
// Fixed one-minute windows per client IP and action.
const hits = new Map();
setInterval(() => hits.clear(), 60 * 1000);
function allow(ip, action, perMinute) {
  const k = `${action}:${ip}`, n = (hits.get(k) || 0) + 1;
  hits.set(k, n);
  return n <= perMinute;
}
const clientIP = (req) => req.headers['fly-client-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

// ---------------------------------------------------------------- http
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

function sendFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}
const json = (res, obj) => { res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache' }); res.end(JSON.stringify(obj)); };

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/qr.svg') {
    const code = String(url.searchParams.get('room') || '').toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) { res.writeHead(400); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME['.svg'] });
    res.end(await QRCode.toString(joinUrl(code), { type: 'svg', margin: 1 }));
    return;
  }
  if (p === '/info.json') return json(res, { mode: HOSTED ? 'hosted' : 'local', record: RECORD });
  if (p === '/maps.json') {
    return json(res, fs.readdirSync(path.join(PUBLIC, 'maps')).filter((f) => f.endsWith('.js') && !f.startsWith('_')));
  }
  if (p === '/') p = '/home.html';
  else if (p === '/host') p = '/index.html';
  else if (p === '/c' || p === '/controller' || /^\/j\/[A-Za-z]{4}\/?$/.test(p)) p = '/controller.html';
  const [base, rel] = p.startsWith('/vendor/') ? [VENDOR, p.slice(8)] : [PUBLIC, p.slice(1)];
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) { res.writeHead(403); res.end(); return; }
  sendFile(res, file);
}

// ---------------------------------------------------------------- race recordings
// One gzipped JSONL file per race: a meta line, one line per 60 Hz tick, an end line.
const recordings = new Map(); // id -> gzip stream

function onRecord(room, m) {
  if (!RECORD || typeof m.id !== 'string' || !/^[\w-]{1,64}$/.test(m.id)) return;
  const id = `${m.id}_${room.code}`;
  if (m.op === 'start') {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const file = path.join(DATA_DIR, `${id}.jsonl.gz`);
    const gz = zlib.createGzip();
    gz.pipe(fs.createWriteStream(file));
    Object.assign(gz, { file, room: room.code });
    gz.write(JSON.stringify(m.meta) + '\n');
    recordings.set(id, gz);
    console.log(`[${room.code}] recording race → ${path.relative(ROOT, file)}`);
    return;
  }
  const gz = recordings.get(id);
  if (!gz) return;
  if (m.op === 'rows' && Array.isArray(m.rows)) for (const row of m.rows) gz.write(JSON.stringify(row) + '\n');
  if (m.op === 'end') finishRecording(id, m.summary);
}
function finishRecording(id, summary) {
  const gz = recordings.get(id);
  if (!gz) return;
  gz.end(JSON.stringify(summary) + '\n');
  recordings.delete(id);
  console.log(`[${gz.room}] saved ${path.relative(ROOT, gz.file)}${summary.type === 'abort' ? ' (race aborted)' : ''}`);
}
const abortRecordings = (code) => {
  for (const [id, gz] of [...recordings]) if (!code || gz.room === code) finishRecording(id, { type: 'abort' });
};
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { abortRecordings(); setTimeout(() => process.exit(0), 200); });

// ---------------------------------------------------------------- rooms + relay
const ROOM_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'; // consonants only: no accidental words, no 0/O or 1/I
const rooms = new Map(); // code -> { code, token, host, controllers: Map<pid, { ws, name }>, expire }

function newRoom() {
  let code;
  do { code = Array.from({ length: 4 }, () => ROOM_ALPHABET[crypto.randomInt(ROOM_ALPHABET.length)]).join(''); } while (rooms.has(code));
  const room = { code, token: crypto.randomBytes(16).toString('hex'), host: null, controllers: new Map(), expire: null };
  rooms.set(code, room);
  return room;
}
function closeRoom(room) {
  for (const c of room.controllers.values()) { send(c.ws, { t: 'error', error: 'room-closed' }); c.ws.close(); }
  rooms.delete(room.code);
  console.log(`[${room.code}] closed (${rooms.size} rooms open)`);
}

const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const reject = (ws, error) => { send(ws, { t: 'error', error }); ws.close(); };

function onHost(ws, q, ip) {
  let room = rooms.get(String(q.get('room') || '').toUpperCase());
  if (room && room.token === q.get('token')) {
    // The host page reloaded: reattach, players stay connected.
    if (room.host && room.host !== ws) room.host.close();
    clearTimeout(room.expire);
  } else {
    if (!allow(ip, 'create', 20)) return reject(ws, 'rate-limited');
    if (rooms.size >= MAX_ROOMS) return reject(ws, 'server-full');
    room = newRoom();
    console.log(`[${room.code}] created (${rooms.size} rooms open)`);
  }
  room.host = ws;
  send(ws, { t: 'room', code: room.code, token: room.token, joinUrl: joinUrl(room.code) });
  for (const [pid, c] of room.controllers) {
    send(ws, { t: 'join', pid, name: c.name, rec: c.rec });
    send(c.ws, { t: 'status', host: true });
  }
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (m.t === 'toPlayer') send(room.controllers.get(m.pid)?.ws, m.msg); // only players in this room
    else if (m.t === 'rec') onRecord(room, m);
  });
  ws.on('close', () => {
    if (room.host !== ws) return;
    room.host = null;
    abortRecordings(room.code); // game tab closed or reloaded mid-race
    for (const c of room.controllers.values()) send(c.ws, { t: 'status', host: false });
    room.expire = setTimeout(() => closeRoom(room), ROOM_GRACE_MS);
  });
}

function onController(ws, q, ip) {
  const room = rooms.get(String(q.get('room') || '').toUpperCase());
  if (!room) {
    if (!allow(ip, 'badjoin', 30)) return reject(ws, 'rate-limited');
    return reject(ws, 'no-room');
  }
  const pid = String(q.get('id') || crypto.randomBytes(6).toString('hex')).slice(0, 40);
  const name = String(q.get('name') || 'Player').replace(/[^\p{L}\p{N} _.'-]/gu, '').slice(0, 12) || 'Player';
  const rec = q.get('rec') === '1';
  const old = room.controllers.get(pid);
  if (!old && room.controllers.size >= MAX_PHONES_PER_ROOM) return reject(ws, 'room-full');
  if (old) old.ws.close();
  room.controllers.set(pid, { ws, name, rec });
  send(room.host, { t: 'join', pid, name, rec });
  send(ws, { t: 'status', host: !!room.host, room: room.code });

  ws.on('message', (data) => {
    if (data.length > MAX_CONTROLLER_MSG) return;
    let m;
    try { m = JSON.parse(data); } catch { return; }
    send(room.host, { t: 'msg', pid, m });
  });
  ws.on('close', () => {
    if (room.controllers.get(pid)?.ws !== ws) return; // replaced by a reconnect
    room.controllers.delete(pid);
    send(room.host, { t: 'leave', pid });
  });
}

function onConnection(ws, req) {
  const q = new URL(req.url, 'http://x').searchParams;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  if (q.get('role') === 'host') onHost(ws, q, clientIP(req));
  else onController(ws, q, clientIP(req));
}

const servers = [http.createServer(handle)];
if (!HOSTED) servers.push(https.createServer(ensureCert(), handle));
for (const server of servers) {
  const wss = new WebSocketServer({ server, perMessageDeflate: false, maxPayload: 4 * 1024 * 1024 });
  wss.on('connection', onConnection);
  // Phones that lock their screen vanish without a close frame; ping to notice.
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 4000);
}

servers[0].listen(HTTP_PORT, () => {
  console.log('\n  🏎  Pedro Kart\n');
  if (HOSTED) {
    console.log(`  Hosted mode: ${PUBLIC_URL}  (listening on :${HTTP_PORT})`);
    console.log(`  Recording: ${RECORD ? 'on (players opt in on their phone)' : 'off'}\n`);
    return;
  }
  servers[1].listen(HTTPS_PORT, () => {
    console.log(`  Host a game on this Mac:   http://localhost:${HTTP_PORT}/host`);
    console.log(`  Phones join via the QR code / room code shown in the lobby`);
    console.log(`  (phones use https://${IP}:${HTTPS_PORT}/j/<CODE>; touch-only fallback: http://${IP}:${HTTP_PORT}/j/<CODE>)\n`);
  });
});
