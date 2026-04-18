/**
 * AI Life Copilot — /generate Route
 * ─────────────────────────────────────────────────────────────────
 * POST /generate
 * Body: { prompt, context, action }
 *
 * Security layers:
 *   1. Input validation (required fields, types)
 *   2. Length limits (prevent prompt injection / abuse)
 *   3. Character sanitization (strip scripts/html)
 *   4. Suspicious pattern detection
 *   5. Rate limiting (applied in server.js)
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const validator = require('validator');
const { generateAIResponse } = require('../utils/ai');

// ── CONSTANTS ─────────────────────────────────────────────────────
const LIMITS = {
  prompt:  500,   // Max prompt characters
  context: 3000,  // Max context characters
};

const VALID_ACTIONS = ['analyze', 'reply', 'transform', 'suggest', 'custom',
                       'summarize', 'linkedin', 'caption', 'tweet', 'formal',
                       'casual', 'quick-reply', 'whatshouldido', 'general'];

// Patterns that suggest prompt injection or abuse attempts
const SUSPICIOUS_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+(?:an?\s+)?(?:evil|jailbreak|DAN)/i,
  /system\s+prompt/i,
  /\bDAN\b/,
  /forget\s+your\s+(role|instructions|training)/i,
  /<script[\s>]/i,
  /javascript:/i,
];

// ── VALIDATION MIDDLEWARE ─────────────────────────────────────────
function validateRequest(req, res, next) {
  const { prompt, context, action } = req.body;

  // ── 1. Type checks ──
  if (typeof prompt !== 'string' && typeof context !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Either prompt or context must be provided.',
    });
  }

  // ── 2. At least one non-empty value ──
  const cleanPrompt  = (prompt  || '').trim();
  const cleanContext = (context || '').trim();

  if (!cleanPrompt && !cleanContext) {
    return res.status(400).json({
      success: false,
      message: 'Request is empty. Provide a prompt or page context.',
    });
  }

  // ── 3. Length limits ──
  if (cleanPrompt.length > LIMITS.prompt) {
    return res.status(400).json({
      success: false,
      message: `Prompt exceeds maximum length of ${LIMITS.prompt} characters.`,
    });
  }

  if (cleanContext.length > LIMITS.context) {
    return res.status(400).json({
      success: false,
      message: `Context exceeds maximum length of ${LIMITS.context} characters.`,
    });
  }

  // ── 4. Validate action ──
  const safeAction = action && typeof action === 'string' ? action : 'custom';
  if (!VALID_ACTIONS.includes(safeAction)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid action type.',
    });
  }

  // ── 5. Suspicious pattern check ──
  const combined = `${cleanPrompt} ${cleanContext}`;
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(combined)) {
      console.warn(`[Security] Suspicious pattern detected from IP: ${req.ip}`);
      return res.status(400).json({
        success: false,
        message: 'Request contains disallowed content.',
      });
    }
  }

  // ── 6. Sanitize & attach to request ──
  req.safeData = {
    prompt:  sanitize(cleanPrompt),
    context: sanitize(cleanContext),
    action:  safeAction,
  };

  next();
}

// ─────────────────────────────────────────────────────────────────
// Sanitize a string: strip tags, normalize whitespace
// ─────────────────────────────────────────────────────────────────
function sanitize(str) {
  return validator.escape(
    str
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{3,}/g, '\n\n')
      .trim()
  );
}

// ─────────────────────────────────────────────────────────────────
// POST /generate
// ─────────────────────────────────────────────────────────────────
router.post('/', validateRequest, async (req, res) => {
  const { prompt, context, action } = req.safeData;

  // Assemble the full prompt for the AI
  // The prompt may already include context (built in popup.js),
  // but we add context here as a fallback if prompt is minimal.
  let fullPrompt = prompt;

  if (context && !prompt.includes(context.substring(0, 100))) {
    // Avoid duplicating context if it's already embedded in the prompt
    fullPrompt = context
      ? `${prompt}\n\nPage Context:\n${context}`
      : prompt;
  }

  try {
    const response = await generateAIResponse(fullPrompt, action);

    return res.json({
      success: true,
      response,
      action,
    });

  } catch (err) {
    console.error('[AI Copilot] Generation error:', err.message);

    // Distinguish user-facing errors from internal ones
    if (err.message.includes('API key')) {
      return res.status(500).json({
        success: false,
        message: 'Server configuration error. Contact support.',
      });
    }

    if (err.message.includes('blocked')) {
      return res.status(422).json({
        success: false,
        message: 'Your request was blocked by content safety filters. Please rephrase.',
      });
    }

    if (err.message.includes('quota') || err.message.includes('429')) {
      return res.status(429).json({
        success: false,
        message: 'AI quota exceeded. Please try again in a moment.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'AI generation failed. Please try again.',
    });
  }
});

module.exports = router;
