/* ============================================================
   PIXELTube backend — lib/api-core.js
   The whole backend API as ONE pure-Web-API handler:

     export async function handleApi(request) → Response

   No Express, no Node built-ins — runs unchanged on:
     • Vercel Edge Functions (api/[[...route]].js)
     • Node / local dev (backend/server.js adapts fetch↔express)

   Routes
     GET    /api/config                     public config (no secrets)
     GET    /api/uploads/health             capability probe
     POST   /api/uploads/init               create Bunny video + pre-signed tus payload
     GET    /api/uploads/status/:videoId    encode status
     PUT    /api/uploads/:videoId/direct    stream-through direct upload proxy
     DELETE /api/uploads/:videoId           delete Bunny video
     POST   /api/auth/login                 { email, password }
     POST   /api/auth/signup                { email, password }
     POST   /api/auth/refresh               { refreshToken }
     POST   /api/auth/verify                { idToken }
     POST   /api/auth/send-oob              { email, requestType }
     GET    /domain.json                    PIXLECT auth discovery

   Secrets (Bunny API key etc.) come from the environment /
   data.env and NEVER leave this process.
   ============================================================ */
import { configValue, envStatus, seedConfig } from './config.js';
export { seedConfig }; // re-exported for backend/server.js (local file seeding)

const PRIMARY_FIREBASE_API_KEY = 'AIzaSyBLc2W7w4F0XSnsNlHbmlaSyM982Ha2bhM'; // public web key (js/main.js)
const FIREBASE_IAP = 'https://identitytoolkit.googleapis.com/v1';
const FIREBASE_ST  = 'https://securetoken.googleapis.com/v1';
const BUNNY_API    = 'https://video.bunnycdn.com';

/* ---------------- helpers ---------------- */

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const allowList = configValue('ALLOWED_ORIGINS').split(',').map(s => s.trim()).filter(Boolean);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
  // No ALLOWED_ORIGINS → same-origin/static deploys (header optional); allow all.
  const allowOrigin = allowList.length === 0 ? (origin || '*') : (allowList.includes(origin) ? origin : '');
  if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin;
  return headers;
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(request) }
  });
}

function notFound(request) {
  return json(request, { error: 'Not found' }, 404);
}

/** sha256 hex via Web Crypto — matches Bunny's AuthorizationSignature scheme. */
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------------- Firebase auth (Identity Toolkit REST) ---------------- */

function firebaseApiKey() {
  return configValue('FIREBASE_API_KEY', PRIMARY_FIREBASE_API_KEY);
}

async function callIdentityToolkit(action, body) {
  const res = await fetch(`${FIREBASE_IAP}/${action}?key=${firebaseApiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Firebase returned ${res.status}`);
    err.status = res.status;
    err.firebaseCode = data?.error?.message || '';
    throw err;
  }
  return data;
}

async function loginWithPassword(email, password) {
  const data = await callIdentityToolkit('accounts:signInWithPassword', { email, password, returnSecureToken: true });
  return {
    localId: data.localId,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    email: data.email,
    expiresIn: Number(data.expiresIn || 3600)
  };
}

async function signUp(email, password) {
  const data = await callIdentityToolkit('accounts:signUp', { email, password, returnSecureToken: true });
  return {
    localId: data.localId,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    email: data.email,
    expiresIn: Number(data.expiresIn || 3600)
  };
}

async function sendOobCode(requestType, email) {
  await callIdentityToolkit('accounts:sendOobCode', { requestType, email });
  return { sent: true, requestType };
}

async function refreshFirebaseToken(refreshToken) {
  const res = await fetch(`${FIREBASE_ST}/token?key=${firebaseApiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Firebase refresh failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresIn: Number(data.expires_in || 3600),
    localId: data.user_id
  };
}

async function verifyIdToken(idToken) {
  if (!idToken) return { valid: false, reason: 'missing idToken' };
  try {
    const data = await callIdentityToolkit('accounts:lookup', { idToken });
    const user = data?.users?.[0];
    if (!user) return { valid: false, reason: 'unknown user' };
    return {
      valid: true,
      localId: user.localId,
      email: user.email,
      emailVerified: !!user.emailVerified,
      displayName: user.displayName || ''
    };
  } catch (err) {
    return { valid: false, reason: err.message || 'invalid token' };
  }
}

/** Bearer token from the request → verified user, or null. */
async function getAuthUser(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const verdict = await verifyIdToken(header.slice(7).trim());
  return verdict.valid ? verdict : null;
}

/** When REQUIRE_AUTH=true, throws a 401 Response unless signed in. */
async function requireAuthUser(request) {
  if (String(configValue('REQUIRE_AUTH', 'false')).toLowerCase() !== 'true') return null;
  const user = await getAuthUser(request);
  if (!user) {
    const res = json(request, { error: 'Sign in required' }, 401);
    throw res; // route wrapper turns thrown Responses into direct returns
  }
  return user;
}

/* ---------------- Bunny uploads ---------------- */

function bunnyConfig() {
  return {
    libraryId: configValue('BUNNY_LIBRARY_ID'),
    apiKey:    configValue('BUNNY_STREAM_API_KEY'),
    cdnHost:   configValue('BUNNY_CDN_HOST')
  };
}

function bunnyReady() {
  const b = bunnyConfig();
  return !!(b.libraryId && b.apiKey && b.cdnHost);
}

async function bunnyFetch(path_, options = {}) {
  const { apiKey } = bunnyConfig();
  return fetch(`${BUNNY_API}${path_}`, {
    ...options,
    headers: { AccessKey: apiKey, ...(options.headers || {}) }
  });
}

async function uploadsInit(request) {
  const b = bunnyConfig();
  if (!bunnyReady()) {
    return json(request, { error: 'Bunny Stream not configured on the backend (set BUNNY_* env vars or DATA_ENV)' }, 503);
  }

  let title = 'Untitled';
  try {
    const body = await request.json();
    title = String(body?.title || 'Untitled').slice(0, 300);
  } catch (_) { /* empty body is fine */ }

  const createRes = await fetch(`${BUNNY_API}/library/${b.libraryId}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', AccessKey: b.apiKey },
    body: JSON.stringify({ title })
  });

  if (!createRes.ok) {
    const txt = await createRes.text().catch(() => '');
    return json(request, {
      error: `Bunny create video failed (${createRes.status})`,
      detail: txt.slice(0, 200)
    }, createRes.status === 401 ? 502 : createRes.status);
  }

  const data = await createRes.json();
  const videoId = data.guid;
  if (!videoId) {
    return json(request, { error: 'Bunny did not return a video guid' }, 502);
  }

  const expirationTime = Math.floor(Date.now() / 1000) + 86400;
  const signature = await sha256Hex(`${b.libraryId}${b.apiKey}${expirationTime}${videoId}`);

  // The API key stays here — the browser only receives the pre-signed payload.
  return json(request, {
    videoId,
    signature,
    expirationTime,
    libraryId: b.libraryId,
    tusEndpoint: `${BUNNY_API}/tusupload`,
    cdnHost: b.cdnHost
  });
}

async function uploadsStatus(request, videoId) {
  if (!bunnyReady()) return json(request, { error: 'Bunny not configured' }, 503);
  const r = await bunnyFetch(`/library/${bunnyConfig().libraryId}/videos/${encodeURIComponent(videoId)}`);
  if (!r.ok) return json(request, { error: `Bunny status failed (${r.status})` }, r.status);
  const data = await r.json().catch(() => ({}));
  return json(request, {
    videoId: data.guid,
    status: data.status,
    length: data.length,
    encodeProgress: data.encodeProgress,
    availableResolutions: data.availableResolutions
  });
}

async function uploadsDelete(request, videoId) {
  if (!bunnyReady()) return json(request, { error: 'Bunny not configured' }, 503);
  const r = await bunnyFetch(`/library/${bunnyConfig().libraryId}/videos/${encodeURIComponent(videoId)}`, { method: 'DELETE' });
  if (r.status === 200 || r.status === 404) return json(request, { deleted: true });
  return json(request, { error: `Bunny delete failed (${r.status})` }, r.status);
}

async function uploadsDirect(request, videoId) {
  if (!bunnyReady()) return json(request, { error: 'Bunny not configured' }, 503);
  const { libraryId } = bunnyConfig();
  const target = `${BUNNY_API}/library/${libraryId}/videos/${encodeURIComponent(videoId)}`;
  const headers = {
    AccessKey: bunnyConfig().apiKey,
    'Content-Type': request.headers.get('content-type') || 'application/octet-stream'
  };

  // Stream the body straight through; fall back to buffering if the
  // runtime refuses streaming request bodies.
  let r;
  try {
    r = await fetch(target, { method: 'PUT', headers, body: request.body, duplex: 'half' });
  } catch (_) {
    r = await fetch(target, { method: 'PUT', headers, body: await request.arrayBuffer() });
  }

  const txt = await r.text().catch(() => '');
  if (!r.ok) {
    return json(request, { error: `Bunny direct upload failed (${r.status})`, detail: txt.slice(0, 200) }, r.status);
  }
  return json(request, { uploaded: true, videoId });
}

/* ---------------- route responses ---------------- */

function configResponse(request) {
  const status = envStatus();
  return json(request, {
    ok: true,
    backend: 'pixeltube-backend',
    // Public values the frontend legitimately needs:
    BUNNY_LIBRARY_ID: status.bunnyLibraryId ? configValue('BUNNY_LIBRARY_ID') : '',
    BUNNY_CDN_HOST:   configValue('BUNNY_CDN_HOST'),
    // Firebase web config (public by design — ships in js/main.js today):
    firebase: {
      apiKey:            firebaseApiKey(),
      authDomain:        configValue('FIREBASE_AUTH_DOMAIN', 'the-amazing-digital-fanbase.firebaseapp.com'),
      databaseURL:       configValue('FIREBASE_DATABASE_URL', 'https://the-amazing-digital-fanbase-default-rtdb.firebaseio.com'),
      projectId:         configValue('FIREBASE_PROJECT_ID', 'the-amazing-digital-fanbase'),
      storageBucket:     configValue('FIREBASE_STORAGE_BUCKET', 'the-amazing-digital-fanbase.firebasestorage.app'),
      messagingSenderId: configValue('FIREBASE_MESSAGING_SENDER_ID', '899632202736'),
      appId:             configValue('FIREBASE_APP_ID', '1:899632202736:web:3b6de3d2e312bd6d6b5335')
    },
    capabilities: {
      bunnyUploads: status.bunnyLibraryId && status.bunnyApiKey,
      cdnPlayback: status.bunnyCdnHost,
      uploadsBackend: true
    },
    envStatus: status // booleans only — never values
  });
}

function domainJson(request) {
  const allowList = configValue('ALLOWED_ORIGINS').split(',').map(s => s.trim()).filter(Boolean);
  return json(request, {
    allowedOrigins: allowList.length ? allowList : ['http://localhost:3000', 'http://127.0.0.1:3000']
  });
}

/* ---------------- main handler ---------------- */

export async function handleApi(request) {
  try {
    const url = new URL(request.url);
    let path = url.pathname;
    if (path.length > 1) path = path.replace(/\/+$/, '') || '/';

    // CORS preflight for any route
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (path === '/domain.json') return domainJson(request);
    if (!path.startsWith('/api/')) return notFound(request);
    const sub = path.slice('/api'.length); // '/config', '/uploads/...', '/auth/...'

    let m;

    if (sub === '/config' && request.method === 'GET') {
      return configResponse(request);
    }

    if (sub === '/uploads/health' && request.method === 'GET') {
      return json(request, {
        ok: true,
        bunnyConfigured: bunnyReady(),
        tusEndpoint: `${BUNNY_API}/tusupload`,
        cdnPlayback: !!bunnyConfig().cdnHost
      });
    }

    if (sub === '/uploads/init' && request.method === 'POST') {
      await requireAuthUser(request);
      return await uploadsInit(request);
    }

    if ((m = sub.match(/^\/uploads\/status\/([^/]+)$/)) && request.method === 'GET') {
      await requireAuthUser(request);
      return await uploadsStatus(request, m[1]);
    }

    if ((m = sub.match(/^\/uploads\/([^/]+)\/direct$/)) && request.method === 'PUT') {
      await requireAuthUser(request);
      return await uploadsDirect(request, m[1]);
    }

    if ((m = sub.match(/^\/uploads\/([^/]+)$/)) && request.method === 'DELETE') {
      await requireAuthUser(request);
      return await uploadsDelete(request, m[1]);
    }

    if (sub === '/auth/login' && request.method === 'POST') {
      const { email, password } = await request.json().catch(() => ({}));
      if (!email || !password) return json(request, { error: 'email and password are required' }, 400);
      const user = await loginWithPassword(String(email), String(password));
      return json(request, {
        ok: true,
        user: { localId: user.localId, email: user.email },
        idToken: user.idToken,
        refreshToken: user.refreshToken,
        expiresIn: user.expiresIn
      });
    }

    if (sub === '/auth/signup' && request.method === 'POST') {
      const { email, password } = await request.json().catch(() => ({}));
      if (!email || !password) return json(request, { error: 'email and password are required' }, 400);
      const user = await signUp(String(email), String(password));
      return json(request, {
        ok: true,
        user: { localId: user.localId, email: user.email },
        idToken: user.idToken,
        refreshToken: user.refreshToken,
        expiresIn: user.expiresIn
      });
    }

    if (sub === '/auth/refresh' && request.method === 'POST') {
      const { refreshToken } = await request.json().catch(() => ({}));
      if (!refreshToken) return json(request, { error: 'refreshToken is required' }, 400);
      const t = await refreshFirebaseToken(String(refreshToken));
      return json(request, {
        ok: true,
        idToken: t.idToken,
        refreshToken: t.refreshToken,
        expiresIn: t.expiresIn,
        localId: t.localId
      });
    }

    if (sub === '/auth/verify' && request.method === 'POST') {
      const { idToken } = await request.json().catch(() => ({}));
      const verdict = await verifyIdToken(idToken);
      return json(request, { ok: verdict.valid, ...verdict });
    }

    if (sub === '/auth/send-oob' && request.method === 'POST') {
      const { email, requestType = 'VERIFY_EMAIL' } = await request.json().catch(() => ({}));
      if (!email) return json(request, { error: 'email is required' }, 400);
      await sendOobCode(String(requestType), String(email));
      return json(request, { ok: true });
    }

    return notFound(request);
  } catch (errOrResponse) {
    // Route guards throw Responses (401 etc.) — pass them through.
    if (errOrResponse instanceof Response) return errOrResponse;
    console.error('[backend] unhandled error:', errOrResponse?.message || errOrResponse);
    return json(request, { error: 'Internal error', detail: String(errOrResponse?.message || errOrResponse).slice(0, 200) }, 500);
  }
}
