'use strict';
// game.js + bot.js 를 브라우저에서 쓸 수 있는 단일 스크립트로 묶습니다 (연습 모드/미리보기용).
const fs = require('fs');
const path = require('path');

function buildEngine() {
  const root = path.join(__dirname, '..');
  const game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
  const bot = fs.readFileSync(path.join(root, 'bot.js'), 'utf8');
  return `(function(){
var __m={};
function __def(n,f){var m={exports:{}};f(m,m.exports,function(r){if(r==='./game')return __m.game;throw new Error('require '+r)});__m[n]=m.exports;}
__def('game',function(module,exports,require){
${game}
});
__def('bot',function(module,exports,require){
${bot}
});
window.BangEngine={E:__m.game,Bot:__m.bot};
})();
`;
}
module.exports = { buildEngine };
