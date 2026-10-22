'use strict';
// 역할 난이도를 반영한 ELO.
//
// 아이디어: 역할마다 이길 확률이 다르므로, "기대 승률"을 (인원수, 역할)별 기본 승률에서 출발시킵니다.
//   기대 승률 E = sigmoid( logit(기본 승률) + (내 레이팅 - 상대 평균 레이팅) × ln(10)/400 )
//   레이팅 변동 = K × (결과 - E)      결과: 팀이 이기면 1, 지면 0
// 그래서 같은 실력이라면 어려운 역할(예: 배신자)로 이겼을 때 많이 오르고 져도 조금만 내려가며,
// 쉬운 역할로 지면 많이 내려갑니다.
//
// 기본 승률은 처음에는 봇 시뮬레이션(tools/calc-priors.js)으로 만든 초기값이고,
// 서버에 판이 쌓이면 실제 기록으로 보정됩니다: p = (실제 승수 + M × 초기값) / (실제 판수 + M)

const BASE_RATING = 1500;
const BOT_RATING = 1500;   // 상대 평균을 계산할 때 봇의 레이팅
const K = 32;
const K_PROVISIONAL = 48;  // 처음 몇 판은 빠르게 수렴
const PROVISIONAL_GAMES = 8;
const M = 30;              // 초기값의 가중치(가상의 판수)
const P_MIN = 0.08;
const P_MAX = 0.92;

// tools/calc-priors.js 결과 (봇 시뮬레이션 6000판/인원수). 봇은 배신자 운영이 서툴러 실제 사람보다 낮게 나오므로 하한을 둡니다.
const RAW_PRIORS = {
  4: { sheriff: 0.368, outlaw: 0.548, renegade: 0.084 },
  5: { sheriff: 0.489, deputy: 0.489, outlaw: 0.455, renegade: 0.056 },
  6: { sheriff: 0.360, deputy: 0.360, outlaw: 0.607, renegade: 0.033 },
  7: { sheriff: 0.399, deputy: 0.399, outlaw: 0.572, renegade: 0.028 },
};
const clamp = (p) => Math.min(P_MAX, Math.max(P_MIN, p));
const PRIORS = {};
for (const [n, roles] of Object.entries(RAW_PRIORS)) {
  PRIORS[n] = {};
  for (const [r, p] of Object.entries(roles)) PRIORS[n][r] = clamp(p);
}

// roleStats: { [n]: { [role]: { g, w } } }  서버에 누적된 실제 결과
function roleProb(roleStats, n, role) {
  const prior = PRIORS[n] && PRIORS[n][role] != null ? PRIORS[n][role] : 0.4;
  const s = (roleStats && roleStats[n] && roleStats[n][role]) || { g: 0, w: 0 };
  return clamp((s.w + M * prior) / (s.g + M));
}

function expectedScore(p0, rating, fieldRating) {
  const x = Math.log(p0 / (1 - p0)) + ((rating - fieldRating) * Math.LN10) / 400;
  return 1 / (1 + Math.exp(-x));
}
const kFor = (games) => (games < PROVISIONAL_GAMES ? K_PROVISIONAL : K);

function delta(rating, fieldRating, p0, won, games) {
  const e = expectedScore(p0, rating, fieldRating);
  return { expected: e, delta: kFor(games) * ((won ? 1 : 0) - e) };
}

module.exports = { BASE_RATING, BOT_RATING, PROVISIONAL_GAMES, PRIORS, roleProb, expectedScore, delta, kFor };
