# AIAgents

A collection of AI-powered automation agents and tools built to automate content, lead generation, and productivity workflows.

---

## Projects

### 1. Colix AI Chrome Extension (`Colix-AI-Chrome-Addon`)

A browser extension for managing and inserting text shortcuts on any webpage.

**Features:**
- Create custom shortcuts (e.g. `-ty` → `Thank you so much`)
- Type the shortcut directly on any webpage to auto-expand
- Type `//` to open a popup showing all saved shortcuts

**Usage:**
- Load the extension in Chrome via `chrome://extensions` → **Load unpacked**
- Create shortcuts from the extension popup
- Use shortcuts anywhere on the web

---

### 2. Instagram Lead Finder Agent (`Instagram-Auto-post`)

An AI-powered agent that scrapes Instagram posts and reels based on search queries, extracts lead information from captions and comments, and exports to Google Sheets.

**Features:**
- Search Instagram by custom queries via Apify
- Extracts emails, names, company names, and contact details using AI
- Auto-exports leads to Google Sheets

**Setup:**
```bash
# Root — start backend
python app.py

# client/ — start frontend
cd client
npm run dev
```

Access at: `http://localhost:5173`

**Requirements:**
- Apify API token
- Google Service Account credentials (for Sheets access)
- `.env` file with secrets (see `.env.example`)

---

### 3. LinkedIn Auto Post Agent (`Linkedin-auto-post`)

An AI-powered agent that finds viral LinkedIn posts based on search queries, rewrites them using AI, generates an image, and publishes the post to a connected LinkedIn profile.

**Features:**
- Scrapes viral LinkedIn posts via Apify
- AI picks the most viral content
- Rewrites post content using AI
- Generates a matching image
- Auto-publishes to connected LinkedIn profile

**Setup:**
```bash
# Root — start backend
python app.py

# dashboard/client/ — start frontend
cd dashboard/client
npm run dev
```

Access at: `http://localhost:5173`

**Requirements:**
- Apify API token
- LinkedIn account connected
- `.env` file with secrets (see `.env.example`)