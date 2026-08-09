"use strict";

/**
 * Attaches multi-touch gestures (2-finger pinch-to-zoom AND 2-finger panning) to the canvas stage.
 */
export function setupGestures(stageEl, innerEl, getZoom, setZoom) {
  let touchStartDist = 0;
  let startZoom = 1;
  let isMultiTouch = false;
  let lastCenterX = 0;
  let lastCenterY = 0;

  stageEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      isMultiTouch = true;
      touchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      startZoom = getZoom();

      lastCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      lastCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
  }, { passive: false });

  stageEl.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();

      // 1. Pinch to zoom
      if (touchStartDist > 0) {
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const scale = currentDist / touchStartDist;
        setZoom(startZoom * scale);
      }

      // 2. Pan stage scrolling
      const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      const dx = currentCenterX - lastCenterX;
      const dy = currentCenterY - lastCenterY;

      stageEl.scrollLeft -= dx;
      stageEl.scrollTop -= dy;

      lastCenterX = currentCenterX;
      lastCenterY = currentCenterY;
    }
  }, { passive: false });

  stageEl.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      touchStartDist = 0;
      setTimeout(() => { isMultiTouch = false; }, 100);
    }
  });

  return {
    isMultiTouch: () => isMultiTouch
  };
}
