'use strict';
// 서버 통합 테스트: 사람 2명(수동 진행: 응전은 "맞기", 턴은 바로 종료) + 봇 2명으로 한 판을 끝까지 두고
// 기록 / 순위 / 기록 코드 가져오기 / 재시작 후 복원 / 최소 인원 미달 시 미기록을 확인한다.
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const assert = require('assert');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bang-int-'));
const PORT = 3900 + Math.floor(Math.random() * 90);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let srv, log = '';
function start(env) {
  srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { PORT, DATA_DIR: dir, BOT_DELAY_MS: 3, RECORDS: 'on' }, env), stdio: 'pipe' });
  srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  return sleep(700);
}
const stop = () => new Promise((r) => { srv.once('exit', r); srv.kill('SIGTERM'); });

function client(dev) {
  const ws = new WebSocket('ws://localhost:' + PORT);
  const c = { ws, last: null, msgs: [], id: null, dev };
  ws.on('message', (raw) => { const m = JSON.parse(raw); c.msgs.push(m); if (m.type === 'update') c.last = m; if (m.type === 'joined') c.id = m.id; });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.wait = async (f, ms = 15000) => { const t = Date.now(); for (;;) { const m = c.msgs.find(f); if (m) return m; if (Date.now() - t > ms) throw new Error('timeout'); await sleep(20); } };
  c.next = async (type) => { const n = c.msgs.length; return c.wait((m) => c.msgs.indexOf(m) >= n && m.type === type); };
  return new Promise((res) => ws.on('open', () => res(c)));
}

// 뷰만 보고 가장 단순하게 진행: 응전은 피해 받기, 선택은 첫 항목, 턴은 (필요하면 버리고) 종료
function step(c) {
  const u = c.last; if (!u || !u.game || u.game.over) return;
  const g = u.game, me = g.players.find((p) => p.id === c.id);
  if (!me.alive) return;
  const pd = g.pending;
  if (pd) {
    if (pd.who !== c.id) return;
    if (['respond', 'indians', 'duel', 'dying'].includes(pd.type)) return c.send({ type: 'act', action: { t: 'respond', take: true } });
    if (pd.type === 'store' || pd.type === 'kit') return c.send({ type: 'act', action: { t: 'choose', cardId: pd.cards[0].id } });
    if (pd.type === 'jesse') return c.send({ type: 'act', action: { t: 'choose', target: 'deck' } });
    if (pd.type === 'pedro') return c.send({ type: 'act', action: { t: 'choose', source: 'deck' } });
    return;
  }
  if (g.turn !== c.id || g.phase !== 'play') return;
  if (g.hand.length > me.life) return c.send({ type: 'act', action: { t: 'discard', cardId: g.hand[0].id } });
  c.send({ type: 'act', action: { t: 'end' } });
}

async function playRound(devs, humansWanted) {
  const cs = []; for (const d of devs) cs.push(await client(d));
  cs[0].send({ type: 'create', name: 'P0', dev: cs[0].dev });
  const j = await cs[0].wait((m) => m.type === 'joined');
  for (let i = 1; i < cs.length; i++) { cs[i].send({ type: 'join', name: 'P' + i, room: j.room, dev: cs[i].dev }); await cs[i].wait((m) => m.type === 'joined'); }
  while (cs.length + (cs._bots = (cs._bots || 0) + 1) - 1 < 4) cs[0].send({ type: 'addBot' });
  await sleep(150);
  cs[0].send({ type: 'start' });
  const t0 = Date.now();
  while (!cs.every((c) => c.last && c.last.game && c.last.game.over)) {
    if (Date.now() - t0 > 120000) throw new Error('게임이 끝나지 않음');
    cs.forEach(step);
    await sleep(15);
  }
  await sleep(100);
  return cs;
}

(async () => {
  let fails = 0;
  const T = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { fails++; console.log('✗', name, '\n  ', e.message); } };
  await start({ MIN_HUMANS: '2' });

  let cs;
  await T('사람 2명 + 봇 2명: 게임이 끝나면 두 사람의 결과가 기록되어 전달된다', async () => {
    cs = await playRound(['AAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBB']);
    const r = cs[0].last.result;
    assert.ok(r && r.recorded, JSON.stringify(r));
    assert.strictEqual(r.rows.length, 2);
    for (const row of r.rows) assert.ok(row.after !== row.before);
    assert.deepStrictEqual(cs[0].last.result, cs[1].last.result);
    assert.ok(!JSON.stringify(cs[0].last).includes('AAAAAAAAAAAAAAAA'), '기기 코드가 다른 사람에게 노출되면 안 됨');
  });

  await T('stats: 내 기록·순위·역할 난이도표를 돌려준다', async () => {
    const c = await client(null);
    c.send({ type: 'stats', dev: 'AAAAAAAAAAAAAAAA' });
    const s = await c.wait((m) => m.type === 'stats');
    assert.strictEqual(s.me.games, 1);
    assert.strictEqual(s.board.length, 2);
    assert.strictEqual(s.board.filter((r) => r.me).length, 1);
    assert.ok(s.diff[4] && s.diff[4].renegade);
    assert.ok(!JSON.stringify(s).includes('BBBBBBBBBBBBBBBB'));
    c.send({ type: 'stats' });
    const s2 = await c.wait((m) => m.type === 'stats' && m !== s);
    assert.strictEqual(s2.me, null);
  });

  await T('claim: 기록 코드가 있으면 가져오기 성공, 없으면 실패', async () => {
    const c = await client(null);
    c.send({ type: 'claim', code: 'BBBBBBBBBBBBBBBB' });
    const ok = await c.wait((m) => m.type === 'claimed');
    assert.ok(ok.ok && ok.games === 1);
    c.send({ type: 'claim', code: 'ZZZZZZZZZZZZZZZZ' });
    const bad = await c.next('claimed');
    assert.strictEqual(bad.ok, false);
    c.send({ type: 'claim', code: '<script>' });
    assert.strictEqual((await c.next('claimed')).ok, false);
  });

  await T('서버를 재시작해도 기록이 남아 있다 (stats.json)', async () => {
    await stop();
    assert.ok(fs.existsSync(path.join(dir, 'stats.json')));
    await start({ MIN_HUMANS: '2' });
    const c = await client(null);
    c.send({ type: 'stats', dev: 'BBBBBBBBBBBBBBBB' });
    const s = await c.wait((m) => m.type === 'stats');
    assert.strictEqual(s.me.games, 1);
  });

  await T('한 방에 사람이 1명뿐이면 기록하지 않고 이유를 알려준다 (MIN_HUMANS=2)', async () => {
    const solo = await playRound(['CCCCCCCCCCCCCCCC']);
    const r = solo[0].last.result;
    assert.ok(r && !r.recorded && r.reason === 'few-humans', JSON.stringify(r));
    const c = await client(null);
    c.send({ type: 'stats', dev: 'CCCCCCCCCCCCCCCC' });
    assert.strictEqual((await c.wait((m) => m.type === 'stats')).me, null);
  });

  await T('기기 코드 없이(연습/구버전 클라이언트) 접속해도 게임은 정상, 기록만 제외', async () => {
    const anon = await playRound([null, null]);
    assert.ok(anon[0].last.result && !anon[0].last.result.recorded);
  });

  await stop();
  if (log.includes('Error') || log.includes('오류')) { console.log('서버 로그에 오류:\n' + log); fails++; }
  console.log(fails ? `\n${fails}개 실패` : '\n통합 테스트 모두 통과');
  process.exit(fails ? 1 : 0);
})();
