# Session Slot Scheduler — Design

Date: 2026-07-11
Feature branch: `feature/session-slot-scheduler`

## Problem

Claude.ai enforces a rolling 5-hour usage window. The window opens the moment
you send the first message after the previous window has reset, and it always
runs a full 5 hours. Because most users just fire off a message whenever, their
window boundaries drift to arbitrary times (9 AM–2 PM, 2 PM–7 PM, 7 PM–12 AM …)
and never line up with the hours they actually want to work.

The user wants to *target* specific start times — "I want my 5-hour slot to
begin at 8 AM" — and have the widget put the window there automatically by
sending a single throwaway message ("hi") at exactly the right moment.

## Core mechanic (the lever)

A window's start time only advances when you send the **first message after a
reset**. Staying idle freezes the boundary — the next window will not begin
until a message is sent. So aligning to a target time `Ts` means:

1. Ensure no active window is still running past `Ts` (the previous window has
   reset at or before `Ts`).
2. Send the first message exactly at `Ts`.

The widget already holds an authenticated Claude.ai session, so it can send that
message for you.

## Decisions (from brainstorming)

- **Trigger:** auto-send "hi" via the Claude.ai API using the stored session.
- **Scheduling model:** multiple named slots (e.g. Early 08:00, Mid 13:00); arm
  one per day.
- **Message target:** a single dedicated, reused conversation ("⏱ Slot
  Starter") so the chat list isn't flooded with "hi" threads.
- **Filler handling:** fully auto-manage the chain — the widget also opens the
  optional filler windows between now and the target so no usable time is
  wasted, while still guaranteeing the target landing.
- **Guard style:** prominent in-widget banner **plus** desktop notifications.

## Planner algorithm

Inputs: `slotTime` ("HH:MM", local), `resetsAt` (ISO of current window reset, or
null / past when no window is active), `now`.

```
E  = active window? new Date(resetsAt) : now          // current session end
Ts = next occurrence of slotTime at-or-after E         // target start
gap = Ts - E
FIVE_H = 5h
numFillers = floor(gap / FIVE_H)
firstFiller = Ts - numFillers * FIVE_H                 // >= E, so idle < 5h
idleFrom = E
idleTo   = firstFiller                                 // == Ts when numFillers == 0
triggerTimes = [firstFiller, firstFiller+FIVE_H, …, Ts]  // numFillers + 1 sends
```

Filler windows are placed contiguous, ending exactly at `Ts`, with the leftover
idle pushed to the front (right after the current session ends). The widget
auto-sends "hi" at every `triggerTime`. Filler windows are the user's to use or
ignore; opening one costs a single throwaway message. The final trigger at `Ts`
opens the real target window and is guaranteed regardless of whether the fillers
were used.

Worked examples (target 08:00):
- Current ends 05:00 → gap 3h, 0 fillers → idle 05:00–08:00, one send at 08:00.
- Current ends 00:00 → gap 8h, 1 filler → idle 00:00–03:00, send 03:00 (filler
  03:00–08:00), send 08:00 (target).
- No active window, armed at 07:10 → Ts today 08:00 → idle until 08:00, send.
- No active window, armed at 09:30 (08:00 passed) → Ts tomorrow 08:00.

## Guard

The widget cannot stop the user typing directly in claude.ai, so during the
front idle window `[idleFrom, idleTo]` it shows a prominent banner
("IDLE until 8:00 AM to hit your target — don't send anything") and fires a
desktop notification when the idle window starts. Sending during the idle window
would open a misaligned window and push the target to its next occurrence.

## Robustness / re-planning

- On every usage refresh and on a 15-second scheduler tick, the plan is
  recomputed from the current `resetsAt`. If the user broke the plan (sent a
  message during idle → `resetsAt` jumped), the boundary shift is detected, the
  plan recomputed, and a "Plan changed" notification fired.
- Missed triggers (app closed / machine asleep): on launch / next tick the
  planner recomputes to the next valid target and notifies that a trigger was
  missed.
- Send failures fall back to a desktop notification asking the user to send "hi"
  manually, so a flaky API never silently drops the slot.
- Arming is one-shot per day: after the final target trigger fires, the slot is
  disarmed and the user re-arms next day. (Daily-repeat is a future extension.)

## Architecture

The scheduler, planner, and sender live in the **main process** — triggers must
fire reliably regardless of renderer state, and the send needs a `BrowserWindow`.

- `src/slot-planner.js` — pure `computePlan({ slotTime, resetsAt, now })`.
  Unit-tested with a plain Node script (no test framework in the project).
- `src/slot-sender.js` — `sendSlotStarter({ organizationId, conversationId })`.
  Loads `https://claude.ai` in a hidden `BrowserWindow` and runs a `fetch()`
  **in the page context** (rides session cookies + real Chrome UA, bypassing
  Cloudflare, same trick as `fetch-via-window.js` but for POST). Creates the
  dedicated conversation on first use, reuses its UUID after.
- `main.js` — slot CRUD + arm/disarm IPC, a 15s scheduler interval, plan
  recompute on refresh, `slot-update` push to the renderer, desktop
  notifications.
- `preload.js` — expose `getSlots/saveSlots/armSlot/disarmSlot/getSlotState`
  and an `onSlotUpdate` listener.
- `index.html` + `app.js` + `styles.css` — a "Slots" toolbar toggle opening a
  panel: named-slot list with add/edit/delete, an Arm button per slot, a live
  plan panel, and the guard banner.

## Data model (electron-store)

- `slots`: `[{ id, label, time }]` (defaults seeded on first run).
- `armedSlot`: `{ slotId, firedUpTo }` or null.
- `slotStarterConversationId`: reused conversation UUID.

## Out of scope (YAGNI)

- Daily-repeat arming, per-slot notification customization, weekly-limit-aware
  planning. Revisit only if requested.
