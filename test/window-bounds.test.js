'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { normalizeBounds, visibleArea, clearsVisibilityThreshold, recoverBounds } = require('../src/window-bounds');

const MAIN = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
const SIDE = { workArea: { x: 1920, y: 0, width: 1280, height: 1024 } };

test('straddling two displays snaps fully onto the one showing more', () => {
  // 560 wide at x=1520: 400px on MAIN, 160px on SIDE — both clear 80x32
  const out = recoverBounds({ x: 1520, y: 100, width: 560, height: 400 }, [MAIN, SIDE]);
  assert.equal(out.x + out.width <= 1920, true, 'fully inside MAIN');
  assert.equal(out.x >= 0, true);
  assert.deepEqual({ w: out.width, h: out.height }, { w: 560, h: 400 });
});

test('hanging off a single display is left exactly alone', () => {
  // 300px visible on MAIN, the rest off the left edge into empty space
  const bounds = { x: -260, y: 100, width: 560, height: 400 };
  const out = recoverBounds(bounds, [MAIN, SIDE]);
  assert.deepEqual(out, bounds);
});

test('sliver-only visibility recenters on primary', () => {
  // 10px visible on MAIN — below the 80px threshold everywhere
  const out = recoverBounds({ x: -550, y: 100, width: 560, height: 400 }, [MAIN, SIDE]);
  assert.equal(out.x, Math.round((1920 - 560) / 2));
  assert.equal(out.y, Math.round((1080 - 400) / 2));
});

test('fully off-screen recenters on primary', () => {
  const out = recoverBounds({ x: 5000, y: 5000, width: 560, height: 400 }, [MAIN, SIDE]);
  assert.equal(out.x, Math.round((1920 - 560) / 2));
});

test('no displays falls back to origin at fallback size', () => {
  assert.deepEqual(recoverBounds({ x: 5, y: 5, width: 300, height: 200 }, []),
    { x: 0, y: 0, width: 560, height: 400 });
});

test('threshold shrinks for windows smaller than it', () => {
  // a 40x20 window fully visible clears the (min(80,40) x min(32,20)) gate
  const bounds = { x: 10, y: 10, width: 40, height: 20 };
  assert.equal(clearsVisibilityThreshold(bounds, MAIN.workArea, 80, 32), true);
  assert.deepEqual(recoverBounds(bounds, [MAIN]), bounds);
});

test('normalizeBounds fills holes from the fallback', () => {
  assert.deepEqual(normalizeBounds({ x: 3 }, { x: 1, y: 2, width: 30, height: 40 }),
    { x: 3, y: 2, width: 30, height: 40 });
});

test('visibleArea clips to the intersection', () => {
  assert.deepEqual(visibleArea({ x: -100, y: 0, width: 300, height: 50 }, MAIN.workArea),
    { width: 200, height: 50 });
});
