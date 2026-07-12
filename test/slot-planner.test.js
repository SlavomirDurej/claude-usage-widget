/**
 * Plain-Node test for the slot planner. Run with: node test/slot-planner.test.js
 * Exits non-zero on the first failure.
 */
const assert = require('assert');
const { computePlan, FIVE_HOURS_MS } = require('../src/slot-planner');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

// Helper: build a local Date for "today" relative to a base date at HH:MM.
function at(base, h, m = 0, dayOffset = 0) {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return d;
}

const BASE = new Date(2026, 6, 11, 9, 0, 0, 0); // 2026-07-11 09:00 local

test('active window ending before target, gap < 5h -> pure idle, single send', () => {
  // Current window ends 05:00, target 08:00. now = 04:00 (window active).
  const now = at(BASE, 4, 0);
  const resetsAt = at(BASE, 5, 0).toISOString();
  const plan = computePlan({ slotTime: '08:00', resetsAt, now });

  assert.strictEqual(plan.windowActive, true);
  assert.strictEqual(plan.numFillers, 0);
  assert.strictEqual(plan.targetAt.getTime(), at(BASE, 8, 0).getTime());
  assert.strictEqual(plan.triggerTimes.length, 1);
  assert.strictEqual(plan.triggerTimes[0].getTime(), at(BASE, 8, 0).getTime());
  assert.strictEqual(plan.hasIdle, true);
  assert.strictEqual(plan.idleFrom.getTime(), at(BASE, 5, 0).getTime());
  assert.strictEqual(plan.idleTo.getTime(), at(BASE, 8, 0).getTime());
});

test('active window ending 00:00, target 08:00 -> filler at 00:00, idle 05:00-08:00', () => {
  // now 23:00 previous day, window ends 00:00 next day.
  const now = at(BASE, 23, 0, -1);
  const resetsAt = at(BASE, 0, 0).toISOString(); // 00:00 today
  const plan = computePlan({ slotTime: '08:00', resetsAt, now });

  assert.strictEqual(plan.numFillers, 1);
  assert.strictEqual(plan.triggerTimes.length, 2);
  // End placement: filler opens immediately at 00:00, idle sits before target.
  assert.strictEqual(plan.triggerTimes[0].getTime(), at(BASE, 0, 0).getTime());
  assert.strictEqual(plan.triggerTimes[1].getTime(), at(BASE, 8, 0).getTime());
  // idle sits at the end: 05:00 -> 08:00 (pre-dawn)
  assert.strictEqual(plan.idleFrom.getTime(), at(BASE, 5, 0).getTime());
  assert.strictEqual(plan.idleTo.getTime(), at(BASE, 8, 0).getTime());
});

test('idle lands in pre-dawn hours for a morning target (waking hours stay usable)', () => {
  // Current session ends 11:00 AM, target 06:00 next day. 19h gap, 3 fillers.
  const now = at(BASE, 10, 0);
  const resetsAt = at(BASE, 11, 0).toISOString();
  const plan = computePlan({ slotTime: '06:00', resetsAt, now });

  assert.strictEqual(plan.numFillers, 3);
  // Fillers run 11:00, 16:00, 21:00 — covering the whole waking day/evening.
  assert.strictEqual(plan.triggerTimes[0].getTime(), at(BASE, 11, 0).getTime());
  assert.strictEqual(plan.triggerTimes[1].getTime(), at(BASE, 16, 0).getTime());
  assert.strictEqual(plan.triggerTimes[2].getTime(), at(BASE, 21, 0).getTime());
  // Idle is 02:00 -> 06:00 next day (asleep), then the target opens at 06:00.
  assert.strictEqual(plan.idleFrom.getTime(), at(BASE, 2, 0, 1).getTime());
  assert.strictEqual(plan.idleTo.getTime(), at(BASE, 6, 0, 1).getTime());
  assert.strictEqual(plan.triggerTimes[3].getTime(), at(BASE, 6, 0, 1).getTime());
});

test('no active window, target later today -> idle until target, single send', () => {
  const now = at(BASE, 7, 10);
  const plan = computePlan({ slotTime: '08:00', resetsAt: null, now });

  assert.strictEqual(plan.windowActive, false);
  assert.strictEqual(plan.numFillers, 0);
  assert.strictEqual(plan.targetAt.getTime(), at(BASE, 8, 0).getTime());
  assert.strictEqual(plan.triggerTimes.length, 1);
  assert.strictEqual(plan.hasIdle, true);
});

test('no active window, target already passed today -> tomorrow', () => {
  const now = at(BASE, 9, 30);
  const plan = computePlan({ slotTime: '08:00', resetsAt: null, now });

  assert.strictEqual(plan.targetAt.getTime(), at(BASE, 8, 0, 1).getTime());
  // gap ~22.5h -> floor(22.5/5)=4 fillers
  assert.strictEqual(plan.numFillers, 4);
  assert.strictEqual(plan.triggerTimes.length, 5);
});

test('past resetsAt is treated as no active window', () => {
  const now = at(BASE, 9, 30);
  const resetsAt = at(BASE, 6, 0).toISOString(); // already passed
  const plan = computePlan({ slotTime: '13:00', resetsAt, now });

  assert.strictEqual(plan.windowActive, false);
  assert.strictEqual(plan.currentSessionEnd.getTime(), now.getTime());
  assert.strictEqual(plan.targetAt.getTime(), at(BASE, 13, 0).getTime());
});

test('armed exactly at target with no window -> immediate single trigger', () => {
  const now = at(BASE, 8, 0);
  const plan = computePlan({ slotTime: '08:00', resetsAt: null, now });
  assert.strictEqual(plan.numFillers, 0);
  assert.strictEqual(plan.targetAt.getTime(), now.getTime());
  assert.strictEqual(plan.hasIdle, false);
});

test('fillers are contiguous 5h apart; final trigger is the target after the idle', () => {
  const now = at(BASE, 9, 30);
  const plan = computePlan({ slotTime: '08:00', resetsAt: null, now });
  const t = plan.triggerTimes;
  // The filler triggers (all but the last) are exactly 5h apart.
  for (let i = 1; i < plan.numFillers; i++) {
    assert.strictEqual(t[i].getTime() - t[i - 1].getTime(), FIVE_HOURS_MS);
  }
  // The last trigger is the target.
  const last = t[t.length - 1];
  assert.strictEqual(last.getTime(), plan.targetAt.getTime());
  // The leftover idle slack is always less than a full window.
  const idleMs = plan.idleTo.getTime() - plan.idleFrom.getTime();
  assert.ok(idleMs >= 0 && idleMs < FIVE_HOURS_MS);
  // Idle begins exactly when the last filler ends (its start + 5h) and ends at target.
  if (plan.numFillers > 0) {
    const lastFillerStart = t[plan.numFillers - 1].getTime();
    assert.strictEqual(plan.idleFrom.getTime(), lastFillerStart + FIVE_HOURS_MS);
  }
  assert.strictEqual(plan.idleTo.getTime(), plan.targetAt.getTime());
});

console.log(`\n${passed} tests passed.`);
