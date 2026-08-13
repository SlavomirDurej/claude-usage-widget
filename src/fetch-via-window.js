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

/**
 * Known error signatures returned when Claude.ai blocks or changes behaviour.
 * If the extracted body matches one of these patterns we throw a specific error
 * so callers can react (e.g. prompt re-login).
 *
 * Note: 429 rate-limit responses are classified separately as `RateLimited`
 * (transient — caller may retry without invalidating the session). The
 * patterns below identify session-bound conditions, where retrying with the
 * same cookie will not help.
 */
const BLOCKED_SIGNATURES = [
  { pattern: 'Just a moment', error: 'CloudflareBlocked' },
  { pattern: 'Enable JavaScript and cookies to continue', error: 'CloudflareChallenge' },
  { pattern: '<html', error: 'UnexpectedHTML' },
];

/**
 * Transient rate-limit signatures — these do NOT indicate an invalid session
 * and are safe to retry with backoff. Checked before BLOCKED_SIGNATURES so
 * that a Cloudflare-served 429 page is classified as rate-limit, not block.
 */
const RATE_LIMIT_SIGNATURES = [
  'rate limit',
  'too many requests',
  '"status":429',
  '"status": 429',
];

/**
 * Parse and validate response body text
 * @param {string} bodyText - Raw body text from the page * @returns {Object} Parsed JSON data
 * @throws {Error} If blocked signatures detected or JSON parsing fails
 */
function parseResponseBody(bodyText) {
  // Classify rate-limit responses separately from session-bound blocks.
  // Callers can retry RateLimited with exponential backoff without
  // invalidating sessionKey/organizationId.
  const lower = bodyText.toLowerCase();
  for (const sig of RATE_LIMIT_SIGNATURES) {
    if (lower.includes(sig)) {
      throw new Error(`RateLimited: ${bodyText.substring(0, 200)}`);
    }
  }

  // Detect known block/failure signatures before attempting JSON parse.
  // This provides explicit errors when Claude.ai modifies their API or CSP.
  for (const sig of BLOCKED_SIGNATURES) {
    if (bodyText.includes(sig.pattern)) {
      throw new Error(`${sig.error}: ${bodyText.substring(0, 200)}`);
    }
  }

  try {
    return JSON.parse(bodyText);
  } catch (parseErr) {
    throw new Error('InvalidJSON: ' + bodyText.substring(0, 200));
  }
}

/**
 * Fetch a single URL using a dedicated BrowserWindow (legacy single-call approach)
 * @param {string} url - URL to fetch
 * @param {Object} options - Options object
 * @param {number} options.timeoutMs - Request timeout in milliseconds (default: 30000)
 * @returns {Promise<Object>} Parsed JSON response
 */
function fetchViaWindow(url, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,      webPreferences: {
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

        const data = parseResponseBody(bodyText);
        resolve(data);
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

/**
 * Fetch multiple URLs sequentially using a single reused BrowserWindow
 * This reduces memory overhead by avoiding repeated window creation/destruction
 * 
 * @param {string[]} urls - Array of URLs to fetch
 * @param {Object} options - Options object
 * @param {number} options.timeoutMs - Per-request timeout in milliseconds (default: 10000)
 * @returns {Promise<Object[]>} Array of parsed JSON responses (or errors)
 */
function fetchMultipleViaWindow(urls, { timeoutMs = 10000 } = {}) {
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

    const results = [];
    let currentIndex = 0;
    let currentTimeout = null;

    /**
     * Load the next URL in the sequence
     */
    function loadNext() {
      if (currentIndex >= urls.length) {
        // All URLs fetched successfully
        win.close();
        resolve(results);
        return;
      }

      const url = urls[currentIndex];
      
      currentTimeout = setTimeout(() => {
        win.close();
        reject(new Error(`Request timeout for URL ${currentIndex}: ${url}`));
      }, timeoutMs);

      win.loadURL(url);
    }

    win.webContents.on('did-finish-load', async () => {
      try {
        const bodyText = await win.webContents.executeJavaScript(
          'document.body.innerText || document.body.textContent'
        );
        
        if (currentTimeout) {
          clearTimeout(currentTimeout);
          currentTimeout = null;
        }

        const data = parseResponseBody(bodyText);
        results.push(data);
        currentIndex++;
        loadNext();
      } catch (err) {
        if (currentTimeout) {
          clearTimeout(currentTimeout);
          currentTimeout = null;
        }
        win.close();
        reject(err);
      }
    });

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      if (currentTimeout) {
        clearTimeout(currentTimeout);
        currentTimeout = null;
      }
      win.close();
      reject(new Error(`LoadFailed at URL ${currentIndex}: ${errorCode} ${errorDescription}`));
    });

    // Start loading the first URL
    loadNext();
  });
}

module.exports = { fetchViaWindow, fetchMultipleViaWindow };
