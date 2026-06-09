# Fynlo — Project & Profit Manager

A sharp, professional dashboard to manage customers, invoices, project costs, and profits.

---

## ⚡ Run Locally (Your Computer)

### Step 1 — Install Node.js
Download and install from https://nodejs.org (choose the "LTS" version)

### Step 2 — Set up the project
Open your terminal (Command Prompt on Windows, Terminal on Mac) and run:

```bash
# Navigate to the fynlo folder
cd path/to/fynlo

# Install dependencies
npm install

# Start the app
npm start
```

### Step 3 — Open in browser
Visit: **http://localhost:3000**

That's it! Your data is saved in `data/fynlo.db` (a local SQLite file).

---

## 🌐 Deploy to the Web (Free — so your father can use it from anywhere)

We'll use **Render.com** — it's free, reliable, and takes about 5 minutes.

### Step 1 — Put your code on GitHub

1. Go to https://github.com and create a free account
2. Click **New repository** → name it `fynlo` → click **Create repository**
3. In your terminal, inside the fynlo folder:

```bash
git init
git add .
git commit -m "Initial Fynlo app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/fynlo.git
git push -u origin main
```

### Step 2 — Deploy on Render

1. Go to https://render.com and sign up (free)
2. Click **New** → **Web Service**
3. Connect your GitHub account and select the `fynlo` repository
4. Fill in the settings:
   - **Name:** fynlo
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Click **Create Web Service**

Render will build and deploy your app in ~2 minutes.
You'll get a URL like: `https://fynlo.onrender.com`

**Share that URL with your father — he can use it from any device, anywhere.**

### ⚠️ Important note about free Render hosting
On the free tier, the app "sleeps" after 15 minutes of inactivity and takes ~30 seconds to wake up on the next visit. To avoid this, you can upgrade to Render's $7/month plan, or use **Railway.app** (also has a free tier with no sleep).

---

## 🗄️ Database

Data is stored in a SQLite file at `data/fynlo.db`.

**On Render (cloud):** The database resets on each deploy on the free tier. To keep data permanently, either:
- Upgrade to Render's paid plan (persistent disk), or
- Switch to a free Postgres database on Render (ask for help if needed)

**Locally:** Your data is always saved permanently in `data/fynlo.db`.

---

## 📁 Project Structure

```
fynlo/
├── server.js          ← Backend (Node.js + Express + SQLite)
├── package.json       ← Dependencies
├── .gitignore
├── data/
│   └── fynlo.db       ← Your database (auto-created)
└── public/
    └── index.html     ← Frontend (all UI in one file)
```

---

## 🔧 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/projects | List all projects (supports ?search= and ?status=) |
| GET | /api/projects/:id | Get one project |
| POST | /api/projects | Create new project |
| PUT | /api/projects/:id | Update project |
| DELETE | /api/projects/:id | Delete project |
| GET | /api/metrics | Summary totals |
