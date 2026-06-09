const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// Pure JS file-based database - no compilation needed!
const DB_FILE = path.join(__dirname, 'data', 'fynlo.json');

function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) return { projects: [], nextId: 1 };
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch { return { projects: [], nextId: 1 }; }
}

function writeDB(data) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function calcProfit(p) {
  return (parseFloat(p.project_cost) || 0) - (parseFloat(p.investment_amount) || 0);
}

// Seed demo data if empty
const initial = readDB();
if (initial.projects.length === 0) {
  const seed = [
    { customer_name: 'Ravi Sharma', work_description: 'E-commerce platform', project_cost: 85000, work_completed_by: 'Amit Kumar', investor_name: 'Startup Fund', investment_amount: 30000, status: 'Completed' },
    { customer_name: 'Meera Patel', work_description: 'Mobile app development', project_cost: 120000, work_completed_by: 'Priya Singh', investor_name: 'Self-funded', investment_amount: 0, status: 'Pending' },
    { customer_name: 'Tech Innovations', work_description: 'CRM integration', project_cost: 45000, work_completed_by: 'Rahul Verma', investor_name: 'Anand Mehta', investment_amount: 15000, status: 'Completed' },
    { customer_name: 'Global Traders', work_description: 'Inventory system', project_cost: 60000, work_completed_by: 'Sneha Joshi', investor_name: '', investment_amount: 0, status: 'Pending' },
  ];
  let id = 1;
  initial.projects = seed.map(s => ({ ...s, id: id++, profit: calcProfit(s), created_at: new Date().toISOString() }));
  initial.nextId = id;
  writeDB(initial);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET all projects
app.get('/api/projects', (req, res) => {
  let { projects } = readDB();
  const { search, status } = req.query;
  if (search) {
    const q = search.toLowerCase();
    projects = projects.filter(p => p.customer_name.toLowerCase().includes(q) || p.work_description.toLowerCase().includes(q));
  }
  if (status) projects = projects.filter(p => p.status === status);
  projects.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(projects);
});

// GET metrics
app.get('/api/metrics', (req, res) => {
  const { projects } = readDB();
  res.json({
    total_profit: projects.reduce((s, p) => s + (p.profit || 0), 0),
    total_investment: projects.reduce((s, p) => s + (parseFloat(p.investment_amount) || 0), 0),
    total_cost: projects.reduce((s, p) => s + (parseFloat(p.project_cost) || 0), 0),
    total_projects: projects.length,
    active_projects: projects.filter(p => p.status === 'Pending').length,
  });
});

// GET single project
app.get('/api/projects/:id', (req, res) => {
  const { projects } = readDB();
  const row = projects.find(p => p.id === parseInt(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found.' });
  res.json(row);
});

// POST create
app.post('/api/projects', (req, res) => {
  const { customer_name, work_description, project_cost, work_completed_by, investor_name, investment_amount, status } = req.body;
  if (!customer_name || !work_description) return res.status(400).json({ error: 'Customer name and work description are required.' });
  const db = readDB();
  const entry = {
    id: db.nextId++,
    customer_name, work_description,
    project_cost: parseFloat(project_cost) || 0,
    work_completed_by: work_completed_by || '',
    investor_name: investor_name || '',
    investment_amount: parseFloat(investment_amount) || 0,
    status: status || 'Pending',
    created_at: new Date().toISOString(),
  };
  entry.profit = calcProfit(entry);
  db.projects.unshift(entry);
  writeDB(db);
  res.status(201).json(entry);
});

// PUT update
app.put('/api/projects/:id', (req, res) => {
  const db = readDB();
  const idx = db.projects.findIndex(p => p.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found.' });
  const { customer_name, work_description, project_cost, work_completed_by, investor_name, investment_amount, status } = req.body;
  const updated = {
    ...db.projects[idx],
    customer_name, work_description,
    project_cost: parseFloat(project_cost) || 0,
    work_completed_by: work_completed_by || '',
    investor_name: investor_name || '',
    investment_amount: parseFloat(investment_amount) || 0,
    status,
  };
  updated.profit = calcProfit(updated);
  db.projects[idx] = updated;
  writeDB(db);
  res.json(updated);
});

// DELETE
app.delete('/api/projects/:id', (req, res) => {
  const db = readDB();
  const idx = db.projects.findIndex(p => p.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found.' });
  db.projects.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// Serve frontend
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`✅ Fynlo running at http://localhost:${PORT}`));
