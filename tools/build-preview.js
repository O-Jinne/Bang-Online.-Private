'use strict';
// 서버 없이 연습 모드만 동작하는 단일 HTML 미리보기를 만듭니다. 사용법: node tools/build-preview.js <출력경로>
const fs = require('fs');
const path = require('path');
const { buildEngine } = require('../lib/engine-bundle');
const pub = path.join(__dirname, '..', 'public');
// 글꼴/아이콘을 한 파일 안에 넣는다 (폰트는 data URI)
const inlineFonts = (t) => t.replace(/url\(\/fonts\/([^)]+)\)/g, (m, f) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(pub, 'fonts', f)).toString('base64')})`);
const css = inlineFonts(fs.readFileSync(path.join(pub, 'fonts', 'hangul.css'), 'utf8')) + '\n' + inlineFonts(fs.readFileSync(path.join(pub, 'style.css'), 'utf8'));
const icons = fs.readFileSync(path.join(pub, 'icons.js'), 'utf8') + '\n' + fs.readFileSync(path.join(pub, 'portraits.js'), 'utf8');
const app = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
// 뷰어 프레임 규칙: 좌우 여백 16px 이상(안전 영역 포함)
const extra = `
.screen{padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.page{padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
@media (max-width:999px){
.hdr,.mid,.mypanel,.handwrap,.bar{padding-left:0;padding-right:0}
.hdr{padding-top:6px;padding-bottom:6px}
.mypanel{padding-top:6px;padding-bottom:6px}
.bar{padding-bottom:calc(env(safe-area-inset-bottom,0px) + 8px)}
}
`;
const html = `<title>Bang 연습 모드</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${css}
${extra}
</style>
<div id="root"></div>
<div id="sheet"></div>
<div id="ov"></div>
<div id="toast"></div>
<script>window.BANG_STANDALONE = true;</script>
<script>
${icons}
</script>
<script>
${buildEngine()}
</script>
<script>
${app}
</script>
`;
fs.writeFileSync(process.argv[2], html);
console.log('wrote', process.argv[2], Math.round(html.length / 1024) + 'KB');
