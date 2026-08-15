"use strict";

import {
  getCanvasPoint,
  triggerHaptic
} from './canvas.js';
import { setupGestures } from './gestures.js';
import {
  initFaceDetectionModel,
  scanFullVideoWithTrajectories,
  trackFaceBidirectional,
  getInterpolatedFaceBox
} from './faceTracker.js';
import {
  upsertKeyframe,
  deleteKeyframe,
  interpolateTrack,
  autoTrackForward
} from './manualTracker.js';
import {
  formatTime,
  renderVideoFrame,
  exportVideo
} from './videoEngine.js';

export function initVideoApp() {
  const state = {
    tool: 'rect',          // 'pan' | 'rect' | 'oval'
    mode: 'blur',          // 'redact' | 'blur' | 'pixelate'
    color: '#0a0a0a',
    blurRadius: 24,
    pixelSize: 16,
    facePadding: 20,
    minConfidence: 0.20,
    faceDetectionEnabled: true,
    faceModelLoaded: false,
    faceModelLoading: false,
    editMode: 'lecture',   // 'lecture' | 'marker' | 'add-face'
    showRawPreview: false,
    scrubbing: false,
    exporting: false,
    hasVideo: false,
    zoom: 1
  };

  let faceTracks = [];
  let manualTracks = [];
  let selectedManualTrackId = null;
  let currentFileBaseName = 'video';
  let lastObjectUrl = null;
  let rafId = null;
  let gestureHandler = null;

  let markerStart = null;
  let panStartPt = null;
  let panScrollStart = null;

  // DOM Refs for Video view
  const sidePanel = document.getElementById('vid-side-panel');
  const toolbar = document.getElementById('vid-toolbar');
  const timeline = document.getElementById('vid-timeline');
  const statusbar = document.getElementById('vid-statusbar');
  const emptyState = document.getElementById('vid-empty-state');
  const canvasStage = document.getElementById('vid-canvas-stage');
  const canvasInner = document.getElementById('vid-canvas-inner');
  const workCanvas = document.getElementById('vid-work-canvas');
  const overlay = document.getElementById('vid-overlay-canvas');
  const originalBadge = document.getElementById('vid-original-badge');
  const fileInput = document.getElementById('vid-file-input');
  const videoEl = document.getElementById('vid-src-video');
  const seekRange = document.getElementById('vid-seek-range');
  const timeLabel = document.getElementById('vid-time-label');
  const playBtn = document.getElementById('vid-play-btn');
  const playIcon = document.getElementById('vid-play-icon');

  // Filmora 14 AI Face Mosaic Refs
  const scanMosaicBtn = document.getElementById('vid-scan-mosaic-btn');
  const mosaicProgressBox = document.getElementById('vid-mosaic-progress-box');
  const mosaicStatusText = document.getElementById('vid-mosaic-status-text');
  const mosaicPctText = document.getElementById('vid-mosaic-pct-text');
  const mosaicProgressBar = document.getElementById('vid-mosaic-progress-bar');
  const filmoraFaceGallery = document.getElementById('vid-filmora-face-gallery');
  const selectAllFacesBtn = document.getElementById('vid-select-all-faces-btn');
  const deselectAllFacesBtn = document.getElementById('vid-deselect-all-faces-btn');
  const addMissedFaceBtn = document.getElementById('vid-add-missed-face-btn');

  const confRange = document.getElementById('vid-conf-range');
  const confVal = document.getElementById('vid-conf-val');
  const paddingRange = document.getElementById('vid-padding-range');
  const paddingVal = document.getElementById('vid-padding-val');

  const markerModeBtn = document.getElementById('vid-marker-mode-btn');
  const newTrackBtn = document.getElementById('vid-new-track-btn');
  const manualTrackListEl = document.getElementById('vid-manual-track-list');
  const trackActionBox = document.getElementById('vid-track-action-box');
  const selectedTrackName = document.getElementById('vid-selected-track-name');
  const autoTrackBtn = document.getElementById('vid-auto-track-btn');
  const autoTrackAllBtn = document.getElementById('vid-auto-track-all-btn');
  const exportProgress = document.getElementById('vid-export-progress');
  const exportProgressBar = document.getElementById('vid-export-progress-bar');
  const exportBanner = document.getElementById('vid-export-banner');
  const zoomLabel = document.getElementById('vid-zoom-label');

  const workCtx = workCanvas.getContext('2d');
  const overlayCtx = overlay.getContext('2d');

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function clearOverlay() {
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  }

  function setZoom(z) {
    state.zoom = Math.min(5, Math.max(0.01, z));
    if (state.hasVideo) {
      const displayW = Math.max(1, Math.round(videoEl.videoWidth * state.zoom));
      const displayH = Math.max(1, Math.round(videoEl.videoHeight * state.zoom));
      workCanvas.style.width = displayW + 'px';
      workCanvas.style.height = displayH + 'px';
      overlay.style.width = displayW + 'px';
      overlay.style.height = displayH + 'px';
      canvasInner.style.width = displayW + 'px';
      canvasInner.style.height = displayH + 'px';
    }
    zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
  }

  function zoomBy(delta) { setZoom(state.zoom + delta); }

  function fitToScreen() {
    if (!state.hasVideo) return;
    const stageRect = canvasStage.getBoundingClientRect();
    const pad = 32;
    const scaleX = Math.max(0.01, (stageRect.width - pad) / videoEl.videoWidth);
    const scaleY = Math.max(0.01, (stageRect.height - pad) / videoEl.videoHeight);
    const s = Math.min(scaleX, scaleY);
    setZoom(Math.max(0.01, Math.min(3, s)));
  }

  function showActiveCanvas() {
    emptyState.classList.add('hidden');
    canvasInner.style.display = 'block';
    toolbar.classList.remove('hidden');
    timeline.classList.remove('hidden');
    statusbar.classList.remove('hidden');
    sidePanel.classList.remove('hidden');
  }

  function renderFilmoraGallery() {
    if (!filmoraFaceGallery) return;
    filmoraFaceGallery.innerHTML = '';

    if (faceTracks.length === 0) {
      filmoraFaceGallery.innerHTML = `
        <div style="font-size: 11px; color: var(--text-dim); text-align: center; padding: 12px; border: 1px dashed var(--border); border-radius: 6px;">
          Aucun visage analysé.<br>Cliquez sur <strong>« Analyser les visages (AI Scan) »</strong> ci-dessus.
        </div>
      `;
      return;
    }

    faceTracks.forEach((t) => {
      const card = document.createElement('div');
      card.className = `filmora-face-item ${t.active ? 'active' : ''}`;
      card.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        background: ${t.active ? 'rgba(193, 68, 59, 0.12)' : 'var(--panel-2)'};
        border: 1px solid ${t.active ? 'var(--accent)' : 'var(--border)'};
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s;
      `;

      const avatar = document.createElement('img');
      avatar.src = t.avatarUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
      avatar.style.cssText = 'width: 34px; height: 34px; border-radius: 50%; object-fit: cover; background: #000; border: 1px solid var(--border);';

      const info = document.createElement('div');
      info.style.cssText = 'flex: 1; min-width: 0;';
      info.innerHTML = `
        <div style="font-size: 12px; font-weight: bold; color: var(--text);">${t.name}</div>
        <div style="font-size: 10px; color: ${t.active ? 'var(--accent)' : 'var(--text-dim)'};">${t.active ? 'Masqué' : 'Visible'}</div>
      `;

      const toggleBtn = document.createElement('button');
      toggleBtn.className = `btn ${t.active ? 'primary' : 'ghost'}`;
      toggleBtn.style.cssText = 'font-size: 11px; padding: 4px 8px; min-height: 24px;';
      toggleBtn.textContent = t.active ? 'Masqué' : 'Démasqué';

      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        t.active = !t.active;
        renderFilmoraGallery();
        triggerHaptic();
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn ghost';
      delBtn.style.cssText = 'font-size: 11px; padding: 4px 6px; min-height: 24px; color: var(--text-dim);';
      delBtn.innerHTML = '&times;';
      delBtn.title = 'Supprimer cette piste';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        faceTracks = faceTracks.filter(x => x.id !== t.id);
        renderFilmoraGallery();
        triggerHaptic();
      });

      card.appendChild(avatar);
      card.appendChild(info);
      card.appendChild(toggleBtn);
      card.appendChild(delBtn);

      card.addEventListener('click', () => {
        t.active = !t.active;
        renderFilmoraGallery();
      });

      filmoraFaceGallery.appendChild(card);
    });
  }

  function getActiveFaceBoxesAtTime(currentTime) {
    if (!state.faceDetectionEnabled || faceTracks.length === 0) return [];
    const boxes = [];
    faceTracks.forEach(t => {
      if (!t.active) return;
      const b = getInterpolatedFaceBox(t, currentTime, state.facePadding);
      if (b) {
        boxes.push({
          type: 'oval',
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
          mode: state.mode,
          color: state.color,
          blurRadius: state.blurRadius,
          pixelSize: state.pixelSize
        });
      }
    });
    return boxes;
  }

  function getManualBoxesAtTime(currentTime) {
    const boxes = [];
    manualTracks.forEach(t => {
      const b = interpolateTrack(t, currentTime);
      if (b) {
        boxes.push({
          type: t.shapeType || 'rect',
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
          mode: t.mode || state.mode,
          color: t.color || state.color,
          blurRadius: t.blurRadius || state.blurRadius,
          pixelSize: t.pixelSize || state.pixelSize,
          trackId: t.id
        });
      }
    });
    return boxes;
  }

  function renderLoop() {
    if (state.hasVideo && !state.exporting) {
      const curT = videoEl.currentTime;
      const dur = videoEl.duration || 0;

      if (!state.scrubbing) {
        seekRange.value = dur > 0 ? (curT / dur) * 100 : 0;
        timeLabel.textContent = `${formatTime(curT)} / ${formatTime(dur)}`;
      }

      if (state.showRawPreview) {
        workCtx.drawImage(videoEl, 0, 0, workCanvas.width, workCanvas.height);
      } else {
        const faceBoxes = getActiveFaceBoxesAtTime(curT);
        const manualBoxes = getManualBoxesAtTime(curT);
        const allBoxes = [...faceBoxes, ...manualBoxes];

        renderVideoFrame(workCtx, videoEl, allBoxes, {
          color: state.color,
          blurRadius: state.blurRadius,
          pixelSize: state.pixelSize
        });
      }

      redrawOverlay(curT);
    }
    rafId = requestAnimationFrame(renderLoop);
  }

  function redrawOverlay(curT) {
    clearOverlay();
    if (state.editMode === 'marker' && selectedManualTrackId) {
      const track = manualTracks.find(t => t.id === selectedManualTrackId);
      if (track) {
        const b = interpolateTrack(track, curT);
        if (b) {
          overlayCtx.save();
          overlayCtx.strokeStyle = '#38bdf8';
          overlayCtx.lineWidth = 2 / state.zoom;
          overlayCtx.strokeRect(b.x, b.y, b.w, b.h);

          overlayCtx.fillStyle = '#38bdf8';
          overlayCtx.font = `${Math.max(11, 13 / state.zoom)}px monospace`;
          overlayCtx.fillText(track.name, b.x, Math.max(14, b.y - 4));
          overlayCtx.restore();
        }
      }
    }
  }

  function loadVideoFile(file) {
    if (!file) return;
    if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);

    currentFileBaseName = (file.name || 'video').replace(/\.[^/.]+$/, '');
    const objUrl = URL.createObjectURL(file);
    lastObjectUrl = objUrl;

    videoEl.src = objUrl;
    videoEl.load();

    videoEl.onloadedmetadata = () => {
      state.hasVideo = true;
      workCanvas.width = videoEl.videoWidth;
      workCanvas.height = videoEl.videoHeight;
      overlay.width = videoEl.videoWidth;
      overlay.height = videoEl.videoHeight;

      faceTracks = [];
      manualTracks = [];
      selectedManualTrackId = null;
      renderFilmoraGallery();
      renderManualTrackList();

      showActiveCanvas();
      setTimeout(() => {
        fitToScreen();
        videoEl.currentTime = 0;
      }, 50);

      // Pre-initialize AI Face Detector
      initFaceDetectionModel(state.minConfidence).catch(() => {});
    };
  }

  // Filmora 14 AI Full Scan
  scanMosaicBtn?.addEventListener('click', async () => {
    if (!state.hasVideo) return;
    scanMosaicBtn.disabled = true;
    mosaicProgressBox.style.display = 'block';
    mosaicStatusText.textContent = 'Analyse des trajectoires faciales…';
    mosaicPctText.textContent = '0%';
    mosaicProgressBar.style.width = '0%';

    try {
      const tracks = await scanFullVideoWithTrajectories(videoEl, state.minConfidence, (pct, count) => {
        mosaicPctText.textContent = `${pct}%`;
        mosaicProgressBar.style.width = `${pct}%`;
        mosaicStatusText.textContent = `Détection & tracking : ${count} visages trouvés…`;
      });

      faceTracks = tracks;
      renderFilmoraGallery();
      triggerHaptic();
    } catch (err) {
      alert('Erreur lors du scan IA : ' + err.message);
    } finally {
      scanMosaicBtn.disabled = false;
      mosaicProgressBox.style.display = 'none';
    }
  });

  // 1-Click / Draw Missed Face & Head Tracker
  addMissedFaceBtn?.addEventListener('click', () => {
    if (!state.hasVideo) return;
    state.editMode = 'add-face';
    videoEl.pause();
    addMissedFaceBtn.style.background = 'var(--accent)';
    addMissedFaceBtn.style.color = '#fff';
    addMissedFaceBtn.textContent = '🎯 Cliquez sur une tête / visage pour traquer';
    triggerHaptic();
  });

  canvasStage?.addEventListener('pointerdown', async (e) => {
    if (!state.hasVideo) return;
    const pt = getCanvasPoint(e, workCanvas);

    if (state.editMode === 'add-face') {
      state.editMode = 'lecture';
      addMissedFaceBtn.style.background = '';
      addMissedFaceBtn.style.color = 'var(--accent)';
      addMissedFaceBtn.textContent = '➕ Flouter un visage / tête (1 Clic ou Tracer)';

      // Generate initial oval box centered at click
      const headRadius = Math.max(28, Math.min(workCanvas.width, workCanvas.height) * 0.08);
      const initialBox = {
        x: Math.max(0, pt.x - headRadius),
        y: Math.max(0, pt.y - headRadius * 1.15),
        w: headRadius * 2,
        h: headRadius * 2.3
      };

      mosaicProgressBox.style.display = 'block';
      mosaicStatusText.textContent = 'Traçage haute précision de la tête…';
      mosaicProgressBar.style.width = '0%';

      try {
        const curT = videoEl.currentTime;
        const result = await trackFaceBidirectional(videoEl, initialBox, curT, (pct) => {
          mosaicPctText.textContent = `${pct}%`;
          mosaicProgressBar.style.width = `${pct}%`;
        });

        const newTrack = {
          id: faceTracks.length + 1,
          name: `Visage ${faceTracks.length + 1} (Manuel)`,
          avatarUrl: result.avatarUrl,
          active: true,
          keyframes: result.keyframes
        };

        faceTracks.push(newTrack);
        renderFilmoraGallery();
        triggerHaptic();
      } catch (err) {
        console.warn('Track face error:', err);
      } finally {
        mosaicProgressBox.style.display = 'none';
      }
      return;
    }

    if (state.editMode === 'marker') {
      markerStart = pt;
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (state.editMode === 'marker' && markerStart) {
      const pt = getCanvasPoint(e, workCanvas);
      const x = Math.min(markerStart.x, pt.x);
      const y = Math.min(markerStart.y, pt.y);
      const w = Math.abs(pt.x - markerStart.x);
      const h = Math.abs(pt.y - markerStart.y);

      if (w > 12 && h > 12) {
        let track = manualTracks.find(t => t.id === selectedManualTrackId);
        if (!track) {
          track = {
            id: uuid(),
            name: `Repère ${manualTracks.length + 1}`,
            shapeType: state.tool === 'oval' ? 'oval' : 'rect',
            mode: state.mode,
            color: state.color,
            blurRadius: state.blurRadius,
            pixelSize: state.pixelSize,
            keyframes: []
          };
          manualTracks.push(track);
          selectedManualTrackId = track.id;
        }

        upsertKeyframe(track, videoEl.currentTime, x, y, w, h);
        renderManualTrackList();
        triggerHaptic();
      }
      markerStart = null;
    }
  });

  function renderManualTrackList() {
    if (!manualTrackListEl) return;
    manualTrackListEl.innerHTML = '';

    if (manualTracks.length === 0) {
      trackActionBox.style.display = 'none';
      return;
    }

    manualTracks.forEach(t => {
      const item = document.createElement('div');
      item.className = `manual-track-row ${t.id === selectedManualTrackId ? 'selected' : ''}`;
      item.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 10px;
        background: ${t.id === selectedManualTrackId ? 'rgba(56, 189, 248, 0.15)' : 'var(--panel-2)'};
        border: 1px solid ${t.id === selectedManualTrackId ? '#38bdf8' : 'var(--border)'};
        border-radius: 6px;
        margin-bottom: 4px;
        cursor: pointer;
        font-size: 12px;
      `;

      item.innerHTML = `
        <span><strong>${t.name}</strong> (${t.keyframes.length} pts)</span>
        <button class="btn ghost" style="padding: 2px 6px; font-size: 12px; min-height: 20px;">&times;</button>
      `;

      item.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        manualTracks = manualTracks.filter(x => x.id !== t.id);
        if (selectedManualTrackId === t.id) selectedManualTrackId = null;
        renderManualTrackList();
      });

      item.addEventListener('click', () => {
        selectedManualTrackId = t.id;
        renderManualTrackList();
      });

      manualTrackListEl.appendChild(item);
    });

    const activeTrack = manualTracks.find(t => t.id === selectedManualTrackId);
    if (activeTrack) {
      trackActionBox.style.display = 'block';
      selectedTrackName.textContent = activeTrack.name;
    } else {
      trackActionBox.style.display = 'none';
    }
  }

  // Auto-Track movement of selected manual repère
  autoTrackBtn?.addEventListener('click', async () => {
    const track = manualTracks.find(t => t.id === selectedManualTrackId);
    if (!track) return;
    autoTrackBtn.disabled = true;
    try {
      await autoTrackForward(videoEl, track, videoEl.currentTime, 5, () => {});
      renderManualTrackList();
      triggerHaptic();
    } catch (e) {
      console.warn(e);
    } finally {
      autoTrackBtn.disabled = false;
    }
  });

  autoTrackAllBtn?.addEventListener('click', async () => {
    const track = manualTracks.find(t => t.id === selectedManualTrackId);
    if (!track) return;
    autoTrackAllBtn.disabled = true;
    try {
      await autoTrackForward(videoEl, track, videoEl.currentTime, (videoEl.duration || 10) - videoEl.currentTime, () => {});
      renderManualTrackList();
      triggerHaptic();
    } catch (e) {
      console.warn(e);
    } finally {
      autoTrackAllBtn.disabled = false;
    }
  });

  markerModeBtn?.addEventListener('click', () => {
    if (state.editMode === 'marker') {
      state.editMode = 'lecture';
      markerModeBtn.classList.remove('primary');
    } else {
      state.editMode = 'marker';
      markerModeBtn.classList.add('primary');
      videoEl.pause();
    }
  });

  newTrackBtn?.addEventListener('click', () => {
    const track = {
      id: uuid(),
      name: `Repère ${manualTracks.length + 1}`,
      shapeType: state.tool === 'oval' ? 'oval' : 'rect',
      mode: state.mode,
      color: state.color,
      blurRadius: state.blurRadius,
      pixelSize: state.pixelSize,
      keyframes: []
    };
    manualTracks.push(track);
    selectedManualTrackId = track.id;
    state.editMode = 'marker';
    markerModeBtn.classList.add('primary');
    videoEl.pause();
    renderManualTrackList();
  });

  selectAllFacesBtn?.addEventListener('click', () => {
    faceTracks.forEach(t => t.active = true);
    renderFilmoraGallery();
  });
  deselectAllFacesBtn?.addEventListener('click', () => {
    faceTracks.forEach(t => t.active = false);
    renderFilmoraGallery();
  });

  // Play / Pause & Scrub
  function togglePlay() {
    if (!state.hasVideo) return;
    if (videoEl.paused) {
      videoEl.play();
      playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
    } else {
      videoEl.pause();
      playIcon.innerHTML = '<path d="M7 5v14l12-7z"/>';
    }
  }

  playBtn?.addEventListener('click', togglePlay);

  seekRange?.addEventListener('input', (e) => {
    if (!state.hasVideo) return;
    state.scrubbing = true;
    const dur = videoEl.duration || 0;
    const target = (parseFloat(e.target.value) / 100) * dur;
    videoEl.currentTime = target;
    timeLabel.textContent = `${formatTime(target)} / ${formatTime(dur)}`;
  });

  seekRange?.addEventListener('change', () => {
    state.scrubbing = false;
  });

  // Video UI Event listeners
  document.getElementById('vid-browse-btn')?.addEventListener('click', () => fileInput.click());
  fileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      loadVideoFile(e.target.files[0]);
      fileInput.value = '';
    }
  });

  // Tool / Mode select in Video
  document.querySelectorAll('#vid-toolbar [data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#vid-toolbar [data-tool]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.tool = btn.dataset.tool;
    });
  });

  document.querySelectorAll('#vid-toolbar [data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#vid-toolbar [data-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
    });
  });

  document.getElementById('vid-blur-range')?.addEventListener('input', (e) => {
    state.blurRadius = parseInt(e.target.value, 10);
    document.getElementById('vid-blur-val').textContent = state.blurRadius;
  });

  confRange?.addEventListener('input', (e) => {
    state.minConfidence = parseInt(e.target.value, 10) / 100;
    confVal.textContent = `${e.target.value}%`;
  });

  paddingRange?.addEventListener('input', (e) => {
    state.facePadding = parseInt(e.target.value, 10);
    paddingVal.textContent = `${e.target.value}%`;
  });

  // Zoom & screen fit
  document.getElementById('vid-zoom-in')?.addEventListener('click', () => zoomBy(0.2));
  document.getElementById('vid-zoom-out')?.addEventListener('click', () => zoomBy(-0.2));
  document.getElementById('vid-zoom-fit')?.addEventListener('click', () => fitToScreen());

  // Before / After Preview
  const vidBeforeAfter = document.getElementById('vid-before-after');
  vidBeforeAfter?.addEventListener('pointerdown', () => { state.showRawPreview = true; });
  vidBeforeAfter?.addEventListener('pointerup', () => { state.showRawPreview = false; });
  vidBeforeAfter?.addEventListener('pointerleave', () => { state.showRawPreview = false; });

  // Video Export
  document.getElementById('vid-export-btn')?.addEventListener('click', async () => {
    if (!state.hasVideo || state.exporting) return;
    state.exporting = true;
    videoEl.pause();

    exportProgress.classList.add('show');
    exportBanner.classList.add('show');
    exportProgressBar.style.width = '0%';

    try {
      const getBoxesAtTimeFn = (t) => {
        const faceB = getActiveFaceBoxesAtTime(t);
        const manualB = getManualBoxesAtTime(t);
        return [...faceB, ...manualB];
      };

      await exportVideo(videoEl, getBoxesAtTimeFn, {
        color: state.color,
        blurRadius: state.blurRadius,
        pixelSize: state.pixelSize
      }, (pct) => {
        exportProgressBar.style.width = `${pct}%`;
      }, currentFileBaseName);

      triggerHaptic();
    } catch (e) {
      alert("Erreur lors de l'export vidéo: " + e.message);
    } finally {
      state.exporting = false;
      exportProgress.classList.remove('show');
      exportBanner.classList.remove('show');
    }
  });

  // Start Animation Loop
  rafId = requestAnimationFrame(renderLoop);

  return {
    loadVideoFile,
    state
  };
}
