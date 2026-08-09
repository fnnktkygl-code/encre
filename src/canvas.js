"use strict";

const MAX_HISTORY = 16;

/**
 * Creates a duplicate copy of a canvas.
 */
export function cloneCanvas(source) {
  const c = document.createElement('canvas');
  c.width = source.width;
  c.height = source.height;
  c.getContext('2d').drawImage(source, 0, 0);
  return c;
}

/**
 * Converts screen/pointer event coordinates into internal canvas pixel coordinates.
 */
export function getCanvasPoint(evt, overlayCanvas) {
  const rect = overlayCanvas.getBoundingClientRect();
  const scaleX = overlayCanvas.width / rect.width;
  const scaleY = overlayCanvas.height / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY
  };
}

/**
 * Renders a blurred sub-region using GPU canvas filters.
 */
export function drawBlurredRegion(destCtx, sourceCanvas, x, y, w, h, radius) {
  const pad = Math.ceil(radius * 1.5);
  const sx = Math.max(0, x - pad);
  const sy = Math.max(0, y - pad);
  const ex = Math.min(sourceCanvas.width, x + w + pad);
  const ey = Math.min(sourceCanvas.height, y + h + pad);
  const sw = Math.max(1, ex - sx);
  const sh = Math.max(1, ey - sy);

  const tmp = document.createElement('canvas');
  tmp.width = sw;
  tmp.height = sh;
  const tctx = tmp.getContext('2d');
  tctx.filter = `blur(${radius}px)`;
  tctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  destCtx.drawImage(tmp, x - sx, y - sy, w, h, x, y, w, h);
}

/**
 * Renders a pixelated sub-region using nearest-neighbor downscaling.
 */
export function drawPixelatedRegion(destCtx, sourceCanvas, x, y, w, h, blockSize) {
  const cols = Math.max(1, Math.round(w / blockSize));
  const rows = Math.max(1, Math.round(h / blockSize));

  const tmp = document.createElement('canvas');
  tmp.width = cols;
  tmp.height = rows;
  const tctx = tmp.getContext('2d');
  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(sourceCanvas, x, y, w, h, 0, 0, cols, rows);

  const prevSmoothing = destCtx.imageSmoothingEnabled;
  destCtx.imageSmoothingEnabled = false;
  destCtx.drawImage(tmp, 0, 0, cols, rows, x, y, w, h);
  destCtx.imageSmoothingEnabled = prevSmoothing;
}

/**
 * Applies redaction, blur, or pixelation to a rectangular area.
 */
export function applyToClippedRect(destCanvas, sourceCanvas, x, y, w, h, mode, params) {
  const ctx = destCanvas.getContext('2d');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  if (mode === 'redact') {
    ctx.fillStyle = params.color;
    ctx.fillRect(x, y, w, h);
  } else if (mode === 'blur') {
    drawBlurredRegion(ctx, sourceCanvas, x, y, w, h, params.blurRadius);
  } else {
    drawPixelatedRegion(ctx, sourceCanvas, x, y, w, h, params.pixelSize);
  }
  ctx.restore();
}

/**
 * Applies redaction, blur, or pixelation to an oval area.
 */
export function applyToClippedOval(destCanvas, sourceCanvas, cx, cy, rx, ry, mode, params) {
  const x = Math.max(0, cx - rx);
  const y = Math.max(0, cy - ry);
  const w = Math.min(destCanvas.width, cx + rx) - x;
  const h = Math.min(destCanvas.height, cy + ry) - y;
  if (w <= 0 || h <= 0) return;

  const ctx = destCanvas.getContext('2d');
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();

  if (mode === 'redact') {
    ctx.fillStyle = params.color;
    ctx.fillRect(x, y, w, h);
  } else if (mode === 'blur') {
    drawBlurredRegion(ctx, sourceCanvas, x, y, w, h, params.blurRadius);
  } else {
    drawPixelatedRegion(ctx, sourceCanvas, x, y, w, h, params.pixelSize);
  }
  ctx.restore();
}

/**
 * Applies redaction, blur, or pixelation to a polygon (Lasso selection).
 */
export function applyToPolygon(destCanvas, sourceCanvas, points, mode, params) {
  if (points.length < 3) return;

  let rawMinX = points[0].x, rawMaxX = points[0].x;
  let rawMinY = points[0].y, rawMaxY = points[0].y;

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    if (pt.x < rawMinX) rawMinX = pt.x;
    if (pt.x > rawMaxX) rawMaxX = pt.x;
    if (pt.y < rawMinY) rawMinY = pt.y;
    if (pt.y > rawMaxY) rawMaxY = pt.y;
  }

  const minX = Math.max(0, rawMinX);
  const minY = Math.max(0, rawMinY);
  const maxX = Math.min(destCanvas.width, rawMaxX);
  const maxY = Math.min(destCanvas.height, rawMaxY);
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) return;

  const ctx = destCanvas.getContext('2d');
  ctx.save();
  ctx.beginPath();
  points.forEach((p, i) => {
    i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.clip();

  if (mode === 'redact') {
    ctx.fillStyle = params.color;
    ctx.fillRect(minX, minY, w, h);
  } else if (mode === 'blur') {
    drawBlurredRegion(ctx, sourceCanvas, minX, minY, w, h, params.blurRadius);
  } else {
    drawPixelatedRegion(ctx, sourceCanvas, minX, minY, w, h, params.pixelSize);
  }
  ctx.restore();
}

/**
 * Applies a circle clip (Brush stroke dab).
 */
export function applyToCircle(destCanvas, sourceCanvas, cx, cy, r, mode, params) {
  const x = Math.max(0, cx - r);
  const y = Math.max(0, cy - r);
  const w = Math.min(destCanvas.width, cx + r) - x;
  const h = Math.min(destCanvas.height, cy + r) - y;
  if (w <= 0 || h <= 0) return;

  const ctx = destCanvas.getContext('2d');
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  if (mode === 'redact') {
    ctx.fillStyle = params.color;
    ctx.fillRect(x, y, w, h);
  } else if (mode === 'blur') {
    drawBlurredRegion(ctx, sourceCanvas, x, y, w, h, params.blurRadius);
  } else {
    drawPixelatedRegion(ctx, sourceCanvas, x, y, w, h, params.pixelSize);
  }
  ctx.restore();
}

/**
 * Interpolates dabs along a line segment for smooth continuous brush strokes.
 */
export function dabLine(destCanvas, sourceCanvas, p0, p1, r, mode, params) {
  const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const steps = Math.max(1, Math.ceil(dist / Math.max(2, r * 0.5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = p0.x + (p1.x - p0.x) * t;
    const cy = p0.y + (p1.y - p0.y) * t;
    applyToCircle(destCanvas, sourceCanvas, cx, cy, r, mode, params);
  }
}

/**
 * Gets handle coordinates for an interactive shape rectangle (x, y, w, h).
 */
export function getHandleCoordinates(shape) {
  const { x, y, w, h } = shape;
  const midX = x + w / 2;
  const midY = y + h / 2;
  return {
    nw: { x: x, y: y },
    n:  { x: midX, y: y },
    ne: { x: x + w, y: y },
    e:  { x: x + w, y: midY },
    se: { x: x + w, y: y + h },
    s:  { x: midX, y: y + h },
    sw: { x: x, y: y + h },
    w:  { x: x, y: midY }
  };
}

/**
 * Returns hit handle name ('nw', 'se', 'body', etc.) for pointer point.
 */
export function getHandleAtPoint(pt, shape, zoom) {
  if (!shape) return null;
  const handles = getHandleCoordinates(shape);
  const hitRadius = Math.max(14, 20 / zoom); // Touch friendly hit radius

  for (const [key, hPt] of Object.entries(handles)) {
    if (Math.hypot(pt.x - hPt.x, pt.y - hPt.y) <= hitRadius) {
      return key;
    }
  }

  // Check body hit
  if (pt.x >= shape.x && pt.x <= shape.x + shape.w && pt.y >= shape.y && pt.y <= shape.y + shape.h) {
    return 'body';
  }

  return null;
}

/**
 * Renders an interactive shape (redaction effect preview + bounding box + 8 touch handles).
 */
export function drawInteractiveShape(overlayCtx, sourceCanvas, shape, zoom) {
  if (!shape || shape.w <= 0 || shape.h <= 0) return;
  const { type, x, y, w, h, mode } = shape;

  // 1. Render live effect onto overlay
  if (type === 'rect') {
    applyToClippedRect(overlayCtx.canvas, sourceCanvas, x, y, w, h, mode, shape);
  } else if (type === 'oval') {
    applyToClippedOval(overlayCtx.canvas, sourceCanvas, x + w / 2, y + h / 2, w / 2, h / 2, mode, shape);
  }

  // 2. Render bounding box & handles
  overlayCtx.save();
  const lineWidth = Math.max(1.5, 2.5 / zoom);
  const dashLength = Math.max(4, 7 / zoom);

  overlayCtx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  overlayCtx.lineWidth = lineWidth;
  overlayCtx.setLineDash([dashLength, dashLength * 0.7]);

  if (type === 'rect') {
    overlayCtx.strokeRect(x, y, w, h);
  } else if (type === 'oval') {
    overlayCtx.beginPath();
    overlayCtx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    overlayCtx.stroke();
  }

  overlayCtx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  overlayCtx.setLineDash([]);
  overlayCtx.lineWidth = Math.max(0.5, lineWidth / 2);
  if (type === 'rect') {
    overlayCtx.strokeRect(x, y, w, h);
  } else if (type === 'oval') {
    overlayCtx.stroke();
  }

  // 3. Render 8 Touch Handles
  const handles = getHandleCoordinates(shape);
  const handleRadius = Math.max(5, 8 / zoom);

  for (const hPt of Object.values(handles)) {
    overlayCtx.beginPath();
    overlayCtx.arc(hPt.x, hPt.y, handleRadius, 0, Math.PI * 2);
    overlayCtx.fillStyle = '#FFFFFF';
    overlayCtx.fill();
    overlayCtx.lineWidth = Math.max(1, 2 / zoom);
    overlayCtx.strokeStyle = '#C1443B';
    overlayCtx.stroke();
  }

  overlayCtx.restore();
}

/**
 * Pushes canvas snapshot to history stack.
 */
export function pushHistory(rec, snapshot) {
  rec.undoStack.push(snapshot);
  if (rec.undoStack.length > MAX_HISTORY) {
    rec.undoStack.shift();
  }
  rec.redoStack = [];
}

/**
 * Trigger haptic vibration if supported.
 */
export function triggerHaptic() {
  if ('vibrate' in navigator) {
    try { navigator.vibrate(10); } catch (e) { /* ignore */ }
  }
}
