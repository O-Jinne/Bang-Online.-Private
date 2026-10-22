'use strict';
// Bang! 모바일 클라이언트 (세로 화면 기준). 온라인(WebSocket) / 혼자 연습(브라우저 내 엔진) 두 모드를 지원합니다.
(function () {
  const STANDALONE = !!window.BANG_STANDALONE; // 서버 없이 연습 모드만 제공 (미리보기용)
  const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const RANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  // 아이콘: game-icons.net (CC BY 3.0). public/icons.js 가 window.GAME_ICONS 를 제공
  const GI = window.GAME_ICONS || {};
  const ic = (name, cls) => (GI[name] ? `<svg class="gi ${cls || ''}" viewBox="0 0 512 512" aria-hidden="true" fill="currentColor">${GI[name]}</svg>` : '');
  // 인물 일러스트: tools/build-portraits.js 가 만든 오리지널 SVG (없으면 아이콘으로 대체)
  const PORT = window.BANG_PORTRAITS || {};
  const face = (id, cls) => (PORT[id] ? `<svg class="pt ${cls || ''}" viewBox="0 0 100 100" aria-hidden="true">${PORT[id]}</svg>` : ic('c_' + id, cls));
  const ICON = new Proxy({}, { get: (_, t) => (typeof t === 'string' ? ic(t, 'sm') : '') });
  const WRANGE = { volcanic: 1, schofield: 2, remington: 3, carabine: 4, winchester: 5 };
  const EQUIP = ['barrel', 'scope', 'mustang', 'dynamite', 'jail', 'volcanic', 'schofield', 'remington', 'carabine', 'winchester'];
  const BOT_NAMES = ['클린트', '더스티', '블랙 베스', '독 홀리데이', '와이어트', '애니'];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s) => document.querySelector(s);
  const BASE_TITLE = document.title;
  const rootEl = $('#root'), sheetEl = $('#sheet'), ovEl = $('#ov'), toastEl = $('#toast');

  let ws = null, sess = null, local = null;
  try { sess = JSON.parse(localStorage.getItem('bangSess') || 'null'); } catch (e) { sess = null; }
  let you = null, room = null, game = null, result = null;
  // 기기 코드: 이 기기를 구분하는 비밀 값(로그인 대신). 기록·순위가 이 코드에 묶입니다.
  let dev = safeGet('bangDev');
  if (!/^[A-Za-z0-9]{12,40}$/.test(dev)) {
    const a = new Uint8Array(10);
    try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); }
    dev = Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
    safeSet('bangDev', dev);
  }
  let defs = { cards: {}, roles: {}, goals: {}, chars: [], needsKey: false };
  const ui = {
    sel: [], mode: null, sheet: null, discard: false, err: '', conn: false, connSince: Date.now(),
    name: safeGet('bangName'), key: safeGet('bangKey'), code: '', seenGid: null, hideOver: false, prevNeed: false, lastN: 4,
    stats: null, statsTab: 'me', speed: safeGet('bangSpeed') === '' ? 1500 : Number(safeGet('bangSpeed')), flashKey: '',
  };
  const qp = new URLSearchParams(location.search);
  if (qp.get('room')) ui.code = qp.get('room').toUpperCase().slice(0, 4);

  function safeGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  const engine = () => window.BangEngine;
  if (engine()) {
    const E = engine().E;
    defs = { cards: E.CARD_DEFS, roles: E.ROLE_NAME, goals: E.ROLE_GOAL, chars: E.CHARACTERS, needsKey: false };
  }

  // ---------- 통신 ----------
  function connect() {
    if (STANDALONE) return;
    if (ws) { ws.onopen = ws.onmessage = ws.onclose = null; try { ws.close(); } catch (e) { /* ignore */ } }
    const sock = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    ws = sock;
    sock.onopen = () => {
      ui.conn = true; ui.connSince = 0;
      renderOverlay();
      if (sess) sock.send(JSON.stringify({ type: 'resume', room: sess.room, token: sess.token }));
    };
    sock.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } handle(m); };
    sock.onclose = () => {
      if (ws !== sock) return;
      ui.conn = false; ui.connSince = ui.connSince || Date.now();
      renderOverlay();
      setTimeout(connect, 1500);
    };
  }
  let pongAt = 0;
  setInterval(() => { if (ws && ws.readyState === 1) ws.send('{"type":"ping"}'); }, 20000); // 무료 호스팅의 슬립 방지 + 연결 유지
  setInterval(() => { if (!ui.conn && !local && !STANDALONE) renderOverlay(); }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    document.title = BASE_TITLE;
    wakeLock();
    if (STANDALONE || local) return;
    // 백그라운드에서 돌아왔을 때 죽은 연결을 빠르게 감지해 즉시 재접속
    if (!ws || ws.readyState !== 1) return connect();
    const t0 = Date.now();
    ws.send('{"type":"ping"}');
    setTimeout(() => { if (pongAt < t0) { ui.conn = false; ui.connSince = Date.now(); renderOverlay(); connect(); } }, 2500);
  });

  function send(o) {
    if (local) return local.handle(o);
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(o));
  }
  function act(a) { ui.err = ''; send({ type: 'act', action: a }); }

  function handle(m) {
    switch (m.type) {
      case 'pong': pongAt = Date.now(); return;
      case 'defs': defs = Object.assign(defs, m); if (ui.pollT) send({ type: 'list' }); break;
      case 'joined':
        ui.err = '';
        sess = { room: m.room, token: m.token };
        safeSet('bangSess', JSON.stringify(sess));
        you = m.id;
        if (location.search) history.replaceState(null, '', '/');
        break;
      case 'update':
        you = m.you; room = m.room; game = m.game; result = m.result || null;
        onUpdate();
        break;
      case 'error':
        ui.err = m.msg;
        if (m.fatal) { sess = null; room = null; game = null; try { localStorage.removeItem('bangSess'); } catch (e) { /* ignore */ } }
        toast(m.msg);
        break;
      case 'stats':
        ui.stats = m;
        break;
      case 'rooms': {
        ui.rooms = m.rooms;
        const el = $('#roomlist');
        if (el) { el.innerHTML = roomListHTML(); return; } // 목록 부분만 갱신
        return;
      }
      case 'claimed':
        if (m.ok) {
          dev = m.code; safeSet('bangDev', dev);
          toast(`기록을 가져왔어요 (${m.name} · ${m.games}판)`);
          send({ type: 'stats', dev });
        } else toast('해당 기록 코드를 찾을 수 없어요');
        break;
      case 'left':
        sess = null; room = null; game = null; result = null; ui.sheet = null; ui.entry = 'multi';
        try { localStorage.removeItem('bangSess'); } catch (e) { /* ignore */ }
        break;
    }
    render();
  }

  function needsMe(g) {
    if (!g || g.over) return false;
    const pd = g.pending;
    return pd ? pd.who === you : g.turn === you && g.phase === 'play';
  }
  function onUpdate() {
    sanitizeUi();
    if (game && game.gid !== ui.seenGid) { // 새 게임: 내 역할 공개
      ui.seenGid = game.gid; ui.hideOver = false;
      ui.sheet = { type: 'role' };
      wakeLock();
    }
    const need = needsMe(game);
    if (need && !ui.prevNeed) {
      try { if (navigator.vibrate) navigator.vibrate(35); } catch (e) { /* ignore */ }
      if (document.hidden) document.title = '● 내 차례! ' + BASE_TITLE;
    }
    ui.prevNeed = need;
  }
  function sanitizeUi() {
    if (!game) { ui.mode = null; ui.sel = []; ui.discard = false; if (ui.sheet && ui.sheet.type !== 'help' && ui.sheet.type !== 'stats') ui.sheet = null; return; }
    if (!game.over) ui.hideOver = false;
    if (ui.mode && !game.legal[ui.mode.cardId]) ui.mode = null;
    const ids = new Set(game.hand.map((c) => c.id));
    ui.sel = ui.sel.filter((id) => ids.has(id));
    const m = me();
    const myTurn = game.turn === you && game.phase === 'play' && !game.pending;
    if (!myTurn || !m || game.hand.length <= m.life) ui.discard = false;
    const pd = game.pending;
    if (ui.sheet && (ui.sheet.type === 'zone' || ui.sheet.type === 'sid') && !myTurn && !(pd && pd.who === you)) ui.sheet = null;
  }

  async function wakeLock() {
    try { if (navigator.wakeLock && game && !game.over && !document.hidden) await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ }
  }
  let toastT = null;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  // ---------- 연습 모드 (브라우저 내 엔진 + 봇) ----------
  const Local = {
    g: null, timer: null, n: 4,
    start(n) {
      const { E } = engine();
      this.n = n; ui.lastN = n;
      const list = [{ id: 'me', name: ui.name || '나' }];
      for (let i = 0; i < n - 1; i++) list.push({ id: 'b' + i, name: BOT_NAMES[i], bot: true });
      this.g = E.createGame(list);
      local = this; you = 'me';
      ui.sheet = null; ui.sel = []; ui.mode = null; ui.discard = false;
      this.push(); this.sched();
    },
    handle(m) {
      const { E } = engine();
      if (m.type === 'act') {
        const r = E.act(this.g, 'me', m.action);
        if (r.error) { ui.err = r.error; toast(r.error); return render(); }
        this.push(); this.sched();
      } else if (m.type === 'next') {
        const { Bot } = engine();
        const id = Bot.actorId(this.g);
        if (!this.g.over && id && id !== 'me') {
          const act = Bot.botAction(this.g, E.byId(this.g, id));
          if (act) E.act(this.g, id, act);
          this.push(); this.sched();
        }
      } else if (m.type === 'lobby') { this.start(this.n); }
      else if (m.type === 'leave') { this.stop(); }
    },
    push() {
      const { E } = engine();
      room = { code: '연습', host: 'me', started: true, players: this.g.players.map((p) => ({ id: p.id, name: p.name, bot: p.id !== 'me', connected: true })) };
      you = 'me';
      game = E.viewFor(this.g, 'me'); result = null;
      onUpdate(); render();
    },
    sched() {
      clearTimeout(this.timer);
      const { E, Bot } = engine();
      if (this.g.over) return;
      const id = Bot.actorId(this.g);
      if (id === 'me') return;
      if (ui.speed === 0 && !window.BANG_BOT_DELAY) return; // 수동 모드: "다음"을 누를 때까지 대기
      this.timer = setTimeout(() => {
        const a = Bot.botAction(this.g, E.byId(this.g, id));
        if (a) E.act(this.g, id, a);
        this.push(); this.sched();
      }, window.BANG_BOT_DELAY || ui.speed);
    },
    nextBot() { // 수동 모드에서 지금 기다리고 있는 봇
      if (ui.speed !== 0 || window.BANG_BOT_DELAY || this.g.over) return null;
      const { Bot } = engine();
      const id = Bot.actorId(this.g);
      const p = this.g.players.find((x) => x.id === id);
      return id && id !== 'me' && p ? { id, name: p.name } : null;
    },
    stop() { clearTimeout(this.timer); local = null; ui.entry = 'home'; room = null; game = null; you = null; ui.sheet = null; ui.seenGid = null; render(); },
  };

  // PC(넓은 화면)용 레이아웃: CSS 의 @media (min-width:1000px) 와 같은 기준
  const DESK = window.matchMedia ? window.matchMedia('(min-width:1000px)') : { matches: false };
  if (DESK.addEventListener) DESK.addEventListener('change', () => { try { render(); } catch (e) { /* 아직 초기화 전 */ } });
  // ---------- 내 화면 전용: 상대 타일 순서 / 의심 표시 (서버로 보내지 않음, 이 기기에만 저장) ----------
  const MARKS = [null, ['의심', 'sus'], ['미정', 'unk'], ['믿음', 'ok']];
  const MARK_RANK = { 1: 0, 2: 1, 0: 2, 3: 3 }; // 묶기 정렬: 의심 → 미정 → 표시 없음 → 믿음
  const viewKey = () => 'bangView:' + (game ? game.gid : '');
  function loadView() {
    if (!game || ui.viewGid === game.gid) return;
    ui.viewGid = game.gid; ui.edit = false;
    let v = null; try { v = JSON.parse(safeGet(viewKey()) || 'null'); } catch (e) { v = null; }
    ui.order = (v && v.order) || []; ui.marks = (v && v.marks) || {};
    try { Object.keys(localStorage).forEach((k) => { if (k.startsWith('bangView:') && k !== viewKey()) localStorage.removeItem(k); }); } catch (e) { /* ignore */ }
  }
  function saveView() { safeSet(viewKey(), JSON.stringify({ order: ui.order, marks: ui.marks })); }
  function oppList() {
    const g = game, n = g.players.length, idx = g.players.findIndex((p) => p.id === you), opps = [];
    for (let k = 1; k < n; k++) opps.push(g.players[(idx + k) % n]);
    loadView();
    if (ui.order && ui.order.length) { const pos = (id) => { const i = ui.order.indexOf(id); return i < 0 ? 999 : i; }; opps.sort((x, y) => pos(x.id) - pos(y.id)); }
    return opps;
  }
  // ---------- 헬퍼 ----------
  const nextBot = () => (!game || game.over ? null : local ? local.nextBot() : (room && room.next) || null);
  const me = () => (game ? game.players.find((p) => p.id === you) : null);
  const pl = (id) => (game ? game.players.find((p) => p.id === id) : null);
  const nm = (id) => { const p = pl(id); return p ? esc(p.name) : '?'; };
  const cardDesc = (c) => (defs.cards[c.type] ? defs.cards[c.type].desc : '');
  const unlimitedBang = (p) => p.char === 'willy' || p.table.some((c) => c.type === 'volcanic');

  // 로그에서 이 사람이 한 가장 최근 행동(짧게)을 뽑는다. 차례 알림은 행동이 아니라서 건너뜀.
  function shortAct(line, name) {
    // 이름을 떼고 남은 조사(이미 받침에 맞게 바뀐 상태: 이/가/은/는/을/를/의)와 "(역할)" 같은 괄호 머리말을 정리
    let t = line.replace(name, '').replace(/^\s*(\([^)]*\))?\s*/, '').replace(/^(이|가|은|는|을|를|의)(?=\s|$)\s*/, '').replace(/^→\s*/, '→ ');
    return t.trim();
  }
  function lastAct(p) {
    const g = game;
    for (let i = g.log.length - 1; i >= 0; i--) {
      if (g.logWho && g.logWho[i] && g.logWho[i][0] === p.id && !g.log[i].startsWith('━━') && !g.log[i].startsWith('🏁')) {
        return { text: shortAct(g.log[i], p.name), fresh: i >= g.log.length - 3 };
      }
    }
    return null;
  }
  function historyHTML(p) {
    const g = game, rows = [];
    for (let i = g.log.length - 1; i >= 0 && rows.length < 16; i--) {
      const w = g.logWho && g.logWho[i];
      if (!w || !w.includes(p.id)) continue;
      const turn = g.log[i].startsWith('━━');
      rows.push(`<div class="h ${turn ? 'turn' : w[0] === p.id ? 'self' : 'other'}">${esc(g.log[i])}</div>`);
    }
    return rows.length ? `<div class="histbox">${rows.join('')}</div>` : '<div class="mute">아직 기록된 행동이 없어요</div>';
  }

  function pipsHTML(life, max) {
    let s = '';
    for (let i = 0; i < max; i++) s += `<span class="blt ${i < life ? '' : 'e'}"></span>`;
    return `<div class="pips">${s}</div>`;
  }
  // 장착 카드: 작은 아이콘 (무기는 사거리 숫자)
  function eqHTML(p) {
    return p.table.map((c) => `<span class="eqi" title="${esc(c.name)}">${ic(c.type, 'sm')}${WRANGE[c.type] ? `<i>${WRANGE[c.type]}</i>` : ''}</span>`).join('');
  }
  function roleChip(p, cls) {
    if (!p.role) return '';
    return `<span class="${cls} ${p.role}">${ic('r_' + p.role, 'sm')}${esc(defs.roles[p.role] || p.role)}</span>`;
  }
  function cardHTML(c, o) {
    o = o || {};
    const red = c.suit === 'H' || c.suit === 'D';
    const cls = ['card', 't-' + c.type, red ? 'red' : '', EQUIP.includes(c.type) ? 'equip' : '', o.ok ? 'ok' : '', o.use ? 'use' : '', o.sel ? 'sel' : '', o.dim ? 'dim' : ''].filter(Boolean).join(' ');
    const act = o.a ? ` data-a="${o.a}" data-v="${c.id}"` : '';
    const corner = `<span class="rk">${RANK[c.rank] || c.rank}</span><span class="su">${SUIT[c.suit]}</span>`;
    return `<div class="${cls}"${act}><div class="corner tl">${corner}</div><div class="art">${ic(c.type) || ic('cards')}${WRANGE[c.type] ? `<span class="rng">${WRANGE[c.type]}</span>` : ''}</div><div class="cn">${esc(c.name)}</div><div class="corner br">${corner}</div></div>`;
  }

  // ---------- 렌더링 ----------
  function capture() {
    const n = $('#name'); if (n) ui.name = n.value;
    const c = $('#code'); if (c) ui.code = c.value;
    const pv = $('#priv'); if (pv) ui.priv = pv.checked;
    const k = $('#key'); if (k) ui.key = k.value;
    const cl = $('#claim'); if (cl) ui.claimTxt = cl.value;
  }
  function render() {
    if (ui.dragging) { ui.dirty = true; return; } // 끄는 중에는 화면을 다시 그리지 않음 (끝나면 반영)
    capture();
    if (!room) renderEntry();
    else if (!game) renderLobby();
    else renderGame();
    syncRoomPolling();
    renderSheet();
    renderOverlay();
  }

  function renderOverlay() {
    if (STANDALONE || local || ui.conn) { ovEl.innerHTML = ''; return; }
    const waited = ui.connSince ? Date.now() - ui.connSince : 0;
    ovEl.innerHTML = `<div class="overlay"><div><div class="sp"></div><div><b>서버에 연결 중…</b></div>
      <div class="mute" style="margin-top:6px">${waited > 4000 ? '서버가 잠들어 있었다면 깨어나는 데 최대 1분 정도 걸려요.<br>잠시만 기다려 주세요.' : '&nbsp;'}</div></div></div>`;
  }

  // 첫 화면: 홈(연습 / 멀티) → 연습(인원) | 멀티(방 만들기 / 참가하기) → 참가하기(열린 방 목록)
  function renderEntry() {
    const standalone = STANDALONE;
    const canPractice = !!engine();
    if (standalone) ui.entry = 'practice';
    if (!ui.entry) ui.entry = ui.code ? 'join' : 'home'; // 초대 링크(?room=)로 열면 바로 참가 화면
    const e = ui.entry;
    const back = (to) => `<button class="ghost back" data-a="entry" data-v="${to}">‹ 뒤로</button>`;
    const nameBox = `<input id="name" placeholder="닉네임" maxlength="12" value="${esc(ui.name)}" autocomplete="off">`;
    let body = '';
    if (e === 'home') {
      body = `<div class="card-box">${nameBox}<div class="err">${esc(ui.err)}</div></div>
        <button class="mode" data-a="entry" data-v="practice" ${canPractice ? '' : 'disabled'}><b>${ic('c_vulture', 'sm')} 혼자 연습</b><span>봇과 대결 · 인원을 골라요</span></button>
        <button class="mode" data-a="entry" data-v="multi"><b>${ic('i_share', 'sm')} 멀티플레이</b><span>친구·동료와 같은 방에서 · 4~7인</span></button>`;
    } else if (e === 'practice') {
      body = `${standalone ? '' : back('home')}
        <div class="card-box">${nameBox}<div><b>혼자 연습하기</b> <span class="mute">봇과 대결 · 인원 선택</span></div>
          <div class="seg">${[4, 5, 6, 7].map((n) => `<button data-a="practice" data-v="${n}">${n}인</button>`).join('')}</div></div>`;
    } else if (e === 'multi') {
      body = `${back('home')}
        <div class="card-box">${nameBox}${defs.needsKey ? `<input id="key" type="password" placeholder="방 만들기 비밀번호" value="${esc(ui.key)}" autocomplete="off">` : ''}<div class="err">${esc(ui.err)}</div></div>
        <button class="mode" data-a="create"><b>방 만들기</b><span>내가 방장이 되어 친구를 불러요</span></button>
        <label class="chk"><input type="checkbox" id="priv" ${ui.priv ? 'checked' : ''}> 비공개 방 (목록에 안 보이고, 코드를 아는 사람만 입장)</label>
        <button class="mode" data-a="entry" data-v="join"><b>참가하기</b><span>열려 있는 방 목록에서 골라요</span></button>`;
    } else { // join
      body = `${back('multi')}
        <div class="card-box">${nameBox}<div class="err">${esc(ui.err)}</div></div>
        <div class="card-box"><div><b>열려 있는 방</b> <span class="mute">자동으로 새로고침돼요</span></div><div id="roomlist">${roomListHTML()}</div></div>
        <div class="card-box"><div class="mute" style="font-size:12px">목록에 없는 방(비공개)은 코드로 입장</div>
          <div class="row"><input id="code" placeholder="방 코드" maxlength="4" value="${esc(ui.code)}" autocapitalize="characters" autocomplete="off" style="text-transform:uppercase;letter-spacing:4px;text-align:center"><button data-a="join">입장</button></div></div>`;
    }
    rootEl.innerHTML = `
      <div class="page"><div class="col">
        <div class="logo">${ic('logo', 'logoic')}<span>BANG!</span></div>
        <div class="tagline">${standalone ? '연습 모드 (봇과 대결)' : '서부 카드 게임 · 4~7인'}</div>
        ${body}
        ${e !== 'home' || standalone || defs.records !== true ? '' : `<div class="row"><button data-a="sheetStats" data-v="me">${ic('i_stats', 'sm')} 내 기록</button><button data-a="sheetStats" data-v="board">${ic('i_rank', 'sm')} 순위</button></div>`}
        ${e === 'home' ? `<button class="ghost" data-a="sheetHelp">${ic('i_help', 'sm')} 규칙 · 카드 · 캐릭터 도움말</button>` : ''}
        <div class="conn-note">${standalone ? '' : ui.conn ? '' : '서버 연결 중…'}</div>
        <div class="desert" aria-hidden="true">${ic('cactus')}${ic('skull')}${ic('cactus')}</div>
      </div></div>`;
    syncRoomPolling();
  }
  function roomListHTML() {
    if (!ui.conn) return '<div class="mute">서버 연결 중…</div>';
    if (!ui.rooms) return '<div class="mute">불러오는 중…</div>';
    if (!ui.rooms.length) return '<div class="mute">지금 열려 있는 방이 없어요. 뒤로 가서 방을 만들어 보세요.</div>';
    return ui.rooms.map((r) => `<button class="roomrow" data-a="joinRoom" data-v="${esc(r.code)}"><span class="rc">${esc(r.code)}</span><span class="rh"><b>${esc(r.host)}</b>의 방</span><span class="rn">${r.n}/7명${r.bots ? ` · 봇 ${r.bots}` : ''}</span></button>`).join('');
  }
  // 참가하기 화면에 있는 동안만 3초마다 목록 갱신 (입력 중인 칸이 풀리지 않게 목록 부분만 다시 그림)
  function syncRoomPolling() {
    const want = !room && !local && !STANDALONE && ui.entry === 'join';
    if (want && !ui.pollT) {
      send({ type: 'list' });
      ui.pollT = setInterval(() => { if (ws && ws.readyState === 1) send({ type: 'list' }); }, 3000);
    } else if (!want && ui.pollT) { clearInterval(ui.pollT); ui.pollT = null; ui.rooms = null; }
  }

  function renderLobby() {
    const isHost = room.host === you;
    const n = room.players.length;
    rootEl.innerHTML = `
      <div class="page"><div class="col">
        <div class="tagline">방 코드 · 친구에게 공유하세요</div>
        <div class="code">${esc(room.code)}</div>
        <button data-a="share">${ic('i_share', 'sm')} 초대 링크 공유</button>
        <div class="card-box">
          <ul class="plist">
            ${room.players.map((p) => `<li><span class="grow">${esc(p.name)}${p.id === you ? ' (나)' : ''}</span>
              ${p.id === room.host ? '<span class="tag">방장</span>' : ''}
              ${p.bot ? '<span class="tag">봇</span>' : p.connected ? '' : '<span class="tag">끊김</span>'}
              ${isHost && p.id !== you ? `<button class="sm" data-a="kick" data-v="${p.id}">내보내기</button>` : ''}</li>`).join('')}
          </ul>
          <div class="mute" style="font-size:12px">${n}/7명 · 4~7명이면 시작할 수 있어요</div>
          ${isHost ? `<div class="row"><button data-a="addBot" ${n >= 7 ? 'disabled' : ''}>${ic('c_vulture', 'sm')} 봇 추가</button><button class="primary" data-a="start" ${n < 4 ? 'disabled' : ''}>게임 시작</button></div>`
        : '<div class="mute">방장이 시작하기를 기다리는 중…</div>'}
        </div>
        <button class="ghost" data-a="leave">나가기</button>
        <div class="err">${esc(ui.err)}</div>
      </div></div>`;
  }

  function bannerInfo() {
    const g = game, m = me(), pd = g.pending;
    if (g.over) return { cls: 'mine', msg: g.winner === 'sheriff' ? '게임 종료 — 보안관 팀 승리' : g.winner === 'outlaws' ? '게임 종료 — 무법자 승리' : '게임 종료 — 배신자 승리' };
    if (!m.alive) return { cls: 'wait', msg: `관전 중 — ${pd ? nm(pd.who) + '의 선택 대기' : nm(g.turn) + '의 차례'}` };
    if (ui.mode) return { cls: 'alert', msg: `대상을 선택하세요 (${esc(defs.cards[ui.mode.type].name)})` };
    if (pd && pd.who === you) {
      switch (pd.type) {
        case 'respond': return { cls: 'alert', msg: `${nm(pd.src)}의 ${pd.kind === 'gatling' ? '개틀링' : '뱅!'} — 빗나감! ${pd.need}장을 내거나 맞으세요` };
        case 'indians': return { cls: 'alert', msg: '인디언! — 뱅!을 1장 내거나 1 피해를 받습니다' };
        case 'duel': return { cls: 'alert', msg: `${nm(pd.other)}와(과) 결투 — 뱅!을 내거나 1 피해를 받습니다` };
        case 'dying': return { cls: 'alert', msg: `위기! 체력 ${m.life} — 맥주 ${pd.need}개로 버틸 수 있어요` };
        case 'store': return { cls: 'mine', msg: '잡화점 — 카드를 1장 고르세요' };
        case 'kit': return { cls: 'mine', msg: '덱 위로 되돌릴 카드를 고르세요' };
        case 'jesse': return { cls: 'mine', msg: '첫 장을 뽑을 대상을 고르세요' };
        case 'pedro': return { cls: 'mine', msg: '첫 장을 어디서 뽑을까요?' };
      }
    }
    if (pd) {
      const w = nm(pd.who);
      const txt = { respond: `${nm(pd.src)}의 ${pd.kind === 'gatling' ? '개틀링' : '뱅!'} → ${w} 응답 대기`, indians: `인디언! — ${w} 응답 대기`, duel: `결투 — ${w}의 차례`, dying: `${w} 위기!`, store: `잡화점 — ${w}이(가) 고르는 중` }[pd.type] || `${w}의 선택 대기`;
      return { cls: 'wait', msg: txt };
    }
    if (g.turn === you) {
      if (ui.discard) return { cls: 'alert', msg: `버릴 카드를 선택하세요 (${g.hand.length - m.life}장 초과)` };
      return { cls: 'mine', msg: g.hand.length > m.life ? `내 차례 — 손패가 ${g.hand.length - m.life}장 많아요 (종료 시 버림)` : '내 차례 — 카드를 골라 사용하세요' };
    }
    return { cls: 'wait', msg: `${nm(g.turn)}의 차례` };
  }

  function tileHTML(p) {
    const g = game, m = me();
    const pd = g.pending;
    const isT = ui.mode && ui.mode.targets.includes(p.id);
    const cls = ['tile', g.turn === p.id && !g.over && p.alive ? 'turn' : '', !p.alive ? 'dead' : '', isT ? 'target' : '', ui.mode && !isT && p.alive ? 'far' : '', pd && pd.who === p.id ? 'wait' : ''].filter(Boolean).join(' ');
    const inRange = p.dist != null && m && p.dist <= m.range;
    const la = lastAct(p);
    const mk = MARKS[(ui.marks || {})[p.id] || 0];
    const ctl = ui.edit && !ui.mode ? `<div class="tctl"><button data-a="mv" data-v="${p.id}|-1" aria-label="앞으로">◀</button><button data-a="mark" data-v="${p.id}" class="mkbtn ${mk ? mk[1] : ''}">${mk ? mk[0] : '표시'}</button><button data-a="mv" data-v="${p.id}|1" aria-label="뒤로">▶</button></div>` : '';
    return `<div class="${cls}${mk ? ' mk-' + mk[1] : ''}" data-a="tile" data-v="${p.id}">
      ${p.role ? `<span class="rolebadge ${p.role}" title="${esc(defs.roles[p.role])}">${ic('r_' + p.role, 'sm')}</span>` : ''}
      <div class="head"><span class="medal">${face(p.char)}</span>
        <div class="who"><div class="nm">${esc(p.name)}</div><div class="ch">${esc(p.charName)}${mk ? ` <span class="mkchip ${mk[1]}">${mk[0]}</span>` : ''}</div></div></div>
      ${p.alive ? pipsHTML(p.life, p.maxLife) : `<div class="rip">${ic('tombstone', 'sm')} 사망 · ${esc(defs.roles[p.role] || '')}</div>`}
      ${p.bot ? '<i class="bt corner-bt">BOT</i>' : ''}<div class="meta">${p.alive ? `<span>${ic('cards', 'sm')}<b>${p.handCount}</b></span>${p.dist != null ? `<span class="${inRange ? 'in' : ''}">${ic('target', 'sm')}<b>${p.dist}</b></span>` : ''}<span class="eq">${eqHTML(p)}</span>` : ''}</div>
      ${la ? `<div class="act ${la.fresh ? 'fresh' : ''}${la.fresh && flashNow ? ' flash' : ''}">${esc(la.text)}</div>` : ''}
      ${ctl}
    </div>`;
  }

  function handHTML() {
    const g = game, m = me(), pd = g.pending;
    const myTurnPlay = g.turn === you && g.phase === 'play' && !pd && !g.over;
    const n = g.hand.length;
    const cw = DESK.matches ? 112 : 84; // 카드 폭 (PC 화면은 CSS 에서 더 크게)
    const maxW = DESK.matches ? 1280 : rootEl.clientWidth >= 700 ? 560 : Infinity;
    const avail = Math.min(rootEl.clientWidth || 360, maxW) - 20;
    let ov = 6;
    if (n > 1 && n * cw + (n - 1) * 6 > avail) ov = Math.max((avail - n * cw) / (n - 1), -(cw - 54)); // 겹쳐도 카드마다 최소 54px(숫자+그림 절반+이름 일부)는 보이게, 넘치면 옆으로 스크롤
    const cards = g.hand.map((c) => {
      const use = !!(pd && pd.who === you && pd.usable && pd.usable.includes(c.id));
      const ok = (!!g.legal[c.id] && !ui.discard) || (ui.discard && myTurnPlay);
      const sel = ui.sel.includes(c.id) || (ui.mode && ui.mode.cardId === c.id);
      const dim = !ok && !use && (myTurnPlay || (pd && pd.who === you)) && !ui.discard;
      return cardHTML(c, { ok, use, sel, dim, a: 'card' });
    }).join('');
    return `<div class="hand${ov < -6 ? ' tight' : ''}" style="--ov:${ov}px">${cards || `<div class="none">${m && m.alive ? '손패 없음' : '관전 중'}</div>`}</div>`;
  }

  function barHTML() {
    const g = game, m = me(), pd = g.pending;
    const nb = nextBot();
    if (nb) return `<div class="bar"><div class="detail"><b>${esc(nb.name)}</b>의 차례예요. 준비되면 눌러서 진행하세요.</div><div class="btns"><button class="primary" data-a="next">다음 ▶</button></div></div>`;
    if (g.over || !m || !m.alive) return '';
    const myTurnPlay = g.turn === you && g.phase === 'play' && !pd;
    const selId = ui.sel[ui.sel.length - 1];
    const sc = selId != null ? g.hand.find((c) => c.id === selId) : null;
    let detail = '', btns = '';
    const canSid = m.char === 'sid' && m.life < m.maxLife && g.hand.length >= 2 && (myTurnPlay || (pd && pd.who === you));
    const sidBtn = canSid ? '<button data-a="sidOpen">시드: 2장 → 체력+1</button>' : '';
    const descOf = (c) => `<b>${esc(c.name)}</b> ${esc(cardDesc(c))}`;

    if (ui.mode) {
      const c = g.hand.find((x) => x.id === ui.mode.cardId);
      detail = c ? descOf(c) : '';
      btns = '<button data-a="cancel">취소</button>';
    } else if (pd && pd.who === you) {
      if (['respond', 'indians', 'duel', 'dying'].includes(pd.type)) {
        const need = pd.type === 'respond' ? pd.need : 1;
        const sel = ui.sel.filter((id) => pd.usable.includes(id));
        detail = sc ? descOf(sc) : pd.usable.length ? '사용할 카드를 탭하세요' : '사용할 수 있는 카드가 없어요';
        btns = `<button class="danger" data-a="take">${pd.type === 'dying' ? '포기하고 죽기' : '그냥 맞기'}</button>
          <button class="primary wide" data-a="use" ${sel.length === need ? '' : 'disabled'}>${need > 1 ? `사용 (${sel.length}/${need})` : '사용'}</button>`;
        if (sidBtn && pd.type === 'dying') btns = sidBtn + btns;
      } else if (pd.type === 'jesse') {
        detail = '첫 장을 어디서 뽑을까요?';
        btns = `<button data-a="jesse" data-v="deck">덱에서 2장</button>` + pd.targets.map((id) => `<button data-a="jesse" data-v="${id}">${nm(id)}</button>`).join('');
      } else if (pd.type === 'pedro') {
        detail = '첫 장을 어디서 뽑을까요?';
        btns = `<button data-a="pedro" data-v="discard">버린 더미 + 덱 1장</button><button data-a="pedro" data-v="deck">덱에서 2장</button>`;
      }
    } else if (myTurnPlay) {
      if (ui.discard) {
        detail = sc ? descOf(sc) : '버릴 카드를 탭하세요';
        btns = `<button data-a="cancel">취소</button><button class="danger wide" data-a="use" ${sc ? '' : 'disabled'}>버리기</button>`;
      } else {
        const legal = sc && g.legal[sc.id];
        detail = sc ? descOf(sc) + (legal ? '' : ' <span class="mute">(지금은 사용할 수 없어요)</span>') : '카드를 탭해서 선택하세요';
        const over = g.hand.length > m.life;
        btns = (sidBtn || '') + `<button data-a="endTurn" class="${legal ? '' : 'primary'}">${over ? `턴 종료 (${g.hand.length - m.life}장 버리기)` : '턴 종료'}</button>` +
          (legal ? '<button class="primary wide" data-a="use">사용</button>' : '');
      }
    } else if (sc) {
      detail = descOf(sc);
    }
    if (!detail && !btns) return '';
    return `<div class="bar">${detail ? `<div class="detail">${detail}</div>` : ''}${btns ? `<div class="btns">${btns}</div>` : ''}</div>`;
  }

  let flashNow = false;
  function renderGame() {
    const g = game, m = me();
    const fk = g.gid + ':' + g.log.length + ':' + (g.log[g.log.length - 1] || '');
    flashNow = fk !== ui.flashKey; ui.flashKey = fk; // 새 로그가 생긴 렌더에서만 반짝임
    const opps = oppList();
    const cols = opps.length <= 3 ? opps.length : opps.length === 4 ? 2 : 3;
    const b = bannerInfo();
    const recent = g.log.slice(-4);
    const bangInfo = g.turn === you && g.phase === 'play' && !g.over ? (unlimitedBang(m) ? '뱅! 무제한' : g.bangs >= 1 ? '뱅! 사용함' : '뱅! 가능') : '';
    rootEl.innerHTML = `
      <div class="screen">
        <div class="hdr">
          <button data-a="sheetMenu" aria-label="메뉴">${ic('i_menu')}</button>
          <span class="room"><span class="dot ${local || ui.conn ? '' : 'off'}"></span>${esc(room.code)}</span>
          <span class="grow"></span>
          ${g.over ? '<button data-a="showOver">결과</button>' : ''}
          <button data-a="edit" class="${ui.edit ? 'primary' : ''}" aria-label="자리 편집">정렬</button>
          <button data-a="sheetLog" aria-label="진행 로그">${ic('i_log')}</button>
        </div>
        <div class="mid">
          ${ui.edit ? `<div class="editbar"><span>칸을 <b>끌어서</b> 순서를 바꾸고(◀ ▶ 도 가능), 표시로 의심/미정/믿음을 정해요. <b>나만 보이는 설정</b>이에요.</span><span class="grow"></span><button data-a="group">의심끼리 묶기</button><button data-a="resetView">초기화</button><button class="primary" data-a="edit">완료</button></div>` : ''}
          <div class="opps${ui.edit && !ui.mode ? ' editing' : ''}" style="--c:${cols}">${opps.map(tileHTML).join('')}</div>
          <div class="banner ${b.cls}">
            <div class="msg">${b.msg}</div>
            <div class="feed">${recent.map((l, i) => `<div class="${i === recent.length - 1 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>
            <div class="sub"><span>덱 ${g.deck}</span><span class="mini">버림 ${g.discardTop ? `<span class="c">${esc(g.discardTop.name)}</span>` : '-'}</span>${bangInfo ? `<span>${bangInfo}</span>` : ''}</div>
          </div>
        </div>
        <div class="mypanel" data-a="tile" data-v="${you}">
          <div class="who">
            <div class="nm">${roleChip(m, 'rolechip')}${esc(m.name)}</div>
            <div class="sub">${esc(m.charName)} · ${esc(m.charDesc)}</div>
          </div>
          <div class="myr"><span class="medal sm">${face(m.char)}</span><div>${m.alive ? pipsHTML(m.life, m.maxLife) : '<span class="rip">' + ic('tombstone', 'sm') + ' 사망</span>'}<div class="eq">${eqHTML(m)}</div></div></div>
        </div>
        <div class="handwrap">${handHTML()}</div>
        ${barHTML() || '<div class="bar" style="padding-top:0"></div>'}
      </div>`;
    // 손패 스크롤 위치를 렌더 사이에 유지하고, 선택한 카드는 화면 안으로
    const hand = rootEl.querySelector('.hand');
    if (hand) {
      hand.scrollLeft = ui.handX || 0;
      hand.addEventListener('scroll', () => { ui.handX = hand.scrollLeft; }, { passive: true });
      const sc = hand.querySelector('.card.sel');
      if (sc) {
        const l = sc.offsetLeft, r2 = l + sc.offsetWidth; // .hand 가 position:relative 라서 offsetLeft 가 곧 손패 안 좌표
        if (l < hand.scrollLeft + 6) hand.scrollLeft = Math.max(0, l - 8);
        else if (r2 > hand.scrollLeft + hand.clientWidth - 6) hand.scrollLeft = r2 - hand.clientWidth + 8;
        ui.handX = hand.scrollLeft;
      }
    }
  }

  // ---------- 바텀 시트 ----------
  function sheetFrame(title, body, closable) {
    const c = closable !== false;
    return `<div class="backdrop" data-a="${c ? 'closeSheet' : 'noop'}"><div class="sheet"><h3>${title}${c ? '<button class="x ghost" data-a="closeSheet">×</button>' : ''}</h3>${body}</div></div>`;
  }
  function currentSheet() {
    const g = game;
    if (g && !g.over) {
      const pd = g.pending;
      if (pd && pd.who === you && pd.type === 'store') return { type: 'store' };
      if (pd && pd.who === you && pd.type === 'kit') return { type: 'kit' };
    }
    if (g && g.over && !ui.hideOver) return { type: 'over' };
    return ui.sheet;
  }
  let lastSheetKey = '', lastSheetHtml = '';
  function renderSheet() {
    const s = currentSheet();
    if (!s) { sheetEl.innerHTML = ''; lastSheetKey = ''; lastSheetHtml = ''; return; }
    const key = JSON.stringify(s) + (game ? game.gid : '');
    if (s.type === 'help' && key === lastSheetKey && sheetEl.firstChild) return; // 도움말은 펼침 상태 유지
    const old = sheetEl.querySelector('.sheet');
    const top = old && key === lastSheetKey ? old.scrollTop : 0;
    const lb = sheetEl.querySelector('.logbox');
    const lbTop = lb && key === lastSheetKey ? lb.scrollTop : -1;
    const lbAtBottom = lb ? lb.scrollHeight - lb.scrollTop - lb.clientHeight < 30 : true;
    const same = key === lastSheetKey && sheetEl.firstChild;
    let html = sheetBody(s);
    if (same) html = html.replace('class="sheet"', 'class="sheet still"'); // 같은 시트가 갱신될 때는 다시 슬라이드 애니메이션을 하지 않음
    if (same && html === lastSheetHtml) return;
    lastSheetHtml = html;
    sheetEl.innerHTML = html;
    lastSheetKey = key;
    const sh = sheetEl.querySelector('.sheet');
    if (sh) sh.scrollTop = top;
    const lb2 = sheetEl.querySelector('.logbox');
    if (lb2) lb2.scrollTop = lbTop >= 0 && !lbAtBottom ? lbTop : lb2.scrollHeight;
  }

  function sheetBody(s) {
    const g = game;
    switch (s.type) {
      case 'store': {
        const pd = g.pending;
        return sheetFrame('잡화점 — 1장을 고르세요', `<div class="cards">${pd.cards.map((c) => cardHTML(c, { ok: true, a: 'storePick' })).join('')}</div>`, false);
      }
      case 'kit': {
        const pd = g.pending;
        return sheetFrame('키트 칼슨 — 덱 위로 되돌릴 카드', `<div class="mute">고른 1장은 덱 위로 돌아가고, 나머지 2장은 손패가 됩니다.</div><div class="cards">${pd.cards.map((c) => cardHTML(c, { ok: true, a: 'kitPick' })).join('')}</div>`, false);
      }
      case 'over': {
        const w = g.winner === 'sheriff' ? '보안관 팀 승리' : g.winner === 'outlaws' ? '무법자 승리' : '배신자 승리';
        const iWon = (() => { const m = me(); if (!m) return false; return (g.winner === 'sheriff' && (m.role === 'sheriff' || m.role === 'deputy')) || (g.winner === 'outlaws' && m.role === 'outlaw') || (g.winner === 'renegade' && m.role === 'renegade'); })();
        const host = room.host === you;
        const btns = local
          ? '<div class="row"><button data-a="leave">나가기</button><button class="primary" data-a="again">다시 하기</button></div>'
          : host ? '<div class="row"><button data-a="closeOver">보드 보기</button><button class="primary" data-a="toLobby">대기실로</button></div>'
            : '<div class="row"><button data-a="closeOver">보드 보기</button></div><div class="mute" style="margin-top:6px">방장이 대기실로 돌아갈 때까지 기다려 주세요.</div>';
        const rows = result && result.recorded ? result.rows : [];
        const rowOf = (id) => rows.find((r) => r.id === id);
        const dtxt = (r) => `<span class="${r.delta >= 0 ? 'up' : 'down'}">${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(1)}</span>`;
        const myRow = rowOf(you);
        let note = '';
        if (!local && !STANDALONE && defs.records === true) {
          if (myRow) note = `<div class="item ratebox"><div><b>레이팅</b> ${Math.round(myRow.before)} → <b>${Math.round(myRow.after)}</b> (${dtxt(myRow)})${myRow.provisional ? ' <span class="tag">초반 보정</span>' : ''}</div>
            <div class="mute" style="font-size:12px">이 역할의 기대 승률 ${myRow.expected}% — ${myRow.delta >= 0 ? '기대보다 잘했어요' : '기대보다 못했어요'}</div></div>`;
          else if (result && !result.recorded) {
            const why = result.reason === 'few-humans' || result.reason === 'no-humans' ? `기록은 사람이 ${result.need || 2}명 이상 참여한 판만 반영돼요.` : result.reason === 'error' ? '기록 중 오류가 발생했어요.' : '이 판은 기록되지 않았어요.';
            note = `<div class="mute" style="margin:6px 0;font-size:12px">${ic('i_note', 'sm')} ${why}</div>`;
          }
        }
        const pom = g.pom;
        const byId = (id) => g.players.find((p) => p.id === id);
        const top = pom && byId(pom.mvp);
        const topRow = pom && pom.ranking[0];
        const pomHTML = top ? `<div class="pom"><span class="medal lg">${face(top.char)}</span><div class="pb"><div class="pl">${ic('i_win', 'sm')} POM · 이번 판 MVP</div>
          <div class="pn">${esc(top.name)}${top.bot ? ' <span class="bt">BOT</span>' : ''}${top.id === you ? ' <span class="mute">(나)</span>' : ''}</div>
          <div class="mute">${esc(top.charName)} · ${esc(defs.roles[top.role])} · <b class="sc">${topRow.score}점</b></div>
          <div class="tags">${topRow.tags.slice(0, 4).map((t) => `<span>${esc(t)}</span>`).join('')}</div></div></div>` : '';
        const rankHTML = pom ? pom.ranking.map((r, k) => { const p = byId(r.id); return `<div class="item rk ${r.won ? 'won' : ''}"><span class="no">${k + 1}</span><span class="medal xs">${face(p.char)}</span><div class="rb"><div><b>${esc(p.name)}</b> <span class="mute">${esc(defs.roles[p.role])} · ${esc(p.charName)} ${p.alive ? '· 생존' : '· 사망'}</span></div><div class="mute" style="font-size:11.5px">${esc(r.tags.slice(0, 3).join(' · ') || '기록할 활약 없음')}</div></div><span class="grow"></span><span class="ps">${r.score}</span>${r.won ? '<span class="tag">승</span>' : ''}</div>`; }).join('') : '';
        return sheetFrame(`${iWon ? ic('i_win') + ' ' : ''}${w}`, `${note}${pomHTML}<div class="list">${rankHTML}</div><div class="mute" style="font-size:11px;margin:6px 0">POM 점수 = 적 처치·가한 피해·방어·맥주 + 생존/승리 보너스 − 아군 공격</div>${btns}`, false);
      }
      case 'role': {
        const m = me();
        return sheetFrame('내 역할', `<div class="poster ${m.role}"><div class="pt">${m.role.toUpperCase()}</div><div class="pic">${ic('r_' + m.role)}</div><div class="rn">${esc(defs.roles[m.role])}</div>
          <div class="goal">${esc(defs.goals[m.role] || '')}</div></div>
          <div class="item charcard" style="margin-top:8px"><span class="medal lg">${face(m.char)}</span><div><b>${esc(m.charName)}</b> <span class="mute">체력 ${m.maxLife}</span><div>${esc(m.charDesc)}</div></div></div>
          <div class="mute" style="margin:8px 0">보안관은 ${esc(g.players.find((p) => p.role === 'sheriff').name)}님입니다. 다른 사람의 역할은 숨겨져 있어요.</div>
          <button class="primary" style="width:100%" data-a="closeSheet">확인</button>`);
      }
      case 'player': {
        const p = pl(s.id);
        if (!p) return '';
        const isMe = p.id === you;
        const eq = p.table.length ? p.table.map((c) => `<div class="item"><b>${ICON[c.type] || ''} ${esc(c.name)}</b> <span class="mute">${SUIT[c.suit]}${RANK[c.rank] || c.rank}</span><div class="mute">${esc(cardDesc(c))}</div></div>`).join('') : '<div class="mute">장착한 카드 없음</div>';
        return sheetFrame(`${esc(p.name)} ${p.role ? `<span class="tag role-${p.role}">${ic('r_' + p.role, 'sm')}${esc(defs.roles[p.role])}</span>` : ''}`, `
          <div class="item charcard"><span class="medal lg">${face(p.char)}</span><div><b>${esc(p.charName)}</b> ${pipsHTML(p.life, p.maxLife)}<div>${esc(p.charDesc)}</div></div></div>
          <div class="item">
          <div class="mute" style="margin-top:4px">손패 ${p.handCount}장 · 사거리 ${p.range}${p.dist != null ? ` · 나와의 거리 ${p.dist}` : ''}</div></div>
          <div class="list">${eq}</div>
          <div class="sub">최근 행동 · 관련 기록 (최신순)</div>${historyHTML(p)}
          ${isMe && p.role ? `<div class="item"><b>목표</b> ${esc(defs.goals[p.role] || '')}</div>` : ''}`);
      }
      case 'log':
        return sheetFrame('진행 로그', `<div class="logbox">${g.log.map((l, i) => `<div class="${i >= g.log.length - 3 ? 'hl' : ''}">${esc(l)}</div>`).join('')}</div>`);
      case 'menu': {
        const online = !local && !STANDALONE;
        return sheetFrame('메뉴', `<div class="list">
          <button data-a="sheetHelp">${ic('i_help', 'sm')} 도움말 (규칙 · 카드 · 캐릭터)</button>
          <button data-a="sheetRole">${ic('i_role', 'sm')} 내 역할 / 목표 보기</button>
          <div class="item"><div style="margin-bottom:6px"><b>봇 진행 속도</b> <span class="mute" style="font-size:12px">${online && room.host !== you ? '방장이 정해요' : '\'직접\'은 상대 차례마다 다음을 눌러 진행해요'}</span></div>
            <div class="seg">${[[2600, '느리게'], [1500, '보통'], [600, '빠르게'], [0, '직접']].map(([ms, t]) => `<button class="${(online ? room.delay : ui.speed) === ms ? 'primary' : ''}" data-a="speed" data-v="${ms}" ${online && room.host !== you ? 'disabled' : ''}>${t}</button>`).join('')}</div></div>
          ${online ? `<button data-a="share">${ic('i_share', 'sm')} 초대 링크 공유</button>${defs.records === true ? `<button data-a="sheetStats" data-v="me">${ic('i_stats', 'sm')} 내 기록 · 순위</button>` : ''}` : ''}
          ${local || g.over ? '<button class="danger" data-a="leave">게임 나가기</button>' : '<div class="mute" style="font-size:12px">진행 중에는 나갈 수 없어요. 앱을 닫아도 다시 열면 이어서 할 수 있고, 45초 이상 비우면 봇이 대신 둬요.</div>'}
        </div>`);
      }
      case 'help': {
        const cards = Object.entries(defs.cards).map(([t, c]) => `<div>${ICON[t] || ''} <b>${esc(c.name)}</b> — ${esc(c.desc)}</div>`).join('');
        const chars = (defs.chars || []).map((c) => `<div><span class="medal xs">${face(c.id)}</span> <b>${esc(c.name)}</b> (체력 ${c.life}) — ${esc(c.desc)}</div>`).join('');
        const roles = Object.entries(defs.goals || {}).map(([r, t]) => `<div><b>${esc(defs.roles[r])}</b> — ${esc(t)}</div>`).join('');
        return sheetFrame('도움말', `
          <details open><summary>내 차례 진행</summary><div class="in">
            <div>1. 덱에서 카드 2장을 뽑습니다. (다이너마이트/감옥 판정이 먼저)</div>
            <div>2. 원하는 만큼 카드를 사용합니다. <b>뱅!은 턴당 1번</b> (볼캐닉 장착·윌리는 무제한)</div>
            <div>3. 턴 종료 시 손패가 현재 체력보다 많으면 초과분을 버립니다.</div></div></details>
          <details><summary>거리와 사거리</summary><div class="in">
            <div>상대 타일의 <b>거리</b>는 좌석 기준 가까운 쪽 거리에 조준경(-1) / 야생마(+1)를 반영한 값입니다.</div>
            <div>뱅!은 <b>거리 ≤ 내 무기 사거리</b>일 때만 쓸 수 있고(기본 1), 패닉!은 거리 1 이내만 가능합니다. 사거리 안의 상대는 거리 숫자가 초록색으로 표시돼요.</div></div></details>
          <details><summary>역할과 승리 조건</summary><div class="in">${roles}
            <div>무법자를 처치하면 3장 뽑고, 보안관이 부관을 처치하면 보안관은 모든 카드를 버립니다.</div></div></details>
          <details><summary>카드 목록</summary><div class="in">${cards}</div></details>
          <details><summary>캐릭터 목록</summary><div class="in">${chars}</div></details>
          <div class="mute" style="font-size:11px;margin-top:10px">아이콘: game-icons.net (CC BY 3.0, Lorc · Delapouite · Skoll 외) · 인물 일러스트: 이 프로젝트에서 직접 그린 오리지널(공식 카드 그림 아님) · 글꼴: Rye, Special Elite, Black Han Sans (SIL OFL)</div>`);
      }
      case 'stats': return statsSheet();
      case 'zone': {
        const t = pl(s.target);
        const cname = defs.cards[s.card].name;
        return sheetFrame(`${esc(cname)} — ${esc(t.name)}의 카드`, `<div class="list">
          ${t.handCount ? `<button data-a="zonePick" data-v="hand">${ic('hand', 'sm')} 손패 (무작위 1장 · ${t.handCount}장 중)</button>` : ''}
          ${t.table.map((c) => `<button data-a="zonePick" data-v="${c.id}">${ICON[c.type] || ''} ${esc(c.name)} (${SUIT[c.suit]}${RANK[c.rank] || c.rank})</button>`).join('')}</div>`);
      }
      case 'sid':
        return sheetFrame('시드 케첨 — 버릴 카드 2장', `<div class="cards">${g.hand.map((c) => cardHTML(c, { ok: true, sel: s.sel.includes(c.id), a: 'sidToggle' })).join('')}</div>
          <button class="primary" style="width:100%" data-a="sidConfirm" ${s.sel.length === 2 ? '' : 'disabled'}>체력 +1 (${s.sel.length}/2)</button>`);
    }
    return '';
  }

  function statsSheet() {
    const st = ui.stats, tab = ui.statsTab;
    const tabs = `<div class="seg" style="margin-bottom:8px">${[['me', '내 기록'], ['board', '순위'], ['diff', '역할 난이도']].map(([k, t]) => `<button class="${tab === k ? 'primary' : ''}" data-a="statsTab" data-v="${k}">${t}</button>`).join('')}</div>`;
    if (!st) return sheetFrame('기록', `${tabs}<div class="mute">불러오는 중…</div>`);
    const R = (r) => esc(defs.roles[r] || r);
    let body = '';
    if (tab === 'me') {
      const p = st.me;
      if (!p) body = `<div class="item">아직 기록이 없어요. 사람 ${defs.minHumans || 2}명 이상이 함께한 판이 끝나면 여기에 쌓여요.</div>`;
      else {
        const wr = p.games ? Math.round((p.wins / p.games) * 100) : 0;
        const roles = Object.entries(p.roles).sort((a, b) => b[1].g - a[1].g).map(([r, v]) => `<tr><td>${R(r)}</td><td>${v.g}판</td><td>${v.w}승</td><td>${Math.round((v.w / v.g) * 100)}%</td></tr>`).join('');
        const chars = p.chars.map((c) => { const d = (defs.chars || []).find((x) => x.id === c.id); return `<tr><td>${esc(d ? d.name : c.id)}</td><td>${c.g}판</td><td>${c.w}승</td><td>${Math.round((c.w / c.g) * 100)}%</td></tr>`; }).join('');
        const hist = p.hist.map((h) => `<div class="hrow"><span>${h.won ? '승' : '패'}</span><span>${R(h.role)} · ${h.n}인</span><span class="grow"></span><span class="${h.d >= 0 ? 'up' : 'down'}">${h.d >= 0 ? '+' : ''}${h.d.toFixed(1)}</span><span class="mute">${Math.round(h.r)}</span></div>`).join('');
        body = `<div class="item bigrate"><div class="mute">${esc(p.name)}</div><div class="big">${p.rating}</div>
            <div class="mute">${p.rank ? `${p.total}명 중 ${p.rank}위` : ''}${p.provisional ? ' · 초반 보정 중' : ''}</div></div>
          <div class="item">${p.games}판 · ${p.wins}승 (${wr}%) · 처치 ${p.kills}명</div>
          ${roles ? `<div class="sub">역할별</div><table class="tbl">${roles}</table>` : ''}
          ${chars ? `<div class="sub">자주 쓴 캐릭터</div><table class="tbl">${chars}</table>` : ''}
          ${hist ? `<div class="sub">최근 경기 (변동 · 레이팅)</div><div class="list">${hist}</div>` : ''}`;
      }
      body += `<div class="sub">내 기록 코드</div>
        <div class="item"><div class="devcode">${esc(dev)}</div>
        <div class="mute" style="font-size:12px;margin:4px 0">이 코드가 곧 내 계정이에요. 남에게 알려주지 마세요. 주소가 바뀌거나 다른 기기로 옮길 때, 기록을 보관한 서버에서 이 코드를 입력하면 이어서 쓸 수 있어요.</div>
        <div class="row"><button class="sm" data-a="copyDev">코드 복사</button></div></div>
        <div class="item"><div class="mute" style="font-size:12px;margin-bottom:4px">다른 기기의 기록 코드 가져오기 (지금 기기의 코드가 바뀝니다)</div>
        <div class="row"><input id="claim" placeholder="기록 코드" value="${esc(ui.claimTxt || '')}" autocomplete="off" autocapitalize="off"><button class="sm" data-a="claim">가져오기</button></div></div>
        ${st.persistent === false ? '<div class="mute" style="font-size:12px">주의: 서버가 파일에 저장하지 못하는 환경이라 서버가 재시작되면 기록이 사라져요.</div>' : ''}`;
    } else if (tab === 'board') {
      body = st.board.length ? `<div class="list">${st.board.map((r) => `<div class="item hrow ${r.me ? 'meRow' : ''}"><b>${r.rank}</b><span class="grow">${esc(r.name)}${r.me ? ' (나)' : ''}${r.provisional ? ' <span class="tag">보정</span>' : ''}</span><span class="mute">${r.games}판 ${Math.round((r.wins / r.games) * 100)}%</span><b>${r.rating}</b></div>`).join('')}</div>`
        : '<div class="item">아직 순위가 없어요.</div>';
    } else {
      const rows = Object.keys(st.diff).sort().map((n) => `<div class="item"><b>${n}인</b><div class="diffrow">${Object.entries(st.diff[n]).map(([r, v]) => `<span>${R(r)} <b>${v.p}%</b><i class="mute"> ${v.g}판</i></span>`).join('')}</div></div>`).join('');
      body = `<div class="mute" style="font-size:12px;margin-bottom:6px">역할마다 이기기 쉬운 정도가 달라요. 레이팅은 "이 역할의 평균 승률"을 기준으로 계산해서, 어려운 역할로 이기면 더 많이 오르고 쉬운 역할로 지면 더 많이 내려가요. 처음엔 봇 시뮬레이션으로 추정한 값이고, 판이 쌓일수록 실제 결과(괄호 속 판수)가 반영돼요.</div><div class="list">${rows}</div>`;
    }
    return sheetFrame('기록', tabs + body);
  }

  // ---------- 액션 ----------
  function nameOk() {
    ui.name = ($('#name') ? $('#name').value : ui.name).trim();
    safeSet('bangName', ui.name);
    if (!ui.name) { ui.err = '닉네임을 입력하세요.'; render(); return false; }
    return true;
  }
  const App = {
    noop() {},
    create() {
      if (!nameOk()) return;
      if ($('#key')) { ui.key = $('#key').value; safeSet('bangKey', ui.key); }
      if ($('#priv')) ui.priv = $('#priv').checked;
      ui.err = ''; send({ type: 'create', name: ui.name, key: ui.key, dev, private: !!ui.priv });
    },
    join() {
      if (!nameOk()) return;
      const code = ($('#code').value || '').trim().toUpperCase();
      if (!code) { ui.err = '방 코드를 입력하세요.'; return render(); }
      ui.err = ''; send({ type: 'join', name: ui.name, room: code, dev });
    },
    entry(to) { capture(); ui.err = ''; ui.entry = to; if (to !== 'join') ui.code = ui.code; render(); },
    joinRoom(code) {
      if (!nameOk()) return;
      ui.err = ''; send({ type: 'join', name: ui.name, room: String(code).toUpperCase(), dev });
    },
    practice(n) { if (!($('#name') && $('#name').value.trim())) { ui.name = ui.name || '나'; } else { ui.name = $('#name').value.trim(); safeSet('bangName', ui.name); } Local.start(Number(n)); },
    again() { Local.start(Local.n); },
    addBot() { send({ type: 'addBot' }); },
    kick(id) { send({ type: 'kick', id }); },
    start() { ui.err = ''; if (safeGet('bangSpeed') !== '') send({ type: 'speed', ms: ui.speed }); send({ type: 'start' }); }, // 방장이 정해 둔 속도를 방에 적용
    next() { send({ type: 'next' }); },
    leave() { ui.sheet = null; if (local) Local.stop(); else send({ type: 'leave' }); },
    toLobby() { send({ type: 'lobby' }); },
    closeOver() { ui.hideOver = true; render(); },
    showOver() { ui.hideOver = false; ui.sheet = null; render(); },
    async share() {
      const url = location.origin + '/?room=' + (room ? room.code : '');
      const text = `Bang! 같이 해요. 방 코드: ${room ? room.code : ''}`;
      try { if (navigator.share) { await navigator.share({ title: 'Bang!', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(url); toast('초대 링크를 복사했어요'); } catch (e) { toast(url); }
    },

    sheetMenu() { ui.sheet = { type: 'menu' }; render(); },
    sheetLog() { ui.sheet = { type: 'log' }; render(); },
    sheetHelp() { ui.sheet = { type: 'help' }; render(); },
    sheetRole() { ui.sheet = { type: 'role' }; render(); },
    closeSheet() { ui.sheet = null; render(); },
    speed(ms) {
      ms = Number(ms);
      if (local || STANDALONE) { ui.speed = ms; safeSet('bangSpeed', String(ms)); if (local) local.sched(); render(); } else { ui.speed = ms; safeSet('bangSpeed', String(ms)); send({ type: 'speed', ms }); }
    },
    sheetStats(tab) { ui.statsTab = tab || 'me'; ui.sheet = { type: 'stats' }; send({ type: 'stats', dev }); render(); },
    statsTab(tab) { ui.statsTab = tab; render(); },
    async copyDev() { try { await navigator.clipboard.writeText(dev); toast('기록 코드를 복사했어요'); } catch (e) { toast(dev); } },
    claim() {
      const v = ($('#claim') ? $('#claim').value : '').trim();
      if (!/^[A-Za-z0-9]{12,40}$/.test(v)) return toast('코드 형식이 올바르지 않아요');
      if (v === dev) return toast('이미 이 기기의 코드예요');
      send({ type: 'claim', code: v });
    },

    edit() { ui.edit = !ui.edit; ui.mode = null; render(); },
    mv(v) {
      const [id, d] = String(v).split('|'); const list = oppList().map((p) => p.id);
      const i = list.indexOf(id), j = i + Number(d);
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]]; ui.order = list; saveView(); render();
    },
    mark(id) { ui.marks = ui.marks || {}; ui.marks[id] = ((ui.marks[id] || 0) + 1) % MARKS.length; saveView(); render(); },
    group() {
      const list = oppList(); const mk = (p) => (ui.marks || {})[p.id] || 0;
      list.sort((x, y) => MARK_RANK[mk(x)] - MARK_RANK[mk(y)]); // 안정 정렬: 같은 표시끼리는 현재 순서 유지
      ui.order = list.map((p) => p.id); saveView(); render();
    },
    resetView() { ui.order = []; ui.marks = {}; saveView(); render(); },
    tile(id) {
      if (ui.mode && ui.mode.targets.includes(id)) return App.pickTarget(id);
      ui.sheet = { type: 'player', id }; render();
    },
    card(id) {
      id = Number(id);
      const pd = game.pending;
      if (ui.mode) ui.mode = null;
      if (pd && pd.who === you && pd.type === 'respond' && pd.need > 1 && pd.usable.includes(id)) {
        ui.sel = ui.sel.includes(id) ? ui.sel.filter((x) => x !== id) : ui.sel.concat(id);
      } else {
        ui.sel = ui.sel.length === 1 && ui.sel[0] === id ? [] : [id];
      }
      render();
    },
    use() {
      const g = game, pd = g.pending;
      if (pd && pd.who === you) {
        const need = pd.type === 'respond' ? pd.need : 1;
        const ids = ui.sel.filter((id) => pd.usable.includes(id));
        if (ids.length !== need) return;
        ui.sel = [];
        return act({ t: 'respond', cardIds: ids });
      }
      const id = ui.sel[0];
      if (id == null) return;
      if (ui.discard) { ui.sel = []; return act({ t: 'discard', cardId: id }); }
      const opt = g.legal[id];
      if (!opt) return;
      const card = g.hand.find((c) => c.id === id);
      if (!opt.targets) { ui.sel = []; return act({ t: 'play', cardId: id }); }
      const zone = card.type === 'panic' || card.type === 'catbalou';
      if (opt.targets.length === 1 && !zone) { ui.sel = []; return act({ t: 'play', cardId: id, target: opt.targets[0] }); }
      ui.mode = { cardId: id, targets: opt.targets, type: card.type };
      ui.sel = [];
      render();
    },
    pickTarget(tid) {
      const md = ui.mode;
      if (!md) return;
      if (md.type === 'panic' || md.type === 'catbalou') { ui.sheet = { type: 'zone', card: md.type, target: tid, cardId: md.cardId }; return render(); }
      ui.mode = null;
      act({ t: 'play', cardId: md.cardId, target: tid });
    },
    zonePick(zone) {
      const s = ui.sheet;
      ui.sheet = null; ui.mode = null;
      act({ t: 'play', cardId: s.cardId, target: s.target, targetCard: zone === 'hand' ? 'hand' : Number(zone) });
    },
    cancel() { ui.mode = null; ui.discard = false; ui.sel = []; render(); },
    endTurn() {
      const m = me();
      if (game.hand.length > m.life) { ui.discard = true; ui.mode = null; ui.sel = []; render(); return; }
      ui.sel = [];
      act({ t: 'end' });
    },
    take() { ui.sel = []; act({ t: 'respond', take: true }); },
    storePick(id) { act({ t: 'choose', cardId: Number(id) }); },
    kitPick(id) { act({ t: 'choose', cardId: Number(id) }); },
    jesse(target) { act({ t: 'choose', target }); },
    pedro(source) { act({ t: 'choose', source }); },
    sidOpen() { ui.sheet = { type: 'sid', sel: [] }; render(); },
    sidToggle(id) {
      id = Number(id);
      const s = ui.sheet.sel;
      ui.sheet.sel = s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? s.concat(id) : s;
      render();
    },
    sidConfirm() { const ids = ui.sheet.sel.slice(); ui.sheet = null; act({ t: 'sid', cardIds: ids }); },
  };
  window.App = App;

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    if (el.classList.contains('backdrop') && e.target !== el) return; // 시트 내부 클릭은 닫지 않음
    const fn = App[el.dataset.a];
    if (fn) fn(el.dataset.v);
  });

  // 상대 칸 끌어서 순서 바꾸기 (편집 모드, 터치·마우스 공통)
  (function setupDrag() {
    let d = null, swallowUntil = 0;
    document.addEventListener('pointerdown', (e) => {
      if (!ui.edit || ui.mode || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const el = e.target.closest && e.target.closest('.opps.editing .tile');
      if (!el || e.target.closest('button')) return;
      const r0 = el.getBoundingClientRect();
      d = { el, id: el.dataset.v, x0: e.clientX, y0: e.clientY, gx: e.clientX - r0.left, gy: e.clientY - r0.top, on: false, pid: e.pointerId };
    });
    document.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.pid) return;
      if (!d.on) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return;
        d.on = true; ui.dragging = true; d.el.classList.add('drag');
        try { d.el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      e.preventDefault();
      const grid = d.el.parentElement;
      // 다른 칸 위로 올라가면 그 자리로 끼워 넣기
      const hit = Array.from(grid.children).find((t) => {
        if (t === d.el) return false;
        const r = t.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      });
      if (hit) {
        const kids = Array.from(grid.children);
        if (kids.indexOf(hit) > kids.indexOf(d.el)) grid.insertBefore(d.el, hit.nextSibling); else grid.insertBefore(d.el, hit);
      }
      d.el.style.transform = '';
      const nr = d.el.getBoundingClientRect();
      d.el.style.transform = `translate(${e.clientX - d.gx - nr.left}px,${e.clientY - d.gy - nr.top}px)`;
    }, { passive: false });
    const end = (e) => {
      if (!d || e.pointerId !== d.pid) return;
      const was = d; d = null;
      if (!was.on) return;
      swallowUntil = Date.now() + 350; // 끌고 나서 생기는 클릭(플레이어 시트 열림) 무시
      was.el.classList.remove('drag'); was.el.style.transform = '';
      const ids = Array.from(was.el.parentElement.children).map((t) => t.dataset.v);
      ui.dragging = false; ui.dirty = false;
      ui.order = ids; saveView(); render();
    };
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
    document.addEventListener('click', (e) => { if (Date.now() < swallowUntil) { e.stopPropagation(); e.preventDefault(); } }, true);
  })();

  // 서비스 워커 (홈 화면 설치 / 서버 슬립 중에도 화면 먼저 표시)
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !STANDALONE) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  render();
  connect();
})();
