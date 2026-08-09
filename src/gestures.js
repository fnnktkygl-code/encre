"use strict";

/**
 * Attaches multi-touch gestures (2-finger pinch-to-zoom and pan) to the canvas stage.
 */
export function setupGestures(stageEl, innerEl, getZoom, setZoom) {
  let touchStartDist = 0;
  let startZoom = 1;
  let isMultiTouch = false;

  stageEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      isMultiTouch = true;
      touchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      startZoom = getZoom();
    }
  }, { passive: false });

  stageEl.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && touchStartDist > 0) {
      e.preventDefault();
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = currentDist / touchStartDist;
      setZoom(startZoom * scale);
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
