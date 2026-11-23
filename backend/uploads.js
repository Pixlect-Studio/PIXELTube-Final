/* ============================================================
   PIXELTube backend — uploads.js

   DEPRECATED — superseded by backend/lib/api-core.js (Edge-safe,
   shared with the Vercel deployment). Kept only for reference;
   nothing imports this file anymore.

   Bunny Stream upload endpoints. The API key lives ONLY here,
   read from backend/data.env. The browser never sees it:
   the frontend receives a pre-signed tus payload instead.
   ============================================================ */
const crypto = require('crypto');
const express = require('express');
const { env } = require('./env');
const { requireAuth } = require('./firebase');

const router = express.Router();

const BUNNY_API = 'https://video.bunnycdn.com';

function libraryId() { return env('BUNNY_LIBRARY_ID'); }
function apiKey()    { return env('BUNNY_STREAM_API_KEY'); }
function cdnHost()   { return env('BUNNY_CDN_HOST'); }

function configured() {
  return !!(libraryId() && apiKey() && cdnHost());
}

/** sha256 hex — matches Bunny's AuthorizationSignature scheme. */
function sha256Hex(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function bunnyFetch(path_, options = {}) {
  const res = await fetch(`${BUNNY_API}${path_}`, {
    ...options,
    headers: {
      AccessKey: apiKey(),
      ...(options.headers || {})
    }
  });
  return res;
}

/* ------------------------------------------------------------
   GET /api/uploads/health
   Capability probe for the frontend. Reports booleans only.
   ------------------------------------------------------------ */
router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    bunnyConfigured: configured(),
    tusEndpoint: `${BUNNY_API}/tusupload`,
    cdnPlayback: !!cdnHost()
  });
});

/* ------------------------------------------------------------
   POST /api/uploads/init   { title }
   Creates a Bunny video and returns a pre-signed tus payload:
     { videoId, signature, expirationTime, libraryId, tusEndpoint }
   The browser then uploads directly to Bunny with tus-js-client,
   exactly as before — but without ever holding the API key.
   ------------------------------------------------------------ */
router.post('/init', requireAuth, express.json({ limit: '1mb' }), async (req, res) => {
  if (!configured()) {
    return res.status(503).json({ error: 'Bunny Stream not configured on the backend (data.env)' });
  }

  const title = String(req.body?.title || 'Untitled').slice(0, 300);

  try {
    const createRes = await bunnyFetch(`/library/${libraryId()}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });

    if (!createRes.ok) {
      const txt = await createRes.text().catch(() => '');
      return res.status(createRes.status).json({
        error: `Bunny create video failed (${createRes.status})`,
        detail: txt.slice(0, 200)
      });
    }

    const data = await createRes.json();
    const videoId = data.guid;
    if (!videoId) {
      return res.status(502).json({ error: 'Bunny did not return a video guid' });
    }

    const expirationTime = Math.floor(Date.now() / 1000) + 86400;
    const signature = sha256Hex(`${libraryId()}${apiKey()}${expirationTime}${videoId}`);

    res.json({
      videoId,
      signature,
      expirationTime,
      libraryId: libraryId(),
      tusEndpoint: `${BUNNY_API}/tusupload`,
      cdnHost: cdnHost()
    });
  } catch (err) {
    console.error('[backend:uploads] init failed:', err.message);
    res.status(502).json({ error: 'Upload init failed', detail: err.message });
  }
});

/* ------------------------------------------------------------
   GET /api/uploads/status/:videoId
   ------------------------------------------------------------ */
router.get('/status/:videoId', requireAuth, async (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'Bunny not configured' });
  try {
    const r = await bunnyFetch(`/library/${libraryId()}/videos/${req.params.videoId}`);
    if (!r.ok) return res.status(r.status).json({ error: `Bunny status failed (${r.status})` });
    const data = await r.json();
    // Trim to the fields the frontend needs.
    res.json({
      videoId: data.guid,
      status: data.status,
      length: data.length,
      encodeProgress: data.encodeProgress,
      availableResolutions: data.availableResolutions
    });
  } catch (err) {
    res.status(502).json({ error: 'Status lookup failed', detail: err.message });
  }
});

/* ------------------------------------------------------------
   DELETE /api/uploads/:videoId
   Removes the video from Bunny.
   ------------------------------------------------------------ */
router.delete('/:videoId', requireAuth, async (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'Bunny not configured' });
  try {
    const r = await bunnyFetch(`/library/${libraryId()}/videos/${req.params.videoId}`, { method: 'DELETE' });
    if (r.status === 200 || r.status === 404) return res.json({ deleted: true });
    res.status(r.status).json({ error: `Bunny delete failed (${r.status})` });
  } catch (err) {
    res.status(502).json({ error: 'Delete failed', detail: err.message });
  }
});

/* ------------------------------------------------------------
   PUT /api/uploads/:videoId/direct
   Direct single-request upload proxy (no tus). The request body
   is streamed straight through to Bunny — nothing is buffered
   on disk. Content-Type must be the video's mime type.
   ------------------------------------------------------------ */
router.put('/:videoId/direct', requireAuth, async (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'Bunny not configured' });
  try {
    const r = await bunnyFetch(
      `/library/${libraryId()}/videos/${req.params.videoId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': req.get('content-type') || 'application/octet-stream'
        },
        body: req, // stream the raw request body through
        duplex: 'half'
      }
    );
    const txt = await r.text().catch(() => '');
    if (!r.ok) return res.status(r.status).json({ error: `Bunny direct upload failed (${r.status})`, detail: txt.slice(0, 200) });
    res.json({ uploaded: true, videoId: req.params.videoId });
  } catch (err) {
    res.status(502).json({ error: 'Direct upload failed', detail: err.message });
  }
});

module.exports = router;
