/**
 * AI Life Copilot — Express Backend Server
 * ─────────────────────────────────────────────────────────────────
 * Security stack:
 *   ✓ Helmet (HTTP security headers)
 *   ✓ CORS (locked to extension origin)
 *   ✓ Rate limiting (10 req / min / IP)
 *   ✓ JSON body size limit
 *   ✓ Input validation in route layer
 *   ✓ No personal data logged
 *   ✓ API key only in environment variable
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

// ── ENVIRONMENT VARIABLES ─────────────────────────────────────────
// MUST be loaded before anything else
require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');

const generateRoute = require('./generate');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── SECURITY MIDDLEWARE ───────────────────────────────────────────

// 1. Helmet — sets secure HTTP headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // Allow extension requests
}));

// 2. CORS — restrict who can call this API
//    In production: set ALLOWED_ORIGINS to your extension ID
//    e.g., chrome-extension://your-extension-id-here
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map(o => o.trim());

const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (e.g., Postman, curl in dev)
    if (!origin) {
      return callback(null, true);
    }
    // Wildcard — allow all (development only)
    if (allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    // Check extension origin or explicit list
    if (
      origin.startsWith('chrome-extension://') ||
      origin.startsWith('moz-extension://') ||
      allowedOrigins.includes(origin)
    ) {
      return callback(null, true);
    }
    console.warn(`[Security] CORS blocked origin: ${origin}`);
    callback(new Error(`CORS policy does not allow origin: ${origin}`));
  },
  methods:     ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Pre-flight

// 3. JSON body parser — strict size limit (50 KB)
app.use(express.json({ limit: '50kb' }));

// 4. Rate limiting — prevents abuse
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000, // 1 minute
  max:      parseInt(process.env.RATE_LIMIT_MAX)        || 10,        // 10 requests

  standardHeaders: true,  // Return rate limit info in headers
  legacyHeaders:   false,

  // Custom response when rate limit exceeded
  handler(req, res) {
    console.warn(`[Rate Limit] IP ${req.ip} exceeded limit`);
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please wait 1 minute before trying again.',
      retryAfter: Math.ceil(this.windowMs / 1000),
    });
  },

  // Key by IP address
  keyGenerator: (req) => req.ip,
});

app.use('/generate', limiter);

// ── ROUTES ────────────────────────────────────────────────────────
app.use('/generate', generateRoute);

// ── HEALTH CHECK ─────────────────────────────────────────────────
// Safe status endpoint — reveals no sensitive info
app.get('/health', (_req, res) => {
  res.json({
    status:  'ok',
    service: 'AI Life Copilot API',
    time:    new Date().toISOString(),
  });
});

// ── 404 HANDLER ───────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found.' });
});

// ── GLOBAL ERROR HANDLER ─────────────────────────────────────────
app.use((err, _req, res, _next) => {
  // CORS errors
  if (err.message && err.message.startsWith('CORS')) {
    return res.status(403).json({ success: false, message: err.message });
  }
  // JSON parse errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON body.' });
  }
  // Body too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body too large.' });
  }

  // Generic — don't leak stack traces
  console.error('[Server Error]', err.message);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ── START ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ✦ AI Life Copilot Backend');
  console.log(`  ✓ Running on http://localhost:${PORT}`);
  console.log(`  ✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  ✓ Rate limit: ${process.env.RATE_LIMIT_MAX || 10} req/min`);
  console.log(`  ${process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'
    ? '✓ Gemini API key: configured'
    : '✕ Gemini API key: NOT SET — add to .env file!'}`);
  console.log('');
});

module.exports = app;
