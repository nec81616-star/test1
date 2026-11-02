/*
 * Browser-only demonstration transport for the Firebase compatibility API used
 * by this project. Load ONLY for ?demo=1, instead of the Firebase SDKs.
 * Teacher and students must open the same origin in the same browser profile.
 * This is not a classroom server, authentication system, or security boundary.
 * navigator.locks serializes transactions across tabs on HTTPS/localhost.
 * pagehide disconnect hooks are best effort: forcibly killing a browser process
 * cannot deliver them. They deliberately do not run on blur or visibilitychange.
 */
(function (global) {
  'use strict';
  const STORAGE_KEY = 'traffic-risk-v8-demo';
  const LOCK_NAME = 'traffic-risk-v8-demo-write';
  const listeners = new Set();
  const disconnects = new Map();
  const TIMESTAMP = Object.freeze({ '.sv': 'timestamp' });
  let localQueue = Promise.resolve();

  const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
  const parts = path => String(path || '').split('/').filter(Boolean);
  const pathOf = path => parts(path).join('/');
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  function readStore() {
    let raw;
    try { raw = global.localStorage.getItem(STORAGE_KEY); }
    catch (error) { throw new Error('試玩模式需要瀏覽器允許本機儲存：' + error.message); }
    if (raw === null) return { revision: 0, data: {} };
    let stored;
    try { stored = JSON.parse(raw); }
    catch { throw new Error('試玩資料無法讀取，請清除這個網站的試玩資料後重試。'); }
    if (!stored || typeof stored !== 'object' || !own(stored, 'data')) {
      throw new Error('試玩資料格式不正確，請清除這個網站的試玩資料後重試。');
    }
    return stored;
  }

  function at(data, path) {
    if (path === '.info/connected') return true;
    let value = data;
    for (const key of parts(path)) {
      if (value === null || typeof value !== 'object' || !own(value, key)) return null;
      value = value[key];
    }
    return value === undefined ? null : value;
  }

  function normalize(value, now) {
    if (value === null) return null;
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
      throw new Error('試玩資料不可包含 undefined 或非 JSON 值。');
    }
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('試玩資料不可包含非有限數值。');
    if (typeof value !== 'object') return value;
    if (value['.sv'] === 'timestamp' && Object.keys(value).length === 1) return now;
    if (Array.isArray(value)) return value.map(item => normalize(item, now));
    const normalized = Object.create(null);
    for (const key of Object.keys(value)) {
      if (/[.#$\[\]/]/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('試玩資料欄位名稱含有不支援的字元。');
      const item = normalize(value[key], now);
      if (item !== null) normalized[key] = item;
    }
    return Object.keys(normalized).length ? normalized : null;
  }

  function put(data, path, value) {
    const keys = parts(path);
    if (keys.some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('試玩資料路徑含有不支援的欄位。');
    if (!keys.length) return value === null ? {} : value;
    if (keys[0] === '.info') throw new Error('.info 為唯讀狀態。');
    let current = data;
    if (current === null || typeof current !== 'object') current = data = {};
    const ancestors = [];
    for (let index = 0; index < keys.length - 1; index++) {
      const key = keys[index];
      ancestors.push([current, key]);
      if (current[key] === null || typeof current[key] !== 'object') current[key] = {};
      current = current[key];
    }
    const key = keys[keys.length - 1];
    if (value === null) delete current[key];
    else current[key] = value;
    for (let index = ancestors.length - 1; index >= 0; index--) {
      const [parent, child] = ancestors[index];
      if (parent[child] && typeof parent[child] === 'object' && !Object.keys(parent[child]).length) delete parent[child];
    }
    return data;
  }

  class Snapshot {
    constructor(path, value) { this._path = path; this._value = copy(value); this.key = parts(path).at(-1) || null; }
    val() { return copy(this._value); }
    exists() { return this._value !== null; }
    child(path) { const childPath = pathOf(this._path + '/' + path); return new Snapshot(childPath, at(this._value, pathOf(path))); }
    hasChild(path) { return this.child(path).exists(); }
    numChildren() { return this._value && typeof this._value === 'object' ? Object.keys(this._value).length : 0; }
    forEach(callback) {
      if (!this._value || typeof this._value !== 'object') return false;
      for (const key of Object.keys(this._value).sort()) if (callback(this.child(key)) === true) return true;
      return false;
    }
    get ref() { return new Reference(this._path); }
  }

  function deliver(listener, value) {
    const serialized = JSON.stringify(value);
    if (listener.last === serialized) return;
    listener.last = serialized;
    const snapshot = new Snapshot(listener.path, value);
    queueMicrotask(() => {
      if (!listener.active) return;
      try { listener.callback(snapshot); }
      catch (error) { setTimeout(() => { throw error; }, 0); }
    });
  }

  function notify(data) {
    for (const listener of listeners) deliver(listener, at(data, listener.path));
  }

  function writeStore(stored) {
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); }
    catch (error) { throw new Error('試玩資料無法儲存，請確認儲存空間及瀏覽器權限：' + error.message); }
    notify(stored.data);
  }

  function exclusive(operation) {
    const execute = () => global.navigator?.locks
      ? global.navigator.locks.request(LOCK_NAME, operation)
      : operation();
    const task = localQueue.then(execute);
    localQueue = task.catch(() => {});
    return task;
  }

  function mutation(path, kind, value) {
    return exclusive(() => {
      const stored = readStore();
      const now = Date.now();
      if (kind === 'set') stored.data = put(stored.data, path, normalize(value, now));
      else {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('update 需要欄位物件。');
        const updates = Object.entries(value).map(([key, item]) => [pathOf(path + '/' + key), normalize(item, now)]);
        for (let i = 0; i < updates.length; i++) for (let j = i + 1; j < updates.length; j++) {
          const left = updates[i][0], right = updates[j][0];
          if (left === right || left.startsWith(right + '/') || right.startsWith(left + '/')) throw new Error('同一次 update 不可更新重疊路徑。');
        }
        for (const [target, item] of updates) stored.data = put(stored.data, target, item);
      }
      stored.revision = Number(stored.revision || 0) + 1;
      writeStore(stored);
    });
  }

  function validateEvent(event) { if (event !== 'value') throw new Error('本機試玩僅支援 value 事件。'); }

  class Reference {
    constructor(path) { this._path = pathOf(path); this.key = parts(path).at(-1) || null; }
    child(path) { return new Reference(this._path + '/' + path); }
    set(value, callback) { const task = mutation(this._path, 'set', value); if (callback) task.then(() => callback(null), callback); return task; }
    update(value, callback) { const task = mutation(this._path, 'update', value); if (callback) task.then(() => callback(null), callback); return task; }
    remove(callback) { return this.set(null, callback); }
    once(event, callback) {
      validateEvent(event);
      const task = Promise.resolve().then(() => new Snapshot(this._path, at(readStore().data, this._path)));
      if (callback) task.then(callback);
      return task;
    }
    on(event, callback, cancelCallback) {
      validateEvent(event);
      if (typeof callback !== 'function') throw new TypeError('on 需要回呼函式。');
      const listener = { path: this._path, callback, cancelCallback, active: true, last: undefined };
      listeners.add(listener);
      try { deliver(listener, at(readStore().data, this._path)); }
      catch (error) {
        listeners.delete(listener); listener.active = false;
        if (cancelCallback) queueMicrotask(() => cancelCallback(error));
        else throw error;
      }
      return callback;
    }
    off(event, callback) {
      if (event !== undefined) validateEvent(event);
      for (const listener of listeners) if (listener.path === this._path && (!callback || listener.callback === callback)) {
        listener.active = false; listeners.delete(listener);
      }
    }
    transaction(updater, callback) {
      const task = exclusive(() => {
        const stored = readStore();
        const current = copy(at(stored.data, this._path));
        const result = updater(current);
        if (result === undefined) return { committed: false, snapshot: new Snapshot(this._path, current) };
        const normalized = normalize(result, Date.now());
        stored.data = put(stored.data, this._path, normalized);
        stored.revision = Number(stored.revision || 0) + 1;
        writeStore(stored);
        return { committed: true, snapshot: new Snapshot(this._path, normalized) };
      });
      if (callback) task.then(result => callback(null, result.committed, result.snapshot), error => callback(error, false, null));
      return task;
    }
    onDisconnect() {
      const path = this._path;
      return {
        set(value) { disconnects.set(path, { kind: 'set', value }); return Promise.resolve(); },
        update(value) { disconnects.set(path, { kind: 'update', value }); return Promise.resolve(); },
        remove() { disconnects.set(path, { kind: 'set', value: null }); return Promise.resolve(); },
        cancel() { disconnects.delete(path); return Promise.resolve(); },
      };
    }
    toString() { return 'local-demo:/' + this._path; }
  }

  global.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try { notify(readStore().data); }
    catch (error) {
      for (const listener of listeners) if (listener.cancelCallback) listener.cancelCallback(error);
      console.error(error);
    }
  });

  global.addEventListener('pagehide', event => {
    if (event.persisted || disconnects.size === 0) return;
    // Async lock requests cannot be guaranteed at unload; synchronous writes are
    // limited to the registered disconnect paths. Normal gameplay uses locks.
    try {
      const stored = readStore(), now = Date.now();
      for (const [path, operation] of disconnects) {
        if (operation.kind === 'set') stored.data = put(stored.data, path, normalize(operation.value, now));
        else for (const [key, value] of Object.entries(operation.value)) stored.data = put(stored.data, pathOf(path + '/' + key), normalize(value, now));
      }
      stored.revision = Number(stored.revision || 0) + 1;
      writeStore(stored);
    } catch (error) { console.error(error); }
  });

  // Unique per loaded page, including tabs duplicated from another tab. A demo
  // refresh rejoins as a new player; no credentials or identities are persisted.
  const uid = 'demo-' + (global.crypto?.randomUUID ? global.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const auth = { currentUser: null, async signInAnonymously() { this.currentUser = { uid, isAnonymous: true }; return { user: this.currentUser }; } };
  const database = { ref(path) { return new Reference(path); } };
  const databaseFunction = () => database;
  databaseFunction.ServerValue = { TIMESTAMP };
  global.LOCAL_DEMO = true;
  global.firebase = { initializeApp() { return { name: '[LOCAL DEMO]' }; }, auth() { return auth; }, database: databaseFunction };
})(window);
