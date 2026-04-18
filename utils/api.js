'use strict';

const API_CONFIG = {
  baseUrl: 'http://localhost:3000',
  endpoint: '/generate',
  timeoutMs: 30000,
};

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timed out.')), timeoutMs);
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function callAI(prompt, context = '', action = 'custom') {
  const payload = {
    prompt: String(prompt || ''),
    context: String(context || ''),
    action: String(action || 'custom'),
  };

  const response = await withTimeout(fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }), API_CONFIG.timeoutMs);

  let data = {};
  try {
    data = await response.json();
  } catch (_) {}

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Could not reach backend. Make sure the server is running.');
  }

  return data.response || '';
}

window.callAI = callAI;
