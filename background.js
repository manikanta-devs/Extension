/**
 * AI Life Copilot — Background Service Worker
 * ─────────────────────────────────────────────────────────────────
 * Handles:
 *   - Keyboard shortcut (Ctrl+Shift+A) → open popup
 *   - Message routing between popup ↔ content scripts
 *   - Extension lifecycle events
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

// ── INSTALL / UPDATE ──────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.log('[AI Copilot] Extension installed successfully.');

    // Set default storage values on first install
    chrome.storage.local.set({
      enabled:        true,
      consentGranted: false,  // user must explicitly allow page reading
    });
  }

  if (reason === 'update') {
    console.log('[AI Copilot] Extension updated.');
  }
});

// ── KEYBOARD SHORTCUT ─────────────────────────────────────────────
// Ctrl+Shift+A (Mac: Cmd+Shift+A) — defined in manifest.json
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-copilot') {

    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Toggle enabled state in storage
    const data = await chrome.storage.local.get('enabled');
    const newState = !data.enabled;
    await chrome.storage.local.set({ enabled: newState });

    // Notify content script on the active tab
    chrome.tabs.sendMessage(tab.id, {
      type: 'TOGGLE_FAB',
      enabled: newState,
    }).catch(() => {
      // Content script may not be ready on some pages (chrome://, etc.)
    });

    // Also open the popup when enabling via shortcut
    if (newState) {
      chrome.action.openPopup().catch(() => {
        // openPopup() is not supported on all platforms — safe to ignore
      });
    }
  }
});

// ── MESSAGE ROUTING ────────────────────────────────────────────────
// Relay messages from popup → active content script when needed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Relay to active tab content script
  if (message.target === 'content') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) {
        sendResponse({ error: 'No active tab found.' });
        return;
      }
      chrome.tabs.sendMessage(tab.id, message)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ error: err.message }));
    });
    return true; // keep message channel open for async
  }

  // Health check ping from popup
  if (message.type === 'PING') {
    sendResponse({ status: 'alive', version: chrome.runtime.getManifest().version });
  }
});

// ── ICON BADGE ────────────────────────────────────────────────────
// Update badge when enabled state changes
chrome.storage.onChanged.addListener((changes) => {
  if ('enabled' in changes) {
    const enabled = changes.enabled.newValue;
    chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff4757' });
  }
});
