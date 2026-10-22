'use strict';
// 봇끼리 수백 판을 돌려 예외/교착/카드 보존을 검증합니다.  사용법: node test/sim.js [판수]
const E = require('../game');
const { botAction, actorId } = require('../bot');

const GAMES = Number(process.argv[2]) || 500;
const stats = { sheriff: 0, outlaws: 0, renegade: 0, steps: 0, turns: 0 };
const bySize = {};
let failures = 0;

for (let gi = 0; gi < GAMES; gi++) {
  const n = 4 + (gi % 4);
  const list = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
  const g = E.createGame(list);
  let steps = 0;
  try {
    while (!g.over) {
      if (++steps > 5000) throw new Error('교착: 5000 스텝 초과');
      const id = actorId(g);
      const p = E.byId(g, id);
      const a = botAction(g, p);
      if (!a) throw new Error(`봇 행동 없음 actor=${id} pending=${g.pending && g.pending.type} phase=${g.phase}`);
      const r = E.act(g, id, a);
      if (r.error) throw new Error(`불법 행동 ${JSON.stringify(a)} → ${r.error} (pending=${g.pending && g.pending.type}, char=${p.char})`);
      const total = E.countCards(g);
      if (total !== 80) throw new Error(`카드 보존 위반: ${total}장 (${JSON.stringify(a)})`);
      for (const q of g.players) {
        if (q.alive && q.life > q.maxLife) throw new Error('체력 초과');
        if (q.alive && q.life <= 0 && !(g.pending && g.pending.type === 'dying' && g.pending.who === q.id)) throw new Error(`체력 0 이하 생존자 ${q.name}`);
      }
      // 뷰 생성도 매번 확인
      for (const q of g.players) E.viewFor(g, q.id);
    }
    stats[g.winner]++;
    stats.steps += steps;
    bySize[n] = bySize[n] || { sheriff: 0, outlaws: 0, renegade: 0 };
    bySize[n][g.winner]++;
  } catch (e) {
    failures++;
    console.log(`게임 ${gi} (${n}인) 실패: ${e.stack.split('\n').slice(0, 3).join(' | ')}`);
    console.log(g.log.slice(-12).join('\n'));
    if (failures >= 3) break;
  }
}
console.log(JSON.stringify({ games: GAMES, failures, wins: { sheriff: stats.sheriff, outlaws: stats.outlaws, renegade: stats.renegade }, avgSteps: Math.round(stats.steps / GAMES), bySize }, null, 1));
process.exit(failures ? 1 : 0);
