# PIXELTube Backend

The server side of PIXELTube's dual-end setup. Owns everything secret:

| Concern  | Where |
|----------|-------|
| Config   | `backend/data.env` (local) or Vercel environment variables / `DATA_ENV` (cloud) — parsed by `lib/config.js`, values never logged or published |
| Uploads  | `lib/api-core.js` — creates Bunny Stream videos and returns **pre-signed** tus payloads; the Bunny API key never reaches the browser |
| Login    | `lib/api-core.js` — Firebase Authentication via Identity Toolkit REST (password login, sign-up, refresh, token verify) |
| Frontend | Served statically from the repo root (by `server.js` locally, by Vercel's CDN in production) |

## Architecture (one API core, two runtimes)

```
backend/lib/api-core.js     ← ALL API logic, pure Web APIs (fetch, crypto.subtle, Request/Response)
backend/lib/config.js       ← edge-safe config resolver (env vars → DATA_ENV → seeded file values)
backend/server.js           ← local Node dev only: seeds data.env, adapts fetch↔express, serves static files
api/[[...route]].js         ← Vercel Edge catch-all function (thin wrapper around handleApi)
vercel.json                 ← blocks /data.env + /backend/* from the web, maps /domain.json
```

The same `handleApi(request) → Response` runs on both runtimes — no drift between local and production.

## Deploy to Vercel (serverless Edge Nodes)

```bash
npx vercel          # from the repo root
npx vercel --prod   # production deployment
```

Then set the environment variables in the Vercel dashboard (Project → Settings → Environment Variables):

| Variable | Purpose |
|----------|---------|
| `BUNNY_LIBRARY_ID` | Bunny Stream library |
| `BUNNY_STREAM_API_KEY` | **Secret** — stays on the server |
| `BUNNY_CDN_HOST` | Bunny CDN playback host |
| `DATA_ENV` *(alternative)* | Paste the **entire content of `data.env`** into this one variable — `lib/config.js` parses it at request time. Handy if you don't want to add individual keys. |
| `FIREBASE_API_KEY` | Optional — falls back to the public web key already in `js/main.js` |
| `ALLOWED_ORIGINS` | Comma-separated origins for cross-origin frontends (empty = allow all) |
| `REQUIRE_AUTH` | `true` → uploads require a valid Firebase ID token (`Authorization: Bearer <idToken>`) |

Notes:

- **Edge runtime** is declared in `api/[[...route]].js` (`export const config = { runtime: 'edge' }`), so every request runs on Vercel's Edge Nodes.
- On Edge there is no filesystem — that's why `data.env` is never read in production; use env vars or `DATA_ENV`.
- `vercel.json` uses `beforeFiles` rewrites so `data.env` and everything under `backend/` can never be downloaded from the deployment, and routes `/domain.json` (PIXLECT auth discovery) to the edge function.
- The tus upload itself goes **browser → Bunny directly**; only the pre-signed init round-trips through the Edge function, so upload speed/size are not limited by serverless timeouts.

## Run locally (Node)

```bash
npm install        # repo root
npm start          # → http://localhost:3000 (frontend + API from one origin)
```

Local runs read `backend/data.env` (move it there from the repo root if you haven't: `mv data.env backend/data.env`).

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/config` | Public config: Bunny library id + CDN host, Firebase web config (no secrets) |
| GET | `/api/uploads/health` | Upload capability probe |
| POST | `/api/uploads/init` | Create Bunny video, return `{ videoId, signature, expirationTime, libraryId, tusEndpoint }` |
| GET | `/api/uploads/status/:videoId` | Encode status |
| PUT | `/api/uploads/:videoId/direct` | Stream-through direct upload proxy (body forwarded to Bunny) |
| DELETE | `/api/uploads/:videoId` | Delete Bunny video |
| POST | `/api/auth/login` | `{ email, password }` → idToken/refreshToken |
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/refresh` | Exchange refresh token |
| POST | `/api/auth/verify` | Verify an ID token |
| POST | `/api/auth/send-oob` | Verification / reset email |
| GET | `/domain.json` | PIXLECT auth discovery (used by `js/login.js` on localhost) |
