'use strict';
// 수동 진행 모드: 속도 0이면 봇은 "다음"을 누를 때까지 멈추고, 한 번 누르면 정확히 한 수만 둔다.
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const assert = require('assert');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bang-man-'));
const PORT = 4000 + Math.floor(Math.random() * 90);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let srv, log = '';

function client() {
  const ws = new WebSocket('ws://localhost:' + PORT);
  const c = { ws, last: null, msgs: [], id: null };
  ws.on('message', (raw) => { const m = JSON.parse(raw); c.msgs.push(m); if (m.type === 'update') c.last = m; if (m.type === 'joined') c.id = m.id; });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.wait = async (f, ms = 8000) => { const t = Date.now(); for (;;) { const m = c.msgs.find(f); if (m) return m; if (Date.now() - t > ms) throw new Error('timeout'); await sleep(20); } };
  return new Promise((res) => ws.on('open', () => res(c)));
}
const logLen = (c) => c.last.game.log.length;

(async () => {
  srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { PORT, DATA_DIR: dir, BOT_DELAY_MS: 5, MIN_HUMANS: '1' }), stdio: 'pipe' });
  srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  await sleep(700);
  const h = await client();
  h.send({ type: 'create', name: '나' });
  await h.wait((m) => m.type === 'joined');
  for (let i = 0; i < 3; i++) h.send({ type: 'addBot' });
  await sleep(100);
  h.send({ type: 'speed', ms: 0 });
  await sleep(100);
  assert.strictEqual(h.last.room.delay, 0, '속도 0이 방에 반영됨');
  h.send({ type: 'start' });
  await h.wait((m) => m.type === 'update' && m.game);
  let stepsDone = 0, waited = 0;
  const t0 = Date.now();
  while (!h.last.game.over && Date.now() - t0 < 60000) {
    const g = h.last.game, nx = h.last.room.next;
    const botTurn = !!nx;
    if (botTurn) {
      // 봇 차례: 눌러 주기 전에는 절대 안 움직여야 함
      const before = logLen(h) + '|' + (g.pending ? JSON.stringify(g.pending) : '') + g.turn;
      await sleep(120);
      const g2 = h.last.game;
      assert.strictEqual(logLen(h) + '|' + (g2.pending ? JSON.stringify(g2.pending) : '') + g2.turn, before, '수동 모드에서 봇이 스스로 움직였다');
      waited++;
      const seen = h.msgs.length;
      h.send({ type: 'next' });
      await h.wait((m) => h.msgs.indexOf(m) >= seen && m.type === 'update');
      stepsDone++;
    } else {
      // 내 차례: 응전은 맞기, 턴은 종료. 그 사이 "다음"을 눌러도 무시되어야 함
      h.send({ type: 'next' });
      const pd = g.pending;
      if (pd && pd.who === h.id) {
        if (['respond', 'indians', 'duel', 'dying'].includes(pd.type)) h.send({ type: 'act', action: { t: 'respond', take: true } });
        else if (pd.type === 'store' || pd.type === 'kit') h.send({ type: 'act', action: { t: 'choose', cardId: pd.cards[0].id } });
        else if (pd.type === 'jesse') h.send({ type: 'act', action: { t: 'choose', target: 'deck' } });
        else if (pd.type === 'pedro') h.send({ type: 'act', action: { t: 'choose', source: 'deck' } });
      } else if (!pd && g.turn === h.id && g.phase === 'play') {
        const me = g.players.find((p) => p.id === h.id);
        if (g.hand.length > me.life) h.send({ type: 'act', action: { t: 'discard', cardId: g.hand[0].id } });
        else h.send({ type: 'act', action: { t: 'end' } });
      } else if (!me(g, h.id).alive) { h.send({ type: 'next' }); }
      await sleep(15);
    }
  }
  function me(g, id) { return g.players.find((p) => p.id === id); }
  assert.ok(h.last.game.over, '게임이 끝나야 함');
  assert.ok(stepsDone > 5 && waited > 5, `봇 차례에서 ${stepsDone}번 눌러 진행`);
  const defsMsg = h.msgs.find((m) => m.type === 'defs');
  assert.strictEqual(defsMsg.records, false, '기본값은 기록 꺼짐(단발성)');
  assert.ok(!h.last.result, '기록 꺼짐이면 결과에 기록 정보가 없다');
  assert.ok(h.last.game.pom && h.last.game.pom.ranking.length === 4, 'POM 은 항상 표시');
  console.log('✓ 수동 모드: 봇 차례마다 멈췄다가 "다음"으로 한 수씩 진행해 판이 끝남 (' + stepsDone + '회)');

  // 자동으로 되돌리면 다시 스스로 진행
  const h2 = await client();
  h2.send({ type: 'create', name: '가' });
  await h2.wait((m) => m.type === 'joined');
  for (let i = 0; i < 3; i++) h2.send({ type: 'addBot' });
  h2.send({ type: 'speed', ms: 600 });
  await sleep(100);
  assert.strictEqual(h2.last.room.delay, 600);
  h2.send({ type: 'speed', ms: 123 }); await sleep(80);
  assert.strictEqual(h2.last.room.delay, 600, '허용되지 않은 속도는 무시');
  console.log('✓ 속도 값 검증');
  srv.kill('SIGTERM');
  if (/Error|오류/.test(log)) { console.log('서버 로그에 오류:\n' + log); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.log('✗', e.message); console.log(log); srv && srv.kill('SIGKILL'); process.exit(1); });
