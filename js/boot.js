/* ============================================================
   PIXELTube — boot.js
   Cinematic (Netflix-style) bootup + startup news.

   Standalone (no imports) so it works even if the app bundle
   fails. Owns the #loader lifecycle:

     • Skip in settings?  → loader hidden immediately
     • Otherwise          → cinematic intro (~4.2s)
     • Then               → news card ("PIXELTube V1.1 Now
                            Released") unless seen/disabled
     • Continue / disable → loader fades, app takes over

   Settings keys (also toggled in the PIXELSettings panel):
     pixeltube-boot-enabled   '1' | '0'      cinematic intro
     pixeltube-boot-style     'cinema' | 'pixel'
     pixeltube-news-enabled   '1' | '0'      startup news
     pixeltube-news-seen      version        shown once per release
   ============================================================ */
(() => {
  'use strict';

  const LS_BOOT  = 'pixeltube-boot-enabled';
  const LS_STYLE = 'pixeltube-boot-style';
  const LS_NEWS  = 'pixeltube-news-enabled';
  const LS_SEEN  = 'pixeltube-news-seen';
  const NEWS_VERSION = 'v1.1';
  const BOOT_MS = 7200;

  const flag = (key, dflt) => {
    try { const v = localStorage.getItem(key); return v === null ? dflt : v === '1'; }
    catch (_) { return dflt; }
  };
  const seen = () => {
    try { return localStorage.getItem(LS_SEEN) === NEWS_VERSION; }
    catch (_) { return false; }
  };
  const markSeen = () => {
    try { localStorage.setItem(LS_SEEN, NEWS_VERSION); } catch (_) {}
  };

  const loader = document.getElementById('loader');
  const stage = loader ? loader.querySelector('.nb-stage') : null;
  const news = document.getElementById('bootNews');
  if (!loader) return;

  function hide() { loader.classList.add('hide'); }

  function showNews() {
    if (!news) { hide(); return; }
    if (stage) stage.classList.add('nb-dim');
    news.hidden = false;
  }

  function afterBoot() {
    if (flag(LS_NEWS, true) && !seen()) showNews();
    else hide();
  }

  document.addEventListener('click', (e) => {
    if (news && e.target.closest('[data-news-continue]')) { markSeen(); hide(); return; }
    if (news && e.target.closest('[data-news-disable]')) {
      try { localStorage.setItem(LS_NEWS, '0'); } catch (_) {}
      markSeen();
      hide();
    }
  });

  window.PIXELBoot = {
    version: NEWS_VERSION,
    appReady() { /* the timeline owns the reveal; nothing to rush */ }
  };

  const skipBoot = !flag(LS_BOOT, true);
  const reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (skipBoot || reducedMotion) {
    if (stage) stage.classList.add('nb-static');
    try {
      const fill = loader.querySelector('.nb-bar-fill');
      const pct = document.getElementById('nbPercent');
      if (fill) fill.style.width = '100%';
      if (pct) pct.textContent = '100%';
    } catch (_) {}
    // Skipped boot → skip the show entirely (news included).
    hide();
    return;
  }

  // Boot style: 'cinema' (logo.png show) or 'pixel' (peaceful, pixelated,
  // CSS glitch) — chosen in PIXELSettings → Boot experience.
  let style = 'cinema';
  try {
    const s = localStorage.getItem(LS_STYLE);
    if (s === 'pixel' || s === 'cinema') style = s;
  } catch (_) {}
  if (stage) stage.classList.add(style === 'pixel' ? 'nb-pixel' : 'nb-cinema');

  // Floating particles (cinema only, ported from test-bootup.html).
  if (style === 'cinema') {
    const box = loader.querySelector('.nb-particles');
    if (box) {
      for (let i = 0; i < 65; i++) {
        const p = document.createElement('i');
        p.className = 'nb-particle';
        p.style.left = (Math.random() * 100) + '%';
        p.style.animationDuration = (3 + Math.random() * 6) + 's';
        p.style.animationDelay = (Math.random() * 5) + 's';
        box.appendChild(p);
      }
    }
  }

  // Progress readout: %, phase label and status messages — shared by both
  // modes. Driven by requestAnimationFrame with an ease-out curve so the
  // bar moves butter-smooth: quick at first, gently slowing near 100%.
  const fill = loader.querySelector('.nb-bar-fill');
  const pct = document.getElementById('nbPercent');
  const label = document.getElementById('nbLoadLabel');
  const statusEl = document.getElementById('loaderStatus');
  const messages = [
    'INITIALIZING PIXELTUBE',
    'LOADING GRAPHICS ENGINE',
    'CONNECTING TO SERVERS',
    'PREPARING INTERFACE',
    'OPTIMIZING EXPERIENCE',
    'STARTING PIXELTUBE',
    'SYSTEM READY'
  ];
  const PROGRESS_MS = 6300; // reach 100% just before the boot ends
  const bootStart = performance.now();
  let lastValue = -1;

  const finishProgress = () => {
    if (fill) fill.style.width = '100%';
    if (pct) pct.textContent = '100%';
    if (label) label.textContent = 'COMPLETE';
    if (statusEl) statusEl.textContent = 'WELCOME TO PIXELTUBE';
    if (style === 'cinema' && stage) stage.classList.add('nb-complete'); // final flash
  };

  const frame = (now) => {
    const t = Math.min(1, (now - bootStart) / PROGRESS_MS);
    const eased = 1 - Math.pow(1 - t, 2.1); // ease-out: fast → gentle
    const value = Math.min(100, Math.floor(eased * 100));

    if (value !== lastValue) {
      lastValue = value;
      if (fill) fill.style.width = value + '%';
      if (pct) pct.textContent = value + '%';
      if (statusEl) statusEl.textContent = messages[Math.min(Math.floor(value / 15), messages.length - 1)];
      if (label) label.textContent = value < 35 ? 'POWERING UP' : value < 70 ? 'LOADING' : value < 100 ? 'FINALIZING' : 'COMPLETE';
    }

    if (t < 1) requestAnimationFrame(frame);
    else finishProgress();
  };
  requestAnimationFrame(frame);

  setTimeout(afterBoot, BOOT_MS);
})();
