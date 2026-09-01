'use strict';

function normalizeBounds(bounds, fallback) {
  const source = bounds || {};
  const base = fallback || {};
  const numberOr = (value, fallbackValue) => Number.isFinite(value) ? value : fallbackValue;
  return {
    x: numberOr(source.x, base.x),
    y: numberOr(source.y, base.y),
    width: numberOr(source.width, base.width),
    height: numberOr(source.height, base.height)
  };
}

function intersects(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function visibleArea(rect, area) {
  const left = Math.max(rect.x, area.x);
  const top = Math.max(rect.y, area.y);
  const right = Math.min(rect.x + rect.width, area.x + area.width);
  const bottom = Math.min(rect.y + rect.height, area.y + area.height);
  return { width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

// A display "counts" only when it shows a substantial piece of the window.
// The same threshold gates every branch of recoverBounds, so a 1px sliver
// neither pins a window in place nor claims it for a display.
function clearsVisibilityThreshold(rect, area, minVisibleWidth, minVisibleHeight) {
  if (!intersects(rect, area)) return false;
  const visible = visibleArea(rect, area);
  return visible.width >= Math.min(minVisibleWidth, rect.width)
      && visible.height >= Math.min(minVisibleHeight, rect.height);
}

function clampIntoDisplay(rect, area) {
  const width = Math.min(rect.width, area.width);
  const height = Math.min(rect.height, area.height);
  return {
    width,
    height,
    x: Math.min(Math.max(rect.x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(rect.y, area.y), area.y + area.height - height)
  };
}

// Window-position recovery, three testable rules against one visibility
// threshold (default 80x32):
//   2+ displays clear it  -> straddling monitors: snap fully onto whichever
//                            shows more of the window.
//   exactly 1 clears it   -> substantially visible somewhere: leave it
//                            exactly where the user put it (hanging off a
//                            single display's edge is a choice, and the OS
//                            already offers snapping for people who want it).
//   0 clear it            -> not meaningfully visible anywhere (sliver-only
//                            included): recenter on the primary display.
function recoverBounds(bounds, displays, {
  fallbackWidth = 560,
  fallbackHeight = 400,
  minVisibleWidth = 80,
  minVisibleHeight = 32
} = {}) {
  const workAreas = (displays || [])
    .map((d) => d && (d.workArea || d.bounds))
    .filter((a) => a && [a.x, a.y, a.width, a.height].every(Number.isFinite));

  if (!workAreas.length) {
    return { x: 0, y: 0, width: fallbackWidth, height: fallbackHeight };
  }

  const normalized = normalizeBounds(bounds, {
    x: workAreas[0].x, y: workAreas[0].y, width: fallbackWidth, height: fallbackHeight
  });

  const matches = workAreas.filter((area) =>
    clearsVisibilityThreshold(normalized, area, minVisibleWidth, minVisibleHeight)
  );

  if (matches.length >= 2) {
    const best = matches.reduce((a, b) =>
      visibleArea(normalized, b).width * visibleArea(normalized, b).height
        > visibleArea(normalized, a).width * visibleArea(normalized, a).height ? b : a
    );
    return clampIntoDisplay(normalized, best);
  }

  if (matches.length === 1) {
    return normalized;
  }

  const primary = workAreas[0];
  return {
    ...normalized,
    x: Math.round(primary.x + (primary.width - normalized.width) / 2),
    y: Math.round(primary.y + (primary.height - normalized.height) / 2)
  };
}

module.exports = { normalizeBounds, intersects, visibleArea, clearsVisibilityThreshold, clampIntoDisplay, recoverBounds };
