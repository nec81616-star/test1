const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

const source = fs.readFileSync(require.resolve('../local-backend.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function browserPair() {
  const storage = new Map();
  const windows = [];
  let lockTail = Promise.resolve();
  function makeWindow() {
    const handlers = {};
    const window = {
      console,
      crypto: { randomUUID },
      navigator: { locks: { request(_name, operation) {
        const task = lockTail.then(operation);
        lockTail = task.catch(() => {});
        return task;
      } } },
      addEventListener(type, callback) { (handlers[type] ||= []).push(callback); },
      dispatch(type, event) { for (const callback of handlers[type] || []) callback(event); },
      localStorage: {
        getItem(key) { return storage.get(key) ?? null; },
        setItem(key, value) {
          storage.set(key, value);
          for (const target of windows) if (target !== window) {
            queueMicrotask(() => target.dispatch('storage', { key, newValue: value }));
          }
        },
      },
    };
    windows.push(window);
    const context = vm.createContext({ window, queueMicrotask, setTimeout, console });
    vm.runInContext(source, context, { filename: 'local-backend.js' });
    window.db = window.firebase.database();
    return window;
  }
  return [makeWindow(), makeWindow()];
}

test('independent tabs receive distinct identities and resolved server timestamps', async () => {
  const [teacher, student] = browserPair();
  await teacher.firebase.auth().signInAnonymously();
  await student.firebase.auth().signInAnonymously();
  assert.notEqual(teacher.firebase.auth().currentUser.uid, student.firebase.auth().currentUser.uid);
  assert.equal((await student.db.ref('.info/connected').once('value')).val(), true);
  const started = Date.now();
  await teacher.db.ref('rooms/1234').set({ hostOnline: true, createdAt: teacher.firebase.database.ServerValue.TIMESTAMP });
  const createdAt = (await student.db.ref('rooms/1234/createdAt').once('value')).val();
  assert.ok(createdAt >= started && createdAt <= Date.now());
});

test('transactions are atomic across tabs and aborted transactions do not overwrite data', async () => {
  const [teacher, student] = browserPair();
  const path = 'rooms/1234/players/alex/score';
  await teacher.db.ref(path).set(0);
  await Promise.all(Array.from({ length: 100 }, (_, index) =>
    (index % 2 ? teacher : student).db.ref(path).transaction(score => score + 1)));
  assert.equal((await student.db.ref(path).once('value')).val(), 100);
  const aborted = await teacher.db.ref(path).transaction(() => undefined);
  assert.equal(aborted.committed, false);
  assert.equal(aborted.snapshot.val(), 100);
  assert.equal((await teacher.db.ref(path).once('value')).val(), 100);
});

test('only changed values notify listeners; off removes the selected path and preserves child subscriptions', async () => {
  const [teacher, student] = browserPair();
  let playerChanges = 0, scoreChanges = 0, unrelatedChanges = 0;
  const player = student.db.ref('rooms/1234/players/alex');
  player.on('value', () => playerChanges++);
  player.child('score').on('value', () => scoreChanges++);
  student.db.ref('unrelated').on('value', () => unrelatedChanges++);
  await flush();
  await teacher.db.ref('rooms/1234/players/alex').set({ score: 3 });
  await flush();
  assert.equal(playerChanges, 2);
  assert.equal(scoreChanges, 2);
  assert.equal(unrelatedChanges, 1);
  await teacher.db.ref('rooms/1234/hostOnline').set(true);
  await flush();
  assert.equal(playerChanges, 2, 'sibling heartbeat must not rerender unchanged player');
  player.off();
  await teacher.db.ref('rooms/1234/players/alex/score').set(6);
  await flush();
  assert.equal(playerChanges, 2);
  assert.equal(scoreChanges, 3, 'parent off must leave child listener active');
});

test('multipath updates are atomic and invalid updates leave existing room data intact', async () => {
  const [teacher, student] = browserPair();
  const room = teacher.db.ref('rooms/1234');
  await room.set({ status: 'running', players: { alex: { score: 15 } }, globalQuestion: { id: 'old' } });
  await room.update({ 'players/alex/status': 'incident', 'players/alex/incident': { id: 'case-1' }, globalQuestion: null });
  const snapshot = await student.db.ref('rooms/1234').once('value');
  assert.equal(snapshot.child('players/alex/status').val(), 'incident');
  assert.equal(snapshot.child('players/alex/score').val(), 15);
  assert.equal(snapshot.child('globalQuestion').exists(), false);
  await assert.rejects(room.update({ players: {}, 'players/alex/score': 0 }), /重疊/);
  await assert.rejects(room.set({ status: undefined }), /undefined/);
  await assert.rejects(room.child('__proto__/polluted').set(true), /不支援/);
  assert.equal((await student.db.ref('rooms/1234/players/alex/score').once('value')).val(), 15);
  assert.equal({}.polluted, undefined);
});

test('disconnect handlers ignore backgrounding and support cancel before page close', async () => {
  const [teacher, student] = browserPair();
  await teacher.db.ref('rooms/1234').set({ hostOnline: true, players: { alex: { connected: true } } });
  await teacher.db.ref('rooms/1234').onDisconnect().remove();
  await student.db.ref('rooms/1234/players/alex').onDisconnect().update({ connected: false });
  teacher.dispatch('visibilitychange', {});
  teacher.dispatch('pagehide', { persisted: true });
  assert.equal((await student.db.ref('rooms/1234').once('value')).exists(), true);
  await teacher.db.ref('rooms/1234').onDisconnect().cancel();
  teacher.dispatch('pagehide', { persisted: false });
  assert.equal((await student.db.ref('rooms/1234').once('value')).exists(), true);
  student.dispatch('pagehide', { persisted: false });
  assert.equal((await teacher.db.ref('rooms/1234/players/alex/connected').once('value')).val(), false);
});
