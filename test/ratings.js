'use strict';
// 레이팅/저장/기록 테스트. 사용법: node test/ratings.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const R = require('../lib/ratings');
const { Store } = require('../lib/store');
const { recordRoom } = require('../lib/recorder');
const E = require('../game');
const { botAction, actorId } = require('../bot');

let n = 0;
function t(name, fn) { fn(); n++; console.log('✓', name); }
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bang-store-'));

t('같은 레이팅이면 어려운 역할(배신자)로 이길 때 쉬운 역할(무법자)보다 많이 오른다', () => {
  const rs = {};
  const dRen = R.delta(1500, 1500, R.roleProb(rs, 5, 'renegade'), true, 20).delta;
  const dOut = R.delta(1500, 1500, R.roleProb(rs, 5, 'outlaw'), true, 20).delta;
  assert.ok(dRen > dOut * 1.5, `배신자 승 ${dRen.toFixed(1)} vs 무법자 승 ${dOut.toFixed(1)}`);
});

t('쉬운 역할로 질 때 더 많이 깎이고, 어려운 역할로 져도 조금만 깎인다', () => {
  const rs = {};
  const lossRen = R.delta(1500, 1500, R.roleProb(rs, 6, 'renegade'), false, 20).delta;
  const lossOut = R.delta(1500, 1500, R.roleProb(rs, 6, 'outlaw'), false, 20).delta;
  assert.ok(lossOut < lossRen && lossOut < -10, `무법자 패 ${lossOut.toFixed(1)} vs 배신자 패 ${lossRen.toFixed(1)}`);
  assert.ok(lossRen > -5);
});

t('기대 승률이 정확히 같으면 이기든 지든 변동폭의 합은 K', () => {
  const d1 = R.delta(1500, 1500, 0.4, true, 20).delta;
  const d0 = R.delta(1500, 1500, 0.4, false, 20).delta;
  assert.ok(Math.abs(d1 - d0 - R.kFor(20)) < 1e-9);
});

t('나보다 강한 상대 속에서는 기대 승률이 낮아진다', () => {
  const lo = R.expectedScore(0.4, 1500, 1700);
  const hi = R.expectedScore(0.4, 1500, 1300);
  assert.ok(lo < 0.4 && hi > 0.4);
});

t('기본 승률은 실제 기록이 쌓이면 실제 값 쪽으로 이동한다', () => {
  const prior = R.roleProb({}, 5, 'renegade');
  const observed = R.roleProb({ 5: { renegade: { g: 300, w: 90 } } }, 5, 'renegade'); // 실제 30%
  assert.ok(observed > prior + 0.15 && observed < 0.31, `${prior} → ${observed}`);
});

t('저장소: 기록 → 파일 저장 → 재시작 후 복원', () => {
  const dir = tmp();
  const s1 = new Store(dir);
  const slots = [
    { id: 'a', dev: 'DEVAAAAAAAAAA', name: '가', role: 'renegade', char: 'bart', won: true, kills: 2, eligible: true, human: true },
    { id: 'b', dev: 'DEVBBBBBBBBBB', name: '나', role: 'sheriff', char: 'slab', won: false, kills: 0, eligible: true, human: true },
    { id: 'c', dev: null, name: '봇1', role: 'outlaw', char: 'sid', won: false, kills: 1, eligible: false, human: false },
    { id: 'd', dev: null, name: '봇2', role: 'outlaw', char: 'willy', won: false, kills: 0, eligible: false, human: false },
  ];
  const rows = s1.recordGame({ n: 4, winner: 'renegade', slots });
  assert.strictEqual(rows.length, 2);
  assert.ok(rows[0].delta > 20 && rows[1].delta < 0);
  s1.save(true);
  const s2 = new Store(dir);
  const v = s2.profileView('DEVAAAAAAAAAA');
  assert.strictEqual(v.games, 1); assert.strictEqual(v.wins, 1); assert.strictEqual(v.kills, 2);
  assert.ok(v.rating > 1520);
  assert.strictEqual(s2.leaderboard('DEVBBBBBBBBBB').find((r) => r.me).name, '나');
  assert.ok(!fs.existsSync(path.join(dir, 'stats.json.tmp')));
});

t('저장소: 손상된 파일이면 빈 상태로 시작하고 죽지 않는다', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'stats.json'), '{깨진 json');
  const s = new Store(dir);
  assert.strictEqual(s.leaderboard('x').length, 0);
});

t('기록기: 사람이 부족하거나 자동 대행이 많은 판은 기록하지 않는다', () => {
  const g = playBots(5);
  const mk = (auto) => ({ g, players: g.players.map((p, i) => ({ id: p.id, name: p.name, bot: i > 1, dev: i <= 1 ? 'DEVX' + i + 'XXXXXXXXXX' : null, auto: i <= 1 ? auto : 0 })) });
  const store = new Store(tmp());
  assert.strictEqual(recordRoom(mk(0), store, 2).recorded, true);
  assert.strictEqual(recordRoom(mk(5), store, 2).recorded, false);          // 둘 다 자동 대행
  assert.strictEqual(recordRoom(mk(0), store, 3).recorded, false);          // 최소 인원 3 요구
});

function playBots(nPlayers) {
  const g = E.createGame(Array.from({ length: nPlayers }, (_, i) => ({ id: 'p' + i, name: 'P' + i })));
  let steps = 0;
  while (!g.over && steps++ < 5000) { const id = actorId(g); E.act(g, id, botAction(g, E.byId(g, id))); }
  assert.ok(g.over);
  return g;
}

t('시뮬레이션 400판: 레이팅이 폭주하지 않고, 팀 승패와 기록이 일치한다', () => {
  const store = new Store(tmp());
  const devs = ['SIMAAAAAAAAAA', 'SIMBBBBBBBBBB', 'SIMCCCCCCCCCC'];
  let recorded = 0;
  for (let i = 0; i < 400; i++) {
    const nPlayers = 4 + (i % 4);
    const g = playBots(nPlayers);
    // 앞의 3명(좌석 순서)을 사람으로 취급
    const room = { g, players: g.players.map((p, k) => ({ id: p.id, name: p.name, bot: k >= 3, dev: k < 3 ? devs[k] : null, auto: 0 })) };
    const res = recordRoom(room, store, 2);
    assert.ok(res.recorded);
    recorded++;
    const sum = E.gameSummary(g);
    for (const row of res.rows) {
      const sp = sum.players.find((p) => p.id === row.id);
      assert.strictEqual(row.delta > 0, sp.won, '승리하면 올라가고 패배하면 내려간다');
    }
  }
  const lb = store.leaderboard('');
  assert.strictEqual(lb.length, 3);
  for (const r of lb) assert.ok(r.rating > 1300 && r.rating < 1700, `레이팅 범위 ${r.rating}`);
  const diff = store.difficulty();
  assert.ok(diff[7].renegade.g > 0 && diff[7].renegade.p >= 8);
  assert.strictEqual(recorded, 400);
});

console.log(`\n${n}개 테스트 통과`);
