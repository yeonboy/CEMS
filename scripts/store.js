// 간단 Store: 전역 상태(equipment, movements 등) 보관/구독. 프레임워크 미사용.

export class Store {
  constructor(initial = {}) {
    this.state = Object.assign({ equipment: [], movements: [], repairs: [], qcLogs: [], manufacturers: {} }, initial);
    this.listeners = new Set();
  }
  getState() { return this.state; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) try { fn(this.state); } catch {} }
  set(partial) { this.state = Object.assign({}, this.state, partial); this._emit(); }
}

try { if (typeof window !== 'undefined') window.AppStore = new Store(); } catch {}


