# 💊 gamot-reminder-ph

A Philippine medicine reminder web app — deployable on **Vercel** in one click, backed by **Google Sheets** via Google Apps Script.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/gamot-reminder-ph)

---

## 🚀 Deploy to Vercel (3 steps)

### Step 1 — Set up the Google Apps Script backend

1. Go to [script.google.com](https://script.google.com) → **New Project**
2. Rename project to `gamot-reminder-ph`
3. Paste the contents of `Code.gs` into the editor
4. Create an HTML file named `index` (File → New → HTML) — leave it empty or paste `index.html` there too
5. Click **Deploy → New Deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy** → **copy the Web App URL**

### Step 2 — Push this repo to GitHub

```bash
git clone https://github.com/YOUR_USERNAME/gamot-reminder-ph
cd gamot-reminder-ph
git add .
git commit -m "initial commit"
git push
```

### Step 3 — Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Framework: **Other** (or auto-detected as Static)
4. Click **Deploy**

> The frontend is a fully static HTML file — no build step needed. Vercel serves `index.html` instantly.

---

## 🔌 Connecting to Your Backend

After deploying, open the live site and you'll be prompted to enter your **Apps Script Web App URL** the first time you log in. The app stores it in your browser.

Alternatively, hard-code it in `index.html` by finding this line:

```javascript
var SCRIPT_URL = localStorage.getItem('scriptUrl') || '';
```

And replacing with:

```javascript
var SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

---

## 📁 Files

| File | Purpose |
|------|---------|
| `index.html` | The entire frontend (self-contained) |
| `Code.gs` | Google Apps Script backend (deploy separately) |
| `vercel.json` | Vercel static site config |

---

## 🇵🇭 Features

- 💊 Medicine reminders with email notifications
- 🍼 PH infant milk formula database
- 🌐 English / Filipino language toggle
- 📧 Email reminders sent via Gmail (Google Apps Script)
- 🔐 User accounts with SHA-256 hashed passwords
- 📊 Google Sheets as the database (free, no server needed)

---

## 📄 License

MIT
