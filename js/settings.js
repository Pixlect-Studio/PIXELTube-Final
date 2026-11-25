/* ============================================================
   PIXELTube — settings.js
   Settings panel: theme mode (dark/light) + color palette picker.
   Standalone (no imports) so it works on any page.
   ============================================================ */
(() => {
  'use strict';

  const THEMES = [
    { id: 'midnight', name: 'Midnight', color: '#3B82F6' },
    { id: 'violet',   name: 'Violet',   color: '#7C5CFF' },
    { id: 'emerald',  name: 'Emerald',  color: '#10B981' },
    { id: 'rose',     name: 'Rose',     color: '#F43F5E' },
    { id: 'amber',    name: 'Amber',    color: '#F59E0B' },
    { id: 'cyan',     name: 'Cyan',     color: '#06B6D4' },
    { id: 'mono',     name: 'Mono',     color: '#9CA3AF' }
  ];

  const LS_THEME  = 'pixeltube-theme';
  const LS_ACCENT = 'pixeltube-accent';
  const LS_BOOT   = 'pixeltube-boot-enabled';
  const LS_BOOT_STYLE = 'pixeltube-boot-style';

  const BOOT_STYLES = [
    { id: 'auto',    name: 'Auto (Cinema)',  hint: 'Cinematic intro on first load of the session, then Classic' },
    { id: 'classic', name: 'Classic',        hint: 'Logo + progress bar' },
    { id: 'random',  name: 'Random Cinema',  hint: 'Random cinematic intro each visit' },
    { id: '0',       name: 'Cinema Ribbons', hint: 'Netflix-style dramatic swell' },
    { id: '1',       name: '8-Bit Console',  hint: 'Arcade power-on drop' },
    { id: '2',       name: 'Cyber Glitch',   hint: 'RGB chromatic snap' },
    { id: '3',       name: 'Warp Starfield', hint: 'Hyperspace slam forward' },
    { id: '4',       name: 'Neon Laser Etch',hint: 'Synthwave laser materialize' }
  ];
  const getBootStyle = () => {
    try { return localStorage.getItem(LS_BOOT_STYLE) || 'auto'; }
    catch (_) { return 'auto'; }
  };

  const getFlag = (key, dflt) => {
    try { const v = localStorage.getItem(key); return v === null ? dflt : v === '1'; }
    catch (_) { return dflt; }
  };
  const setFlag = (key, val) => {
    try { localStorage.setItem(key, val ? '1' : '0'); } catch (_) {}
  };

  const getTheme  = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  const getAccent = () => document.documentElement.dataset.accent || 'midnight';

  function applyTheme(mode) {
    document.documentElement.dataset.theme = mode;
    try { localStorage.setItem(LS_THEME, mode); } catch (e) {}
  }
  function applyAccent(accent) {
    document.documentElement.dataset.accent = accent;
    try { localStorage.setItem(LS_ACCENT, accent); } catch (e) {}
  }

  let panelRoot = null;

  function buildPanel() {
    const mode  = getTheme();
    const accent = getAccent();
    return `
      <div class="settings-panel">
        <h2 data-glitch-text="PIXELSettings"><b>PIXEL</b>Settings</h2>
        <div class="settings-sub">Personalize how PIXELTube looks on this device.</div>

        <div class="settings-group">
          <label class="settings-label">Appearance</label>
          <div class="mode-row">
            <button class="mode-btn ${mode === 'dark' ? 'active' : ''}" data-settings-mode="dark" type="button">
              <svg viewBox="0 0 24 24"><path d="M9.37 5.51A8 8 0 0 0 18.49 14.6 8.5 8.5 0 1 1 9.37 5.5z"/></svg>
              Dark
            </button>
            <button class="mode-btn ${mode === 'light' ? 'active' : ''}" data-settings-mode="light" type="button">
              <svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-6a1 1 0 0 1 1 1v2h-2V3a1 1 0 0 1 1-1zm0 18a1 1 0 0 1 1 1v2h-2v-2a1 1 0 0 1 1-1zM4.22 2.81l1.42 1.41-1.41 1.42-1.42-1.41 1.41-1.42zm14.14 0 1.41 1.42-1.41 1.41-1.42-1.41 1.42-1.42zM2 12a1 1 0 0 1 1-1h2v2H3a1 1 0 0 1-1-1zm17 0a1 1 0 0 1 1-1h2v2h-2a1 1 0 0 1-1-1zM4.22 21.19l-1.41-1.41 1.42-1.41 1.41 1.41-1.42 1.41zm14.14 0-1.42 1.41-1.41-1.41 1.41-1.41 1.42 1.41z"/></svg>
              Light
            </button>
          </div>
        </div>

        <div class="settings-group">
          <label class="settings-label">Accent color</label>
          <div class="theme-grid">
            ${THEMES.map(t => `
              <button class="theme-swatch ${t.id === accent ? 'active' : ''}" data-settings-accent="${t.id}" type="button" title="${t.name}">
                <span class="dot" style="background:${t.color}"></span>
                <span>${t.name}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="settings-group">
          <label class="settings-label">Boot experience</label>
          <div class="mode-row">
            <button class="mode-btn ${getFlag(LS_BOOT, true) ? 'active' : ''}" data-settings-boot="${getFlag(LS_BOOT, true) ? '0' : '1'}" type="button" title="Show the loading screen when the app loads">
              ✨ Loading screen
            </button>
          </div>
          <div class="settings-sub">Highlighted = the loading screen shows on the next visit.</div>
          ${getFlag(LS_BOOT, true) ? `
          <label class="settings-label" style="margin-top:10px">Custom bootup</label>
          <div class="theme-grid">
            ${BOOT_STYLES.map(s => `
              <button class="theme-swatch ${s.id === getBootStyle() ? 'active' : ''}" data-settings-boot-style="${s.id}" type="button" title="${s.hint}">
                <span class="dot" style="background:${s.id === 'classic' ? '#9CA3AF' : s.id === 'random' ? 'linear-gradient(135deg,#e50914,#00f5d4)' : '#e50914'}"></span>
                <span>${s.name}</span>
              </button>
            `).join('')}
          </div>
          <div class="settings-sub">Pick the intro that plays on the next page load. Cinema styles play inline on the loading screen (with sound — click anywhere to skip).</div>
          ` : ''}
        </div>

        <div class="settings-actions">
          <button class="btn-secondary" data-settings-reset type="button">Reset to defaults</button>
          <button class="btn-primary" data-settings-close type="button">Done</button>
        </div>
      </div>`;
  }

  function refreshPanel() {
    if (!panelRoot) return;
    // Swap ONLY the panel inside the modal — replacing panelRoot.innerHTML
    // outright would drop the .modal-backdrop/.modal-wrap wrapper, breaking
    // centering and the click-outside-to-close behaviour.
    const current = panelRoot.querySelector('.settings-panel');
    if (current) current.outerHTML = buildPanel();
    else panelRoot.innerHTML = buildPanel();
  }

  function openPanel() {
    if (panelRoot) { closePanel(); return; }
    panelRoot = document.createElement('div');
    panelRoot.id = 'settingsRoot';
    panelRoot.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><div class="modal-wrap"><div class="modal">${buildPanel()}</div></div></div>`;
    document.body.appendChild(panelRoot);
  }
  function closePanel() {
    if (panelRoot) { panelRoot.remove(); panelRoot = null; }
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-settings-toggle]')) { openPanel(); return; }
    if (e.target.closest('[data-settings-close]')) { closePanel(); return; }
    if (panelRoot && e.target.matches('[data-modal-backdrop]')) { closePanel(); return; }

    const modeBtn = e.target.closest('[data-settings-mode]');
    if (modeBtn) {
      applyTheme(modeBtn.dataset.settingsMode);
      syncThemeToggleLabel();
      refreshPanel();
      return;
    }

    const accentBtn = e.target.closest('[data-settings-accent]');
    if (accentBtn) {
      applyAccent(accentBtn.dataset.settingsAccent);
      refreshPanel();
      return;
    }

    const bootBtn = e.target.closest('[data-settings-boot]');
    if (bootBtn) {
      setFlag(LS_BOOT, bootBtn.dataset.settingsBoot === '1');
      refreshPanel();
      return;
    }

    const bootStyleBtn = e.target.closest('[data-settings-boot-style]');
    if (bootStyleBtn) {
      try { localStorage.setItem(LS_BOOT_STYLE, bootStyleBtn.dataset.settingsBootStyle); } catch (_) {}
      refreshPanel();
      return;
    }

    if (e.target.closest('[data-settings-reset]')) {
      applyTheme('dark');
      applyAccent('midnight');
      try { localStorage.setItem(LS_BOOT_STYLE, 'auto'); } catch (_) {}
      syncThemeToggleLabel();
      refreshPanel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });

  /* Keep the old quick light/dark toggle button in sync */
  function syncThemeToggleLabel() {
    const button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    const nextTheme = getTheme() === 'light' ? 'dark' : 'light';
    button.setAttribute('aria-label', `Switch to ${nextTheme} mode`);
    button.title = `Switch to ${nextTheme} mode`;
  }

  document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-theme-toggle]');
    if (!button) return;
    applyTheme(getTheme() === 'light' ? 'dark' : 'light');
    syncThemeToggleLabel();
    refreshPanel();
  });

  syncThemeToggleLabel();
})();
