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
  const BOOT_MS = 6800;

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
    // Skipped boot → skip the show entirely (news included).
    hide();
    return;
  }

  // Boot style: 'cinema' (Netflix-style) or 'pixel' (peaceful, pixelated,
  // CSS glitch) — chosen in PIXELSettings → Boot experience.
  let style = 'cinema';
  try {
    const s = localStorage.getItem(LS_STYLE);
    if (s === 'pixel' || s === 'cinema') style = s;
  } catch (_) {}
  if (stage) stage.classList.add(style === 'pixel' ? 'nb-pixel' : 'nb-cinema');

  setTimeout(afterBoot, BOOT_MS);
})();
