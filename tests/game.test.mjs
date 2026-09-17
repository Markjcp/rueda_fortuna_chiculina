import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { TOTAL, calendar, argentinaTime, availability, draw, validatePrizes } from '../docs/game.js';

test('inclusive campaign has 69 weekdays and 14 Monday bonuses', () => {
  assert.equal(calendar().length, 69);
  assert.equal(calendar().filter(d => d.spins === 2).length, 14);
  assert.equal(TOTAL, 83);
  assert.equal(calendar()[0].date, '2026-09-16');
  assert.equal(calendar().at(-1).date, '2026-12-21');
});
test('Argentina date boundaries do not depend on the device timezone', () => {
  assert.deepEqual(argentinaTime(new Date('2026-09-17T02:59:00Z')), { date: '2026-09-16', hour: 23 });
  assert.deepEqual(argentinaTime(new Date('2026-09-17T03:00:00Z')), { date: '2026-09-17', hour: 0 });
});
test('one daily turn, no carryover, weekend and campaign boundaries', () => {
  const at = (date, used = {}) => availability(used, new Date(`${date}T16:00:00Z`)).remaining;
  assert.equal(at('2026-09-16'), 1);
  assert.equal(at('2026-09-16', { '2026-09-16': 1 }), 0);
  assert.equal(at('2026-09-17', { '2026-09-16': 1 }), 1);
  for (const date of ['2026-09-15', '2026-09-19', '2026-09-20', '2026-12-22']) assert.equal(at(date), 0);
  assert.equal(at('2026-12-21'), 2);
});
test('Monday extra turn unlocks at noon exactly', () => {
  const before = new Date('2026-09-21T14:59:59Z');
  const noon = new Date('2026-09-21T15:00:00Z');
  assert.equal(availability({}, before).remaining, 1);
  assert.equal(availability({ '2026-09-21': 1 }, before).remaining, 0);
  assert.equal(availability({}, noon).remaining, 2);
  assert.equal(availability({ '2026-09-21': 1 }, noon).remaining, 1);
  assert.equal(availability({ '2026-09-21': 2 }, noon).remaining, 0);
});
test('draw stays inside available pool without mutating it', () => {
  const pool = [{ id: 3 }, { id: 71 }];
  assert.equal(draw(pool, () => 0).id, 3);
  assert.equal(draw(pool, () => .999999).id, 71);
  assert.equal(pool.length, 2);
  assert.throws(() => draw([]));
});
test('catalog contains every number, complete prize text, and existing meme images', async () => {
  const prizes = validatePrizes(JSON.parse(await readFile(new URL('../docs/data/prizes.json', import.meta.url), 'utf8')));
  for (const prize of prizes) {
    if (prize.type === 'meme') await access(new URL(`../docs/${prize.image}`, import.meta.url));
    else assert.ok(prize.text.length);
  }
  assert.throws(() => validatePrizes([...prizes.slice(1), prizes[1]]));
});
