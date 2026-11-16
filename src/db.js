'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { STATUSES } = require('./validate');

const DEFAULT_DB_FILE = path.join(__dirname, '..', 'data', 'fynlo.db');
const LEGACY_JSON_FILE = path.join(__dirname, '..', 'data', 'fynlo.json');

const statusList = STATUSES.map((s) => `'${s}'`).join(', ');

// `profit` is a generated column, so it can never drift out of sync with cost/investment.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projects (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name     TEXT    NOT NULL CHECK (length(trim(customer_name)) > 0),
    work_description  TEXT    NOT NULL CHECK (length(trim(work_description)) > 0),
    project_cost      REAL    NOT NULL DEFAULT 0 CHECK (project_cost >= 0),
    work_completed_by TEXT    NOT NULL DEFAULT '',
    investor_name     TEXT    NOT NULL DEFAULT '',
    investment_amount REAL    NOT NULL DEFAULT 0 CHECK (investment_amount >= 0),
    status            TEXT    NOT NULL DEFAULT 'Pending' CHECK (status IN (${statusList})),
    created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    profit            REAL    GENERATED ALWAYS AS (project_cost - investment_amount) VIRTUAL
  );
  CREATE INDEX IF NOT EXISTS idx_projects_status  ON projects (status);
  CREATE INDEX IF NOT EXISTS idx_projects_created ON projects (created_at);
`;

function openDatabase(file = process.env.DB_PATH || DEFAULT_DB_FILE) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

const count = (db) => db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;

const INSERT_SQL = `
  INSERT INTO projects
    (customer_name, work_description, project_cost, work_completed_by,
     investor_name, investment_amount, status, created_at, updated_at)
  VALUES
    (@customer_name, @work_description, @project_cost, @work_completed_by,
     @investor_name, @investment_amount, @status, @created_at, @created_at)
`;

function insertMany(db, rows) {
  const stmt = db.prepare(INSERT_SQL);
  db.transaction((list) => list.forEach((r) => stmt.run(r)))(rows);
}

/** One-time import of data written by the old JSON-file version of Fynlo. */
function importLegacyJson(db, file = LEGACY_JSON_FILE) {
  if (count(db) > 0 || !fs.existsSync(file)) return 0;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return 0;
  }
  const rows = (parsed.projects || [])
    .filter((p) => p && p.customer_name && p.work_description)
    .map((p) => ({
      customer_name: String(p.customer_name),
      work_description: String(p.work_description),
      project_cost: Math.max(0, Number(p.project_cost) || 0),
      work_completed_by: p.work_completed_by || '',
      investor_name: p.investor_name || '',
      investment_amount: Math.max(0, Number(p.investment_amount) || 0),
      status: STATUSES.includes(p.status) ? p.status : 'Pending',
      created_at: p.created_at || new Date().toISOString(),
    }));
  if (rows.length) insertMany(db, rows);
  return rows.length;
}

function seedDemoData(db) {
  if (count(db) > 0) return 0;
  const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();
  const rows = [
    ['Ravi Sharma', 'E-commerce platform', 85000, 'Amit Kumar', 'Startup Fund', 30000, 'Completed', 150],
    ['Meera Patel', 'Mobile app development', 120000, 'Priya Singh', 'Self-funded', 0, 'In Progress', 120],
    ['Tech Innovations', 'CRM integration', 45000, 'Rahul Verma', 'Anand Mehta', 15000, 'Completed', 90],
    ['Global Traders', 'Inventory system', 60000, 'Sneha Joshi', '', 0, 'Pending', 60],
    ['Kavya Textiles', 'Billing software', 72000, 'Amit Kumar', 'Anand Mehta', 20000, 'Completed', 30],
    ['Orbit Logistics', 'Fleet tracking dashboard', 98000, 'Rahul Verma', 'Startup Fund', 40000, 'In Progress', 3],
  ].map(([c, w, cost, by, inv, amt, status, d]) => ({
    customer_name: c, work_description: w, project_cost: cost, work_completed_by: by,
    investor_name: inv, investment_amount: amt, status, created_at: daysAgo(d),
  }));
  insertMany(db, rows);
  return rows.length;
}

/** Opens the DB, migrates legacy JSON data if present, otherwise seeds demo rows. */
function initDatabase(file) {
  const db = openDatabase(file);
  const imported = importLegacyJson(db);
  if (!imported && process.env.SEED_DEMO !== 'false') seedDemoData(db);
  return db;
}

module.exports = { openDatabase, initDatabase, insertMany, seedDemoData, importLegacyJson };
