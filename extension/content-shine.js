// CareerPilot — Shine.com content script

(function () {
  'use strict';

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'SCRAPE_JOBS') { sendResponse({ urls: scrapeJobUrls() }); }
    if (msg.type === 'APPLY_NOW')   { applyToCurrentJob().then(r => sendResponse(r)); return true; }
  });

  if (isListingPage()) {
    setTimeout(() => {
      const urls = scrapeJobUrls();
      if (urls.length) chrome.runtime.sendMessage({ type: 'JOB_FOUND', urls });
    }, 3500);
  }

  if (isSingleJobPage()) setTimeout(() => autoApply(), 3500);

  function isListingPage() {
    return /shine\.com\/job-search/.test(location.href);
  }
  function isSingleJobPage() {
    return /shine\.com\/jobs\//.test(location.href);
  }

  function scrapeJobUrls() {
    const links = new Set();
    document.querySelectorAll('a.position-title, .job-heading a, .job-info h3 a, [class*="jobTitle"] a').forEach(a => {
      if (a.href && a.href.includes('shine.com')) links.add(a.href.split('?')[0]);
    });
    return [...links].slice(0, 30);
  }

  function getJobTitle() {
    return document.querySelector('h1.job-title, .job-detail h1, [class*="jobTitle"] h1')?.innerText?.trim()
      || document.title.split('|')[0].trim();
  }
  function getCompany() {
    return document.querySelector('.company-name a, [class*="companyName"] a, .company a')?.innerText?.trim() || '';
  }
  function getLocation() {
    return document.querySelector('.job-location span, [class*="location"] span')?.innerText?.trim() || '';
  }

  async function autoApply() {
    const { score, minMatch } = await matchScore(getJobTitle());
    const title   = getJobTitle();
    const company = getCompany();
    const location = getLocation();

    if (score < minMatch) {
      chrome.runtime.sendMessage({ type: 'SKIPPED', title, score });
      chrome.runtime.sendMessage({ type: 'PAGE_DONE' });
      return;
    }

    // detect login wall before even trying
    if (isLoginPage()) {
      chrome.runtime.sendMessage({ type: 'LOGIN_NEEDED', portal: 'shine' });
      return; // background will re-navigate after login
    }

    const applyBtn = findApplyButton();
    if (!applyBtn) {
      chrome.runtime.sendMessage({ type: 'LOG', text: `Shine: no apply button on "${title}"` });
      chrome.runtime.sendMessage({ type: 'PAGE_DONE' });
      return;
    }

    chrome.runtime.sendMessage({ type: 'LOG', text: `Shine: applying "${title}" @ ${company}` });
    applyBtn.click();
    await wait(3000);

    // if a login modal appeared after clicking Apply
    if (isLoginPage() || document.querySelector('[class*="loginModal"],[id*="loginModal"]')) {
      chrome.runtime.sendMessage({ type: 'LOGIN_NEEDED', portal: 'shine' });
      return;
    }

    // confirm success
    const confirmed = !!document.querySelector('[class*="success"],[class*="thankYou"],[class*="applicationSuccess"]') ||
                      /successfully applied|application submitted|thank you for applying/i.test(document.body.innerText);
    if (confirmed) {
      chrome.runtime.sendMessage({ type: 'APPLIED', title, company, location, score, url: window.location.href });
    } else {
      chrome.runtime.sendMessage({ type: 'LOG', text: `Shine: uncertain result for "${title}" — continuing` });
      chrome.runtime.sendMessage({ type: 'PAGE_DONE' });
    }
  }

  function isLoginPage() {
    return /login|signin|sign-in/i.test(window.location.href) ||
           !!document.querySelector('input[type="password"]');
  }

  function findApplyButton() {
    for (const el of document.querySelectorAll('button, a')) {
      const text = (el.innerText || '').trim().toLowerCase();
      if (text === 'apply' || text === 'apply now' || text === 'apply online') return el;
    }
    return null;
  }
  }

  function matchScore(title) {
    return new Promise(resolve => {
      chrome.storage.local.get(['skills', 'minMatch'], d => {
        const skills = d.skills || ['react', 'node', 'javascript', 'python', 'java'];
        const t = title.toLowerCase();
        const hits = skills.filter(s => t.includes(s.toLowerCase())).length;
        const score = skills.length ? Math.round((hits / skills.length) * 100) : 50;
        resolve({ score, minMatch: d.minMatch || 75 });
      });
    });
  }

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
})();
