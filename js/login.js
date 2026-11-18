/* =====================================================================
   PIXLECT Remap Auth — js/login.js (PIXELTube)
   Canonical host: www.pixeltube.pixlect-studios.com
   Safe domain discovery: a dead auth subdomain never blocks the app.
   ===================================================================== */
(function () {
  'use strict';

  const CONFIG = {
    appName: 'PIXELTube',
    authServerDomain: 'https://www.account.pixlect-studios.com/domain.json',
    loginUrl: 'https://www.account.pixlect-studios.com/index.html',
    localDomainJson: '/domain.json',
    localLoginUrl: '/login.html',
    storageKey: 'pixeltube:pixlect_user',
    authSuccessKey: 'pixlect_auth_success',
    popupWidth: 520,
    popupHeight: 640,
    discoveryTimeoutMs: 5000
  };

  let currentUser = null;
  const listeners = new Set();
  let isAuthorized = false;
  let discoveryAttempted = false;
  let authPopup = null;
  let popupChecker = null;

  function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.discoveryTimeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }

  async function checkAuthorization() {
    discoveryAttempted = true;
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    try {
      const res = await fetchWithTimeout(CONFIG.authServerDomain, {
        cache: 'no-store',
        mode: 'cors',
        credentials: 'omit'
      });
      if (res.ok) {
        const data = await res.json();
        isAuthorized = Array.isArray(data.allowedOrigins)
          ? data.allowedOrigins.includes(location.origin)
          : true;
        return;
      }
    } catch (err) {
      console.warn('[pixlect] auth discovery unavailable:', err.message || err.name);
    }

    if (isLocalhost) {
      try {
        const res = await fetchWithTimeout(CONFIG.localDomainJson, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          isAuthorized = Array.isArray(data.allowedOrigins)
            ? data.allowedOrigins.includes(location.origin)
            : true;
          return;
        }
      } catch (err) {
        console.warn('[pixlect] local domain discovery failed:', err.message || err.name);
      }
    }

    isAuthorized = false;
  }

  function setButtonState(state, reason) {
    const btn = document.getElementById('pixlect-login');
    if (!btn) return;
    if (state === 'disabled') {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.title = reason || 'Sign-in unavailable';
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    } else {
      btn.disabled = false;
      btn.removeAttribute('aria-disabled');
      btn.title = 'Sign in with PIXLECT';
      btn.style.opacity = '';
      btn.style.cursor = '';
    }
  }

  function checkLocalStorageForAuth() {
    const authData = localStorage.getItem(CONFIG.authSuccessKey);
    if (!authData) return false;
    try {
      const user = JSON.parse(authData);
      localStorage.removeItem(CONFIG.authSuccessKey);
      const clean = normalizeUser(user);
      if (clean) {
        setUser(clean);
        broadcastToMain(clean);
        if (authPopup && !authPopup.closed) authPopup.close();
        if (popupChecker) { clearInterval(popupChecker); popupChecker = null; }
        return true;
      }
    } catch (err) {
      console.warn('[pixlect] could not read auth success payload:', err);
    }
    return false;
  }

  function normalizeUser(user) {
    if (!user || typeof user !== 'object') return null;
    const username = String(user.username || user.name || '').trim();
    const uid = String(user.uid || user.id || '').trim();
    if (!username || !uid) return null;
    return {
      username,
      uid,
      icon: user.icon || { bg: '#38bdf8', emoji: '👤' }
    };
  }

  function broadcastToMain(user) {
    try {
      const payload = {
        type: 'PIXLECT_AUTH',
        app: 'PIXELTube',
        status: 'success',
        user
      };
      window.postMessage(payload, location.origin);
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, '*');
      }
    } catch (err) {
      console.warn('[pixlect] could not broadcast auth success:', err);
    }
  }

  window.addEventListener('storage', (e) => {
    if (e.key === CONFIG.authSuccessKey) checkLocalStorageForAuth();
  });

  window.addEventListener('focus', () => {
    if (authPopup && !authPopup.closed) checkLocalStorageForAuth();
  });

  window.addEventListener('message', (e) => {
    if (!e.data) return;
    if (e.data.type === 'PIXLECT_AUTH_SUCCESS' || e.data.type === 'PIXLECT_AUTH') {
      const clean = normalizeUser(e.data.user);
      if (!clean) return;
      setUser(clean);
      if (authPopup && !authPopup.closed) authPopup.close();
      if (popupChecker) { clearInterval(popupChecker); popupChecker = null; }
    }
  });

  function openLogin() {
    if (!isAuthorized) {
      alert('PIXELTube sign-in is not configured for this site yet.');
      return;
    }

    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const targetUrl = isLocalhost ? CONFIG.localLoginUrl : CONFIG.loginUrl;
    const popupUrl = `${targetUrl}?app=${encodeURIComponent(CONFIG.appName)}&mode=popup&origin=${encodeURIComponent(location.origin)}`;

    const w = CONFIG.popupWidth;
    const h = CONFIG.popupHeight;
    const left = Math.max(0, window.screenX + (window.outerWidth - w) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - h) / 2);

    authPopup = window.open(
      popupUrl,
      'PixlectLogin',
      `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
    );

    if (popupChecker) clearInterval(popupChecker);
    popupChecker = setInterval(() => {
      if (!authPopup || authPopup.closed) {
        clearInterval(popupChecker);
        popupChecker = null;
        checkLocalStorageForAuth();
        return;
      }
      checkLocalStorageForAuth();
    }, 500);
  }

  function setUser(user) {
    currentUser = user || null;
    if (user) localStorage.setItem(CONFIG.storageKey, JSON.stringify(user));
    else localStorage.removeItem(CONFIG.storageKey);
    renderUser();
    listeners.forEach((fn) => {
      try { fn(currentUser); } catch (_) { /* ignore listener error */ }
    });
  }

  function logout() {
    setUser(null);
    try {
      const payload = { type: 'PIXLECT_SIGNOUT', app: 'PIXELTube' };
      window.postMessage(payload, location.origin);
    } catch (_) {}
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function renderUser() {
    const btn = document.getElementById('pixlect-login');
    const slot = document.getElementById('authSlot');

    if (currentUser) {
      if (btn) btn.hidden = true;
      if (!slot) return;
      const initial = currentUser.username ? currentUser.username[0].toUpperCase() : '?';
      const displayName = currentUser.username || 'User';
      slot.innerHTML = `
        <div class="pixlect-user-badge">
          <div style="width:32px;height:32px;background:var(--accent,#7c5cff);border-radius:50%;display:grid;place-items:center;font-weight:bold;color:#fff;">${escapeHtml(initial)}</div>
          <div style="display:flex;flex-direction:column;line-height:1.2;font-family:inherit;">
            <strong style="font-size:14px;color:var(--text,#e8eefc);">${escapeHtml(displayName)}</strong>
            <small style="color:var(--muted,#8fa0c4);font-size:11px;">PIXLECT Account</small>
          </div>
          <button type="button" id="pixlect-logout" style="margin-left:8px;padding:6px 14px;border-radius:999px;border:1px solid var(--line,#22304f);background:transparent;color:var(--text,#e8eefc);font-size:12px;font-weight:600;cursor:pointer;">Sign out</button>
        </div>`;
      const out = document.getElementById('pixlect-logout');
      if (out) out.onclick = logout;
    } else {
      if (btn) btn.hidden = false;
    }
  }

  function bindButton() {
    const btn = document.getElementById('pixlect-login');
    if (!btn || btn.__pixlectBound) return;
    btn.__pixlectBound = true;
    btn.addEventListener('click', openLogin);
  }

  async function init() {
    checkLocalStorageForAuth();
    await checkAuthorization();
    setButtonState(isAuthorized ? 'enabled' : 'disabled',
      isAuthorized ? null : 'Sign-in unavailable (auth discovery failed)');

    const saved = localStorage.getItem(CONFIG.storageKey);
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch (_) { renderUser(); }
    } else {
      renderUser();
    }
    bindButton();
    if (document.body && window.MutationObserver) {
      new MutationObserver(bindButton).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PixlectAuth = {
    get user() { return currentUser; },
    get authorized() { return isAuthorized; },
    get discoveryAttempted() { return discoveryAttempted; },
    login: openLogin,
    logout,
    onChange(fn) {
      listeners.add(fn);
      if (currentUser) fn(currentUser);
      return () => listeners.delete(fn);
    }
  };
})();