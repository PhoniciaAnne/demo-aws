'use strict';
// ── Theme toggle shared script ──────────────────────────────────────
(function () {
  const STORAGE_KEY = 'billing-app-theme';
  const icons = { dark: '🌙', light: '☀️' };

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      const iconEl = btn.querySelector('.theme-icon');
      if (iconEl) iconEl.textContent = theme === 'dark' ? icons.dark : icons.light;
    }
  }

  window.toggleTheme = function () {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  };

  // Auto-apply saved theme on load
  const saved = localStorage.getItem(STORAGE_KEY) || 'dark';
  applyTheme(saved);
})();
