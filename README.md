# Fynlo — Project & Profit Manager

A full-stack dashboard for tracking projects, costs, investments and profit.
**Node.js · Express · SQLite (better-sqlite3) · REST API · vanilla JS frontend**

## Features

- **SQLite storage** with schema constraints; `profit` is a *generated column* (`project_cost − investment_amount`), so it can never go out of sync.
- **9 REST endpoints** for CRUD, search, status filtering, sorting, pagination, summary metrics and CSV export.
- **Server-side validation** with clear 400 errors (types, ranges, lengths, allowed statuses) and SQL `CHECK` constraints as a second line of defence.
- **Dashboard** with 5 summary metrics (total profit, investment, cost, profit margin, active projects), a 6-month profit chart and a status breakdown.
- **Projects table** with debounced search, status filter, sortable columns, pagination, inline status change, add/edit/delete and CSV export of the current view.
- **Stays in sync with the backend**: auto-refreshes every 15 s and when the tab regains focus, with a live "synced Ns ago" indicator and offline detection.
- **Responsive** layout, accessible labels/focus states, XSS-safe rendering, CSV formula-injection protection.
- **12 automated API tests** using Node's built-in test runner (no extra dependencies).

## Getting started

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # auto-restart on changes (Node 18.11+)
npm test           # run the API test suite
```

On first run Fynlo creates `data/fynlo.db` and seeds a few demo projects.
If you have an old `data/fynlo.json` from the JSON-file version, its projects are imported automatically into an empty database.

| Environment variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `data/fynlo.db` | SQLite file location (point at a persistent disk when deploying) |
| `SEED_DEMO` | `true` | Set to `false` to start with an empty database |

## API

Base path: `/api` · JSON in/out · errors look like `{ "error": "message", "details": { "field": "message" } }`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Liveness check |
| `GET` | `/api/projects` | List projects. Query: `search`, `status`, `sort`, `order`, `limit` (max 200), `offset`. Total match count is in the `X-Total-Count` header |
| `GET` | `/api/projects/:id` | Get one project |
| `POST` | `/api/projects` | Create a project (`201`) |
| `PUT` | `/api/projects/:id` | Replace a project's fields |
| `PATCH` | `/api/projects/:id/status` | Update only the status |
| `DELETE` | `/api/projects/:id` | Delete a project |
| `GET` | `/api/metrics` | Totals, profit margin, average profit, per-status breakdown, last 6 months |
| `GET` | `/api/export.csv` | CSV download; accepts the same `search`/`status`/`sort`/`order` filters |

**Project fields:** `customer_name`\*, `work_description`\*, `project_cost`, `work_completed_by`, `investor_name`, `investment_amount`, `status` (`Pending` · `In Progress` · `Completed`). `id`, `profit`, `created_at` and `updated_at` are set by the server.
`sort` accepts `created_at`, `customer_name`, `project_cost`, `investment_amount`, `profit`, `status`.

```bash
curl -X POST localhost:3000/api/projects -H 'Content-Type: application/json' \
  -d '{"customer_name":"Acme","work_description":"Website","project_cost":50000,"investment_amount":15000}'

curl 'localhost:3000/api/projects?search=acme&status=Pending&sort=profit&order=desc&limit=10'
```

## Project structure

```
server.js            Starts the server, graceful shutdown
src/app.js           Express app, routes, error handling
src/repository.js    All SQL (prepared statements, filtering, metrics)
src/db.js            Schema, legacy JSON import, demo seed data
src/validate.js      Input validation
public/index.html    Single-page frontend (no build step)
test/api.test.js     API + database tests
```

## Deploying

Any Node host works. SQLite is a file, so give the app a **persistent disk** and set `DB_PATH` to a path on it
(for example `DB_PATH=/data/fynlo.db`); on hosts with ephemeral storage the data resets on each deploy.
