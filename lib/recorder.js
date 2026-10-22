'use strict';
// 끝난 게임을 기록 저장소에 반영합니다. (서버/테스트 공용)
const E = require('../game');

const AUTO_LIMIT = 3; // 자동 대행(봇이 대신 둔 횟수)이 이 이상이면 그 플레이어는 기록에서 제외

// room: { g, players:[{id, name, bot, dev, auto}] }
function recordRoom(room, store, minHumans) {
  const g = room.g;
  if (!g || !g.over) return { recorded: false, reason: 'not-over' };
  const sum = E.gameSummary(g);
  const slots = sum.players.map((sp) => {
    const pl = room.players.find((p) => p.id === sp.id);
    const human = !!pl && !pl.bot;
    const dev = human && pl.dev ? pl.dev : null;
    const eligible = !!dev && (pl.auto || 0) < AUTO_LIMIT;
    return { id: sp.id, dev, name: sp.name, role: sp.role, char: sp.char, won: sp.won, kills: sp.kills, eligible, human };
  });
  const eligibleCount = slots.filter((s) => s.eligible).length;
  if (eligibleCount < minHumans) {
    return { recorded: false, reason: eligibleCount === 0 ? 'no-humans' : 'few-humans', need: minHumans };
  }
  const rows = store.recordGame({ n: sum.n, winner: sum.winner, slots });
  return { recorded: true, rows };
}

module.exports = { recordRoom, AUTO_LIMIT };
