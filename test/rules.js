'use strict';
// 핵심 규칙 단위 테스트. 사용법: node test/rules.js
const assert = require('assert');
const E = require('../game');
const { botAction, actorId } = require('../bot');

E.CHAR_BY_ID.none = { id: 'none', name: '중립', life: 4, desc: '' };
let n = 0;
function t(name, fn) { fn(); n++; console.log('✓', name); }

function setup(count = 5) {
  const list = Array.from({ length: count }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
  const g = E.createGame(list);
  // 상태를 결정적으로 만든다: 좌석 순서 유지, 첫 플레이어가 차례, 손패/장착 비움
  g.pending = null; g.over = false; g.winner = null; g.phase = 'play'; g.turn = 0; g.bangs = 0;
  g.players.forEach((p, i) => {
    p.id = 'p' + i; p.name = 'P' + i; // createGame이 좌석을 섞으므로 id를 좌석 순서로 재부여
    p.hand = []; p.table = []; p.alive = true; p.char = 'bart'; p.life = p.maxLife = 4;
    p.role = ['sheriff', 'outlaw', 'outlaw', 'deputy', 'renegade', 'outlaw', 'deputy'][i];
  });
  g.players.forEach((p) => { p.char = 'none'; }); // 능력 없는 중립 캐릭터
  g.discard = []; g.deck = []; g.log = [];
  g.nextId = 1000;
  return g;
}
const mk = (g, type, suit = 'S', rank = 5) => ({ id: g.nextId++, type, suit, rank });
const give = (g, p, ...types) => types.forEach((ty) => p.hand.push(mk(g, ty)));

t('거리: 5인 기본 거리와 야생마/조준경', () => {
  const g = setup(5);
  const [a, b, c, d] = g.players;
  assert.strictEqual(E.distance(g, a, b), 1);
  assert.strictEqual(E.distance(g, a, c), 2);
  assert.strictEqual(E.distance(g, a, d), 2);
  c.table.push(mk(g, 'mustang'));
  assert.strictEqual(E.distance(g, a, c), 3);
  a.table.push(mk(g, 'scope'));
  assert.strictEqual(E.distance(g, a, c), 2);
});

t('거리: 사망자는 거리 계산에서 제외', () => {
  const g = setup(5);
  g.players[1].alive = false;
  assert.strictEqual(E.distance(g, g.players[0], g.players[2]), 1);
});

t('뱅!: 사거리 밖은 불가, 턴당 1회', () => {
  const g = setup(5);
  const a = g.players[0];
  give(g, a, 'bang', 'bang');
  const lp = E.legalPlays(g, a);
  const first = a.hand[0].id;
  assert.deepStrictEqual(lp[first].targets.sort(), ['p1', 'p4']);
  assert.ok(E.act(g, 'p0', { t: 'play', cardId: first, target: 'p1' }).ok);
  assert.ok(g.pending && g.pending.type === 'respond' && g.pending.who === 'p1');
  assert.ok(E.act(g, 'p1', { t: 'respond', take: true }).ok);
  assert.strictEqual(g.players[1].life, 3);
  assert.deepStrictEqual(E.legalPlays(g, a), {}); // 두 번째 뱅! 불가
});

t('뱅! → 빗나감!으로 방어', () => {
  const g = setup(5);
  give(g, g.players[0], 'bang');
  give(g, g.players[1], 'missed');
  E.act(g, 'p0', { t: 'play', cardId: g.players[0].hand[0].id, target: 'p1' });
  const r = E.act(g, 'p1', { t: 'respond', cardIds: [g.players[1].hand[0].id] });
  assert.ok(r.ok);
  assert.strictEqual(g.players[1].life, 4);
  assert.strictEqual(g.pending, null);
});

t('슬랩: 빗나감! 2장 필요', () => {
  const g = setup(5);
  g.players[0].char = 'slab';
  give(g, g.players[0], 'bang');
  give(g, g.players[1], 'missed');
  E.act(g, 'p0', { t: 'play', cardId: g.players[0].hand[0].id, target: 'p1' });
  assert.strictEqual(g.pending.need, 2);
  assert.ok(E.act(g, 'p1', { t: 'respond', cardIds: [g.players[1].hand[0].id] }).error);
});

t('재닛: 뱅!과 빗나감! 호환', () => {
  const g = setup(5);
  g.players[1].char = 'janet';
  give(g, g.players[0], 'bang');
  give(g, g.players[1], 'bang');
  E.act(g, 'p0', { t: 'play', cardId: g.players[0].hand[0].id, target: 'p1' });
  assert.ok(E.act(g, 'p1', { t: 'respond', cardIds: [g.players[1].hand[0].id] }).ok);
  assert.strictEqual(g.players[1].life, 4);
});

t('죽기 직전 맥주로 생존', () => {
  const g = setup(5);
  g.players[1].life = 1;
  give(g, g.players[0], 'bang');
  give(g, g.players[1], 'beer');
  E.act(g, 'p0', { t: 'play', cardId: g.players[0].hand[0].id, target: 'p1' });
  E.act(g, 'p1', { t: 'respond', take: true });
  assert.strictEqual(g.pending.type, 'dying');
  assert.ok(E.act(g, 'p1', { t: 'respond', cardIds: [g.players[1].hand[0].id] }).ok);
  assert.ok(g.players[1].alive);
  assert.strictEqual(g.players[1].life, 1);
});

t('무법자 처치 시 3장 드로우', () => {
  const g = setup(5);
  g.players[1].life = 1; // outlaw
  g.deck = Array.from({ length: 10 }, () => mk(g, 'bang'));
  give(g, g.players[0], 'bang');
  E.act(g, 'p0', { t: 'play', cardId: g.players[0].hand[0].id, target: 'p1' });
  E.act(g, 'p1', { t: 'respond', take: true });
  assert.ok(!g.players[1].alive);
  assert.strictEqual(g.players[0].hand.length, 3);
});

t('보안관이 부관을 죽이면 모든 카드를 버림', () => {
  const g = setup(5);
  g.players[3].life = 1; // deputy, 거리 2 → 카빈총 장착
  g.players[0].table.push(mk(g, 'schofield'));
  give(g, g.players[0], 'bang', 'beer', 'missed');
  E.act(g, 'p0', { t: 'play', cardId: g.players[0].hand[0].id, target: 'p3' });
  E.act(g, 'p3', { t: 'respond', take: true });
  assert.ok(!g.players[3].alive);
  assert.strictEqual(g.players[0].hand.length, 0);
  assert.strictEqual(g.players[0].table.length, 0);
});

t('승리: 보안관 사망 시 배신자 단독 생존이면 배신자 승', () => {
  const g = setup(4);
  g.players[0].life = 1; g.players[0].role = 'sheriff';
  g.players[1].role = 'renegade'; g.players[2].role = 'outlaw'; g.players[3].role = 'outlaw';
  g.players[2].alive = false; g.players[3].alive = false;
  g.players[1].table.push(mk(g, 'schofield'));
  g.turn = 1;
  give(g, g.players[1], 'bang');
  E.act(g, 'p1', { t: 'play', cardId: g.players[1].hand[0].id, target: 'p0' });
  E.act(g, 'p0', { t: 'respond', take: true });
  assert.ok(g.over);
  assert.strictEqual(g.winner, 'renegade');
});

t('승리: 무법자/배신자 전멸 시 보안관 팀 승', () => {
  const g = setup(4);
  g.players[1].role = 'renegade'; g.players[2].role = 'outlaw'; g.players[3].role = 'deputy';
  g.players[2].alive = false;
  g.players[1].life = 1;
  give(g, g.players[0], 'bang');
  E.act(g, 'p0', { t: 'play', cardId: g.players[0].hand[0].id, target: 'p1' });
  E.act(g, 'p1', { t: 'respond', take: true });
  assert.ok(g.over);
  assert.strictEqual(g.winner, 'sheriff');
});

t('감옥: ♥이 아니면 턴 건너뜀, ♥이면 탈출', () => {
  const g = setup(5);
  g.players[1].table.push(mk(g, 'jail'));
  g.deck = [mk(g, 'bang', 'H', 3), mk(g, 'bang', 'C', 3), mk(g, 'bang', 'C', 4), mk(g, 'bang', 'C', 5)];
  g.turn = 0;
  E.act(g, 'p0', { t: 'end' }); // p1 차례 시작: 감옥 판정(덱 맨 위=마지막 요소=클럽) → 건너뜀 → p2
  assert.strictEqual(E.cur(g).id, 'p2');
  const g2 = setup(5);
  g2.players[1].table.push(mk(g2, 'jail'));
  g2.deck = [mk(g2, 'bang', 'C', 3), mk(g2, 'bang', 'C', 4), mk(g2, 'bang', 'C', 5), mk(g2, 'bang', 'H', 3)];
  E.act(g2, 'p0', { t: 'end' });
  assert.strictEqual(E.cur(g2).id, 'p1');
  assert.strictEqual(g2.phase, 'play');
});

t('다이너마이트: 폭발 시 3 피해, 아니면 다음 사람에게 넘어감', () => {
  const g = setup(5);
  g.players[1].table.push(mk(g, 'dynamite'));
  g.deck = [mk(g, 'bang', 'C', 3), mk(g, 'bang', 'C', 4), mk(g, 'bang', 'C', 5), mk(g, 'bang', 'S', 5)];
  E.act(g, 'p0', { t: 'end' });
  assert.strictEqual(g.players[1].life, 1);
  const g2 = setup(5);
  g2.players[1].table.push(mk(g2, 'dynamite'));
  g2.deck = [mk(g2, 'bang', 'C', 3), mk(g2, 'bang', 'C', 4), mk(g2, 'bang', 'C', 5), mk(g2, 'bang', 'H', 5)];
  E.act(g2, 'p0', { t: 'end' });
  assert.strictEqual(g2.players[1].life, 4);
  assert.ok(g2.players[2].table.some((c) => c.type === 'dynamite'));
});

t('술통: ♥이면 자동 회피', () => {
  const g = setup(5);
  g.players[1].table.push(mk(g, 'barrel'));
  g.deck = [mk(g, 'bang', 'C', 3), mk(g, 'bang', 'H', 9)];
  give(g, g.players[0], 'bang');
  E.act(g, 'p0', { t: 'play', cardId: g.players[0].hand[0].id, target: 'p1' });
  assert.strictEqual(g.pending, null);
  assert.strictEqual(g.players[1].life, 4);
});

t('개틀링/인디언: 순서대로 응답 대기', () => {
  const g = setup(4);
  give(g, g.players[0], 'gatling');
  E.act(g, 'p0', { t: 'play', cardId: g.players[0].hand[0].id });
  assert.strictEqual(g.pending.who, 'p1');
  E.act(g, 'p1', { t: 'respond', take: true });
  assert.strictEqual(g.pending.who, 'p2');
  E.act(g, 'p2', { t: 'respond', take: true });
  assert.strictEqual(g.pending.who, 'p3');
  E.act(g, 'p3', { t: 'respond', take: true });
  assert.strictEqual(g.pending, null);
  assert.deepStrictEqual(g.players.map((p) => p.life), [4, 3, 3, 3]);
});

t('결투: 번갈아 뱅! 버리고 못 버리는 쪽이 피해', () => {
  const g = setup(4);
  give(g, g.players[0], 'duel', 'bang');
  give(g, g.players[1], 'bang');
  E.act(g, 'p0', { t: 'play', cardId: g.players[0].hand[0].id, target: 'p1' });
  assert.strictEqual(g.pending.who, 'p1');
  E.act(g, 'p1', { t: 'respond', cardIds: [g.players[1].hand[0].id] });
  assert.strictEqual(g.pending.who, 'p0');
  E.act(g, 'p0', { t: 'respond', cardIds: [g.players[0].hand[0].id] });
  assert.strictEqual(g.pending.who, 'p1');
  E.act(g, 'p1', { t: 'respond', take: true });
  assert.strictEqual(g.players[1].life, 3);
});

t('패닉!: 거리 1 제한, 손패는 무작위로 가져옴', () => {
  const g = setup(5);
  give(g, g.players[0], 'panic');
  give(g, g.players[1], 'beer');
  give(g, g.players[2], 'beer');
  const lp = E.legalPlays(g, g.players[0]);
  assert.deepStrictEqual(lp[g.players[0].hand[0].id].targets.sort(), ['p1', 'p4'].filter((id) => g.players[Number(id[1])].hand.length || g.players[Number(id[1])].table.length));
  E.act(g, 'p0', { t: 'play', cardId: g.players[0].hand[0].id, target: 'p1', targetCard: 'hand' });
  assert.strictEqual(g.players[0].hand.length, 1);
  assert.strictEqual(g.players[1].hand.length, 0);
});

t('잡화점: 생존자 수만큼 공개, 순서대로 1장씩', () => {
  const g = setup(4);
  g.deck = Array.from({ length: 8 }, () => mk(g, 'bang'));
  give(g, g.players[0], 'generalstore');
  E.act(g, 'p0', { t: 'play', cardId: g.players[0].hand[0].id });
  assert.strictEqual(g.pending.cards.length, 4);
  for (let i = 0; i < 4; i++) {
    const who = g.pending.who;
    assert.strictEqual(who, 'p' + i);
    E.act(g, who, { t: 'choose', cardId: g.pending.cards[0].id });
  }
  assert.strictEqual(g.pending, null);
  assert.ok(g.players.every((p) => p.hand.length === 1));
});

t('맥주: 2명만 남으면 사용 불가', () => {
  const g = setup(4);
  g.players[2].alive = false; g.players[3].alive = false;
  g.players[0].life = 2;
  give(g, g.players[0], 'beer');
  assert.deepStrictEqual(E.legalPlays(g, g.players[0]), {});
});

t('벌처 샘: 죽은 사람의 카드를 가져감', () => {
  const g = setup(5);
  g.players[2].char = 'vulture';
  g.players[1].life = 1;
  give(g, g.players[1], 'beer'.replace('beer', 'missed'));
  give(g, g.players[0], 'bang');
  E.act(g, 'p0', { t: 'play', cardId: g.players[0].hand[0].id, target: 'p1' });
  E.act(g, 'p1', { t: 'respond', take: true });
  assert.strictEqual(g.players[2].hand.length, 1);
});

t('시드: 카드 2장으로 죽기 직전 회복', () => {
  const g = setup(5);
  g.players[1].char = 'sid';
  g.players[1].life = 1;
  give(g, g.players[1], 'bang', 'bang');
  give(g, g.players[0], 'bang');
  E.act(g, 'p0', { t: 'play', cardId: g.players[0].hand[0].id, target: 'p1' });
  E.act(g, 'p1', { t: 'respond', take: true });
  assert.strictEqual(g.pending.type, 'dying');
  assert.ok(E.act(g, 'p1', { t: 'sid', cardIds: g.players[1].hand.map((c) => c.id) }).ok);
  assert.ok(g.players[1].alive);
});

t('손패 초과 시 턴 종료 불가, 버린 뒤 종료', () => {
  const g = setup(5);
  g.players[0].life = 2;
  give(g, g.players[0], 'bang', 'bang', 'bang');
  assert.ok(E.act(g, 'p0', { t: 'end' }).error);
  assert.ok(E.act(g, 'p0', { t: 'discard', cardId: g.players[0].hand[0].id }).ok);
  assert.ok(E.act(g, 'p0', { t: 'end' }).ok);
});

t('뷰: 타인의 손패/역할 비공개', () => {
  const g = setup(5);
  give(g, g.players[1], 'beer');
  const v = E.viewFor(g, 'p0');
  const p1 = v.players.find((p) => p.id === 'p1');
  assert.strictEqual(p1.handCount, 1);
  assert.strictEqual(p1.hand, undefined);
  assert.strictEqual(p1.role, null);
  assert.strictEqual(v.players.find((p) => p.id === 'p0').role, 'sheriff');
});

t('로그: 행위자 태깅 / 조사 자동 선택 / 같은 이름 구분', () => {
  const g = E.createGame([{ id: 'a', name: '독 홀리데이' }, { id: 'b', name: '오혁' }, { id: 'c', name: '플레이어' }, { id: 'd', name: '플레이어' }]);
  assert.deepStrictEqual(g.players.map((p) => p.name).filter((x) => x.startsWith('플레이어')).sort(), ['플레이어', '플레이어 2']);
  assert.strictEqual(g.log.length, g.logWho.length);
  const sheriff = E.cur(g);
  assert.ok(g.log[1].includes(sheriff.name + '의 차례'));
  assert.deepStrictEqual(g.logWho[1], [sheriff.id]);
  assert.ok(!g.log.some((l) => l.includes('\u2063') || l.includes('\u2064')), '표식이 화면용 로그에 남으면 안 됨');
  // 조사: 받침 있음/없음
  const g2 = E.createGame([{ id: 'a', name: '독 홀리데이' }, { id: 'b', name: '오혁' }, { id: 'c', name: '가나' }, { id: 'd', name: 'Dan' }]);
  const names = g2.players.map((p) => p.name);
  const p = g2.players.find((x) => x.name === '오혁');
  g2.log.length = 0; g2.logWho.length = 0;
  g2.players.forEach((x) => { x.alive = true; });
  // 직접 로그 조사 확인
  const E2 = require('../game');
  assert.ok(names.includes('독 홀리데이'));
  assert.strictEqual(typeof E2.viewFor(g2, 'a').logWho.length, 'number');
  const J = E.josa;
  assert.strictEqual(J('가나이(가)'), '가나가');
  assert.strictEqual(J('오혁이(가)'), '오혁이');
  assert.strictEqual(J('독 홀리데이이(가)'), '독 홀리데이가');
  assert.strictEqual(J('Dan은(는)'), 'Dan는');
  assert.strictEqual(J('맥주을(를)'), '맥주를');
  assert.strictEqual(J('술통을(를)'), '술통을');
  assert.strictEqual(J('술통(으)로'), '술통으로');
  assert.strictEqual(J('맥주(으)로'), '맥주로');
  assert.strictEqual(J('칼(으)로'), '칼로');
});

t('POM: 게임이 끝난 뒤에만 계산되고, 점수 순으로 정렬되며, 아군 공격은 감점된다', () => {
  const players = Array.from({ length: 5 }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
  for (let k = 0; k < 30; k++) {
    const g = E.createGame(players);
    assert.strictEqual(E.viewFor(g, 'p0').pom, null);
    let s = 0;
    while (!g.over && s++ < 5000) { const id = actorId(g); E.act(g, id, botAction(g, E.byId(g, id))); }
    const v = E.viewFor(g, 'p0');
    assert.ok(v.pom && v.pom.ranking.length === 5);
    assert.strictEqual(v.pom.mvp, v.pom.ranking[0].id);
    for (let i = 1; i < 5; i++) assert.ok(v.pom.ranking[i - 1].score >= v.pom.ranking[i].score);
    // 승리 팀 보너스(+4)가 반영되어 있어야 한다
    for (const r of v.pom.ranking) assert.strictEqual(r.won, g.winner === E.teamOf(E.byId(g, r.id).role));
    // 다른 사람의 통계 원본이 뷰에 새지 않는다
    assert.ok(!JSON.stringify(v.players).includes('killsEnemy'));
  }
});

t('POM: 처치·피해가 없고 아군만 때린 플레이어는 기여한 플레이어보다 점수가 낮다', () => {
  const g = E.createGame(Array.from({ length: 4 }, (_, i) => ({ id: 'p' + i, name: 'P' + i })));
  const [a, b] = g.players;
  a.st.killsEnemy = 2; a.st.dealt = 4;
  b.st.killsAlly = 1; b.st.friendly = 2;
  g.over = true; g.winner = 'outlaws';
  const rk = E.pomOf(g).ranking;
  assert.strictEqual(rk[0].id, a.id);
  assert.ok(rk.find((r) => r.id === b.id).score < 0 + 6);
});

console.log(`\n${n}개 테스트 통과`);
