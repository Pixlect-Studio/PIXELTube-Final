/* ============================================================
   PIXELTube backend — env.js

   DEPRECATED — superseded by backend/lib/config.js (Edge-safe,
   shared with the Vercel deployment). Kept only for reference;
   nothing imports this file anymore.

   Loads backend/data.env (or backend/.env) at startup.

   IMPORTANT: values are parsed and held in memory only.
   They are NEVER logged and only ever returned through the
   routes that are explicitly designed to publish a key
   (currently: nothing — the Bunny API key stays server-side).
   ============================================================ */
const fs = require('fs');
const path = require('path');

const CANDIDATE_PATHS = [
  path.join(__dirname, 'data.env'),
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', 'data.env') // tolerate the file not having been moved yet
];

let cache = null;

function parseEnv(text) {
  const env = {};
  if (!text) return env;

  for (const rawLine of text.split(/\r?\n/)) {
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

function loadEnv() {
  if (cache) return cache;

  for (const p of CANDIDATE_PATHS) {
    if (!fs.existsSync(p)) continue;
    try {
      cache = parseEnv(fs.readFileSync(p, 'utf8'));
      // Never log values — only the number of keys and which file was used.
      console.log(`[backend:env] loaded ${Object.keys(cache).length} keys from ${path.basename(p)}`);
      return cache;
    } catch (err) {
      console.warn(`[backend:env] failed to read ${p}: ${err.message}`);
    }
  }

  console.warn('[backend:env] no data.env/.env found — Bunny uploads and Firebase login will be unavailable until backend/data.env exists.');
  cache = {};
  return cache;
}

function getEnv() {
  return loadEnv();
}

/** Safe getter — never throws, returns '' when unset. */
function env(key, fallback = '') {
  const v = getEnv()[key];
  return (v === undefined || v === '') ? fallback : v;
}

/** Which keys are present (booleans only — never the values). */
function envStatus() {
  const e = getEnv();
  return {
    bunnyLibraryId: !!e.BUNNY_LIBRARY_ID,
    bunnyApiKey:    !!e.BUNNY_STREAM_API_KEY,
    bunnyCdnHost:   !!e.BUNNY_CDN_HOST,
    firebaseApiKey: !!e.FIREBASE_API_KEY
  };
}

module.exports = { loadEnv, getEnv, env, envStatus };
