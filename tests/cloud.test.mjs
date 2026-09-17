import test from 'node:test';
import assert from 'node:assert/strict';
import { readCloudState, saveCloudSpin, parseCloudState, cloudError } from '../docs/cloud.js';

const prizes = [{ id: 1, type: 'prize', title: 'Desayuno' }, { id: 2, type: 'meme', title: 'Risa' }];
const state = { server_time: '2026-09-21T15:00:00Z', spins: [
  { prize_id: 1, spin_date: '2026-09-21', request_id: 'first' },
  { prize_id: 2, spin_date: '2026-09-21', request_id: 'second' },
] };

test('cloud history restores Monday usage and the shared album', () => {
  const parsed = parseCloudState(state, prizes);
  assert.equal(parsed.used['2026-09-21'], 2);
  assert.equal(parsed.won.size, 2);
  assert.equal(parsed.won.get(1).requestId, 'first');
  assert.equal(parsed.serverTime, Date.parse(state.server_time));
});

test('invalid history cannot replace a valid collection', () => {
  for (const data of [null, { ...state, server_time: 'bad' }, { ...state, spins: [...state.spins, state.spins[0]] }, { ...state, spins: [{ prize_id: 99, spin_date: '2026-09-21' }] }]) {
    assert.throws(() => parseCloudState(data, prizes));
  }
});

test('cloud requests use the public key without a login or a client-selected prize', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => state };
  });
  await readCloudState();
  await saveCloudSpin('same-request');
  await saveCloudSpin('same-request');
  assert.ok(calls[0].url.endsWith('/rest/v1/rpc/chicu_state'));
  assert.match(calls[0].options.headers.apikey, /^sb_publishable_/);
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(calls[1].options.body), { p_request_id: 'same-request' });
  assert.equal(calls[1].options.body, calls[2].options.body);
});

test('HTTP errors retain their code for setup and retry messages', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404, json: async () => ({ code: 'PGRST202', message: 'Function missing' }) }));
  await assert.rejects(readCloudState, error => error.code === 'PGRST202' && error.status === 404);
  assert.match(cloudError({ code: 'PGRST202' }), /no está preparada/);
  assert.match(cloudError({ message: 'CHICU_DAILY_LIMIT' }), /Ya usaste/);
});
