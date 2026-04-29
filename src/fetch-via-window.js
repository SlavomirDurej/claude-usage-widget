/**
 * fetch-via-window.js
 *
 * Fetches JSON from a URL using a hidden BrowserWindow.
 *
 * Why this exists:
 * Claude.ai uses Cloudflare protection and detects Electron's default
 * request headers, blocking standard Node.js fetch/http requests.
 * By loading the URL in a hidden BrowserWindow with a spoofed Chrome
 * User-Agent, we ride on the browser session cookies and bypass
 * Cloudflare's bot detection. This is the simplest reliable approach
 * after the previous cookie-database-reading strategy proved too
 * fragile and OS-specific.
 */
const { BrowserWindow } = require('electron');
const { classifyBody } = require('./body-classifier');

function fetchViaWindow(url, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const timeout = setTimeout(() => {
      win.close();
      reject(new Error('Request timeout'));
    }, timeoutMs);

    win.webContents.on('did-finish-load', async () => {
      try {
        const bodyText = await win.webContents.executeJavaScript(
          'document.body.innerText || document.body.textContent'
        );
        clearTimeout(timeout);
        win.close();

        const result = classifyBody(bodyText);
        if (result.kind === 'json') {
          resolve(result.payload);
        } else if (result.kind === 'invalid-json') {
          reject(new Error(`InvalidJSON: ${result.snippet}`));
        } else {
          // cloudflare-blocked / cloudflare-challenge / unexpected-html
          reject(new Error(`${result.errorTag}: ${result.snippet}`));
        }
      } catch (err) {
        clearTimeout(timeout);
        win.close();
        reject(err);
      }
    });

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      clearTimeout(timeout);
      win.close();
      reject(new Error(`LoadFailed: ${errorCode} ${errorDescription}`));
    });

    win.loadURL(url);
  });
}

module.exports = { fetchViaWindow };
