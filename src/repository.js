'use strict';

const { STATUSES } = require('./validate');

const SORTABLE = {
  created_at: 'created_at',
  customer_name: 'customer_name COLLATE NOCASE',
  project_cost: 'project_cost',
  investment_amount: 'investment_amount',
  profit: 'profit',
  status: 'status',
};

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function buildFilter({ search, status }) {
  const where = [];
  const params = {};
  if (search) {
    where.push(`(customer_name LIKE @q ESCAPE '\\' OR work_description LIKE @q ESCAPE '\\'
              OR investor_name LIKE @q ESCAPE '\\' OR work_completed_by LIKE @q ESCAPE '\\')`);
    params.q = `%${escapeLike(search)}%`;
  }
  if (status) {
    where.push('status = @status');
    params.status = status;
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

function createRepository(db) {
  const getStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO projects (customer_name, work_description, project_cost, work_completed_by,
                          investor_name, investment_amount, status)
    VALUES (@customer_name, @work_description, @project_cost, @work_completed_by,
            @investor_name, @investment_amount, @status)`);
  const updateStmt = db.prepare(`
    UPDATE projects SET customer_name=@customer_name, work_description=@work_description,
      project_cost=@project_cost, work_completed_by=@work_completed_by, investor_name=@investor_name,
      investment_amount=@investment_amount, status=@status,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id=@id`);
  const statusStmt = db.prepare(`
    UPDATE projects SET status=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`);
  const deleteStmt = db.prepare('DELETE FROM projects WHERE id = ?');

  function orderBy(sort = 'created_at', order = 'desc') {
    const col = SORTABLE[sort] || SORTABLE.created_at;
    return `ORDER BY ${col} ${order === 'asc' ? 'ASC' : 'DESC'}, id DESC`;
  }

  return {
    get: (id) => getStmt.get(id),

    /** Returns { rows, total } for the filter; limit/offset are optional. */
    list({ search, status, sort, order, limit, offset } = {}) {
      const { clause, params } = buildFilter({ search, status });
      const total = db.prepare(`SELECT COUNT(*) AS n FROM projects ${clause}`).get(params).n;
      let sql = `SELECT * FROM projects ${clause} ${orderBy(sort, order)}`;
      const args = { ...params };
      if (limit) {
        sql += ' LIMIT @limit OFFSET @offset';
        args.limit = limit;
        args.offset = offset || 0;
      }
      return { rows: db.prepare(sql).all(args), total };
    },

    create(data) {
      return getStmt.get(insertStmt.run(data).lastInsertRowid);
    },

    update(id, data) {
      return updateStmt.run({ ...data, id }).changes ? getStmt.get(id) : null;
    },

    setStatus(id, status) {
      return statusStmt.run(status, id).changes ? getStmt.get(id) : null;
    },

    remove: (id) => deleteStmt.run(id).changes > 0,

    metrics(now = new Date()) {
      const t = db.prepare(`
        SELECT COUNT(*) AS total_projects,
               COALESCE(SUM(profit), 0)            AS total_profit,
               COALESCE(SUM(investment_amount), 0) AS total_investment,
               COALESCE(SUM(project_cost), 0)      AS total_cost,
               COALESCE(SUM(status != 'Completed'), 0) AS active_projects
        FROM projects`).get();

      const byStatus = db.prepare(`
        SELECT status, COUNT(*) AS count, COALESCE(SUM(profit), 0) AS profit
        FROM projects GROUP BY status`).all();

      // Last 6 calendar months (UTC), with empty months filled in as zero.
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        months.push(d.toISOString().slice(0, 7));
      }
      const rows = db.prepare(`
        SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS projects,
               SUM(profit) AS profit, SUM(project_cost) AS cost
        FROM projects WHERE created_at >= ? GROUP BY month`).all(`${months[0]}-01`);
      const byMonth = new Map(rows.map((r) => [r.month, r]));

      return {
        ...t,
        profit_margin: t.total_cost ? Math.round((t.total_profit / t.total_cost) * 1000) / 10 : 0,
        average_profit: t.total_projects ? Math.round((t.total_profit / t.total_projects) * 100) / 100 : 0,
        by_status: STATUSES.map((s) => byStatus.find((r) => r.status === s) || { status: s, count: 0, profit: 0 }),
        monthly: months.map((m) => byMonth.get(m) || { month: m, projects: 0, profit: 0, cost: 0 }),
      };
    },
  };
}

module.exports = { createRepository, SORTABLE };
