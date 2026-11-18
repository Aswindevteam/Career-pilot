// CareerPilot — Hirist.com content script

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
    return /hirist\.com\/search/.test(location.href) || /hirist\.com\/?$/.test(location.href);
  }
  function isSingleJobPage() {
    return /hirist\.com\/[a-z].*-\d+/.test(location.href) && !isListingPage();
  }

  function scrapeJobUrls() {
    const links = new Set();
    document.querySelectorAll('a[href*="/c/"]').forEach(a => {
      if (a.href && a.href.includes('hirist.com')) links.add(a.href.split('?')[0]);
    });
    return [...links].slice(0, 30);
  }

  function getJobTitle() {
    return document.querySelector('h1.job-title, .jd-title h1, [itemprop="title"]')?.innerText?.trim()
      || document.title.split('|')[0].trim();
  }
  function getCompany() {
    return document.querySelector('.company-name, [itemprop="hiringOrganization"] [itemprop="name"]')?.innerText?.trim() || '';
  }

  async function autoApply() {
    const title = getJobTitle();
    const { score, minMatch } = await matchScore(title);
    if (score < minMatch) {
      chrome.runtime.sendMessage({ type: 'SKIPPED', title, score });
      chrome.runtime.sendMessage({ type: 'PAGE_DONE' });
      return;
    }
    const applyBtn = findApplyButton();
    if (!applyBtn) {
      chrome.runtime.sendMessage({ type: 'LOG', text: `Hirist: no apply button on "${title}"` });
      chrome.runtime.sendMessage({ type: 'PAGE_DONE' });
      return;
    }
    chrome.runtime.sendMessage({ type: 'LOG', text: `Hirist: applying to "${title}" @ ${getCompany()}` });
    applyBtn.click();
    await wait(3000);
    chrome.runtime.sendMessage({ type: 'APPLIED', title, company: getCompany(), score, url: window.location.href });
  }

  function findApplyButton() {
    for (const el of document.querySelectorAll('button, a')) {
      const t = (el.innerText || '').trim().toLowerCase();
      if (t === 'apply' || t === 'apply now' || t === 'quick apply') return el;
    }
    return null;
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
