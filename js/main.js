import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, onValue, get, set, remove, update, runTransaction, push
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  $, $$, esc, fmt, fmtBytes, timeAgo, initial,
  avatarHTML, thumbHTML, captureThumbnailFromFile, resizeImageFile,
  parseDuration, getSearchHistory, pushSearchHistory, clearSearchHistory,
  hasSearchHistory
} from './helpers.js';

import * as storage from './storage.js';
import { promptCreateChannel, promptEditChannel } from './channel.js';
import {
  offlineDownloads, isOfflineDownloaded, saveOfflineVideo,
  removeOfflineVideo, offlinePlaybackSource, clearOfflinePlaybackUrls
} from './offline.js';

import {
  promptReportVideo, promptGuidelines,
  canCurrentUserUpload, hasAcceptedGuidelines,
  suspendChannel, unsuspendChannel, isUserSuspended, isChannelSuspended, getChannelSuspensionInfo,
  viewAdmin, isAdminUser, viewModerationInbox
} from './sec.js?v=32';

import { viewStudio } from './studio.js';
import { viewPrivacy, viewTerms, viewGuidelines } from './legal.js';

/* ============================================================
   FIREBASE CONFIGS
   ============================================================ */
const FIREBASE_PRIMARY = {
  apiKey: "AIzaSyBLc2W7w4F0XSnsNlHbmlaSyM982Ha2bhM",
  authDomain: "the-amazing-digital-fanbase.firebaseapp.com",
  databaseURL: "https://the-amazing-digital-fanbase-default-rtdb.firebaseio.com",
  projectId: "the-amazing-digital-fanbase",
  storageBucket: "the-amazing-digital-fanbase.firebasestorage.app",
  messagingSenderId: "899632202736",
  appId: "1:899632202736:web:3b6de3d2e312bd6d6b5335"
};

const FIREBASE_BACKUP = {
  apiKey: "AIzaSyDrhgWrgdhGb4z3w91bOXDb-LWlLYDEw7A",
  authDomain: "mass-control.firebaseapp.com",
  databaseURL: "https://mass-control-default-rtdb.firebaseio.com",
  projectId: "mass-control",
  storageBucket: "mass-control.firebasestorage.app",
  messagingSenderId: "946293545012",
  appId: "1:946293545012:web:2da37c440910d239dc5261"
};

const FIREBASE_STATS = {
  apiKey: "AIzaSyC_RoYfDWEEws0Byx_79QCOoQXARpjUp60",
  authDomain: "pixquiz-5fd01.firebaseapp.com",
  databaseURL: "https://pixquiz-5fd01-default-rtdb.firebaseio.com",
  projectId: "pixquiz-5fd01",
  storageBucket: "pixquiz-5fd01.firebasestorage.app",
  messagingSenderId: "838894677501",
  appId: "1:838894677501:web:489511ad3ddb1294547d94"
};

const SUPABASE_PRIMARY = {
  url: 'https://finuvmxyymhfvmscmgac.supabase.co',
  key: 'sb_publishable_UAbpVV0jSe2h6aPkbYEgtw_kWzaT7qt'
};
const MAX_LONG_BYTES   = storage.MAX_LONG_UPLOAD_BYTES;
const MAX_MINI_BYTES   = storage.MAX_MINI_UPLOAD_BYTES;
const MAX_LONG_SECONDS = 60 * 60;
const MAX_MINI_SECONDS = 5 * 60;
const MAX_EXTRA_CHANNELS = 5;

let supaPrimary = null;
try {
  supaPrimary = createClient(SUPABASE_PRIMARY.url, SUPABASE_PRIMARY.key, { auth: { persistSession: false } });
} catch (e) { console.warn('[main.js] Supabase init failed:', e); }

/* ============================================================
   PIXLECT AUTH
   ============================================================ */
const PIXLECT = {
  AUTH_URL: 'https://www.account.pixlect-studios.com/index.html',
  ORIGIN:   'https://www.account.pixlect-studios.com',
  APP:      'PIXELTube',
  user:     null
};

const PIXLECT_TRUSTED_ORIGINS = [
  'https://www.account.pixlect-studios.com',
  'https://account.pixlect-studios.com',
  'https://accounts.pixlect-studios.com',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3000'
];

try {
  const raw = localStorage.getItem('pixeltube_pixlect');
  if (raw) PIXLECT.user = JSON.parse(raw);
} catch (_) {}

/* ============================================================
   ADMINS
   ============================================================ */
const ADMIN_USERNAMES = ['admin14', 'DASHORTSGOD', 'aaraiz.adnan2020'];
const ADMIN_UIDS      = [
  'dSs1Y55uKrcCeaXYLOqI2yco4HL2',
  'OqCW6v05RAQnPGb2gpA20cDSMTf1',
  'SqQBVRd7A1aVxllN5XxKbLVGprw1',
  '67f9CRKuPAUk0dMpAz3TygtfQSW2',
  'LnxFnPobLvap8n70EiFy35H2jOJ3'
];

function isAdmin() {
  if (!PIXLECT.user) return false;
  
  // 1. Check hardcoded lists (Super Admins)
  if (ADMIN_USERNAMES.includes(PIXLECT.user.username) || ADMIN_UIDS.includes(PIXLECT.user.uid)) {
    return true;
  }
  
  // 2. Check the live database for added admins
  if (state.admins && state.admins[PIXLECT.user.uid]) {
    return true;
  }
  
  return false;
}

function getLocalUid() {
  let u = localStorage.getItem('pixeltube_uid');
  if (!u) {
    const rand = (crypto && crypto.randomUUID)
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 12);
    u = 'u_' + rand + Date.now().toString(36).slice(-4);
    localStorage.setItem('pixeltube_uid', u);
  }
  return u;
}

function pixlectSignIn() {
  const w = 520, h = 640;
  const left = Math.max(0, window.screenX + (window.outerWidth  - w) / 2);
  const top  = Math.max(0, window.screenY + (window.outerHeight - h) / 2);
  const url = new URL(PIXLECT.AUTH_URL);
  url.searchParams.set('app', PIXLECT.APP);
  url.searchParams.set('mode', 'popup');
  url.searchParams.set('origin', location.origin);
  window.open(url.toString(), 'pixlect-auth',
    `width=${w},height=${h},left=${left},top=${top},popup=yes,resizable=yes,scrollbars=yes`);
}

function pixlectSignOut() {
  PIXLECT.user = null;
  localStorage.removeItem('pixeltube_pixlect');
  state.uid = getLocalUid();
  state.activeChannelId = null;
  state.myChannelIds = [];
  reloadUserScopedData();
  renderTopbar();
  renderSidebar();
  render(true);
  toast('Signed out');
}

function handlePixlectMessage(d) {
  if (!d || typeof d !== 'object') return false;
  let user = null;
  if (d.type === 'PIXLECT_AUTH' && d.status === 'success' && d.user) user = d.user;
  else if (d.type === 'PIXLECT_AUTH_SUCCESS' && d.user) user = d.user;
  else if (d.source === 'pixlect' && d.user) user = d.user;
  else if (d.username && (d.uid || d.id)) user = { username: d.username, uid: d.uid || d.id, icon: d.icon };
  else if (d.payload && d.payload.user) user = d.payload.user;
  if (!user) return false;

  const clean = {
    username: String(user.username || user.name || (user.email ? user.email.split('@')[0] : 'user')),
    uid:      String(user.uid || user.id || ''),
    icon:     user.icon || { bg: '#38bdf8', emoji: '👤' }
  };
  if (!clean.uid) {
    console.warn('[pixlect] auth message had no uid:', d);
    return false;
  }

  PIXLECT.user = clean;
  localStorage.setItem('pixeltube_pixlect', JSON.stringify(clean));
  state.uid = 'pl_' + clean.uid;

  reloadUserScopedData();
  ensurePrimaryChannel().then(() => {
    renderTopbar();
    renderSidebar();
    render(true);
  });
  statsLogEvent('signin', { username: clean.username });
  toast('Signed in as ' + clean.username + (isAdmin() ? ' (admin)' : ''));
  return true;
}

window.addEventListener('message', (ev) => {
  if (!PIXLECT_TRUSTED_ORIGINS.includes(ev.origin)) return;
  handlePixlectMessage(ev.data);
});

/* ============================================================
   STATE
   ============================================================ */
const state = {
  uid: PIXLECT.user ? ('pl_' + PIXLECT.user.uid) : getLocalUid(),
  mode: 'connecting',
  videos: {}, channels: {}, playlists: {}, subs: {}, likes: {}, dislikes: {},
  subscriberCounts: {},
  users: {}, reports: {}, comments: {}, audit: {},
  admins: {}, // <--- Added for live admins
  search: '', route: ['home'],
  viewedThisSession: new Set(),
  myChannelIds: [],
  activeChannelId: null
};

let db = null;
let dbBackup = null;
let dbStats = null;
let localDB = null;
let lastData = null;
let commentsUnsub = null;

/* ============================================================
   DERIVED HELPERS
   ============================================================ */
const subsOf = cid => {
  const storedCount = state.subscriberCounts[cid];
  if (storedCount !== undefined && storedCount !== null) {
    const count = Number(storedCount);
    if (Number.isFinite(count) && count >= 0) return count;
  }
  const count = Number(state.channels[cid]?.subs);
  return Number.isFinite(count) && count >= 0 ? count : 0;
};
const likesOf    = vid => (state.videos[vid]?.likes) || 0;
const dislikesOf = vid => (state.videos[vid]?.dislikes) || 0;
const viewsOf    = vid => (state.videos[vid]?.views) || 0;
const isSubbed   = cid => !!state.subs[cid];
const isLiked    = vid => !!state.likes[vid];
const isDisliked = vid => !!state.dislikes[vid];
const chanOf     = vid => state.channels[state.videos[vid]?.channelId] || { name: 'Unknown', color: '#555' };

function videosSorted() {
  return Object.values(state.videos)
    .filter(v => !isChannelSuspended({ state }, v.channelId))
    .filter(v => !(v.moderation?.hidden || v.moderation?.restricted) || (PIXLECT.user && (v.createdBy === PIXLECT.user.uid || isAdmin())))
    .filter(v => !['pending', 'ignored', 'disapproved'].includes(String(v.reviewStatus || '').toLowerCase()) || (PIXLECT.user && (v.createdBy === PIXLECT.user.uid || isAdmin())))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
const minisSorted = () => videosSorted().filter(v => v.kind === 'mini');
const longsSorted = () => videosSorted().filter(v => v.kind !== 'mini');

/* ============================================================
   UI UTIL
   ============================================================ */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function setLoaderStatus(msg) {
  const s = document.getElementById('loaderStatus');
  if (s) s.textContent = msg;
}
function hideLoader() {
  const l = document.getElementById('loader');
  if (l) l.classList.add('hide');
}

function openModal(html) {
  const root = $('#modalRoot');
  if (!root) return;
  root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop>
    <div class="modal-wrap"><div class="modal">${html}</div></div></div>`;
}
function closeModal() {
  const root = $('#modalRoot');
  if (root) root.innerHTML = '';
}
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-modal-backdrop]')) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

/* ============================================================
   STATS
   ============================================================ */
let statsWritable = null;

async function statsRegisterView(vid) {
  if (!dbStats || statsWritable === false) return;
  try {
    await runTransaction(ref(dbStats, `pixeltube_stats/views/${vid}`), n => (Number(n) || 0) + 1);
    statsWritable = true;
  } catch (e) {
    if (String(e?.message || '').includes('permission_denied')) {
      statsWritable = false;
    }
  }
}

const subscriberCountsSeeded = new Set();

function watchSubscriberCounts() {
  if (!dbStats) return;
  onValue(ref(dbStats, 'pixeltube_stats/subscribers'), snap => {
    state.subscriberCounts = snap.val() || {};
    syncDynamic();
  }, error => {});
}

async function seedSubscriberCounts(channels) {
  if (!dbStats || statsWritable === false) return;
  await Promise.all(Object.values(channels || {}).map(async channel => {
    if (!channel?.id || subscriberCountsSeeded.has(channel.id)) return;
    if (statsWritable === false) return;
    subscriberCountsSeeded.add(channel.id);
    try {
      await runTransaction(ref(dbStats, `pixeltube_stats/subscribers/${channel.id}`), count => {
        if (count !== null) return count;
        const legacyCount = Number(channel.subs);
        return Number.isFinite(legacyCount) && legacyCount >= 0 ? legacyCount : 0;
      });
      statsWritable = true;
    } catch (error) {
      subscriberCountsSeeded.delete(channel.id);
      if (String(error?.message || '').includes('permission_denied')) {
        statsWritable = false;
      }
    }
  }));
}

async function statsAdjustSubscriberCount(cid, delta) {
  if (!dbStats || statsWritable === false) throw new Error('Stats unavailable');
  const legacyCount = Number(state.channels[cid]?.subs);
  const initialCount = Number.isFinite(legacyCount) && legacyCount >= 0 ? legacyCount : 0;
  await runTransaction(ref(dbStats, `pixeltube_stats/subscribers/${cid}`), count =>
    Math.max(0, (count === null ? initialCount : Number(count) || 0) + delta));
  statsWritable = true;
}

async function statsLogEvent(type, payload) {
  if (!dbStats || statsWritable === false) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    await push(ref(dbStats, `pixeltube_stats/events/${day}`), {
      type, ts: Date.now(), uid: PIXELTUBE_stats_uid(), ...payload
    });
    await runTransaction(ref(dbStats, `pixeltube_stats/daily/${day}/${type}`), n => (Number(n) || 0) + 1);
    statsWritable = true;
  } catch (e) {
    if (String(e?.message || '').includes('permission_denied')) {
      statsWritable = false;
    }
  }
}

function PIXELTUBE_stats_uid() { return PIXLECT.user?.uid || 'anon'; }

async function statsFetchTotals() {
  if (!dbStats) return { views: {}, daily: {}, events: 0 };
  try {
    const snap = await get(ref(dbStats, 'pixeltube_stats'));
    return snap.val() || { views: {}, daily: {}, events: 0 };
  } catch (e) { return { views: {}, daily: {}, events: 0 }; }
}

/* ============================================================
   CHANNEL HELPERS
   ============================================================ */
const primaryChannelId = () => PIXLECT.user ? ('pl_' + PIXLECT.user.uid) : null;

function myChannels() {
  return state.myChannelIds.map(id => state.channels[id]).filter(Boolean);
}
function myChannel() {
  if (state.activeChannelId && state.channels[state.activeChannelId]) {
    return state.channels[state.activeChannelId];
  }
  const p = primaryChannelId();
  return p && state.channels[p] ? state.channels[p] : null;
}
const myChannelId = () => myChannel()?.id || null;
const hasChannel = () => myChannels().length > 0;

function extraChannelCount() {
  const p = primaryChannelId();
  return state.myChannelIds.filter(id => id !== p).length;
}
function canCreateExtra() { return extraChannelCount() < MAX_EXTRA_CHANNELS; }

async function ensurePrimaryChannel() {
  if (!PIXLECT.user) return;
  const p = primaryChannelId();
  if (!state.channels[p]) {
    await saveChannel(p, {
      name: PIXLECT.user.username,
      handle: '@' + PIXLECT.user.username,
      color: PIXLECT.user.icon?.bg || '#38bdf8',
      avatar: '',
      banner: ''
    });
  }
  await addChannelToIndex(p);
  if (!state.activeChannelId) await setActiveChannel(p);
}

async function addChannelToIndex(cid) {
  if (!PIXLECT.user) return;
  if (state.mode === 'firebase' && db) {
    try { await set(ref(db, `pixeltube/users/${state.uid}/channels/${cid}`), true); }
    catch (e) {}
  } else if (state.mode === 'local' && localDB) {
    const u = localDB.users[state.uid] || (localDB.users[state.uid] = {});
    u.channels = u.channels || {};
    u.channels[cid] = true;
    persistLocal();
    applyData(localDB);
  }
}

async function setActiveChannel(cid) {
  state.activeChannelId = cid;
  if (state.mode === 'firebase' && db) {
    try { await set(ref(db, `pixeltube/users/${state.uid}/activeChannel`), cid); }
    catch (e) {}
  } else if (state.mode === 'local' && localDB) {
    const u = localDB.users[state.uid] || (localDB.users[state.uid] = {});
    u.activeChannel = cid;
    persistLocal();
  }
}

async function saveChannel(cid, data) {
  const existing = state.channels[cid] || {};
  const ch = {
    id: cid,
    name: data.name || existing.name || PIXLECT.user.username,
    handle: data.handle || existing.handle || ('@' + PIXLECT.user.username),
    color: data.color || existing.color || (PIXLECT.user.icon?.bg || '#38bdf8'),
    avatar: data.avatar !== undefined ? data.avatar : (existing.avatar || ''),
    banner: data.banner !== undefined ? data.banner : (existing.banner || ''),
    ownerUid: PIXLECT.user.uid,
    ownerUsername: PIXLECT.user.username,
    createdAt: existing.createdAt || Date.now()
  };
  
  if (state.mode === 'firebase' && db) {
    try { 
      const savePromise = set(ref(db, `pixeltube/channels/${cid}`), ch);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Firebase timeout: Your Database Rules are blocking the write.')), 5000)
      );
      await Promise.race([savePromise, timeoutPromise]);
    }
    catch (e) { 
      toast('Could not save channel: ' + (e?.message || e)); 
      throw e; 
    }
  } else if (state.mode === 'local' && localDB) {
    localDB.channels[cid] = { ...existing, ...ch };
    persistLocal();
    applyData(localDB);
  }
}

async function createExtraChannel(data) {
  if (!PIXLECT.user) { toast('Sign in to create channels'); pixlectSignIn(); return null; }
  if (!canCreateExtra()) {
    toast(`You've reached the limit of ${MAX_EXTRA_CHANNELS} extra channels.`);
    return null;
  }
  const cid = 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  await saveChannel(cid, data);
  await addChannelToIndex(cid);
  await setActiveChannel(cid);
  renderTopbar();
  renderSidebar();
  render(true);
  toast('Channel created 🎉');
  statsLogEvent('channel_create', { cid });
  return cid;
}

async function deleteChannel(cid) {
  if (!PIXLECT.user) return false;
  if (cid === primaryChannelId()) { toast('Your primary channel can\'t be deleted.'); return false; }
  const videos = Object.values(state.videos).filter(v => v.channelId === cid);
  if (videos.length) {
    toast(`This channel has ${videos.length} video${videos.length === 1 ? '' : 's'}. Delete or move them first.`);
    return false;
  }
  if (state.mode === 'firebase' && db) {
    try {
      await remove(ref(db, `pixeltube/channels/${cid}`));
      await remove(ref(db, `pixeltube/users/${state.uid}/channels/${cid}`));
      if (state.activeChannelId === cid) {
        const p = primaryChannelId();
        if (p && state.channels[p]) await setActiveChannel(p);
      }
    } catch (e) { toast('Could not delete channel'); return false; }
  } else if (state.mode === 'local' && localDB) {
    delete localDB.channels[cid];
    if (localDB.users[state.uid]?.channels) delete localDB.users[state.uid].channels[cid];
    if (state.activeChannelId === cid) state.activeChannelId = primaryChannelId();
    persistLocal();
    applyData(localDB);
  }
  toast('Channel deleted');
  statsLogEvent('channel_delete', { cid });
  return true;
}

/* ============================================================
   DATA LAYER
   ============================================================ */
async function boot() {
  setLoaderStatus('Connecting to Firebase…');
  try {
    const app = initializeApp(FIREBASE_PRIMARY, 'primary');
    db = getDatabase(app);

    try {
      const app2 = initializeApp(FIREBASE_BACKUP, 'backup');
      dbBackup = getDatabase(app2);
    } catch (e) { console.warn('[main.js] Backup Firebase init failed:', e); }

    try {
      const statsApp = initializeApp(FIREBASE_STATS, 'stats');
      dbStats = getDatabase(statsApp);
      watchSubscriberCounts();
      console.log('[main.js] Stats Firebase ready');
    } catch (e) { console.warn('[main.js] Stats Firebase init failed:', e); }

    state.mode = 'firebase';

    await new Promise((resolve) => {
      let done = false;
      let initialLoadTimer = null;
      const rootRef = ref(db, 'pixeltube');

      const showCachedView = () => {
        try {
          const raw = JSON.parse(localStorage.getItem('pixeltube_db') || 'null');
          if (raw && !lastData) applyData(raw);
        } catch (cacheError) {}
        hideLoader();
      };

      onValue(rootRef,
        s => {
          if (initialLoadTimer) clearTimeout(initialLoadTimer);
          applyData(s.val() || {});
          setStatus();
          if (!done) {
            done = true;
            setLoaderStatus('Loaded.');
            setTimeout(hideLoader, 100);
            resolve();
          }
        },
        err => {
          if (initialLoadTimer) clearTimeout(initialLoadTimer);
          console.warn('[main.js] stream error:', err);
          if (!done) {
            done = true;
            setLoaderStatus('Using offline mode…');
            setTimeout(() => { bootLocal(); hideLoader(); }, 200);
            resolve();
          }
        }
      );

      initialLoadTimer = setTimeout(() => {
        if (!done) {
          done = true;
          setLoaderStatus('Still connecting — showing cached content…');
          showCachedView();
          resolve();
        }
      }, 2200);
    });

    setStatus();
    if (PIXLECT.user) {
      await migrateUserChannels();
      await ensurePrimaryChannel();
    }
  } catch (e) {
    console.warn('[main.js] Firebase unavailable → local mode.', e);
    setLoaderStatus('Offline mode.');
    bootLocal();
    setTimeout(hideLoader, 400);
  }
}

function bootLocal() {
  state.mode = 'local';
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem('pixeltube_db') || 'null'); } catch (_) {}
  if (!raw) raw = { channels: {}, videos: {}, videoSrc: {}, users: {}, comments: {}, playlists: {}, reports: {}, admins: {} };
  localDB = raw;
  applyData(localDB);
  setStatus();
  hideLoader();
  if (PIXLECT.user) ensurePrimaryChannel();
}

function persistLocal() {
  try { localStorage.setItem('pixeltube_db', JSON.stringify(localDB)); } catch (_) {}
}

function applyData(d) {
  lastData = d;
  state.videos    = d.videos    || {};
  state.channels  = d.channels  || {};
  state.admins    = d.admins    || {}; // <--- Added admins
  seedSubscriberCounts(state.channels);
  offlineDownloads().forEach(item => {
    if (!item.video?.id) return;
    if (!state.videos[item.video.id]) state.videos[item.video.id] = item.video;
    if (item.channel?.id && !state.channels[item.channel.id]) state.channels[item.channel.id] = item.channel;
  });
  state.playlists = d.playlists || {};
  state.users     = d.users     || {};
  state.reports   = d.reports   || {};
  state.audit     = d.moderationAudit || d.audit || {};
  state.comments  = d.comments  || {};
  const u = (d.users && d.users[state.uid]) || {};
  state.subs     = u.subs     || {};
  state.likes    = u.likes    || {};
  state.dislikes = u.dislikes || {};
  updateJoinedUserCount();

  const idx = u.channels || {};
  const ids = Object.keys(idx);
  const p = primaryChannelId();
  if (p && state.channels[p] && !ids.includes(p)) ids.unshift(p);
  state.myChannelIds = ids;

  const storedActive = u.activeChannel;
  if (storedActive && ids.includes(storedActive)) state.activeChannelId = storedActive;
  else if (p && ids.includes(p)) state.activeChannelId = p;
  else state.activeChannelId = ids[0] || null;

  renderSidebar();
  render();
}

function updateJoinedUserCount() {
  const counter = document.getElementById('joinedUserCount');
  if (!counter) return;
  if (state.mode !== 'firebase') {
    counter.textContent = 'Community count unavailable offline';
    return;
  }
  const joinedUsers = Object.keys(state.users).filter(uid => uid.startsWith('pl_') && uid.length > 3).length;
  counter.textContent = `${fmt(joinedUsers)} ${joinedUsers === 1 ? 'user' : 'users'} joined PIXELTube`;
}

async function migrateUserChannels() {
  if (!PIXLECT.user) return;
  const uid = state.uid;
  const p = primaryChannelId();
  if (!state.channels[p]) return;
  const u = state.users[uid] || {};
  const idx = u.channels || {};
  if (idx[p]) return;
  await addChannelToIndex(p);
  if (!u.activeChannel) await setActiveChannel(p);
}

function reloadUserScopedData() {
  if (state.mode === 'local' && localDB) applyData(localDB);
  else if (lastData) applyData(lastData);
}

function setStatus() {
  const p = $('#statusPill');
  if (!p) return;
  if (state.mode === 'firebase') { p.textContent = 'Realtime DB'; p.className = 'status-pill live'; }
  else if (state.mode === 'local') { p.textContent = 'Local mode'; p.className = 'status-pill local'; }
  else { p.textContent = 'connecting'; p.className = 'status-pill'; }
}

/* ============================================================
   ACTIONS
   ============================================================ */
async function toggleSub(cid) {
  if (!cid) return;
  if (!PIXLECT.user) { toast('Sign in with PIXLECT to subscribe'); pixlectSignIn(); return; }
  const on = isSubbed(cid), delta = on ? -1 : 1;
  if (state.mode === 'firebase') {
    try {
      const p = `pixeltube/users/${state.uid}/subs/${cid}`;
      if (on) await remove(ref(db, p)); else await set(ref(db, p), true);
      if (dbStats && statsWritable !== false) await statsAdjustSubscriberCount(cid, delta);
    } catch (e) { toast('Could not update subscription'); return; }
  } else {
    const u = localDB.users[state.uid] || (localDB.users[state.uid] = {});
    const s = u.subs || (u.subs = {});
    if (on) delete s[cid]; else s[cid] = true;
    const ch = localDB.channels[cid];
    if (ch) ch.subs = Math.max(0, (Number(ch.subs) || 0) + delta);
    persistLocal();
    applyData(localDB);
  }
  toast(on ? 'Unsubscribed' : 'Subscribed 🔔');
  statsLogEvent(on ? 'unsubscribe' : 'subscribe', { cid });
}

async function toggleLike(vid) {
  if (!vid) return;
  if (!PIXLECT.user) { toast('Sign in with PIXLECT to like'); pixlectSignIn(); return; }
  const on = isLiked(vid), delta = on ? -1 : 1;
  const wasDisliked = isDisliked(vid);

  if (state.mode === 'firebase') {
    try {
      const pLike    = `pixeltube/users/${state.uid}/likes/${vid}`;
      const pDislike = `pixeltube/users/${state.uid}/dislikes/${vid}`;
      if (on) await remove(ref(db, pLike)); else await set(ref(db, pLike), true);
      await runTransaction(ref(db, `pixeltube/videos/${vid}/likes`), n => Math.max(0, (Number(n) || 0) + delta));
      if (wasDisliked && !on) {
        await remove(ref(db, pDislike));
        await runTransaction(ref(db, `pixeltube/videos/${vid}/dislikes`), n => Math.max(0, (Number(n) || 0) - 1));
      }
    } catch (e) { toast('Could not update like'); }
  } else {
    const u = localDB.users[state.uid] || (localDB.users[state.uid] = {});
    const l = u.likes || (u.likes = {});
    const d = u.dislikes || (u.dislikes = {});
    if (on) delete l[vid]; else l[vid] = true;
    const v = localDB.videos[vid];
    if (v) {
      v.likes = Math.max(0, (Number(v.likes) || 0) + delta);
      if (wasDisliked && !on) { delete d[vid]; v.dislikes = Math.max(0, (Number(v.dislikes) || 0) - 1); }
    }
    persistLocal();
    applyData(localDB);
  }
  statsLogEvent(on ? 'unlike' : 'like', { vid });
}

async function toggleDislike(vid) {
  if (!vid) return;
  if (!PIXLECT.user) { toast('Sign in with PIXLECT to dislike'); pixlectSignIn(); return; }
  const on = isDisliked(vid), delta = on ? -1 : 1;
  const wasLiked = isLiked(vid);

  if (state.mode === 'firebase') {
    try {
      const pLike    = `pixeltube/users/${state.uid}/likes/${vid}`;
      const pDislike = `pixeltube/users/${state.uid}/dislikes/${vid}`;
      if (on) await remove(ref(db, pDislike)); else await set(ref(db, pDislike), true);
      await runTransaction(ref(db, `pixeltube/videos/${vid}/dislikes`), n => Math.max(0, (Number(n) || 0) + delta));
      if (wasLiked && !on) {
        await remove(ref(db, pLike));
        await runTransaction(ref(db, `pixeltube/videos/${vid}/likes`), n => Math.max(0, (Number(n) || 0) - 1));
      }
    } catch (e) { toast('Could not update dislike'); }
  } else {
    const u = localDB.users[state.uid] || (localDB.users[state.uid] = {});
    const l = u.likes || (u.likes = {});
    const d = u.dislikes || (u.dislikes = {});
    if (on) delete d[vid]; else d[vid] = true;
    const v = localDB.videos[vid];
    if (v) {
      v.dislikes = Math.max(0, (Number(v.dislikes) || 0) + delta);
      if (wasLiked && !on) { delete l[vid]; v.likes = Math.max(0, (Number(v.likes) || 0) - 1); }
    }
    persistLocal();
    applyData(localDB);
  }
  statsLogEvent(on ? 'undislike' : 'dislike', { vid });
}

async function registerView(vid) {
  if (!vid || state.viewedThisSession.has(vid)) return;
  state.viewedThisSession.add(vid);
  if (state.mode === 'firebase' && db) {
    try { await runTransaction(ref(db, `pixeltube/videos/${vid}/views`), n => (Number(n) || 0) + 1); } catch (e) {}
  } else if (state.mode === 'local' && localDB) {
    const v = localDB.videos[vid];
    if (v) { v.views = (Number(v.views) || 0) + 1; persistLocal(); applyData(localDB); }
  }
  statsRegisterView(vid);
  statsLogEvent('view', { vid });
}

/* ============================================================
   GLOBAL CLICK HANDLERS FOR ADMIN ACTIONS
   ============================================================ */
document.addEventListener('click', async (e) => {
  const target = e.target.closest('[data-action]');
  
  // Add Admin Button
  if (e.target.id === 'addAdminBtn') {
    const input = document.getElementById('newAdminUid');
    const uid = input.value.trim();
    if (!uid) return toast('Please enter a UID');
    
    try {
      if (state.mode === 'firebase') {
        await set(ref(db, `pixeltube/admins/${uid}`), { addedBy: PIXLECT.user.username, addedAt: Date.now() });
      }
      input.value = '';
      toast('✅ Admin added successfully!');
    } catch (err) {
      toast('Failed to add admin');
    }
    return;
  }

  if (!target) return;

  const action = target.dataset.action;

  // Revoke Admin Button
  if (action === 'admin-remove') {
    const uid = target.dataset.uid;
    if (confirm('Revoke admin access for this user?')) {
      try {
        if (state.mode === 'firebase') {
          await remove(ref(db, `pixeltube/admins/${uid}`));
        }
        toast('Admin revoked');
      } catch (err) {
        toast('Failed to revoke admin');
      }
    }
    return;
  }
});