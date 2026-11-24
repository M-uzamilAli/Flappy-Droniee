import { createServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';

const ip = process.argv[2] ?? Object.values(networkInterfaces()).flat()
  .find(item => item.family === 'IPv4' && !item.internal)?.address;
const port = Number(process.env.GYRO_PORT ?? 8443);
if (!ip) throw Error('Pass your Wi-Fi IPv4 address: npm start -- 192.168.1.20');
const origin = 'https://' + ip + ':' + port;
const token = () => randomBytes(24).toString('base64url');
const gameKey = token();
let pairingKey = token(), controllerKey;
let game, phone;
let phoneState = 'waiting';
let runState = 'ready';
const runStates = ['ready', 'playing', 'paused', 'waiting', 'ended'];
const send = (socket, data) => {
  if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 65536) {
    socket.send(JSON.stringify(data));
  }
};
const report = () => send(game, {type:'connection', state:phoneState});
const page = name => readFileSync(new URL(name, import.meta.url));
let tls;
try {
  tls = {
    key: process.env.GYRO_TLS_KEY ? readFileSync(process.env.GYRO_TLS_KEY) : page('./lan-key.pem'),
    cert: process.env.GYRO_TLS_CERT ? readFileSync(process.env.GYRO_TLS_CERT) : page('./lan-cert.pem')
  };
} catch {
  throw Error('Missing lan-key.pem or lan-cert.pem. Follow the HTTPS setup in GAME-SETUP.md.');
}
const assets = {
  '/': ['text/html; charset=utf-8', page('./game.html')],
  '/game.html': ['text/html; charset=utf-8', page('./game.html')],
  '/controller': ['text/html; charset=utf-8', page('./controller.html')],
  '/link.js': ['text/javascript; charset=utf-8', page('./game-link.js')]
};
const server = createServer(tls, async (req, res) => {
  const path = new URL(req.url, origin).pathname;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1', ip, '::ffff:' + ip].includes(req.socket.remoteAddress);
  if (path !== '/controller' && path !== '/link.js' && !local) {
    res.writeHead(403).end('Open the game on the host PC.');
    return;
  }
  if (path === '/session') {
    try {
      const url = origin + '/controller#' + pairingKey;
      const qr = await QRCode.toDataURL(url, {width: 224, margin: 2});
      res.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify({gameKey, qr, url, paired:Boolean(controllerKey)}));
    } catch {
      res.writeHead(500).end('Could not create the pairing QR.');
    }
    return;
  }
  const asset = assets[path];
  if (!asset) { res.writeHead(404).end(); return; }
  res.writeHead(200, {'Content-Type':asset[0]}).end(asset[1]);
});

const sockets = new WebSocketServer({noServer:true, maxPayload:2048});
server.on('upgrade', (req, socket, head) => {
  const allowed = [origin, 'https://localhost:' + port, 'https://127.0.0.1:' + port];
  if (req.url !== '/live' || !allowed.includes(req.headers.origin)) {
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(req, socket, head, ws => sockets.emit('connection', ws));
});
sockets.on('connection', ws => {
  let role, lastTime = -Infinity;
  ws.alive = true;
  const joinDeadline = setTimeout(() => ws.close(4003, 'Join required'), 4000);
  ws.on('pong', () => { ws.alive = true; });
  ws.on('error', () => ws.terminate());
  ws.on('message', raw => {
    let packet;
    try { packet = JSON.parse(raw); } catch { return; }
    if (!packet || typeof packet !== 'object') return;
    if (!role) {
      if (packet.type !== 'join') { ws.close(4003, 'Join required'); return; }
      if (packet.role === 'game' && packet.key === gameKey) {
        role = 'game';
        game?.close(4001, 'Game opened elsewhere');
        game = ws;
        send(ws, {type:'joined'});
        report();
      } else if (packet.role === 'phone' && ((controllerKey &&
          (packet.key === controllerKey || (packet.key === pairingKey && packet.resumeKey === controllerKey))) ||
          (!controllerKey && packet.key === pairingKey && typeof packet.resumeKey === 'string' &&
            /^[a-f0-9]{48}$/.test(packet.resumeKey)))) {
        role = 'phone';
        controllerKey ??= packet.resumeKey;
        phone?.close(4001, 'Controller replaced');
        phone = ws;
        phoneState = 'paired';
        send(ws, {type:'joined', key:controllerKey});
        send(ws, {type:'run', state:runState});
        report();
      } else {
        const reason = packet.role !== 'phone' ? 'Refresh the game on the PC.' :
          packet.key === pairingKey ? 'Phone already paired. Open its original tab or reset pairing on the PC.' :
          'Old pairing link. Scan the current QR on the PC.';
        ws.close(4003, reason);
        return;
      }
      clearTimeout(joinDeadline);
      return;
    }
    if (role === 'game' && ws === game && packet.type === 'reset') {
      const oldPhone = phone;
      phone = undefined;
      controllerKey = undefined;
      pairingKey = token();
      phoneState = 'waiting';
      oldPhone?.close(4003, 'Pairing reset');
      report();
    }
    if (role === 'game' && ws === game && packet.type === 'run' && runStates.includes(packet.state)) {
      runState = packet.state;
      send(phone, {type:'run', state:runState});
      return;
    }
    if (role === 'game' && ws === game && packet.type === 'ping' && Number.isFinite(packet.id)) {
      send(phone, {type:'ping', id:packet.id});
      return;
    }
    if (role === 'phone' && ws === phone && packet.type === 'pong' && Number.isFinite(packet.id)) {
      send(game, {type:'pong', id:packet.id});
      return;
    }
    if (role === 'phone' && ws === phone && packet.type === 'control' &&
        ['start', 'pause', 'resume', 'restart'].includes(packet.action)) {
      send(game, {type:'control', action:packet.action});
      return;
    }
    if (role !== 'phone' || ws !== phone || packet.type !== 'pose') return;
    // The phone's orientation: four numbers that together have length 1.
    const {t, q} = packet;
    if (!Number.isFinite(t) || t <= lastTime || !Array.isArray(q) || q.length !== 4 ||
        !q.every(Number.isFinite) || Math.abs(Math.hypot(...q) - 1) > .001) return;
    lastTime = t;
    if (phoneState !== 'live') { phoneState = 'live'; report(); }
    send(game, {type:'pose', t, q});
  });
  ws.on('close', () => {
    clearTimeout(joinDeadline);
    if (ws === game) {
      game = undefined;
      runState = 'waiting';
      send(phone, {type:'run', state:runState});
    }
    if (ws === phone) {
      phone = undefined;
      phoneState = 'reconnecting';
      report();
    }
  });
});
const heartbeat = setInterval(() => {
  for (const ws of sockets.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 4000);
server.on('close', () => clearInterval(heartbeat));
server.listen(port, '0.0.0.0', () => console.log('Game host: ' + origin));
