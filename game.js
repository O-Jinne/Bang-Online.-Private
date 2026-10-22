'use strict';
// Bang! 기본판 규칙 엔진 (서버 권위형). 순수 로직만 포함하며 네트워크와 무관합니다.

const ROLE_NAME = { sheriff: '보안관', deputy: '부관', outlaw: '무법자', renegade: '배신자' };

const ROLE_GOAL = {
  sheriff: '모든 무법자와 배신자를 제거하세요.',
  deputy: '보안관을 지키고, 무법자와 배신자를 제거하세요.',
  outlaw: '보안관을 처치하세요.',
  renegade: '마지막까지 살아남아 보안관과 1:1로 남아 이기세요. (보안관 혼자 남기면 안 됩니다)',
};

const WEAPONS = { volcanic: 1, schofield: 2, remington: 3, carabine: 4, winchester: 5 };

const DECK_COUNTS = {
  bang: 25, missed: 12, beer: 6, panic: 4, catbalou: 4, stagecoach: 2, wellsfargo: 1,
  generalstore: 2, gatling: 1, indians: 2, duel: 3, saloon: 1, jail: 3, dynamite: 1,
  barrel: 2, scope: 1, mustang: 2, volcanic: 2, schofield: 3, remington: 1, carabine: 1, winchester: 1,
};

const CARD_DEFS = {
  bang: { name: '뱅!', desc: '사거리 안의 상대에게 1 피해. 상대는 빗나감!으로 막을 수 있음. 턴당 1회.' },
  missed: { name: '빗나감!', desc: '뱅!을 막습니다.' },
  beer: { name: '맥주', desc: '체력 +1. 죽기 직전에도 사용 가능. 2명만 남으면 효과 없음.' },
  panic: { name: '패닉!', desc: '거리 1 이내 상대의 카드 1장(손패/장착)을 가져옴.' },
  catbalou: { name: '캣 발루', desc: '아무 상대의 카드 1장(손패/장착)을 버리게 함.' },
  stagecoach: { name: '역마차', desc: '카드 2장 뽑기.' },
  wellsfargo: { name: '웰스파고 은행', desc: '카드 3장 뽑기.' },
  generalstore: { name: '잡화점', desc: '생존자 수만큼 공개, 내 차례부터 돌아가며 1장씩 가져감.' },
  gatling: { name: '개틀링', desc: '다른 모든 플레이어에게 뱅!.' },
  indians: { name: '인디언!', desc: '다른 모든 플레이어는 뱅!을 버리거나 1 피해.' },
  duel: { name: '결투', desc: '상대와 번갈아 뱅!을 버림. 못 버리는 쪽이 1 피해.' },
  saloon: { name: '술집', desc: '모든 플레이어 체력 +1.' },
  jail: { name: '감옥', desc: '보안관 외 상대에게 부착. 턴 시작 시 ♥이 아니면 턴을 건너뜀.' },
  dynamite: { name: '다이너마이트', desc: '턴 시작 시 ♠2~9이면 3 피해, 아니면 다음 사람에게 넘어감.' },
  barrel: { name: '술통', desc: '뱅!을 맞을 때 판정해 ♥이면 빗나감.' },
  scope: { name: '조준경', desc: '내가 보는 거리 -1.' },
  mustang: { name: '야생마', desc: '남이 나를 보는 거리 +1.' },
  volcanic: { name: '볼캐닉', desc: '사거리 1. 뱅!을 제한 없이 사용.' },
  schofield: { name: '스코필드', desc: '사거리 2.' },
  remington: { name: '레밍턴', desc: '사거리 3.' },
  carabine: { name: '카빈총', desc: '사거리 4.' },
  winchester: { name: '윈체스터', desc: '사거리 5.' },
};

const CHARACTERS = [
  { id: 'bart', name: '바트 캐시디', life: 4, desc: '체력을 잃을 때마다 카드 1장을 뽑음.' },
  { id: 'blackjack', name: '블랙 잭', life: 4, desc: '두 번째로 뽑은 카드를 공개, ♥/♦이면 1장 더 뽑음.' },
  { id: 'janet', name: '캘러미티 재닛', life: 4, desc: '뱅!과 빗나감!을 서로 대신 사용 가능.' },
  { id: 'elgringo', name: '엘 그링고', life: 3, desc: '다른 플레이어에게 피해를 입으면 그 사람의 손패 1장을 가져옴.' },
  { id: 'jesse', name: '제시 존스', life: 4, desc: '첫 장을 다른 플레이어의 손패에서 뽑을 수 있음.' },
  { id: 'jourdonnais', name: '주르도네', life: 4, desc: '항상 술통 효과(♥이면 빗나감) 보유.' },
  { id: 'kit', name: '키트 칼슨', life: 4, desc: '3장을 보고 2장을 가지며 1장은 덱 위로 되돌림.' },
  { id: 'luckyduke', name: '럭키 듀크', life: 4, desc: '판정 시 2장을 뒤집어 하나를 선택.' },
  { id: 'paul', name: '폴 리그렛', life: 3, desc: '항상 야생마 효과 보유.' },
  { id: 'pedro', name: '페드로 라미레스', life: 4, desc: '첫 장을 버린 더미 맨 위에서 뽑을 수 있음.' },
  { id: 'rose', name: '로즈 둘런', life: 4, desc: '항상 조준경 효과 보유.' },
  { id: 'sid', name: '시드 케첨', life: 4, desc: '카드 2장을 버리고 체력 1 회복(언제든).' },
  { id: 'slab', name: '슬랩 더 킬러', life: 4, desc: '그의 뱅!은 빗나감!이 2장 필요.' },
  { id: 'suzy', name: '수지 라파예트', life: 4, desc: '손패가 0장이 되면 즉시 1장 뽑음.' },
  { id: 'vulture', name: '벌처 샘', life: 4, desc: '죽은 플레이어의 카드를 모두 가져감.' },
  { id: 'willy', name: '윌리 더 키드', life: 4, desc: '뱅!을 제한 없이 사용.' },
];
const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const rankLabel = (r) => RANK_LABEL[r] || String(r);

// ---------- 유틸 ----------
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const err = (msg) => ({ error: msg });
const cardName = (c) => CARD_DEFS[c.type].name;
const cardStr = (c) => `${cardName(c)}(${SUIT_SYMBOL[c.suit]}${rankLabel(c.rank)})`;
const cardView = (c) => ({ id: c.id, type: c.type, name: cardName(c), suit: c.suit, rank: c.rank });

function buildDeck() {
  const types = [];
  for (const [t, n] of Object.entries(DECK_COUNTS)) for (let i = 0; i < n; i++) types.push(t);
  const faces = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) faces.push({ suit: s, rank: r });
  // 정확한 원본 무늬 배치를 모르므로 52장 + 무작위 28장으로 80장 구성(근사)
  const pool = faces.concat(shuffle(faces.slice()).slice(0, types.length - faces.length));
  shuffle(pool);
  shuffle(types);
  return types.map((type, i) => ({ id: i, type, suit: pool[i].suit, rank: pool[i].rank }));
}

const cur = (g) => g.players[g.turn];
const byId = (g, id) => g.players.find((p) => p.id === id);
const aliveCount = (g) => g.players.filter((p) => p.alive).length;
const has = (p, type) => p.table.some((c) => c.type === type);
// 로그 문장 속 이름은 보이지 않는 표식(\u2063 id \u2064 이름 \u2063)으로 감싸 두었다가, 저장할 때 표식을 떼고
// "누가 등장했는지"(문장에서 먼저 나온 사람 = 행동한 사람)를 따로 기록한다. 그래서 플레이어를 눌러 그 사람의 행동만 모아 볼 수 있다.
const tag = (p) => '\u2063' + p.id + '\u2064' + p.name + '\u2063';
function parseLog(msg) {
  const who = [];
  let out = '';
  let last = 0;
  const re = /\u2063([^\u2064\u2063]*)\u2064([^\u2063]*)\u2063/g;
  let m;
  while ((m = re.exec(msg))) {
    out += msg.slice(last, m.index) + m[2];
    last = m.index + m[0].length;
    if (!who.includes(m[1])) who.push(m[1]);
  }
  return { text: out + msg.slice(last), who };
}
// 한국어 조사 자동 선택: 이(가) / 은(는) / 을(를) / 와(과) / (으)로 — 앞 글자의 받침 유무로 결정 (한글이 아니면 받침 없음으로 처리)
function josa(text) {
  return text.replace(/(.)(이\(가\)|은\(는\)|을\(를\)|와\(과\)|\(으\)로)/g, (m, ch, j) => {
    const c = ch.charCodeAt(0);
    const hangul = c >= 0xac00 && c <= 0xd7a3;
    const jong = hangul ? (c - 0xac00) % 28 : 0;
    const has = jong > 0;
    switch (j) {
      case '이(가)': return ch + (has ? '이' : '가');
      case '은(는)': return ch + (has ? '은' : '는');
      case '을(를)': return ch + (has ? '을' : '를');
      case '와(과)': return ch + (has ? '과' : '와');
      default: return ch + (!has || jong === 8 ? '로' : '으로');
    }
  });
}
const addLog = (g, msg) => {
  const r = parseLog(msg); r.text = josa(r.text);
  g.log.push(r.text); g.logWho.push(r.who);
  if (g.log.length > 300) { g.log.shift(); g.logWho.shift(); }
};

function othersInOrder(g, p) {
  const n = g.players.length;
  const i = g.players.indexOf(p);
  const res = [];
  for (let k = 1; k < n; k++) {
    const o = g.players[(i + k) % n];
    if (o.alive) res.push(o);
  }
  return res;
}
function nextAlive(g, p) {
  const o = othersInOrder(g, p);
  return o.length ? o[0] : p;
}

function weaponRange(p) {
  const w = p.table.find((c) => WEAPONS[c.type]);
  return w ? WEAPONS[w.type] : 1;
}
function distance(g, from, to) {
  const alive = g.players.filter((p) => p.alive);
  const n = alive.length;
  const i = alive.indexOf(from);
  const j = alive.indexOf(to);
  if (i < 0 || j < 0) return 99;
  let d = Math.min((i - j + n) % n, (j - i + n) % n);
  if (has(from, 'scope')) d -= 1;
  if (from.char === 'rose') d -= 1;
  if (has(to, 'mustang')) d += 1;
  if (to.char === 'paul') d += 1;
  return Math.max(1, d);
}

// ---------- 카드 뽑기 ----------
function drawCard(g) {
  if (!g.deck.length && g.discard.length > 1) {
    const top = g.discard.pop();
    g.deck = shuffle(g.discard);
    g.discard = [top];
    addLog(g, '덱이 비어 버린 카드를 다시 섞었습니다.');
  }
  return g.deck.pop() || null;
}
function draw(g, p, n) {
  const got = [];
  for (let i = 0; i < n; i++) {
    const c = drawCard(g);
    if (c) { p.hand.push(c); got.push(c); }
  }
  return got;
}
function drawCheck(g, p, isGood, label) {
  const flips = [];
  const k = p.char === 'luckyduke' ? 2 : 1;
  for (let i = 0; i < k; i++) { const c = drawCard(g); if (c) flips.push(c); }
  if (!flips.length) return null;
  const chosen = flips.find(isGood) || flips[0];
  flips.forEach((c) => g.discard.push(c));
  addLog(g, `${tag(p)} ${label} 판정: ${flips.map(cardStr).join(', ')}${k > 1 ? ' → ' + cardStr(chosen) + ' 선택' : ''}`);
  return { card: chosen, ok: !!isGood(chosen) };
}

// ---------- 게임 생성 ----------
function createGame(list) {
  const n = list.length;
  if (n < 4 || n > 7) throw new Error('플레이어는 4~7명이어야 합니다.');
  const roleSets = {
    4: ['sheriff', 'renegade', 'outlaw', 'outlaw'],
    5: ['sheriff', 'renegade', 'outlaw', 'outlaw', 'deputy'],
    6: ['sheriff', 'renegade', 'outlaw', 'outlaw', 'outlaw', 'deputy'],
    7: ['sheriff', 'renegade', 'outlaw', 'outlaw', 'outlaw', 'deputy', 'deputy'],
  };
  const roles = shuffle(roleSets[n].slice());
  const chars = shuffle(CHARACTERS.slice()).slice(0, n);
  // 이름이 같은 사람이 있으면 구분되도록 번호를 붙인다 (기록/로그가 사람별로 갈리도록)
  const seen = new Map();
  list = list.map((s) => { const c = (seen.get(s.name) || 0) + 1; seen.set(s.name, c); return c > 1 ? Object.assign({}, s, { name: `${s.name} ${c}` }) : s; });
  const seats = shuffle(list.slice());
  const g = { id: Math.random().toString(36).slice(2, 8), players: [], deck: buildDeck(), discard: [], turn: 0, phase: 'start', pending: null, bangs: 0, log: [], logWho: [], over: false, winner: null };
  seats.forEach((s, i) => {
    const ch = chars[i];
    const role = roles[i];
    const life = ch.life + (role === 'sheriff' ? 1 : 0);
    g.players.push({ id: s.id, name: s.name, bot: !!s.bot, role, char: ch.id, life, maxLife: life, hand: [], table: [], alive: true, kills: 0, st: { dealt: 0, friendly: 0, taken: 0, dodged: 0, beers: 0, killsEnemy: 0, killsAlly: 0 } });
  });
  for (const p of g.players) draw(g, p, p.maxLife);
  g.turn = g.players.findIndex((p) => p.role === 'sheriff');
  addLog(g, '게임 시작! 보안관은 ' + tag(cur(g)) + ' 입니다.');
  startTurn(g);
  settle(g);
  return g;
}

// ---------- 턴 진행 ----------
function startTurn(g) {
  const p = cur(g);
  g.bangs = 0;
  g.phase = 'start';
  addLog(g, `━━ ${tag(p)}의 차례 ━━`);
  dynamiteStep(g, p);
}
function dynamiteStep(g, p) {
  const dyn = p.table.find((c) => c.type === 'dynamite');
  if (dyn) {
    const r = drawCheck(g, p, (c) => !(c.suit === 'S' && c.rank >= 2 && c.rank <= 9), '다이너마이트');
    if (r && !r.ok) {
      p.table.splice(p.table.indexOf(dyn), 1);
      g.discard.push(dyn);
      addLog(g, `다이너마이트 폭발! ${tag(p)} 3 피해`);
      return damage(g, p, 3, null, () => afterDynamite(g, p));
    }
    const nxt = nextAlive(g, p);
    if (nxt !== p) {
      p.table.splice(p.table.indexOf(dyn), 1);
      nxt.table.push(dyn);
      addLog(g, `다이너마이트가 ${tag(nxt)}에게 넘어갑니다.`);
    }
  }
  jailStep(g, p);
}
function afterDynamite(g, p) {
  if (!p.alive) return settle(g);
  jailStep(g, p);
}
function jailStep(g, p) {
  const jail = p.table.find((c) => c.type === 'jail');
  if (jail) {
    p.table.splice(p.table.indexOf(jail), 1);
    g.discard.push(jail);
    const r = drawCheck(g, p, (c) => c.suit === 'H', '감옥');
    if (!(r && r.ok)) {
      addLog(g, `${tag(p)}은(는) 감옥에서 나오지 못해 턴을 건너뜁니다.`);
      return nextTurn(g);
    }
    addLog(g, `${tag(p)}이(가) 감옥에서 탈출!`);
  }
  drawPhase(g, p);
}
function drawPhase(g, p) {
  g.phase = 'draw';
  switch (p.char) {
    case 'blackjack': {
      draw(g, p, 1);
      const c = drawCard(g);
      if (c) {
        p.hand.push(c);
        addLog(g, `${tag(p)}의 두 번째 카드: ${cardStr(c)}`);
        if (c.suit === 'H' || c.suit === 'D') { draw(g, p, 1); addLog(g, `${tag(p)} 1장 추가 드로우`); }
      }
      break;
    }
    case 'jesse': {
      if (othersInOrder(g, p).some((o) => o.hand.length > 0)) { g.pending = { type: 'jesse', who: p.id }; return; }
      draw(g, p, 2);
      break;
    }
    case 'pedro': {
      if (g.discard.length) { g.pending = { type: 'pedro', who: p.id }; return; }
      draw(g, p, 2);
      break;
    }
    case 'kit': {
      const cards = [];
      for (let i = 0; i < 3; i++) { const c = drawCard(g); if (c) cards.push(c); }
      if (cards.length <= 2) { cards.forEach((c) => p.hand.push(c)); break; }
      g.pending = { type: 'kit', who: p.id, cards };
      return;
    }
    default:
      draw(g, p, 2);
  }
  g.phase = 'play';
}
function nextTurn(g) {
  if (g.over) return;
  const n = g.players.length;
  do { g.turn = (g.turn + 1) % n; } while (!cur(g).alive);
  startTurn(g);
}
function settle(g) {
  let guard = 0;
  while (!g.over && guard++ < 30) {
    for (const p of g.players) {
      if (p.alive && p.char === 'suzy' && p.hand.length === 0 && p.life > 0) {
        const c = drawCard(g);
        if (c) { p.hand.push(c); addLog(g, `${tag(p)}(수지)이(가) 손패가 비어 1장 뽑음`); }
      }
    }
    if (!g.pending && !cur(g).alive) { nextTurn(g); continue; }
    break;
  }
}

// ---------- 피해 / 죽음 ----------
function canSave(g, p, need) {
  const beersOk = aliveCount(g) > 2;
  const beers = beersOk ? p.hand.filter((c) => c.type === 'beer').length : 0;
  let potential = beers;
  if (p.char === 'sid') potential += Math.floor((p.hand.length - beers) / 2);
  return potential >= need;
}
function damage(g, v, n, src, done) {
  if (!v.alive) return done && done();
  v.life -= n;
  v.st.taken += n;
  if (src && src !== v) { if (teamOf(src.role) === teamOf(v.role)) src.st.friendly += n; else src.st.dealt += n; }
  addLog(g, `${tag(v)} 체력 -${n} (${Math.max(v.life, 0)}/${v.maxLife})`);
  if (v.life <= 0) {
    if (canSave(g, v, 1 - v.life)) {
      g.pending = { type: 'dying', who: v.id, src: src ? src.id : null, srcP: src, n, done };
      return;
    }
    return die(g, v, src, done);
  }
  afterHit(g, v, n, src);
  return done && done();
}
function afterHit(g, v, n, src) {
  if (v.char === 'bart') {
    draw(g, v, n);
    addLog(g, `${tag(v)}(바트)이(가) ${n}장 뽑음`);
  }
  if (v.char === 'elgringo' && src && src !== v && src.alive) {
    for (let i = 0; i < n && src.hand.length; i++) {
      const c = src.hand.splice(Math.floor(Math.random() * src.hand.length), 1)[0];
      v.hand.push(c);
      addLog(g, `${tag(v)}(엘 그링고)이(가) ${tag(src)}의 손패 1장을 가져감`);
    }
  }
}
function die(g, v, src, done) {
  killPlayer(g, v, src);
  if (g.over) return;
  return done && done();
}
function killPlayer(g, v, src) {
  v.alive = false;
  v.life = 0;
  addLog(g, `${tag(v)} 사망! 역할: ${ROLE_NAME[v.role]}`);
  const cards = v.hand.concat(v.table);
  v.hand = [];
  v.table = [];
  const sam = g.players.find((p) => p.alive && p.char === 'vulture' && p !== v);
  if (sam) {
    sam.hand.push(...cards);
    addLog(g, `${tag(sam)}(벌처 샘)이(가) ${cards.length}장을 가져감`);
  } else {
    cards.forEach((c) => g.discard.push(c));
  }
  if (src && src !== v) {
    src.kills = (src.kills || 0) + 1;
    if (teamOf(src.role) === teamOf(v.role)) src.st.killsAlly++; else src.st.killsEnemy++;
  }
  if (src && src.alive && src !== v) {
    if (v.role === 'outlaw') {
      draw(g, src, 3);
      addLog(g, `${tag(src)}이(가) 무법자를 처치해 3장 뽑음`);
    } else if (v.role === 'deputy' && src.role === 'sheriff') {
      const lost = src.hand.length + src.table.length;
      src.hand.concat(src.table).forEach((c) => g.discard.push(c));
      src.hand = [];
      src.table = [];
      addLog(g, `보안관이 부관을 죽여 모든 카드(${lost}장)를 버립니다.`);
    }
  }
  checkWin(g);
}
function checkWin(g) {
  const alive = g.players.filter((p) => p.alive);
  const sheriff = g.players.find((p) => p.role === 'sheriff');
  const outlaws = alive.filter((p) => p.role === 'outlaw').length;
  const ren = alive.filter((p) => p.role === 'renegade').length;
  let w = null;
  if (!sheriff.alive) w = alive.length === 1 && alive[0].role === 'renegade' ? 'renegade' : 'outlaws';
  else if (outlaws === 0 && ren === 0) w = 'sheriff';
  if (w) {
    g.over = true;
    g.winner = w;
    g.pending = null;
    g.phase = 'over';
    addLog(g, '게임 종료: ' + (w === 'sheriff' ? '보안관 팀 승리' : w === 'outlaws' ? '무법자 승리' : '배신자 승리'));
  }
}

// ---------- 뱅! 처리 ----------
function startBang(g, src, tgt, kind, done) {
  let need = src && src.char === 'slab' && kind === 'bang' ? 2 : 1;
  const tries = (has(tgt, 'barrel') ? 1 : 0) + (tgt.char === 'jourdonnais' ? 1 : 0);
  for (let i = 0; i < tries && need > 0; i++) {
    const r = drawCheck(g, tgt, (c) => c.suit === 'H', '술통');
    if (r && r.ok) { need--; addLog(g, `${tag(tgt)}의 술통 성공!`); }
  }
  if (need <= 0) {
    addLog(g, `${tag(tgt)}이(가) 공격을 피했습니다.`);
    return done && done();
  }
  g.pending = { type: 'respond', who: tgt.id, src: src.id, srcP: src, kind, need, done };
}
function gatling(g, src) {
  const queue = othersInOrder(g, src).map((p) => p.id);
  const step = () => {
    while (queue.length && !g.over) {
      const t = byId(g, queue.shift());
      if (!t.alive) continue;
      startBang(g, src, t, 'gatling', step);
      if (g.pending) return;
    }
  };
  step();
}
function indians(g, src) {
  const queue = othersInOrder(g, src).map((p) => p.id);
  const step = () => {
    while (queue.length && !g.over) {
      const id = queue.shift();
      const t = byId(g, id);
      if (!t.alive) continue;
      g.pending = { type: 'indians', who: id, src: src.id, srcP: src, next: step };
      return;
    }
  };
  step();
}

// ---------- 합법 플레이 계산 ----------
function legalPlays(g, p) {
  const out = {};
  if (g.over || g.pending || g.phase !== 'play' || cur(g) !== p || !p.alive) return out;
  const others = othersInOrder(g, p);
  const aliveN = aliveCount(g);
  const range = weaponRange(p);
  const canBang = g.bangs < 1 || p.char === 'willy' || has(p, 'volcanic');
  const withCards = (o) => o.hand.length + o.table.length > 0;
  for (const c of p.hand) {
    let t; // undefined: 불가, null: 대상 없음, array: 대상 목록
    switch (c.type) {
      case 'bang':
      case 'missed':
        if (c.type === 'missed' && p.char !== 'janet') break;
        if (canBang) {
          const ts = others.filter((o) => distance(g, p, o) <= range).map((o) => o.id);
          if (ts.length) t = ts;
        }
        break;
      case 'beer': if (p.life < p.maxLife && aliveN > 2) t = null; break;
      case 'saloon': if (others.length) t = null; break;
      case 'stagecoach': case 'wellsfargo': case 'generalstore': case 'gatling': case 'indians':
        t = null; break;
      case 'panic': {
        const ts = others.filter((o) => distance(g, p, o) <= 1 && withCards(o)).map((o) => o.id);
        if (ts.length) t = ts;
        break;
      }
      case 'catbalou': {
        const ts = others.filter(withCards).map((o) => o.id);
        if (ts.length) t = ts;
        break;
      }
      case 'duel': if (others.length) t = others.map((o) => o.id); break;
      case 'jail': {
        const ts = others.filter((o) => o.role !== 'sheriff' && !has(o, 'jail')).map((o) => o.id);
        if (ts.length) t = ts;
        break;
      }
      case 'dynamite': case 'barrel': case 'scope': case 'mustang':
      case 'volcanic': case 'schofield': case 'remington': case 'carabine': case 'winchester':
        if (!has(p, c.type)) t = null;
        break;
    }
    if (t !== undefined) out[c.id] = { targets: t };
  }
  return out;
}

function playCard(g, p, a) {
  const opt = legalPlays(g, p)[a.cardId];
  if (!opt) return err('지금 사용할 수 없는 카드입니다.');
  let target = null;
  if (opt.targets) {
    target = byId(g, a.target);
    if (!target || !opt.targets.includes(target.id)) return err('대상이 올바르지 않습니다.');
  }
  const idx = p.hand.findIndex((c) => c.id === a.cardId);
  const card = p.hand[idx];
  if (card.type === 'panic' || card.type === 'catbalou') {
    if (a.targetCard === 'hand') { if (!target.hand.length) return err('상대 손패가 없습니다.'); }
    else if (!target.table.some((c) => c.id === a.targetCard)) return err('대상 카드가 올바르지 않습니다.');
  }
  p.hand.splice(idx, 1);
  const disc = () => g.discard.push(card);

  switch (card.type) {
    case 'bang':
    case 'missed':
      disc();
      g.bangs++;
      addLog(g, `${tag(p)} → ${tag(target)}: 뱅!${card.type === 'missed' ? ' (빗나감!을 뱅!으로 사용)' : ''}`);
      startBang(g, p, target, 'bang', null);
      break;
    case 'beer':
      disc();
      p.life++;
      p.st.beers++;
      addLog(g, `${tag(p)}이(가) 맥주를 마심 (${p.life}/${p.maxLife})`);
      break;
    case 'saloon':
      disc();
      for (const o of g.players) if (o.alive && o.life < o.maxLife) o.life++;
      addLog(g, `${tag(p)}이(가) 술집 — 모두 체력 +1`);
      break;
    case 'stagecoach': disc(); draw(g, p, 2); addLog(g, `${tag(p)}이(가) 역마차: 2장 뽑음`); break;
    case 'wellsfargo': disc(); draw(g, p, 3); addLog(g, `${tag(p)}이(가) 웰스파고 은행: 3장 뽑음`); break;
    case 'generalstore': {
      disc();
      const order = [p].concat(othersInOrder(g, p));
      const cards = [];
      for (let i = 0; i < order.length; i++) { const c = drawCard(g); if (c) cards.push(c); }
      addLog(g, `${tag(p)}이(가) 잡화점: ${cards.map(cardStr).join(', ')}`);
      if (cards.length) g.pending = { type: 'store', who: p.id, cards, order, idx: 0 };
      break;
    }
    case 'gatling': disc(); addLog(g, `${tag(p)}이(가) 개틀링!`); gatling(g, p); break;
    case 'indians': disc(); addLog(g, `${tag(p)}이(가) 인디언!`); indians(g, p); break;
    case 'duel':
      disc();
      addLog(g, `${tag(p)}이(가) ${tag(target)}에게 결투 신청!`);
      g.pending = { type: 'duel', who: target.id, src: p.id, otherP: p, done: null };
      break;
    case 'panic':
    case 'catbalou': {
      disc();
      let taken;
      if (a.targetCard === 'hand') taken = target.hand.splice(Math.floor(Math.random() * target.hand.length), 1)[0];
      else taken = target.table.splice(target.table.findIndex((c) => c.id === a.targetCard), 1)[0];
      if (card.type === 'panic') {
        p.hand.push(taken);
        addLog(g, `${tag(p)}이(가) 패닉! — ${tag(target)}의 ${a.targetCard === 'hand' ? '손패 1장' : cardStr(taken)}을(를) 가져감`);
      } else {
        g.discard.push(taken);
        addLog(g, `${tag(p)}이(가) 캣 발루 — ${tag(target)}의 ${cardStr(taken)}을(를) 버리게 함`);
      }
      break;
    }
    case 'jail':
      target.table.push(card);
      addLog(g, `${tag(p)}이(가) ${tag(target)}을(를) 감옥에 가둠`);
      break;
    default: {
      // 장착 카드 (다이너마이트/술통/조준경/야생마/무기)
      if (WEAPONS[card.type]) {
        const old = p.table.find((c) => WEAPONS[c.type]);
        if (old) { p.table.splice(p.table.indexOf(old), 1); g.discard.push(old); }
      }
      p.table.push(card);
      addLog(g, `${tag(p)}이(가) ${cardName(card)} 장착`);
    }
  }
  return {};
}

// ---------- 응답 ----------
function usableForPending(g, p, pd) {
  if (!pd || pd.who !== p.id) return [];
  const isJ = p.char === 'janet';
  switch (pd.type) {
    case 'respond': return p.hand.filter((c) => c.type === 'missed' || (isJ && c.type === 'bang')).map((c) => c.id);
    case 'indians':
    case 'duel': return p.hand.filter((c) => c.type === 'bang' || (isJ && c.type === 'missed')).map((c) => c.id);
    case 'dying': return aliveCount(g) > 2 ? p.hand.filter((c) => c.type === 'beer').map((c) => c.id) : [];
  }
  return [];
}
function removeFromHand(g, p, ids) {
  const cards = [];
  for (const id of ids) {
    const i = p.hand.findIndex((c) => c.id === id);
    cards.push(p.hand.splice(i, 1)[0]);
  }
  cards.forEach((c) => g.discard.push(c));
  return cards;
}
function afterDyingHeal(g, p, pd) {
  if (p.life >= 1) {
    g.pending = null;
    afterHit(g, p, pd.n, pd.srcP);
    return pd.done && pd.done();
  }
  if (!canSave(g, p, 1 - p.life)) {
    g.pending = null;
    return die(g, p, pd.srcP, pd.done);
  }
}
function respond(g, p, a) {
  const pd = g.pending;
  if (!pd || pd.who !== p.id || !['respond', 'indians', 'duel', 'dying'].includes(pd.type)) return err('지금은 응답할 차례가 아닙니다.');
  if (a.take) {
    g.pending = null;
    switch (pd.type) {
      case 'respond': damage(g, p, 1, pd.srcP, pd.done); break;
      case 'indians': damage(g, p, 1, pd.srcP, pd.next); break;
      case 'duel': damage(g, p, 1, pd.otherP, pd.done); break;
      case 'dying': die(g, p, pd.srcP, pd.done); break;
    }
    return {};
  }
  const ids = Array.isArray(a.cardIds) ? a.cardIds : [];
  const usable = usableForPending(g, p, pd);
  const need = pd.type === 'respond' ? pd.need : 1;
  if (ids.length !== need || new Set(ids).size !== ids.length || !ids.every((i) => usable.includes(i))) {
    return err(pd.type === 'dying' ? '맥주를 선택하세요.' : `사용 가능한 카드 ${need}장을 선택하세요.`);
  }
  const cards = removeFromHand(g, p, ids);
  switch (pd.type) {
    case 'respond':
      g.pending = null;
      p.st.dodged++;
      addLog(g, `${tag(p)}이(가) ${cards.map(cardName).join(', ')}(으)로 막음`);
      pd.done && pd.done();
      break;
    case 'indians':
      g.pending = null;
      p.st.dodged++;
      addLog(g, `${tag(p)}이(가) 뱅!을 버려 인디언을 막음`);
      pd.next();
      break;
    case 'duel': {
      addLog(g, `${tag(p)}이(가) 결투에서 ${cardName(cards[0])} 사용`);
      const other = pd.otherP;
      pd.otherP = p;
      pd.who = other.id;
      pd.src = p.id;
      break;
    }
    case 'dying':
      p.life++;
      p.st.beers++;
      addLog(g, `${tag(p)}이(가) 맥주로 버팀 (${p.life}/${p.maxLife})`);
      afterDyingHeal(g, p, pd);
      break;
  }
  return {};
}
function sid(g, p, a) {
  if (p.char !== 'sid' || !p.alive) return err('시드 케첨만 사용할 수 있습니다.');
  const ids = Array.isArray(a.cardIds) ? a.cardIds : [];
  if (ids.length !== 2 || new Set(ids).size !== 2 || !ids.every((i) => p.hand.some((c) => c.id === i))) return err('손패 2장을 선택하세요.');
  const pd = g.pending;
  const dying = pd && pd.type === 'dying' && pd.who === p.id;
  const inPending = pd && pd.who === p.id;
  const free = !pd && cur(g) === p && g.phase === 'play';
  if (!dying && !(p.life < p.maxLife && (inPending || free))) return err('지금은 사용할 수 없습니다.');
  if (p.life >= p.maxLife) return err('체력이 가득 찼습니다.');
  removeFromHand(g, p, ids);
  p.life++;
  addLog(g, `${tag(p)}(시드)이(가) 카드 2장을 버리고 체력 회복 (${p.life}/${p.maxLife})`);
  if (dying) afterDyingHeal(g, p, pd);
  return {};
}

// ---------- 선택 (잡화점/키트/제시/페드로) ----------
function choose(g, p, a) {
  const pd = g.pending;
  if (!pd || pd.who !== p.id) return err('지금은 선택할 차례가 아닙니다.');
  switch (pd.type) {
    case 'store': {
      const i = pd.cards.findIndex((c) => c.id === a.cardId);
      if (i < 0) return err('카드를 선택하세요.');
      const [c] = pd.cards.splice(i, 1);
      p.hand.push(c);
      addLog(g, `${tag(p)}이(가) ${cardName(c)}을(를) 가져감`);
      pd.idx++;
      while (pd.idx < pd.order.length && !pd.order[pd.idx].alive) pd.idx++;
      if (pd.idx >= pd.order.length || !pd.cards.length) {
        pd.cards.forEach((x) => g.discard.push(x));
        g.pending = null;
      } else {
        pd.who = pd.order[pd.idx].id;
      }
      return {};
    }
    case 'kit': {
      const i = pd.cards.findIndex((c) => c.id === a.cardId);
      if (i < 0) return err('되돌릴 카드를 선택하세요.');
      const [back] = pd.cards.splice(i, 1);
      g.deck.push(back);
      pd.cards.forEach((c) => p.hand.push(c));
      g.pending = null;
      g.phase = 'play';
      addLog(g, `${tag(p)}(키트)이(가) 카드 1장을 덱 위로 되돌림`);
      return {};
    }
    case 'jesse': {
      if (a.target && a.target !== 'deck') {
        const t = byId(g, a.target);
        if (!t || !t.alive || t === p || !t.hand.length) return err('손패가 있는 상대를 선택하세요.');
        p.hand.push(t.hand.splice(Math.floor(Math.random() * t.hand.length), 1)[0]);
        draw(g, p, 1);
        addLog(g, `${tag(p)}(제시)이(가) ${tag(t)}의 손패에서 1장 뽑음`);
      } else draw(g, p, 2);
      g.pending = null;
      g.phase = 'play';
      return {};
    }
    case 'pedro': {
      if (a.source === 'discard' && g.discard.length) {
        const c = g.discard.pop();
        p.hand.push(c);
        draw(g, p, 1);
        addLog(g, `${tag(p)}(페드로)이(가) 버린 더미에서 ${cardStr(c)}을(를) 가져감`);
      } else draw(g, p, 2);
      g.pending = null;
      g.phase = 'play';
      return {};
    }
  }
  return err('알 수 없는 선택입니다.');
}

function endTurn(g, p) {
  if (g.pending || g.phase !== 'play' || cur(g) !== p) return err('지금은 턴을 끝낼 수 없습니다.');
  if (p.hand.length > p.life) return err(`손패가 체력(${p.life})보다 많습니다. 먼저 카드를 버리세요.`);
  addLog(g, `${tag(p)}이(가) 턴을 마칩니다.`);
  nextTurn(g);
  return {};
}
function discardOne(g, p, a) {
  if (g.pending || g.phase !== 'play' || cur(g) !== p) return err('지금은 버릴 수 없습니다.');
  if (p.hand.length <= p.life) return err('버릴 필요가 없습니다.');
  const i = p.hand.findIndex((c) => c.id === a.cardId);
  if (i < 0) return err('카드를 찾을 수 없습니다.');
  const [c] = p.hand.splice(i, 1);
  g.discard.push(c);
  addLog(g, `${tag(p)}이(가) ${cardName(c)}을(를) 버림`);
  return {};
}

// ---------- 외부 진입점 ----------
function act(g, pid, a) {
  if (g.over) return err('게임이 끝났습니다.');
  const p = byId(g, pid);
  if (!p || !p.alive) return err('행동할 수 없습니다.');
  let r;
  switch (a && a.t) {
    case 'play': r = cur(g) === p ? playCard(g, p, a) : err('내 차례가 아닙니다.'); break;
    case 'respond': r = respond(g, p, a); break;
    case 'choose': r = choose(g, p, a); break;
    case 'end': r = endTurn(g, p); break;
    case 'discard': r = discardOne(g, p, a); break;
    case 'sid': r = sid(g, p, a); break;
    default: r = err('알 수 없는 행동입니다.');
  }
  if (r && r.error) return r;
  settle(g);
  return { ok: true };
}

// ---------- 플레이어별 뷰 (숨겨진 정보 필터링) ----------
function pendingView(g, me) {
  const pd = g.pending;
  if (!pd) return null;
  const v = { type: pd.type, who: pd.who, src: pd.src || null };
  if (pd.type === 'respond') { v.need = pd.need; v.kind = pd.kind; }
  if (pd.type === 'indians') v.need = 1;
  if (pd.type === 'duel') { v.need = 1; v.other = pd.otherP.id; }
  if (pd.type === 'dying') v.need = 1 - byId(g, pd.who).life;
  if (pd.type === 'store') { v.cards = pd.cards.map(cardView); v.order = pd.order.map((p) => p.id); v.idx = pd.idx; }
  if (pd.type === 'kit' && pd.who === me.id) v.cards = pd.cards.map(cardView);
  if (pd.type === 'jesse' && pd.who === me.id) v.targets = othersInOrder(g, me).filter((o) => o.hand.length).map((o) => o.id);
  if (pd.type === 'pedro') v.discardTop = g.discard.length ? cardView(g.discard[g.discard.length - 1]) : null;
  v.usable = usableForPending(g, me, pd);
  return v;
}
function viewFor(g, pid) {
  const me = byId(g, pid);
  return {
    gid: g.id,
    you: pid,
    turn: cur(g).id,
    phase: g.phase,
    bangs: g.bangs,
    deck: g.deck.length,
    discardTop: g.discard.length ? cardView(g.discard[g.discard.length - 1]) : null,
    over: g.over,
    winner: g.winner,
    pom: g.over ? pomOf(g) : null,
    players: g.players.map((p) => ({
      id: p.id,
      name: p.name,
      bot: !!p.bot,
      alive: p.alive,
      life: p.life,
      maxLife: p.maxLife,
      char: p.char,
      charName: CHAR_BY_ID[p.char].name,
      charDesc: CHAR_BY_ID[p.char].desc,
      handCount: p.hand.length,
      table: p.table.map(cardView),
      role: p.id === pid || p.role === 'sheriff' || !p.alive || g.over ? p.role : null,
      range: weaponRange(p),
      dist: me && me.alive && p.alive && p !== me ? distance(g, me, p) : null,
    })),
    hand: me.hand.map(cardView),
    legal: legalPlays(g, me),
    pending: pendingView(g, me),
    log: g.log.slice(-80),
    logWho: g.logWho.slice(-80),
  };
}

const teamOf = (role) => (role === 'sheriff' || role === 'deputy' ? 'sheriff' : role === 'outlaw' ? 'outlaws' : 'renegade');
// 한 판 MVP(POM): 활약 점수. 처치·피해를 주로 보고, 마지막까지 살아남기·이긴 팀·어려운 배신자 승리에 보너스.
// 아군 처치/피해는 감점이라 "아무나 쏘기"가 유리하지 않다. 동점이면 처치 → 가한 피해 → 생존 순.
function pomOf(g) {
  const rows = g.players.map((p, i) => {
    const s = p.st, won = g.winner === teamOf(p.role);
    const parts = [
      [s.killsEnemy * 3, `처치 ${s.killsEnemy}`, s.killsEnemy > 0],
      [s.dealt, `피해 ${s.dealt}`, s.dealt > 0],
      [Math.round(s.dodged * 0.7 * 10) / 10, `방어 ${s.dodged}`, s.dodged > 0],
      [s.beers, `맥주 ${s.beers}`, s.beers > 0],
      [-s.killsAlly * 3, `아군 처치 ${s.killsAlly}`, s.killsAlly > 0],
      [-s.friendly, `아군 피해 ${s.friendly}`, s.friendly > 0],
      [p.alive ? 2 : 0, '끝까지 생존', p.alive],
      [won ? 4 : 0, '승리 팀', won],
      [won && p.role === 'renegade' ? 2 : 0, '배신자 승리', won && p.role === 'renegade'],
    ];
    const score = Math.round(parts.reduce((a, x) => a + x[0], 0) * 10) / 10;
    const tags = parts.filter((x) => x[2]).sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).map((x) => x[1]);
    return { id: p.id, score, tags, i, kills: s.killsEnemy, dealt: s.dealt, alive: p.alive, won };
  });
  rows.sort((a, b) => b.score - a.score || b.kills - a.kills || b.dealt - a.dealt || (b.alive ? 1 : 0) - (a.alive ? 1 : 0) || a.i - b.i);
  return { mvp: rows[0].id, ranking: rows.map(({ id, score, tags, won }) => ({ id, score, tags, won })) };
}
// 게임 종료 후 기록용 요약 (승패는 팀 기준: 보안관+부관 / 무법자 / 배신자)
function gameSummary(g) {
  return {
    n: g.players.length,
    winner: g.winner,
    players: g.players.map((p) => ({ id: p.id, name: p.name, role: p.role, char: p.char, alive: p.alive, kills: p.kills || 0, won: g.winner === teamOf(p.role) })),
  };
}

function countCards(g) {
  let n = g.deck.length + g.discard.length;
  for (const p of g.players) n += p.hand.length + p.table.length;
  if (g.pending && g.pending.cards) n += g.pending.cards.length;
  return n;
}

module.exports = {
  ROLE_NAME, ROLE_GOAL, CARD_DEFS, CHARACTERS, CHAR_BY_ID, WEAPONS,
  createGame, act, viewFor, josa, legalPlays, usableForPending, canSave,
  teamOf, pomOf, gameSummary, byId, cur, distance, weaponRange, othersInOrder, aliveCount, countCards, cardName,
};
