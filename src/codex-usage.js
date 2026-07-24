'use strict';

// Codex CLI (ChatGPT) usage reader.
//
// Ported from the MIT-licensed reference implementation
// ~/projects/claude-codex-usage-dashboard/server.js
// (functions getCodexDayDirectory / readCodexUsage / normalizeCodexWindow).
// Adapted here for the Electron main process: instead of the reference's
// { five, seven, fetchedAt } shape it emits the same field layout the Claude
// usage payload uses (codex_five_hour / codex_seven_day with { utilization,
// resets_at }), so the renderer's row/chart/timer code treats Codex windows
// exactly like the native Claude windows.
//
// The Codex CLI writes session rollouts to
//   ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
// Each JSONL line is a session event; the ones we care about carry
//   payload.type === "token_count" and payload.rate_limits. rate_limits holds
//   up to two windows named primary/secondary, each with used_percent (number),
//   resets_at (Unix SECONDS) and (in current CLI versions) window_minutes.
//
// IMPORTANT: primary/secondary is NOT a stable 5h/weekly mapping. Verified
// against real local data, current Codex CLI puts the WEEKLY window under
// `primary` (window_minutes 10080) with `secondary: null`. So we assign windows
// to the 5h / weekly slots by window_minutes, not by position, and only fall
// back to the positional mapping for older CLI versions that omit
// window_minutes.

const fs = require('fs');
const path = require('path');
const os = require('os');

// How many days back to scan for the newest token_count event. The task pins
// this to a 7-day lookback (the reference used a configurable 14).
const CODEX_LOOKBACK_DAYS = 7;

// window_minutes → slot thresholds (generous, since values may drift a little):
//   ≤ 720 min (12h)  → 5h window   (codex_five_hour)
//   ≥ 4320 min (3d)  → weekly       (codex_seven_day)
//   in between        → ambiguous, discarded
const FIVE_HOUR_MAX_MINUTES = 720;
const SEVEN_DAY_MIN_MINUTES = 4320;

function defaultSessionsDir() {
  return path.join(os.homedir(), '.codex', 'sessions');
}

// ~/.codex/sessions/YYYY/MM/DD for a given Date, rooted at baseDir.
function getCodexDayDirectory(baseDir, date) {
  return path.join(
    baseDir,
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  );
}

// Map one Codex rate-limit window (already assigned to a 5h/weekly slot) onto
// the widget's { utilization, resets_at } shape. Returns null for a
// missing/invalid window so the caller can omit that key entirely ("only return
// present windows").
//
// resets_at is converted from Unix SECONDS to an ISO string via
// new Date(s * 1000).toISOString(), matching the exact format of the Claude
// fields (e.g. "2026-07-26T11:00:00.274449+00:00") that formatResetsAt() and
// updateTimer() in src/renderer/app.js parse with new Date().
//
// Stale rule: if this window's resets_at already lies in the past, the reported
// used_percent belongs to an expired window and no newer session file exists to
// prove continued usage — after a reset with no fresh data real usage is
// unknown but effectively ~0, so we surface { utilization: 0, resets_at: null }.
function normalizeCodexWindow(windowData, nowMs) {
  if (!windowData || typeof windowData.used_percent !== 'number') return null;

  const resetsAtSeconds = windowData.resets_at;
  if (resetsAtSeconds != null) {
    const resetsMs = resetsAtSeconds * 1000;
    if (resetsMs <= nowMs) {
      return { utilization: 0, resets_at: null };
    }
    return {
      utilization: windowData.used_percent,
      resets_at: new Date(resetsMs).toISOString(),
    };
  }

  // No resets_at — cannot judge staleness; keep the reported utilization.
  return { utilization: windowData.used_percent, resets_at: null };
}

/**
 * Read the newest Codex rate-limit windows from the local session rollouts.
 *
 * @param {string} [baseDir] sessions root; defaults to ~/.codex/sessions.
 *   The parameter exists only for tests.
 * @returns {Object} {} when nothing usable is found, otherwise an object with
 *   any subset of { codex_five_hour, codex_seven_day }, each
 *   { utilization: <number>, resets_at: <ISO string|null> }.
 */
function readCodexUsage(baseDir) {
  // Whole-function guard: a corrupt directory or unexpected fs error must never
  // crash the usage fetch — degrade to "no Codex data".
  try {
    const root = baseDir || defaultSessionsDir();
    if (!fs.existsSync(root)) return {};

    const nowMs = Date.now();
    let newest = null; // { timestamp, rateLimits }

    for (let dayOffset = 0; dayOffset < CODEX_LOOKBACK_DAYS; dayOffset += 1) {
      const day = new Date(nowMs - dayOffset * 86400000);
      const dir = getCodexDayDirectory(root, day);
      if (!fs.existsSync(dir)) continue;

      let files = [];
      try {
        files = fs.readdirSync(dir)
          .filter((fileName) => fileName.startsWith('rollout-') && fileName.endsWith('.jsonl'));
      } catch (error) {
        continue; // unreadable directory — skip silently
      }

      for (const fileName of files) {
        const filePath = path.join(dir, fileName);
        let lines = [];
        try {
          lines = fs.readFileSync(filePath, 'utf8').split('\n');
        } catch (error) {
          continue; // unreadable file — skip silently
        }

        for (const line of lines) {
          // Cheap prefilter before JSON.parse; the relevant events all mention
          // token_count.
          if (!line || !line.includes('token_count')) continue;

          let event = null;
          try {
            event = JSON.parse(line);
          } catch (error) {
            continue; // broken JSON line — skip silently
          }

          const payload = event && event.payload;
          if (!payload || payload.type !== 'token_count' || !payload.rate_limits) continue;

          const timestamp = Date.parse(event.timestamp || 0);
          if (!timestamp) continue;

          if (!newest || timestamp > newest.timestamp) {
            newest = { timestamp, rateLimits: payload.rate_limits };
          }
        }
      }
    }

    if (!newest) return {};

    const slots = assignWindowSlots(newest.rateLimits);
    const result = {};
    const five = normalizeCodexWindow(slots.codex_five_hour, nowMs);
    const seven = normalizeCodexWindow(slots.codex_seven_day, nowMs);
    if (five) result.codex_five_hour = five;
    if (seven) result.codex_seven_day = seven;
    return result;
  } catch (error) {
    return {};
  }
}

// Assign the primary/secondary rate-limit windows of one event to the 5h /
// weekly slots. Preferred path: by window_minutes (position-independent, since
// current CLI versions put the weekly window under primary). Fallback for older
// CLI versions that omit window_minutes: positional (primary → 5h,
// secondary → weekly). Collision rule: if two windows map to the same slot, the
// first one (primary before secondary) wins and the later one is ignored — this
// does not occur in practice with real data.
function assignWindowSlots(rateLimits) {
  const slots = { codex_five_hour: null, codex_seven_day: null };
  const ordered = [
    ['codex_five_hour', rateLimits.primary],
    ['codex_seven_day', rateLimits.secondary],
  ];

  for (const [positionalSlot, win] of ordered) {
    if (!win) continue;

    let slotKey;
    if (typeof win.window_minutes === 'number') {
      if (win.window_minutes <= FIVE_HOUR_MAX_MINUTES) slotKey = 'codex_five_hour';
      else if (win.window_minutes >= SEVEN_DAY_MIN_MINUTES) slotKey = 'codex_seven_day';
      else slotKey = null; // ambiguous window size — discard
    } else {
      slotKey = positionalSlot; // older CLI: fall back to positional mapping
    }

    if (!slotKey) continue;
    if (slots[slotKey] == null) slots[slotKey] = win; // collision: first wins
  }

  return slots;
}

module.exports = { readCodexUsage, getCodexDayDirectory, normalizeCodexWindow, assignWindowSlots };
