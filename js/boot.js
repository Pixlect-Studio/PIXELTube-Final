/* ============================================================
   PIXELTube — boot.js
   Owns the #loader lifecycle (classic + cinematic modes).

   Bootup modes (Settings → Boot experience):
     - Bootup style "off"        → no loader at all
     - Bootup style "classic"    → logo + progress bar
     - Bootup style 0–4 / "random" → cinematic intro from
       test-bootup.html, rendered INLINE (no iframe) via
       js/boot-cinema.js. Loader hides when the app signals
       readiness (window.PIXELBoot.appReady()) or after a
       safety timeout.
   ============================================================ */
(() => {
  'use strict';

  const loader = document.getElementById('loader');
  if (!loader) return;

  /* Safety net: never hang the user on the loading screen. */
  const MAX_MS = 4000;
  const CINEMA_MAX_MS = 5000;

  const flag = (key, dflt) => {
    try { const v = localStorage.getItem(key); return v === null ? dflt : v === '1'; }
    catch (_) { return dflt; }
  };
  const raw = (key, dflt) => {
    try { const v = localStorage.getItem(key); return v === null ? dflt : v; }
    catch (_) { return dflt; }
  };

  /* Setting off (or reduced motion) → hide the loader immediately. */
  const reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bootEnabled = flag('pixeltube-boot-enabled', true);

  let hidden = false;
  function hide() {
    if (hidden) return;
    hidden = true;
    if (window.PIXELBootCinema) window.PIXELBootCinema.stop();
    loader.classList.add('hide');
    setTimeout(() => { loader.style.display = 'none'; }, 450);
  }

  window.PIXELBoot = {
    version: 'v1.2',
    appReady() { hide(); }
  };

  if (!bootEnabled || reducedMotion) {
    loader.classList.add('hide');
    loader.style.display = 'none';
    return;
  }

  /* ---------- Resolve bootup style ----------
     'auto' (default): smart Cinema mode — play a cinematic intro on
     the first visit of a session, then fall back to the Classic
     loader for the rest of the session (so it's cinematic without
     getting in the way on every refresh). 'classic' / 'random' /
     '0'–'4' force a specific behavior every time. */
  const LS_STYLE = 'pixeltube-boot-style';
  const style = raw(LS_STYLE, 'auto');

  const ss = (typeof sessionStorage !== 'undefined') ? sessionStorage : null;
  const playedThisSession = ss ? ss.getItem('pixeltube-boot-played') === '1' : false;

  /* 'auto' → Cinema on first load of the session, Classic afterwards.
     Any explicit cinema style → Cinema every time. */
  let effective = style;
  if (style === 'auto') {
    effective = playedThisSession ? 'classic' : 'random';
    if (ss) { try { ss.setItem('pixeltube-boot-played', '1'); } catch (_) {} }
  }

  if (effective !== 'classic' && !reducedMotion && window.PIXELBootCinema) {
    /* Cinematic mode: show the inline cinema stage instead of the
       classic logo + bar, then play the chosen intro. */
    loader.dataset.bootCinema = '1';

    /* Solo mode: the auto-boot intro plays by itself — no preview
       controls (Play Random button, intro pills, audio button). */
    loader.classList.add('cinema-boot-solo');

    const forced = effective === 'random' ? null : Number(effective);
    /* Small delay so layout/fonts settle before the intro starts. */
    setTimeout(() => window.PIXELBootCinema.play(forced), 60);

    /* If the app is slow to signal ready, stop the cinema cleanly. */
    setTimeout(hide, CINEMA_MAX_MS);

    /* Skip button: clicking anywhere on the cinema stage skips the intro. */
    const cinemaEl = loader.querySelector('.loader-cinema');
    if (cinemaEl) {
      cinemaEl.addEventListener('click', (e) => {
        /* Don't skip when interacting with the dock/HUD controls. */
        if (e.target.closest('.intro-pill, .cinema-random, #audio-btn')) return;
        hide();
      });
    }
  } else {
    /* Classic mode. If the logo file is missing, show a branded fallback. */
    const logoBox = document.getElementById('loaderLogo');
    const logoImg = logoBox ? logoBox.querySelector('img') : null;
    if (logoImg) {
      logoImg.addEventListener('error', () => {
        logoBox.classList.add('logo-missing');
        logoBox.textContent = 'PIXEL Tube';
      });
    }
    setTimeout(hide, MAX_MS);
  }
})();
