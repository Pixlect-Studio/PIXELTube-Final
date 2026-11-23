/* ============================================================
   PIXELTube — storage.js
   Backend abstraction for video uploads and playback.

   Routing:
     Minis → Bunny Stream (primary) → Firebase base64 (fallback)
     Longs → Bunny Stream (primary) → Firebase base64 (fallback)

   V2.1 note (resolved): the Bunny API key now lives only in
   backend/data.env. The frontend asks POST /api/uploads/init for a
   pre-signed tus payload — the key never reaches the browser. A
   locally configured key (./data.env) is still honoured as fallback.

   Public API:
     uploadVideo(ctx, file, vid, kind, onProgress)
     uploadFromUrl(url)
     resolvePlaybackUrl(ctx, vid)
     deleteVideoSource(ctx, vid)
     capabilities                    ← static capability snapshot
   ============================================================ */
import { loadEnv, getEnv, apiBase } from './env.js';

export const BASE_UPLOAD_BYTES      = 200 * 1024 * 1024;   // 200 MiB — standard accounts
export const VERIFIED_UPLOAD_BYTES  = 500 * 1024 * 1024;   // 500 MiB — verified channels
export const MAX_LONG_UPLOAD_BYTES  = BASE_UPLOAD_BYTES;   // kept for older imports
export const MAX_MINI_UPLOAD_BYTES  = BASE_UPLOAD_BYTES;
export const FALLBACK_MAX_BYTES     = VERIFIED_UPLOAD_BYTES; // base64 fallback ceiling follows the top tier

// Returns the byte limit for a channel. Verified channels get 500 MB.
export function uploadLimitBytes(channel) {
  return (channel && channel.verified) ? VERIFIED_UPLOAD_BYTES : BASE_UPLOAD_BYTES;
}
let BUNNY_LIBRARY_ID = '';
let BUNNY_API_KEY    = '';
let BUNNY_CDN_HOST   = '';

const TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload';

function applyEnv() {
  const env = getEnv();
  BUNNY_LIBRARY_ID = env.BUNNY_LIBRARY_ID     || '';
  BUNNY_API_KEY    = env.BUNNY_STREAM_API_KEY || '';
  BUNNY_CDN_HOST   = env.BUNNY_CDN_HOST       || '';
}

async function ensureEnv() {
  applyEnv();
  if (BUNNY_LIBRARY_ID && BUNNY_API_KEY && BUNNY_CDN_HOST) return;
  await loadEnv();
  applyEnv();
}

loadEnv().then(() => {
  applyEnv();
  const library = !!BUNNY_LIBRARY_ID;
  const key     = !!BUNNY_API_KEY;
  const cdn     = !!BUNNY_CDN_HOST;
  console.log(
    '[storage] env ready:',
    'library=' + (library ? '✓' : '✗'),
    'key='     + (key     ? '✓' : '—'),
    'cdn='     + (cdn     ? '✓' : '—')
  );
  if (!library) {
    console.error('[storage] BUNNY_LIBRARY_ID is missing. Bunny playback and uploads are unavailable; Firebase fallback will be used.');
  }
  if (!key || !cdn) {
    console.warn('[storage] Bunny key/CDN not configured. Uploads over the 200 MB (500 MB verified) tier and Bunny CDN playback may be unavailable in this build.');
  }
}).catch((err) => {
  console.warn('[storage] env load failed:', err?.message || err);
});

export const capabilities = {
  bunnyUploads: false,
  cdnPlayback: false,
  firebaseFallbackUploads: true,
  fallbackMaxBytes: FALLBACK_MAX_BYTES
};

function refreshCapabilities() {
  capabilities.bunnyUploads = !!(BUNNY_LIBRARY_ID && BUNNY_API_KEY && BUNNY_CDN_HOST);
  capabilities.cdnPlayback  = !!BUNNY_CDN_HOST;
}
loadEnv().then(refreshCapabilities).catch(() => {});

async function bunnyCreateVideo(title) {
  await ensureEnv();
  if (!BUNNY_LIBRARY_ID || !BUNNY_API_KEY) {
    throw new Error('Bunny Stream not configured — set BUNNY_LIBRARY_ID and BUNNY_STREAM_API_KEY');
  }

  const res = await fetch(
    `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'AccessKey': BUNNY_API_KEY
      },
      body: JSON.stringify({ title })
    }
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Bunny create video failed (${res.status}): ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const videoId = data.guid;
  if (!videoId) throw new Error('Bunny did not return a video guid');

  const expirationTime = Math.floor(Date.now() / 1000) + 86400;
  const signatureInput = `${BUNNY_LIBRARY_ID}${BUNNY_API_KEY}${expirationTime}${videoId}`;
  const signature = await sha256Hex(signatureInput);

  return { videoId, signature, expirationTime, libraryId: BUNNY_LIBRARY_ID };
}

/* Backend upload init — dual-end path.
   The backend creates the Bunny video and signs the tus payload with
   the API key held in backend/data.env. The browser never sees it. */
async function backendInitUpload(title) {
  const res = await fetch(apiBase() + '/api/uploads/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Backend upload init failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.videoId || !data.signature) {
    throw new Error('Backend upload init returned incomplete payload');
  }
  return data;
}

let backendProbe = null;
async function hasUploadBackend() {
  if (backendProbe !== null) return backendProbe;
  try {
    const res = await fetch(apiBase() + '/api/uploads/health', { cache: 'no-store' });
    backendProbe = !!res.ok;
  } catch (_) {
    backendProbe = false;
  }
  return backendProbe;
}

async function bunnyUpload(file, title, onProgress) {
  // Prefer the backend (key stays server-side); fall back to a locally
  // configured key only when no backend is reachable.
  let init = null;
  try {
    init = await backendInitUpload(title);
  } catch (backendErr) {
    if (!(BUNNY_LIBRARY_ID && BUNNY_API_KEY)) throw backendErr;
    console.warn('[storage] backend init unavailable, using legacy local key:', backendErr?.message);
    init = await bunnyCreateVideo(title);
  }

  const { videoId, signature, expirationTime } = init;
  const libraryId = init.libraryId || BUNNY_LIBRARY_ID;

  return new Promise((resolve, reject) => {
    if (typeof tus === 'undefined' || !tus.Upload) {
      reject(new Error('tus-js-client is not loaded — add it to the page'));
      return;
    }

    const upload = new tus.Upload(file, {
      endpoint: init.tusEndpoint || TUS_ENDPOINT,
      retryDelays: [0, 3000, 5000, 10000, 20000, 60000],
      headers: {
        AuthorizationSignature: signature,
        AuthorizationExpire: String(expirationTime),
        VideoId: videoId,
        LibraryId: String(libraryId)
      },
      metadata: {
        filetype: file.type || 'video/mp4',
        title: title || file.name
      },
      onError(error) {
        console.error('[storage] Bunny TUS error:', error);
        reject(new Error(`Bunny upload failed: ${error?.message || error}`));
      },
      onProgress(bytesUploaded, bytesTotal) {
        if (onProgress) onProgress(bytesUploaded, bytesTotal);
      },
      onSuccess() {
        resolve(videoId);
      }
    });

    upload.start();
  });
}

function bunnyPublicUrl(videoId) {
  if (!BUNNY_CDN_HOST) return '';
  return `https://${BUNNY_CDN_HOST}/${videoId}/playlist.m3u8`;
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

async function firebaseUpload(ctx, vid, fileOrDataUrl) {
  const { db, dbBackup, ref, set } = ctx;

  let dataUrl;
  if (typeof fileOrDataUrl === 'string' && fileOrDataUrl.startsWith('data:')) {
    dataUrl = fileOrDataUrl;
  } else {
    dataUrl = await fileToDataURL(fileOrDataUrl);
  }

  if (db) {
    try {
      await set(ref(db, `pixeltube/videoSrc/${vid}`), dataUrl);
      return 'firebase';
    } catch (e) {
      console.warn('[storage] Firebase primary failed:', e?.message);
    }
  }

  if (dbBackup) {
    try {
      await set(ref(dbBackup, `pixeltube/videoSrc/${vid}`), dataUrl);
      return 'firebase-backup';
    } catch (e) {
      console.error('[storage] Firebase backup failed:', e?.message);
    }
  }

  throw new Error('Firebase rejected the write');
}

async function firebaseRead(ctx, vid, preferBackend) {
  const { db, dbBackup, ref, get } = ctx;
  const tryOne = async (h) => {
    if (!h) return '';
    try {
      const snap = await get(ref(h, `pixeltube/videoSrc/${vid}`));
      return snap.val() || '';
    } catch (_) {
      return '';
    }
  };
  if (preferBackend === 'firebase-backup') {
    return (await tryOne(dbBackup)) || (await tryOne(db));
  }
  return (await tryOne(db)) || (await tryOne(dbBackup));
}

async function firebaseDelete(ctx, vid) {
  const { db, dbBackup, ref, remove } = ctx;
  if (db)       { try { await remove(ref(db,       `pixeltube/videoSrc/${vid}`)); } catch (_) {} }
  if (dbBackup) { try { await remove(ref(dbBackup, `pixeltube/videoSrc/${vid}`)); } catch (_) {} }
}

async function readStoredSrc(ctx, vid) {
  const { db, ref, get } = ctx;
  if (!db) return '';
  try {
    const snap = await get(ref(db, `pixeltube/videoSrc/${vid}`));
    return snap.val() || '';
  } catch (_) {
    return '';
  }
}

export async function uploadVideo(ctx, file, vid, kind, onProgress) {
  const uid = ctx.PIXLECT?.user?.uid;
  if (!uid) throw new Error('Not signed in');

  const cid = ctx.state?.activeChannelId;
  const channel = (ctx.state?.channels?.[cid]) || Object.values(ctx.state?.channels || {})
    .find(c => c && c.ownerUid === uid);
  const maxBytes = uploadLimitBytes(channel);
  if (file.size > maxBytes) {
    throw new Error(`${kind === 'mini' ? 'Mini' : 'Long'} uploads are limited to ${Math.round(maxBytes / 1024 / 1024)} MB for ${channel?.verified ? 'verified' : 'non-verified'} channels.`);
  }

  await ensureEnv();
  refreshCapabilities();

  const title = file.name || 'Untitled';

  const backendReady = await hasUploadBackend();
  if ((BUNNY_LIBRARY_ID && BUNNY_API_KEY && BUNNY_CDN_HOST) || backendReady) {
    try {
      const videoId = await bunnyUpload(file, title, onProgress);
      return { storedSrc: videoId, srcBackend: 'bunny' };
    } catch (e) {
      console.warn('[storage] Bunny upload failed, falling back to Firebase:', e?.message);
    }
  } else {
    console.warn('[storage] Bunny not configured — using Firebase base64 fallback');
  }

  if (file.size > FALLBACK_MAX_BYTES) {
    throw new Error(
      `Uploads larger than ${Math.round(FALLBACK_MAX_BYTES / 1024 / 1024)} MB require a server-side upload endpoint.`
    );
  }
  const backend = await firebaseUpload(ctx, vid, file);
  return { storedSrc: '', srcBackend: backend };
}

export function uploadFromUrl(url) {
  return { storedSrc: url, srcBackend: 'url' };
}

export async function resolvePlaybackUrl(ctx, vid) {
  const v = ctx.state?.videos?.[vid];
  if (!v) return '';

  const backend = v.srcBackend || 'firebase';

  if (backend === 'bunny') {
    await ensureEnv();
    const videoId = await readStoredSrc(ctx, vid);
    if (!videoId) return '';
    const url = bunnyPublicUrl(videoId);
    if (!url) {
      console.warn('[storage] Bunny CDN host missing — cannot resolve playback URL');
      return '';
    }
    return url;
  }

  if (backend === 'supabase' || backend === 'url' || backend === 'url-backup') {
    return await readStoredSrc(ctx, vid);
  }

  return await firebaseRead(ctx, vid, backend);
}

export async function deleteVideoSource(ctx, vid) {
  const v = ctx.state?.videos?.[vid];
  const backend = v?.srcBackend || 'firebase';

  if (backend === 'firebase' || backend === 'firebase-backup') {
    await firebaseDelete(ctx, vid);
  }

  const { db, ref, remove } = ctx;
  if (db) {
    try { await remove(ref(db, `pixeltube/videoSrc/${vid}`)); } catch (_) {}
  }
}

export const storageInternals = {
  bunnyUpload,
  bunnyCreateVideo,
  bunnyPublicUrl,
  firebaseUpload,
  firebaseRead,
  firebaseDelete,
  fileToDataURL,
  sha256Hex,
  ensureEnv,
  refreshCapabilities
};