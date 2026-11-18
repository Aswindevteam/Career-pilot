// CareerPilot — LinkedIn content script
// Handles Easy Apply on LinkedIn Jobs

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
    }, 4000);
  }

  if (isSingleJobPage()) setTimeout(() => autoApply(), 4000);

  function isListingPage() {
    return /linkedin\.com\/jobs\/(search|collections)/.test(location.href);
  }
  function isSingleJobPage() {
    return /linkedin\.com\/jobs\/view/.test(location.href);
  }

  function scrapeJobUrls() {
    const links = new Set();
    document.querySelectorAll('a.job-card-container__link, a[data-control-name="job_card_title"], .jobs-search-results__list-item a').forEach(a => {
      if (a.href && a.href.includes('/jobs/view/')) links.add(a.href.split('?')[0]);
    });
    return [...links].slice(0, 25);
  }

  function getJobTitle() {
    return document.querySelector('.job-details-jobs-unified-top-card__job-title h1, .jobs-unified-top-card__job-title h1')?.innerText?.trim()
      || document.querySelector('h1')?.innerText?.trim()
      || document.title.split('|')[0].trim();
  }
  function getCompany() {
    return document.querySelector('.job-details-jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name a')?.innerText?.trim() || '';
  }
  function getLocation() {
    return document.querySelector('.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet')?.innerText?.trim() || '';
  }

  async function autoApply() {
    const title = getJobTitle();
    const { score, minMatch } = await matchScore(title);

    if (score < minMatch) {
      chrome.runtime.sendMessage({ type: 'SKIPPED', title, score });
      chrome.runtime.sendMessage({ type: 'PAGE_DONE' });
      return;
    }

    // LinkedIn Easy Apply button
    const easyApplyBtn = findEasyApplyButton();
    if (!easyApplyBtn) {
      chrome.runtime.sendMessage({ type: 'LOG', text: `LinkedIn: no Easy Apply on "${title}" (external link?)` });
      chrome.runtime.sendMessage({ type: 'PAGE_DONE' });
      return;
    }

    chrome.runtime.sendMessage({ type: 'LOG', text: `LinkedIn: Easy Applying to "${title}" @ ${getCompany()}` });
    easyApplyBtn.click();
    await wait(2000);

    // Walk through the multi-step Easy Apply modal
    await walkEasyApply();

    chrome.runtime.sendMessage({ type: 'APPLIED', title, company: getCompany(), location: getLocation(), score, url: window.location.href });
  }

  function findEasyApplyButton() {
    for (const el of document.querySelectorAll('button')) {
      const text = (el.innerText || el.getAttribute('aria-label') || '').trim().toLowerCase();
      if (text.includes('easy apply')) return el;
    }
    return null;
  }

  async function walkEasyApply(maxSteps = 8) {
    for (let i = 0; i < maxSteps; i++) {
      await wait(1500);
      // "Next" or "Review" button in the modal
      const nextBtn = [...document.querySelectorAll('button[aria-label="Continue to next step"], button[aria-label="Review your application"], button[aria-label="Submit application"]')]
        .find(b => !b.disabled);
      if (!nextBtn) break;
      const label = (nextBtn.getAttribute('aria-label') || '').toLowerCase();
      nextBtn.click();
      if (label.includes('submit')) { await wait(2000); break; }
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
