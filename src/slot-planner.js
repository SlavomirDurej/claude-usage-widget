/**
 * slot-planner.js
 *
 * Pure planning logic for the Session Slot Scheduler.
 *
 * The Claude.ai 5-hour usage window opens on the first message sent after the
 * previous window resets, and always runs a full 5 hours. Staying idle freezes
 * the boundary. To land a window's start exactly on a target time `Ts`, we
 * arrange for the previous window to have reset at/before `Ts`, then send the
 * first message at `Ts`.
 *
 * This module is deliberately dependency-free and side-effect-free so it can be
 * unit-tested with a plain Node script (the project has no test framework).
 */

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

/**
 * Parse an "HH:MM" 24-hour string into { hours, minutes }.
 * @param {string} slotTime
 * @returns {{hours:number, minutes:number}}
 */
function parseSlotTime(slotTime) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(slotTime).trim());
  if (!m) throw new Error(`Invalid slot time: ${slotTime}`);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid slot time: ${slotTime}`);
  }
  return { hours, minutes };
}

/**
 * Return the earliest Date at local `slotTime` that is >= `after`.
 * @param {string} slotTime - "HH:MM" local
 * @param {Date} after
 * @returns {Date}
 */
function nextOccurrence(slotTime, after) {
  const { hours, minutes } = parseSlotTime(slotTime);
  const candidate = new Date(after);
  candidate.setHours(hours, minutes, 0, 0);
  if (candidate.getTime() < after.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

/**
 * Determine whether a window is currently active from a resets_at timestamp.
 * @param {string|number|Date|null|undefined} resetsAt
 * @param {Date} now
 * @returns {boolean}
 */
function isWindowActive(resetsAt, now) {
  if (!resetsAt) return false;
  const end = new Date(resetsAt);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() > now.getTime();
}

/**
 * Compute the alignment plan for an armed slot.
 *
 * @param {Object} opts
 * @param {string} opts.slotTime - target start time, "HH:MM" local
 * @param {string|number|Date|null} opts.resetsAt - current window reset (or null)
 * @param {Date} [opts.now] - current time (defaults to new Date())
 * @returns {{
 *   currentSessionEnd: Date,   // E — when the active window ends, or `now`
 *   windowActive: boolean,     // is a window running right now
 *   targetAt: Date,            // Ts — when the real target window opens
 *   numFillers: number,        // number of filler windows opened before target
 *   triggerTimes: Date[],      // every auto-send time, ascending, ending at targetAt
 *   idleFrom: Date,            // start of the "do not send" guard window
 *   idleTo: Date,              // end of the guard window (== first trigger)
 *   hasIdle: boolean           // whether there is a non-zero idle guard window
 * }}
 */
function computePlan({ slotTime, resetsAt, now = new Date() }) {
  const active = isWindowActive(resetsAt, now);
  const currentSessionEnd = active ? new Date(resetsAt) : new Date(now);

  const targetAt = nextOccurrence(slotTime, currentSessionEnd);
  const gap = targetAt.getTime() - currentSessionEnd.getTime();
  const numFillers = Math.max(0, Math.floor(gap / FIVE_HOURS_MS));

  const startMs = currentSessionEnd.getTime();

  // End placement: run the filler windows back-to-back starting the moment the
  // current session ends, and push the leftover idle slack to the very end —
  // the stretch right before the target. For a morning target this lands the
  // "do not send" idle in the pre-dawn hours (while you're asleep) instead of
  // wasting your waking daytime, which is what the user actually wants.
  const triggerTimes = [];
  for (let k = 0; k < numFillers; k++) {
    triggerTimes.push(new Date(startMs + k * FIVE_HOURS_MS));
  }
  triggerTimes.push(new Date(targetAt));

  const lastFillerEnd = startMs + numFillers * FIVE_HOURS_MS;
  const idleFrom = new Date(lastFillerEnd);
  const idleTo = new Date(targetAt);
  const hasIdle = idleTo.getTime() > idleFrom.getTime();

  return {
    currentSessionEnd,
    windowActive: active,
    targetAt,
    numFillers,
    triggerTimes,
    idleFrom,
    idleTo,
    hasIdle,
  };
}

module.exports = {
  FIVE_HOURS_MS,
  parseSlotTime,
  nextOccurrence,
  isWindowActive,
  computePlan,
};
