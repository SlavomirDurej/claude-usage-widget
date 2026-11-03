const fs = require('fs');
const path = require('path');

// Sized against real growth data: baseline lifecycle logging is a handful of
// lines per session (negligible volume), while debug mode at 15s polling
// grows at ~84KB/hour. Overridable via init()'s options for isolated testing;
// production (main.js) never passes overrides, so these are what ships.
const DEFAULTS = {
  rotateSizeBaseline: 5 * 1024 * 1024,   // 5MB per file
  rotateSizeDebug: 15 * 1024 * 1024,     // 15MB per file
  cleanupAgeMsBaseline: 2 * 24 * 60 * 60 * 1000, // 2 days
  cleanupSizeBudgetBaseline: 50 * 1024 * 1024, // 50MB total
};

let rotateSizeBaseline = DEFAULTS.rotateSizeBaseline;
let rotateSizeDebug = DEFAULTS.rotateSizeDebug;
let cleanupAgeMsBaseline = DEFAULTS.cleanupAgeMsBaseline;
let cleanupSizeBudgetBaseline = DEFAULTS.cleanupSizeBudgetBaseline;

let logsDir = null;
let activeFilePath = null;
let debugMode = false;
let startTime = null;
let currentSize = 0;

// Never write these keys' values to a log line, even in debug mode.
const SENSITIVE_KEYS = ['sessionKey', 'session_key', 'cookie', 'token', 'password'];

function redact(message) {
  if (typeof message !== 'string') return message;
  let out = message;
  for (const key of SENSITIVE_KEYS) {
    const re = new RegExp(`(${key}["']?\\s*[:=]\\s*["']?)([^"'\\s,}]+)`, 'gi');
    out = out.replace(re, '$1[REDACTED]');
  }
  return out;
}

function init(userDataPath, options = {}) {
  debugMode = !!options.debug;
  rotateSizeBaseline = options.rotateSizeBaseline ?? DEFAULTS.rotateSizeBaseline;
  rotateSizeDebug = options.rotateSizeDebug ?? DEFAULTS.rotateSizeDebug;
  cleanupAgeMsBaseline = options.cleanupAgeMsBaseline ?? DEFAULTS.cleanupAgeMsBaseline;
  cleanupSizeBudgetBaseline = options.cleanupSizeBudgetBaseline ?? DEFAULTS.cleanupSizeBudgetBaseline;
  logsDir = path.join(userDataPath, 'logs');
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (err) {
    console.error('[Logger] Failed to create logs directory:', err.message);
    logsDir = null;
    return;
  }
  activeFilePath = path.join(logsDir, 'latest.log');
  startTime = Date.now();
  try {
    currentSize = fs.statSync(activeFilePath).size;
  } catch {
    currentSize = 0;
  }
  runCleanup();
}

function formatUptime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}h${m}m${s}s`;
}

function writeLine(level, message) {
  if (!activeFilePath) return; // init() failed or hasn't run yet
  const now = new Date();
  const uptime = startTime ? formatUptime(now.getTime() - startTime) : '0h0m0s';
  const line = `[${now.toISOString()}] [+${uptime}] [${level}] ${redact(message)}\n`;
  try {
    fs.appendFileSync(activeFilePath, line, 'utf-8');
    currentSize += Buffer.byteLength(line, 'utf-8');
    maybeRotate();
  } catch (err) {
    // Logging must never crash the app - fall back to console only.
    console.error('[Logger] Failed to write log line:', err.message);
  }
}

// Baseline: always-on lifecycle logging.
function log(message) {
  writeLine('INFO', message);
}

// Debug: only writes when launched with --debug / DEBUG_LOG=1.
function debugLog(message) {
  if (!debugMode) return;
  writeLine('DEBUG', message);
}

function maybeRotate() {
  const threshold = debugMode ? rotateSizeDebug : rotateSizeBaseline;
  if (currentSize < threshold) return;
  rotate();
}

function rotate() {
  if (!activeFilePath || !logsDir) return;
  if (!fs.existsSync(activeFilePath)) return;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  let rotatedPath = path.join(logsDir, `${timestamp}.log`);
  // Guard against a same-millisecond collision (two rotations back to back) -
  // rare, but a silent overwrite would quietly lose a whole log file.
  let suffix = 1;
  while (fs.existsSync(rotatedPath)) {
    rotatedPath = path.join(logsDir, `${timestamp}-${suffix}.log`);
    suffix += 1;
  }
  try {
    fs.renameSync(activeFilePath, rotatedPath);
  } catch (err) {
    console.error('[Logger] Failed to rotate log file:', err.message);
    return;
  }
  currentSize = 0;
  // Debug logs are never auto-deleted - user/dev clears them manually once done.
  if (!debugMode) runCleanup();
}

function tryDelete(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (err) {
    console.error('[Logger] Failed to delete old log file:', filePath, err.message);
    return false;
  }
}

// Baseline-only. Two independent triggers, either evicts:
//  1. Any rotated file older than CLEANUP_AGE_MS_BASELINE - deleted regardless of size.
//  2. Total folder size over CLEANUP_SIZE_BUDGET_BASELINE - oldest rotated files deleted
//     first until back under budget.
// Never touches latest.log (the active file).
function runCleanup() {
  if (debugMode) return;
  if (!logsDir) return;

  let files;
  try {
    files = fs.readdirSync(logsDir)
      .filter((f) => f !== 'latest.log' && f.endsWith('.log'))
      .map((f) => {
        const fullPath = path.join(logsDir, f);
        try {
          const stat = fs.statSync(fullPath);
          return { path: fullPath, mtime: stat.mtimeMs, size: stat.size };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (err) {
    console.error('[Logger] Failed to list log directory for cleanup:', err.message);
    return;
  }

  const now = Date.now();

  // Trigger 1: age.
  for (const file of files) {
    if (now - file.mtime > cleanupAgeMsBaseline) {
      tryDelete(file.path);
    }
  }

  // Trigger 2: total size budget, oldest first, re-checked against what age
  // eviction actually removed rather than assuming it all succeeded.
  const remaining = files.filter((f) => fs.existsSync(f.path));
  remaining.sort((a, b) => a.mtime - b.mtime);
  let totalSize = remaining.reduce((sum, f) => sum + f.size, 0);
  for (const file of remaining) {
    if (totalSize <= cleanupSizeBudgetBaseline) break;
    if (tryDelete(file.path)) {
      totalSize -= file.size;
    }
  }
}

module.exports = {
  init,
  log,
  debugLog,
  // Exposed for isolated testing (per plan: prove rotation/cleanup before
  // wiring into main.js). Not part of the normal app runtime path.
  _test: {
    rotate,
    runCleanup,
    getState: () => ({ logsDir, activeFilePath, debugMode, currentSize }),
  },
};
