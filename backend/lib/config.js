/* ============================================================
   PIXELTube backend — lib/config.js
   Edge-safe configuration resolver (Web APIs only — no Node
   imports, so the same module runs on Vercel Edge Functions
   and in Node for local dev).

   Resolution order per key:
     1. Real environment variables (process.env on Vercel)
     2. DATA_ENV — a single env var containing the whole
        data.env content (handy for the Vercel dashboard)
     3. Seeded file values (backend/server.js reads
        backend/data.env on local start and seeds them here)

   Values are held in memory only — never logged, and only
   published through routes designed for it (/api/config
   publishes public values; the Bunny API key never leaves).
   ============================================================ */

let fileEnv = null;   // seeded from data.env (local) or DATA_ENV (Vercel)
let inited = false;

function parseEnv(text) {
  const env = {};
  if (!text) return env;

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!key) continue;

    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }

  return env;
}

/** Seed values (e.g. parsed data.env) — real env vars still win. */
export function seedConfig(pairs) {
  if (pairs && typeof pairs === 'object') {
    fileEnv = { ...(fileEnv || {}), ...pairs };
  }
}

/** Lazy init: pick up DATA_ENV when present (Vercel dashboard). */
export function ensureConfig() {
  if (inited) return;
  inited = true;

  try {
    if (typeof process !== 'undefined' && process.env && process.env.DATA_ENV) {
      const parsed = parseEnv(process.env.DATA_ENV);
      fileEnv = { ...(parsed), ...(fileEnv || {}) };
      console.log(`[backend:config] DATA_ENV loaded (${Object.keys(parsed).length} keys — values not shown)`);
    }
  } catch (_) { /* process unavailable on some runtimes — fine */ }
}

/** Safe getter — returns fallback when unset. */
export function configValue(key, fallback = '') {
  ensureConfig();
  try {
    if (typeof process !== 'undefined' && process.env) {
      const direct = process.env[key];
      if (direct !== undefined && direct !== '') return direct;
    }
  } catch (_) { /* ignore */ }
  if (fileEnv && fileEnv[key] !== undefined && fileEnv[key] !== '') return fileEnv[key];
  return fallback;
}

/** Which keys are present (booleans only — never the values). */
export function envStatus() {
  return {
    bunnyLibraryId: !!configValue('BUNNY_LIBRARY_ID'),
    bunnyApiKey:    !!configValue('BUNNY_STREAM_API_KEY'),
    bunnyCdnHost:   !!configValue('BUNNY_CDN_HOST'),
    firebaseApiKey: !!configValue('FIREBASE_API_KEY')
  };
}
