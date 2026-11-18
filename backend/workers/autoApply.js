// CareerPilot — Auto-Apply Worker (Playwright)
// Reads env: PORTALS, PORTAL_EMAIL, PORTAL_PASS, ROLE, SKILLS, MIN_MATCH, DAILY_CAP
// Writes: STATUS_FILE (JSON), SCREENSHOT_FILE (PNG per portal), LOG_FILE (text)

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

// ── Config from env ──
const PORTALS       = (process.env.PORTALS || 'shine').split(',').map(s => s.trim()).filter(Boolean);
const EMAIL         = process.env.PORTAL_EMAIL || '';
const PASS          = process.env.PORTAL_PASS  || '';
const ROLE          = process.env.ROLE         || 'Software Engineer';
const SKILLS        = (process.env.SKILLS      || 'javascript,react,node,python,java').split(',').map(s => s.trim().toLowerCase());
const MIN_MATCH     = parseInt(process.env.MIN_MATCH  || '60');
const DAILY_CAP     = parseInt(process.env.DAILY_CAP  || '20');

const SCREENSHOT_DIR  = process.env.SCREENSHOT_DIR  || path.join(__dirname, '..', 'screenshots');
const USER_DATA_DIR   = process.env.USER_DATA_DIR   || path.join(__dirname, '..', 'browser-profile');
const STATUS_FILE     = process.env.STATUS_FILE     || path.join(SCREENSHOT_DIR, 'status.json');
const SCREENSHOT_FILE = process.env.SCREENSHOT_FILE || path.join(SCREENSHOT_DIR, 'latest.png');
const LOG_FILE        = STATUS_FILE.replace(/status-/, 'log-').replace('.json', '.txt');

[SCREENSHOT_DIR, USER_DATA_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Logging ──
function log(msg) {
  const line = new Date().toISOString() + ' ' + msg;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch(e) {}
}

function writeStatus(step, error) {
  log('STATUS: ' + step + (error ? ' | ' + error : ''));
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ step, error: error || null, ts: Date.now() }));
  } catch(e) {}
}

// ── Helpers ──
const delay = ms => new Promise(r => setTimeout(r, ms + Math.random() * 500));

async function snap(page) {
  try { await page.screenshot({ path: SCREENSHOT_FILE, timeout: 6000 }); } catch(e) {}
}

function matchScore(title) {
  const t = (title || '').toLowerCase();
  const hits = SKILLS.filter(s => t.includes(s)).length;
  return SKILLS.length ? Math.round((hits / SKILLS.length) * 100) : 50;
}

// ═══════════════════════════════════════════════
//  SHINE
// ═══════════════════════════════════════════════
async function runShine(page) {
  let applied = 0;

  // ── 1. Navigate ──
  writeStatus('Opening Shine…');
  await page.goto('https://www.shine.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(2000);
  await snap(page);

  // ── 2. Check login state ──
  const loggedIn = await isLoggedInShine(page);
  if (!loggedIn) {
    if (!EMAIL || !PASS) {
      writeStatus('Error: Shine credentials not configured — go to Profile → Portal Credentials');
      return;
    }
    writeStatus('Logging in to Shine…');
    const ok = await loginShine(page);
    if (!ok) { writeStatus('Error: Shine login failed — check credentials in Profile'); return; }
    writeStatus('Logged in to Shine ✓');
    await snap(page);
  } else {
    writeStatus('Already logged in to Shine ✓');
  }

  // ── 3. Search jobs ──
  writeStatus('Searching: ' + ROLE);
  const slug = ROLE.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await page.goto(`https://www.shine.com/job-search/${slug}-jobs`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(3000);
  await snap(page);

  // ── 4. Collect job links ──
  const jobLinks = await collectShineJobs(page);
  log(`Found ${jobLinks.length} job links on Shine`);
  if (!jobLinks.length) { writeStatus('No jobs found on Shine'); return; }

  // ── 5. Apply loop ──
  for (const url of jobLinks) {
    if (applied >= DAILY_CAP) { writeStatus(`Daily cap (${DAILY_CAP}) reached`); break; }

    writeStatus(`Opening job ${applied + 1}/${jobLinks.length}…`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(2500);
      await snap(page);

      const title = await getJobTitle(page, 'shine');
      const score = matchScore(title);
      log(`Job: "${title}" — score ${score}% (min ${MIN_MATCH}%)`);

      if (score < MIN_MATCH) {
        log(`Skipping: score too low`);
        writeStatus(`Skipped: "${title}" (${score}% < ${MIN_MATCH}%)`);
        continue;
      }

      // already applied?
      const alreadyApplied = await page.$('text=/already applied/i, .already-applied, [class*="alreadyApplied"]');
      if (alreadyApplied) { log('Already applied to this job'); continue; }

      // find apply button
      const applyBtn = await findApplyButton(page);
      if (!applyBtn) { log('No apply button — skipping'); continue; }

      writeStatus(`Applying: "${title}"…`);
      await applyBtn.click();
      await delay(3000);
      await snap(page);

      // handle login wall that may pop up after clicking apply
      const loginWall = await page.$('[class*="login"], [class*="signIn"], [id*="login"], [id*="signin"]');
      if (loginWall) {
        log('Login wall appeared — re-logging in');
        const ok = await loginShine(page);
        if (!ok) { writeStatus('Error: re-login failed'); return; }
        // retry apply
        const retryBtn = await findApplyButton(page);
        if (retryBtn) { await retryBtn.click(); await delay(3000); await snap(page); }
      }

      // confirm success
      const success = await confirmApply(page);
      if (success) {
        applied++;
        log(`✓ Applied (${applied}): "${title}"`);
        writeStatus(`Applied (${applied}): "${title}"`);
      } else {
        log(`⚠ Could not confirm application for "${title}" — may need manual steps`);
        writeStatus(`Uncertain: "${title}" — screenshot saved`);
      }

      await delay(2000);
    } catch(e) {
      log('Error on job: ' + e.message);
      await snap(page);
    }
  }

  writeStatus(`Done — ${applied} applied on Shine`);
  log(`Shine complete. Applied: ${applied}`);
}

async function isLoggedInShine(page) {
  try {
    // logged-in indicator: profile menu, user name, or avatar
    const indicator = await page.$('[class*="userProfile"], [class*="userName"], [class*="loggedIn"], .user-name, [data-test="user-name"]');
    if (indicator) return true;
    // check page text
    const content = await page.textContent('body').catch(() => '');
    return /sign out|logout|my profile/i.test(content);
  } catch(e) { return false; }
}

async function loginShine(page) {
  try {
    // go to login page
    await page.goto('https://www.shine.com/login/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await delay(2000);
    await snap(page);

    // email field
    const emailField = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    if (!emailField) { log('Shine: email field not found'); return false; }
    await emailField.click(); await delay(300);
    await emailField.fill(EMAIL);
    await delay(500);

    // password field
    const passField = await page.$('input[type="password"]');
    if (!passField) { log('Shine: password field not found'); return false; }
    await passField.click(); await delay(300);
    await passField.fill(PASS);
    await delay(500);
    await snap(page);

    // submit
    const submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
    if (submitBtn) { await submitBtn.click(); }
    else { await passField.press('Enter'); }

    await delay(4000);
    await snap(page);

    // verify login succeeded
    const loggedIn = await isLoggedInShine(page);
    if (!loggedIn) {
      // check for error message
      const errMsg = await page.$('[class*="error"], [class*="alert"]').then(el => el?.textContent()).catch(() => '');
      log('Shine login check failed. Error on page: ' + (errMsg || 'none'));
    }
    return loggedIn;
  } catch(e) {
    log('loginShine error: ' + e.message);
    return false;
  }
}

async function collectShineJobs(page) {
  // scroll a bit to load more
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 800);
    await delay(600);
  }
  await snap(page);

  const links = await page.$$eval(
    'a[href*="/jobs/"], a.position-title, .job-heading a, [class*="jobTitle"] a, h3 a',
    els => [...new Set(els.map(a => a.href).filter(h => h.includes('shine.com/jobs/')))]
  ).catch(() => []);
  return links.slice(0, DAILY_CAP);
}

async function getJobTitle(page, portal) {
  const selectors = {
    shine:    'h1.job-title, [class*="jobTitle"] h1, .jd-header h1, h1',
    naukri:   'h1.jd-header-title, [class*="jobTitle"] h1, h1',
    linkedin: '.job-details-jobs-unified-top-card__job-title h1, h1',
  };
  const sel = selectors[portal] || 'h1';
  try {
    return (await page.textContent(sel, { timeout: 3000 })).trim();
  } catch(e) {
    return (await page.title()).split('|')[0].trim();
  }
}

async function findApplyButton(page) {
  const selectors = [
    'button:has-text("Apply Now")',
    'button:has-text("Apply")',
    'a:has-text("Apply Now")',
    'a:has-text("Apply")',
    'button:has-text("Easy Apply")',
    '[class*="applyBtn"]',
    '[class*="apply-btn"]',
    '[data-test*="apply"]',
  ];
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) return el;
    } catch(e) {}
  }
  return null;
}

async function confirmApply(page) {
  // positive signals
  const successSelectors = [
    'text=/successfully applied/i',
    'text=/application submitted/i',
    'text=/applied successfully/i',
    'text=/thank you for applying/i',
    'text=/your application has been/i',
    '[class*="success"]',
    '[class*="thankYou"]',
    '[class*="applicationSuccess"]',
    '.application-success',
    '.success-message',
  ];
  for (const sel of successSelectors) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) return true;
    } catch(e) {}
  }

  // negative signals — login wall or error means NOT applied
  const failSelectors = [
    'text=/login to apply/i',
    'text=/sign in to apply/i',
    'text=/please login/i',
    '[class*="loginModal"]',
    '[id*="loginModal"]',
  ];
  for (const sel of failSelectors) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) return false;
    } catch(e) {}
  }

  // ambiguous — take screenshot and assume success (user can verify via log)
  return false;
}

// ═══════════════════════════════════════════════
//  NAUKRI
// ═══════════════════════════════════════════════
async function runNaukri(page) {
  let applied = 0;

  writeStatus('Opening Naukri…');
  await page.goto('https://www.naukri.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(2000);
  await snap(page);

  const loggedIn = await isLoggedInNaukri(page);
  if (!loggedIn) {
    if (!EMAIL || !PASS) { writeStatus('Error: Naukri credentials not configured'); return; }
    writeStatus('Logging in to Naukri…');
    const ok = await loginNaukri(page);
    if (!ok) { writeStatus('Error: Naukri login failed — check credentials in Profile'); return; }
    writeStatus('Logged in to Naukri ✓');
  } else {
    writeStatus('Already logged in to Naukri ✓');
  }

  writeStatus('Searching: ' + ROLE);
  const slug = ROLE.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await page.goto(`https://www.naukri.com/${slug}-jobs`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(3000);
  await snap(page);

  const jobLinks = await collectNaukriJobs(page);
  log(`Found ${jobLinks.length} job links on Naukri`);
  if (!jobLinks.length) { writeStatus('No jobs found on Naukri'); return; }

  for (const url of jobLinks) {
    if (applied >= DAILY_CAP) { writeStatus(`Daily cap (${DAILY_CAP}) reached`); break; }
    writeStatus(`Opening job ${applied + 1}/${jobLinks.length}…`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(2500);
      await snap(page);

      const title = await getJobTitle(page, 'naukri');
      const score = matchScore(title);
      log(`Job: "${title}" — score ${score}%`);
      if (score < MIN_MATCH) { log('Skipping: score too low'); continue; }

      const applyBtn = await findApplyButton(page);
      if (!applyBtn) { log('No apply button'); continue; }

      writeStatus(`Applying: "${title}"…`);
      await applyBtn.click();
      await delay(3000);
      await snap(page);

      const success = await confirmApply(page);
      if (success) { applied++; log(`✓ Applied (${applied}): "${title}"`); writeStatus(`Applied (${applied}): "${title}"`); }
      else { log(`⚠ Uncertain result for "${title}"`); writeStatus(`Uncertain: "${title}" — screenshot saved`); }
      await delay(2000);
    } catch(e) { log('Error on job: ' + e.message); await snap(page); }
  }

  writeStatus(`Done — ${applied} applied on Naukri`);
}

async function isLoggedInNaukri(page) {
  try {
    const el = await page.$('.nI-gNb-drawer__icon, [class*="userInitial"], [class*="avatar"], .user-name');
    if (el) return true;
    const content = await page.textContent('body').catch(() => '');
    return /logout|my profile|my naukri/i.test(content);
  } catch(e) { return false; }
}

async function loginNaukri(page) {
  try {
    await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await delay(2000);

    const emailField = await page.$('#usernameField, input[placeholder*="Enter Email" i], input[type="email"]');
    if (!emailField) { log('Naukri: email field not found'); return false; }
    await emailField.fill(EMAIL);
    await delay(400);

    const passField = await page.$('#passwordField, input[type="password"]');
    if (!passField) { log('Naukri: password field not found'); return false; }
    await passField.fill(PASS);
    await delay(400);

    const btn = await page.$('button[type="submit"], .loginButton, button:has-text("Login")');
    if (btn) await btn.click(); else await passField.press('Enter');

    await delay(4000);
    await snap(page);
    return await isLoggedInNaukri(page);
  } catch(e) { log('loginNaukri error: ' + e.message); return false; }
}

async function collectNaukriJobs(page) {
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 800); await delay(500); }
  await snap(page);
  const links = await page.$$eval(
    'a.title, .jobtuple a.title, article.jobTuple a, [class*="jobTitle"] a',
    els => [...new Set(els.map(a => a.href).filter(h => h.includes('naukri.com')))]
  ).catch(() => []);
  return links.slice(0, DAILY_CAP);
}

// ═══════════════════════════════════════════════
//  ROUTER — pick portal function
// ═══════════════════════════════════════════════
async function runPortal(portal) {
  log('Launching browser for ' + portal);
  const HAS_DISPLAY = !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);

  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: !HAS_DISPLAY,
    viewport: { width: 1366, height: 768 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox', '--disable-setuid-sandbox',
      ...(!HAS_DISPLAY ? ['--disable-gpu', '--disable-dev-shm-usage'] : [])
    ]
  });

  const page = await ctx.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // continuous screenshot every second
  const iv = setInterval(() => snap(page), 1000);

  try {
    if (portal === 'naukri')        await runNaukri(page);
    else if (portal === 'shine')    await runShine(page);
    else { writeStatus(`Portal "${portal}" not yet implemented`); }
  } catch(e) {
    log('Fatal error: ' + e.message);
    writeStatus('Error: ' + e.message, e.message);
  } finally {
    clearInterval(iv);
    await snap(page);
    await delay(1000);
    try { await ctx.close(); } catch(e) {}
  }
}

// ── Pass user profile data from automation route via env ──
// ROLE, SKILLS, MIN_MATCH, DAILY_CAP are read at the top from process.env

(async () => {
  log('Worker started. Portals: ' + PORTALS.join(', '));
  log(`Role: ${ROLE} | Skills: ${SKILLS.join(', ')} | MinMatch: ${MIN_MATCH}% | Cap: ${DAILY_CAP}`);
  log(`Email configured: ${EMAIL ? 'YES (' + EMAIL + ')' : 'NO — will fail if not logged in'}`);
  for (const p of PORTALS) {
    await runPortal(p);
  }
  log('All portals done.');
})().catch(e => {
  log('Fatal: ' + e.message);
  writeStatus('Error: ' + e.message, e.message);
  process.exit(1);
});
