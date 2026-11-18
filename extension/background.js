// CareerPilot Extension — Background Service Worker v3
// Opens portals in tabs inside the EXISTING Chrome window.
// Content scripts (content-naukri.js etc.) do the actual login + apply work.

const API = 'http://localhost:4001/api';

// ── Sessions keyed by portal ──
// { portal: { tabId, token, settings, jobUrls, jobIndex, applied, skipped, lastLog, done } }
const _sessions = {};

// ── Defaults on install ──
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ enabled: false, applied: 0, skipped: 0, log: [] });
});

// ════════════════════════════════════════
//  MESSAGE HUB
// ════════════════════════════════════════
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case 'START':
      startSession(msg.portal, msg.token, msg.settings)
        .then(sendResponse);
      return true; // async

    case 'STOP':
      stopSession(msg.portal || null);
      sendResponse({ ok: true });
      break;

    case 'GET_STATUS':
      // return a serialisable snapshot (no circular refs)
      sendResponse({
        sessions: Object.fromEntries(
          Object.entries(_sessions).map(([p, s]) => [p, {
            tabId: s.tabId, applied: s.applied, skipped: s.skipped,
            lastLog: s.lastLog, done: s.done
          }])
        )
      });
      break;

    case 'JOB_FOUND':
      handleJobFound(msg, sender.tab);
      sendResponse({ ok: true });
      break;

    case 'APPLIED':
      handleApplied(msg, sender.tab);
      sendResponse({ ok: true });
      break;

    case 'SKIPPED':
      handleSkipped(msg, sender.tab);
      sendResponse({ ok: true });
      break;

    case 'PAGE_DONE':
      nextJob(portalOf(sender.tab));
      sendResponse({ ok: true });
      break;

    case 'LOG':
      addLog(msg.text, msg.portal || portalOf(sender.tab));
      sendResponse({ ok: true });
      break;

    case 'LOGIN_NEEDED':
      handleLoginNeeded(msg, sender.tab);
      sendResponse({ ok: true });
      break;

    case 'LOGIN_DONE':
      handleLoginDone(msg, sender.tab);
      sendResponse({ ok: true });
      break;
  }
});

// ════════════════════════════════════════
//  SESSION MANAGEMENT
// ════════════════════════════════════════
async function startSession(portal, token, settings) {
  if (_sessions[portal]) stopSession(portal);

  _sessions[portal] = {
    portal, token,
    settings: settings || {},
    tabId: null,
    jobUrls: [], jobIndex: 0,
    applied: 0, skipped: 0,
    lastLog: 'Opening ' + portal + '…',
    done: null,
    startedAt: Date.now()
  };

  // push skills/minMatch into storage so content scripts can read them
  chrome.storage.local.set({
    [`settings_${portal}`]: settings,
    minMatch: settings.minMatch || 75,
    skills: settings.skills || []
  });

  addLog(`Starting ${portal}`, portal);

  const url = searchUrl(portal, settings.role || 'Software Engineer');
  try {
    const tab = await chrome.tabs.create({ url, active: true });
    _sessions[portal].tabId = tab.id;
    addLog(`Tab opened (id=${tab.id})`, portal);
    return { ok: true, tabId: tab.id };
  } catch(e) {
    delete _sessions[portal];
    return { ok: false, error: e.message };
  }
}

function stopSession(portal) {
  if (portal) {
    const s = _sessions[portal];
    if (s?.tabId) chrome.tabs.remove(s.tabId).catch(() => {});
    if (s) s.done = 'stopped';
    addLog(`Session stopped: ${portal}`, portal);
    delete _sessions[portal];
  } else {
    Object.keys(_sessions).forEach(p => stopSession(p));
  }
}

// ── Map tab URL → portal name ──
function portalOf(tab) {
  if (!tab?.url) return null;
  if (tab.url.includes('naukri.com'))   return 'naukri';
  if (tab.url.includes('shine.com'))    return 'shine';
  if (tab.url.includes('hirist.com'))   return 'hirist';
  if (tab.url.includes('linkedin.com')) return 'linkedin';
  if (tab.url.includes('indeed.com'))   return 'indeed';
  return null;
}

// ════════════════════════════════════════
//  EVENT HANDLERS (from content scripts)
// ════════════════════════════════════════

// Content script found job list URLs on a listing page
function handleJobFound(msg, tab) {
  const portal = portalOf(tab);
  if (!portal || !_sessions[portal]) return;
  const s = _sessions[portal];
  s.jobUrls  = msg.urls || [];
  s.jobIndex = 0;
  addLog(`Found ${s.jobUrls.length} jobs on ${portal}`, portal);
  nextJob(portal);
}

// Content script successfully applied to a job
function handleApplied(msg, tab) {
  const portal = msg.portal || portalOf(tab);
  if (!portal || !_sessions[portal]) return;
  const s = _sessions[portal];
  s.applied++;
  const line = `✓ Applied (${s.applied}): "${msg.title}" @ ${msg.company}`;
  addLog(line, portal);
  s.lastLog = line;
  reportJobToBackend(msg, portal);
  setTimeout(() => nextJob(portal), 2500);
}

// Content script skipped a job (score too low)
function handleSkipped(msg, tab) {
  const portal = msg.portal || portalOf(tab);
  if (!portal || !_sessions[portal]) return;
  const s = _sessions[portal];
  s.skipped++;
  const line = `○ Skipped: "${msg.title}" (${msg.score}%)`;
  addLog(line, portal);
  s.lastLog = line;
  setTimeout(() => nextJob(portal), 800);
}

// Content script says it needs login credentials
function handleLoginNeeded(msg, tab) {
  const portal = msg.portal || portalOf(tab);
  if (!portal || !_sessions[portal]) return;
  const s = _sessions[portal];
  addLog(`Login needed on ${portal} — injecting credentials`, portal);
  s.lastLog = 'Logging in…';

  // inject the login script into the tab
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: injectLogin,
    args: [s.settings.email || '', s.settings.password || '', portal]
  }).catch(e => addLog(`Login inject failed: ${e.message}`, portal));
}

// Content script says login completed
function handleLoginDone(msg, tab) {
  const portal = msg.portal || portalOf(tab);
  if (!portal || !_sessions[portal]) return;
  const s = _sessions[portal];
  if (msg.success) {
    addLog(`Login successful on ${portal}`, portal);
    s.lastLog = 'Logged in ✓';
    // reload the search URL now that we're logged in
    const url = searchUrl(portal, s.settings.role || 'Software Engineer');
    chrome.tabs.update(tab.id, { url });
  } else {
    addLog(`Login FAILED on ${portal} — check credentials in Profile`, portal);
    s.lastLog = 'Login failed — check credentials in Profile';
    s.done = 'error';
    stopSession(portal);
  }
}

// ════════════════════════════════════════
//  JOB NAVIGATION
// ════════════════════════════════════════
function nextJob(portal) {
  if (!portal || !_sessions[portal]) return;
  const s = _sessions[portal];
  const { jobUrls, jobIndex, settings } = s;

  if (jobIndex >= jobUrls.length) {
    const line = `Done. Applied: ${s.applied}, Skipped: ${s.skipped}`;
    addLog(`${portal}: ${line}`, portal);
    s.lastLog = line;
    s.done = 'done';
    reportSessionToBackend(portal);
    stopSession(portal);
    return;
  }

  if (s.applied >= (settings.dailyCap || 20)) {
    addLog(`${portal}: daily cap reached`, portal);
    s.lastLog = `Daily cap (${settings.dailyCap}) reached`;
    s.done = 'done';
    stopSession(portal);
    return;
  }

  const url = jobUrls[jobIndex];
  s.jobIndex++;
  const line = `Opening job ${jobIndex + 1}/${jobUrls.length}`;
  addLog(`${portal}: ${line}`, portal);
  s.lastLog = line;

  if (s.tabId) {
    chrome.tabs.update(s.tabId, { url }).catch(() => {
      chrome.tabs.create({ url, active: true }).then(t => { s.tabId = t.id; });
    });
  } else {
    chrome.tabs.create({ url, active: true }).then(t => { s.tabId = t.id; });
  }
}

// ════════════════════════════════════════
//  LOGIN INJECTION (runs inside tab page)
// ════════════════════════════════════════
function injectLogin(email, password, portal) {
  // This runs in the context of the portal page
  async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function tryLogin() {
    // common selectors across portals
    const emailSels  = ['input[type="email"]', 'input[name="email"]', '#usernameField', 'input[placeholder*="email" i]', 'input[placeholder*="Email" i]'];
    const passSels   = ['input[type="password"]', '#passwordField'];
    const submitSels = ['button[type="submit"]', 'input[type="submit"]', 'button:contains("Login")', 'button:contains("Sign in")', '.loginButton'];

    let emailField, passField;
    for (const sel of emailSels) {
      emailField = document.querySelector(sel);
      if (emailField) break;
    }
    for (const sel of passSels) {
      passField = document.querySelector(sel);
      if (passField) break;
    }

    if (!emailField || !passField) {
      chrome.runtime.sendMessage({ type: 'LOGIN_DONE', portal, success: false });
      return;
    }

    emailField.focus();
    emailField.value = email;
    emailField.dispatchEvent(new Event('input', { bubbles: true }));
    emailField.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(400);

    passField.focus();
    passField.value = password;
    passField.dispatchEvent(new Event('input', { bubbles: true }));
    passField.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(400);

    // submit
    let submitted = false;
    for (const sel of submitSels) {
      const btn = document.querySelector(sel);
      if (btn) { btn.click(); submitted = true; break; }
    }
    if (!submitted) passField.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await wait(4000);

    // check if login succeeded
    const bodyText = document.body.innerText.toLowerCase();
    const success = /logout|sign out|my profile|my account|dashboard/i.test(bodyText) ||
                    !!document.querySelector('[class*="userProfile"],[class*="userName"],[class*="avatar"],[class*="loggedIn"]');
    chrome.runtime.sendMessage({ type: 'LOGIN_DONE', portal, success });
  }

  tryLogin().catch(() => chrome.runtime.sendMessage({ type: 'LOGIN_DONE', portal, success: false }));
}

// ════════════════════════════════════════
//  BACKEND REPORTING
// ════════════════════════════════════════
async function reportJobToBackend(job, portal) {
  const s = _sessions[portal];
  if (!s?.token) return;
  try {
    const jRes = await fetch(`${API}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token },
      body: JSON.stringify({
        title: job.title, company: job.company, location: job.location || '',
        portal, url: job.url, matchScore: job.score || 0
      })
    });
    const jData = await jRes.json();
    await fetch(`${API}/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token },
      body: JSON.stringify({ jobId: jData._id, portal, matchScore: job.score || 0 })
    });
  } catch(e) { console.error('reportJob failed', e); }
}

async function reportSessionToBackend(portal) {
  const s = _sessions[portal];
  addLog(`${portal} session complete. Applied: ${s?.applied}`, portal);
}

// ════════════════════════════════════════
//  LOGGING
// ════════════════════════════════════════
function addLog(text, portal) {
  const line = new Date().toLocaleTimeString() + ' [' + (portal || 'bg') + '] ' + text;
  console.log('[CareerPilot]', line);
  if (portal && _sessions[portal]) _sessions[portal].lastLog = text;
  chrome.storage.local.get(['log'], d => {
    const log = (d.log || []).slice(-299);
    log.push(line);
    chrome.storage.local.set({ log });
  });
}

// ════════════════════════════════════════
//  SEARCH URLS
// ════════════════════════════════════════
function searchUrl(portal, role) {
  const q    = encodeURIComponent(role);
  const slug = role.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    naukri:   `https://www.naukri.com/${slug}-jobs`,
    shine:    `https://www.shine.com/job-search/${slug}-jobs`,
    hirist:   `https://www.hirist.com/search/?q=${q}`,
    linkedin: `https://www.linkedin.com/jobs/search/?keywords=${q}&f_AL=true`,
    indeed:   `https://www.indeed.com/jobs?q=${q}`
  }[portal] || `https://www.shine.com/job-search/${slug}-jobs`;
}
