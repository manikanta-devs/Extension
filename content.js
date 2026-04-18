/**
 * AI Life Copilot — Content Script
 * ─────────────────────────────────────────────────────────────────
 * Injected into every page.
 * Provides:
 *   1. Floating Action Button (FAB) for quick AI reply
 *   2. Text Selection Mini-Menu (Summarize | LinkedIn | Caption)
 *   3. Listens for messages from background / popup
 * ─────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // Guard against double injection
  if (window.__aiCopilotInjected) return;
  window.__aiCopilotInjected = true;

  // ── CONFIG ───────────────────────────────────────────────────────
  const API_URL = 'http://localhost:3000/generate'; // same as utils/api.js
  const MAX_CONTEXT = 2000;

  // ── STATE ────────────────────────────────────────────────────────
  let fabEnabled      = true;
  let selectionMenu   = null;
  let fab             = null;
  let fabPanel        = null;
  let panelVisible    = false;

  // ── INIT ─────────────────────────────────────────────────────────
  function init() {
    chrome.storage.local.get(['enabled', 'consentGranted'], data => {
      fabEnabled = data.enabled !== false && data.consentGranted === true;
      if (fabEnabled) {
        createFAB();
        initSelectionMenu();
      }
    });
  }

  // ── FAB — FLOATING ACTION BUTTON ─────────────────────────────────
  function createFAB() {
    if (fab) return;

    // Wrapper (shadow DOM for style isolation)
    const host = document.createElement('div');
    host.id = 'ai-copilot-fab-host';
    host.style.cssText = `
      position: fixed !important;
      bottom: 24px !important;
      right: 24px !important;
      z-index: 2147483647 !important;
      font-family: system-ui, sans-serif !important;
    `;
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    // Styles inside shadow
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }

      .fab {
        width: 46px; height: 46px;
        border-radius: 50%;
        background: linear-gradient(135deg, #0a2040, #061428);
        border: 1.5px solid rgba(0,212,255,0.5);
        box-shadow: 0 4px 20px rgba(0,212,255,0.25), 0 2px 8px rgba(0,0,0,0.5);
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        color: #00d4ff;
        font-size: 20px;
        transition: transform 0.2s cubic-bezier(.34,1.56,.64,1), box-shadow 0.2s;
        position: relative;
      }
      .fab:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 28px rgba(0,212,255,0.4), 0 2px 8px rgba(0,0,0,0.5);
      }
      .fab:active { transform: scale(0.96); }

      .fab-pulse {
        position: absolute;
        inset: -4px;
        border-radius: 50%;
        border: 1.5px solid rgba(0,212,255,0.3);
        animation: fab-ring 2s ease-out infinite;
      }
      @keyframes fab-ring {
        0%   { transform: scale(1);   opacity: 0.6; }
        100% { transform: scale(1.5); opacity: 0;   }
      }

      .panel {
        position: absolute;
        bottom: 56px; right: 0;
        width: 280px;
        background: #0d1421;
        border: 1px solid #1a2740;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,255,0.08);
        display: none;
        animation: panel-in 0.2s cubic-bezier(.34,1.56,.64,1);
      }
      .panel.visible { display: block; }
      @keyframes panel-in {
        from { opacity: 0; transform: translateY(10px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      .panel-header {
        padding: 10px 12px;
        background: rgba(0,212,255,0.05);
        border-bottom: 1px solid #1a2740;
        font-size: 11px;
        color: #7a9bbf;
        font-weight: 600;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }

      .panel-actions { padding: 8px; display: flex; flex-direction: column; gap: 4px; }

      .panel-btn {
        width: 100%;
        padding: 8px 10px;
        border-radius: 8px;
        background: transparent;
        border: 1px solid transparent;
        color: #d4e3f7;
        font-size: 12px;
        cursor: pointer;
        text-align: left;
        display: flex; align-items: center; gap: 8px;
        transition: all 0.15s;
        font-family: system-ui, sans-serif;
      }
      .panel-btn:hover { background: #111b2e; border-color: #1e3050; }
      .panel-btn .btn-icon { font-size: 15px; flex-shrink: 0; }
      .panel-btn .btn-label { font-weight: 500; }
      .panel-btn .btn-sub { font-size: 10.5px; color: #5b7a9d; display: block; }

      .panel-response {
        margin: 0 8px 8px;
        padding: 10px;
        border-radius: 8px;
        background: #070b14;
        border: 1px solid #1a2740;
        font-size: 11.5px;
        line-height: 1.6;
        color: #d4e3f7;
        max-height: 140px;
        overflow-y: auto;
        display: none;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .panel-response.visible { display: block; }
      .panel-response::-webkit-scrollbar { width: 3px; }
      .panel-response::-webkit-scrollbar-thumb { background: #1e3050; border-radius: 2px; }

      .panel-copy {
        display: none;
        margin: 0 8px 8px;
        width: calc(100% - 16px);
        padding: 6px;
        border-radius: 7px;
        background: rgba(0,212,255,0.1);
        border: 1px solid rgba(0,212,255,0.25);
        color: #00d4ff;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        font-family: system-ui, sans-serif;
        transition: background 0.15s;
      }
      .panel-copy.visible { display: block; }
      .panel-copy:hover { background: rgba(0,212,255,0.18); }

      .panel-loading {
        padding: 12px;
        text-align: center;
        color: #5b7a9d;
        font-size: 11px;
        display: none;
      }
      .panel-loading.visible { display: block; }

      .dots span {
        display: inline-block;
        animation: dot-bounce 1.2s infinite;
        font-size: 20px;
        line-height: 1;
        color: #00d4ff;
      }
      .dots span:nth-child(2) { animation-delay: 0.15s; }
      .dots span:nth-child(3) { animation-delay: 0.30s; }
      @keyframes dot-bounce {
        0%, 80%, 100% { transform: translateY(0); }
        40%           { transform: translateY(-5px); }
      }
    `;
    shadow.appendChild(style);

    // FAB button
    fab = document.createElement('button');
    fab.className = 'fab';
    fab.title = 'AI Life Copilot';
    fab.innerHTML = `✦<span class="fab-pulse"></span>`;
    fab.addEventListener('click', togglePanel);
    shadow.appendChild(fab);

    // Panel
    fabPanel = document.createElement('div');
    fabPanel.className = 'panel';
    fabPanel.innerHTML = `
      <div class="panel-header">⚡ AI Life Copilot</div>
      <div class="panel-actions">
        <button class="panel-btn" data-action="quick-reply">
          <span class="btn-icon">✉️</span>
          <span><span class="btn-label">Quick Reply</span><span class="btn-sub">Generate a contextual reply</span></span>
        </button>
        <button class="panel-btn" data-action="summarize">
          <span class="btn-icon">📝</span>
          <span><span class="btn-label">Summarize Page</span><span class="btn-sub">Get key points instantly</span></span>
        </button>
        <button class="panel-btn" data-action="whatshouldido">
          <span class="btn-icon">🧭</span>
          <span><span class="btn-label">What Should I Do?</span><span class="btn-sub">Get AI suggestions</span></span>
        </button>
      </div>
      <div class="panel-loading">
        <div class="dots"><span>·</span><span>·</span><span>·</span></div>
        <div>AI is thinking…</div>
      </div>
      <div class="panel-response"></div>
      <button class="panel-copy">📋 Copy Response</button>
    `;
    shadow.appendChild(fabPanel);

    // Bind panel buttons
    fabPanel.querySelectorAll('.panel-btn').forEach(btn => {
      btn.addEventListener('click', () => handleFabAction(btn.dataset.action, shadow));
    });

    fabPanel.querySelector('.panel-copy').addEventListener('click', () => {
      const text = fabPanel.querySelector('.panel-response').textContent;
      navigator.clipboard.writeText(text).catch(() => {});
    });

    // Close panel when clicking outside
    document.addEventListener('click', e => {
      if (!host.contains(e.target)) closePanel(shadow);
    }, true);
  }

  function togglePanel() {
    panelVisible ? closePanel(fabPanel.getRootNode()) : openPanel();
  }

  function openPanel() {
    fabPanel.classList.add('visible');
    panelVisible = true;
  }

  function closePanel() {
    fabPanel.classList.remove('visible');
    panelVisible = false;
  }

  async function handleFabAction(action, shadow) {
    const loadingEl  = fabPanel.querySelector('.panel-loading');
    const responseEl = fabPanel.querySelector('.panel-response');
    const copyBtn    = fabPanel.querySelector('.panel-copy');

    // Reset
    responseEl.classList.remove('visible');
    copyBtn.classList.remove('visible');
    loadingEl.classList.add('visible');

    const context = getPageText();

    const prompts = {
      'quick-reply':   `Write a concise, professional reply to this content. Be helpful and relevant.\n\nContent:\n${context}`,
      'summarize':     `Summarize this page in 3-5 bullet points. Be concise.\n\nContent:\n${context}`,
      'whatshouldido': `Based on this page, what are 3 specific actions the user should take right now?\n\nContent:\n${context}`,
    };

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompts[action] || `Help with: ${context}`,
          context,
          action,
        }),
      });

      const data = await response.json();
      const text = data.response || 'No response received.';

      loadingEl.classList.remove('visible');
      responseEl.textContent = text;
      responseEl.classList.add('visible');
      copyBtn.classList.add('visible');
    } catch (err) {
      loadingEl.classList.remove('visible');
      responseEl.textContent = '⚠ Could not reach server. Is the backend running?';
      responseEl.classList.add('visible');
    }
  }

  // ── TEXT SELECTION MINI-MENU ──────────────────────────────────────
  function initSelectionMenu() {
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keyup',   onMouseUp);
    document.addEventListener('mousedown', e => {
      if (selectionMenu && !selectionMenu.contains(e.target)) {
        removeSelectionMenu();
      }
    });
  }

  function onMouseUp(e) {
    setTimeout(() => {
      const selected = window.getSelection()?.toString().trim();
      if (selected && selected.length > 15) {
        showSelectionMenu(selected, e);
      } else {
        removeSelectionMenu();
      }
    }, 100);
  }

  function showSelectionMenu(selectedText, e) {
    removeSelectionMenu();

    const host = document.createElement('div');
    host.id = 'ai-copilot-selection-host';
    host.style.cssText = `
      position: absolute !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
    `;
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      .menu {
        display: flex; gap: 4px;
        background: #0d1421;
        border: 1px solid #1e3050;
        border-radius: 8px;
        padding: 5px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,212,255,0.06);
        animation: pop-in 0.15s cubic-bezier(.34,1.56,.64,1);
      }
      @keyframes pop-in {
        from { opacity: 0; transform: scale(0.9) translateY(5px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
      button {
        padding: 5px 10px;
        border-radius: 5px;
        background: transparent;
        border: 1px solid transparent;
        color: #d4e3f7;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        display: flex; align-items: center; gap: 4px;
        font-family: system-ui, sans-serif;
        transition: all 0.1s;
      }
      button:hover { background: #111b2e; border-color: #1e3050; }
      button.loading { color: #5b7a9d; pointer-events: none; }
    `;
    shadow.appendChild(style);

    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.innerHTML = `
      <button data-t="summarize">📝 Summarize</button>
      <button data-t="linkedin">💼 LinkedIn</button>
      <button data-t="caption">📸 Caption</button>
    `;
    shadow.appendChild(menu);

    // Position near selection
    const selection = window.getSelection();
    const range     = selection?.getRangeAt(0);
    const rect      = range?.getBoundingClientRect();

    if (rect) {
      host.style.left = `${window.scrollX + rect.left}px`;
      host.style.top  = `${window.scrollY + rect.top - 42}px`;
    }

    selectionMenu = host;

    menu.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.t;
        const allBtns = menu.querySelectorAll('button');
        allBtns.forEach(b => { b.classList.add('loading'); b.textContent = '⌛ Loading…'; });

        const promptMap = {
          summarize: `Summarize this text in 2-3 sentences:\n\n${selectedText}`,
          linkedin:  `Transform this into an engaging LinkedIn post with hashtags:\n\n${selectedText}`,
          caption:   `Write 3 creative social media captions for this:\n\n${selectedText}`,
        };

        try {
          const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: promptMap[type], context: selectedText, action: type }),
          });
          const data = await res.json();
          await navigator.clipboard.writeText(data.response || '');
          menu.innerHTML = `<button style="color:#00e5a0">✓ Copied to clipboard!</button>`;
          setTimeout(() => removeSelectionMenu(), 2000);
        } catch (_) {
          menu.innerHTML = `<button style="color:#ff4757">✕ Error — is server running?</button>`;
          setTimeout(() => removeSelectionMenu(), 2500);
        }
      });
    });
  }

  function removeSelectionMenu() {
    if (selectionMenu) {
      selectionMenu.remove();
      selectionMenu = null;
    }
  }

  // ── HELPERS ───────────────────────────────────────────────────────
  function getPageText() {
    const clone = document.body.cloneNode(true);
    ['script', 'style', 'nav', 'footer', 'iframe', 'noscript'].forEach(tag => {
      clone.querySelectorAll(tag).forEach(el => el.remove());
    });
    return (clone.innerText || clone.textContent || '')
      .replace(/\s{3,}/g, '\n\n')
      .trim()
      .substring(0, MAX_CONTEXT);
  }

  // ── MESSAGE LISTENER ──────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'TOGGLE_FAB') {
      const host = document.getElementById('ai-copilot-fab-host');
      if (msg.enabled && !host) {
        fabEnabled = true;
        createFAB();
        initSelectionMenu();
      } else if (!msg.enabled && host) {
        host.remove();
        fab = null; fabPanel = null;
        removeSelectionMenu();
      }
      sendResponse({ ok: true });
    }

    if (msg.type === 'GET_PAGE_CONTEXT') {
      sendResponse({ text: getPageText() });
    }
  });

  // ── START ─────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
