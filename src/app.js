"use strict";

import { initImageApp } from './imageApp.js';
import { initVideoApp } from './videoApp.js';
import { initPWA } from './pwa.js';

document.addEventListener('DOMContentLoaded', () => {
  const imageApp = initImageApp();
  const videoApp = initVideoApp();
  initPWA();

  // Mode Switcher Tabs
  const tabImageBtn = document.getElementById('tab-image-btn');
  const tabVideoBtn = document.getElementById('tab-video-btn');
  const imageView = document.getElementById('image-view');
  const videoView = document.getElementById('video-view');

  function switchView(viewName) {
    if (viewName === 'image') {
      tabImageBtn.classList.add('active');
      tabImageBtn.setAttribute('aria-selected', 'true');
      tabVideoBtn.classList.remove('active');
      tabVideoBtn.setAttribute('aria-selected', 'false');

      imageView.classList.remove('hidden');
      videoView.classList.add('hidden');
    } else if (viewName === 'video') {
      tabVideoBtn.classList.add('active');
      tabVideoBtn.setAttribute('aria-selected', 'true');
      tabImageBtn.classList.remove('active');
      tabImageBtn.setAttribute('aria-selected', 'false');

      videoView.classList.remove('hidden');
      imageView.classList.add('hidden');
    }
  }

  tabImageBtn?.addEventListener('click', () => switchView('image'));
  tabVideoBtn?.addEventListener('click', () => switchView('video'));

  // Theme Toggle
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');

  function getPreferredTheme() {
    const saved = localStorage.getItem('encre-theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('encre-theme', theme);
    if (themeIcon) {
      if (theme === 'light') {
        themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
      } else {
        themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>';
      }
    }
  }

  const initialTheme = getPreferredTheme();
  applyTheme(initialTheme);

  themeToggle?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  // Global Smart Drag & Drop Routing
  const dropOverlay = document.getElementById('drop-overlay');
  let dragCounter = 0;

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    document.body.classList.add('dragging');
    if (dropOverlay) dropOverlay.style.display = 'flex';
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      document.body.classList.remove('dragging');
      if (dropOverlay) dropOverlay.style.display = 'none';
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    document.body.classList.remove('dragging');
    if (dropOverlay) dropOverlay.style.display = 'none';

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const first = files[0];

      if (first.type.startsWith('video/') || first.name.match(/\.(mp4|webm|mov|mkv|avi)$/i)) {
        switchView('video');
        videoApp.loadVideoFile(first);
      } else {
        switchView('image');
        files.forEach(f => imageApp.loadFile(f));
      }
    }
  });

  // Global Paste Routing
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          if (file.type.startsWith('video/')) {
            switchView('video');
            videoApp.loadVideoFile(file);
          } else {
            switchView('image');
            imageApp.loadFile(file);
          }
        }
      }
    }
  });
});
