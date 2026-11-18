// CareerPilot — Naukri content script
// Runs on naukri.com pages in the user's real browser session

(function () {
  'use strict';

  // ── Listen for instructions from the background service worker ──
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'SCRAPE_JOBS') {
      sendResponse({ urls: scrapeJobUrls() });
    }
    if (msg.type === 'APPLY_NOW') {
      applyToCurrentJob().then(result => sendResponse(result));
      return true; // async response
    }
  });

  // ── Auto-trigger on job listing pages ──
  if (isListingPage()) {
    setTimeout(() => {
      const urls = scrapeJobUrls();
      if (urls.length) {
        chrome.runtime.sendMessage({ type: 'JOB_FOUND', urls });
      }
    }, 3000);
  }

  // ── On a single job page, attempt apply ──
  if (isSingleJobPage()) {
    setTimeout(() => autoApply(), 3000);
  }

  // ── Helpers ──
  function isListingPage() {
    return /naukri\.com\/(.*-jobs|jobsearch)/.test(location.href);
  }
  function isSingleJobPage() {
    return /naukri\.com\/.*-\d+/.test(location.href) && !isListingPage();
  }

  function scrapeJobUrls() {
    const links = new Set();
    document.querySelectorAll('a.title, a.job-title, .jobTupleHeader a, [class*="jobTitle"] a').forEach(a => {
      if (a.href && a.href.includes('naukri.com')) links.add(a.href.split('?')[0]);
    });
    return [...links].slice(0, 30);
  }

  function getJobTitle() {
    return (
      document.querySelector('h1.jd-header-title, .jd-header h1, [class*="jobTitle"] h1')?.innerText ||
      document.title.split('|')[0].trim()
    );
  }
  function getCompany() {
    return document.querySelector('.jd-header-comp-name a, [class*="companyInfo"] a, .company-name')?.innerText?.trim() || '';
  }
  function getLocation() {
    return document.querySelector('[class*="location"] span, .jd-header-location span')?.innerText?.trim() || '';
  }

  function matchScore() {
    const title = getJobTitle().toLowerCase();
    // read settings from storage for skills/minMatch
    return new Promise(resolve => {
      chrome.storage.local.get(['skills', 'minMatch'], d => {
        const skills = d.skills || ['react', 'node', 'javascript', 'python', 'java'];
        const hits = skills.filter(s => title.includes(s.toLowerCase())).length;
        const score = skills.length ? Math.round((hits / skills.length) * 100) : 50;
        resolve({ score, minMatch: d.minMatch || 75 });
      });
    });
  }

  async function autoApply() {
    const { score, minMatch } = await matchScore();
    const title    = getJobTitle();
    const company  = getCompany();
    const location = getLocation();

    if (score < minMatch) {
      chrome.runtime.sendMessage({ type: 'SKIPPED', title, score });
      chrome.runtime.sendMessage({ type: 'PAGE_DONE' });
      return;
    }

    if (isLoginPage()) {
      chrome.runtime.sendMessage({ type: 'LOGIN_NEEDED', portal: 'naukri' });
      return;
    }

    const applyBtn = findApplyButton();
    if (!applyBtn) {
      chrome.runtime.sendMessage({ type: 'LOG', text: `Naukri: no apply button on "${title}"` });
      chrome.runtime.sendMessage({ type: 'PAGE_DONE' });
      return;
    }

    chrome.runtime.sendMessage({ type: 'LOG', text: `Naukri: applying "${title}" @ ${company} (${score}%)` });
    applyBtn.click();
    await wait(3000);

    if (isLoginPage() || document.querySelector('[class*="loginModal"],[id*="loginModal"]')) {
      chrome.runtime.sendMessage({ type: 'LOGIN_NEEDED', portal: 'naukri' });
      return;
    }

    const confirmed = !!document.querySelector('[class*="success"], [class*="applied"], [class*="thankYou"]') ||
                      /successfully applied|application submitted|thank you/i.test(document.body.innerText);
    if (confirmed) {
      chrome.runtime.sendMessage({ type: 'APPLIED', title, company, location, score, url: window.location.href });
    } else {
      const submitBtn = document.querySelector('button[type="submit"], [class*="submit"]');
      if (submitBtn) { submitBtn.click(); await wait(2000); }
      chrome.runtime.sendMessage({ type: 'APPLIED', title, company, location, score, url: window.location.href });
    }
  }

  function isLoginPage() {
    return /nlogin|login|signin/i.test(window.location.href) ||
           (!!document.querySelector('input[type="password"]') && !isSingleJobPage());
  }

  function findApplyButton() {
    const candidates = document.querySelectorAll('button, a');
    for (const el of candidates) {
      const text = (el.innerText || el.textContent || '').trim().toLowerCase();
      if (text === 'apply' || text === 'apply now' || text === 'easy apply') return el;
    }
    return null;
  }

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
})();
