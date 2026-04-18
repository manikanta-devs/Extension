/**
 * AI Life Copilot — Popup Script
 * ─────────────────────────────────────────────────────────────────
 * Handles: consent, page context detection, all AI actions,
 *          response display, copy/insert, toasts, toggle.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

// ── DOM REFS ───────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const elToggle        = $('extensionToggle');
const elConsentBanner = $('consentBanner');
const elConsentAllow  = $('consentAllow');
const elConsentDeny   = $('consentDeny');
const elCtxIcon       = $('ctxIcon');
const elCtxLabel      = $('ctxLabel');
const elCtxBadge      = $('ctxBadge');
const elStatusDot     = $('statusDot');
const elActionsGrid   = $('actionsGrid');
const elTransformSub  = $('transformSubmenu');
const elCustomPrompt  = $('customPrompt');
const elCharCount     = $('charCount');
const elBtnSend       = $('btnSendPrompt');
const elLoadingBar    = $('loadingBar');
const elLoadingText   = $('loadingText');
const elResponsePanel = $('responsePanel');
const elResponseBody  = $('responseBody');
const elBtnCopy       = $('btnCopy');
const elBtnInsert     = $('btnInsert');
const elBtnClear      = $('btnClearResponse');
const elContainer     = document.querySelector('.container');
const elToastStack    = $('toastStack');

// ── STATE ──────────────────────────────────────────────────────────
let pageContext     = '';   // Cleaned page text
let pageType        = '';   // job | social | article | email | general
let isEnabled       = true;
let isLoading       = false;
let lastResponse    = '';
let consentGranted  = false;

// ── INIT ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadSettings();
  await checkConsent();
  if (consentGranted && isEnabled) {
    await detectPageContext();
  }
  bindEvents();
}

// ── SETTINGS ───────────────────────────────────────────────────────
async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['enabled', 'consentGranted'], data => {
      isEnabled      = data.enabled !== false; // default true
      consentGranted = data.consentGranted === true;

      elToggle.checked = isEnabled;
      updateToggleUI();
      resolve();
    });
  });
}

function saveSettings() {
  chrome.storage.local.set({ enabled: isEnabled, consentGranted });
}

// ── CONSENT ────────────────────────────────────────────────────────
async function checkConsent() {
  if (!consentGranted) {
    elConsentBanner.hidden = false;
  }
}

elConsentAllow.addEventListener('click', () => {
  consentGranted = true;
  saveSettings();
  elConsentBanner.hidden = true;
  detectPageContext();
  showToast('Page reading enabled ✓', 'success');
});

elConsentDeny.addEventListener('click', () => {
  consentGranted = false;
  saveSettings();
  elConsentBanner.hidden = true;
  showToast('Running without page context', 'info');
});

// ── TOGGLE ─────────────────────────────────────────────────────────
elToggle.addEventListener('change', () => {
  isEnabled = elToggle.checked;
  saveSettings();
  updateToggleUI();
  showToast(isEnabled ? 'Copilot enabled' : 'Copilot disabled', 'info');

  // Notify content script
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'TOGGLE_FAB',
        enabled: isEnabled,
      }).catch(() => {}); // ignore if content script not ready
    }
  });
});

function updateToggleUI() {
  if (isEnabled) {
    elStatusDot.classList.remove('inactive');
    elContainer.classList.remove('disabled');
  } else {
    elStatusDot.classList.add('inactive');
    elContainer.classList.add('disabled');
  }
}

// ── PAGE CONTEXT DETECTION ─────────────────────────────────────────
async function detectPageContext() {
  elCtxLabel.textContent = 'Analyzing page…';
  elCtxBadge.textContent = '…';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    // Inject a quick content extraction via scripting API
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageData,
    });

    if (results?.[0]?.result) {
      const { text, type, icon, label } = results[0].result;
      pageContext = text;
      pageType    = type;
      elCtxIcon.textContent   = icon;
      elCtxLabel.textContent  = label;
      elCtxBadge.textContent  = type;
    }
  } catch (err) {
    elCtxLabel.textContent = 'Could not read page';
    elCtxBadge.textContent = 'error';
  }
}

// This function runs INSIDE the page (injected)
function extractPageData() {
  const url  = window.location.href;
  const host = window.location.hostname.replace('www.', '');

  // ── Classify page type ──
  let type = 'general', icon = '🌐', label = host;

  const jobKeywords = ['job', 'career', 'hiring', 'vacancy', 'position', 'apply', 'work at'];
  const bodyText    = document.body.innerText.toLowerCase();

  if (/linkedin\.com/i.test(host)) {
    icon = '💼'; type = 'social';
    label = url.includes('/jobs/') ? 'LinkedIn · Job Posting' : 'LinkedIn';
    if (url.includes('/jobs/')) type = 'job';
  } else if (/gmail\.com/i.test(host) || /mail\.google\.com/i.test(host)) {
    icon = '✉️'; type = 'email'; label = 'Gmail';
  } else if (/youtube\.com/i.test(host)) {
    icon = '▶️'; type = 'article'; label = 'YouTube';
  } else if (/twitter\.com|x\.com/i.test(host)) {
    icon = '🐦'; type = 'social'; label = 'X / Twitter';
  } else if (/medium\.com|substack\.com|dev\.to|hashnode/i.test(host)) {
    icon = '📝'; type = 'article'; label = `Article · ${host}`;
  } else if (jobKeywords.some(k => bodyText.includes(k)) && bodyText.length > 200) {
    icon = '💼'; type = 'job'; label = `Job Page · ${host}`;
  } else if (bodyText.includes('@') && bodyText.length < 3000) {
    icon = '✉️'; type = 'email'; label = `Email · ${host}`;
  }

  // ── Extract clean text ──
  const selectors = [
    'article', 'main', '[role="main"]',
    '.job-description', '#job-details',
    '.content', '.post-content', '.entry-content',
  ];

  let container = null;
  for (const sel of selectors) {
    container = document.querySelector(sel);
    if (container) break;
  }
  container = container || document.body;

  // Clone and clean
  const clone = container.cloneNode(true);
  ['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript'].forEach(tag => {
    clone.querySelectorAll(tag).forEach(el => el.remove());
  });

  const text = (clone.innerText || clone.textContent || '')
    .replace(/\s{3,}/g, '\n\n')
    .trim()
    .substring(0, 4000);

  return { text, type, icon, label };
}

// ── BIND ACTION BUTTONS ────────────────────────────────────────────
function bindEvents() {
  // Action cards
  $('btnAnalyze').addEventListener('click', () => handleAction('analyze'));
  $('btnReply').addEventListener('click',   () => handleAction('reply'));
  $('btnSuggest').addEventListener('click', () => handleAction('suggest'));

  // Transform — show submenu
  $('btnTransform').addEventListener('click', () => {
    elTransformSub.hidden = !elTransformSub.hidden;
  });

  // Transform chips
  document.querySelectorAll('.chip[data-transform]').forEach(chip => {
    chip.addEventListener('click', () => {
      handleTransform(chip.dataset.transform);
      elTransformSub.hidden = true;
    });
  });

  // Custom prompt send
  elBtnSend.addEventListener('click', () => {
    const text = elCustomPrompt.value.trim();
    if (text) handleCustom(text);
  });

  // Ctrl+Enter to send
  elCustomPrompt.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const text = elCustomPrompt.value.trim();
      if (text) handleCustom(text);
    }
  });

  // Char counter
  elCustomPrompt.addEventListener('input', () => {
    const len = elCustomPrompt.value.length;
    elCharCount.textContent = `${len} / 500`;
    elBtnSend.disabled = len === 0 || isLoading;
  });

  // Response controls
  elBtnCopy.addEventListener('click', copyResponse);
  elBtnInsert.addEventListener('click', insertResponse);
  elBtnClear.addEventListener('click', clearResponse);
}

// ── ACTION HANDLERS ────────────────────────────────────────────────
const PROMPTS = {
  analyze: (ctx, type) => {
    if (type === 'job') {
      return `You are a career coach. Analyze this job posting and provide:
1. 📋 Job Summary (2-3 sentences)
2. 🎯 Key Requirements (top 5 bullet points)  
3. 💡 Tips for Applicants
4. ⚠️ Watch Out For (any red flags)

Job Posting:
${ctx}`;
    }
    return `Analyze this webpage and provide a concise summary:
1. 📌 Main Topic
2. 🔑 Key Points (top 5)
3. 💡 Key Takeaways

Page Content:
${ctx}`;
  },

  reply: (ctx, type) => {
    if (type === 'email') {
      return `Write a professional, friendly reply to this email. Be concise and clear.

Original email:
${ctx}

Write only the reply body (no subject line needed).`;
    }
    if (type === 'social') {
      return `Write a thoughtful, engaging reply to this social media post or thread. 
Keep it under 3 sentences. Be genuine and add value.

Post content:
${ctx}`;
    }
    return `Write a helpful, professional reply to this content. 
Keep it concise and relevant.

Content:
${ctx}`;
  },

  suggest: (ctx, type) => `You are a productivity expert. Based on this page, suggest 3-5 specific actions the user should take right now. Be actionable and brief.

Page type: ${type}
Page content:
${ctx}`,
};

const TRANSFORM_PROMPTS = {
  summarize: ctx => `Summarize the following in 3-5 clear bullet points:\n\n${ctx}`,
  linkedin:  ctx => `Transform this into an engaging LinkedIn post. Use emojis sparingly, add a hook, and include relevant hashtags. Keep it professional yet conversational:\n\n${ctx}`,
  caption:   ctx => `Write 3 creative social media captions for this content. Make them catchy and shareable:\n\n${ctx}`,
  tweet:     ctx => `Turn this into a Twitter/X thread. Use numbered tweets (1/, 2/, etc.). Make each tweet punchy and engaging:\n\n${ctx}`,
  formal:    ctx => `Rewrite the following in a formal, professional tone:\n\n${ctx}`,
  casual:    ctx => `Rewrite the following in a friendly, casual, conversational tone:\n\n${ctx}`,
};

async function handleAction(action) {
  if (isLoading || !isEnabled) return;

  // Refresh context if we have consent
  if (consentGranted) await detectPageContext();

  const prompt = PROMPTS[action]?.(pageContext || 'No page content available.', pageType) || '';
  await runAI(prompt, '', action);
}

async function handleTransform(transformType) {
  if (isLoading || !isEnabled) return;

  // First try to get selected text from the page
  let selectedText = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString().trim() || '',
    });
    selectedText = results?.[0]?.result || '';
  } catch (_) {}

  const source = selectedText || pageContext || 'No text available.';

  if (!selectedText && !pageContext) {
    showToast('Select some text on the page first, or allow page reading.', 'info');
    return;
  }

  const prompt = TRANSFORM_PROMPTS[transformType]?.(source) || `Transform this text (${transformType}):\n\n${source}`;
  await runAI(prompt, '', 'transform');
}

async function handleCustom(userText) {
  if (isLoading || !isEnabled) return;
  if (consentGranted) await detectPageContext();

  const prompt = pageContext
    ? `User question: ${userText}\n\nPage context:\n${pageContext}`
    : userText;

  await runAI(prompt, pageContext, 'custom');
}

// ── CORE AI RUNNER ─────────────────────────────────────────────────
async function runAI(prompt, context, action) {
  setLoading(true, getLoadingMessage(action));

  try {
    const response = await callAI(prompt, context, action);
    showResponse(response);
    elCustomPrompt.value = '';
    elCharCount.textContent = '0 / 500';
    elBtnSend.disabled = true;
  } catch (err) {
    showToast(err.message, 'error');
    console.error('[AI Copilot]', err);
  } finally {
    setLoading(false);
  }
}

function getLoadingMessage(action) {
  const msgs = {
    analyze:   'Analyzing page content…',
    reply:     'Crafting your reply…',
    transform: 'Transforming text…',
    suggest:   'Thinking about next steps…',
    custom:    'Processing your request…',
  };
  return msgs[action] || 'Neural network processing…';
}

// ── LOADING STATE ──────────────────────────────────────────────────
function setLoading(state, message = 'Neural network processing…') {
  isLoading = state;
  elLoadingBar.hidden     = !state;
  elLoadingText.textContent = message;
  elBtnSend.disabled      = state || elCustomPrompt.value.trim() === '';

  // Disable action cards during loading
  document.querySelectorAll('.action-card').forEach(btn => {
    btn.disabled = state;
  });
}

// ── RESPONSE DISPLAY ───────────────────────────────────────────────
function showResponse(text) {
  lastResponse = text;
  elResponsePanel.hidden = false;
  elResponseBody.classList.add('typing');
  elResponseBody.textContent = '';

  // Simulate streaming by revealing text progressively
  let i = 0;
  const interval = setInterval(() => {
    elResponseBody.textContent = text.substring(0, i);
    i += 6;
    if (i > text.length) {
      elResponseBody.textContent = text;
      elResponseBody.classList.remove('typing');
      clearInterval(interval);
    }
  }, 20);
}

function clearResponse() {
  elResponsePanel.hidden = true;
  elResponseBody.textContent = '';
  lastResponse = '';
}

// ── COPY ───────────────────────────────────────────────────────────
async function copyResponse() {
  if (!lastResponse) return;
  try {
    await navigator.clipboard.writeText(lastResponse);
    elBtnCopy.textContent = '✓ Copied!';
    setTimeout(() => {
      elBtnCopy.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Copy`;
    }, 1800);
    showToast('Copied to clipboard!', 'success');
  } catch (_) {
    showToast('Copy failed — try again.', 'error');
  }
}

// ── INSERT INTO PAGE ───────────────────────────────────────────────
async function insertResponse() {
  if (!lastResponse) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text) => {
        // Find the focused input or textarea
        const el = document.activeElement;
        if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) {
          if (el.isContentEditable) {
            el.textContent += text;
          } else {
            const start = el.selectionStart;
            const end   = el.selectionEnd;
            el.value = el.value.substring(0, start) + text + el.value.substring(end);
            el.selectionStart = el.selectionEnd = start + text.length;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      },
      args: [lastResponse],
    });
    showToast('Inserted into page!', 'success');
  } catch (_) {
    showToast('Could not insert — click a text field on the page first.', 'info');
  }
}

// ── TOASTS ─────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = `${icons[type]} ${message}`;
  elToastStack.appendChild(el);

  setTimeout(() => {
    el.classList.add('exiting');
    setTimeout(() => el.remove(), 200);
  }, 3000);
}
