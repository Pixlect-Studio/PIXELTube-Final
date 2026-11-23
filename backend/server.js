/* ============================================================
   PIXELTube backend — server.js (local dev / Node)
   The API logic itself lives in backend/lib/api-core.js (pure
   Web APIs, shared 1:1 with the Vercel Edge deployment). This
   file only:
     1. seeds config from backend/data.env (local convenience),
     2. adapts fetch-style requests ↔ express,
     3. serves the static frontend from the repo root.

   Run:  npm start   → http://localhost:3000
   For production use the Vercel Edge deployment instead.
   ============================================================ */
import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { handleApi, seedConfig } from './lib/api-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ---------------- seed config from backend/data.env ---------------- */

function parseEnv(text) {
  const env = {};
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

for (const name of ['data.env', '.env']) {
  for (const p of [path.join(__dirname, name), path.join(__dirname, '..', name)]) {
    if (fs.existsSync(p)) {
      try {
        seedConfig(parseEnv(fs.readFileSync(p, 'utf8')));
        console.log(`[backend:config] seeded from ${path.basename(p)} (values not shown)`);
      } catch (err) {
        console.warn(`[backend:config] failed to read ${p}: ${err.message}`);
      }
      break;
    }
  }
}

const app = express();
const PORT = Number(process.env.PORT || '3000');

/* ---------------- secret-file guard (before static) ---------------- */
app.get([/^\/.*\.env$/i, /^\/backend\/.*/], (_req, res) => {
  res.status(404).end();
});

/* ---------------- API adapter: express ↔ fetch Response ---------------- */

function cleanHeaders(raw) {
  const headers = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (key === 'connection' || key === 'transfer-encoding' || key === 'keep-alive' || key === 'host') continue;
    headers[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  return headers;
}

app.all(['/api/*', '/domain.json'], async (req, res) => {
  const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
  const host = req.get('host') || `localhost:${PORT}`;
  const url = `${proto}://${host}${req.originalUrl}`;

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  let request;
  try {
    request = new Request(url, {
      method: req.method,
      headers: cleanHeaders(req.headers),
      body: hasBody ? req : undefined,
      ...(hasBody ? { duplex: 'half' } : {})
    });
  } catch (_) {
    request = new Request(url, { method: req.method, headers: cleanHeaders(req.headers) });
  }

  const response = await handleApi(request);

  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) {
    res.end();
    return;
  }
  await pipeline(Readable.fromWeb(response.body), res);
});

/* ---------------- frontend (static) ---------------- */
app.use(express.static(path.join(__dirname, '..'), { index: 'index.html' }));

/* ---------------- start ---------------- */
app.listen(PORT, () => {
  console.log(`[backend] PIXELTube running at http://localhost:${PORT}`);
  console.log('[backend] API logic: backend/lib/api-core.js (shared with the Vercel Edge deployment)');
});
