/* ============================================================
   PIXELTube — boot.js
   Cinematic bootup (moved directly from test-bootup.html) + news.

   The intro markup/CSS live in index.html inside #loader and the
   FX engines live in boot-cinema.js. No iframe — everything runs
   in the main document, scoped under #loader.

   Owns the #loader lifecycle:

     • Skip in settings / reduced motion? → loader hidden immediately
     • Otherwise                          → one of the 5 cinematic
                                             intros plays (~2s, with
                                             sound + replay controls)
     • Then                               → news card ("PIXELTube V1.1
                                            Now Released") unless
                                            seen/disabled
     • Continue / disable                 → loader fades, app takes over

   Settings keys (also toggled in the PIXELSettings panel):
     pixeltube-boot-enabled   '1' | '0'      cinematic intro
     pixeltube-boot-style     'cinema' | 'pixel'   (cinema = this intro)
     pixeltube-news-enabled   '1' | '0'      startup news
     pixeltube-news-seen      version        shown once per release
   ============================================================ */
(() => {
  'use strict';

  const LS_BOOT = 'pixeltube-boot-enabled';
  const LS_NEWS = 'pixeltube-news-enabled';
  const LS_SEEN = 'pixeltube-news-seen';
  const NEWS_VERSION = 'v1.1';

  /* How long the cinematic intro gets to play before the app takes over.
     The intro itself is ~2s; the extra time lets you use the replay /
     intro-picker controls at the bottom of the bootup screen. */
  const BOOT_MS = 6500;

  const flag = (key, dflt) => {
    try { const v = localStorage.getItem(key); return v === null ? dflt : v === '1'; }
    catch (_) { return dflt; }
  };
  const seen = () => {
    try { return localStorage.getItem(LS_SEEN) === NEWS_VERSION; }
    catch (_) { return false; }
  };
  const markSeen = () => {
    try { localStorage.setItem(LS_SEEN, NEWS_VERSION); } catch (_) { }
  };

  const loader = document.getElementById('loader');
  const news = document.getElementById('bootNews');
  const cinema = window.PIXELBootCinema || null;
  if (!loader) return;

  function hide() {
    if (cinema) cinema.stop();
    loader.classList.add('hide');
  }

  function showNews() {
    if (!news) { hide(); return; }
    /* Freeze the intro behind a dimmer while the news card is up */
    loader.classList.add('nb-dim');
    news.hidden = false;
  }

  function afterBoot() {
    if (flag(LS_NEWS, true) && !seen()) showNews();
    else hide();
  }

  document.addEventListener('click', (e) => {
    if (news && e.target.closest('[data-news-continue]')) { markSeen(); hide(); return; }
    if (news && e.target.closest('[data-news-disable]')) {
      try { localStorage.setItem(LS_NEWS, '0'); } catch (_) { }
      markSeen();
      hide();
    }
  });

  /* Let main.js / settings.js know the boot module is alive */
  window.PIXELBoot = {
    version: NEWS_VERSION,
    appReady() { /* the intro timeline owns the reveal; nothing to rush */ }
  };

  const skipBoot = !flag(LS_BOOT, true);
  const reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (skipBoot || reducedMotion) {
    /* Skipped boot → skip the show entirely (news included). */
    if (cinema) cinema.stop();
    hide();
    return;
  }

  /* Play the cinematic intro (moved directly from test-bootup.html).
     boot-cinema.js loads before this script, so the engine is ready. */
  if (cinema) cinema.play();

  setTimeout(afterBoot, BOOT_MS);
})();
