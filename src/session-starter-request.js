const { BrowserWindow } = require('electron');

// Use the same Chromium cookie jar as login and usage polling. Never expose the
// cookie to the renderer or copy it to a different host. No automatic POST retry.
async function sessionStarterRequest(org, endpoint, method = 'GET', body, stream = false) {
  const url = new URL(endpoint, 'https://claude.ai');
  if (url.origin !== 'https://claude.ai' || !['GET', 'POST'].includes(method)) {
    throw new Error('Invalid session starter request.');
  }
  const win = new BrowserWindow({ show: false, webPreferences: {
    nodeIntegration: false, contextIsolation: true, sandbox: true
  } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  let timeout;
  try {
    return await Promise.race([
      (async () => {
        // A read-only same-origin document avoids loading the full chat app.
        await win.loadURL('https://claude.ai/api/organizations');
        if (new URL(win.webContents.getURL()).origin !== 'https://claude.ai') {
          throw new Error('Claude sign-in is required.');
        }
        const args = JSON.stringify({ endpoint: url.pathname + url.search, method, body, stream, org });
        const result = await win.webContents.executeJavaScript(`(async (args) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 45000);
          try {
            const response = await fetch(args.endpoint, {
              method: args.method, credentials: 'include', redirect: 'error',
              headers: { 'Content-Type': 'application/json',
                'Accept': args.stream ? 'text/event-stream' : 'application/json',
                'anthropic-version': '2023-06-01',
                'anthropic-beta': 'ccr-triggers-2026-01-30',
                'x-organization-uuid': args.org },
              body: args.body === undefined ? undefined : JSON.stringify(args.body),
              signal: controller.signal
            });
            const text = await response.text();
            return { status: response.status, type: response.headers.get('content-type'), text };
          } finally { clearTimeout(timer); }
        })(${args})`);
        return parseResponse(result, stream);
      })(),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(
        'Claude request timed out. It may have been accepted; no automatic retry was made.'
      )), 60000); })
    ]);
  } finally {
    clearTimeout(timeout);
    if (!win.isDestroyed()) win.destroy();
  }
}

function parseResponse(result, stream) {
  if (result.status < 200 || result.status >= 300) {
    const hints = { 401: 'Sign in to Claude again.', 403: 'Claude blocked the request or requires verification. Open Claude and check your account.',
      429: 'Claude usage or request limit reached.', 404: 'Claude endpoint or routine was not found.' };
    let detail = '';
    if (result.type?.includes('json')) {
      try {
        const payload = JSON.parse(result.text);
        const message = payload.error?.message || payload.message;
        if (typeof message === 'string') detail = message.replace(/sk-[\w-]+/g, '[redacted]').replace(/[\r\n]/g, ' ').slice(0, 240);
      } catch { /* HTTP status remains useful when the error isn't JSON. */ }
    }
    const error = new Error(`Claude returned HTTP ${result.status}. ${hints[result.status] || detail || 'The private API may have changed; check the cloud setup in Claude.'}`);
    error.status = result.status;
    throw error;
  }
  if (!stream) {
    if (!result.type?.includes('json')) throw new Error('Claude returned a verification page instead of JSON. Sign in again.');
    return JSON.parse(result.text);
  }
  if (!result.type?.includes('text/event-stream')) throw new Error('Claude did not return a completion stream.');
  let completed = false;
  for (const frame of result.text.split(/\r?\n\r?\n/)) {
    const event = frame.match(/^event:\s*(\S+)/m)?.[1];
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
    if (!data || data === '[DONE]') continue;
    const value = JSON.parse(data);
    if (event === 'error' || value.type === 'error' || value.error) throw new Error('Claude rejected the scheduled prompt. Check your login, model access and usage limits.');
    if (event === 'message_stop' || value.type === 'message_stop' || value.stop_reason) completed = true;
  }
  if (!completed) throw new Error('Completion was interrupted; it may have used allowance. No retry was made.');
  return { completed: true };
}

module.exports = { sessionStarterRequest, parseResponse };
