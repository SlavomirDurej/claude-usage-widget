const { randomUUID } = require('crypto');
const { MODELS } = require('./session-starter-api');

const DEFAULTS = { enabled: false, mode: 'local', time: '06:00', model: MODELS[0] };
const GRACE_MS = 5 * 60 * 1000;
function validateConfig(input) {
  if (!input || typeof input.enabled !== 'boolean' || !['local', 'cloud'].includes(input.mode) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time) || !MODELS.includes(input.model)) {
    throw new Error('Choose a valid time, mode and model for the session starter.');
  }
  return { enabled: input.enabled, mode: input.mode, time: input.time, model: input.model };
}
function nextLocal(time, now = new Date()) {
  const [h, m] = time.split(':').map(Number);
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}
function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
function utcCron(time, now) {
  const next = nextLocal(time, now);
  return `${next.getUTCMinutes()} ${next.getUTCHours()} * * *`;
}

class SessionStarter {
  constructor({ store, api, getOrganization, onChange = () => {}, onUsage = () => {}, now = () => new Date() }) {
    Object.assign(this, { store, api, getOrganization, onChange, onUsage, now });
    this.busy = false;
  }
  key(org) { return `sessionStarter.accounts.${encodeURIComponent(org).replace(/\./g, '%2E')}`; }
  read(org = this.getOrganization()) {
    return org ? this.store.get(this.key(org), {}) : {};
  }
  write(org, state) {
    this.store.set(this.key(org), state);
    if (org === this.getOrganization()) this.onChange(this.snapshot());
  }
  snapshot() {
    const state = this.read();
    return { config: state.config || { ...DEFAULTS }, status: state.status || 'Off. No requests are scheduled.',
      nextRun: state.nextRun || null, routineId: state.routineId || null,
      cloudCron: state.cloudCron || null, savedTimezone: state.savedTimezone || null,
      busy: this.busy };
  }
  async refreshCloud() {
    if (this.busy) return this.snapshot();
    const org = this.getOrganization(), state = this.read(org);
    if (!org || !state.routineId || !state.config?.enabled || state.config.mode !== 'cloud') return this.snapshot();
    this.busy = true;
    try {
      const routine = await this.api.get(org, state.routineId);
      state.nextRun = routine.enabled ? routine.next_run_at || null : null;
      if (routine.enabled === false) {
        state.config.enabled = false;
        state.cloudMayBeEnabled = false;
        state.status = 'Cloud routine is paused in Claude.';
      } else {
        state.status = 'Cloud routine is enabled. Open it in Claude to inspect completed runs.';
        if (routine.cron_expression !== state.cloudCron) {
          state.syncError = true;
          state.status = 'Cloud schedule was changed in Claude. Click Save to apply the time shown here.';
        }
      }
    } catch (error) {
      state.status = `Cloud status could not be refreshed: ${error.message} The existing cloud schedule may still run.`;
    } finally {
      this.busy = false;
      this.write(org, state);
    }
    return this.snapshot();
  }
  async save(input) {
    const config = validateConfig(input);
    const org = this.getOrganization();
    if (!org) throw new Error('Sign in to Claude before enabling session start.');
    if (this.busy) throw new Error('A session starter operation is in progress. Please try again shortly.');
    this.busy = true;
    const state = this.read(org);
    try {
      if (JSON.stringify(config) === JSON.stringify(state.config) && !state.syncError &&
          !(config.enabled && config.mode === 'cloud' && state.cloudCron !== utcCron(config.time, this.now()))) return this.snapshot();
      // A failed cloud create can have succeeded server-side. Recover its ID
      // before enabling local mode or creating another routine.
      if (state.creationPending) {
        const found = await this.api.findRoutine(org, state.routineName);
        if (found) state.routineId = found.id;
        state.creationPending = false;
        this.write(org, state);
      }
      if (config.enabled && config.mode === 'cloud') {
        const cron = utcCron(config.time, this.now());
        if (!state.routineId) {
          state.routineName ||= `Widget session starter ${randomUUID().slice(0, 8)}`;
          state.environmentId ||= await this.api.environment(org);
          // Persist the unique name BEFORE posting to recover ambiguous timeouts.
          state.creationPending = true;
          this.write(org, state);
          const routine = await this.api.create(org, this.api.body(state.routineName, config, state.environmentId, cron));
          state.routineId = routine.id;
          state.creationPending = false;
          this.write(org, state);
        }
        const existing = await this.api.get(org, state.routineId);
        const environmentId = state.environmentId || existing.job_config?.ccr?.environment_id;
        if (!environmentId) throw new Error('The cloud routine has no environment. Open it in Claude to inspect its setup.');
        const body = this.api.body(state.routineName, config, environmentId, cron);
        // Mark uncertainty before any operation that could enable cloud execution.
        state.cloudMayBeEnabled = true;
        this.write(org, state);
        await this.api.update(org, state.routineId, { ...body, enabled: true, clear_mcp_connections: true });
        const verified = await this.api.get(org, state.routineId);
        if (verified.enabled !== true || verified.cron_expression !== cron) throw new Error('Cloud schedule could not be confirmed. Check the routine in Claude.');
        state.nextRun = verified.next_run_at || null;
        state.cloudCron = cron;
        state.savedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        state.status = 'Cloud schedule saved. Runs even when the widget is closed.';
      } else {
        // Always pause a tracked routine, including after an uncertain update.
        if (state.routineId) {
          try {
            await this.api.update(org, state.routineId, { enabled: false });
            const verified = await this.api.get(org, state.routineId);
            if (verified.enabled !== false) throw new Error('Cloud pause could not be confirmed.');
          } catch (error) {
            if (error.status !== 404) throw error;
            state.routineId = null;
          }
        }
        state.cloudMayBeEnabled = false;
        // Explicit rescheduling may re-arm a rejected request. Never do this for
        // successful or ambiguous completions, and never retry automatically.
        // Recognize the locale failure persisted by the first release as well.
        const rejected = state.attemptResult === 'rejected' ||
          /^Scheduled attempt stopped: Claude returned HTTP 400\. locale:/.test(state.status || '');
        if (config.enabled && state.config?.mode === 'local' && config.time !== state.config.time && rejected) {
          delete state.lastAttemptDay;
          delete state.attemptResult;
        }
        state.nextRun = config.enabled ? nextLocal(config.time, this.now()).toISOString() : null;
        state.status = config.enabled ? 'Local schedule saved. Keep the computer awake and widget running.' : 'Off. Cloud routine paused; no local requests scheduled.';
        state.clockZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
      state.config = config;
      state.syncError = false;
      this.write(org, state);
      return this.snapshot();
    } catch (error) {
      state.syncError = true;
      state.status = `Could not save: ${error.message}${state.cloudMayBeEnabled ? ' Cloud may still be active; local sending is blocked.' : ''}`;
      this.write(org, state);
      throw new Error(state.status);
    } finally {
      this.busy = false;
      this.onChange(this.snapshot());
    }
  }

  async disableForAccountChange() {
    if (this.busy) throw new Error('Wait for the session starter operation to finish before changing accounts or logging out.');
    if (!this.getOrganization()) return;
    const state = this.read();
    if (state.config?.enabled || state.cloudMayBeEnabled || state.creationPending) {
      await this.save({ ...(state.config || DEFAULTS), enabled: false });
    }
  }

  async tick() {
    if (this.busy) return;
    const org = this.getOrganization();
    if (!org) return;
    const state = this.read(org), config = state.config;
    if (!config?.enabled || config.mode !== 'local' || state.cloudMayBeEnabled || state.creationPending) return;
    const now = this.now();
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Local wall time follows travel/DST. Recompute a future target on zone change.
    if (!state.nextRun || (state.clockZone && state.clockZone !== zone)) {
      state.nextRun = nextLocal(config.time, now).toISOString();
      state.clockZone = zone;
      this.write(org, state);
      return;
    }
    const due = new Date(state.nextRun);
    if (now < due) return;
    state.nextRun = nextLocal(config.time, now).toISOString();
    if (now - due > GRACE_MS) {
      state.status = 'Missed scheduled start while unavailable. Skipped; next attempt tomorrow.';
      this.write(org, state);
      return;
    }
    const today = dayKey(now);
    if (state.lastAttemptDay === today) { this.write(org, state); return; }
    this.busy = true;
    // Persist before sending: process crashes or network ambiguity must not duplicate a ping.
    state.lastAttemptDay = today;
    state.attemptResult = 'pending';
    state.status = 'Checking for an active session…';
    this.write(org, state);
    let promptCompleted = false;
    try {
      const usage = await this.api.usage(org);
      if (!Object.prototype.hasOwnProperty.call(usage || {}, 'five_hour')) throw new Error('Usage response has no session counter. No prompt sent.');
      if (this.now() - due > GRACE_MS) throw new Error('The scheduled start is now more than five minutes late. No prompt sent.');
      const reset = Date.parse(usage.five_hour?.resets_at);
      if (Number.isFinite(reset) && reset > now.getTime()) {
        state.attemptResult = 'skipped';
        state.status = 'Skipped: a session window is already active.';
      } else {
        state.status = 'Sending the scheduled prompt…';
        this.write(org, state);
        await this.api.ping(org, config.model, zone);
        promptCompleted = true;
        state.attemptResult = 'completed';
        state.status = 'Prompt completed. Waiting for the session reset time to appear.';
        this.write(org, state);
        // Read-only verification; never retry model calls.
        let confirmed = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          const updated = await this.api.usage(org);
          this.onUsage(updated);
          if (Date.parse(updated.five_hour?.resets_at) > this.now().getTime()) {
            state.status = `Session started. Resets at ${new Date(updated.five_hour.resets_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
            confirmed = true;
            break;
          }
        }
        if (!confirmed) state.status = 'Prompt completed; session reset time is not yet confirmed. No further prompt will be sent today.';
      }
    } catch (error) {
      if (!promptCompleted) state.attemptResult = error.status === 400 ? 'rejected' : 'uncertain';
      state.status = `Scheduled attempt stopped: ${error.message} No automatic retry today.`;
      if (state.attemptResult === 'rejected') state.status += ' Choose a new future time and click Save to try again today.';
    } finally {
      this.write(org, state);
      this.busy = false;
      this.onChange(this.snapshot());
    }
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch(() => {}), 15000);
    this.timer.unref?.();
    this.tick().catch(() => {});
  }
  stop() { clearInterval(this.timer); this.timer = null; }
}

module.exports = { SessionStarter, DEFAULTS, GRACE_MS, validateConfig, nextLocal, utcCron };
