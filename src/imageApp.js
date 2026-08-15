"use strict";

import {
  cloneCanvas,
  getCanvasPoint,
  applyToClippedRect,
  applyToClippedOval,
  applyToPolygon,
  dabLine,
  pushHistory,
  triggerHaptic,
  getHandleAtPoint,
  drawInteractiveShape
} from './canvas.js';
import { setupGestures } from './gestures.js';

export function initImageApp() {
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
    zoom: 1,
    activeShape: null,
    dragHandle: null,
    dragStartPt: null,
    initialShapeBounds: null
  };

  // Element references for Image view
  const sidebar = document.getElementById('img-sidebar');
  const thumbList = document.getElementById('img-thumb-list');
  const toolbar = document.getElementById('img-toolbar');
  const statusbar = document.getElementById('img-statusbar');
  const emptyState = document.getElementById('img-empty-state');
  const canvasStage = document.getElementById('img-canvas-stage');
  const canvasInner = document.getElementById('img-canvas-inner');
  const workCanvas = document.getElementById('img-work-canvas');
  const overlay = document.getElementById('img-overlay-canvas');
  const originalBadge = document.getElementById('img-original-badge');
  const fileInput = document.getElementById('img-file-input');
  const zoomLabel = document.getElementById('img-zoom-label');
  const undoBtn = document.getElementById('img-undo-btn');
  const redoBtn = document.getElementById('img-redo-btn');
  const exportAllBtn = document.getElementById('img-export-all-btn');
  const qualityField = document.getElementById('img-quality-field');
  const formatSelect = document.getElementById('img-format-select');

  const workCtx = workCanvas.getContext('2d');
  const overlayCtx = overlay.getContext('2d');

  let gestureHandler = null;
  let actionContainer = null;

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

  function createActionBar() {
    if (actionContainer) return;
    actionContainer = document.createElement('div');
    actionContainer.className = 'shape-action-bar hidden';
    actionContainer.innerHTML = `
      <button type="button" class="confirm-btn" id="img-shape-confirm-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        Valider
      </button>
      <button type="button" class="cancel-btn" id="img-shape-cancel-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Annuler
      </button>
    `;

    // Stop events from bubbling to canvasStage so drawing isn't triggered on click
    actionContainer.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    actionContainer.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    actionContainer.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    }, { passive: false });

    canvasStage.appendChild(actionContainer);

    document.getElementById('img-shape-confirm-btn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      commitActiveShape();
    });
    document.getElementById('img-shape-cancel-btn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      discardActiveShape();
    });
  }

  function updateActionBarPosition() {
    if (!state.activeShape || !actionContainer) {
      if (actionContainer) actionContainer.classList.add('hidden');
      return;
    }
    actionContainer.classList.remove('hidden');

    const shape = state.activeShape;
    const stageRect = canvasStage.getBoundingClientRect();
    const innerRect = canvasInner.getBoundingClientRect();

    const scaleX = innerRect.width / overlay.width;
    const scaleY = innerRect.height / overlay.height;

    const topCenterX = innerRect.left - stageRect.left + (shape.x + shape.w / 2) * scaleX;
    const topY = innerRect.top - stageRect.top + shape.y * scaleY;

    actionContainer.style.left = `${topCenterX}px`;
    actionContainer.style.top = `${topY}px`;
  }

  function redrawOverlay() {
    clearOverlay();
    if (state.activeShape) {
      const rec = activeRecord();
      drawInteractiveShape(overlayCtx, rec ? rec.canvas : workCanvas, state.activeShape, state.zoom);
    }
    updateActionBarPosition();
  }

  function commitActiveShape() {
    if (!state.activeShape) return;
    const rec = activeRecord();
    if (!rec) return;

    const snapshot = cloneCanvas(workCanvas);
    pushHistory(rec, snapshot);

    const { type, x, y, w, h, mode, color, blurRadius, pixelSize } = state.activeShape;
    const params = { color, blurRadius, pixelSize };

    if (type === 'rect') {
      applyToClippedRect(workCanvas, snapshot, x, y, w, h, mode, params);
    } else if (type === 'oval') {
      applyToClippedOval(workCanvas, snapshot, x, y, w, h, mode, params);
    }

    rec.canvas.getContext('2d').clearRect(0, 0, rec.width, rec.height);
    rec.canvas.getContext('2d').drawImage(workCanvas, 0, 0);

    state.activeShape = null;
    clearOverlay();
    updateActionBarPosition();
    updateThumb(rec);
    updateUndoRedoUI();
    triggerHaptic();
  }

  function discardActiveShape() {
    state.activeShape = null;
    clearOverlay();
    updateActionBarPosition();
  }

  function syncCanvasToRecord(rec) {
    if (!rec) return;
    discardActiveShape();
    workCanvas.width = rec.width;
    workCanvas.height = rec.height;
    overlay.width = rec.width;
    overlay.height = rec.height;

    workCtx.clearRect(0, 0, rec.width, rec.height);
    workCtx.drawImage(rec.canvas, 0, 0);
    clearOverlay();
    updateUndoRedoUI();
  }

  function renderThumbs() {
    thumbList.innerHTML = '';
    state.images.forEach(img => {
      const item = document.createElement('div');
      item.className = 'thumb-item' + (img.id === state.activeId ? ' active' : '');
      item.dataset.id = img.id;

      const canvas = document.createElement('canvas');
      canvas.width = 72;
      canvas.height = 72;
      const ctx = canvas.getContext('2d');
      const ratio = Math.max(img.width, img.height);
      const dw = (img.width / ratio) * 64;
      const dh = (img.height / ratio) * 64;
      ctx.drawImage(img.canvas, (72 - dw) / 2, (72 - dh) / 2, dw, dh);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'thumb-close';
      closeBtn.innerHTML = '&times;';
      closeBtn.title = 'Fermer cette image';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeImage(img.id);
      });

      item.appendChild(canvas);
      item.appendChild(closeBtn);
      item.addEventListener('click', () => switchImage(img.id));
      thumbList.appendChild(item);
    });

    if (state.images.length > 1) {
      exportAllBtn.style.display = 'inline-flex';
    } else {
      exportAllBtn.style.display = 'none';
    }
  }

  function updateThumb(rec) {
    const item = thumbList.querySelector(`[data-id="${rec.id}"]`);
    if (!item) return;
    const canvas = item.querySelector('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 72, 72);
    const ratio = Math.max(rec.width, rec.height);
    const dw = (rec.width / ratio) * 64;
    const dh = (rec.height / ratio) * 64;
    ctx.drawImage(rec.canvas, (72 - dw) / 2, (72 - dh) / 2, dw, dh);
  }

  function switchImage(id) {
    if (state.activeId === id) return;
    state.activeId = id;
    const rec = activeRecord();
    syncCanvasToRecord(rec);
    renderThumbs();
    fitToScreen();
  }

  function closeImage(id) {
    const idx = state.images.findIndex(img => img.id === id);
    if (idx === -1) return;
    state.images.splice(idx, 1);
    if (state.activeId === id) {
      if (state.images.length > 0) {
        state.activeId = state.images[Math.max(0, idx - 1)].id;
        syncCanvasToRecord(activeRecord());
        fitToScreen();
      } else {
        state.activeId = null;
        showEmptyState();
      }
    }
    renderThumbs();
    if (state.images.length <= 1) {
      sidebar.classList.add('hidden');
    }
  }

  function showEmptyState() {
    emptyState.classList.remove('hidden');
    canvasInner.style.display = 'none';
    toolbar.classList.add('hidden');
    statusbar.classList.add('hidden');
    sidebar.classList.add('hidden');
    discardActiveShape();
  }

  function showActiveCanvas() {
    emptyState.classList.add('hidden');
    canvasInner.style.display = 'block';
    toolbar.classList.remove('hidden');
    statusbar.classList.remove('hidden');
    if (state.images.length > 1) {
      sidebar.classList.remove('hidden');
    }
    createActionBar();
  }

  function setZoom(z) {
    state.zoom = Math.min(5, Math.max(0.01, z));
    const rec = activeRecord();
    if (rec) {
      const displayW = Math.max(1, Math.round(rec.width * state.zoom));
      const displayH = Math.max(1, Math.round(rec.height * state.zoom));
      workCanvas.style.width = displayW + 'px';
      workCanvas.style.height = displayH + 'px';
      overlay.style.width = displayW + 'px';
      overlay.style.height = displayH + 'px';
      canvasInner.style.width = displayW + 'px';
      canvasInner.style.height = displayH + 'px';
    }
    zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
    updateActionBarPosition();
  }

  function zoomBy(delta) { setZoom(state.zoom + delta); }

  function fitToScreen() {
    const rec = activeRecord();
    if (!rec) return;
    const stageRect = canvasStage.getBoundingClientRect();
    const pad = 32;
    const scaleX = Math.max(0.01, (stageRect.width - pad) / rec.width);
    const scaleY = Math.max(0.01, (stageRect.height - pad) / rec.height);
    const s = Math.min(scaleX, scaleY);
    setZoom(Math.max(0.01, Math.min(3, s)));
  }

  function updateUndoRedoUI() {
    const rec = activeRecord();
    if (!rec) {
      undoBtn.disabled = true;
      redoBtn.disabled = true;
      return;
    }
    undoBtn.disabled = rec.history.length === 0;
    redoBtn.disabled = rec.redoStack.length === 0;
  }

  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const off = document.createElement('canvas');
        off.width = img.naturalWidth;
        off.height = img.naturalHeight;
        const ctx = off.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const rec = {
          id: uuid(),
          name: file.name || 'image.png',
          width: img.naturalWidth,
          height: img.naturalHeight,
          canvas: off,
          original: cloneCanvas(off),
          history: [],
          redoStack: []
        };

        state.images.push(rec);
        state.activeId = rec.id;
        showActiveCanvas();
        syncCanvasToRecord(rec);
        renderThumbs();
        setTimeout(fitToScreen, 50);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Bind UI Events
  document.getElementById('img-browse-btn')?.addEventListener('click', () => fileInput.click());
  document.getElementById('img-side-import-btn')?.addEventListener('click', () => fileInput.click());

  fileInput?.addEventListener('change', (e) => {
    Array.from(e.target.files).forEach(f => loadFile(f));
    fileInput.value = '';
  });

  // Tools Selection
  document.querySelectorAll('#img-toolbar [data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.activeShape) commitActiveShape();
      document.querySelectorAll('#img-toolbar [data-tool]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.tool = btn.dataset.tool;
      updateFieldVisibility();
    });
  });

  // Modes Selection
  document.querySelectorAll('#img-toolbar [data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#img-toolbar [data-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      if (state.activeShape) {
        state.activeShape.mode = state.mode;
        state.activeShape.color = state.color;
        state.activeShape.blurRadius = state.blurRadius;
        state.activeShape.pixelSize = state.pixelSize;
        redrawOverlay();
      }
      updateFieldVisibility();
    });
  });

  function updateFieldVisibility() {
    const isBrush = state.tool === 'brush';
    const colorField = document.getElementById('img-color-field');
    const blurField = document.getElementById('img-blur-field');
    const pixelField = document.getElementById('img-pixel-field');
    const brushField = document.getElementById('img-brush-field');

    if (brushField) brushField.style.display = isBrush ? 'inline-flex' : 'none';

    if (state.mode === 'redact') {
      if (colorField) colorField.style.display = 'inline-flex';
      if (blurField) blurField.style.display = 'none';
      if (pixelField) pixelField.style.display = 'none';
    } else if (state.mode === 'blur') {
      if (colorField) colorField.style.display = 'none';
      if (blurField) blurField.style.display = 'inline-flex';
      if (pixelField) pixelField.style.display = 'none';
    } else if (state.mode === 'pixelate') {
      if (colorField) colorField.style.display = 'none';
      if (blurField) blurField.style.display = 'none';
      if (pixelField) pixelField.style.display = 'inline-flex';
    }
  }

  document.getElementById('img-color-input')?.addEventListener('input', (e) => {
    state.color = e.target.value;
    if (state.activeShape) {
      state.activeShape.color = state.color;
      redrawOverlay();
    }
  });

  document.getElementById('img-blur-range')?.addEventListener('input', (e) => {
    state.blurRadius = parseInt(e.target.value, 10);
    document.getElementById('img-blur-val').textContent = state.blurRadius;
    if (state.activeShape) {
      state.activeShape.blurRadius = state.blurRadius;
      redrawOverlay();
    }
  });

  document.getElementById('img-pixel-range')?.addEventListener('input', (e) => {
    state.pixelSize = parseInt(e.target.value, 10);
    document.getElementById('img-pixel-val').textContent = state.pixelSize;
    if (state.activeShape) {
      state.activeShape.pixelSize = state.pixelSize;
      redrawOverlay();
    }
  });

  document.getElementById('img-brush-range')?.addEventListener('input', (e) => {
    state.brushSize = parseInt(e.target.value, 10);
    document.getElementById('img-brush-val').textContent = state.brushSize;
  });

  // Undo / Redo
  undoBtn?.addEventListener('click', () => {
    discardActiveShape();
    const rec = activeRecord();
    if (!rec || rec.history.length === 0) return;
    rec.redoStack.push(cloneCanvas(workCanvas));
    const prev = rec.history.pop();
    rec.canvas.getContext('2d').clearRect(0, 0, rec.width, rec.height);
    rec.canvas.getContext('2d').drawImage(prev, 0, 0);
    syncCanvasToRecord(rec);
    updateThumb(rec);
    triggerHaptic();
  });

  redoBtn?.addEventListener('click', () => {
    discardActiveShape();
    const rec = activeRecord();
    if (!rec || rec.redoStack.length === 0) return;
    rec.history.push(cloneCanvas(workCanvas));
    const next = rec.redoStack.pop();
    rec.canvas.getContext('2d').clearRect(0, 0, rec.width, rec.height);
    rec.canvas.getContext('2d').drawImage(next, 0, 0);
    syncCanvasToRecord(rec);
    updateThumb(rec);
    triggerHaptic();
  });

  document.getElementById('img-reset-btn')?.addEventListener('click', () => {
    const rec = activeRecord();
    if (!rec) return;
    discardActiveShape();
    pushHistory(rec, cloneCanvas(workCanvas));
    rec.canvas.getContext('2d').clearRect(0, 0, rec.width, rec.height);
    rec.canvas.getContext('2d').drawImage(rec.original, 0, 0);
    syncCanvasToRecord(rec);
    updateThumb(rec);
    triggerHaptic();
  });

  // Zoom controls
  document.getElementById('img-zoom-in')?.addEventListener('click', () => zoomBy(0.2));
  document.getElementById('img-zoom-out')?.addEventListener('click', () => zoomBy(-0.2));
  document.getElementById('img-zoom-fit')?.addEventListener('click', () => fitToScreen());

  // Before / After Comparison
  const beforeAfterBtn = document.getElementById('img-before-after');
  const showOrig = () => {
    const rec = activeRecord();
    if (!rec) return;
    workCtx.clearRect(0, 0, rec.width, rec.height);
    workCtx.drawImage(rec.original, 0, 0);
    originalBadge.classList.add('show');
  };
  const hideOrig = () => {
    const rec = activeRecord();
    if (!rec) return;
    workCtx.clearRect(0, 0, rec.width, rec.height);
    workCtx.drawImage(rec.canvas, 0, 0);
    originalBadge.classList.remove('show');
  };

  beforeAfterBtn?.addEventListener('pointerdown', showOrig);
  beforeAfterBtn?.addEventListener('pointerup', hideOrig);
  beforeAfterBtn?.addEventListener('pointerleave', hideOrig);

  // Format & Export
  formatSelect?.addEventListener('change', (e) => {
    qualityField.style.display = e.target.value === 'jpeg' ? 'inline-flex' : 'none';
  });

  document.getElementById('img-quality-range')?.addEventListener('input', (e) => {
    state.jpegQuality = parseInt(e.target.value, 10);
    document.getElementById('img-quality-val').textContent = state.jpegQuality;
  });

  document.getElementById('img-export-btn')?.addEventListener('click', () => {
    const rec = activeRecord();
    if (!rec) return;
    if (state.activeShape) commitActiveShape();

    const fmt = formatSelect.value;
    const mime = fmt === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = fmt === 'jpeg' ? state.jpegQuality / 100 : undefined;

    const dataUrl = workCanvas.toDataURL(mime, quality);
    const a = document.createElement('a');
    const baseName = rec.name.replace(/\.[^/.]+$/, '');
    a.download = `${baseName}-caviarde.${fmt}`;
    a.href = dataUrl;
    a.click();
    triggerHaptic();
  });

  exportAllBtn?.addEventListener('click', () => {
    if (state.activeShape) commitActiveShape();
    state.images.forEach(img => {
      const fmt = formatSelect.value;
      const mime = fmt === 'jpeg' ? 'image/jpeg' : 'image/png';
      const quality = fmt === 'jpeg' ? state.jpegQuality / 100 : undefined;
      const dataUrl = img.canvas.toDataURL(mime, quality);
      const a = document.createElement('a');
      const baseName = img.name.replace(/\.[^/.]+$/, '');
      a.download = `${baseName}-caviarde.${fmt}`;
      a.href = dataUrl;
      a.click();
    });
    triggerHaptic();
  });

  // Canvas Drawing & Gestures
  let isDrawing = false;
  let startPt = null;
  let polygonPts = [];
  let brushLastPt = null;

  canvasStage?.addEventListener('pointerdown', (e) => {
    // If the click/tap is on or inside the floating action bar buttons, let it handle the event cleanly
    if (actionContainer && actionContainer.contains(e.target)) return;

    const rec = activeRecord();
    if (!rec) return;

    const pt = getCanvasPoint(e, workCanvas);

    if (state.activeShape) {
      const handle = getHandleAtPoint(pt, state.activeShape, state.zoom);
      if (handle) {
        state.dragHandle = handle;
        state.dragStartPt = pt;
        state.initialShapeBounds = { ...state.activeShape };
        return;
      } else {
        commitActiveShape();
      }
    }

    if (state.tool === 'pan') return;

    if (state.tool === 'rect' || state.tool === 'oval') {
      isDrawing = true;
      startPt = pt;
    } else if (state.tool === 'lasso') {
      isDrawing = true;
      polygonPts = [pt];
    } else if (state.tool === 'brush') {
      isDrawing = true;
      brushLastPt = pt;
      pushHistory(rec, cloneCanvas(workCanvas));
      dabLine(workCanvas, cloneCanvas(workCanvas), pt.x, pt.y, pt.x, pt.y, state.brushSize, state.mode, currentParams());
      rec.canvas.getContext('2d').clearRect(0, 0, rec.width, rec.height);
      rec.canvas.getContext('2d').drawImage(workCanvas, 0, 0);
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (state.dragHandle && state.activeShape) {
      const pt = getCanvasPoint(e, workCanvas);
      const dx = pt.x - state.dragStartPt.x;
      const dy = pt.y - state.dragStartPt.y;
      const b = state.initialShapeBounds;

      if (state.dragHandle === 'body') {
        state.activeShape.x = b.x + dx;
        state.activeShape.y = b.y + dy;
      } else {
        let nx = b.x, ny = b.y, nw = b.w, nh = b.h;
        if (state.dragHandle.includes('e')) nw = Math.max(10, b.w + dx);
        if (state.dragHandle.includes('s')) nh = Math.max(10, b.h + dy);
        if (state.dragHandle.includes('w')) {
          const newW = Math.max(10, b.w - dx);
          nx = b.x + (b.w - newW);
          nw = newW;
        }
        if (state.dragHandle.includes('n')) {
          const newH = Math.max(10, b.h - dy);
          ny = b.y + (b.h - newH);
          nh = newH;
        }
        state.activeShape.x = nx;
        state.activeShape.y = ny;
        state.activeShape.w = nw;
        state.activeShape.h = nh;
      }
      redrawOverlay();
      return;
    }

    if (!isDrawing) return;
    const pt = getCanvasPoint(e, workCanvas);

    if (state.tool === 'rect') {
      clearOverlay();
      const x = Math.min(startPt.x, pt.x);
      const y = Math.min(startPt.y, pt.y);
      const w = Math.abs(pt.x - startPt.x);
      const h = Math.abs(pt.y - startPt.y);
      drawInteractiveShape(overlayCtx, activeRecord().canvas, { type: 'rect', x, y, w, h, mode: state.mode, color: state.color, blurRadius: state.blurRadius, pixelSize: state.pixelSize }, state.zoom);
    } else if (state.tool === 'oval') {
      clearOverlay();
      const x = Math.min(startPt.x, pt.x);
      const y = Math.min(startPt.y, pt.y);
      const w = Math.abs(pt.x - startPt.x);
      const h = Math.abs(pt.y - startPt.y);
      drawInteractiveShape(overlayCtx, activeRecord().canvas, { type: 'oval', x, y, w, h, mode: state.mode, color: state.color, blurRadius: state.blurRadius, pixelSize: state.pixelSize }, state.zoom);
    } else if (state.tool === 'lasso') {
      polygonPts.push(pt);
      clearOverlay();
      overlayCtx.save();
      overlayCtx.strokeStyle = '#C1443B';
      overlayCtx.lineWidth = 2 / state.zoom;
      overlayCtx.setLineDash([4 / state.zoom, 4 / state.zoom]);
      overlayCtx.beginPath();
      overlayCtx.moveTo(polygonPts[0].x, polygonPts[0].y);
      for (let i = 1; i < polygonPts.length; i++) overlayCtx.lineTo(polygonPts[i].x, polygonPts[i].y);
      overlayCtx.stroke();
      overlayCtx.restore();
    } else if (state.tool === 'brush') {
      dabLine(workCanvas, activeRecord().canvas, brushLastPt.x, brushLastPt.y, pt.x, pt.y, state.brushSize, state.mode, currentParams());
      activeRecord().canvas.getContext('2d').clearRect(0, 0, activeRecord().width, activeRecord().height);
      activeRecord().canvas.getContext('2d').drawImage(workCanvas, 0, 0);
      brushLastPt = pt;
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (state.dragHandle) {
      state.dragHandle = null;
      state.dragStartPt = null;
      state.initialShapeBounds = null;
      return;
    }

    if (!isDrawing) return;
    isDrawing = false;
    const pt = getCanvasPoint(e, workCanvas);
    const rec = activeRecord();
    if (!rec) return;

    if (state.tool === 'rect' || state.tool === 'oval') {
      const x = Math.min(startPt.x, pt.x);
      const y = Math.min(startPt.y, pt.y);
      const w = Math.abs(pt.x - startPt.x);
      const h = Math.abs(pt.y - startPt.y);

      if (w > 6 && h > 6) {
        state.activeShape = {
          type: state.tool,
          x, y, w, h,
          mode: state.mode,
          color: state.color,
          blurRadius: state.blurRadius,
          pixelSize: state.pixelSize
        };
        redrawOverlay();
      } else {
        clearOverlay();
      }
    } else if (state.tool === 'lasso') {
      clearOverlay();
      if (polygonPts.length > 2) {
        const snapshot = cloneCanvas(workCanvas);
        pushHistory(rec, snapshot);
        applyToPolygon(workCanvas, snapshot, polygonPts, state.mode, currentParams());
        rec.canvas.getContext('2d').clearRect(0, 0, rec.width, rec.height);
        rec.canvas.getContext('2d').drawImage(workCanvas, 0, 0);
        updateThumb(rec);
        updateUndoRedoUI();
        triggerHaptic();
      }
      polygonPts = [];
    } else if (state.tool === 'brush') {
      updateThumb(rec);
      updateUndoRedoUI();
      triggerHaptic();
      brushLastPt = null;
    }
  });

  gestureHandler = setupGestures(canvasStage, {
    onPinch: (scaleDelta, cx, cy) => {
      const nextZoom = state.zoom * scaleDelta;
      setZoom(nextZoom);
    },
    onPan: (dx, dy) => {
      if (state.tool === 'pan') {
        canvasStage.scrollLeft -= dx;
        canvasStage.scrollTop -= dy;
      }
    }
  });

  // Keyboard Shortcuts (Enter to confirm, Escape/Delete to cancel, Cmd+Z/Y for undo/redo)
  window.addEventListener('keydown', (e) => {
    const isInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
    if (isInput) return;

    const imageView = document.getElementById('image-view');
    if (imageView && imageView.classList.contains('hidden')) return;

    if (state.activeShape) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitActiveShape();
        return;
      }
      if (e.key === 'Escape' || e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        discardActiveShape();
        return;
      }
    }

    const isMac = typeof navigator !== 'undefined' && navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        redoBtn?.click();
      } else {
        undoBtn?.click();
      }
    } else if (isCmdOrCtrl && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redoBtn?.click();
    }
  });

  return {
    loadFile,
    state
  };
}
