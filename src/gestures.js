"use strict";

/**
 * Attaches multi-touch gestures (2-finger pinch-to-zoom AND 2-finger panning) to the canvas stage.
 */
export function setupGestures(stageEl, innerElOrOptions, maybeGetZoom, maybeSetZoom) {
  let touchStartDist = 0;
  let startZoom = 1;
  let isMultiTouch = false;
  let lastCenterX = 0;
  let lastCenterY = 0;

  const isOptionsObject = innerElOrOptions && typeof innerElOrOptions === 'object' && ('onPinch' in innerElOrOptions || 'onPan' in innerElOrOptions);
  const options = isOptionsObject ? innerElOrOptions : null;

  const getZoomFn = typeof maybeGetZoom === 'function' ? maybeGetZoom : () => 1;
  const setZoomFn = typeof maybeSetZoom === 'function' ? maybeSetZoom : () => {};

  if (!stageEl) return { isMultiTouch: () => false };

  stageEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      isMultiTouch = true;
      touchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      startZoom = getZoomFn();

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
        if (options && typeof options.onPinch === 'function') {
          options.onPinch(scale, lastCenterX, lastCenterY);
        } else {
          setZoomFn(startZoom * scale);
        }
      }

      // 2. Pan stage scrolling
      const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      const dx = currentCenterX - lastCenterX;
      const dy = currentCenterY - lastCenterY;

      if (options && typeof options.onPan === 'function') {
        options.onPan(dx, dy);
      } else {
        stageEl.scrollLeft -= dx;
        stageEl.scrollTop -= dy;
      }

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
