const express = require('express');
const auth = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function portalFile(portal, type) {
  const names = { status: `status-${portal}.json`, screenshot: `latest-${portal}.png`, pid: `pid-${portal}.txt` };
  return path.join(SCREENSHOT_DIR, names[type]);
}

function spawnWorker(portal, creds, user) {
  const { spawn } = require('child_process');

  // pick the active job profile for role/skills
  const profiles  = user?.jobProfiles || [];
  const active    = profiles.find(p => p.isActive) || profiles[0];
  const role      = active?.role || user?.role || 'Software Engineer';
  const skills    = (active?.skills || user?.skills || []).join(',') || 'javascript,react,node,python,java';
  const settings  = user?.settings || {};
  const minMatch  = settings.minMatch || 60;
  const dailyCap  = settings.dailyCap || 20;

  // log file per portal (not shared)
  const logFile = path.join(SCREENSHOT_DIR, `log-${portal}.txt`);

  const worker = spawn('node', [path.join(__dirname, '..', 'workers', 'autoApply.js')], {
    detached: true, stdio: 'ignore',
    env: {
      ...process.env,
      PORTALS:          portal,
      PORTAL_EMAIL:     creds?.email        || '',
      PORTAL_PASS:      creds?.passwordEnc  || '',
      ROLE:             role,
      SKILLS:           skills,
      MIN_MATCH:        String(minMatch),
      DAILY_CAP:        String(dailyCap),
      USER_DATA_DIR:    path.join(__dirname, '..', 'browser-profile', portal),
      SCREENSHOT_DIR,
      STATUS_FILE:      portalFile(portal, 'status'),
      SCREENSHOT_FILE:  portalFile(portal, 'screenshot'),
      LOG_FILE:         logFile
    }
  });
  if (worker.pid) fs.writeFileSync(portalFile(portal, 'pid'), String(worker.pid));
  worker.unref();
  fs.writeFileSync(portalFile(portal, 'status'), JSON.stringify({ step: 'Starting...', error: null, ts: Date.now(), portal, pid: worker.pid }));
  return worker.pid;
}

// ── Run single portal ──
router.post('/run/:portal', auth, async (req, res) => {
  const portal = req.params.portal.toLowerCase();
  const User = require('../models/User');
  const u = await User.findById(req.user.id);
  const creds = u?.portals?.[portal];
  if (!creds?.email) return res.status(400).json({ error: 'Portal not configured — add credentials in Profile' });
  const pid = spawnWorker(portal, creds, u);
  res.json({ started: true, portal, pid });
});

// ── Run ALL enabled portals ──
router.post('/run', auth, async (req, res) => {
  const User = require('../models/User');
  const u = await User.findById(req.user.id);
  const enabled = Object.keys(u?.portals || {}).filter(p => u.portals[p]?.email);
  const portals = enabled.length ? enabled : ['shine'];
  const result = {};
  for (const portal of portals) {
    result[portal] = spawnWorker(portal, u.portals[portal] || {}, u);
  }
  res.json({ started: true, portals: Object.keys(result), pids: result });
});

// ── Stop single portal ──
router.post('/stop/:portal', auth, (req, res) => {
  const portal = req.params.portal.toLowerCase();
  const pidFile = portalFile(portal, 'pid');
  let killed = false;
  if (fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
    if (pid) {
      try { process.kill(-pid, 'SIGKILL'); killed = true; }
      catch(e) { try { process.kill(pid, 'SIGKILL'); killed = true; } catch(e2) {} }
    }
    try { fs.unlinkSync(pidFile); } catch(e) {}
  }
  fs.writeFileSync(portalFile(portal, 'status'), JSON.stringify({ step: 'Stopped', error: null, ts: Date.now(), portal }));
  res.json({ stopped: true, portal, killed });
});

// ── Stop ALL portals ──
router.post('/stop', auth, (req, res) => {
  const files = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.startsWith('pid-') && f.endsWith('.txt'));
  const stopped = [];
  files.forEach(f => {
    const portal = f.replace('pid-', '').replace('.txt', '');
    const pid = parseInt(fs.readFileSync(path.join(SCREENSHOT_DIR, f), 'utf8').trim());
    if (pid) {
      try { process.kill(-pid, 'SIGKILL'); } catch(e) { try { process.kill(pid, 'SIGKILL'); } catch(e2) {} }
    }
    try { fs.unlinkSync(path.join(SCREENSHOT_DIR, f)); } catch(e) {}
    fs.writeFileSync(portalFile(portal, 'status'), JSON.stringify({ step: 'Stopped', error: null, ts: Date.now(), portal }));
    stopped.push(portal);
  });
  res.json({ stopped, count: stopped.length });
});

// ── Status single portal ──
router.get('/status/:portal', auth, (req, res) => {
  const p = portalFile(req.params.portal.toLowerCase(), 'status');
  if (!fs.existsSync(p)) return res.json({ step: 'idle', error: null, ts: 0 });
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const age = Date.now() - (data.ts || 0);
    const isTerminal = data.step === 'Done' || data.step === 'Stopped' || data.step?.startsWith('Error');
    if (age > 180000 && !isTerminal) {
      fs.unlinkSync(p);
      return res.json({ step: 'idle', error: null, ts: 0, stale: true });
    }
    return res.json(data);
  } catch(e) { return res.json({ step: 'unknown', error: e.message, ts: 0 }); }
});

// ── Status all portals ──
router.get('/status', auth, (req, res) => {
  const files = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.startsWith('status-') && f.endsWith('.json'));
  const result = {};
  files.forEach(f => {
    const portal = f.replace('status-', '').replace('.json', '');
    try { result[portal] = JSON.parse(fs.readFileSync(path.join(SCREENSHOT_DIR, f), 'utf8')); }
    catch(e) { result[portal] = { step: 'unknown' }; }
  });
  res.json(result);
});

// ── Screenshot single portal ──
router.get('/screenshot/:portal', auth, (req, res) => {
  const p = portalFile(req.params.portal.toLowerCase(), 'screenshot');
  if (!fs.existsSync(p)) return res.status(204).end();
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(p);
});

// ── Screenshot legacy ──
router.get('/screenshot', auth, (req, res) => {
  const p = path.join(SCREENSHOT_DIR, 'latest.png');
  if (!fs.existsSync(p)) return res.status(204).end();
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(p);
});

// ── Log file for a portal ──
router.get('/log/:portal', auth, (req, res) => {
  const portal = req.params.portal.toLowerCase();
  const logFile = path.join(SCREENSHOT_DIR, `log-${portal}.txt`);
  if (!fs.existsSync(logFile)) return res.json({ lines: [] });
  try {
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(-40); // last 40 lines
    res.json({ lines });
  } catch(e) { res.json({ lines: ['Error reading log: ' + e.message] }); }
});

module.exports = router;
