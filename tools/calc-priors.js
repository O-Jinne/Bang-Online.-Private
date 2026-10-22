'use strict';
// 봇 시뮬레이션으로 (인원수, 역할)별 팀 승률을 계산합니다. lib/ratings.js 의 초기값(PRIORS) 산출용.
// 사용법: node tools/calc-priors.js [인원당 판수]
const E = require('../game');
const { botAction, actorId } = require('../bot');
const GAMES = Number(process.argv[2]) || 6000;
const out = {};
for (let n = 4; n <= 7; n++) {
  const acc = {};
  for (let i = 0; i < GAMES; i++) {
    const g = E.createGame(Array.from({ length: n }, (_, k) => ({ id: 'p' + k, name: 'P' + k })));
    let steps = 0;
    while (!g.over && steps++ < 5000) {
      const id = actorId(g);
      E.act(g, id, botAction(g, E.byId(g, id)));
    }
    if (!g.over) continue;
    const sum = E.gameSummary(g);
    const seen = {};
    for (const p of sum.players) { // 역할 슬롯 단위로 집계 (같은 역할이 여러 명이어도 팀 승패는 동일)
      acc[p.role] = acc[p.role] || { g: 0, w: 0 };
      acc[p.role].g += 1; acc[p.role].w += p.won ? 1 : 0;
      seen[p.role] = 1;
    }
  }
  out[n] = {};
  for (const [role, v] of Object.entries(acc)) out[n][role] = Math.round((v.w / v.g) * 1000) / 1000;
}
console.log(JSON.stringify(out, null, 1));
