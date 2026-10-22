'use strict';
// 원격 저장소: Upstash Redis(REST)에 기록 전체를 JSON 한 덩어리로 저장합니다. (Render 무료처럼 디스크가 초기화되는 호스팅용)
// 필요한 환경변수: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN  (Upstash 대시보드의 "REST API" 항목)
// 의존성 없이 Node 내장 fetch만 사용합니다.
const { Store } = require('./store');

const KEY = 'bang:stats:v1';

class RemoteStore extends Store {
  constructor(url, token, key) {
    super(null);
    this.url = String(url).replace(/\/+$/, '');
    this.token = token;
    this.key = key || KEY;
    this.persistent = false;   // init() 성공 전에는 쓰지 않음
    this.loadFailed = false;
    this.inflight = null;
    this.dirty = false;
    this.where = 'Upstash Redis';
  }
  _load() { /* 생성자에서는 읽지 않음: init()에서 비동기로 읽는다 */ }

  async _cmd(args) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(8000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) throw new Error(j.error || 'HTTP ' + res.status);
    return j.result;
  }

  // 시작 시 한 번 읽는다. 읽기에 실패하면 "쓰기 금지" 상태로 두어 기존 기록을 빈 데이터로 덮어쓰지 않는다.
  async init() {
    for (let i = 0; i < 3; i++) {
      try {
        const raw = await this._cmd(['GET', this.key]);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.profiles) this.data = Object.assign(this.data, parsed);
        }
        this.persistent = true;
        this.loadFailed = false;
        return true;
      } catch (e) {
        console.error('[기록] 원격 저장소 읽기 실패:', e.message);
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
    }
    this.loadFailed = true; // 기록은 메모리에서만 동작하고 원격에는 쓰지 않는다
    return false;
  }

  save(now) {
    if (!this.persistent) return Promise.resolve();
    this.dirty = true;
    if (now) return this.flush();
    if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 600);
    return Promise.resolve();
  }
  // 저장은 한 번에 하나씩, 그 사이 바뀐 내용은 다음 저장에 합쳐서 보낸다.
  async flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.inflight) { await this.inflight.catch(() => {}); if (!this.dirty) return; }
    if (!this.dirty || !this.persistent) return;
    this.dirty = false;
    this.inflight = this._cmd(['SET', this.key, JSON.stringify(this.data)]).catch((e) => {
      this.dirty = true;
      console.error('[기록] 원격 저장 실패 (다음 기회에 다시 시도):', e.message);
      if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 5000);
    });
    try { await this.inflight; } finally { this.inflight = null; }
  }
}

module.exports = { RemoteStore };
