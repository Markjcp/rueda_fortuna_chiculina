// Real database integration check. Explicit --write is required to spend a turn.
// Run: node supabase/live-check.mjs --write
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readCloudState, saveCloudSpin, parseCloudState } from '../docs/cloud.js';
import { availability, draw } from '../docs/game.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../docs/supabase-config.js';

const prizes = JSON.parse(await readFile(new URL('../docs/data/prizes.json', import.meta.url), 'utf8'));
const before = await readCloudState();
const parsed = parseCloudState(before, prizes);
const available = availability(parsed.used, new Date(parsed.serverTime));
console.log(`Connected: ${before.spins.length} saved spins; ${available.remaining} available today (${available.date}).`);
if (!process.argv.includes('--write')) {
  console.log('Read-only check complete. Add --write to test a real spin.');
  process.exit(0);
}
assert.ok(available.remaining > 0, 'No real spins available today. No data was changed.');

const requestId = randomUUID();
// Print before sending so an ambiguous network failure can be retried by this ID.
console.log(`Test request: ${requestId}`);
const saved = await saveCloudSpin(requestId);
assert.equal(saved.request_id, requestId);
assert.ok(prizes.some(prize => prize.id === saved.prize_id));
assert.equal(saved.spin_date, available.date);
const after = await readCloudState();
assert.equal(after.spins.length, before.spins.length + 1);
assert.ok(after.spins.some(row => row.request_id === requestId && row.prize_id === saved.prize_id));

const retries = await Promise.all([saveCloudSpin(requestId), saveCloudSpin(requestId)]);
for (const retry of retries) assert.equal(retry.prize_id, saved.prize_id);
assert.equal((await readCloudState()).spins.length, after.spins.length);
console.log(`Saved prize #${saved.prize_id}; reread and simultaneous retries returned the same result without extra rows.`);

if (available.remaining === 1) {
  await Promise.all([0, 1].map(() => assert.rejects(saveCloudSpin(randomUUID()), /CHICU_DAILY_LIMIT/)));
  console.log('Two additional requests were rejected by the database daily limit.');
}

draw(prizes); // The local test draw has no cloud write.
assert.equal((await readCloudState()).spins.length, after.spins.length);
const direct = await fetch(`${SUPABASE_URL}/rest/v1/chicu_spins?select=prize_id`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
assert.ok([401, 403].includes(direct.status), 'Direct table access must be blocked.');
const preflight = await fetch(`${SUPABASE_URL}/rest/v1/rpc/chicu_state`, { method: 'OPTIONS', headers: {
  Origin: 'http://127.0.0.1:8081',
  'Access-Control-Request-Method': 'POST',
  'Access-Control-Request-Headers': 'apikey,content-type',
} });
assert.ok(preflight.ok);
assert.ok(['*', 'http://127.0.0.1:8081'].includes(preflight.headers.get('access-control-allow-origin')));
console.log('Local-origin CORS and restricted direct table access passed. Test data was left in Supabase.');
