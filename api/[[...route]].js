/* ============================================================
   PIXELTube — Vercel Edge Function (catch-all)
   Deployed on Vercel's serverless Edge Nodes. Thin wrapper:
   all logic lives in backend/lib/api-core.js (pure Web APIs).

   Environment variables (set in the Vercel dashboard):
     BUNNY_LIBRARY_ID, BUNNY_STREAM_API_KEY, BUNNY_CDN_HOST
     FIREBASE_API_KEY (optional), ALLOWED_ORIGINS, REQUIRE_AUTH
     — or a single DATA_ENV variable holding the entire
       data.env content (parsed at request time).
   ============================================================ */
import { handleApi } from '../backend/lib/api-core.js';

export const config = {
  runtime: 'edge'
};

export default function handler(request) {
  return handleApi(request);
}
