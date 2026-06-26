// routes/yarnMaster.js
// This file is intentionally a shim.
// Your full Yarn Master implementation lives in yarnMasterRoutes.js
// mounted at /api/yarns. This shim mounts at /api/yarn-master and
// forwards all GET requests to the same data so nothing 404s.
//
// In app.js / server.js make sure you have BOTH:
//   const { yarnRouter } = require('./routes/yarnMasterRoutes');
//   app.use('/api/yarns',        yarnRouter);
//   app.use('/api/yarn-master',  require('./routes/yarnMaster')); // ← this shim

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// GET /api/yarn-master?limit=1000&status=Active&search=...
// Mirrors the list endpoint from yarnMasterRoutes.js GET /api/yarns
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 500 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where  = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ` AND (
        y.yarn_code  LIKE ? OR y.short_name  LIKE ?
        OR yt.yarn_type LIKE ? OR cs.cs_name LIKE ?
      )`;
      const q = `%${search}%`;
      params.push(q, q, q, q);
    }
    if (status) { where += ' AND y.status = ?'; params.push(status); }

    let rows = [];
    let total = 0;

    try {
      [rows] = await db.query(
        `SELECT y.id,
                y.yarn_code,
                y.short_name,
                y.count_value,
                y.actual_count,
                y.status,
                yt.yarn_type,
                cs.cs_name AS count_system_name
         FROM   yarn_master y
         LEFT JOIN yarn_types    yt ON yt.id = y.yarn_type_id
         LEFT JOIN count_systems cs ON cs.id = y.count_system_id
         ${where}
         ORDER  BY y.yarn_code
         LIMIT  ? OFFSET ?`,
        [...params, Number(limit), offset],
      );

      [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total
         FROM   yarn_master y
         LEFT JOIN yarn_types    yt ON yt.id = y.yarn_type_id
         LEFT JOIN count_systems cs ON cs.id = y.count_system_id
         ${where}`,
        params,
      );
    } catch (tableErr) {
      if (tableErr.code === 'ER_NO_SUCH_TABLE') {
        // Table doesn't exist yet — return empty so frontend falls back to free-text
        rows  = [];
        total = 0;
      } else {
        throw tableErr;
      }
    }

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[yarn-master shim] GET error:', err);
    res.status(500).json({ message: 'Failed to fetch yarn master', detail: err.message });
  }
});

// GET /api/yarn-master/:id  → delegates to yarn_master table directly
router.get('/:id', async (req, res) => {
  try {
    const [[row]] = await db.query(
      `SELECT y.id, y.yarn_code, y.short_name, y.count_value, y.actual_count,
              y.status, yt.yarn_type, cs.cs_name AS count_system_name
       FROM   yarn_master y
       LEFT JOIN yarn_types    yt ON yt.id = y.yarn_type_id
       LEFT JOIN count_systems cs ON cs.id = y.count_system_id
       WHERE  y.id = ?`,
      [req.params.id],
    );
    if (!row) return res.status(404).json({ message: 'Yarn not found' });
    res.json(row);
  } catch (err) {
    console.error('[yarn-master shim] GET /:id error:', err);
    res.status(500).json({ message: 'Failed to fetch yarn', detail: err.message });
  }
});

module.exports = router;