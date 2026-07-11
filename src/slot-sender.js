/**
 * slot-sender.js
 *
 * Sends a single throwaway message ("hi") to Claude.ai to open a fresh 5-hour
 * usage window at a scheduled slot time.
 *
 * Why a hidden BrowserWindow + in-page fetch:
 * Claude.ai sits behind Cloudflare and rejects Electron/Node request headers.
 * By loading https://claude.ai in a hidden BrowserWindow (which carries the
 * logged-in session cookies and a spoofed Chrome User-Agent) and running the
 * fetch() *inside the page context*, the request is same-origin, authenticated,
 * and indistinguishable from the real web app — the same principle as
 * fetch-via-window.js, extended to POST.
 *
 * The message goes to a single dedicated conversation ("Slot Starter") that is
 * created once and reused, so the user's chat list is not flooded with "hi"
 * threads.
 */
const { BrowserWindow } = require('electron');

const SLOT_STARTER_NAME = '⏱ Slot Starter';
const NIL_PARENT_UUID = '00000000-0000-4000-8000-000000000000';

/**
 * Build the in-page script that (re)creates the dedicated conversation if
 * needed and posts a completion. Returns a JSON-serialisable result object.
 *
 * All values are injected as JSON literals so there is no string-escaping risk.
 */
function buildInPageScript({ organizationId, conversationId, name, prompt, parentUuid }) {
  const cfg = JSON.stringify({ organizationId, conversationId, name, prompt, parentUuid });
  return `(async () => {
    const cfg = ${cfg};
    const org = cfg.organizationId;
    const base = '/api/organizations/' + org + '/chat_conversations';

    async function createConversation() {
      const uuid = crypto.randomUUID();
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ uuid, name: cfg.name })
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error('CreateFailed ' + res.status + ' ' + t.slice(0, 160));
      }
      return uuid;
    }

    async function sendCompletion(convId) {
      const res = await fetch(base + '/' + convId + '/completion', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'text/event-stream' },
        credentials: 'same-origin',
        body: JSON.stringify({
          prompt: cfg.prompt,
          parent_message_uuid: cfg.parentUuid,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          attachments: [],
          files: [],
          sync_sources: [],
          rendering_mode: 'messages'
        })
      });
      return res;
    }

    try {
      let convId = cfg.conversationId;
      let created = false;
      if (!convId) { convId = await createConversation(); created = true; }

      let res = await sendCompletion(convId);
      // Reused conversation may have been deleted (404/410) — recreate once.
      if ((res.status === 404 || res.status === 410) && !created) {
        convId = await createConversation();
        created = true;
        res = await sendCompletion(convId);
      }

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        return { ok: false, conversationId: convId, error: 'CompletionFailed ' + res.status + ' ' + t.slice(0, 160) };
      }

      // Drain the SSE stream so the message is fully accepted before we resolve.
      try {
        const reader = res.body && res.body.getReader ? res.body.getReader() : null;
        if (reader) { while (true) { const { done } = await reader.read(); if (done) break; } }
        else { await res.text(); }
      } catch (_) { /* stream end / abort is fine — the message was accepted */ }

      return { ok: true, conversationId: convId, created };
    } catch (e) {
      return { ok: false, conversationId: cfg.conversationId || null, error: String(e && e.message || e) };
    }
  })();`;
}

/**
 * Send the slot-starter message.
 *
 * @param {Object} opts
 * @param {string} opts.organizationId
 * @param {string|null} opts.conversationId - reused conversation UUID, or null
 * @param {number} [opts.timeoutMs=30000]
 * @returns {Promise<{ok:boolean, conversationId:string|null, created?:boolean, error?:string}>}
 */
function sendSlotStarter({ organizationId, conversationId = null, timeoutMs = 30000 }) {
  return new Promise((resolve) => {
    if (!organizationId) {
      resolve({ ok: false, conversationId, error: 'Missing organizationId' });
      return;
    }

    const win = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!win.isDestroyed()) win.close();
      resolve(result);
    };

    const timer = setTimeout(
      () => finish({ ok: false, conversationId, error: 'Timeout' }),
      timeoutMs
    );

    win.webContents.on('did-finish-load', async () => {
      try {
        const script = buildInPageScript({
          organizationId,
          conversationId,
          name: SLOT_STARTER_NAME,
          prompt: 'hi',
          parentUuid: NIL_PARENT_UUID,
        });
        const result = await win.webContents.executeJavaScript(script);
        finish(result || { ok: false, conversationId, error: 'No result' });
      } catch (err) {
        finish({ ok: false, conversationId, error: String(err && err.message || err) });
      }
    });

    win.webContents.on('did-fail-load', (_e, code, desc) => {
      finish({ ok: false, conversationId, error: `LoadFailed ${code} ${desc}` });
    });

    win.loadURL('https://claude.ai');
  });
}

module.exports = { sendSlotStarter, SLOT_STARTER_NAME };
