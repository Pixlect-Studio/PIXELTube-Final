/* ============================================================
   PIXELTube — env.js
   Loads public config at runtime in the browser.

   Dual-end setup: secrets live in the backend (backend/data.env).
   The browser fetches ONLY public values from GET /api/config.
   A legacy fallback still reads ./data.env for fully static
   deployments, but the Bunny API key is never expected here.

   Usage:
     import { loadEnv, getEnv } from './env.js';
     const env = await loadEnv();
     const key = env.BUNNY_CDN_HOST;
   ============================================================ */

const BACKEND_CONFIG = '/api/config';
const ENV_PATH = './data.env';

let envCache = null;
let envPromise = null;

/**
 * Fetch and parse .env once. Subsequent calls return the cached
 * object immediately (no extra network request).
 */
export function loadEnv() {
  if (envCache) return Promise.resolve(envCache);
  if (envPromise) return envPromise;

  envPromise = (async () => {
  // 1) Preferred: backend /api/config (public values only — no secrets).
  try {
    const res = await fetch(BACKEND_CONFIG, { cache: 'no-store' });
    if (res.ok) {
      const cfg = await res.json();
      const env = {
        BUNNY_LIBRARY_ID:     cfg.BUNNY_LIBRARY_ID || '',
        BUNNY_CDN_HOST:       cfg.BUNNY_CDN_HOST || '',
        // The backend never publishes the Bunny API key; uploads are
        // pre-signed server-side via POST /api/uploads/init.
        BUNNY_STREAM_API_KEY: '',
        ...(cfg.firebase ? {
          FIREBASE_API_KEY: cfg.firebase.apiKey || '',
          FIREBASE_PROJECT_ID: cfg.firebase.projectId || ''
        } : {})
      };
      envCache = env;
      console.log('[env] loaded from backend', Object.keys(env).length, 'keys (no secrets)');
      if (!env.BUNNY_LIBRARY_ID || !env.BUNNY_CDN_HOST) {
        console.info('[env] backend reachable but BUNNY_LIBRARY_ID/BUNNY_CDN_HOST are empty — set them as Vercel environment variables (or DATA_ENV).');
      }
      return env;
    }
    console.warn('[env] /api/config returned', res.status, '— is the Edge function deployed?');
  } catch (err) {
    console.warn('[env] backend config unavailable:', err?.message || err);
  }

  // 2) Fallback: legacy static data.env (only public-ish values expected).
  try {
    const res = await fetch(ENV_PATH, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${ENV_PATH} returned ${res.status}`);
    const text = await res.text();
    const env = parseEnv(text);
    envCache = env;
    console.log('[env] loaded', Object.keys(env).length, 'keys');
    return env;
  } catch (err) {
    // Expected on backend deploys (data.env is server-side only).
    console.info('[env] no legacy', ENV_PATH, '(normal on backend deployments) —', err?.message);
    envCache = {};
    return envCache;
  }
})();

  return envPromise;
}

/** Synchronous access — returns cache or empty object. */
export function getEnv() {
  return envCache || {};
}

/** Force a reload. */
export function reloadEnv() {
  envCache = null;
  envPromise = null;
  return loadEnv();
}

/* ============================================================
   PARSER
   ============================================================ */
function parseEnv(text) {
  const env = {};
  if (!text) return env;

  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('#')) return;

    const eq = trimmed.indexOf('=');
    if (eq === -1) return;

    const key = trimmed.slice(0, eq).trim();
    if (!key) return;

    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  });

  return env;
}

/* Convenience getters */
export function bunnyLibraryId() { return getEnv().BUNNY_LIBRARY_ID || ''; }
export function bunnyStreamKey() { return getEnv().BUNNY_STREAM_API_KEY || ''; }
export function bunnyCdnHost()   { return getEnv().BUNNY_CDN_HOST || ''; }
