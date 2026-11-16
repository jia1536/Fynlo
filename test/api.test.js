'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase, insertMany } = require('../src/db');
const { createApp } = require('../src/app');

async function startServer(rows = []) {
  const db = openDatabase(':memory:');
  if (rows.length) insertMany(db, rows);
  const server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, raw } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const type = res.headers.get('content-type') || '';
    return { res, status: res.status, data: type.includes('json') ? await res.json() : await res.text() };
  };
  return { call, close: () => { server.close(); db.close(); } };
}

const row = (o = {}) => ({
  customer_name: 'Acme', work_description: 'Website', project_cost: 1000, work_completed_by: '',
  investor_name: '', investment_amount: 0, status: 'Pending', created_at: new Date().toISOString(), ...o,
});

test('create computes profit in SQLite and returns 201 + Location', async () => {
  const s = await startServer();
  const { res, status, data } = await s.call('/api/projects', {
    method: 'POST',
    body: { customer_name: '  Acme  ', work_description: 'Site', project_cost: '5000', investment_amount: 1500.555 },
  });
  assert.equal(status, 201);
  assert.equal(data.customer_name, 'Acme');
  assert.equal(data.project_cost, 5000);
  assert.equal(data.investment_amount, 1500.56);
  assert.equal(data.profit, 3499.44);
  assert.equal(data.status, 'Pending');
  assert.match(res.headers.get('location'), /\/api\/projects\/\d+$/);
  s.close();
});

test('validation rejects bad input with 400 and field details', async () => {
  const s = await startServer();
  const cases = [
    [{}, 'customer_name'],
    [{ customer_name: 'A', work_description: 'B', project_cost: -5 }, 'project_cost'],
    [{ customer_name: 'A', work_description: 'B', project_cost: 'abc' }, 'project_cost'],
    [{ customer_name: 'A', work_description: 'B', status: 'Done' }, 'status'],
    [{ customer_name: 'x'.repeat(121), work_description: 'B' }, 'customer_name'],
    [{ customer_name: ['A'], work_description: 'B' }, 'customer_name'],
  ];
  for (const [body, field] of cases) {
    const r = await s.call('/api/projects', { method: 'POST', body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.ok(r.data.details[field], `expected error on ${field}`);
  }
  s.close();
});

test('invalid JSON body returns 400', async () => {
  const s = await startServer();
  const r = await s.call('/api/projects', { method: 'POST', raw: '{bad' });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /JSON/);
  s.close();
});

test('get, update, status patch and delete lifecycle', async () => {
  const s = await startServer([row()]);
  assert.equal((await s.call('/api/projects/1')).data.customer_name, 'Acme');

  const put = await s.call('/api/projects/1', {
    method: 'PUT',
    body: { customer_name: 'Beta', work_description: 'App', project_cost: 900, investment_amount: 1000 },
  });
  assert.equal(put.status, 200);
  assert.equal(put.data.profit, -100); // negative profit is allowed

  const patch = await s.call('/api/projects/1/status', { method: 'PATCH', body: { status: 'Completed' } });
  assert.equal(patch.data.status, 'Completed');
  assert.equal((await s.call('/api/projects/1/status', { method: 'PATCH', body: { status: 'Nope' } })).status, 400);
  assert.equal((await s.call('/api/projects/1/status', { method: 'PATCH', body: {} })).status, 400);

  assert.deepEqual((await s.call('/api/projects/1', { method: 'DELETE' })).data, { success: true });
  assert.equal((await s.call('/api/projects/1')).status, 404);
  s.close();
});

test('PUT without status keeps the existing status', async () => {
  const s = await startServer([row({ status: 'In Progress' })]);
  const r = await s.call('/api/projects/1', { method: 'PUT', body: { customer_name: 'A', work_description: 'B' } });
  assert.equal(r.data.status, 'In Progress');
  s.close();
});

test('404s and bad ids', async () => {
  const s = await startServer();
  assert.equal((await s.call('/api/projects/999')).status, 404);
  assert.equal((await s.call('/api/projects/abc')).status, 400);
  assert.equal((await s.call('/api/projects/999', { method: 'DELETE' })).status, 404);
  assert.equal((await s.call('/api/nope')).status, 404);
  s.close();
});

test('search, status filter, sorting and pagination', async () => {
  const s = await startServer([
    row({ customer_name: 'Alpha', work_description: 'Web', project_cost: 300, status: 'Completed' }),
    row({ customer_name: 'beta', work_description: '100% custom', project_cost: 100 }),
    row({ customer_name: 'Gamma', work_description: 'Web app', project_cost: 200, investor_name: 'Zed Fund' }),
  ]);
  const names = async (q) => (await s.call(`/api/projects?${q}`)).data.map((p) => p.customer_name);

  assert.deepEqual(await names('search=web&sort=customer_name&order=asc'), ['Alpha', 'Gamma']);
  assert.deepEqual(await names('search=zed'), ['Gamma']); // searches investor too
  assert.deepEqual(await names('search=100%25'), ['beta']); // % is escaped, not a wildcard
  assert.deepEqual(await names('search=%25'), ['beta']);
  assert.deepEqual(await names('status=Completed'), ['Alpha']);
  assert.deepEqual(await names('sort=project_cost&order=asc'), ['beta', 'Gamma', 'Alpha']);
  assert.deepEqual(await names('sort=customer_name&order=asc'), ['Alpha', 'beta', 'Gamma']); // case-insensitive

  const page = await s.call('/api/projects?sort=project_cost&order=asc&limit=2&offset=2');
  assert.equal(page.res.headers.get('x-total-count'), '3');
  assert.equal(page.data.length, 1);

  assert.equal((await s.call('/api/projects?sort=password')).status, 400);
  assert.equal((await s.call('/api/projects?status=Bogus')).status, 400);
  assert.equal((await s.call('/api/projects?limit=0')).status, 400);
  assert.equal((await s.call('/api/projects?search=x%27%3B%20DROP%20TABLE%20projects%3B--')).status, 200);
  assert.equal((await s.call('/api/projects')).data.length, 3); // table intact
  s.close();
});

test('metrics: totals, margin, status breakdown and 6 monthly buckets', async () => {
  const s = await startServer([
    row({ project_cost: 1000, investment_amount: 400, status: 'Completed' }),
    row({ project_cost: 3000, investment_amount: 0, status: 'In Progress' }),
    row({ project_cost: 1000, investment_amount: 600, status: 'Pending', created_at: '2000-01-01T00:00:00Z' }),
  ]);
  const { data: m } = await s.call('/api/metrics');
  assert.equal(m.total_projects, 3);
  assert.equal(m.total_cost, 5000);
  assert.equal(m.total_investment, 1000);
  assert.equal(m.total_profit, 4000);
  assert.equal(m.active_projects, 2);
  assert.equal(m.profit_margin, 80);
  assert.equal(m.average_profit, 1333.33);
  assert.deepEqual(m.by_status.map((x) => [x.status, x.count]), [['Pending', 1], ['In Progress', 1], ['Completed', 1]]);
  assert.equal(m.monthly.length, 6);
  assert.equal(m.monthly.at(-1).projects, 2); // the 2000 row is outside the window
  assert.equal(m.monthly.at(-1).profit, 3600);
  s.close();
});

test('metrics on an empty database are all zero', async () => {
  const s = await startServer();
  const { data: m } = await s.call('/api/metrics');
  assert.equal(m.total_projects, 0);
  assert.equal(m.profit_margin, 0);
  assert.equal(m.average_profit, 0);
  s.close();
});

test('CSV export respects filters, quotes cells and blocks formula injection', async () => {
  const s = await startServer([
    row({ customer_name: 'Smith, "Bob"', work_description: '=HYPERLINK("x")', status: 'Completed' }),
    row({ customer_name: 'Other' }),
  ]);
  const r = await s.call('/api/export.csv?status=Completed');
  assert.equal(r.status, 200);
  assert.match(r.res.headers.get('content-type'), /text\/csv/);
  assert.match(r.res.headers.get('content-disposition'), /attachment; filename="fynlo-projects-\d{4}-\d{2}-\d{2}\.csv"/);
  const lines = r.data.replace(/^\uFEFF/, '').trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[1].includes('"Smith, ""Bob"""'));
  assert.ok(lines[1].includes(`"'=HYPERLINK(""x"")"`));
  s.close();
});

test('health endpoint, SPA fallback and security headers', async () => {
  const s = await startServer();
  const h = await s.call('/api/health');
  assert.equal(h.data.status, 'ok');
  assert.equal(h.res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(h.res.headers.get('x-powered-by'), null);
  const page = await s.call('/some/client/route');
  assert.equal(page.status, 200);
  assert.match(page.data, /<title>Fynlo/);
  s.close();
});

test('database enforces constraints even if the API is bypassed', () => {
  const db = openDatabase(':memory:');
  assert.throws(() => db.prepare("INSERT INTO projects (customer_name, work_description, status) VALUES ('a','b','Bogus')").run());
  assert.throws(() => db.prepare("INSERT INTO projects (customer_name, work_description, project_cost) VALUES ('a','b',-1)").run());
  db.close();
});
