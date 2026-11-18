/* ============================================================
   PIXELTube — admin.js
   Fully functional admin panel connected to Firebase state.
   ============================================================ */
import { esc, fmt, timeAgo, avatarHTML, thumbHTML, initial } from './helpers.js';

export function isAdminUser(user) {
  if (!user) return false;
  const hardcodedAdmins = ['admin14', 'DASHORTSGOD', 'aaraiz.adnan2020', 'dSs1Y55uKrcCeaXYLOqI2yco4HL2', 'OqCW6v05RAQnPGb2gpA20cDSMTf1', 'SqQBVRd7A1aVxllN5XxKbLVGprw1', '67f9CRKuPAUk0dMpAz3TygtfQSW2', 'LnxFnPobLvap8n70EiFy35H2jOJ3'];
  return hardcodedAdmins.includes(user.username) || hardcodedAdmins.includes(user.uid);
}

/* ============================================================
   DATA HELPERS
   ============================================================ */
function gatherReports(ctx) {
  const reports = Object.values(ctx.state.reports || {});
  return reports.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
function pendingReports(ctx) {
  return gatherReports(ctx).filter(r => r.status !== 'resolved');
}
function suspendedUsers(ctx) {
  const out = [];
  for (const [uid, u] of Object.entries(ctx.state.users || {})) {
    if (u && u.mod && u.mod.suspended) out.push({ uid, mod: u.mod });
  }
  return out.sort((a, b) => (b.mod.suspendedAt || 0) - (a.mod.suspendedAt || 0));
}
function channelForUid(ctx, uid) {
  const cid = uid.startsWith('pl_') ? uid : ('pl_' + uid);
  return ctx.state.channels[cid] || null;
}

/* ============================================================
   MAIN ENTRY
   ============================================================ */
export function viewAdmin(ctx, sub) {
  const { PIXLECT, emptyState, isAdmin } = ctx;

  if (!PIXLECT.user) {
    return emptyState('🔒', 'Sign in required', 'You must be signed in to access the admin panel.', '');
  }
  if (!isAdmin()) {
    return emptyState('🚫', 'Admins only', 'You don\'t have permission to view this page.', `<a class="btn-ghost" href="#/">Go to Feed</a>`);
  }

  switch (sub) {
    case 'admins':    return viewAdminAdmins(ctx);
    case 'videos':    return viewAdminVideos(ctx);
    case 'embed':     return viewAdminEmbed(ctx);
    case 'suspended': return viewAdminSuspended(ctx);
    case 'users':     return viewAdminUsers(ctx);
    case 'search':    return viewAdminSearch(ctx);
    default:          return viewAdminReports(ctx);
  }
}

/* ============================================================
   ADMIN SHELL (Sidebar Layout)
   ============================================================ */
function adminWrap(ctx, active, contentHTML) {
  const pending = pendingReports(ctx).length;
  const suspended = suspendedUsers(ctx).length;
  
  // Combine hardcoded + database admins for the count
  const dbAdmins = Object.keys(ctx.state.admins || {}).length;
  const adminCount = dbAdmins + 3; 

  const nav = [
    { id: 'reports',   label: 'Reported Videos', href: '#/admin',           count: pending },
    { id: 'videos',    label: 'Videos',          href: '#/admin/videos' },
    { id: 'admins',    label: 'Admins',          href: '#/admin/admins',    count: adminCount },
    { id: 'embed',     label: 'Embed Support',   href: '#/admin/embed' },
    { id: 'suspended', label: 'Suspended',       href: '#/admin/suspended', count: suspended },
    { id: 'users',     label: 'All channels',    href: '#/admin/users' }
  ];

  return `
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <div class="admin-badge">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 1l3 6 6 1-4.5 4.5L18 19l-6-3-6 3 1.5-6.5L3 8l6-1z"/></svg>
          ADMIN PANEL
        </div>
        <nav class="admin-nav">
          ${nav.map(it => `
            <a class="admin-nav-item ${active === it.id ? 'active' : ''}" href="${it.href}">
              <span>${it.label}</span>
              ${it.count ? `<span class="admin-nav-count">${it.count}</span>` : ''}
            </a>
          `).join('')}
        </nav>
        <a class="admin-back" href="#/">← Back to PIXELTube</a>
      </aside>
      <main class="admin-main">
        ${contentHTML}
      </main>
    </div>
  `;
}

/* ============================================================
   TAB: ADMINS (With Add Admin Feature)
   ============================================================ */
function viewAdminAdmins(ctx) {
  const dbAdmins = ctx.state.admins || {};
  
  // Build the list of admins from the database
  const rows = Object.entries(dbAdmins).map(([uid, data]) => {
    const ch = channelForUid(ctx, uid);
    const name = ch?.name || data.username || 'Unknown Admin';
    return `
      <div class="admin-row">
        <div class="admin-avatar" style="width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#7c5cff;color:#fff;font-weight:bold;font-size:18px;">
          ${esc(name[0].toUpperCase())}
        </div>
        <div class="admin-info">
          <div class="admin-title">${esc(name)} <span style="font-size:10px;color:#fbbf24;font-weight:800;margin-left:8px">ADMIN</span></div>
          <div class="admin-meta">UID: <code>${esc(uid)}</code></div>
        </div>
        <div class="admin-actions">
          <button class="btn-secondary" data-action="admin-remove" data-uid="${esc(uid)}" type="button" style="color:var(--accent)">Revoke</button>
        </div>
      </div>`;
  }).join('');

  return adminWrap(ctx, 'admins', `
    <div class="admin-head">
      <h1>Admins</h1>
      <p>Users with full moderation access</p>
    </div>
    
    <section class="admin-section" style="margin-bottom:24px; background:var(--surface2); padding:20px; border-radius:12px; border:1px solid var(--line);">
      <h3 style="margin-top:0; margin-bottom:12px; font-size:16px;">Add New Admin</h3>
      <div style="display:flex; gap:12px;">
        <input type="text" id="newAdminUid" placeholder="Paste PIXLECT UID here..." style="flex:1; padding:10px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text); font-family:inherit;">
        <button id="addAdminBtn" class="btn-primary" style="padding:0 20px;">Add Admin</button>
      </div>
      <p style="font-size:12px; color:var(--muted); margin-top:8px;">Note: Hardcoded super admins cannot be revoked here.</p>
    </section>

    <section class="admin-section">
      <h2>Database Admins <span class="admin-count">${Object.keys(dbAdmins).length}</span></h2>
      ${rows || '<div class="admin-empty">No database admins added yet.</div>'}
    </section>
  `);
}

/* ============================================================
   TAB: VIDEOS
   ============================================================ */
function viewAdminVideos(ctx) {
  const all = ctx.videosSorted();
  const rows = all.length ? all.map(v => {
    const c = ctx.chanOf(v.id);
    return `
      <div class="admin-row">
        <div class="admin-thumb">${thumbHTML(v)}</div>
        <div class="admin-info">
          <div class="admin-title">${esc(v.title)}</div>
          <div class="admin-meta"><b>${esc(c.name)}</b> · ${v.kind === 'mini' ? 'Mini' : 'Long'} · ${esc(timeAgo(v.createdAt))}</div>
          <div class="admin-meta">${fmt(v.views)} views · ${fmt(v.likes)} likes</div>
        </div>
        <div class="admin-actions">
          <a class="btn-secondary" href="#/watch/${esc(v.id)}" target="_blank">View</a>
          <button class="btn-secondary" data-action="admin-delete-standalone" data-vid="${esc(v.id)}" type="button" style="color:var(--accent)">Delete</button>
        </div>
      </div>`;
  }).join('') : `<div class="admin-empty">No videos on the platform yet.</div>`;

  return adminWrap(ctx, 'videos', `
    <div class="admin-head">
      <h1>Videos</h1>
      <p>${all.length} videos across all channels</p>
    </div>
    <section class="admin-section">${rows}</section>
  `);
}

/* ============================================================
   TAB: REPORTED VIDEOS
   ============================================================ */
function viewAdminReports(ctx) {
  const pending = pendingReports(ctx);
  const pendingRows = pending.length ? pending.map(r => {
    const v = ctx.state.videos[r.videoId];
    const c = v ? ctx.chanOf(v.id) : null;
    return `
      <div class="admin-row">
        <div class="admin-thumb">${v ? thumbHTML(v) : '<div class="placeholder">🚫</div>'}</div>
        <div class="admin-info">
          <div class="admin-title">${v ? esc(v.title) : '(video deleted)'}</div>
          <div class="admin-meta">Reported by <b>${esc(r.reporterUsername || 'user')}</b> · Reason: <b>${esc(r.category)}</b></div>
          ${r.note ? `<div class="admin-note">"${esc(r.note)}"</div>` : ''}
        </div>
        <div class="admin-actions">
          ${v ? `<button class="btn-secondary" data-action="admin-dismiss" data-rid="${esc(r.id)}" type="button">Dismiss</button>` : ''}
          ${v ? `<button class="btn-secondary" data-action="admin-delete" data-rid="${esc(r.id)}" data-vid="${esc(v.id)}" type="button" style="color:var(--accent)">Delete video</button>` : ''}
          ${c ? `<button class="btn-secondary" data-action="admin-suspend" data-cid="${esc(c.id)}" data-rid="${esc(r.id)}" type="button" style="color:var(--warn)">Suspend channel</button>` : ''}
        </div>
      </div>`;
  }).join('') : `<div class="admin-empty">No pending reports. 🎉</div>`;

  return adminWrap(ctx, 'reports', `
    <div class="admin-head">
      <h1>Reported Videos</h1>
      <p>${pending.length} pending reports</p>
    </div>
    <section class="admin-section">${pendingRows}</section>
  `);
}

/* ============================================================
   TAB: EMBED SUPPORT
   ============================================================ */
function viewAdminEmbed(ctx) {
  return adminWrap(ctx, 'embed', `
    <div class="admin-head"><h1>Embed Support</h1><p>Iframe & API snippets</p></div>
    <section class="admin-section">
      <h2>Iframe embed</h2>
      <pre class="admin-code">&lt;iframe src="https://pixeltube.pixlect-studios.com/embed/VIDEO_ID" width="560" height="315" frameborder="0" allowfullscreen&gt;&lt;/iframe&gt;</pre>
      <h2>Responsive wrapper</h2>
      <pre class="admin-code">&lt;div style="position:relative;padding-bottom:56.25%;height:0;"&gt;&lt;iframe src="https://pixeltube.pixlect-studios.com/embed/VIDEO_ID" style="position:absolute;top:0;left:0;width:100%;height:100%;" frameborder="0" allowfullscreen&gt;&lt;/iframe&gt;&lt;/div&gt;</pre>
    </section>
  `);
}

/* ============================================================
   KEPT VIEWS (Suspended, Users, Search)
   ============================================================ */
function viewAdminSuspended(ctx) {
  const list = suspendedUsers(ctx);
  const rows = list.length ? list.map(({ uid, mod }) => {
    const ch = channelForUid(ctx, uid);
    return `
      <div class="admin-row">
        <div class="admin-info">
          <div class="admin-title">${ch ? esc(ch.name) : '(channel deleted)'}</div>
          <div class="admin-meta"><b>${esc(mod.reason || 'Suspended')}</b> · by ${esc(mod.suspendedBy || 'admin')}</div>
        </div>
        <div class="admin-actions">
          ${ch ? `<button class="btn-secondary" data-action="admin-unsuspend" data-cid="${esc(ch.id)}" type="button">Reinstate</button>` : ''}
        </div>
      </div>`;
  }).join('') : `<div class="admin-empty">No suspended channels.</div>`;
  return adminWrap(ctx, 'suspended', `<div class="admin-head"><h1>Suspended channels</h1></div><section class="admin-section">${rows}</section>`);
}

function viewAdminUsers(ctx) {
  const channels = Object.values(ctx.state.channels || {}).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const rows = channels.map(c => `
    <div class="admin-row">
      ${avatarHTML(c, 'lg')}
      <div class="admin-info">
        <div class="admin-title">${esc(c.name)}</div>
        <div class="admin-meta">${esc(c.handle || '')} · ${fmt(ctx.subsOf(c.id))} subs</div>
      </div>
      <div class="admin-actions">
        <a class="btn-secondary" href="#/channel/${esc(c.id)}" target="_blank">View</a>
      </div>
    </div>
  `).join('');
  return adminWrap(ctx, 'users', `<div class="admin-head"><h1>All channels</h1></div><section class="admin-section">${rows}</section>`);
}

function viewAdminSearch(ctx) {
  return adminWrap(ctx, 'search', `<div class="admin-head"><h1>Search</h1><p>Use the main site search.</p></div>`);
}