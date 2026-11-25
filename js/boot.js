/* ============================================================
   PIXELTube — boot.js
   Owns the #loader lifecycle.

   The loader shows: logo in a white panel + indeterminate bar.
   It hides as soon as the app signals readiness
   (window.PIXELBoot.appReady()) or after a safety timeout.
   ============================================================ */
(() => {
  'use strict';

  const loader = document.getElementById('loader');
  if (!loader) return;

  /* Safety net: never hang the user on the loading screen. */
  const MAX_MS = 4000;

  const flag = (key, dflt) => {
    try { const v = localStorage.getItem(key); return v === null ? dflt : v === '1'; }
    catch (_) { return dflt; }
  };

  /* Setting off (or reduced motion) → hide the loader immediately. */
  const reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!flag('pixeltube-boot-enabled', true) || reducedMotion) {
    loader.classList.add('hide');
    loader.style.display = 'none';
    return;
  }

  let hidden = false;
  function hide() {
    if (hidden) return;
    hidden = true;
    loader.classList.add('hide');
    setTimeout(() => { loader.style.display = 'none'; }, 450);
  }

  /* If the logo file is missing, show a branded fallback tile. */
  const logoBox = document.getElementById('loaderLogo');
  const logoImg = logoBox ? logoBox.querySelector('img') : null;
  if (logoImg) {
    logoImg.addEventListener('error', () => {
      logoBox.classList.add('logo-missing');
      logoBox.textContent = 'PIXEL Tube';
    });
  }

  window.PIXELBoot = {
    version: 'v1.1',
    appReady() { hide(); }
  };

  setTimeout(hide, MAX_MS);
})();
