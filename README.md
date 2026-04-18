# ✦ AI Life Copilot — Chrome Extension

> A production-ready, security-first AI browser assistant for job applications,
> smart replies, and productivity — powered by Google Gemini.

---

## 📁 Project Structure

```
ai-life-copilot/
├── extension/                  ← Chrome Extension files
│   ├── manifest.json           ← Extension config (MV3)
│   ├── popup.html              ← Main popup UI
│   ├── popup.css               ← Neural Dark theme styles
│   ├── popup.js                ← Popup logic & AI action handlers
│   ├── content.js              ← Floating button + selection menu
│   ├── background.js           ← Service worker (keyboard shortcut)
│   ├── utils/
│   │   └── api.js              ← Backend communication utility
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
│
├── backend/                    ← Node.js secure proxy server
│   ├── server.js               ← Express app (CORS, rate limit, helmet)
│   ├── routes/
│   │   └── generate.js         ← POST /generate endpoint
│   ├── utils/
│   │   └── ai.js               ← Gemini API integration
│   ├── package.json
│   └── .env.example            ← Environment variable template
│
├── generate-icons.js           ← Icon generator script
└── README.md                   ← This file
```

---

## 🔐 Security Architecture

```
User (Browser Extension)
        │
        │  POST /generate  { prompt, context, action }
        │  (sanitized, length-limited, pattern-checked)
        ▼
┌─────────────────────────────┐
│  Backend Proxy (Node.js)    │
│  ✓ Helmet headers           │
│  ✓ CORS restricted          │
│  ✓ Rate limit: 10 req/min   │
│  ✓ Input validation         │
│  ✓ No personal data logged  │
│  ✓ GEMINI_API_KEY in .env   │
└─────────────┬───────────────┘
              │  API key never exposed to browser
              ▼
       Google Gemini API
```

**The API key NEVER touches the browser.** It only lives in your backend `.env` file.

---

## 🚀 Quick Start

### Step 1 — Get your Gemini API Key (free)

1. Go to **https://aistudio.google.com/app/apikey**
2. Click **Create API Key**
3. Copy the key — you'll need it in Step 3

---

### Step 2 — Start the Backend Server

```bash
# Navigate to backend folder
cd ai-life-copilot/backend

# Install dependencies
npm install

# Create your environment file
cp .env.example .env
```

---

### Step 3 — Add your API Key

Open `backend/.env` in any text editor:

```bash
# backend/.env

GEMINI_API_KEY=AIza...your_key_here    ← Paste your key here
PORT=3000
ALLOWED_ORIGINS=*
RATE_LIMIT_MAX=10
RATE_LIMIT_WINDOW_MS=60000
NODE_ENV=development
```

> ⚠️ **NEVER commit `.env` to git!** Add it to `.gitignore`.

---

### Step 4 — Run the Server

```bash
# In the backend/ folder:
npm start

# For development with auto-restart:
npm run dev
```

You should see:
```
  ✦ AI Life Copilot Backend
  ✓ Running on http://localhost:3000
  ✓ Gemini API key: configured
```

Test it works:
```bash
curl http://localhost:3000/health
# → { "status": "ok", "service": "AI Life Copilot API" }
```

---

### Step 5 — Load the Extension in Chrome

1. Open Chrome and go to **`chrome://extensions`**
2. Enable **Developer Mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the **`ai-life-copilot/extension`** folder
5. The AI Life Copilot icon appears in your toolbar ✓

---

### Step 6 — Use the Extension

1. Click the **✦** icon in the Chrome toolbar to open the popup
2. On first use, click **Allow** when asked to read page content
3. Try these features:
   - **Analyze Page** — AI summary of any webpage
   - **Generate Reply** — Smart reply for emails and social posts
   - **Transform Text** — Select text → LinkedIn post, caption, etc.
   - **What Should I Do?** — Contextual action suggestions
   - **Floating Button** — Click the **✦** button on any page
   - **Text Selection** — Select any text for the mini action menu
4. Use **`Ctrl+Shift+A`** (Mac: `Cmd+Shift+A`) to toggle the extension

---

## ⚙️ Configuration

### Connecting Extension to a Different Backend URL

If you deploy the backend to a cloud server, update this line in
`extension/utils/api.js`:

```js
const API_CONFIG = {
  baseUrl: 'https://your-backend.com',  // ← change this
  // ...
};
```

### Locking CORS to your Extension ID (Production)

1. Find your extension ID in `chrome://extensions`
2. In `backend/.env`:

```bash
ALLOWED_ORIGINS=chrome-extension://abcdefghijklmnopqrstuvwxyz123456
```

### Changing Rate Limits

In `backend/.env`:
```bash
RATE_LIMIT_MAX=20          # Allow 20 requests...
RATE_LIMIT_WINDOW_MS=60000 # ...per 60 seconds per IP
```

---

## 🛠️ Development Notes

### Testing the API Manually

```bash
curl -X POST http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Summarize this in 2 sentences.", "context": "Chrome is a web browser made by Google.", "action": "summarize"}'
```

Expected response:
```json
{
  "success": true,
  "response": "Chrome is a popular web browser developed by Google. It is known for its speed, simplicity, and integration with Google services.",
  "action": "summarize"
}
```

### Replacing Icons

Replace the placeholder PNGs in `extension/icons/` with real images:
- `icon16.png` — 16×16px (toolbar)
- `icon48.png` — 48×48px (extensions page)
- `icon128.png` — 128×128px (Chrome Web Store)

Use any tool: Figma, Canva, DALL-E, or the icon generator script:
```bash
npm install canvas    # Install canvas module
node generate-icons.js
```

---

## 🚢 Deploying to Production

### Deploy Backend to Railway / Render / Fly.io

**Railway (recommended — free tier):**
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

Set environment variables in the Railway dashboard:
- `GEMINI_API_KEY` = your key
- `NODE_ENV` = production
- `ALLOWED_ORIGINS` = chrome-extension://YOUR_EXTENSION_ID

**Then update** `extension/utils/api.js`:
```js
baseUrl: 'https://your-app.railway.app'
```

---

## 🔒 Security Checklist

- [x] API key stored only in `.env` (backend only)
- [x] `.env` never committed to version control
- [x] CORS restricted to extension origin (in production)
- [x] Rate limiting: 10 requests/minute/IP
- [x] Input length limits (500 chars prompt, 3000 chars context)
- [x] HTML/script tag stripping on both frontend and backend
- [x] Prompt injection pattern detection
- [x] No personal content logged
- [x] Helmet HTTP security headers
- [x] Minimum Chrome permissions (activeTab, storage, scripting)
- [x] User consent required before reading page content
- [x] Shadow DOM for content script UI isolation

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Cannot reach backend" | Make sure `npm start` is running in `/backend` |
| "GEMINI_API_KEY not set" | Check your `.env` file has a real key |
| Extension not showing | Reload it in `chrome://extensions` |
| Floating button missing | Allow page reading in the popup consent banner |
| Rate limit hit | Wait 1 minute, or increase `RATE_LIMIT_MAX` in `.env` |
| CORS errors | Make sure `ALLOWED_ORIGINS=*` in dev `.env` |

---

## 📜 License

MIT — free to use and modify.
