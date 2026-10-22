'use strict';
// 인물 일러스트 생성기: 16명의 캐릭터를 같은 틀(머리·어깨·표정)과 같은 팔레트로 조립해서 SVG 를 만듭니다.
// 전부 이 파일에서 직접 그린 오리지널 아트이며(외부 이미지 없음), 공식 카드의 그림과는 무관한 "서부극 전형" 인물입니다.
// 사용: node tools/build-portraits.js  → public/portraits.js (window.BANG_PORTRAITS = { id: '<svg 내부>' })
const fs = require('fs');
const path = require('path');

const INK = '#2a1a10';
const SK = { // [피부, 그늘]
  fair: ['#ecc9a0', '#cf9f74'], mid: ['#dba77a', '#bb835a'], tan: ['#c68b5c', '#a26b42'], dark: ['#9a6540', '#774a2c'],
};
const C = { // 옷·모자 팔레트 (채도를 낮춘 서부 톤)
  black: '#241d19', coal: '#3a322d', brown: '#6a4426', tanhat: '#a77d47', sand: '#cdb27a', cream: '#e6d8b0', white: '#efe6cb',
  rust: '#8e3b21', red: '#a22c1f', wine: '#6e2428', navy: '#33465c', slate: '#56646f', olive: '#5d6130', green: '#3f5d3a',
  mustard: '#bb8c2c', brass: '#c79a3b', grey: '#7a7468', ltgrey: '#b9b2a2',
};
const HAIR = { black: '#20160f', dbrown: '#3d2616', brown: '#6a4426', auburn: '#7d3f1e', blond: '#d6b062', grey: '#a8a193', white: '#ece6d6' };

const P = (d, fill, o = {}) => `<path d="${d}" fill="${fill}" stroke="${o.stroke === undefined ? INK : o.stroke}" stroke-width="${o.sw || 1.6}" stroke-linejoin="round" stroke-linecap="round"${o.op ? ` opacity="${o.op}"` : ''}/>`;
const L = (d, o = {}) => `<path d="${d}" fill="none" stroke="${o.c || INK}" stroke-width="${o.sw || 1.6}" stroke-linecap="round" stroke-linejoin="round"${o.op ? ` opacity="${o.op}"` : ''}/>`;
const E = (cx, cy, rx, ry, fill, o = {}) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${o.stroke === undefined ? INK : o.stroke}" stroke-width="${o.sw || 1.4}"/>`;
const SH = (d, op = 0.2) => `<path d="${d}" fill="#000" opacity="${op}"/>`; // 그림자 덮개
const HI = (d, op = 0.18) => `<path d="${d}" fill="#fff" opacity="${op}"/>`; // 하이라이트

// ---------- 머리 모양 ----------
const JAW = {
  round: 'M33 40 C33 28 41 24 50 24 C59 24 67 28 67 40 L67 48 C67 60 59 69 50 69 C41 69 33 60 33 48 Z',
  square: 'M33 40 C33 28 41 24 50 24 C59 24 67 28 67 40 L67 53 C67 63 60 68 50 68 C40 68 33 63 33 53 Z',
  narrow: 'M34 40 C34 28 41 24 50 24 C59 24 66 28 66 40 L66 47 C66 58 58 70 50 70 C42 70 34 58 34 47 Z',
};

// ---------- 모자 ----------
const HAT = {
  cowboy: (c, band, o = {}) => {
    const tilt = o.tilt || 0;
    return `<g transform="rotate(${tilt} 50 34)">` +
      P('M31 34 C29 21 34 11 42 10 Q50 16 58 10 C66 11 71 21 69 34 Z', c) +
      HI('M36 14 Q41 12 44 12 Q41 20 38 30 Z', 0.16) +
      P('M30.5 29.5 L69.5 29.5 L70 34.5 L30 34.5 Z', band, { sw: 1.2 }) +
      P('M12 37 C16 45 34 43 50 43 C66 43 84 45 88 37 C85 30 72 33 50 33 C28 33 15 30 12 37 Z', c) +
      L('M18 38 C28 42 40 41.5 50 41.5', { c: '#000', sw: 1, op: 0.25 }) + `</g>`;
  },
  topper: (c, band, o = {}) => {
    const h = o.tall ? 3 : 8;
    return P(`M33 ${h + 2} L67 ${h + 2} L68 33 L32 33 Z`, c) + P(`M33 ${h + 2} Q50 ${h - 3} 67 ${h + 2}`, c, { sw: 1.2 }) +
      HI(`M36 ${h + 4} L40 ${h + 4} L39 30 L35 30 Z`, 0.15) +
      P('M32.3 27 L67.7 27 L68 33 L32 33 Z', band, { sw: 1.2 }) +
      P('M22 36 C26 42 40 41 50 41 C60 41 74 42 78 36 C74 31 62 33 50 33 C38 33 26 31 22 36 Z', c);
  },
  bowler: (c, band) =>
    P('M31 34 C30 16 70 16 69 34 Z', c) + HI('M36 22 Q42 17 49 18 Q41 22 38 30 Z', 0.18) +
    P('M31 29 L69 29 L69.4 34 L30.6 34 Z', band, { sw: 1.2 }) +
    P('M24 36 C28 43 40 42 50 42 C60 42 72 43 76 36 C72 32 62 33 50 33 C38 33 28 32 24 36 Z', c),
  sombrero: (c, trim) =>
    P('M39 31 C37 18 42 6 50 4 C58 6 63 18 61 31 Z', c) + HI('M43 10 Q46 8 48 8 Q45 18 44 28 Z', 0.16) +
    P('M38.5 26 L61.5 26 L62 31 L38 31 Z', trim, { sw: 1.2 }) +
    P('M3 38 C8 48 30 45 50 45 C70 45 92 48 97 38 C90 30 70 33 50 33 C30 33 10 30 3 38 Z', c) +
    L('M9 40 C24 45 38 43.5 50 43.5 C62 43.5 76 45 91 40', { c: trim, sw: 1.6 }) +
    [14, 24, 34, 66, 76, 86].map((x) => `<circle cx="${x}" cy="${x < 50 ? 41 + (x - 14) / 40 : 41 + (86 - x) / 40}" r="1.2" fill="${trim}"/>`).join(''),
  flatcap: (c) =>
    P('M29 35 C27 24 36 18 50 19 C64 18 75 24 72 35 C62 31 38 31 29 35 Z', c) + HI('M34 25 Q42 21 50 22 Q40 26 36 32 Z', 0.16) +
    P('M50 19 C58 19 66 21 72 27', c, { sw: 0.01, stroke: 'none' }) + L('M50 20 L50 32', { c: '#000', sw: 1, op: 0.25 }) +
    P('M30 34 C42 37 58 37 71 33 C76 36 77 39 73 41 C60 44 42 44 28 40 C26 38 27 35 30 34 Z', c, { sw: 1.4 }) + `<circle cx="50" cy="19.5" r="1.6" fill="${INK}"/>`,
  beret: (c) =>
    P('M27 32 C23 20 36 12 54 13 C70 14 78 22 72 32 C66 36 40 36 27 32 Z', c) + HI('M33 20 Q42 15 52 16 Q40 20 34 27 Z', 0.16) +
    L('M52 13 L53 8', { sw: 2.2 }),
  fur: (c) => {
    let tuft = '';
    for (let i = 0; i < 8; i++) { const x = 30.5 + i * 5.1; tuft += `<path d="M${x} 34 l2.5 5 l2.5 -5" fill="${c}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`; }
    return P('M28 35 C24 17 37 8 50 8 C63 8 76 17 72 35 Z', c) + tuft + P('M29 33 C40 37 60 37 71 33 L71 36 C60 40 40 40 29 36 Z', c, { sw: 1 }) +
      L('M37 16 l3 3 M46 12 l2 4 M57 14 l-1 4 M64 20 l-3 2 M41 24 l2 2 M55 24 l2 2', { c: '#000', sw: 1.1, op: 0.35 });
  },
  lady: (c, flower) =>
    P('M30 34 C29 24 36 17 50 17 C64 17 71 24 70 34 Z', c) +
    P('M18 37 C24 44 38 42 50 42 C62 42 76 44 82 37 C77 31 64 33 50 33 C36 33 23 31 18 37 Z', c) +
    P('M30 29 L70 29 L70.3 34 L29.7 34 Z', C.wine, { sw: 1.2 }) +
    `<g>${E(66, 26, 4.6, 4.6, flower)}${E(66, 26, 1.6, 1.6, C.mustard, { sw: 0.8 })}${P('M60 28 C57 30 58 33 62 31', C.green, { sw: 1 })}</g>`,
  feathered: (c, band, feather) =>
    HAT.cowboy(c, band, { tilt: -4 }) +
    P('M70 30 C84 20 90 8 88 2 C80 6 72 16 66 28 Z', feather, { sw: 1.3 }) + L('M68 29 C78 20 84 11 87 4', { sw: 1.1 }),
};

// ---------- 머리카락 ----------
const HAIR_SHORT = (h) => P('M33 41 C32 28 40 22 50 22 C60 22 68 28 67 41 C64 33 58 29 50 29 C42 29 36 33 33 41 Z', h, { sw: 1.3 });
const HAIR_SIDES = (h) => P('M33 36 C31 40 31 46 33 50 L36 46 Z', h, { sw: 1.2 }) + P('M67 36 C69 40 69 46 67 50 L64 46 Z', h, { sw: 1.2 });
const HAIR_LONG_BACK = (h) => P('M31 38 C26 50 24 70 22 100 L78 100 C76 70 74 50 69 38 C66 24 34 24 31 38 Z', h);
const HAIR_LONG_FRONT = (h) => P('M33 40 C32 27 40 21 50 21 C60 21 68 27 67 40 C63 31 56 28 50 28 C46 33 38 33 33 40 Z', h, { sw: 1.3 }) +
  P('M33 38 C30 52 31 64 29 76 C34 72 36 60 35 46 Z', h, { sw: 1.2 }) + P('M67 38 C70 52 69 64 71 76 C66 72 64 60 65 46 Z', h, { sw: 1.2 });
const HAIR_CURLS = (h) => {
  const pts = [[31, 36], [28, 46], [29, 57], [33, 66], [69, 36], [72, 46], [71, 57], [67, 66], [38, 26], [50, 22], [62, 26], [45, 24], [56, 24]];
  return pts.map(([x, y]) => E(x, y, 5.2, 5, h, { sw: 1.2 })).join('');
};
const HAIR_BUN = (h) => P('M33 41 C32 28 40 22 50 22 C60 22 68 28 67 41 C62 33 56 30 50 30 C44 30 38 33 33 41 Z', h, { sw: 1.3 }) + E(50, 17, 8, 6.5, h, { sw: 1.3 });

// ---------- 수염 / 콧수염 ----------
const BEARD = {
  full: (h) => P('M33 46 C32 64 40 77 50 77 C60 77 68 64 67 46 C64 53 61 56 58 57.5 Q50 54.5 42 57.5 C39 56 36 53 33 46 Z', h, { sw: 1.4 }) + HI('M40 68 Q50 74 60 68 Q50 71 40 68 Z', 0.12),
  goatee: (h) => P('M44 63 C45 72 55 72 56 63 Q50 66 44 63 Z', h, { sw: 1.3 }),
  chops: (h) => P('M32 38 C30 48 31 58 36 62 L36 48 Z', h, { sw: 1.3 }) + P('M68 38 C70 48 69 58 64 62 L64 48 Z', h, { sw: 1.3 }),
  stubble: (h) => `<path d="M34 50 C35 62 42 69 50 69 C58 69 65 62 66 50 C63 57 58 60 50 60 C42 60 37 57 34 50 Z" fill="${h}" opacity="0.38"/>`,
};
const STACHE = {
  handle: (h) => P('M50 57 C46 54.5 41 55.5 39 59 C42 58 46 59.5 50 59 C54 59.5 58 58 61 59 C59 55.5 54 54.5 50 57 Z', h, { sw: 1.2 }) +
    L('M39 59 C36 58.5 35 55.5 37 53.5 M61 59 C64 58.5 65 55.5 63 53.5', { c: h, sw: 1.6 }) + L('M39 59 C36 58.5 35 55.5 37 53.5 M61 59 C64 58.5 65 55.5 63 53.5', { sw: 0.7, op: 0.7 }),
  walrus: (h) => P('M50 56.5 C44 54 37 56 36 62 C38 66 42 65 45 63 C47 62.5 49 62.5 50 63 C51 62.5 53 62.5 55 63 C58 65 62 66 64 62 C63 56 56 54 50 56.5 Z', h, { sw: 1.3 }),
  thin: (h) => P('M42 58.5 C46 56 54 56 58 58.5 C54 57.8 46 57.8 42 58.5 Z', h, { sw: 1.4 }),
  pencil: (h) => P('M42 58.5 C46 56.2 54 56.2 58 58.5 C54 58 46 58 42 58.5 Z', h, { sw: 1.4 }),
};

// ---------- 눈 / 입 ----------
function eyes({ look = 'normal', brow = HAIR.dbrown, angle = 0, white = true }) {
  let s = '';
  const eye = (x, flip) => {
    if (look === 'squint') return L(`M${x - 3.4} 46.5 Q${x} ${45} ${x + 3.4} 46.5`, { sw: 1.8 }) + `<ellipse cx="${x}" cy="47" rx="1.5" ry="0.9" fill="${INK}"/>`;
    if (look === 'closed') return L(`M${x - 3.2} 46.5 Q${x} 48.6 ${x + 3.2} 46.5`, { sw: 1.7 });
    return `<ellipse cx="${x}" cy="46.5" rx="3.3" ry="${look === 'round' ? 3 : 2.3}" fill="${white ? '#f4ead2' : '#d9c9a4'}" stroke="${INK}" stroke-width="1.1"/><circle cx="${x + (flip ? 0.4 : -0.4)}" cy="46.7" r="${look === 'round' ? 1.8 : 1.5}" fill="${INK}"/>`;
  };
  s += eye(43, 0) + eye(57, 1);
  const a = angle; // 양수: 화난 눈썹(안쪽이 내려감), 음수: 처진 눈썹
  s += P(`M38.5 ${41.6 - a * -0.4} L47 ${41.8 + a} L47 ${43.8 + a} L38.5 ${43.6 - a * -0.4} Z`, brow, { sw: 0.9 });
  s += P(`M61.5 ${41.6 - a * -0.4} L53 ${41.8 + a} L53 ${43.8 + a} L61.5 ${43.6 - a * -0.4} Z`, brow, { sw: 0.9 });
  return s;
}
function nose(shade, big) {
  return big
    ? L('M50 44 C49 50 47 54 46 56 C48 59 52 59 54 56 C52 55 51 53 51 50', { c: INK, sw: 1.4 }) + `<path d="M50 46 C49 51 47.5 54 46.5 56 C48 58 52 58 53.5 56 C51.5 54 51 50 51 46Z" fill="${shade}" opacity="0.7"/>`
    : L('M50 47 C49.5 51 48.5 54 47.5 55 C49 56.8 51.5 56.8 52.5 55', { c: INK, sw: 1.3 }) + `<path d="M50.5 47 C50 51 49.4 54 49 55.4 C50.6 56.2 51.6 56 52.2 55 C51.4 53.6 51.2 50 51.2 47Z" fill="${shade}" opacity="0.55"/>`;
}
function mouth(kind, hidden, lips) {
  if (hidden) return '';
  if (lips) return P('M44.5 60.6 Q47.5 59 50 60.2 Q52.5 59 55.5 60.6 Q50 66.2 44.5 60.6 Z', '#a8323a', { sw: 1.1 }) + L('M44.8 60.7 Q50 62.2 55.2 60.7', { sw: 0.9 });
  if (kind === 'grin') return P('M43 60.5 Q50 67 57 60.5 Q50 62.5 43 60.5 Z', '#f4ead2', { sw: 1.3 }) + L('M43 60.5 Q50 62.5 57 60.5', { sw: 1.3 });
  if (kind === 'smile') return L('M44.5 61 Q50 64.5 55.5 61', { sw: 1.5 });
  if (kind === 'smirk') return L('M45 62 Q51 63.5 56 59.5', { sw: 1.6 });
  if (kind === 'frown') return L('M44.5 63 Q50 59.8 55.5 63', { sw: 1.7 });
  if (kind === 'cigar') return L('M45 61.5 L55 61.5', { sw: 1.6 }) + P('M54 59.6 L70 56.4 L70.8 58.6 L54.6 62.2 Z', '#7b4a24', { sw: 1.1 }) + `<circle cx="71.4" cy="57.4" r="1.8" fill="#e98d2e" stroke="${INK}" stroke-width="0.8"/>`;
  return L('M45 61.8 L55 61.8', { sw: 1.6 }); // flat
}

// ---------- 몸 ----------
function body({ cloth, collar, kind = 'plain', accent, skin }) {
  let s = '';
  s += P('M8 101 C9 82 26 73 50 73 C74 73 91 82 92 101 Z', cloth);
  s += SH('M8 101 C9 82 26 73 50 73 C40 80 30 90 28 101 Z', 0.12);
  // 목
  s += P('M41 58 L59 58 L60 76 C56 80 44 80 40 76 Z', skin[0]) + SH('M41 62 Q50 70 59 62 L59 58 L41 58 Z', 0.22);
  if (kind === 'vest') {
    s += P('M32 76 L42 77 L50 100 L28 101 Z', accent) + P('M68 76 L58 77 L50 100 L72 101 Z', accent);
    s += P('M41 76 L50 92 L59 76 L56 74 L50 82 L44 74 Z', C.white, { sw: 1.3 });
  } else if (kind === 'shirt') {
    s += P('M40 74 L50 90 L60 74 L56 72 L50 80 L44 72 Z', collar, { sw: 1.3 });
  } else if (kind === 'highcollar') {
    s += P('M38 66 L62 66 L63 76 L50 82 L37 76 Z', collar) + P('M38 66 L62 66 L61 72 L39 72 Z', collar, { sw: 1.2 }) + HI('M40 67 L48 67 L47 71 L41 71 Z', 0.12);
  } else if (kind === 'stripes') {
    for (let i = 0; i < 7; i++) s += `<path d="M${14 + i * 12} 101 C${15 + i * 12} 88 ${20 + i * 10} 80 ${26 + i * 8.5} 76" stroke="${accent}" stroke-width="2.6" fill="none" opacity="0.9"/>`;
    s += P('M41 74 L50 82 L59 74 L56 72 L50 77 L44 72 Z', collar, { sw: 1.2 });
  } else if (kind === 'poncho') {
    s += P('M6 101 C8 82 28 72 50 72 C72 72 92 82 94 101 Z', cloth);
    [0, 1, 2].forEach((i) => { s += `<path d="M${9 + i * 1} ${96 - i * 6} Q50 ${88 - i * 7 - 6} ${91 - i * 1} ${96 - i * 6}" fill="none" stroke="${i === 1 ? C.mustard : accent}" stroke-width="3.2" opacity="0.95"/>`; });
    s += P('M42 72 C46 84 54 84 58 72 L56 70 C52 78 48 78 44 70 Z', skin[1], { sw: 1.2 });
  } else if (kind === 'fringe') {
    s += P('M8 101 C9 82 26 73 50 73 C74 73 91 82 92 101 Z', cloth);
    for (let i = 0; i < 9; i++) s += L(`M${14 + i * 3} ${89 + i * 0.4} l-1 ${7}`, { c: INK, sw: 0.9, op: 0.8 }) + L(`M${86 - i * 3} ${89 + i * 0.4} l1 ${7}`, { c: INK, sw: 0.9, op: 0.8 });
    s += P('M42 74 L50 96 L58 74 L55 72 L50 80 L45 72 Z', C.cream, { sw: 1.2 });
  }
  return s;
}
const NECKERCHIEF = (c) => P('M39 70 C44 76 56 76 61 70 L58 66 L42 66 Z', c) + P('M50 76 L44 88 L50 85 L56 88 Z', c, { sw: 1.3 }) + `<circle cx="50" cy="75.5" r="2.2" fill="${c}" stroke="${INK}" stroke-width="1"/>`;
const BOWTIE = (c) => P('M44 75 L36 71 L36 79 Z', c, { sw: 1.2 }) + P('M56 75 L64 71 L64 79 Z', c, { sw: 1.2 }) + E(50, 75, 2.6, 2.8, c, { sw: 1.2 });
const BANDOLIER = (belt, flip) => {
  const x1 = flip ? 92 : 8, x2 = flip ? 8 : 92;
  let s = `<path d="M${x1} 86 L${x2 === 8 ? 40 : 60} 74 L${x2 === 8 ? 46 : 54} 76 L${x1 === 92 ? 92 : 8} 96 Z" fill="${belt}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.7) / 5.4, x = x1 + (x2 === 8 ? 36 - x1 : 56 - x1) * t * 1.0, y = 90 - 15 * t;
    s += `<rect x="${x - 1.6}" y="${y - 3}" width="3.2" height="6.4" rx="1.2" fill="${C.brass}" stroke="${INK}" stroke-width="0.8" transform="rotate(${flip ? 28 : -28} ${x} ${y})"/>`;
  }
  return s;
};
const BADGE = (c) => `<g transform="translate(64 88)">${P('M0 -6 L1.8 -1.8 L6.2 -1.8 L2.6 1 L4 5.6 L0 2.8 L-4 5.6 L-2.6 1 L-6.2 -1.8 L-1.8 -1.8 Z', c, { sw: 1.1 })}</g>`;
const SPECS = () => `<g fill="none" stroke="${INK}" stroke-width="1.4"><circle cx="43" cy="46.6" r="5.4" fill="rgba(255,255,255,.18)"/><circle cx="57" cy="46.6" r="5.4" fill="rgba(255,255,255,.18)"/><path d="M48.4 46 Q50 44.8 51.6 46 M37.6 46 L33.5 44.5 M62.4 46 L66.5 44.5"/></g>`;
const BANDANA_MASK = (c) => P('M33 52 C38 54 62 54 67 52 L66 56 C62 70 56 74 50 74 C44 74 38 70 34 56 Z', c, { sw: 1.5 }) +
  `<g fill="#fff" opacity="0.55">${[[40, 60], [46, 66], [54, 62], [60, 58], [50, 58], [43, 55], [57, 68]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1"/>`).join('')}</g>` +
  P('M64 58 L74 64 L70 72 L62 66 Z', c, { sw: 1.3 });
const SCARF = (c) => P('M36 66 C42 72 58 72 64 66 L66 76 C58 82 42 82 34 76 Z', c, { sw: 1.5 }) + P('M58 74 L66 90 L58 88 L55 80 Z', c, { sw: 1.3 }) + L('M40 72 Q50 77 60 72', { c: '#000', sw: 1, op: 0.3 });
const SCAR = () => L('M58 38 L62 52', { c: '#7a2a22', sw: 1.8 }) + L('M57.5 43 l5 -1.2 M58.4 47 l5 -1.2', { c: '#7a2a22', sw: 1.1 });
const EYEPATCH = () => P('M37 44 L64 49 L64 51 L37 46 Z', INK, { sw: 0.6 }) + `<path d="M52 42 Q57 44 58 49 Q55 53 51 51 Q49 46 52 42 Z" fill="#17100b" stroke="${INK}" stroke-width="1"/>`;
const FRECKLES = () => [[40, 53], [43, 55.5], [46, 53.5], [54, 53.5], [57, 55.5], [60, 53]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.75" fill="#8c5632"/>`).join('');
const CARDS = () => ['M68 78 L78 82 L74 96 L64 92 Z|#f0e6c8|♥', 'M60 76 L70 76 L70 92 L60 92 Z|#f0e6c8|♠', 'M52 78 L62 74 L66 88 L56 92 Z|#f0e6c8|♦'].map((s) => { const [d, f] = s.split('|'); return P(d, f, { sw: 1.2 }); }).join('') +
  `<text x="65.2" y="86" font-size="9" text-anchor="middle" fill="${INK}" font-family="serif">♠</text><text x="73" y="90" font-size="8" text-anchor="middle" fill="#a22c1f" font-family="serif" transform="rotate(20 73 90)">♥</text>`;
const HORSESHOE = () => `<path d="M62 86 a5 5 0 1 1 10 0" fill="none" stroke="${C.brass}" stroke-width="2.2" stroke-linecap="round" transform="rotate(180 67 86)"/><path d="M62 86 a5 5 0 1 1 10 0" fill="none" stroke="${INK}" stroke-width="0.6" transform="rotate(180 67 86)"/>`;
const GUN_HANDLES = () => P('M12 92 L88 92 L90 100 L10 100 Z', C.brown, { sw: 1.4 }) + P('M45 90 L55 90 L55 102 L45 102 Z', C.brass, { sw: 1.2 }) +
  [25, 75].map((x) => P(`M${x - 5} 82 L${x + 5} 82 L${x + 6} 94 L${x - 4} 94 Z`, '#5b3a1e', { sw: 1.3 }) + `<circle cx="${x + 0.5}" cy="88" r="1.5" fill="${C.brass}" stroke="${INK}" stroke-width="0.6"/>`).join('');
const FUR_COLLAR = (c) => P('M26 80 C34 74 66 74 74 80 C70 92 30 92 26 80 Z', c, { sw: 1.4 });

// ---------- 인물 정의 ----------
const BG = (a, b) => ({ a, b });
const CHARS = {
  bart: { bg: BG('#e2c27d', '#b88a3f'), skin: 'fair', jaw: 'round', hair: HAIR.brown, cloth: C.olive, kind: 'shirt', collar: C.cream, look: 'normal', mouth: 'grin', angle: 0, hat: () => HAT.cowboy(C.tanhat, C.brown, { tilt: -3 }), extra: () => NECKERCHIEF(C.red), face: () => FRECKLES(), hairF: (h) => HAIR_SIDES(h) },
  blackjack: { bg: BG('#b9c9a3', '#6f8a5b'), skin: 'fair', jaw: 'narrow', hair: HAIR.black, cloth: C.black, kind: 'vest', accent: C.wine, collar: C.white, look: 'normal', mouth: 'smirk', angle: 2, hat: () => HAT.topper(C.black, C.red), stache: STACHE.thin(HAIR.black), extra: () => BOWTIE(C.red) + CARDS() },
  janet: { bg: BG('#dba37e', '#a0522d'), skin: 'mid', jaw: 'narrow', hair: HAIR.dbrown, cloth: C.cream, kind: 'shirt', collar: C.sand, look: 'normal', mouth: 'smile', lips: true, lashes: true, angle: 1.5, hairBack: (h) => HAIR_LONG_BACK(h), hairF: (h) => HAIR_LONG_FRONT(h), hat: () => HAT.cowboy(C.sand, C.brown, { tilt: 4 }), extra: () => BANDOLIER(C.brown, false) + BANDOLIER(C.brown, true) },
  elgringo: { bg: BG('#a9b4bd', '#56646f'), skin: 'mid', jaw: 'square', hair: HAIR.black, cloth: C.slate, kind: 'shirt', collar: C.ltgrey, look: 'squint', mouth: null, angle: 4, hairF: (h) => HAIR_SIDES(h), hat: () => HAT.flatcap(C.grey), mask: () => BANDANA_MASK(C.red) },
  jesse: { bg: BG('#9c8fa8', '#4d4258'), skin: 'tan', jaw: 'square', hair: HAIR.black, cloth: C.coal, kind: 'highcollar', collar: C.coal, look: 'squint', mouth: 'flat', angle: 3, beard: BEARD.stubble(HAIR.black), hat: () => HAT.cowboy(C.black, C.grey, { tilt: 0 }), extra: () => SCARF(C.grey), hairF: (h) => HAIR_SIDES(h), scar: false },
  jourdonnais: { bg: BG('#a7bcd3', '#4f6f93'), skin: 'fair', jaw: 'narrow', hair: HAIR.dbrown, cloth: C.navy, kind: 'stripes', accent: C.cream, collar: C.cream, look: 'normal', mouth: null, angle: 1, hat: () => HAT.beret(C.wine), stache: STACHE.handle(HAIR.dbrown), hairF: (h) => HAIR_SIDES(h) },
  kit: { bg: BG('#b58b5d', '#6e4524'), skin: 'tan', jaw: 'square', hair: HAIR.auburn, cloth: C.tanhat, kind: 'fringe', collar: C.cream, look: 'normal', mouth: null, angle: 1, beard: BEARD.full(HAIR.auburn), hat: () => HAT.fur(C.brown), hairF: (h) => HAIR_SIDES(h) },
  luckyduke: { bg: BG('#e0c36a', '#a77c1e'), skin: 'mid', jaw: 'round', hair: HAIR.dbrown, cloth: C.brown, kind: 'vest', accent: C.mustard, collar: C.white, look: 'round', mouth: 'cigar', angle: -1, hat: () => HAT.bowler(C.brown, C.mustard), hairF: (h) => HAIR_SIDES(h), extra: () => HORSESHOE() },
  paul: { bg: BG('#9ec3c0', '#41766f'), skin: 'dark', jaw: 'round', hair: HAIR.black, cloth: C.wine, kind: 'vest', accent: C.coal, collar: C.cream, look: 'normal', mouth: null, angle: 1, stache: STACHE.handle(HAIR.black), hat: () => HAT.topper(C.grey, C.mustard, { tall: true }), extra: () => BOWTIE(C.mustard), hairF: (h) => HAIR_SIDES(h) },
  pedro: { bg: BG('#e7b36a', '#c0722b'), skin: 'tan', jaw: 'round', hair: HAIR.black, cloth: C.rust, kind: 'poncho', accent: C.cream, collar: C.cream, look: 'normal', mouth: null, angle: 0, stache: STACHE.thin(HAIR.black), hat: () => HAT.sombrero(C.sand, C.red), hairF: (h) => HAIR_SIDES(h) },
  rose: { bg: BG('#d7a8b3', '#8a4a5e'), skin: 'fair', jaw: 'narrow', hair: HAIR.auburn, cloth: C.green, kind: 'highcollar', collar: C.cream, look: 'normal', mouth: 'smile', angle: -0.5, lips: true, lashes: true, hairBack: (h) => HAIR_LONG_BACK(h).replace('M31 38','M30 38'), hairF: (h) => HAIR_LONG_FRONT(h), hat: () => HAT.lady(C.navy, C.red), specs: true },
  sid: { bg: BG('#bfc9a0', '#6f7f4a'), skin: 'fair', jaw: 'round', hair: HAIR.white, cloth: C.coal, kind: 'vest', accent: C.slate, collar: C.white, look: 'normal', mouth: null, angle: -2, beard: BEARD.full(HAIR.white), specs: true, bald: true, hairF: (h) => P('M33 42 C31 46 32 50 34 52 L36 46 Z', h, { sw: 1.2 }) + P('M67 42 C69 46 68 50 66 52 L64 46 Z', h, { sw: 1.2 }), extra: () => BOWTIE(C.red) },
  slab: { bg: BG('#c28877', '#7a2f26'), skin: 'tan', jaw: 'square', hair: HAIR.black, cloth: C.coal, kind: 'shirt', collar: C.ltgrey, look: 'squint', mouth: 'frown', angle: 6, beard: BEARD.stubble(HAIR.black), hat: () => HAT.bowler(C.black, C.coal), scar: true, extra: () => BANDOLIER(C.brown, false), hairF: (h) => HAIR_SIDES(h) },
  suzy: { bg: BG('#c6b4d0', '#7a5a8c'), skin: 'fair', jaw: 'narrow', hair: HAIR.blond, cloth: C.wine, kind: 'highcollar', collar: C.cream, look: 'normal', mouth: 'smile', lips: true, lashes: true, angle: -1, hairBack: (h) => HAIR_CURLS(h), hat: () => HAT.feathered(C.navy, C.mustard, C.red), mole: true },
  vulture: { bg: BG('#a3ada0', '#4e5a4c'), skin: 'fair', jaw: 'narrow', hair: HAIR.grey, cloth: C.black, kind: 'highcollar', collar: C.black, look: 'squint', mouth: 'flat', angle: 4, bald: true, bigNose: true, hairF: (h) => P('M33 38 C31 44 32 50 35 54 L37 44 Z', h, { sw: 1.2 }) + P('M67 38 C69 44 68 50 65 54 L63 44 Z', h, { sw: 1.2 }), extra: () => P('M38 74 L50 90 L62 74 L66 78 L50 98 L34 78 Z', C.white, { sw: 1.3 }) },
  willy: { bg: BG('#b5ccd8', '#58809a'), skin: 'fair', jaw: 'round', hair: HAIR.blond, cloth: C.navy, kind: 'shirt', collar: C.cream, look: 'round', mouth: 'grin', angle: -1, hat: () => HAT.cowboy(C.tanhat, C.black, { tilt: 5 }), extra: () => GUN_HANDLES() + NECKERCHIEF(C.mustard), face: () => FRECKLES(), hairF: (h) => HAIR_SIDES(h) },
};

function portrait(id, d) {
  const sk = SK[d.skin];
  let s = '<defs><clipPath id="bpc"><circle cx="50" cy="50" r="50"/></clipPath></defs><g clip-path="url(#bpc)">';
  s += `<circle cx="50" cy="50" r="50" fill="${d.bg.b}"/><path d="M0 50 A50 50 0 0 1 100 50 L100 70 C70 60 30 60 0 70 Z" fill="${d.bg.a}" opacity="0.85"/>`;
  s += `<g opacity="0.18" stroke="${INK}" stroke-width="1">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<path d="M50 54 L${50 + 70 * Math.cos(i * Math.PI / 4 + 0.2)} ${54 + 70 * Math.sin(i * Math.PI / 4 + 0.2)}"/>`).join('')}</g>`; // 햇살 줄무늬
  if (d.hairBack) s += d.hairBack(d.hair);
  s += body({ cloth: d.cloth, collar: d.collar, kind: d.kind, accent: d.accent, skin: sk });
  if (d.extra && ['bart', 'janet', 'slab', 'blackjack', 'willy'].includes(id)) { /* 몸 앞쪽 장식은 얼굴 뒤에 먼저 */ s += d.extra(); }
  // 얼굴
  s += P(JAW[d.jaw], sk[0]) + E(33, 47, 3, 5, sk[0], { sw: 1.3 }) + E(67, 47, 3, 5, sk[0], { sw: 1.3 });
  s += SH(`M${d.jaw === 'narrow' ? 34 : 33} 46 C33 62 41 69 50 69 C59 69 67 62 67 46 C63 56 58 62 50 62 C42 62 37 56 33 46 Z`, 0.09);
  s += HI('M38 30 C42 26 46 26 48 27 C44 30 41 34 40 40 Z', 0.12);
  if (d.bald) { s += HI('M40 27 Q47 23 53 26 Q46 27 42 33 Z', 0.3); }
  s += eyes({ look: d.look, brow: d.bald && d.hair === HAIR.white ? HAIR.white : d.hair, angle: d.angle });
  if (d.specs) s += SPECS();
  s += nose(sk[1], d.bigNose);
  if (d.face) s += d.face();
  if (d.beard) s += d.beard;
  s += mouth(d.mouth, !d.mouth, d.lips);
  if (d.lashes) s += L('M39.6 45 l-2.6 -1.4 M40 46.6 l-3 0 M60.4 45 l2.6 -1.4 M60 46.6 l3 0', { sw: 1.3 });
  if (d.stache) s += d.stache;
  if (d.mole) s += `<circle cx="59" cy="55.5" r="1" fill="${INK}"/>`;
  if (d.scar) s += SCAR();
  if (!d.bald && d.hairF && !d.hat) s += d.hairF(d.hair);
  if (d.hairF && d.hat) s += d.hairF(d.hair);
  if (d.hairF && d.bald) s += d.hairF(d.hair);
  if (d.mask) s += d.mask();
  if (d.hat) s += d.hat();
  if (d.extra && !['bart', 'janet', 'slab', 'blackjack', 'willy'].includes(id)) s += d.extra();
  // 얼굴 위에 덮이는 모자의 그림자 (이마)
  if (d.hat) s += `<path d="M35 41 C42 43 58 43 65 41 L65 38 C58 40 42 40 35 38 Z" fill="#000" opacity="0.28"/>`;
  s += `</g><circle cx="50" cy="50" r="49" fill="none" stroke="${INK}" stroke-width="2" opacity="0.55"/>`;
  return s;
}

const out = {};
for (const [id, d] of Object.entries(CHARS)) out[id] = portrait(id, d);
const js = '// 자동 생성: tools/build-portraits.js — 오리지널 인물 일러스트 (공식 카드 그림 아님)\nwindow.BANG_PORTRAITS=' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(__dirname, '..', 'public', 'portraits.js'), js);
console.log('portraits.js', Object.keys(out).length, '명,', Math.round(js.length / 1024) + 'KB');
module.exports = { CHARS, portrait };
