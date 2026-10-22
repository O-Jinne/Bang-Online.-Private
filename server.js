'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const E = require('./game');
const { botAction, actorId } = require('./bot');
const { buildEngine } = require('./lib/engine-bundle');
const { Store } = require('./lib/store');
const { RemoteStore } = require('./lib/remote-store');
const { recordRoom } = require('./lib/recorder');

const PORT = process.env.PORT || 3000;
const ACCESS_KEY = process.env.ACCESS_KEY || ''; // 설정하면 방 만들기에 비밀번호 필요 (공개 배포 시 권장)
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 30);
const BOT_DELAY = Number(process.env.BOT_DELAY_MS || 1500); // 봇이 한 수 두는 기본 간격 (방장이 게임 중에도 바꿀 수 있음)
const GRACE_MS = Number(process.env.DISCONNECT_GRACE_MS || 45000); // 접속이 끊긴 사람을 봇이 대신 두기 전 대기 시간
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data'); // 기록 파일(stats.json)이 저장되는 폴더
// 기록/순위(ELO)는 선택 기능입니다. 기본은 꺼짐 = 단발성 판(승자 + POM만 표시). 켜려면 RECORDS=on
const RECORDS = /^(on|1|true|yes)$/i.test(process.env.RECORDS || '');
const MIN_HUMANS = Number(process.env.MIN_HUMANS || 2); // 기록에 반영되려면 필요한 사람(기기 코드가 있는 접속자) 수
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
const BOT_NAMES = ['클린트', '더스티', '블랙 베스', '독 홀리데이', '와이어트', '애니', '벅'];

// 저장소: UPSTASH_REDIS_REST_URL/TOKEN이 있으면 원격(Upstash), 없으면 로컬 파일
const REMOTE = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;
const store = REMOTE ? new RemoteStore(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN) : new Store(DATA_DIR);
const validDev = (d) => (typeof d === 'string' && /^[A-Za-z0-9]{12,40}$/.test(d) ? d : null);

let engineSrc = null;
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
  if (p === '/config') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify({ records: RECORDS })); }
  if (p === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (p === '/engine.js') { // 연습 모드용: 규칙 엔진을 브라우저용으로 묶어서 제공
    engineSrc = engineSrc || buildEngine();
    res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' });
    return res.end(engineSrc);
  }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, data) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.png' || ext === '.woff2' ? 'public, max-age=604800' : 'no-cache' });
    res.end(data);
  });
});
const wss = new WebSocketServer({ server, maxPayload: 8 * 1024 });

// ---------- 방 ----------
const rooms = new Map();
const rid = () => crypto.randomBytes(4).toString('hex');
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)];
    if (!rooms.has(c)) return c;
  }
}
const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };

// 봇이거나, 접속이 끊긴 지 유예 시간이 지난 사람은 자동 대행
const botControlled = (pl) => pl.bot || (!pl.connected && Date.now() - pl.dcAt >= GRACE_MS);

function roomInfo(room) {
  return {
    code: room.code,
    host: room.hostId,
    started: !!room.g,
    delay: delayOf(room),
    next: (() => { const w = manualWait(room); return w ? { id: w.id, name: w.name } : null; })(),
    players: room.players.map((p) => ({ id: p.id, name: p.name, bot: p.bot, connected: p.bot ? true : p.connected })),
  };
}
function broadcast(room) {
  room.last = Date.now();
  const info = roomInfo(room);
  for (const pl of room.players) {
    if (pl.bot || !pl.ws) continue;
    let game = null;
    if (room.g && E.byId(room.g, pl.id)) game = E.viewFor(room.g, pl.id);
    send(pl.ws, { type: 'update', you: pl.id, room: info, game, result: room.g && room.g.over ? room.result || null : null });
  }
}
// 게임이 끝났다면 한 번만 기록한다.
function finishIfOver(room) {
  if (!room.g || !room.g.over || room.recorded) return;
  room.recorded = true;
  if (!RECORDS) return;
  try {
    const r = recordRoom(room, store, MIN_HUMANS);
    room.result = r.recorded
      ? { recorded: true, rows: r.rows }
      : { recorded: false, reason: r.reason, need: r.need || MIN_HUMANS };
    store.save(true);
  } catch (e) {
    console.error('기록 오류', e);
    room.result = { recorded: false, reason: 'error' };
  }
}
const delayOf = (room) => (room.delay === 0 ? 0 : room.delay || BOT_DELAY); // 0 = 수동(사람이 "다음"을 눌러야 봇이 움직임)
// 지금 차례가 봇이고 수동 모드라면 그 봇을 돌려준다 (화면의 "다음" 버튼용)
function manualWait(room) {
  if (!room.g || room.g.over || delayOf(room) !== 0) return null;
  const pl = room.players.find((p) => p.id === actorId(room.g));
  return pl && pl.bot ? pl : null;
}
function runActor(room, actor) {
  if (!actor.bot && !actor.auto) actor.auto = 0;
  if (!actor.bot) actor.auto += 1; // 사람 대신 둔 횟수(많으면 기록 제외)
  const a = botAction(room.g, E.byId(room.g, actor.id));
  if (a) {
    const r = E.act(room.g, actor.id, a);
    if (r.error) console.error('봇 오류:', r.error, JSON.stringify(a));
  } else console.error('봇이 행동을 찾지 못함', actor.id);
  finishIfOver(room);
  broadcast(room);
  scheduleBots(room);
}
function scheduleBots(room) {
  if (room.timer || !room.g || room.g.over) return;
  const pl = room.players.find((p) => p.id === actorId(room.g));
  if (!pl) return;
  let wait;
  if (pl.bot) { if (delayOf(room) === 0) return; wait = delayOf(room); } // 수동: 타이머 없이 대기
  else if (pl.connected) return;
  else wait = Math.max(pl.dcAt + GRACE_MS - Date.now(), 0) + 100;
  room.timer = setTimeout(() => {
    room.timer = null;
    if (!room.g || room.g.over) return;
    const actor = room.players.find((p) => p.id === actorId(room.g));
    if (!actor) return;
    if (!botControlled(actor)) return scheduleBots(room); // 유예 중이거나 다시 접속함
    if (actor.bot && delayOf(room) === 0) return broadcast(room); // 대기 중 수동으로 바뀜
    runActor(room, actor);
  }, wait);
}
function reassignHost(room) {
  const cur = room.players.find((p) => p.id === room.hostId);
  if (cur && !cur.bot && cur.connected) return;
  const next = room.players.find((p) => !p.bot && p.connected);
  if (next) room.hostId = next.id;
}

// ---------- 메시지 처리 ----------
function handle(ws, m) {
  if (m.type === 'ping') return send(ws, { type: 'pong' }); // keep-alive (무료 호스팅 슬립 방지) + 죽은 연결 감지
  const ctx = ws.ctx;
  switch (m.type) {
    case 'create':
    case 'join': {
      const name = String(m.name || '').trim().slice(0, 12) || '플레이어';
      let room;
      if (m.type === 'create') {
        if (ACCESS_KEY && m.key !== ACCESS_KEY) return send(ws, { type: 'error', msg: '비밀번호가 올바르지 않습니다.' });
        if (rooms.size >= MAX_ROOMS) return send(ws, { type: 'error', msg: '서버에 방이 너무 많습니다. 잠시 후 다시 시도하세요.' });
        room = { code: newCode(), players: [], hostId: null, g: null, timer: null, last: Date.now(), private: !!m.private };
        rooms.set(room.code, room);
      } else {
        room = rooms.get(String(m.room || '').toUpperCase().trim());
        if (!room) return send(ws, { type: 'error', msg: '방을 찾을 수 없습니다. 코드를 확인하세요.' });
        if (room.g) return send(ws, { type: 'error', msg: '이미 게임이 진행 중입니다.' });
        if (room.players.length >= 7) return send(ws, { type: 'error', msg: '방이 가득 찼습니다.' });
      }
      const pl = { id: rid(), name, token: crypto.randomBytes(12).toString('hex'), ws, bot: false, connected: true, dcAt: 0, dev: validDev(m.dev), auto: 0 };
      if (pl.dev) store.touch(pl.dev, name);
      room.players.push(pl);
      if (!room.hostId) room.hostId = pl.id;
      ws.ctx = { room, pl };
      send(ws, { type: 'joined', room: room.code, token: pl.token, id: pl.id });
      return broadcast(room);
    }
    case 'resume': {
      const room = rooms.get(String(m.room || '').toUpperCase());
      const pl = room && room.players.find((p) => !p.bot && p.token === m.token);
      if (!pl) return send(ws, { type: 'error', msg: '이전 방이 사라졌습니다. (서버가 재시작되었거나 오래 비어 있었어요)', fatal: true });
      if (pl.ws && pl.ws !== ws) { try { pl.ws.ctx = null; pl.ws.close(); } catch (e) { /* ignore */ } }
      pl.ws = ws;
      pl.connected = true;
      pl.auto = pl.auto || 0;
      ws.ctx = { room, pl };
      send(ws, { type: 'joined', room: room.code, token: pl.token, id: pl.id });
      reassignHost(room);
      broadcast(room);
      return scheduleBots(room);
    }
  }
  if (m.type === 'list') { // 입구 화면의 "참가하기": 지금 열려 있는(아직 시작 안 한, 비공개 아님) 방 목록
    const open = [];
    for (const rm of rooms.values()) {
      if (rm.g || rm.private) continue;
      const humans = rm.players.filter((p) => !p.bot);
      if (!humans.some((p) => p.connected)) continue; // 아무도 접속해 있지 않은 방은 숨김
      const host = rm.players.find((p) => p.id === rm.hostId);
      open.push({ code: rm.code, host: host ? host.name : '?', n: rm.players.length, bots: rm.players.length - humans.length, last: rm.last });
    }
    open.sort((x, y) => y.last - x.last);
    return send(ws, { type: 'rooms', rooms: open.slice(0, 30).map(({ last, ...x }) => x) });
  }
  if (m.type === 'stats') { // 방에 들어가지 않아도 조회 가능 (입구 화면의 '내 기록' / '순위')
    const dev = validDev(m.dev);
    return send(ws, { type: 'stats', me: dev ? store.profileView(dev) : null, board: store.leaderboard(dev), diff: store.difficulty(), persistent: store.persistent });
  }
  if (m.type === 'claim') { // 다른 기기/주소에서 쓰던 기록 코드를 이 기기로 가져오기
    const code = validDev(m.code);
    const p = code && store.has(code) ? store.profileView(code) : null;
    return send(ws, p ? { type: 'claimed', ok: true, code, name: p.name, rating: p.rating, games: p.games } : { type: 'claimed', ok: false });
  }
  if (!ctx) return send(ws, { type: 'error', msg: '먼저 방에 입장하세요.' });
  const { room, pl } = ctx;
  switch (m.type) {
    case 'addBot': {
      if (room.g || pl.id !== room.hostId) return;
      if (room.players.length >= 7) return send(ws, { type: 'error', msg: '방이 가득 찼습니다.' });
      const used = new Set(room.players.map((p) => p.name));
      const name = BOT_NAMES.find((n) => !used.has(n)) || '봇' + room.players.length;
      room.players.push({ id: rid(), name, token: null, ws: null, bot: true, connected: true, dcAt: 0 });
      return broadcast(room);
    }
    case 'speed': { // 봇 진행 속도 (방장만)
      if (pl.id !== room.hostId) return;
      const ms = Number(m.ms);
      if (![0, 600, 1500, 2600].includes(ms)) return;
      room.delay = ms;
      if (ms === 0) { clearTimeout(room.timer); room.timer = null; }
      broadcast(room);
      return scheduleBots(room);
    }
    case 'next': { // 수동 모드: 사람이 "다음"을 누르면 대기 중인 봇이 한 수 둔다
      const w = manualWait(room);
      if (!w) return;
      return runActor(room, w);
    }
    case 'kick': {
      if (room.g || pl.id !== room.hostId) return;
      const t = room.players.find((p) => p.id === m.id);
      if (!t || t.id === pl.id) return;
      room.players = room.players.filter((p) => p !== t);
      if (t.ws) { send(t.ws, { type: 'error', msg: '방에서 내보내졌습니다.', fatal: true }); t.ws.ctx = null; }
      return broadcast(room);
    }
    case 'start': {
      if (room.g || pl.id !== room.hostId) return;
      const n = room.players.length;
      if (n < 4 || n > 7) return send(ws, { type: 'error', msg: '4~7명이 필요합니다. (봇을 추가할 수 있어요)' });
      room.recorded = false; room.result = null;
      room.players.forEach((p) => { p.auto = 0; });
      room.g = E.createGame(room.players.map((p) => ({ id: p.id, name: p.name, bot: p.bot })));
      broadcast(room);
      return scheduleBots(room);
    }
    case 'lobby': {
      if (pl.id !== room.hostId) return;
      if (room.g && !room.g.over) return;
      clearTimeout(room.timer); room.timer = null;
      room.g = null; room.result = null; room.recorded = false;
      room.players = room.players.filter((p) => p.bot || p.connected);
      return broadcast(room);
    }
    case 'leave': {
      if (room.g && !room.g.over) return;
      room.players = room.players.filter((p) => p !== pl);
      ws.ctx = null;
      reassignHost(room);
      if (!room.players.some((p) => !p.bot)) { clearTimeout(room.timer); rooms.delete(room.code); }
      else broadcast(room);
      return send(ws, { type: 'left' });
    }
    case 'act': {
      if (!room.g) return;
      const r = E.act(room.g, pl.id, m.action);
      if (r.error) return send(ws, { type: 'error', msg: r.error });
      finishIfOver(room);
      broadcast(room);
      return scheduleBots(room);
    }
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  send(ws, {
    type: 'defs',
    cards: E.CARD_DEFS,
    roles: E.ROLE_NAME,
    goals: E.ROLE_GOAL,
    chars: E.CHARACTERS.map((c) => ({ id: c.id, name: c.name, life: c.life, desc: c.desc })),
    needsKey: !!ACCESS_KEY,
    minHumans: MIN_HUMANS,
    records: RECORDS,
  });
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    try { handle(ws, m); } catch (e) { console.error('처리 오류', e); send(ws, { type: 'error', msg: '서버 오류가 발생했습니다.' }); }
  });
  ws.on('close', () => {
    const ctx = ws.ctx;
    if (!ctx) return;
    const { room, pl } = ctx;
    if (pl.ws !== ws) return;
    pl.ws = null;
    pl.connected = false;
    pl.dcAt = Date.now();
    reassignHost(room);
    broadcast(room); // 대기실에서도 자리를 유지해 새로고침/앱 전환 후 재접속 가능
    scheduleBots(room);
  });
});

// 끊긴 연결 정리(프록시가 조용히 연결을 끊는 모바일 환경 대비) + 오래 방치된 방 삭제
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* ignore */ }
  }
}, 25000);
setInterval(() => {
  for (const [code, room] of rooms) {
    const anyone = room.players.some((p) => !p.bot && p.connected);
    if (!anyone && Date.now() - room.last > 30 * 60 * 1000) { clearTimeout(room.timer); rooms.delete(code); }
  }
}, 5 * 60 * 1000);

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { try { await Promise.race([store.flush(), new Promise((r) => setTimeout(r, 4000))]); } catch (e) { /* ignore */ } process.exit(0); });

store.init().then(() => server.listen(PORT, () => {
  console.log(`Bang! 서버 실행 중: http://localhost:${PORT}${ACCESS_KEY ? ' (방 만들기 비밀번호 사용)' : ''}`);
  console.log(`기록 저장 위치: ${store.persistent ? (store.where || store.file) : '(저장 불가 - 메모리에만 보관, 서버가 재시작되면 사라집니다)'} / 기록 최소 인원 ${MIN_HUMANS}명`);
}));
