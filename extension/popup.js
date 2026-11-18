// CareerPilot Extension — Popup Script
// Full dashboard with working left-panel nav, auto-apply, matches, applications, résumé, profile, admin

const API = 'http://localhost:4001/api';

// ── Toast ──
const toastEl = document.getElementById('toast');
function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 3000);
}

// ── Auth ──
function getToken() { return localStorage.getItem('cp_token'); }
function setToken(t) { localStorage.setItem('cp_token', t); }
function clearToken() { localStorage.removeItem('cp_token'); }

async function apiFetch(path, opts = {}) {
  const t = getToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (t) headers.Authorization = 'Bearer ' + t;
  const r = await fetch(API + path, { ...opts, headers });
  if (r.status === 401) { clearToken(); showLoginPage(); throw new Error('unauth'); }
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ── Page routing ──
let _currentPage = 'dashboard';
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + name);
  if (target) target.classList.add('active');

  document.querySelectorAll('.side-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === name);
  });
  _currentPage = name;

  // lazy-load page content
  if (name === 'dashboard') loadDashboard();
  if (name === 'matches') loadMatches();
  if (name === 'applications') loadApplications();
  if (name === 'resume') loadResume();
  if (name === 'profile') loadProfile();
  if (name === 'admin') loadAdmin();
}

// wire nav
document.querySelectorAll('.side-nav a[data-page]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    showPage(a.dataset.page);
  });
});

// ── Chip helpers ──
const SKILLS = ['JavaScript','TypeScript','React','Angular','Vue.js','Node.js','Express','Python','Django','Flask','Java','Spring Boot','C#','.NET','Go','Rust','PHP','SQL','PostgreSQL','MySQL','MongoDB','Redis','Docker','Kubernetes','AWS','GCP','Azure','Git','HTML','CSS','Tailwind','Redux','GraphQL','REST API','Microservices','Machine Learning','TensorFlow','Data Science'];
const CITIES = ['Bangalore','Chennai','Mumbai','Delhi','Hyderabad','Pune','Kolkata','Ahmedabad','Jaipur','Noida','Gurgaon','Kochi','Chandigarh','Indore','Bhopal','Nagpur','Coimbatore','Mysore','Surat','Vadodara','Rajkot','Nashik','Dehradun','Ranchi','Patna','Guwahati','Bhubaneswar','Raipur','Agra','Kanpur','Meerut','Goa','Remote'];

function renderChips(containerId, items) {
  const c = document.getElementById(containerId); if (!c) return;
  c.innerHTML = items.map(v =>
    `<span class="chip">${v}<button data-v="${v}">×</button></span>`
  ).join('');
  c.querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => b.parentElement.remove())
  );
}
function chipValues(containerId) {
  const c = document.getElementById(containerId); if (!c) return [];
  return [...c.querySelectorAll('.chip')].map(ch => ch.textContent.replace('×','').trim());
}
function bindChipInput(inputId, containerId, suggestions) {
  const input = document.getElementById(inputId); if (!input) return;
  const dl = document.getElementById(inputId.replace('-input','-dl') + '') || document.getElementById(inputId + '-list');
  if (dl) suggestions.forEach(s => { const o = document.createElement('option'); o.value = s; dl.appendChild(o); });

  const addChip = v => {
    if (!v) return;
    const cur = chipValues(containerId);
    if (cur.includes(v)) { input.value = ''; return; }
    renderChips(containerId, [...cur, v]);
    input.value = '';
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); const v = input.value.trim().replace(/,$/, ''); if (v) addChip(v); }
  });
  input.addEventListener('change', () => {
    const v = input.value.trim();
    if (v && suggestions.some(s => s.toLowerCase() === v.toLowerCase())) addChip(v);
  });
}

// populate datalists once
(function() {
  const sdl = document.getElementById('skills-dl');
  SKILLS.forEach(s => { const o = document.createElement('option'); o.value = s; sdl?.appendChild(o); });
  const cdl = document.getElementById('cities-dl');
  CITIES.forEach(s => { const o = document.createElement('option'); o.value = s; cdl?.appendChild(o); });
})();
bindChipInput('skills-input', 'skills-chips', SKILLS);
bindChipInput('cities-input', 'cities-chips', CITIES);

// ── Auto-apply state ──
// Tracks running portals locally { portal: { tabId, applied, skipped } }
const _aaSessions = {};

function setPortalRunning(portal, running) {
  const startBtn = document.getElementById(`aa-start-${portal}`);
  const stopBtn  = document.getElementById(`aa-stop-${portal}`);
  if (startBtn) startBtn.style.display = running ? 'none' : '';
  if (stopBtn)  stopBtn.style.display  = running ? '' : 'none';
  const stopAll = document.getElementById('aa-stop-all');
  if (stopAll) stopAll.style.display = Object.keys(_aaSessions).length > 0 ? '' : 'none';
}

function setPortalStatus(portal, text) {
  const el = document.getElementById(`aa-status-${portal}`);
  if (el) el.textContent = text;
}

// ── Start: send START message to background — opens tab in THIS Chrome window ──
async function startPortalApply(portal) {
  setPortalRunning(portal, true);
  const dot = document.getElementById(`aa-dot-${portal}`);
  if (dot) dot.className = 'aa-dot running';
  setPortalStatus(portal, 'Starting…');

  try {
    // fetch user settings to pass to background
    const user = await apiFetch('/users/me');
    const profiles = user.jobProfiles || [];
    const active = profiles.find(p => p.isActive) || profiles[0];
    const settings = {
      role:      active?.role     || user.role     || 'Software Engineer',
      skills:    active?.skills   || user.skills   || [],
      cities:    active?.cities   || user.cities   || [],
      minMatch:  user.settings?.minMatch  || 75,
      dailyCap:  user.settings?.dailyCap  || 20,
      email:     user.portals?.[portal]?.email       || '',
      password:  user.portals?.[portal]?.passwordEnc || ''
    };

    if (!settings.email) {
      throw new Error(`No credentials for ${portal} — add them in Profile → Portal Credentials`);
    }

    // send to background service worker → opens tab in same Chrome window
    const resp = await chrome.runtime.sendMessage({
      type: 'START',
      portal,
      token: getToken(),
      settings
    });

    if (!resp?.ok) throw new Error(resp?.error || 'Background start failed');

    _aaSessions[portal] = { tabId: resp.tabId, applied: 0, skipped: 0 };
    showToast(`${portal} — opening in this browser`);
    setPortalStatus(portal, 'Tab opened — logging in…');

    // poll background for log updates every 2s
    _aaSessions[portal].interval = setInterval(() => pollBackground(portal), 2000);
    // hard stop after 10 min
    _aaSessions[portal].timeout  = setTimeout(() => stopPortalApply(portal, true), 600000);

  } catch(e) {
    setPortalRunning(portal, false);
    if (dot) dot.className = 'aa-dot error';
    setPortalStatus(portal, e.message);
    showToast(e.message);
  }
}

// ── Stop: tell background to close the tab ──
async function stopPortalApply(portal, auto = false) {
  const s = _aaSessions[portal];
  if (s?.interval) clearInterval(s.interval);
  if (s?.timeout)  clearTimeout(s.timeout);
  delete _aaSessions[portal];

  const dot = document.getElementById(`aa-dot-${portal}`);
  setPortalRunning(portal, false);
  if (dot) dot.className = 'aa-dot done';

  chrome.runtime.sendMessage({ type: 'STOP', portal });
  setPortalStatus(portal, auto ? 'Finished' : 'Stopped');
  if (!auto) showToast(`${portal} stopped`);
}

// ── Poll background log every 2s and update UI ──
async function pollBackground(portal) {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    const session = resp?.sessions?.[portal];
    if (!session) {
      // session ended in background
      if (_aaSessions[portal]) stopPortalApply(portal, true);
      return;
    }

    const { applied, skipped, lastLog, done } = session;
    const dot = document.getElementById(`aa-dot-${portal}`);

    if (lastLog) setPortalStatus(portal, lastLog);
    if (applied !== undefined) {
      _aaSessions[portal].applied = applied;
      _aaSessions[portal].skipped = skipped;
    }

    if (done) {
      if (dot) dot.className = done === 'error' ? 'aa-dot error' : 'aa-dot done';
      stopPortalApply(portal, true);
      refreshLog(portal);
    }
  } catch(e) {}
}

// ── Refresh the inline log panel from background storage ──
async function refreshLog(portal) {
  const panel = document.getElementById(`aa-log-panel-${portal}`);
  if (!panel || panel.style.display === 'none') return;
  chrome.storage.local.get(['log'], d => {
    const lines = (d.log || []).filter(l => l.toLowerCase().includes(portal));
    if (lines.length) {
      panel.innerHTML = lines.map(l => `<div>${l}</div>`).join('');
      panel.scrollTop = panel.scrollHeight;
    }
  });
}

function togglePortalLog(portal) {
  const panel = document.getElementById(`aa-log-panel-${portal}`);
  if (!panel) return;
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  panel.style.display = '';
  refreshLog(portal);
}


function renderAutoApplyPortals(user) {
  const container = document.getElementById('aa-portals'); if (!container) return;
  const portals = user?.portals || {};
  const enabled = Object.keys(portals).filter(p => portals[p]?.email);

  if (!enabled.length) {
    container.innerHTML = `<p class="aa-no-portal">No portals configured. <a id="go-profile-link">Set up portals →</a></p>`;
    document.getElementById('go-profile-link')?.addEventListener('click', () => showPage('profile'));
    return;
  }

  container.innerHTML = enabled.map(p => `
    <div class="aa-portal-row" id="aa-row-${p}">
      <div class="aa-portal-header">
        <div>
          <div class="aa-portal-name">
            <span class="aa-dot" id="aa-dot-${p}"></span>
            ${p.charAt(0).toUpperCase() + p.slice(1)}
          </div>
          <div class="aa-portal-status" id="aa-status-${p}">Idle</div>
        </div>
        <div class="aa-actions">
          <button class="aa-log-btn" id="aa-logbtn-${p}" title="Log">📋</button>
          <button class="aa-stop" id="aa-stop-${p}" data-portal="${p}">◼ Stop</button>
          <button class="aa-start" id="aa-start-${p}" data-portal="${p}">▶ Start</button>
        </div>
      </div>
      <div class="aa-log-panel" id="aa-log-panel-${p}"></div>
    </div>
  `).join('');

  enabled.forEach(p => {
    document.getElementById(`aa-start-${p}`)?.addEventListener('click', () => startPortalApply(p));
    document.getElementById(`aa-stop-${p}`)?.addEventListener('click', () => stopPortalApply(p));
    document.getElementById(`aa-logbtn-${p}`)?.addEventListener('click', () => togglePortalLog(p));
  });

  // restore last state
  enabled.forEach(async p => {
    try {
      const sr = await fetch(`${API}/automation/status/${p}`, { headers: { Authorization: 'Bearer ' + getToken() } });
      if (!sr.ok) return;
      const st = await sr.json();
      if (!st.step || st.step === 'idle') return;
      const dot = document.getElementById(`aa-dot-${p}`);
      if (dot) {
        if (st.step === 'Done') dot.className = 'aa-dot done';
        else if (st.step?.startsWith('Error')) dot.className = 'aa-dot error';
        else dot.className = 'aa-dot done';
      }
      setPortalStatus(p, st.step === 'Done' ? 'Last run: completed' : st.step?.startsWith('Error') ? 'Last run: error' : 'Last run: ' + st.step);
    } catch(e) {}
  });
}

// ── Dashboard ──
async function loadDashboard() {
  if (!getToken()) return;
  try {
    const [user, apps] = await Promise.all([apiFetch('/users/me'), apiFetch('/applications')]);

    const applied    = apps.length;
    const interviews = apps.filter(a => a.status === 'interview').length;
    const offers     = apps.filter(a => a.status === 'offer').length;
    const rejected   = apps.filter(a => a.status === 'rejected').length;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('kpi-matches', 0);
    set('kpi-applied', applied);
    set('kpi-interviews', interviews);
    set('kpi-offers', offers);

    // funnel
    const base = applied || 1;
    [['applied', applied, '#638e71'], ['interview', interviews, '#7b6fd4'], ['offer', offers, '#d9a94c'], ['rejected', rejected, '#d96e61']].forEach(([s, n, c]) => {
      const bar = document.getElementById(`fn-${s}`); const val = document.getElementById(`fn-${s}-n`);
      if (bar) { bar.style.width = Math.round((n / base) * 100) + '%'; bar.style.background = c; }
      if (val) val.textContent = n;
    });

    // auto-apply
    const settings = user.settings || {};
    set('aa-cap', settings.dailyCap || 0);
    set('aa-min', settings.minMatch || 0);
    if (!document.getElementById('aa-portals')?.dataset.rendered) {
      renderAutoApplyPortals(user);
      const c = document.getElementById('aa-portals');
      if (c) c.dataset.rendered = '1';
    }

  } catch(e) { console.error('loadDashboard', e); }
}

// Stop-all
document.getElementById('aa-stop-all')?.addEventListener('click', async () => {
  const btn = document.getElementById('aa-stop-all');
  if (btn) { btn.disabled = true; btn.textContent = 'Stopping…'; }
  try {
    const r = await apiFetch('/automation/stop', { method: 'POST' });
    Object.keys(_aaIntervals).forEach(p => {
      clearInterval(_aaIntervals[p]); delete _aaIntervals[p];
      setPortalRunning(p, false); setPortalStatus(p, 'Stopped');
      const dot = document.getElementById(`aa-dot-${p}`);
      if (dot) dot.className = 'aa-dot';
    });
    showToast(`Stopped ${r.count || 'all'} portals`);
  } catch(e) { showToast('Stop failed: ' + e.message); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '◼ Stop all'; } }
});

// ── Job Matches ──
async function loadMatches() {
  const list = document.getElementById('match-list'); if (!list) return;
  list.innerHTML = '<div class="empty-card">Loading…</div>';
  try {
    const jobs = await apiFetch('/jobs');
    if (!jobs.length) { list.innerHTML = '<div class="empty-card">No matches yet.</div>'; return; }
    list.innerHTML = jobs.map(j => `
      <div class="job-card">
        <div class="co-logo" style="background:${logoColor(j.company)}">${(j.company||'?')[0].toUpperCase()}</div>
        <div>
          <div class="job-title">${j.title || 'Job'}</div>
          <div class="job-meta">${j.company || ''} · ${j.location || ''}</div>
          <div class="tags">${(j.skills||[]).slice(0,4).map(s=>`<span class="tag">${s}</span>`).join('')}</div>
        </div>
        <span class="match-score">${j.matchScore||0}%</span>
      </div>
    `).join('');
    showToast(jobs.length + ' matches loaded');
  } catch(e) { list.innerHTML = '<div class="empty-card">Failed to load.</div>'; }
}
document.getElementById('btn-find-jobs')?.addEventListener('click', loadMatches);

function logoColor(co) {
  const colors = ['#a67f48','#536f9a','#c66f62','#638e71','#7b6fd4','#d9a94c'];
  let h = 0; for (const c of (co||'')) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return colors[Math.abs(h) % colors.length];
}

// ── Applications ──
async function loadApplications() {
  const board = document.getElementById('kanban-board'); if (!board) return;
  board.innerHTML = '<div style="font-size:11px;color:var(--muted)">Loading…</div>';
  try {
    const apps = await apiFetch('/applications');
    document.getElementById('app-total').textContent = apps.length + ' total';
    const cols = { applied: [], interview: [], offer: [], saved: [] };
    apps.forEach(a => {
      const key = cols[a.status] ? a.status : 'applied';
      cols[key].push(a);
    });
    board.innerHTML = '';
    Object.entries(cols).forEach(([status, list]) => {
      const col = document.createElement('div');
      col.innerHTML = `<div class="kanban-col-title">${status.toUpperCase()} <span>${list.length}</span></div>` +
        (list.length
          ? list.map(a => `<div class="track-card ${status === 'interview' ? 'interview' : ''}">
              <b>${a.job?.title || 'Job'}</b>
              <div style="font-size:10px;color:var(--muted);margin:2px 0">${a.job?.company || ''}</div>
              <small>${a.portal || ''} · ${new Date(a.appliedAt).toLocaleDateString('en-IN', {day:'numeric',month:'short'})}</small>
            </div>`).join('')
          : '<div class="empty-card">None</div>'
        );
      board.appendChild(col);
    });
  } catch(e) { board.innerHTML = '<div class="empty-card">Failed to load.</div>'; }
}

// ── Résumé ──
async function loadResume() {
  if (!getToken()) return;
  try {
    const user = await apiFetch('/users/me');
    if (user.resumeFile?.storedName) {
      const panel = document.getElementById('resume-stored-panel');
      if (panel) panel.style.display = '';
      const nameEl = document.getElementById('resume-stored-name');
      const metaEl = document.getElementById('resume-stored-meta');
      if (nameEl) nameEl.textContent = user.resumeFile.originalName || user.resumeFile.storedName;
      if (metaEl) {
        const kb = user.resumeFile.size ? Math.round(user.resumeFile.size / 1024) + ' KB · ' : '';
        const date = user.resumeFile.uploadedAt ? new Date(user.resumeFile.uploadedAt).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'}) : '';
        metaEl.textContent = kb + date;
      }
      const t = getToken();
      const previewBtn = document.getElementById('resume-preview-btn');
      const downloadBtn = document.getElementById('resume-download-btn');
      if (previewBtn) previewBtn.href = `${API}/users/me/resume/preview?t=${t}`;
      if (downloadBtn) downloadBtn.href = `${API}/users/me/resume/download?t=${t}`;
    }
  } catch(e) {}
}

// Resume drop zone
(function() {
  const drop = document.getElementById('resume-drop');
  const fileInput = document.getElementById('resume-file');
  const status = document.getElementById('resume-status');
  if (!drop || !fileInput) return;

  async function handleFile(file) {
    if (!file) return;
    if (status) status.textContent = 'Uploading…';
    try {
      const fd = new FormData(); fd.append('resume', file);
      const res = await fetch(API + '/users/me/resume', {
        method: 'POST', headers: { Authorization: 'Bearer ' + getToken() }, body: fd
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      if (status) status.textContent = '✓ Résumé uploaded';
      drop.style.borderColor = '#638e71';
      showToast('Résumé uploaded');
      if (data.resumeFile) {
        const panel = document.getElementById('resume-stored-panel');
        if (panel) panel.style.display = '';
        const nameEl = document.getElementById('resume-stored-name');
        if (nameEl) nameEl.textContent = data.resumeFile.originalName || data.resumeFile.storedName;
      }
    } catch(e) { if (status) status.textContent = '✗ Upload failed — try again'; }
  }

  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
  drop.addEventListener('click', e => { if (e.target.tagName !== 'LABEL') fileInput.click(); });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = '#638e71'; });
  drop.addEventListener('dragleave', () => drop.style.borderColor = '#d0d9d0');
  drop.addEventListener('drop', e => { e.preventDefault(); drop.style.borderColor = '#d0d9d0'; handleFile(e.dataTransfer.files[0]); });
})();

// ── Profile ──
async function loadProfile() {
  if (!getToken()) return;
  try {
    const u = await apiFetch('/users/me');
    const nameEl = document.getElementById('prof-name'); if (nameEl) nameEl.value = u.name || '';

    // active profile
    const profiles = u.jobProfiles || [];
    const active = profiles.find(p => p.isActive) || profiles[0];
    if (active) {
      const roleEl = document.getElementById('prof-role'); if (roleEl) roleEl.value = active.role || '';
      renderChips('skills-chips', active.skills || []);
      renderChips('cities-chips', active.cities || []);
    }

    const s = u.settings || {};
    const aaEl = document.getElementById('prof-autoapply'); if (aaEl) aaEl.checked = !!s.autoApply;
    const capEl = document.getElementById('prof-dailycap'); if (capEl) capEl.value = s.dailyCap || 50;
    const minEl = document.getElementById('prof-minmatch'); if (minEl) minEl.value = s.minMatch || 75;

    renderPortalCreds(u.portals || {});
  } catch(e) {}
}

function renderPortalCreds(portals) {
  const container = document.getElementById('portal-creds'); if (!container) return;
  const PORTALS = ['naukri','shine','linkedin','indeed','hirist'];
  container.innerHTML = PORTALS.map(p => {
    const pc = portals?.[p] || {};
    const enabled = !!pc.email;
    const emailVal = (pc.email && pc.email !== 'enabled') ? pc.email : '';
    return `<div class="portal-row">
      <div class="portal-row-header">
        <input type="checkbox" id="pc-${p}-cb" ${enabled ? 'checked' : ''}>
        <span>${p.charAt(0).toUpperCase() + p.slice(1)}</span>
      </div>
      <div class="portal-row-fields">
        <input type="email" id="pc-${p}-email" placeholder="Email" value="${emailVal}" />
        <input type="password" id="pc-${p}-pass" placeholder="Password" value="${pc.passwordEnc || ''}" />
      </div>
    </div>`;
  }).join('');
}

document.getElementById('prof-save-btn')?.addEventListener('click', async () => {
  const portals = {};
  ['naukri','shine','linkedin','indeed','hirist'].forEach(p => {
    const cb    = document.getElementById(`pc-${p}-cb`);
    const email = document.getElementById(`pc-${p}-email`)?.value.trim() || '';
    const pass  = document.getElementById(`pc-${p}-pass`)?.value || '';
    portals[p] = cb?.checked ? { email, passwordEnc: pass } : { email: '', passwordEnc: '' };
  });

  const body = {
    name: document.getElementById('prof-name')?.value.trim() || '',
    role: document.getElementById('prof-role')?.value.trim() || '',
    skills: chipValues('skills-chips'),
    cities: chipValues('cities-chips'),
    portals,
    settings: {
      autoApply: document.getElementById('prof-autoapply')?.checked || false,
      dailyCap:  parseInt(document.getElementById('prof-dailycap')?.value) || 50,
      minMatch:  parseInt(document.getElementById('prof-minmatch')?.value) || 75
    }
  };

  try {
    await apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify(body) });
    showToast('Profile saved');
    // reset aa-portals so it re-renders with fresh portals
    const c = document.getElementById('aa-portals');
    if (c) { c.dataset.rendered = ''; }
    showPage('dashboard');
  } catch(e) { showToast('Save failed: ' + e.message); }
});

// ── Admin ──
async function loadAdmin() {
  if (!getToken()) return;
  try {
    const data = await apiFetch('/admin/users');
    const countEl = document.getElementById('admin-count');
    if (countEl) countEl.textContent = data.count;
    const list = document.getElementById('admin-users');
    if (list) {
      list.innerHTML = (data.users || []).map(u =>
        `<div class="admin-row">
          <span>${u.name || u.email} <span style="color:var(--muted);font-size:9px">(${u.email})</span></span>
          <button class="del-user" data-id="${u._id}">Delete</button>
        </div>`
      ).join('');
      list.querySelectorAll('.del-user').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this user?')) return;
        try { await apiFetch('/admin/users/' + b.dataset.id, { method: 'DELETE' }); showToast('Deleted'); loadAdmin(); }
        catch(e) { showToast(e.message); }
      }));
    }
  } catch(e) { /* not admin — silently ignore */ }
}
document.getElementById('btn-refresh-admin')?.addEventListener('click', loadAdmin);

// ── Auth flows ──
function showLoginPage() {
  document.getElementById('login-wrap').style.display = 'flex';
  document.getElementById('login-card').style.display = '';
  document.getElementById('register-card').style.display = 'none';
}
function hideLoginPage() {
  document.getElementById('login-wrap').style.display = 'none';
}

document.getElementById('show-register')?.addEventListener('click', () => {
  document.getElementById('login-card').style.display = 'none';
  document.getElementById('register-card').style.display = '';
});
document.getElementById('show-login')?.addEventListener('click', () => {
  document.getElementById('register-card').style.display = 'none';
  document.getElementById('login-card').style.display = '';
});

document.getElementById('login-submit')?.addEventListener('click', async () => {
  const email    = document.getElementById('login-email')?.value.trim();
  const password = document.getElementById('login-password')?.value;
  if (!email || !password) { showToast('Enter email and password'); return; }
  try {
    const res = await fetch(API + '/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.token) {
      setToken(data.token);
      hideLoginPage();
      showToast('Welcome ' + (data.user?.name || email.split('@')[0]));
      showPage('dashboard');
    } else { showToast(data.error || 'Login failed'); }
  } catch(e) { showToast('Login failed: ' + e.message); }
});

// Register — résumé upload auto-fill
let _regResumeFile = null;
let _regParsed = null;

document.getElementById('reg-resume-pick')?.addEventListener('click', () => {
  document.getElementById('reg-resume-file')?.click();
});
document.getElementById('reg-resume-file')?.addEventListener('change', async function() {
  const file = this.files[0]; if (!file) return;
  const status = document.getElementById('reg-resume-status');
  if (status) status.textContent = 'Parsing…';
  try {
    const fd = new FormData(); fd.append('resume', file);
    const res = await fetch(API + '/users/parse-resume', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Parse failed');
    const data = await res.json();
    _regParsed = data;
    _regResumeFile = file;
    if (data.name) { const el = document.getElementById('reg-name'); if (el) el.value = data.name; }
    if (data.email) { const el = document.getElementById('reg-email'); if (el) el.value = data.email; }
    if (data.role) { const el = document.getElementById('reg-role-reg'); if (el) el.value = data.role; }
    const zone = document.getElementById('reg-zone');
    if (zone) zone.classList.add('uploaded');
    if (status) status.textContent = '✓ Auto-filled from résumé';
  } catch(e) {
    if (status) status.textContent = '✗ Could not parse — fill manually';
  }
});

document.getElementById('register-submit')?.addEventListener('click', async () => {
  const email   = document.getElementById('reg-email')?.value.trim();
  const name    = document.getElementById('reg-name')?.value.trim();
  const role    = document.getElementById('reg-role-reg')?.value.trim() || '';
  const password = document.getElementById('reg-password')?.value;
  const confirm  = document.getElementById('reg-confirm')?.value;
  if (!email || !password) { showToast('Email and password required'); return; }
  if (password !== confirm) { showToast('Passwords do not match'); return; }
  try {
    const res = await fetch(API + '/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: name || email.split('@')[0] })
    });
    const data = await res.json();
    if (data.token) {
      setToken(data.token);
      // patch profile with resume data if available
      const parsed = _regParsed;
      if (parsed || role) {
        const patchBody = { role: role || parsed?.role || '' };
        if (parsed?.skills?.length) patchBody.skills = parsed.skills;
        if (parsed?.cities?.length) patchBody.cities = parsed.cities;
        fetch(API + '/users/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.token }, body: JSON.stringify(patchBody) }).catch(() => {});
        if (_regResumeFile) {
          const fd = new FormData(); fd.append('resume', _regResumeFile);
          fetch(API + '/users/me/resume', { method: 'POST', headers: { Authorization: 'Bearer ' + data.token }, body: fd }).catch(() => {});
        }
      }
      hideLoginPage();
      showToast('Account created!');
      showPage('dashboard');
    } else { showToast(data.error || 'Register failed'); }
  } catch(e) { showToast('Register failed: ' + e.message); }
});

// ── Open full web dashboard ──
document.getElementById('open-webapp')?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://127.0.0.1:8080' });
});

// ── Boot ──
(function init() {
  if (!getToken()) {
    showLoginPage();
  } else {
    hideLoginPage();
    showPage('dashboard');
  }
})();
