'use strict';
// 디자인 소재(아이콘/폰트)를 public/ 에 만들어 넣는 개발용 스크립트. 결과물은 저장소에 포함되어 있어 보통은 실행할 필요가 없습니다.
// 사용법: node tools/build-assets.js <npm 패키지가 설치된 node_modules 경로>
//   필요 패키지: @iconify-json/game-icons (CC BY 3.0, game-icons.net), @fontsource/rye, @fontsource/special-elite, @fontsource/black-han-sans (OFL)
const fs = require('fs');
const path = require('path');
const nm = path.resolve(process.argv[2] || 'node_modules');
const pub = path.join(__dirname, '..', 'public');

// ---- 아이콘 ----
const NEED = {
  // 카드
  bang: 'revolver', missed: 'dodge', beer: 'beer-stein', panic: 'grab', catbalou: 'cat', stagecoach: 'old-wagon', wellsfargo: 'bank',
  generalstore: 'shop', gatling: 'machine-gun', indians: 'tomahawk', duel: 'crossed-pistols', saloon: 'saloon-doors', jail: 'imprisoned',
  dynamite: 'dynamite', barrel: 'barrel', scope: 'binoculars', mustang: 'horse-head',
  volcanic: 'cowboy-holster', schofield: 'revolver', remington: 'sawed-off-shotgun', carabine: 'bullets', winchester: 'winchester-rifle',
  // 역할
  r_sheriff: 'law-star', r_deputy: 'police-badge', r_outlaw: 'bandit', r_renegade: 'rattlesnake',
  // 캐릭터
  c_bart: 'cowboy-holster', c_blackjack: 'card-jack-spades', c_janet: 'crossed-pistols', c_elgringo: 'sombrero', c_jesse: 'lasso',
  c_jourdonnais: 'barrel', c_kit: 'western-hat', c_luckyduke: 'horseshoe', c_paul: 'horse-head', c_pedro: 'poncho', c_rose: 'rose',
  c_sid: 'mustache', c_slab: 'bowie-knife', c_suzy: 'feather', c_vulture: 'vulture', c_willy: 'eyepatch',
  // 장식/상태
  wanted: 'wanted-reward', tombstone: 'tombstone', cactus: 'cactus', skull: 'desert-skull', eagle: 'eagle-head', cards: 'poker-hand',
  hand: 'hand', coins: 'coins', target: 'crosshair', logo: 'law-star',
  // 화면 구성 요소
  i_menu: 'hamburger-menu', i_log: 'scroll-unfurled', i_stats: 'podium', i_rank: 'trophy-cup', i_help: 'open-book', i_share: 'share',
  i_role: 'drama-masks', i_note: 'scroll-quill', i_win: 'laurels',
};
const j = require(path.join(nm, '@iconify-json/game-icons/icons.json'));
const out = {};
for (const [k, n] of Object.entries(NEED)) {
  const i = j.icons[n] || (j.aliases && j.aliases[n] && j.icons[j.aliases[n].parent]);
  if (!i) throw new Error('아이콘 없음: ' + n);
  out[k] = i.body;
}
fs.writeFileSync(path.join(pub, 'icons.js'),
  '// 아이콘: game-icons.net (CC BY 3.0) — https://game-icons.net, 제작자: Lorc, Delapouite, Skoll 외. tools/build-assets.js 로 생성됨.\n' +
  'window.GAME_ICONS=' + JSON.stringify(out) + ';\n');
console.log('아이콘', Object.keys(out).length, '개');

// ---- 폰트 ----
const fdir = path.join(pub, 'fonts');
fs.mkdirSync(fdir, { recursive: true });
const cp = (from, to) => fs.copyFileSync(path.join(nm, '@fontsource', from), path.join(fdir, to));
cp('rye/files/rye-latin-400-normal.woff2', 'rye-latin.woff2');
cp('special-elite/files/special-elite-latin-400-normal.woff2', 'special-elite-latin.woff2');
// 한글 제목용: 앱에서 쓰는 한글 글자가 들어 있는 조각(slice)만 복사하고 unicode-range 와 함께 CSS 로 만든다.
const src = ['app.js', 'index.html'].map((f) => fs.readFileSync(path.join(pub, f), 'utf8')).join('') +
  fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
const used = new Set(); for (const ch of src) { const c = ch.codePointAt(0); if (c >= 0xac00 && c <= 0xd7a3) used.add(c); }
const css = fs.readFileSync(path.join(nm, '@fontsource/black-han-sans/400.css'), 'utf8');
const blocks = css.split('@font-face').slice(1);
let n = 0; let bytes = 0; let outCss = '';
for (const b of blocks) {
  const file = (b.match(/files\/(black-han-sans-\d+-400-normal\.woff2)/) || [])[1];
  const range = (b.match(/unicode-range:\s*([^;]+);/) || [])[1];
  if (!file || !range) continue;
  const hit = range.split(',').some((r) => {
    const m = r.trim().replace(/^U\+/, '').split('-');
    const lo = parseInt(m[0], 16); const hi = m[1] ? parseInt(m[1], 16) : lo;
    for (const c of used) if (c >= lo && c <= hi) return true;
    return false;
  });
  if (!hit) continue;
  fs.copyFileSync(path.join(nm, '@fontsource/black-han-sans/files', file), path.join(fdir, file));
  outCss += `@font-face{font-family:'Black Han Sans';font-weight:400;font-display:swap;src:url(/fonts/${file}) format('woff2');unicode-range:${range}}\n`;
  n++; bytes += fs.statSync(path.join(fdir, file)).size;
}
fs.writeFileSync(path.join(pub, 'fonts', 'hangul.css'), outCss);
console.log('한글 폰트 조각', n, '개', Math.round(bytes / 1024) + 'KB');
