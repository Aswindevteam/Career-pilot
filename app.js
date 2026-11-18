const API = 'http://localhost:4001/api';
const toast = document.querySelector('#toast');
const showToast = m => { if (toast) { toast.textContent = m; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3500); } };

// ---- Auth helpers ----
function getToken() { return localStorage.getItem('jobagent_token'); }
function setToken(t) { localStorage.setItem('jobagent_token', t); }
function clearToken() { localStorage.removeItem('jobagent_token'); }

async function api(path, opts = {}) {
  const t = getToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (t) headers.Authorization = 'Bearer ' + t;
  const r = await fetch(API + path, { ...opts, headers });
  if (r.status === 401) { clearToken(); showToast('Please sign in.'); throw new Error('unauth'); }
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ---- Login flow (in-page modal) ----
async function ensureAuth() {
  if (getToken()) return true;
  const loginPage = document.querySelector('#login-page');
  const regPage = document.querySelector('#register-page');
  if (loginPage) loginPage.style.display = 'flex';
  if (regPage) regPage.style.display = 'none';
  return new Promise(resolve => {
    const doLogin = async () => {
      const email = document.querySelector('#login-email').value.trim();
      const password = document.querySelector('#login-password').value;
      if (!email || !password) { showToast('Enter email and password'); return; }
      const res = await fetch(API + '/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email,password}) });
      const data = await res.json();
      if (data.token) { setToken(data.token); if (loginPage) loginPage.style.display = 'none'; showToast('Welcome ' + (data.user?.email||email)); resolve(true); }
      else { showToast(data.error || 'Login failed'); }
    };
    const doRegister = async () => {
      const email = document.querySelector('#reg-email').value.trim();
      const name = document.querySelector('#reg-name').value.trim();
      const role = document.querySelector('#reg-role')?.value.trim() || '';
      const password = document.querySelector('#reg-password').value;
      const confirm = document.querySelector('#reg-confirm').value;
      if (!email || !password) { showToast('Email and password required'); return; }
      if (password !== confirm) { showToast('Passwords do not match'); return; }
      const res = await fetch(API + '/auth/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email,password,name:name||email.split('@')[0]}) });
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
        if (regPage) regPage.style.display = 'none';
        showToast('Account created: ' + (data.user?.email||email));
        // patch profile with resume data if available
        const parsed = window._resumeParsed;
        if (parsed || role) {
          const patchBody = { role: role || parsed?.role || '' };
          if (parsed?.skills?.length) patchBody.skills = parsed.skills;
          if (parsed?.cities?.length) patchBody.cities = parsed.cities;
          fetch(API + '/users/me', { method:'PATCH', headers:{'Content-Type':'application/json','Authorization':'Bearer '+data.token}, body: JSON.stringify(patchBody) }).catch(()=>{});
          // save resume file if present
          if (window._resumeFile) {
            const fd = new FormData(); fd.append('resume', window._resumeFile);
            fetch(API + '/users/me/resume', { method:'POST', headers:{'Authorization':'Bearer '+data.token}, body: fd }).catch(()=>{});
          }
        }
        resolve(true);
      } else { showToast(data.error || 'Register failed'); }
    };
    const ls = document.querySelector('#login-submit'); if (ls) ls.onclick = doLogin;
    const ss = document.querySelector('#show-register'); if (ss) ss.onclick = () => { if (loginPage) loginPage.style.display = 'none'; if (regPage) regPage.style.display = 'flex'; };
    const rs = document.querySelector('#register-submit'); if (rs) rs.onclick = doRegister;
    const sl = document.querySelector('#show-login'); if (sl) sl.onclick = () => { if (regPage) regPage.style.display = 'none'; if (loginPage) loginPage.style.display = 'flex'; };
  });
}

function renderChips(containerId, items) {
  const c = document.getElementById(containerId); if (!c) return;
  c.innerHTML = items.map(v => `<span class="chip">${v}<button data-v="${v}">×</button></span>`).join('');
  c.querySelectorAll('button').forEach(b => b.addEventListener('click', () => b.parentElement.remove()));
}
function chipValues(containerId) {
  const c = document.getElementById(containerId); if (!c) return [];
  return [...c.querySelectorAll('.chip')].map(ch => ch.textContent.replace('×','').trim());
}
const INDIAN_CITIES = ['Bangalore','Chennai','Mumbai','Delhi','Hyderabad','Pune','Kolkata','Ahmedabad','Jaipur','Lucknow','Chandigarh','Indore','Bhopal','Nagpur','Coimbatore','Kochi','Thiruvananthapuram','Visakhapatnam','Vijayawada','Mysore','Mangalore','Surat','Vadodara','Rajkot','Nashik','Aurangabad','Noida','Gurgaon','Faridabad','Ghaziabad','Dehradun','Ranchi','Patna','Guwahati','Bhubaneswar','Raipur','Jabalpur','Agra','Kanpur','Varanasi','Allahabad','Meerut','Gwalior','Udaipur','Jodhpur','Amritsar','Ludhiana','Jalandhar','Shimla','Srinagar','Jammu','Goa','Panaji'];
const SKILLS = ['JavaScript','TypeScript','React','Angular','Vue.js','Node.js','Express','Python','Django','Flask','Java','Spring Boot','C#','.NET','ASP.NET','Go','Rust','PHP','Laravel','Ruby','Rails','SQL','PostgreSQL','MySQL','MongoDB','Redis','Docker','Kubernetes','AWS','GCP','Azure','Git','Linux','HTML','CSS','Tailwind','Bootstrap','Redux','GraphQL','REST API','Microservices','Kafka','RabbitMQ','Jenkins','CI/CD','Terraform','Ansible','Machine Learning','TensorFlow','PyTorch','Data Science','Pandas','NumPy','Spark','Hadoop','Tableau','Power BI','Figma','UI/UX','Agile','Scrum'];

function bindChipInput(inputId, containerId, suggestions) {
  const input = document.getElementById(inputId);
  if (!input) return;
  // native datalist autocomplete
  const dl = document.createElement('datalist');
  dl.id = inputId + '-list';
  suggestions.forEach(s => { const o = document.createElement('option'); o.value = s; dl.appendChild(o); });
  input.parentNode.appendChild(dl);
  input.setAttribute('list', dl.id);
  const addChip = (v) => {
    if (!v) return;
    const cur = chipValues(containerId);
    if (cur.includes(v)) { input.value=''; return; }
    renderChips(containerId, [...cur, v]);
    input.value = '';
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = input.value.trim().replace(/,$/,'');
      if (v) addChip(v);
    }
  });
  // also add on change (when selecting from datalist)
  input.addEventListener('change', () => {
    const v = input.value.trim();
    if (v && suggestions.some(s => s.toLowerCase() === v.toLowerCase())) addChip(v);
  });
}

bindChipInput('prof-cities', 'cities-chips', INDIAN_CITIES);
bindChipInput('prof-skills', 'skills-chips', SKILLS);

// ── Job Profiles ──
let _jobProfiles = [];   // local working copy
let _parsedResume = null; // last parsed resume data, pending conflict resolution

function renderJobProfiles(profiles) {
  _jobProfiles = profiles || [];
  const container = document.getElementById('job-profiles-list');
  if (!container) return;

  if (!_jobProfiles.length) {
    container.innerHTML = '<p style="font-size:12px;color:var(--muted);margin:10px 0 0">No profiles yet — add one or upload a résumé.</p>';
    return;
  }

  container.innerHTML = _jobProfiles.map((p, i) => `
    <div class="jp-card ${p.isActive ? 'jp-active' : ''}" data-idx="${i}">
      <div class="jp-card-header">
        <input class="jp-label-input" data-field="label" data-idx="${i}" value="${p.label || ''}" placeholder="Profile name" />
        ${p.isActive ? '<span class="jp-active-badge">Active</span>' : ''}
        <div class="jp-card-actions">
          ${!p.isActive ? `<button class="jp-btn jp-btn-activate" data-idx="${i}" data-action="activate">Set active</button>` : ''}
          <button class="jp-btn jp-btn-delete" data-idx="${i}" data-action="delete">✕</button>
        </div>
      </div>
      <div class="jp-fields">
        <div class="jp-field">
          <label>Target role</label>
          <input type="text" class="jp-label-input" style="font-weight:400" data-field="role" data-idx="${i}" value="${p.role || ''}" placeholder="e.g. Backend Engineer" />
        </div>
        <div class="jp-field">
          <label>Skills</label>
          <div class="chip-input" id="jp-skills-${i}" style="min-height:32px"></div>
          <input type="text" class="jp-chip-input" id="jp-skills-input-${i}" placeholder="Type skill + Enter" />
        </div>
        <div class="jp-field">
          <label>Cities</label>
          <div class="chip-input" id="jp-cities-${i}" style="min-height:32px"></div>
          <input type="text" class="jp-chip-input" id="jp-cities-input-${i}" placeholder="Type city + Enter" />
        </div>
      </div>
    </div>
  `).join('');

  // populate chips & bind inputs
  _jobProfiles.forEach((p, i) => {
    renderChips(`jp-skills-${i}`, p.skills || []);
    renderChips(`jp-cities-${i}`, p.cities || []);
    bindChipInput(`jp-skills-input-${i}`, `jp-skills-${i}`, SKILLS);
    bindChipInput(`jp-cities-input-${i}`, `jp-cities-${i}`, INDIAN_CITIES);
  });

  // header label changes
  container.querySelectorAll('.jp-label-input').forEach(input => {
    input.addEventListener('input', () => {
      const i = +input.dataset.idx;
      const field = input.dataset.field;
      if (_jobProfiles[i]) _jobProfiles[i][field] = input.value;
    });
  });

  // action buttons
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = +btn.dataset.idx;
      const action = btn.dataset.action;
      const p = _jobProfiles[i];
      if (!p) return;

      if (action === 'delete') {
        if (_jobProfiles.length === 1) { showToast('Keep at least one profile'); return; }
        if (!confirm(`Delete "${p.label}"?`)) return;
        try {
          const updated = await api(`/users/me/job-profiles/${p._id}`, { method: 'DELETE' });
          renderJobProfiles(updated);
        } catch(e) { showToast('Delete failed'); }
      }

      if (action === 'activate') {
        try {
          const updated = await api(`/users/me/job-profiles/${p._id}`, { method: 'PATCH', body: JSON.stringify({ isActive: true }) });
          renderJobProfiles(updated);
          showToast(`"${p.label}" is now active`);
        } catch(e) { showToast('Failed'); }
      }
    });
  });
}

// collect edits from job profile cards before saving
function collectJobProfiles() {
  return _jobProfiles.map((p, i) => ({
    ...p,
    label: document.querySelector(`.jp-label-input[data-idx="${i}"][data-field="label"]`)?.value || p.label,
    role: document.querySelector(`.jp-label-input[data-idx="${i}"][data-field="role"]`)?.value
      || document.querySelector(`input[data-field="role"][data-idx="${i}"]`)?.value || p.role,
    skills: chipValues(`jp-skills-${i}`),
    cities: chipValues(`jp-cities-${i}`)
  }));
}

document.getElementById('jp-add')?.addEventListener('click', async () => {
  try {
    const updated = await api('/users/me/job-profiles', { method: 'POST', body: JSON.stringify({ label: 'New Profile', role: '', skills: [], cities: [] }) });
    renderJobProfiles(updated);
  } catch(e) { showToast('Failed to add profile'); }
});

// ── Resume stored file panel ──
function showStoredResume(resumeFile) {
  const panel = document.getElementById('resume-stored');
  const nameEl = document.getElementById('resume-stored-name');
  const metaEl = document.getElementById('resume-stored-meta');
  const previewBtn = document.getElementById('resume-preview-btn');
  const downloadBtn = document.getElementById('resume-download-btn');
  const dropLabel = document.getElementById('resume-drop-label');

  if (!resumeFile?.storedName) {
    if (panel) panel.style.display = 'none';
    return;
  }

  if (nameEl) nameEl.textContent = resumeFile.originalName || resumeFile.storedName;
  if (metaEl) {
    const kb = resumeFile.size ? Math.round(resumeFile.size / 1024) + ' KB · ' : '';
    const date = resumeFile.uploadedAt ? new Date(resumeFile.uploadedAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '';
    metaEl.textContent = kb + date;
  }

  const token = getToken();
  if (previewBtn) previewBtn.href = `${API}/users/me/resume/preview?t=${token}`;
  if (downloadBtn) downloadBtn.href = `${API}/users/me/resume/download?t=${token}`;

  if (panel) panel.style.display = 'flex';
  if (dropLabel) dropLabel.innerHTML = 'Replace with a new file, or <label for="resume-file" class="resume-browse">browse</label>';
}
async function parseResumeFile(file) {
  const fd = new FormData();
  fd.append('resume', file);
  const res = await fetch(API + '/users/parse-resume', { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Parse failed');
  return res.json();
}

function applyResumeToProfile(data, mode) {
  // mode: 'replace' | 'merge'
  if (mode === 'replace') {
    if (data.name) { const el = document.getElementById('prof-name'); if (el) el.value = data.name; }
    // replace all profiles' skills with parsed, or seed a new profile
    if (data.skills?.length || data.role) {
      const active = _jobProfiles.findIndex(p => p.isActive);
      const idx = active >= 0 ? active : 0;
      if (_jobProfiles[idx]) {
        if (data.role) _jobProfiles[idx].role = data.role;
        if (data.skills?.length) renderChips(`jp-skills-${idx}`, data.skills);
        if (data.cities?.length) renderChips(`jp-cities-${idx}`, data.cities);
        // refresh label input
        const roleInput = document.querySelector(`input[data-field="role"][data-idx="${idx}"]`);
        if (roleInput && data.role) roleInput.value = data.role;
      }
    }
  } else { // merge — only add new skills to active profile
    const active = _jobProfiles.findIndex(p => p.isActive);
    const idx = active >= 0 ? active : 0;
    if (_jobProfiles[idx] && data.skills?.length) {
      const existing = chipValues(`jp-skills-${idx}`);
      const merged = [...new Set([...existing, ...data.skills])];
      renderChips(`jp-skills-${idx}`, merged);
    }
  }
}

// Profile page resume drop zone
(function() {
  const drop = document.getElementById('resume-drop');
  const fileInput = document.getElementById('resume-file');
  const status = document.getElementById('resume-status');
  const conflict = document.getElementById('resume-conflict');
  if (!drop || !fileInput) return;

  async function handleFile(file) {
    if (!file) return;
    status.textContent = 'Parsing résumé…';
    drop.classList.remove('uploaded');
    if (conflict) conflict.style.display = 'none';
    try {
      const data = await parseResumeFile(file);
      _parsedResume = data;

      // save resume text always
      if (getToken()) {
        const fd = new FormData(); fd.append('resume', file);
        fetch(API + '/users/me/resume', { method: 'POST', headers: { Authorization: 'Bearer ' + getToken() }, body: fd })
          .then(r => r.json())
          .then(d => { if (d.resumeFile) showStoredResume(d.resumeFile); })
          .catch(() => {});
      }

      // check if profile already has meaningful data
      const hasData = _jobProfiles.some(p => (p.skills && p.skills.length > 0) || p.role);
      if (hasData) {
        // show conflict banner
        drop.classList.add('uploaded');
        status.textContent = `✓ Résumé parsed — choose how to apply it below`;
        if (conflict) conflict.style.display = '';
      } else {
        // fresh profile — apply immediately
        applyResumeToProfile(data, 'replace');
        drop.classList.add('uploaded');
        status.textContent = `✓ Auto-filled: ${data.name || ''}${data.role ? ' · ' + data.role : ''}`;
      }
    } catch(e) { status.textContent = '✗ Could not parse résumé — fill in manually'; }
  }

  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
  drop.addEventListener('click', e => { if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT') fileInput.click(); });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); });

  // conflict resolution buttons
  document.getElementById('rc-replace')?.addEventListener('click', () => {
    if (_parsedResume) applyResumeToProfile(_parsedResume, 'replace');
    if (conflict) conflict.style.display = 'none';
    showToast('Profile replaced from résumé');
    _parsedResume = null;
  });
  document.getElementById('rc-merge')?.addEventListener('click', () => {
    if (_parsedResume) applyResumeToProfile(_parsedResume, 'merge');
    if (conflict) conflict.style.display = 'none';
    showToast('Skills merged from résumé');
    _parsedResume = null;
  });
  document.getElementById('rc-cancel')?.addEventListener('click', () => {
    if (conflict) conflict.style.display = 'none';
    _parsedResume = null;
    document.getElementById('resume-status').textContent = 'Upload cancelled';
  });
})();

// Registration page resume upload
(function() {
  const zone = document.getElementById('reg-resume-zone');
  const fileInput = document.getElementById('reg-resume-file');
  const status = document.getElementById('reg-resume-status');
  if (!zone || !fileInput) return;

  async function handleFile(file) {
    if (!file) return;
    status.textContent = 'Parsing résumé…';
    zone.classList.remove('uploaded');
    try {
      const data = await parseResumeFile(file);
      if (data.name) { const el = document.getElementById('reg-name'); if (el) el.value = data.name; }
      if (data.email) { const el = document.getElementById('reg-email'); if (el) el.value = data.email; }
      if (data.role) { const el = document.getElementById('reg-role'); if (el) el.value = data.role; }
      zone.classList.add('uploaded');
      status.textContent = `✓ Auto-filled from résumé`;
      window._resumeParsed = data;
      window._resumeFile = file;
    } catch(e) { status.textContent = '✗ Could not parse — fill in manually'; }
  }

  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
  zone.addEventListener('click', e => { if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT' && !e.target.classList.contains('reg-resume-btn')) fileInput.click(); });
  document.querySelector('label[for="reg-resume-file"]')?.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); });
})();
const PORTALS = ['naukri','shine','linkedin','indeed','hirist'];
function renderPortalCreds(portals) {
  const container = document.getElementById('portal-creds'); if (!container) return;
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

async function loadDashboard() {
  if (!await ensureAuth()) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  try {
    const [user, apps] = await Promise.all([api('/users/me'), api('/applications')]);

    // ── Greeting & date ──
    const name = user.name || user.email.split('@')[0];
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const el = document.getElementById('db-greeting');
    if (el) el.innerHTML = `${greet}, ${name} <span>👋</span>`;
    const dateEl = document.getElementById('db-date');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' }).toUpperCase();

    // ── Sidebar card ──
    const avatar = document.querySelector('.avatar');
    const profileName = document.querySelector('.profile-card strong');
    const profileSmall = document.querySelector('.profile-card small');
    const progressSpan = document.querySelector('.profile-card .progress span');
    if (avatar) avatar.textContent = name.slice(0,2).toUpperCase();
    if (profileName) profileName.textContent = name;
    const profiles = user.jobProfiles || [];
    const hasResume = !!user.resumeText;
    const pct = Math.min(100, (profiles.length ? 30 : 0) + (hasResume ? 30 : 0) + (user.name ? 20 : 0) + (Object.values(user.portals||{}).some(p=>p.email) ? 20 : 0));
    if (profileSmall) profileSmall.textContent = 'Profile ' + pct + '% complete';
    if (progressSpan) progressSpan.style.width = pct + '%';

    // ── KPIs ──
    const applied   = apps.length;
    const interviews= apps.filter(a => a.status === 'interview').length;
    const offers    = apps.filter(a => a.status === 'offer').length;
    const rejected  = apps.filter(a => a.status === 'rejected').length;
    const emailSent = apps.filter(a => a.emailSent).length;
    set('stat-matches', 0);
    set('stat-applied', applied);
    set('stat-interviews', interviews);
    set('stat-offers', offers);
    set('stat-emails', emailSent);

    // ── Auto-apply card ──
    const settings = user.settings || {};
    set('auto-status', settings.autoApply ? 'ON' : 'OFF');
    document.getElementById('auto-status')?.style && (document.getElementById('auto-status').style.color = settings.autoApply ? '#638e71' : '#d96e61');
    set('auto-cap', settings.dailyCap || 0);
    set('auto-min', settings.minMatch || 0);
    const avg = apps.length ? Math.round(apps.reduce((s,a)=>s+(a.matchScore||0),0)/apps.length) : 0;
    set('auto-avg', avg);
    // only render portal rows once — re-renders would stack event listeners
    if (!document.getElementById('aa-portals')?.dataset.rendered) {
      await renderAutoApplyPortals(user);
      const c = document.getElementById('aa-portals');
      if (c) c.dataset.rendered = '1';
    }

    // ── Bar chart: last 14 days ──
    (function renderBarChart() {
      const svg = document.getElementById('db-bar-chart');
      const labelsEl = document.getElementById('db-chart-labels');
      if (!svg || !labelsEl) return;
      const days = 14;
      const buckets = Array.from({length: days}, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (days - 1 - i)); d.setHours(0,0,0,0); return d;
      });
      const counts = buckets.map(day => {
        const next = new Date(day); next.setDate(next.getDate() + 1);
        return apps.filter(a => { const t = new Date(a.appliedAt); return t >= day && t < next; }).length;
      });
      const maxVal = Math.max(...counts, 1);
      const W = 700, H = 120, pad = 8, barW = Math.floor((W - pad * (days + 1)) / days);
      const bars = counts.map((c, i) => {
        const bh = Math.max(4, Math.round((c / maxVal) * (H - 20)));
        const x = pad + i * (barW + pad);
        const y = H - bh;
        return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="${c > 0 ? '#638e71' : '#e8ede7'}" opacity="${c > 0 ? 1 : 0.5}">
          <title>${c} application${c !== 1 ? 's' : ''}</title></rect>`;
      }).join('');
      svg.innerHTML = bars;
      labelsEl.innerHTML = buckets.map((d, i) => {
        const lbl = i === 0 || d.getDate() === 1 || i % 2 === 0
          ? `<span>${d.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>`
          : '<span></span>';
        return lbl;
      }).join('');
      set('db-total-badge', applied + ' total');
    })();

    // ── Funnel ──
    (function renderFunnel() {
      const base = applied || 1;
      const stages = [
        { id:'applied',   n: applied,    color:'#638e71' },
        { id:'interview', n: interviews, color:'#7b6fd4' },
        { id:'offer',     n: offers,     color:'#d9a94c' },
        { id:'rejected',  n: rejected,   color:'#d96e61' }
      ];
      stages.forEach(s => {
        const bar = document.getElementById(`fn-${s.id}-bar`);
        const val = document.getElementById(`fn-${s.id}-n`);
        if (bar) { bar.style.width = Math.round((s.n / base) * 100) + '%'; bar.style.background = s.color; }
        if (val) val.textContent = s.n;
      });
    })();

    // ── Roles targeting ──
    (function renderRoles() {
      const el = document.getElementById('db-roles-list');
      if (!el) return;
      if (!profiles.length) { el.innerHTML = '<p class="db-empty">No job profiles yet — <button class="link-button" data-page="profile" data-action="nav-page">add one</button></p>'; wireNavBtns(); return; }
      // count apps per role (match by role name in job title)
      el.innerHTML = profiles.map(p => {
        const roleApps = apps.filter(a => a.job?.title && p.role && a.job.title.toLowerCase().includes(p.role.toLowerCase().split(' ')[0]));
        return `<div class="db-role-row">
          <div class="db-role-row-left">
            <span class="db-role-name">${p.label || p.role || 'Untitled'}</span>
            <span class="db-role-skills">${(p.skills || []).slice(0,4).join(' · ') || '—'}</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            ${p.isActive ? '<span class="db-role-active">Active</span>' : ''}
            <span class="db-role-count">${roleApps.length} apps</span>
          </div>
        </div>`;
      }).join('');
      wireNavBtns();
    })();

    // ── Portal breakdown ──
    (function renderPortals() {
      const el = document.getElementById('db-portal-breakdown');
      if (!el) return;
      const byPortal = {};
      apps.forEach(a => { const p = (a.portal || a.job?.portal || 'other').toLowerCase(); byPortal[p] = (byPortal[p]||0)+1; });
      const sorted = Object.entries(byPortal).sort((a,b) => b[1]-a[1]);
      if (!sorted.length) { el.innerHTML = '<p class="db-empty">No applications yet.</p>'; return; }
      const max = sorted[0][1] || 1;
      el.innerHTML = sorted.map(([p, n]) => `
        <div class="db-portal-row">
          <span class="db-portal-name">${p}</span>
          <div class="db-portal-bar-wrap"><div class="db-portal-bar" style="width:${Math.round((n/max)*100)}%"></div></div>
          <span class="db-portal-val">${n}</span>
        </div>`).join('');
    })();

    // ── Portal × Role heatmap ──
    (function renderHeatmap() {
      const el = document.getElementById('db-heatmap');
      if (!el) return;
      if (!apps.length || !profiles.length) { el.innerHTML = '<p class="db-empty">Will populate once you have applications.</p>'; return; }
      const portals = [...new Set(apps.map(a => (a.portal || a.job?.portal || 'other').toLowerCase()))].sort();
      const table = document.createElement('table');
      table.className = 'db-heatmap-table';
      const thead = `<tr><th>Portal</th>${profiles.map(p=>`<th>${p.label||p.role||'Profile'}</th>`).join('')}<th>Total</th></tr>`;
      const rows = portals.map(portal => {
        const cells = profiles.map(p => {
          const n = apps.filter(a => {
            const ap = (a.portal || a.job?.portal || 'other').toLowerCase();
            return ap === portal && p.role && a.job?.title && a.job.title.toLowerCase().includes(p.role.toLowerCase().split(' ')[0]);
          }).length;
          const cls = n === 0 ? 'db-hm-0' : n < 3 ? 'db-hm-low' : n < 10 ? 'db-hm-mid' : 'db-hm-high';
          return `<td><span class="db-hm-cell ${cls}">${n||'—'}</span></td>`;
        }).join('');
        const total = apps.filter(a => (a.portal||a.job?.portal||'other').toLowerCase() === portal).length;
        return `<tr><td class="db-portal-name">${portal}</td>${cells}<td><strong>${total}</strong></td></tr>`;
      }).join('');
      table.innerHTML = `<thead>${thead}</thead><tbody>${rows}</tbody>`;
      el.innerHTML = '';
      el.appendChild(table);
    })();

    // ── Kanban tracker ──
    const kanban = document.querySelector('.kanban');
    if (kanban) {
      kanban.innerHTML = '';
      const cols = { saved:[], applied:[], interview:[], offer:[] };
      apps.forEach(a => {
        const key = a.status === 'rejected' ? 'applied' : (cols[a.status] ? a.status : 'applied');
        cols[key].push(a);
      });
      Object.entries(cols).forEach(([status, list]) => {
        const div = document.createElement('div');
        div.innerHTML = `<p class="column-title">${status.toUpperCase()} <span>${list.length}</span></p>` +
          (list.length ? list.map(a => `<article class="track-card ${status==='interview'?'interview':''}"><b>${a.job?.title||'Job'}</b><p>${a.job?.company||''}</p><small>${a.portal||''} · ${new Date(a.appliedAt).toLocaleDateString()}</small></article>`).join('') : '<div class="empty-card">No items</div>');
        kanban.appendChild(div);
      });
    }

  } catch (e) { console.error(e); }
}

// wire nav buttons inside dashboard (data-action="nav-page")
function wireNavBtns() {
  document.querySelectorAll('[data-action="nav-page"][data-page]').forEach(btn => {
    btn.addEventListener('click', e => { e.preventDefault(); showPage(btn.dataset.page); });
  });
}

// ── Page routing ──
const PAGES = { dashboard: '#dashboard', profile: '#profile-page' };
function showPage(name) {
  const dashboard = document.getElementById('dashboard');
  const profilePage = document.getElementById('profile-page');
  const navLinks = document.querySelectorAll('.side-nav a[data-page]');

  // hide all page sections
  if (dashboard) dashboard.style.display = 'none';
  if (profilePage) profilePage.style.display = 'none';

  // show target
  if (name === 'profile') {
    if (profilePage) profilePage.style.display = '';
  } else {
    if (dashboard) dashboard.style.display = '';
    // scroll to anchor within dashboard if needed
    const target = document.getElementById(name);
    if (target && name !== 'dashboard') target.scrollIntoView({ behavior: 'smooth' });
  }

  // update active nav link
  navLinks.forEach(a => {
    a.classList.toggle('active', a.dataset.page === name ||
      (name !== 'profile' && a.dataset.page === 'dashboard' && !['profile'].includes(name) && name === 'dashboard'));
  });
  navLinks.forEach(a => {
    if (a.dataset.page === name) a.classList.add('active');
    else a.classList.remove('active');
  });
}

document.querySelectorAll('.side-nav a[data-page]').forEach(a => {
  a.addEventListener('click', async e => {
    e.preventDefault();
    const page = a.dataset.page;
    if (page === 'profile') {
      try {
        const u = await api('/users/me'); // backend migrates legacy fields automatically
        document.querySelector('#prof-name').value = u.name || '';
        renderJobProfiles(u.jobProfiles || []);
        renderPortalCreds(u.portals || {});
        showStoredResume(u.resumeFile || null);
        const s = u.settings || {};
        document.querySelector('#prof-autoapply').checked = !!s.autoApply;
        document.querySelector('#prof-dailycap').value = s.dailyCap || 50;
        document.querySelector('#prof-minmatch').value = s.minMatch || 75;
      } catch(e) {}
    }
    showPage(page);
  });
});
document.querySelectorAll('.apply').forEach(button => button.addEventListener('click', () => {
  const m = document.querySelector('#application-modal'); if (m) { document.querySelector('#modal-job').textContent = button.dataset.job; m.showModal(); }
}));
document.querySelectorAll('.close').forEach(button => button.addEventListener('click', () => button.closest('dialog')?.close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); }));
document.querySelectorAll('[data-action="tailor-resume"]').forEach(b => b.addEventListener('click', () => { document.querySelector('#application-modal')?.close(); document.querySelector('#resume-modal')?.showModal(); }));
document.querySelector('[data-action="find-jobs"]')?.addEventListener('click', async () => {
  try {
    const jobs = await api('/jobs');
    const list = document.getElementById('match-list');
    if (list) {
      if (!jobs.length) { list.innerHTML = '<div class="empty-card">No matches yet — add jobs via the tracker.</div>'; return; }
      list.innerHTML = jobs.map(j => `<article class="job-card"><div class="company-logo amber">${(j.company||'?')[0]}</div><div class="job-info"><div class="title-line"><h3>${j.title}</h3><span class="match-score">${j.matchScore||0}% match</span></div><p>${j.company} · ${j.location||''}</p><div class="tags">${(j.skills||[]).map(s=>'<span>'+s+'</span>').join('')}</div></div><button class="apply" data-job="${j.title} at ${j.company}">Prepare application</button></article>`).join('');
      showToast(jobs.length + ' matches loaded.');
    }
  } catch(e){ showToast('Failed to load matches'); }
});
document.querySelector('[data-action="complete-profile"]')?.addEventListener('click', async () => {
  try {
    const u = await api('/users/me');
    document.querySelector('#prof-name').value = u.name || '';
    renderJobProfiles(u.jobProfiles || []);
    renderPortalCreds(u.portals || {});
    showStoredResume(u.resumeFile || null);
    const s = u.settings || {};
    document.querySelector('#prof-autoapply').checked = !!s.autoApply;
    document.querySelector('#prof-dailycap').value = s.dailyCap || 50;
    document.querySelector('#prof-minmatch').value = s.minMatch || 75;
  } catch(e){}
  showPage('profile');
});
document.querySelector('#prof-back')?.addEventListener('click', () => showPage('dashboard'));
document.querySelector('#prof-back-bottom')?.addEventListener('click', () => showPage('dashboard'));
async function doSaveProfile() {
  const portals = {};
  ['naukri','shine','linkedin','indeed','hirist'].forEach(p => {
    const cb = document.querySelector('#pc-' + p + '-cb');
    const email = document.querySelector('#pc-' + p + '-email')?.value.trim() || '';
    const pass = document.querySelector('#pc-' + p + '-pass')?.value || '';
    if (cb && cb.checked) portals[p] = { email, passwordEnc: pass };
    else portals[p] = { email: '', passwordEnc: '' };
  });

  // collect active profile's role/skills/cities for the legacy fields (used by matcher)
  const collected = collectJobProfiles();
  const active = collected.find(p => p.isActive) || collected[0];

  const body = {
    name: document.querySelector('#prof-name').value.trim(),
    role: active?.role || '',
    cities: active?.cities || [],
    skills: active?.skills || [],
    portals,
    settings: {
      autoApply: document.querySelector('#prof-autoapply').checked,
      dailyCap: parseInt(document.querySelector('#prof-dailycap').value) || 50,
      minMatch: parseInt(document.querySelector('#prof-minmatch').value) || 75
    }
  };

  try {
    // 1. save top-level user fields
    await api('/users/me', { method: 'PATCH', body: JSON.stringify(body) });

    // 2. patch each job profile that has an _id
    await Promise.all(collected.map(p => {
      if (!p._id) return Promise.resolve();
      return api(`/users/me/job-profiles/${p._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ label: p.label, role: p.role, skills: p.skills, cities: p.cities })
      });
    }));

    showToast('Profile saved.');
    showPage('dashboard');
    loadDashboard();
  } catch(e) { showToast('Save failed'); }
}
document.querySelector('#prof-save')?.addEventListener('click', doSaveProfile);
document.querySelector('#prof-save-bottom')?.addEventListener('click', doSaveProfile);
function logActivity(msg) {
  const log = document.getElementById('activity-log');
  if (!log) return;
  const line = document.createElement('div');
  line.textContent = new Date().toLocaleTimeString() + ' — ' + msg;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}
// ══════════════════════════════════════
//  AUTO-APPLY — per-portal system
// ══════════════════════════════════════

// Tracks active poll intervals per portal: { shine: intervalId, ... }
const _aaIntervals = {};
// Lightbox state
let _lbPortal = null;
let _lbInterval = null;

// ── Render per-portal rows ──
async function renderAutoApplyPortals(user) {
  const container = document.getElementById('aa-portals');
  if (!container) return;

  const portals = user?.portals || {};
  const enabled = Object.keys(portals).filter(p => portals[p]?.email);

  if (!enabled.length) {
    container.innerHTML = `<p class="aa-no-portal">No portals configured. <a data-page="profile" data-action="nav-page">Set up portals →</a></p>`;
    wireNavBtns();
    return;
  }

  container.innerHTML = enabled.map(p => `
    <div class="aa-portal-row" id="aa-row-${p}">
      <div class="aa-portal-header">
        <div>
          <div class="aa-portal-name">
            <span class="aa-portal-dot" id="aa-dot-${p}"></span>
            ${p.charAt(0).toUpperCase() + p.slice(1)}
          </div>
          <div class="aa-portal-status" id="aa-status-${p}">Idle</div>
        </div>
        <div class="aa-portal-actions">
          <button class="aa-view-btn" id="aa-view-${p}" disabled title="View live browser">👁 View</button>
          <button class="aa-log-btn" id="aa-log-${p}" title="Show log">📋 Log</button>
          <button class="aa-stop-btn" id="aa-stop-${p}" data-portal="${p}" style="display:none">◼ Stop</button>
          <button class="aa-start-btn" id="aa-btn-${p}" data-portal="${p}">▶ Start</button>
        </div>
      </div>
      <div id="aa-thumb-wrap-${p}" style="display:none">
        <div class="aa-thumb-wrap" id="aa-thumb-${p}-wrap">
          <img class="aa-thumb" id="aa-thumb-${p}" src="" alt="${p} screenshot" />
          <div class="aa-thumb-overlay">⤢ Full screen</div>
        </div>
      </div>
      <div id="aa-log-panel-${p}" class="aa-log-panel" style="display:none"></div>
    </div>
  `).join('');

  // wire buttons
  enabled.forEach(p => {
    document.getElementById(`aa-btn-${p}`)?.addEventListener('click', () => startPortalApply(p));
    document.getElementById(`aa-stop-${p}`)?.addEventListener('click', () => stopPortalApply(p));
    document.getElementById(`aa-view-${p}`)?.addEventListener('click', () => openLightbox(p));
    document.getElementById(`aa-thumb-${p}-wrap`)?.addEventListener('click', () => openLightbox(p));
    document.getElementById(`aa-log-${p}`)?.addEventListener('click', () => togglePortalLog(p));
  });

  wireNavBtns();

  // ── On load: restore last known state (NO polling — just visual) ──
  // Only resume polling if user explicitly started a run this session
  for (const p of enabled) {
    try {
      const sr = await fetch(`${API}/automation/status/${p}`, { headers: { Authorization: 'Bearer ' + getToken() } });
      if (!sr.ok) continue;
      const st = await sr.json();
      if (!st.step || st.step === 'idle' || st.stale) continue;

      // restore dot colour from last known state
      const dot = document.getElementById(`aa-dot-${p}`);
      if (dot) {
        if (st.step === 'Done') dot.className = 'aa-portal-dot done';
        else if (st.step?.startsWith('Error')) dot.className = 'aa-portal-dot error';
        // if still "Starting" / mid-run from a previous session, show as done (stale)
        else dot.className = 'aa-portal-dot done';
      }
      setPortalStatus(p, st.step === 'Done' ? 'Last run: completed' : st.step?.startsWith('Error') ? 'Last run: error' : 'Last run: ' + st.step);

      // load last screenshot thumbnail silently (no polling)
      const ir = await fetch(`${API}/automation/screenshot/${p}`, { headers: { Authorization: 'Bearer ' + getToken() } });
      if (ir.ok && ir.status !== 204) {
        const blob = await ir.blob();
        if (blob.size > 0) {
          const thumb = document.getElementById(`aa-thumb-${p}`);
          const thumbWrap = document.getElementById(`aa-thumb-wrap-${p}`);
          const viewBtn = document.getElementById(`aa-view-${p}`);
          if (thumb) thumb.src = URL.createObjectURL(blob);
          if (thumbWrap) thumbWrap.style.display = '';
          if (viewBtn) viewBtn.disabled = false;
        }
      }
    } catch(e) { /* portal has no history */ }
  }
}

// ── Show/hide start vs stop buttons ──
function setPortalRunning(portal, running) {
  const startBtn = document.getElementById(`aa-btn-${portal}`);
  const stopBtn  = document.getElementById(`aa-stop-${portal}`);
  const stopAll  = document.getElementById('aa-stop-all');
  if (startBtn) { startBtn.style.display = running ? 'none' : ''; startBtn.disabled = !running ? false : true; }
  if (stopBtn)  { stopBtn.style.display  = running ? '' : 'none'; }
  // show "Stop all" if any portal is running
  const anyRunning = Object.keys(_aaIntervals).length > 0;
  if (stopAll) stopAll.style.display = anyRunning ? '' : 'none';
}

// ── Start apply for one portal ──
async function startPortalApply(portal) {
  const btn    = document.getElementById(`aa-btn-${portal}`);
  const dot    = document.getElementById(`aa-dot-${portal}`);
  const viewBtn= document.getElementById(`aa-view-${portal}`);

  setPortalRunning(portal, true);
  if (dot) dot.className = 'aa-portal-dot running';
  setPortalStatus(portal, 'Starting…');
  logActivity(`[${portal}] Starting auto-apply…`);

  try {
    await api(`/automation/run/${portal}`, { method: 'POST' });
    showToast(`${portal} auto-apply started`);
    if (viewBtn) viewBtn.disabled = false;

    if (_aaIntervals[portal]) clearInterval(_aaIntervals[portal]);
    _aaNoScreenshot[portal] = 0;
    _aaIntervals[portal] = setInterval(() => pollPortal(portal), 1200);

    // hard stop after 2 min
    setTimeout(() => stopPortalApply(portal, true), 120000);

  } catch(e) {
    setPortalRunning(portal, false);
    if (dot) dot.className = 'aa-portal-dot error';
    setPortalStatus(portal, 'Failed: ' + e.message);
    showToast(`${portal} failed to start`);
  }
}

// ── Stop apply for one portal ──
async function stopPortalApply(portal, auto = false) {
  clearInterval(_aaIntervals[portal]);
  delete _aaIntervals[portal];

  const dot = document.getElementById(`aa-dot-${portal}`);
  setPortalRunning(portal, false);
  if (dot) dot.className = 'aa-portal-dot done';

  if (!auto) {
    // tell backend to kill the process
    try {
      await api(`/automation/stop/${portal}`, { method: 'POST' });
      setPortalStatus(portal, 'Stopped');
      showToast(`${portal} stopped`);
      logActivity(`[${portal}] Stopped by user`);
    } catch(e) {
      setPortalStatus(portal, 'Stop failed: ' + e.message);
    }
  } else {
    setPortalStatus(portal, 'Timed out (2 min limit)');
  }

  // close lightbox if open for this portal
  if (_lbPortal === portal) closeLightbox();
}

// ── Poll one portal ──
const _aaNoScreenshot = {}; // count consecutive 204s per portal
async function pollPortal(portal) {
  const btn     = document.getElementById(`aa-btn-${portal}`);
  const dot     = document.getElementById(`aa-dot-${portal}`);
  const viewBtn = document.getElementById(`aa-view-${portal}`);
  const thumbWrap = document.getElementById(`aa-thumb-wrap-${portal}`);
  const thumb   = document.getElementById(`aa-thumb-${portal}`);
  const logPanel= document.getElementById(`aa-log-panel-${portal}`);

  try {
    // status
    const sr = await fetch(`${API}/automation/status/${portal}`, { headers: { Authorization: 'Bearer ' + getToken() } });
    if (sr.ok) {
      const st = await sr.json();
      if (st.step && st.step !== 'idle') {
        setPortalStatus(portal, st.step + (st.error ? ' — ' + st.error : ''));
        // update open log panel
        if (logPanel && logPanel.style.display !== 'none') {
          fetch(`${API}/automation/log/${portal}`, { headers: { Authorization: 'Bearer ' + getToken() } })
            .then(r => r.json()).then(d => {
              if (d.lines?.length) { logPanel.innerHTML = d.lines.map(l=>`<div>${l}</div>`).join(''); logPanel.scrollTop = logPanel.scrollHeight; }
            }).catch(()=>{});
        }
        if (st.step === 'Done' || st.step === 'Stopped' || st.step?.startsWith('Error')) {
          clearInterval(_aaIntervals[portal]);
          delete _aaIntervals[portal];
          setPortalRunning(portal, false);
          if (dot) dot.className = st.step === 'Done' ? 'aa-portal-dot done' : st.step === 'Stopped' ? 'aa-portal-dot' : 'aa-portal-dot error';
          if (_lbPortal === portal) closeLightbox();
        }
      }
    }

    // screenshot
    const ir = await fetch(`${API}/automation/screenshot/${portal}`, { headers: { Authorization: 'Bearer ' + getToken() } });
    if (ir.status === 204) {
      _aaNoScreenshot[portal] = (_aaNoScreenshot[portal] || 0) + 1;
      // after 10 consecutive 204s (~12s), slow poll to every 5s
      if (_aaNoScreenshot[portal] === 10) {
        clearInterval(_aaIntervals[portal]);
        _aaIntervals[portal] = setInterval(() => pollPortal(portal), 5000);
        setPortalStatus(portal, 'Worker starting — waiting for first screenshot…');
      }
    } else if (ir.ok) {
      _aaNoScreenshot[portal] = 0;
      const blob = await ir.blob();
      if (blob.size > 0) {
        const url = URL.createObjectURL(blob);
        if (thumb) thumb.src = url;
        if (thumbWrap) thumbWrap.style.display = '';
        if (viewBtn) viewBtn.disabled = false;
        if (_lbPortal === portal) {
          const lbImg = document.getElementById('aa-lb-img');
          if (lbImg) lbImg.src = url;
        }
      }
    }
  } catch(e) {}
}

function setPortalStatus(portal, text) {
  const el = document.getElementById(`aa-status-${portal}`);
  if (el) el.textContent = text;
}

// ── Toggle log panel ──
async function togglePortalLog(portal) {
  const panel = document.getElementById(`aa-log-panel-${portal}`);
  if (!panel) return;
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  panel.style.display = '';
  panel.textContent = 'Loading log…';
  try {
    const r = await fetch(`${API}/automation/log/${portal}`, { headers: { Authorization: 'Bearer ' + getToken() } });
    const data = await r.json();
    if (!data.lines?.length) { panel.textContent = 'No log yet — start auto-apply first.'; return; }
    panel.innerHTML = data.lines.map(l => `<div>${l}</div>`).join('');
    panel.scrollTop = panel.scrollHeight;
  } catch(e) { panel.textContent = 'Failed to load log: ' + e.message; }
}

// ── Lightbox open/close ──
function openLightbox(portal) {
  _lbPortal = portal;
  const lb = document.getElementById('aa-lightbox');
  const lbImg = document.getElementById('aa-lb-img');
  const lbTitle = document.getElementById('aa-lb-title');
  const lbStatus = document.getElementById('aa-lb-status');
  if (!lb) return;

  if (lbTitle) lbTitle.textContent = `Auto-Apply — ${portal.charAt(0).toUpperCase() + portal.slice(1)} — Live View`;

  // show current thumb immediately
  const thumb = document.getElementById(`aa-thumb-${portal}`);
  if (lbImg && thumb?.src) lbImg.src = thumb.src;

  lb.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // fast poll while lightbox is open
  if (_lbInterval) clearInterval(_lbInterval);
  _lbInterval = setInterval(async () => {
    try {
      const ir = await fetch(`${API}/automation/screenshot/${portal}`, { headers: { Authorization: 'Bearer ' + getToken() } });
      if (ir.ok && ir.status !== 204) {
        const blob = await ir.blob();
        if (blob.size > 0 && lbImg) lbImg.src = URL.createObjectURL(blob);
      }
      const sr = await fetch(`${API}/automation/status/${portal}`, { headers: { Authorization: 'Bearer ' + getToken() } });
      if (sr.ok && lbStatus) {
        const st = await sr.json();
        lbStatus.textContent = st.step || '';
      }
    } catch(e) {}
  }, 600);
}

function closeLightbox() {
  _lbPortal = null;
  if (_lbInterval) { clearInterval(_lbInterval); _lbInterval = null; }
  const lb = document.getElementById('aa-lightbox');
  if (lb) lb.style.display = 'none';
  document.body.style.overflow = '';
}

document.getElementById('aa-lb-close')?.addEventListener('click', closeLightbox);
document.getElementById('aa-lightbox')?.addEventListener('click', e => { if (e.target.id === 'aa-lightbox') closeLightbox(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && _lbPortal) closeLightbox(); });

// "Stop All" button
document.getElementById('aa-stop-all')?.addEventListener('click', async () => {
  const btn = document.getElementById('aa-stop-all');
  if (btn) { btn.disabled = true; btn.textContent = 'Stopping…'; }
  try {
    const r = await api('/automation/stop', { method: 'POST' });
    // stop all local intervals and reset all portal UIs
    Object.keys(_aaIntervals).forEach(p => {
      clearInterval(_aaIntervals[p]);
      delete _aaIntervals[p];
      setPortalRunning(p, false);
      setPortalStatus(p, 'Stopped');
      const dot = document.getElementById(`aa-dot-${p}`);
      if (dot) dot.className = 'aa-portal-dot';
    });
    if (_lbPortal) closeLightbox();
    showToast(`Stopped ${r.count || 'all'} portal${r.count !== 1 ? 's' : ''}`);
    logActivity('All portals stopped by user');
  } catch(e) { showToast('Stop failed: ' + e.message); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '◼ Stop all'; } }
});

// Hero "Start Auto-Apply" button — runs all enabled portals
document.querySelector('#start-autoapply')?.addEventListener('click', async () => {
  const btn = document.querySelector('#start-autoapply');
  if (btn) { btn.disabled = true; btn.textContent = 'Starting…'; }
  try {
    const r = await api('/automation/run', { method: 'POST' });
    showToast('Auto-apply started for: ' + (r.portals || []).join(', '));
    logActivity('Auto-apply started for: ' + (r.portals || []).join(', '));
    // kick off polling for each portal
    (r.portals || []).forEach(p => {
      if (_aaIntervals[p]) clearInterval(_aaIntervals[p]);
      _aaIntervals[p] = setInterval(() => pollPortal(p), 1200);
      const dot = document.getElementById(`aa-dot-${p}`);
      if (dot) dot.className = 'aa-portal-dot running';
      setPortalRunning(p, true);
      const viewBtn = document.getElementById(`aa-view-${p}`);
      if (viewBtn) viewBtn.disabled = false;
      setTimeout(() => stopPortalApply(p, true), 120000);
    });
  } catch(e) {
    showToast('Failed to start: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Start Auto-Apply <span>→</span>'; }
  }
});

document.querySelector('[data-action="add-application"]')?.addEventListener('click', () => showToast('Add an application from any job link.'));
document.querySelector('#generate-resume')?.addEventListener('click', () => { document.querySelector('#resume-modal')?.close(); showToast('Tailored résumé draft ready.'); });
document.querySelectorAll('.save').forEach(b => b.addEventListener('click', () => { b.textContent='♥'; b.style.color='#d96e61'; showToast('Job saved.'); }));
document.querySelector('#logout-btn')?.addEventListener('click', () => {
  if (!confirm('Log out?')) return;
  clearToken();
  const shell = document.querySelector('.app-shell'); if (shell) shell.style.display = 'none';
  const lp = document.querySelector('#login-page'); if (lp) lp.style.display = 'flex';
  showToast('Logged out.');
});

if (!getToken()) { const s = document.querySelector('.app-shell'); if (s) s.style.display = 'none'; }
else { const lp = document.querySelector('#login-page'); if (lp) lp.style.display = 'none'; const rp = document.querySelector('#register-page'); if (rp) rp.style.display = 'none'; }
async function loadAdmin() {
  try {
    const data = await api('/admin/users');
    const count = document.getElementById('admin-count');
    if (count) count.textContent = data.count;
    const navCount = document.getElementById('admin-nav-count');
    if (navCount) navCount.textContent = data.count;
    const list = document.getElementById('admin-users');
    if (list) {
      list.innerHTML = data.users.map(u => '<div class="admin-row"><span>' + (u.name||u.email) + ' (' + u.email + ')</span><button class="del-user" data-id="' + u._id + '">Delete</button></div>').join('');
      list.querySelectorAll('.del-user').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this user?')) return;
        try { await api('/admin/users/' + b.dataset.id, { method:'DELETE' }); showToast('Deleted'); loadAdmin(); }
        catch(e){ showToast(e.message); }
      }));
    }
  } catch(e) { /* not admin */ }
}
document.querySelector('#refresh-admin')?.addEventListener('click', loadAdmin);

loadDashboard().then(() => { const s = document.querySelector('.app-shell'); if (s && getToken()) s.style.display = ''; showPage('dashboard'); loadAdmin(); });
