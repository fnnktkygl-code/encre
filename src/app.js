"use strict";

import {
  cloneCanvas,
  getCanvasPoint,
  applyToClippedRect,
  applyToClippedOval,
  applyToPolygon,
  dabLine,
  pushHistory,
  triggerHaptic
} from './canvas.js';
import { setupGestures } from './gestures.js';
import { initPWA } from './pwa.js';

(function () {
  "use strict";

  const state = {
    images: [],
    activeId: null,
    tool: 'rect',      // 'rect' | 'oval' | 'lasso' | 'brush'
    mode: 'redact',    // 'redact' | 'blur' | 'pixelate'
    color: '#0a0a0a',
    blurRadius: 18,
    pixelSize: 14,
    brushSize: 46,
    jpegQuality: 92,
    zoom: 1
  };

  // Element references
  const sidebar = document.getElementById('sidebar');
  const thumbList = document.getElementById('thumb-list');
  const toolbar = document.getElementById('toolbar');
  const statusbar = document.getElementById('statusbar');
  const emptyState = document.getElementById('empty-state');
  const canvasStage = document.getElementById('canvas-stage');
  const canvasInner = document.getElementById('canvas-inner');
  const workCanvas = document.getElementById('work-canvas');
  const overlay = document.getElementById('overlay-canvas');
  const originalBadge = document.getElementById('original-badge');
  const fileInput = document.getElementById('file-input');
  const zoomLabel = document.getElementById('zoom-label');
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  const exportAllBtn = document.getElementById('export-all-btn');
  const qualityField = document.getElementById('quality-field');
  const formatSelect = document.getElementById('format-select');

  const workCtx = workCanvas.getContext('2d');
  const overlayCtx = overlay.getContext('2d');

  let gestureHandler = null;

  // Helpers
  function getRecord(id) {
    return state.images.find(img => img.id === id) || null;
  }
  function activeRecord() {
    return getRecord(state.activeId);
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }
  function currentParams() {
    return { color: state.color, blurRadius: state.blurRadius, pixelSize: state.pixelSize };
  }
  function clearOverlay() {
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  }

  // History & Undo / Redo
  function syncRecordFromCanvas(rec) {
    rec.canvas = cloneCanvas(workCanvas);
    updateThumbnail(rec);
  }
  function refreshUndoRedoButtons() {
    const rec = activeRecord();
    undoBtn.disabled = !rec || rec.undoStack.length === 0;
    redoBtn.disabled = !rec || rec.redoStack.length === 0;
  }
  function undo() {
    const rec = activeRecord();
    if (!rec || rec.undoStack.length === 0) return;
    const prev = rec.undoStack.pop();
    rec.redoStack.push(cloneCanvas(workCanvas));
    workCtx.clearRect(0, 0, workCanvas.width, workCanvas.height);
    workCtx.drawImage(prev, 0, 0);
    syncRecordFromCanvas(rec);
    refreshUndoRedoButtons();
    triggerHaptic();
  }
  function redo() {
    const rec = activeRecord();
    if (!rec || rec.redoStack.length === 0) return;
    const next = rec.redoStack.pop();
    pushHistory(rec, cloneCanvas(workCanvas));
    workCtx.clearRect(0, 0, workCanvas.width, workCanvas.height);
    workCtx.drawImage(next, 0, 0);
    syncRecordFromCanvas(rec);
    refreshUndoRedoButtons();
    triggerHaptic();
  }
  function resetActive() {
    const rec = activeRecord();
    if (!rec) return;
    if (!window.confirm("Réinitialiser cette image à sa version originale ? (Action annulable avec Annuler)")) return;
    pushHistory(rec, cloneCanvas(workCanvas));
    workCtx.clearRect(0, 0, workCanvas.width, workCanvas.height);
    workCtx.drawImage(rec.originalCanvas, 0, 0);
    syncRecordFromCanvas(rec);
    refreshUndoRedoButtons();
    triggerHaptic();
  }

  // File loading
  function loadFile(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const rec = {
        id: uuid(),
        name: file.name || 'image',
        width: canvas.width,
        height: canvas.height,
        canvas: canvas,
        originalCanvas: cloneCanvas(canvas),
        undoStack: [],
        redoStack: []
      };
      state.images.push(rec);
      addThumbnail(rec);
      setActiveImage(rec.id);
      updateChromeVisibility();
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      window.alert("Impossible de lire ce fichier comme image.");
    };
    img.src = url;
  }

  function updateChromeVisibility() {
    const hasImages = state.images.length > 0;
    emptyState.classList.toggle('hidden', hasImages);
    canvasInner.style.display = hasImages ? '' : 'none';
    sidebar.classList.toggle('hidden', !hasImages);
    toolbar.classList.toggle('hidden', !hasImages);
    statusbar.classList.toggle('hidden', !hasImages);
    exportAllBtn.style.display = state.images.length > 1 ? '' : 'none';
  }

  // Thumbnails
  function addThumbnail(rec) {
    const item = document.createElement('div');
    item.className = 'thumb';
    item.dataset.id = rec.id;
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', 'Sélectionner ' + rec.name);

    const img = document.createElement('img');
    item.appendChild(img);

    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.setAttribute('aria-label', 'Supprimer ' + rec.name);
    remove.textContent = '×';
    remove.addEventListener('click', (e) => {
      e.stopPropagation();
      removeImage(rec.id);
    });
    item.appendChild(remove);

    item.addEventListener('click', () => setActiveImage(rec.id));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveImage(rec.id); }
    });

    thumbList.appendChild(item);
    updateThumbnail(rec);
  }

  function updateThumbnail(rec) {
    const el = thumbList.querySelector(`[data-id="${rec.id}"] img`);
    if (!el) return;
    const maxDim = 96;
    const scale = Math.min(maxDim / rec.width, maxDim / rec.height, 1);
    const tw = Math.max(1, Math.round(rec.width * scale));
    const th = Math.max(1, Math.round(rec.height * scale));
    const t = document.createElement('canvas');
    t.width = tw; t.height = th;
    t.getContext('2d').drawImage(rec.canvas, 0, 0, tw, th);
    el.src = t.toDataURL('image/png');
  }

  function updateThumbnailSelection() {
    thumbList.querySelectorAll('.thumb').forEach(it => {
      it.classList.toggle('active', it.dataset.id === state.activeId);
    });
  }

  function removeImage(id) {
    const idx = state.images.findIndex(img => img.id === id);
    if (idx === -1) return;
    state.images.splice(idx, 1);
    const el = thumbList.querySelector(`[data-id="${id}"]`);
    if (el) el.remove();
    if (state.activeId === id) {
      state.activeId = null;
      if (state.images.length > 0) {
        setActiveImage(state.images[Math.max(0, idx - 1)].id);
      }
    }
    updateChromeVisibility();
  }

  // Active Image Switching
  function setActiveImage(id) {
    if (state.activeId && state.activeId !== id) {
      const prev = getRecord(state.activeId);
      if (prev) prev.canvas = cloneCanvas(workCanvas);
    }
    state.activeId = id;
    const rec = getRecord(id);
    if (!rec) return;

    workCanvas.width = rec.width;
    workCanvas.height = rec.height;
    overlay.width = rec.width;
    overlay.height = rec.height;
    workCanvas.style.width = rec.width + 'px';
    workCanvas.style.height = rec.height + 'px';
    overlay.style.width = rec.width + 'px';
    overlay.style.height = rec.height + 'px';

    workCtx.clearRect(0, 0, workCanvas.width, workCanvas.height);
    workCtx.drawImage(rec.canvas, 0, 0);
    clearOverlay();

    fitToScreen();
    refreshUndoRedoButtons();
    updateThumbnailSelection();
    updateChromeVisibility();
  }

  // Zoom
  function setZoom(z) {
    state.zoom = Math.min(5, Math.max(0.1, z));
    canvasInner.style.transform = `scale(${state.zoom})`;
    zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
  }
  function zoomBy(delta) { setZoom(state.zoom + delta); }
  function fitToScreen() {
    const rec = activeRecord();
    if (!rec) return;
    const stageRect = canvasStage.getBoundingClientRect();
    const pad = 60;
    const scaleX = (stageRect.width - pad) / rec.width;
    const scaleY = (stageRect.height - pad) / rec.height;
    const s = Math.min(scaleX, scaleY);
    setZoom(Math.max(0.1, Math.min(3, s)));
  }

  // Tool & Mode Selection UI
  function setTool(name) {
    state.tool = name;
    document.querySelectorAll('[data-tool]').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === name);
    });
    document.getElementById('brush-field').style.display = name === 'brush' ? '' : 'none';
    clearOverlay();
  }
  function setMode(name) {
    state.mode = name;
    document.querySelectorAll('[data-mode]').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === name);
    });
    document.getElementById('color-field').style.display = name === 'redact' ? '' : 'none';
    document.getElementById('blur-field').style.display = name === 'blur' ? '' : 'none';
    document.getElementById('pixel-field').style.display = name === 'pixelate' ? '' : 'none';
  }

  document.querySelectorAll('[data-tool]').forEach(b => {
    b.addEventListener('click', () => setTool(b.dataset.tool));
  });
  document.querySelectorAll('[data-mode]').forEach(b => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });

  document.getElementById('color-input').addEventListener('input', (e) => { state.color = e.target.value; });
  document.getElementById('blur-range').addEventListener('input', (e) => {
    state.blurRadius = parseInt(e.target.value, 10);
    document.getElementById('blur-val').textContent = state.blurRadius;
  });
  document.getElementById('pixel-range').addEventListener('input', (e) => {
    state.pixelSize = parseInt(e.target.value, 10);
    document.getElementById('pixel-val').textContent = state.pixelSize;
  });
  document.getElementById('brush-range').addEventListener('input', (e) => {
    state.brushSize = parseInt(e.target.value, 10);
    document.getElementById('brush-val').textContent = state.brushSize;
  });
  document.getElementById('quality-range').addEventListener('input', (e) => {
    state.jpegQuality = parseInt(e.target.value, 10);
    document.getElementById('quality-val').textContent = state.jpegQuality;
  });
  formatSelect.addEventListener('change', () => {
    qualityField.style.display = formatSelect.value === 'jpeg' ? '' : 'none';
  });

  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  document.getElementById('reset-btn').addEventListener('click', resetActive);
  document.getElementById('zoom-in').addEventListener('click', () => zoomBy(0.15));
  document.getElementById('zoom-out').addEventListener('click', () => zoomBy(-0.15));
  document.getElementById('zoom-fit').addEventListener('click', fitToScreen);

  // Before / After Comparison
  const beforeAfterBtn = document.getElementById('before-after');
  function showOriginal() {
    const rec = activeRecord();
    if (!rec) return;
    overlayCtx.drawImage(rec.originalCanvas, 0, 0);
    originalBadge.classList.add('show');
  }
  function hideOriginal() {
    clearOverlay();
    originalBadge.classList.remove('show');
  }
  beforeAfterBtn.addEventListener('pointerdown', showOriginal);
  beforeAfterBtn.addEventListener('pointerup', hideOriginal);
  beforeAfterBtn.addEventListener('pointerleave', hideOriginal);
  beforeAfterBtn.addEventListener('touchend', hideOriginal);

  // Drawing interactions
  let shapeStart = null;
  let lassoPoints = null;
  let brushActive = false;
  let lastPoint = null;
  let preOpSnapshot = null;

  function overlayLineWidth() { return Math.max(1, 2 / state.zoom); }
  function overlayDash() { const d = Math.max(3, 6 / state.zoom); return [d, d * 0.7]; }

  function drawRectPreview(a, b) {
    clearOverlay();
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    overlayCtx.save();
    overlayCtx.strokeStyle = 'rgba(255,255,255,0.95)';
    overlayCtx.lineWidth = overlayLineWidth();
    overlayCtx.setLineDash(overlayDash());
    overlayCtx.strokeRect(x, y, w, h);
    overlayCtx.strokeStyle = 'rgba(0,0,0,0.6)';
    overlayCtx.setLineDash([]);
    overlayCtx.lineWidth = Math.max(0.5, overlayLineWidth() / 2);
    overlayCtx.strokeRect(x, y, w, h);
    overlayCtx.restore();
  }

  function drawOvalPreview(a, b) {
    clearOverlay();
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const rx = Math.abs(b.x - a.x) / 2;
    const ry = Math.abs(b.y - a.y) / 2;
    if (rx < 1 || ry < 1) return;
    overlayCtx.save();
    overlayCtx.strokeStyle = 'rgba(255,255,255,0.95)';
    overlayCtx.lineWidth = overlayLineWidth();
    overlayCtx.setLineDash(overlayDash());
    overlayCtx.beginPath();
    overlayCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    overlayCtx.stroke();
    overlayCtx.strokeStyle = 'rgba(0,0,0,0.6)';
    overlayCtx.setLineDash([]);
    overlayCtx.lineWidth = Math.max(0.5, overlayLineWidth() / 2);
    overlayCtx.stroke();
    overlayCtx.restore();
  }

  function drawLassoPreview(points) {
    clearOverlay();
    if (points.length < 2) return;
    overlayCtx.save();
    overlayCtx.strokeStyle = 'rgba(255,255,255,0.95)';
    overlayCtx.lineWidth = overlayLineWidth();
    overlayCtx.setLineDash(overlayDash());
    overlayCtx.beginPath();
    points.forEach((p, i) => { i === 0 ? overlayCtx.moveTo(p.x, p.y) : overlayCtx.lineTo(p.x, p.y); });
    overlayCtx.stroke();
    overlayCtx.restore();
  }

  function drawBrushCursor(p) {
    clearOverlay();
    overlayCtx.save();
    overlayCtx.strokeStyle = 'rgba(255,255,255,0.95)';
    overlayCtx.lineWidth = overlayLineWidth();
    overlayCtx.beginPath();
    overlayCtx.arc(p.x, p.y, state.brushSize / 2, 0, Math.PI * 2);
    overlayCtx.stroke();
    overlayCtx.restore();
  }

  overlay.addEventListener('pointerdown', (e) => {
    if (!activeRecord()) return;
    if (gestureHandler && gestureHandler.isMultiTouch()) return;
    overlay.setPointerCapture(e.pointerId);
    const p = getCanvasPoint(e, overlay);

    if (state.tool === 'rect' || state.tool === 'oval') {
      shapeStart = p;
      preOpSnapshot = cloneCanvas(workCanvas);
    } else if (state.tool === 'lasso') {
      lassoPoints = [p];
      preOpSnapshot = cloneCanvas(workCanvas);
    } else if (state.tool === 'brush') {
      brushActive = true;
      preOpSnapshot = cloneCanvas(workCanvas);
      lastPoint = p;
      dabLine(workCanvas, preOpSnapshot, p, p, state.brushSize / 2, state.mode, currentParams());
    }
  });

  overlay.addEventListener('pointermove', (e) => {
    if (gestureHandler && gestureHandler.isMultiTouch()) return;
    const p = getCanvasPoint(e, overlay);

    if (state.tool === 'rect' && shapeStart) {
      drawRectPreview(shapeStart, p);
    } else if (state.tool === 'oval' && shapeStart) {
      drawOvalPreview(shapeStart, p);
    } else if (state.tool === 'lasso' && lassoPoints) {
      const lastLassoPt = lassoPoints[lassoPoints.length - 1];
      if (Math.hypot(p.x - lastLassoPt.x, p.y - lastLassoPt.y) > 2) {
        lassoPoints.push(p);
        drawLassoPreview(lassoPoints);
      }
    } else if (state.tool === 'brush') {
      if (brushActive && lastPoint) {
        dabLine(workCanvas, preOpSnapshot, lastPoint, p, state.brushSize / 2, state.mode, currentParams());
        lastPoint = p;
      }
      drawBrushCursor(p);
    }
  });

  function finishShape(e) {
    if (!shapeStart) return;
    const p = getCanvasPoint(e, overlay);
    const x = Math.min(shapeStart.x, p.x), y = Math.min(shapeStart.y, p.y);
    const w = Math.abs(p.x - shapeStart.x), h = Math.abs(p.y - shapeStart.y);
    clearOverlay();
    if (w > 2 && h > 2) {
      const rec = activeRecord();
      pushHistory(rec, preOpSnapshot);
      if (state.tool === 'rect') {
        applyToClippedRect(workCanvas, preOpSnapshot, x, y, w, h, state.mode, currentParams());
      } else if (state.tool === 'oval') {
        const cx = (shapeStart.x + p.x) / 2;
        const cy = (shapeStart.y + p.y) / 2;
        applyToClippedOval(workCanvas, preOpSnapshot, cx, cy, w / 2, h / 2, state.mode, currentParams());
      }
      syncRecordFromCanvas(rec);
      refreshUndoRedoButtons();
      triggerHaptic();
    }
    shapeStart = null;
    preOpSnapshot = null;
  }

  function finishLasso(e) {
    if (state.tool !== 'lasso' || !lassoPoints) return;
    clearOverlay();
    if (lassoPoints.length >= 3) {
      const rec = activeRecord();
      pushHistory(rec, preOpSnapshot);
      applyToPolygon(workCanvas, preOpSnapshot, lassoPoints, state.mode, currentParams());
      syncRecordFromCanvas(rec);
      refreshUndoRedoButtons();
      triggerHaptic();
    }
    lassoPoints = null;
    preOpSnapshot = null;
  }

  function finishBrush() {
    if (state.tool !== 'brush' || !brushActive) return;
    brushActive = false;
    const rec = activeRecord();
    if (rec && preOpSnapshot) {
      pushHistory(rec, preOpSnapshot);
      syncRecordFromCanvas(rec);
      refreshUndoRedoButtons();
      triggerHaptic();
    }
    preOpSnapshot = null;
    lastPoint = null;
  }

  overlay.addEventListener('pointerup', (e) => {
    finishShape(e);
    finishLasso(e);
    finishBrush();
  });
  overlay.addEventListener('pointercancel', () => {
    clearOverlay();
    shapeStart = null; lassoPoints = null; brushActive = false; preOpSnapshot = null; lastPoint = null;
  });
  overlay.addEventListener('pointerleave', () => {
    if (!shapeStart && !lassoPoints && !brushActive) clearOverlay();
  });

  // Import: file input, browse, drag & drop, paste
  fileInput.addEventListener('change', () => {
    Array.from(fileInput.files).forEach(loadFile);
    fileInput.value = '';
  });
  document.getElementById('browse-btn').addEventListener('click', () => fileInput.click());
  document.getElementById('side-import-btn').addEventListener('click', () => fileInput.click());

  let dragCounter = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); dragCounter++; document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', (e) => { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dragCounter = 0; document.body.classList.remove('dragging'); } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    document.body.classList.remove('dragging');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      Array.from(e.dataTransfer.files).forEach(loadFile);
    }
  });

  window.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) loadFile(file);
      }
    }
  });

  // Export Engine
  function downloadCanvas(canvas, baseName, format) {
    return new Promise((resolve) => {
      const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const quality = format === 'jpeg' ? state.jpegQuality / 100 : undefined;
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${baseName}-encre.${format === 'jpeg' ? 'jpg' : 'png'}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
        resolve();
      }, mime, quality);
    });
  }

  document.getElementById('export-btn').addEventListener('click', () => {
    const rec = activeRecord();
    if (!rec) return;
    const base = rec.name.replace(/\.[^.]+$/, '');
    downloadCanvas(workCanvas, base, formatSelect.value);
  });

  exportAllBtn.addEventListener('click', () => {
    const format = formatSelect.value;
    let chain = Promise.resolve();
    state.images.forEach((rec) => {
      chain = chain.then(() => {
        const source = rec.id === state.activeId ? workCanvas : rec.canvas;
        const base = rec.name.replace(/\.[^.]+$/, '');
        return downloadCanvas(source, base, format).then(() => {
          return new Promise(r => setTimeout(r, 300));
        });
      });
    });
  });

  // Theme Toggle
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  const SUN = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>';
  const MOON = '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>';

  themeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') !== 'light';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    themeIcon.innerHTML = isDark ? MOON : SUN;
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (k === 'r') { setTool('rect'); }
    else if (k === 'o') { setTool('oval'); }
    else if (k === 'l') { setTool('lasso'); }
    else if (k === 'b') { setTool('brush'); }
    else if (k === '+' || k === '=') { zoomBy(0.15); }
    else if (k === '-' || k === '_') { zoomBy(-0.15); }
  });

  // Gestures setup
  gestureHandler = setupGestures(canvasStage, canvasInner, () => state.zoom, setZoom);

  // Initialize PWA and Web Share Target
  initPWA((sharedFiles) => {
    if (Array.isArray(sharedFiles)) {
      sharedFiles.forEach(loadFile);
    }
  });

  // Init defaults
  setMode('redact');
  setTool('rect');
  updateChromeVisibility();

})();
