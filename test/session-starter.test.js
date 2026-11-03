const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SessionStarter, DEFAULTS, nextLocal, utcCron, validateConfig } = require('../src/session-starter');
const { SessionStarterAPI } = require('../src/session-starter-api');
const { parseResponse } = require('../src/session-starter-request');

function fixture() {
  const data = new Map(), calls = [];
  let time = new Date(2026, 8, 21, 5, 55), org = 'org-1', routine = null;
  const api = {
    usage: async () => ({ five_hour: { utilization: 0, resets_at: null } }),
    ping: async () => { calls.push('ping'); },
    environment: async () => 'env-1',
    body: (...args) => new SessionStarterAPI().body(...args),
    findRoutine: async () => routine,
    create: async (_org, body) => { calls.push('create'); routine = { ...body, id: 'trig-1' }; return routine; },
    update: async (_org, id, body) => { calls.push(body.enabled ? 'enable' : 'pause'); routine = { ...routine, ...body, id }; return routine; },
    get: async () => routine
  };
  const service = new SessionStarter({
    store: { get: (key, fallback) => structuredClone(data.has(key) ? data.get(key) : fallback), set: (key, value) => data.set(key, structuredClone(value)) },
    api, getOrganization: () => org, now: () => new Date(time)
  });
  return { service, api, calls, data, restart: () => new SessionStarter({
    store: service.store, api, getOrganization: () => org, now: () => new Date(time)
  }), advance: date => { time = date; }, setOrg: value => { org = value; }, routine: () => routine };
}
const local = { ...DEFAULTS, enabled: true };
const cloud = { ...local, mode: 'cloud' };

test('disabled by default; saving a future local time sends nothing', async () => {
  const f = fixture();
  assert.equal(f.service.snapshot().config.enabled, false);
  await f.service.tick();
  await f.service.save(local);
  await f.service.tick();
  assert.deepEqual(f.calls, []);
});
test('due ping runs once, even across restart and schedule edits', async () => {
  const f = fixture(); await f.service.save(local);
  f.advance(new Date(2026, 8, 21, 6, 0));
  await Promise.all([f.service.tick(), f.service.tick()]);
  assert.equal(f.calls.filter(c => c === 'ping').length, 1);
  f.service = f.restart();
  await f.service.save({ ...local, time: '06:05' });
  f.advance(new Date(2026, 8, 21, 6, 5)); await f.service.tick();
  assert.equal(f.calls.filter(c => c === 'ping').length, 1);
});
test('active window is skipped without a model call', async () => {
  const f = fixture(); await f.service.save(local);
  f.api.usage = async () => ({ five_hour: { resets_at: new Date(2026, 8, 21, 8).toISOString() } });
  f.advance(new Date(2026, 8, 21, 6)); await f.service.tick();
  assert.deepEqual(f.calls, []); assert.match(f.service.snapshot().status, /already active/);
});
test('sleep and late startup skip a missed schedule', async () => {
  const f = fixture(); await f.service.save(local);
  f.advance(new Date(2026, 8, 21, 9)); await f.service.tick();
  assert.deepEqual(f.calls, []); assert.match(f.service.snapshot().status, /Missed/);
  assert.equal(new Date(f.service.snapshot().nextRun).getDate(), 22);
});
test('unknown usage fails closed; network failure cannot cause repeated pings', async () => {
  const f = fixture(); await f.service.save(local);
  f.api.usage = async () => ({});
  f.advance(new Date(2026, 8, 21, 6)); await f.service.tick();
  assert.deepEqual(f.calls, []);
  f.advance(new Date(2026, 8, 22, 6));
  f.api.usage = async () => ({ five_hour: null });
  f.api.ping = async () => { f.calls.push('ping'); throw new Error('timeout'); };
  await f.service.tick(); await f.service.tick();
  assert.deepEqual(f.calls, ['ping']); assert.match(f.service.snapshot().status, /No automatic retry/);
});
test('cloud create is initially disabled, uses chosen model and has no tools or repositories', async () => {
  const f = fixture(); const create = f.api.create;
  f.api.create = async (org, body) => {
    assert.equal(body.enabled, false);
    assert.deepEqual(body.job_config.ccr.session_context.sources, []);
    assert.deepEqual(body.job_config.ccr.session_context.allowed_tools, []);
    assert.equal(body.job_config.ccr.session_context.model, local.model);
    return create(org, body);
  };
  await f.service.save(cloud);
  assert.deepEqual(f.calls, ['create', 'enable']);
  await f.service.save({ ...cloud, time: '07:00' });
  assert.equal(f.calls.filter(c => c === 'create').length, 1);
  assert.equal(f.routine().cron_expression, utcCron('07:00', new Date(2026, 8, 21, 5, 55)));
  f.advance(new Date(2026, 8, 21, 7)); await f.service.tick();
  assert.ok(!f.calls.includes('ping'));
});
test('cloud-to-local pauses remotely first; pause failure leaves cloud settings intact', async () => {
  const f = fixture(); await f.service.save(cloud);
  const update = f.api.update;
  f.api.update = async () => { throw new Error('offline'); };
  await assert.rejects(f.service.save(local), /offline/);
  assert.equal(f.service.snapshot().config.mode, 'cloud');
  f.advance(new Date(2026, 8, 21, 6)); await f.service.tick();
  assert.ok(!f.calls.includes('ping'));
  f.api.update = update;
  await f.service.save(local);
  assert.equal(f.routine().enabled, false);
  assert.equal(f.service.snapshot().config.mode, 'local');
});
test('uncertain creation recovers by stable name rather than duplicating', async () => {
  const f = fixture(); const create = f.api.create;
  f.api.create = async (...args) => { await create(...args); throw new Error('response lost'); };
  await assert.rejects(f.service.save(cloud), /response lost/);
  await f.service.save(cloud);
  assert.equal(f.calls.filter(c => c === 'create').length, 1);
  assert.equal(f.service.snapshot().routineId, 'trig-1');
});
test('uncertain activation blocks a previously enabled local schedule', async () => {
  const f = fixture(); await f.service.save(local);
  const update = f.api.update;
  f.api.update = async (...args) => { await update(...args); throw new Error('response lost'); };
  await assert.rejects(f.service.save(cloud));
  f.advance(new Date(2026, 8, 21, 6)); await f.service.tick();
  assert.ok(!f.calls.includes('ping'));
});
test('logout pauses cloud; profile organization state is isolated', async () => {
  const f = fixture(); await f.service.save(cloud);
  await f.service.disableForAccountChange();
  assert.equal(f.routine().enabled, false);
  assert.equal(f.service.snapshot().config.enabled, false);
  f.setOrg('org-2'); assert.equal(f.service.snapshot().routineId, null);
});
test('cloud response must confirm pause', async () => {
  const f = fixture(); await f.service.save(cloud);
  f.api.update = async () => f.routine();
  await assert.rejects(f.service.save({ ...cloud, enabled: false }), /pause could not be confirmed/);
  assert.equal(f.service.snapshot().config.enabled, true);
});
test('cloud status refresh is read-only and reflects external pause', async () => {
  const f = fixture(); await f.service.save(cloud);
  f.calls.length = 0;
  f.api.get = async () => ({ ...f.routine(), enabled: false });
  await f.service.refreshCloud();
  assert.deepEqual(f.calls, []);
  assert.equal(f.service.snapshot().config.enabled, false);
});
test('local midnight and timezone conversion preserve next calendar day', () => {
  const now = new Date(2026, 8, 21, 23, 59);
  const next = nextLocal('00:00', now);
  assert.equal(next.getDate(), 22);
  assert.equal(next.getHours(), 0);
  assert.equal(utcCron('00:00', now), `${next.getUTCMinutes()} ${next.getUTCHours()} * * *`);
});
test('a slow usage check crossing the grace period sends nothing', async () => {
  const f = fixture(); await f.service.save(local);
  f.advance(new Date(2026, 8, 21, 6, 4));
  f.api.usage = async () => { f.advance(new Date(2026, 8, 21, 6, 6)); return { five_hour: null }; };
  await f.service.tick();
  assert.deepEqual(f.calls, []);
  assert.match(f.service.snapshot().status, /more than five minutes late/);
});
test('validates time bounds and schedules past times tomorrow', () => {
  for (const time of ['24:00', '6:00', '12:60', '', 'bogus']) assert.throws(() => validateConfig({ ...local, time }));
  assert.equal(nextLocal('06:00', new Date(2026, 8, 21, 9)).getDate(), 22);
  assert.equal(validateConfig({ ...local, time: '00:00' }).time, '00:00');
});
test('SSE success, embedded errors, interrupted streams and challenge pages', () => {
  const event = text => ({ status: 200, type: 'text/event-stream', text });
  assert.deepEqual(parseResponse(event('event: message_stop\ndata: {"type":"message_stop"}\n\n'), true), { completed: true });
  assert.throws(() => parseResponse(event('event: error\ndata: {"type":"error"}\n\n'), true), /rejected/);
  assert.throws(() => parseResponse(event('event: ping\ndata: {}\n\n'), true), /interrupted/);
  assert.throws(() => parseResponse({ status: 200, type: 'text/html', text: '<html>' }, false), /verification/);
  assert.throws(() => parseResponse({ status: 403 }, false), /HTTP 403/);
});
test('local request uses a new temporary conversation and one completion', async () => {
  const calls = [];
  const api = new SessionStarterAPI(async (...args) => { calls.push(args); return {}; });
  await api.ping('org', local.model, 'Europe/London');
  assert.equal(calls.length, 2);
  assert.equal(calls[0][3].is_temporary, true);
  assert.match(calls[1][1], /\/completion$/);
  assert.equal(calls[1][3].locale, 'en-US');
  assert.equal(calls[1][3].timezone, 'Europe/London');
  assert.equal(calls[1][3].prompt, '1+1= Reply with only the answer. Do not use tools.');
});

test('HTTP 400 rejection can be explicitly rescheduled today without an immediate retry', async () => {
  const f = fixture(); await f.service.save(local);
  f.api.ping = async () => { f.calls.push('rejected'); throw Object.assign(new Error('locale validation'), { status: 400 }); };
  f.advance(new Date(2026, 8, 21, 6)); await f.service.tick();
  await f.service.tick();
  assert.deepEqual(f.calls, ['rejected']);
  f.api.ping = async () => { f.calls.push('ping'); };
  await f.service.save({ ...local, time: '06:05' });
  assert.deepEqual(f.calls, ['rejected']);
  f.advance(new Date(2026, 8, 21, 6, 5)); await f.service.tick();
  assert.deepEqual(f.calls, ['rejected', 'ping']);
});
test('the already-persisted en-GB failure can be explicitly re-armed', async () => {
  const f = fixture(); await f.service.save(local);
  const state = f.service.read();
  state.lastAttemptDay = '2026-9-21';
  state.status = "Scheduled attempt stopped: Claude returned HTTP 400. locale: Input should be 'en-US' No automatic retry today.";
  f.service.write('org-1', state);
  await f.service.save({ ...local, time: '06:05' });
  assert.equal(f.service.read().lastAttemptDay, undefined);
  assert.deepEqual(f.calls, []);
});
test('changing time after an ambiguous failure cannot duplicate a completion', async () => {
  const f = fixture(); await f.service.save(local);
  f.api.ping = async () => { f.calls.push('ping'); throw new Error('response lost'); };
  f.advance(new Date(2026, 8, 21, 6)); await f.service.tick();
  await f.service.save({ ...local, time: '06:05' });
  f.advance(new Date(2026, 8, 21, 6, 5)); await f.service.tick();
  assert.deepEqual(f.calls, ['ping']);
});
test('HTTP 400 in verification after successful completion cannot be re-armed', async () => {
  const f = fixture(); await f.service.save(local);
  let reads = 0;
  f.api.usage = async () => {
    if (reads++ > 0) throw Object.assign(new Error('bad usage query'), { status: 400 });
    return { five_hour: null };
  };
  f.advance(new Date(2026, 8, 21, 6)); await f.service.tick();
  await f.service.save({ ...local, time: '06:05' });
  f.advance(new Date(2026, 8, 21, 6, 5)); await f.service.tick();
  assert.deepEqual(f.calls, ['ping']);
});
