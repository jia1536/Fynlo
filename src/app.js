'use strict';

const express = require('express');
const path = require('path');
const { createRepository, SORTABLE } = require('./repository');
const { STATUSES, validateProject, validateStatus } = require('./validate');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const CSV_COLUMNS = [
  'id', 'customer_name', 'work_description', 'project_cost', 'work_completed_by',
  'investor_name', 'investment_amount', 'profit', 'status', 'created_at',
];

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Parses and validates ?search, ?status, ?sort, ?order, ?limit, ?offset. */
function parseListQuery(q) {
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const out = { search: str(q.search).slice(0, 100), status: str(q.status) };
  if (out.status && !STATUSES.includes(out.status)) {
    throw new HttpError(400, `Invalid status. Use one of: ${STATUSES.join(', ')}.`);
  }
  out.sort = str(q.sort) || 'created_at';
  if (!SORTABLE[out.sort]) throw new HttpError(400, `Invalid sort. Use one of: ${Object.keys(SORTABLE).join(', ')}.`);
  out.order = (str(q.order) || 'desc').toLowerCase();
  if (!['asc', 'desc'].includes(out.order)) throw new HttpError(400, 'Invalid order. Use asc or desc.');
  if (q.limit !== undefined) {
    const n = Number(q.limit);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'limit must be a positive integer.');
    out.limit = Math.min(n, 200);
  }
  if (q.offset !== undefined) {
    const n = Number(q.offset);
    if (!Number.isInteger(n) || n < 0) throw new HttpError(400, 'offset must be zero or a positive integer.');
    out.offset = n;
  }
  return out;
}

// Quote CSV cells and neutralise spreadsheet formulas (=, +, -, @) in user text.
function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function createApp(db) {
  const repo = createRepository(db);
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
    });
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(PUBLIC_DIR));

  const api = express.Router();
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  api.param('id', (req, res, next, raw) => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1) return next(new HttpError(400, 'Project id must be a positive integer.'));
    req.projectId = id;
    next();
  });

  const found = (row) => {
    if (!row) throw new HttpError(404, 'Project not found.');
    return row;
  };
  const checked = (result) => {
    const messages = Object.values(result.errors);
    if (messages.length) throw new HttpError(400, messages[0], result.errors);
    return result.value;
  };

  api.get('/health', (req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', uptime_seconds: Math.round(process.uptime()) });
  });

  api.get('/projects', (req, res) => {
    const { rows, total } = repo.list(parseListQuery(req.query));
    res.set('X-Total-Count', String(total));
    res.json(rows);
  });

  api.get('/projects/:id', (req, res) => res.json(found(repo.get(req.projectId))));

  api.post('/projects', (req, res) => {
    const data = checked(validateProject(req.body));
    const created = repo.create(data);
    res.status(201).location(`/api/projects/${created.id}`).json(created);
  });

  api.put('/projects/:id', (req, res) => {
    const existing = found(repo.get(req.projectId));
    const data = checked(validateProject(req.body, { defaultStatus: existing.status }));
    res.json(repo.update(req.projectId, data));
  });

  api.patch('/projects/:id/status', (req, res) => {
    found(repo.get(req.projectId));
    const errors = {};
    const status = validateStatus((req.body || {}).status, errors, null);
    if (!status && !errors.status) errors.status = 'Status is required.';
    res.json(repo.setStatus(req.projectId, checked({ value: status, errors })));
  });

  api.delete('/projects/:id', (req, res) => {
    found(repo.get(req.projectId));
    repo.remove(req.projectId);
    res.json({ success: true });
  });

  api.get('/metrics', (req, res) => res.json(repo.metrics()));

  api.get('/export.csv', (req, res) => {
    const { limit, offset, ...filter } = parseListQuery(req.query);
    const { rows } = repo.list(filter);
    const lines = [CSV_COLUMNS.join(',')].concat(rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(',')));
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="fynlo-projects-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
    res.send(`\uFEFF${lines.join('\r\n')}\r\n`); // BOM so Excel reads UTF-8 (₹, names) correctly
  });

  api.use((req, res, next) => next(new HttpError(404, 'Endpoint not found.')));
  app.use('/api', api);

  // Single-page frontend
  app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}

module.exports = { createApp };
