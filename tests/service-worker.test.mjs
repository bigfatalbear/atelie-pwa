import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const serviceWorkerSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function installWith({ addAll }) {
  const calls = { opened: [], deleted: [], skipWaiting: 0 };
  let installListener;
  const self = {
    addEventListener(type, listener) {
      if (type === 'install') installListener = listener;
    },
    skipWaiting() {
      calls.skipWaiting += 1;
      return Promise.resolve();
    },
  };
  const caches = {
    open(name) {
      calls.opened.push(name);
      return Promise.resolve({ addAll });
    },
    delete(name) {
      calls.deleted.push(name);
      return Promise.resolve(true);
    },
  };

  runInNewContext(serviceWorkerSource, { self, caches, console });
  let installPromise;
  installListener({ waitUntil(promise) { installPromise = promise; } });

  return { calls, installPromise };
}

test('failed shell precache deletes only the new cache and rejects installation', async () => {
  const failure = new Error('shell precache failed');
  const { calls, installPromise } = installWith({
    addAll: () => Promise.reject(failure),
  });

  await assert.rejects(installPromise, failure);
  assert.deepEqual(calls.opened, ['atelie-v12']);
  assert.deepEqual(calls.deleted, ['atelie-v12']);
  assert.equal(calls.skipWaiting, 0);
});

test('successful shell precache skips waiting without deleting a cache', async () => {
  const { calls, installPromise } = installWith({
    addAll: () => Promise.resolve(),
  });

  await installPromise;
  assert.deepEqual(calls.opened, ['atelie-v12']);
  assert.deepEqual(calls.deleted, []);
  assert.equal(calls.skipWaiting, 1);
});

test('preloads both financial modules for offline use', () => {
  assert.match(serviceWorkerSource, /'\.\/js\/financeiro\.mjs'/);
  assert.match(serviceWorkerSource, /'\.\/js\/financeiro-ui\.js'/);
});
