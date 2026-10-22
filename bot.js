'use strict';
// 간단한 규칙 기반 봇. 빈 자리 채우기 및 접속이 끊긴 플레이어의 자동 대행에 사용됩니다.
const E = require('./game');

const pick = (a) => a[Math.floor(Math.random() * a.length)];

function weightedPick(items, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return pick(items);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function chooseTarget(g, p, ids) {
  const cands = ids.map((id) => E.byId(g, id));
  const aliveN = E.aliveCount(g);
  const w = cands.map((t) => {
    let s = 1;
    if (p.role === 'outlaw') s = t.role === 'sheriff' ? 6 : 1;
    else if (p.role === 'deputy') s = t.role === 'sheriff' ? 0.02 : 1;
    else if (p.role === 'renegade') s = t.role === 'sheriff' ? (aliveN > 3 ? 0.3 : 4) : 1;
    return s * (6 - Math.min(5, t.life));
  });
  return weightedPick(cands, w).id;
}

function botAction(g, p) {
  if (g.over || !p.alive) return null;
  const pd = g.pending;
  if (pd) {
    if (pd.who !== p.id) return null;
    return botRespond(g, p, pd);
  }
  if (E.cur(g) !== p || g.phase !== 'play') return null;
  return botPlay(g, p);
}

function botRespond(g, p, pd) {
  const usable = E.usableForPending(g, p, pd);
  switch (pd.type) {
    case 'respond': {
      const need = pd.need;
      if (usable.length >= need) return { t: 'respond', cardIds: usable.slice(0, need) };
      return { t: 'respond', take: true };
    }
    case 'indians':
    case 'duel':
      return usable.length ? { t: 'respond', cardIds: [usable[0]] } : { t: 'respond', take: true };
    case 'dying':
      if (usable.length) return { t: 'respond', cardIds: [usable[0]] };
      if (p.char === 'sid' && p.hand.length >= 2) return { t: 'sid', cardIds: [p.hand[0].id, p.hand[1].id] };
      return { t: 'respond', take: true };
    case 'store': {
      const pref = ['beer', 'missed', 'panic', 'catbalou', 'barrel', 'mustang', 'scope'];
      const sorted = pd.cards.slice().sort((a, b) => {
        const ia = pref.indexOf(a.type); const ib = pref.indexOf(b.type);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
      return { t: 'choose', cardId: sorted[0].id };
    }
    case 'kit': {
      // 가치가 낮은 카드를 되돌림
      const score = (c) => (c.type === 'bang' ? 1 : c.type === 'missed' ? 2 : 3);
      const worst = pd.cards.slice().sort((a, b) => score(a) - score(b))[0];
      return { t: 'choose', cardId: worst.id };
    }
    case 'jesse': {
      const ts = E.othersInOrder(g, p).filter((o) => o.hand.length);
      return ts.length ? { t: 'choose', target: pick(ts).id } : { t: 'choose', target: 'deck' };
    }
    case 'pedro':
      return { t: 'choose', source: 'discard' };
  }
  return null;
}

function botPlay(g, p) {
  const lp = E.legalPlays(g, p);
  const myRange = E.weaponRange(p);
  const options = [];
  for (const c of p.hand) {
    const opt = lp[c.id];
    if (!opt) continue;
    let score = 0;
    let action = { t: 'play', cardId: c.id };
    switch (c.type) {
      case 'beer': score = p.life <= 2 ? 120 : 100; break;
      case 'saloon': score = p.life < p.maxLife ? 55 : 0; break;
      case 'stagecoach': score = 80; break;
      case 'wellsfargo': score = 82; break;
      case 'generalstore': score = 40; break;
      case 'barrel': score = 65; break;
      case 'mustang': score = 62; break;
      case 'scope': score = 58; break;
      case 'volcanic': case 'schofield': case 'remington': case 'carabine': case 'winchester':
        score = E.WEAPONS[c.type] > myRange ? 70 : 0; break;
      case 'dynamite': score = p.life > 2 ? 8 : 0; break;
      case 'bang': case 'missed':
        score = 90;
        action.target = chooseTarget(g, p, opt.targets);
        break;
      case 'panic': case 'catbalou': {
        score = 60;
        const t = E.byId(g, chooseTarget(g, p, opt.targets));
        action.target = t.id;
        action.targetCard = t.table.length && Math.random() < 0.6 ? pick(t.table).id : t.hand.length ? 'hand' : pick(t.table).id;
        break;
      }
      case 'duel': score = 35; action.target = chooseTarget(g, p, opt.targets); break;
      case 'jail': score = 56; action.target = chooseTarget(g, p, opt.targets); break;
      case 'gatling': case 'indians': score = p.life > 2 ? 30 : 0; break;
    }
    if (score > 0) options.push({ score: score + Math.random() * 5, action });
  }
  if (options.length) {
    options.sort((a, b) => b.score - a.score);
    return options[0].action;
  }
  if (p.hand.length > p.life) {
    const cheap = p.hand.slice().sort((a, b) => (a.type === 'beer' ? 1 : 0) - (b.type === 'beer' ? 1 : 0));
    return { t: 'discard', cardId: pick(cheap.slice(0, Math.max(1, cheap.length - 1))).id };
  }
  return { t: 'end' };
}

function actorId(g) {
  if (g.over) return null;
  return g.pending ? g.pending.who : E.cur(g).id;
}

module.exports = { botAction, actorId };
