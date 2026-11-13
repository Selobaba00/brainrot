/* Brainrot Hırsızı sunucusu — bağımlılık yok, sadece Node 18+.
   Çalıştır: node server.js   (PORT ve ADMIN_PASS ortam değişkenleriyle ayarlanır) */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Hub } = require('./core.js');

const PORT = +process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'users.json');
const ADMIN_PASS = process.env.ADMIN_PASS || 'XXşifreXX';

fs.mkdirSync(DATA_DIR, { recursive: true });
let users = {};
try { users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { users = {}; }

function saveUsers(u) {
  const tmp = DATA_FILE + '.tmp';
  try { fs.writeFileSync(tmp, JSON.stringify(u)); fs.renameSync(tmp, DATA_FILE); } catch (e) { console.error('kayıt hatası', e.message); }
}

const hub = new Hub({
  users,
  adminPass: ADMIN_PASS,
  salt: () => crypto.randomBytes(12).toString('hex'),
  hash: (p, s) => crypto.scryptSync(p, s, 32).toString('hex'),
  save: saveUsers
});

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  let file;
  if (p === '/core.js') file = path.join(__dirname, 'core.js');
  else { file = path.join(__dirname, 'public', path.normalize(p)); if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); } }
  // public klasörü yoksa (GitHub yüklemesinde düzleşmiş olabilir) kökteki index.html kullanılır
  if (p === '/index.html' && !fs.existsSync(file)) file = path.join(__dirname, 'index.html');
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Bulunamadı'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

/* ---------------- minimal WebSocket (RFC 6455) ---------------- */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD = 64 * 1024;

function frame(op, data) {
  const len = data.length; let h;
  if (len < 126) h = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(len, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([h, data]);
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.url || '').split('?')[0] !== '/ws') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);

  let buf = Buffer.alloc(0), closed = false, frags = [], msgOp = 0, msgs = 0, msgWin = Date.now();
  const client = hub.connect(
    m => { if (!closed && socket.writable) socket.write(frame(1, Buffer.from(typeof m === 'string' ? m : JSON.stringify(m)))); },
    () => { try { socket.end(frame(8, Buffer.alloc(0))); } catch (e) {} }
  );
  const end = () => { if (closed) return; closed = true; hub.disconnect(client); try { socket.destroy(); } catch (e) {} };

  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (!masked || len > MAX_PAYLOAD) return end();
      if (buf.length < off + 4 + len) return;
      const mask = buf.slice(off, off + 4); const payload = Buffer.from(buf.slice(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buf = buf.slice(off + 4 + len);
      if (op === 8) return end();
      if (op === 9) { socket.write(frame(10, payload)); continue; }
      if (op === 10) continue;
      if (op === 1 || op === 2) { frags = [payload]; msgOp = op; } else if (op === 0) frags.push(payload);
      if (fin) {
        const data = Buffer.concat(frags); frags = [];
        const now = Date.now(); if (now - msgWin > 1000) { msgWin = now; msgs = 0; }
        if (++msgs > 120) continue; // saniyede en fazla 120 mesaj
        if (msgOp === 1) { let m = null; try { m = JSON.parse(data.toString('utf8')); } catch (e) {} if (m) { try { hub.message(client, m); } catch (e) { console.error('mesaj hatası', e); } } }
      }
    }
  });
  socket.on('close', end); socket.on('error', end);
});

let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  try { hub.tick(dt); } catch (e) { console.error('tick hatası', e); }
}, 1000 / 30);

function shutdown() { hub.save(); process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

server.listen(PORT, () => console.log('Brainrot Hırsızı sunucusu: http://localhost:' + PORT));
