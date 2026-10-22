'use strict';
// 원격 저장소(Upstash REST) 테스트: 가짜 REST 서버로 읽기/쓰기/실패 시 동작을 확인한다.
const http = require('http');
const assert = require('assert');
const { RemoteStore } = require('../lib/remote-store');

let n = 0;
const kv = new Map();
const log = [];
let failGet = false, failSetOnce = 0;
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer tok') return send(401, { error: 'Unauthorized' });
    const [cmd, k, v] = JSON.parse(body);
    log.push(cmd);
    if (cmd === 'GET') return failGet ? send(500, { error: 'boom' }) : send(200, { result: kv.has(k) ? kv.get(k) : null });
    if (cmd === 'SET') { if (failSetOnce > 0) { failSetOnce--; return send(500, { error: 'boom' }); } kv.set(k, v); return send(200, { result: 'OK' }); }
    send(400, { error: 'unknown' });
  });
});
const slots = (a, b) => [
  { id: 'a', dev: a, name: '가', role: 'renegade', char: 'bart', won: true, kills: 1, eligible: true, human: true },
  { id: 'b', dev: b, name: '나', role: 'sheriff', char: 'slab', won: false, kills: 0, eligible: true, human: true },
  { id: 'c', dev: null, name: '봇1', role: 'outlaw', char: 'sid', won: false, kills: 0, eligible: false, human: false },
  { id: 'd', dev: null, name: '봇2', role: 'outlaw', char: 'willy', won: false, kills: 0, eligible: false, human: false },
];
async function t(name, fn) { await fn(); n++; console.log('✓', name); }

srv.listen(0, async () => {
  const url = 'http://127.0.0.1:' + srv.address().port;
  await t('빈 상태로 시작 → 기록 → 저장 → 새 인스턴스에서 복원', async () => {
    const s1 = new RemoteStore(url, 'tok'); assert.ok(await s1.init());
    s1.recordGame({ n: 4, winner: 'renegade', slots: slots('AAAAAAAAAAAA', 'BBBBBBBBBBBB') });
    await s1.flush();
    const s2 = new RemoteStore(url, 'tok'); assert.ok(await s2.init());
    assert.strictEqual(s2.profileView('AAAAAAAAAAAA').games, 1);
    assert.strictEqual(s2.leaderboard('').length, 2);
  });
  await t('저장 요청은 연속 기록해도 합쳐져서 보내진다', async () => {
    const s = new RemoteStore(url, 'tok'); await s.init();
    log.length = 0;
    for (let i = 0; i < 5; i++) s.recordGame({ n: 4, winner: 'renegade', slots: slots('AAAAAAAAAAAA', 'BBBBBBBBBBBB') });
    await s.flush(); await s.flush();
    assert.ok(log.filter((c) => c === 'SET').length <= 2, log.join());
    const s2 = new RemoteStore(url, 'tok'); await s2.init();
    assert.strictEqual(s2.profileView('AAAAAAAAAAAA').games, 6);
  });
  await t('읽기에 실패하면 쓰기 금지: 기존 기록을 빈 데이터로 덮어쓰지 않는다', async () => {
    const before = kv.get('bang:stats:v1');
    failGet = true; log.length = 0;
    const s = new RemoteStore(url, 'tok');
    const ok = await s.init();
    assert.strictEqual(ok, false); assert.strictEqual(s.persistent, false);
    s.recordGame({ n: 4, winner: 'renegade', slots: slots('CCCCCCCCCCCC', 'DDDDDDDDDDDD') });
    await s.flush();
    assert.ok(!log.includes('SET'));
    assert.strictEqual(kv.get('bang:stats:v1'), before);
    failGet = false;
  });
  await t('저장 실패 시 죽지 않고 나중에 다시 시도해 결국 저장된다', async () => {
    const s = new RemoteStore(url, 'tok'); await s.init();
    s.recordGame({ n: 4, winner: 'renegade', slots: slots('EEEEEEEEEEEE', 'FFFFFFFFFFFF') });
    failSetOnce = 1;
    await s.flush();                       // 실패(로그만 남김)
    assert.ok(s.dirty);
    await s.flush();                       // 재시도 성공
    const s2 = new RemoteStore(url, 'tok'); await s2.init();
    assert.ok(s2.profileView('EEEEEEEEEEEE'));
  });
  await t('토큰이 틀리면 init이 실패하고 서버는 메모리 모드로 동작', async () => {
    const s = new RemoteStore(url, 'wrong');
    assert.strictEqual(await s.init(), false);
    assert.strictEqual(s.persistent, false);
  });
  console.log(`\n${n}개 테스트 통과`);
  srv.close(); process.exit(0);
});
