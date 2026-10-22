'use strict';
// 기록 저장소: 로컬 JSON 파일 (원자적 저장 + 시간당 백업). 파일을 못 쓰는 환경이면 메모리로만 동작합니다.
// 나중에 DB로 옮기려면 이 클래스와 같은 메서드를 가진 구현으로 교체하면 됩니다.
const fs = require('fs');
const path = require('path');
const R = require('./ratings');

const HIST_PER_PROFILE = 30;
const GAMES_KEPT = 100;
const round1 = (x) => Math.round(x * 10) / 10;

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = dir ? path.join(dir, 'stats.json') : null;
    this.persistent = false;
    this.where = null;
    this.timer = null;
    this.lastBackup = 0;
    this.data = { version: 1, profiles: {}, roleStats: {}, games: [] };
    this._load();
  }

  async init() { return true; }
  async flush() { this.save(true); }
  _load() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      this.persistent = true;
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (parsed && parsed.profiles) this.data = Object.assign(this.data, parsed);
      }
    } catch (e) {
      console.error('[기록] 저장소를 열지 못했습니다:', e.message);
      // 파일이 깨졌다면 백업에서 복구 시도
      try {
        const bak = this.file + '.bak';
        if (fs.existsSync(bak)) {
          this.data = Object.assign(this.data, JSON.parse(fs.readFileSync(bak, 'utf8')));
          console.error('[기록] 백업 파일에서 복구했습니다.');
        }
      } catch (e2) { /* ignore */ }
    }
  }

  save(now) {
    if (!this.persistent) return;
    if (now) return this._write();
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this._write(); }, 400);
  }
  _write() {
    try {
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      if (fs.existsSync(this.file) && Date.now() - this.lastBackup > 3600 * 1000) {
        fs.copyFileSync(this.file, this.file + '.bak');
        this.lastBackup = Date.now();
      }
      fs.renameSync(tmp, this.file); // 원자적 교체: 쓰는 도중 꺼져도 기존 파일은 온전함
    } catch (e) {
      console.error('[기록] 저장 실패:', e.message);
    }
  }

  has(dev) { return !!this.data.profiles[dev]; }
  _ensure(dev, name) {
    let p = this.data.profiles[dev];
    if (!p) {
      p = { name, rating: R.BASE_RATING, games: 0, wins: 0, kills: 0, roles: {}, chars: {}, hist: [], first: Date.now(), last: Date.now() };
      this.data.profiles[dev] = p;
    }
    if (name) p.name = name;
    return p;
  }
  touch(dev, name) { if (this.has(dev) && name) { this.data.profiles[dev].name = name; this.save(); } }
  rating(dev) { const p = dev && this.data.profiles[dev]; return p ? p.rating : R.BASE_RATING; }

  // slots: [{ id, dev|null, name, role, char, won, kills, eligible, human }]
  recordGame({ n, winner, slots }) {
    // 1) 판 시작 전 레이팅으로 모든 변동을 먼저 계산 (순서와 무관하게 공정)
    const pre = slots.map((s) => (s.human && s.dev ? this.rating(s.dev) : R.BOT_RATING));
    const changes = [];
    slots.forEach((s, i) => {
      if (!s.eligible) return;
      const others = pre.filter((_, j) => j !== i);
      const field = others.reduce((a, b) => a + b, 0) / Math.max(others.length, 1);
      const prof = this.data.profiles[s.dev];
      const p0 = R.roleProb(this.data.roleStats, n, s.role);
      const d = R.delta(pre[i], field, p0, s.won, prof ? prof.games : 0);
      changes.push({ i, s, p0, expected: d.expected, delta: d.delta, before: pre[i] });
    });
    // 2) 적용
    const out = [];
    for (const c of changes) {
      const p = this._ensure(c.s.dev, c.s.name);
      const before = p.rating;
      p.rating = round1(p.rating + c.delta);
      p.games += 1;
      if (c.s.won) p.wins += 1;
      p.kills += c.s.kills || 0;
      const r = (p.roles[c.s.role] = p.roles[c.s.role] || { g: 0, w: 0 });
      r.g += 1; if (c.s.won) r.w += 1;
      const ch = (p.chars[c.s.char] = p.chars[c.s.char] || { g: 0, w: 0 });
      ch.g += 1; if (c.s.won) ch.w += 1;
      p.last = Date.now();
      p.hist.push({ t: Date.now(), n, role: c.s.role, char: c.s.char, won: c.s.won ? 1 : 0, d: round1(c.delta), r: p.rating });
      if (p.hist.length > HIST_PER_PROFILE) p.hist.shift();
      out.push({ id: c.s.id, name: p.name, role: c.s.role, before: round1(before), after: p.rating, delta: round1(c.delta), expected: Math.round(c.expected * 100), provisional: p.games <= R.PROVISIONAL_GAMES });
    }
    // 3) 역할 난이도 통계: 사람/봇 구분 없이 모든 역할 슬롯의 결과를 누적
    const rs = (this.data.roleStats[n] = this.data.roleStats[n] || {});
    for (const s of slots) {
      const x = (rs[s.role] = rs[s.role] || { g: 0, w: 0 });
      x.g += 1; if (s.won) x.w += 1;
    }
    this.data.games.push({ t: Date.now(), n, winner, players: slots.map((s) => ({ name: s.name, role: s.role, char: s.char, won: s.won ? 1 : 0, human: s.human ? 1 : 0 })) });
    if (this.data.games.length > GAMES_KEPT) this.data.games.shift();
    this.save();
    return out;
  }

  // 정렬된 순위 목록 (레이팅 기준)
  _ranked() {
    return Object.entries(this.data.profiles)
      .filter(([, p]) => p.games > 0)
      .sort((a, b) => b[1].rating - a[1].rating || b[1].games - a[1].games);
  }

  profileView(dev) {
    const p = this.data.profiles[dev];
    if (!p) return null;
    const ranked = this._ranked();
    const rank = ranked.findIndex(([d]) => d === dev) + 1;
    const chars = Object.entries(p.chars).map(([id, v]) => ({ id, g: v.g, w: v.w })).sort((a, b) => b.g - a.g || b.w - a.w).slice(0, 5);
    return {
      name: p.name, rating: Math.round(p.rating), rank: rank || null, total: ranked.length,
      games: p.games, wins: p.wins, kills: p.kills, provisional: p.games < R.PROVISIONAL_GAMES,
      roles: p.roles, chars, hist: p.hist.slice(-10).reverse(),
    };
  }
  leaderboard(dev) {
    return this._ranked().slice(0, 100).map(([d, p], i) => ({
      rank: i + 1, name: p.name, rating: Math.round(p.rating), games: p.games, wins: p.wins,
      provisional: p.games < R.PROVISIONAL_GAMES, me: d === dev,
    }));
  }
  // 역할 난이도 표 (인원수 × 역할 → 보정된 기본 승률 %, 누적 판수)
  difficulty() {
    const out = {};
    for (const n of Object.keys(R.PRIORS)) {
      out[n] = {};
      for (const role of Object.keys(R.PRIORS[n])) {
        const s = (this.data.roleStats[n] && this.data.roleStats[n][role]) || { g: 0 };
        out[n][role] = { p: Math.round(R.roleProb(this.data.roleStats, Number(n), role) * 100), g: s.g };
      }
    }
    return out;
  }
}

module.exports = { Store };
