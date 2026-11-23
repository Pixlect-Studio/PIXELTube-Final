/* ============================================================
   PIXELTube backend — firebase.js

   DEPRECATED — superseded by backend/lib/api-core.js (Edge-safe,
   shared with the Vercel deployment). Kept only for reference;
   nothing imports this file anymore.

   Server-side Firebase Authentication helpers.

   Uses Google's Identity Toolkit REST API, so no service
   account file is needed. The web API key is taken from
   backend/data.env (FIREBASE_API_KEY) when present, otherwise
   from the public web config that already ships in the
   frontend (js/main.js) — it is not a secret.

   Endpoints used:
     POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword
     POST https://identitytoolkit.googleapis.com/v1/accounts:lookup
     POST https://identitytoolkit.googleapis.com/v1/accounts:signUp
     POST https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode
     POST https://securetoken.googleapis.com/v1/token (refresh)
   ============================================================ */
const { env } = require('./env');

const PRIMARY_API_KEY = 'AIzaSyBLc2W7w4F0XSnsNlHbmlaSyM982Ha2bhM'; // public web key (js/main.js)
const PRIMARY_PROJECT = 'the-amazing-digital-fanbase';

function apiKey() {
  return env('FIREBASE_API_KEY', PRIMARY_API_KEY);
}

function projectId() {
  return env('FIREBASE_PROJECT_ID', PRIMARY_PROJECT);
}

async function callIdentityToolkit(path_, body) {
  const url = `https://identitytoolkit.googleapis.com/v1/${path_}?key=${apiKey()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `Firebase returned ${res.status}`;
    const err = new Error(message);
    err.code = data?.error?.code || res.status;
    err.firebaseCode = data?.error?.message || '';
    throw err;
  }
  return data;
}

/** Email + password login. Returns { localId, idToken, refreshToken, email, expiresIn } */
async function loginWithPassword(email, password) {
  const data = await callIdentityToolkit('accounts:signInWithPassword', {
    email,
    password,
    returnSecureToken: true
  });
  return {
    localId: data.localId,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    email: data.email,
    expiresIn: Number(data.expiresIn || 3600)
  };
}

/** Create an account (email/password sign-up). */
async function signUp(email, password) {
  const data = await callIdentityToolkit('accounts:signUp', {
    email,
    password,
    returnSecureToken: true
  });
  return {
    localId: data.localId,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    email: data.email,
    expiresIn: Number(data.expiresIn || 3600)
  };
}

/** Send a verification / password-reset email. */
async function sendOobCode(requestType, email) {
  await callIdentityToolkit('accounts:sendOobCode', {
    requestType, // 'VERIFY_EMAIL' | 'PASSWORD_RESET'
    email
  });
  return { sent: true, requestType };
}

/** Exchange a refresh token for a fresh id token. */
async function refreshToken(refreshToken) {
  const url = `https://securetoken.googleapis.com/v1/token?key=${apiKey()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Firebase refresh failed (${res.status})`);
    err.code = res.status;
    throw err;
  }
  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresIn: Number(data.expires_in || 3600),
    localId: data.user_id
  };
}

/**
 * Verify an ID token by looking the account up with it.
 * Returns { valid, localId, email, emailVerified, displayName }.
 */
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

/**
 * Express middleware: optional bearer-token auth.
 * When REQUIRE_AUTH=true, requests without a valid ID token are 401'd.
 */
async function optionalAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  req.auth = { token, user: null };
  if (token) {
    const verdict = await verifyIdToken(token);
    if (verdict.valid) req.auth.user = verdict;
  }
  next();
}

function requireAuth(req, res, next) {
  if (String(env('REQUIRE_AUTH', 'false')).toLowerCase() !== 'true') return next();
  if (req.auth && req.auth.user) return next();
  res.status(401).json({ error: 'Sign in required' });
}

module.exports = {
  projectId,
  loginWithPassword,
  signUp,
  sendOobCode,
  refreshToken,
  verifyIdToken,
  optionalAuth,
  requireAuth
};
