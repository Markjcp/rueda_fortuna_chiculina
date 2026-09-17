// Optional isolated SQL validation:
// node supabase/verify.mjs /absolute/path/to/@electric-sql/pglite/dist/index.js
// Never connects to the live Supabase project.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

if (!process.argv[2]) throw new Error('Provide the path to a local PGlite dist/index.js module.');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const source = await readFile(new URL('./setup.sql', import.meta.url), 'utf8');
await db.exec('create role anon; create role authenticated; grant usage on schema public to anon, authenticated;');
await db.exec(source);
await db.exec(source); // Applying the setup again must be safe.
const spinDefinition = source.slice(source.indexOf('create or replace function public.chicu_spin'), source.indexOf('revoke all on function public.chicu_state'));
async function setTime(time) {
  // Freeze only the isolated test copy, never expose a clock override in production.
  await db.exec(spinDefinition.replace('clock_timestamp()', `timestamptz '${time}'`));
}
async function spin(id = randomUUID()) {
  return (await db.query('select (public.chicu_spin($1::uuid)).*', [id])).rows[0];
}
async function asAnon(action) {
  await db.exec('set role anon');
  try { return await action(); } finally { await db.exec('reset role'); }
}
await asAnon(async () => {
  const initial = await db.query('select public.chicu_state() as state');
  assert.deepEqual(initial.rows[0].state.spins, []);
  await assert.rejects(db.query('select * from public.chicu_spins'), /permission denied/);
  await assert.rejects(db.query('delete from public.chicu_spins'), /permission denied/);
  await assert.rejects(db.query("insert into public.chicu_spins(request_id,spin_date,slot,prize_id) values(gen_random_uuid(),'2026-09-16',1,1)"), /permission denied/);
});
await setTime('2026-09-16 15:00:00+00');
const id = randomUUID();
const first = await asAnon(() => spin(id));
const retry = await asAnon(() => spin(id));
assert.equal(first.prize_id, retry.prize_id);
assert.equal(first.slot, 1);
await asAnon(() => assert.rejects(spin(), /CHICU_DAILY_LIMIT/));
await db.exec(source);
assert.equal((await db.query('select count(*)::int as count from public.chicu_spins')).rows[0].count, 1);

await setTime('2026-09-21 14:59:59+00');
const mondayFirst = await asAnon(() => spin());
assert.equal(mondayFirst.slot, 1);
await asAnon(() => assert.rejects(spin(), /CHICU_DAILY_LIMIT/));
await setTime('2026-09-21 15:00:00+00');
const bonus = await asAnon(() => spin());
assert.equal(bonus.slot, 2);
assert.equal(new Set([first.prize_id, mondayFirst.prize_id, bonus.prize_id]).size, 3);
await asAnon(() => assert.rejects(spin(), /CHICU_DAILY_LIMIT/));
for (const time of ['2026-09-19 15:00:00+00', '2026-09-20 15:00:00+00']) {
  await setTime(time);
  await asAnon(() => assert.rejects(spin(), /CHICU_WEEKEND/));
}
for (const time of ['2026-09-15 15:00:00+00', '2026-12-22 15:00:00+00']) {
  await setTime(time);
  await asAnon(() => assert.rejects(spin(), /CHICU_OUTSIDE_CAMPAIGN/));
}
// Replays remain safe after the campaign closes.
assert.equal((await asAnon(() => spin(id))).prize_id, first.prize_id);
await setTime('2026-12-21 15:00:00+00');
await asAnon(() => spin());
await asAnon(() => spin());
await asAnon(() => assert.rejects(spin(), /CHICU_DAILY_LIMIT/));
await asAnon(() => assert.rejects(spin(null), /CHICU_REQUEST_REQUIRED/));
console.log('SQL checks passed: setup/rerun, anonymous RPC access, blocked table access, daily limits, noon bonus, unique prizes, weekend/date boundaries, idempotent retries.');
await db.close();
