/**
 * routes/yarnStockRoutes.js
 *
 * "Yarn Stock" endpoints — combined view over two sources, same pattern as
 * Fabric Stock:
 *   • Yarn Purchase Inward (automatic, read-only — v_yarn_stock_items)
 *   • Manual Stock Entry ("+ Add In-Stock" — opening balances, physical-count
 *     corrections, transfers, etc. — writable, yarn_manual_stock table)
 *
 * Both are read here through the combined views defined in
 * yarn_manual_stock_schema.sql:
 *   v_yarn_stock_items_all     (piece-level, tagged `source`)
 *   v_yarn_stock_summary_all   (grouped by count_desc, Inward + Manual merged)
 *
 * So "Total Stock KGS" on the summary = Inward + Manual automatically —
 * no separate summing needed on the frontend.
 *
 * Mount at: app.use('/api/yarn-stock', require('./routes/yarnStockRoutes'));
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// ─── helpers ──────────────────────────────────────────────────────────────
const esc = (v) => (v === undefined || v === null ? '' : String(v).trim());

// ─────────────────────────────────────────────────────────────────────────
// GET /meta  — locations / suppliers for the filter dropdowns (both sources)
//   NOTE: manual entries don't have real location/supplier IDs (they're
//   free-text fields, same as Fabric Stock's manual entry), so filtering
//   is done by NAME for both sources — id and name are the same string.
// ─────────────────────────────────────────────────────────────────────────
router.get('/meta', async (_req, res) => {
  try {
    const [locations] = await db.query(
      `SELECT DISTINCT location_name AS id, location_name AS name
       FROM v_yarn_stock_items_all
       WHERE location_name IS NOT NULL AND location_name <> ''
       ORDER BY location_name`,
    );
    const [suppliers] = await db.query(
      `SELECT DISTINCT supplier_name AS id, supplier_name AS name
       FROM v_yarn_stock_items_all
       WHERE supplier_name IS NOT NULL AND supplier_name <> ''
       ORDER BY supplier_name`,
    );
    res.json({ locations, suppliers });
  } catch (err) {
    console.error('[GET /yarn-stock/meta]', err);
    res.status(500).json({ message: 'Failed to load filters', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /summary  — grouped by yarn / count (Summary tab), Inward + Manual
//   query: search, location, supplier, page, limit
// ─────────────────────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const { search = '', location = '', supplier = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ` AND (count_desc LIKE ? OR yarn_code LIKE ? OR hsn_code LIKE ?)`;
      params.push(`%${esc(search)}%`, `%${esc(search)}%`, `%${esc(search)}%`);
    }
    if (location) {
      where += ` AND FIND_IN_SET(?, REPLACE(locations, ', ', ',')) > 0`;
      params.push(esc(location));
    }
    if (supplier) {
      where += ` AND FIND_IN_SET(?, REPLACE(suppliers, ', ', ',')) > 0`;
      params.push(esc(supplier));
    }

    const [rows] = await db.query(
      `SELECT * FROM v_yarn_stock_summary_all
       ${where}
       ORDER BY count_desc
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM v_yarn_stock_summary_all ${where}`,
      params,
    );

    // stat cards — computed over the FULL filtered set (not just this page),
    // across BOTH sources. inward_kgs/manual_kgs let the UI show the same
    // "Inward X + Manual Y" breakdown as the Fabric Stock page.
    const [[stats]] = await db.query(
      `SELECT
         COALESCE(SUM(total_kgs), 0)   AS total_kgs,
         COALESCE(SUM(inward_kgs), 0)  AS inward_kgs,
         COALESCE(SUM(manual_kgs), 0)  AS manual_kgs,
         COALESCE(SUM(pieces), 0)      AS total_pieces,
         COUNT(*)                      AS total_counts
       FROM v_yarn_stock_summary_all ${where}`,
      params,
    );
    const [[{ total_locations }]] = await db.query(
      `SELECT COUNT(DISTINCT location_name) AS total_locations
       FROM v_yarn_stock_items_all
       WHERE location_name IS NOT NULL AND location_name <> ''`,
    );

    res.json({
      data: rows,
      total, page: Number(page), limit: Number(limit),
      stats: {
        total_kgs:       Number(stats.total_kgs),
        inward_kgs:      Number(stats.inward_kgs),
        manual_kgs:      Number(stats.manual_kgs),
        total_pieces:    Number(stats.total_pieces),
        total_counts:    Number(stats.total_counts),
        total_locations: Number(total_locations),
      },
    });
  } catch (err) {
    console.error('[GET /yarn-stock/summary]', err);
    res.status(500).json({ message: 'Failed to fetch yarn stock summary', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /detail  — piece-level rows (Piece Detail tab), Inward + Manual,
//   each row tagged `source: "inward" | "manual"`
//   query: search, location, supplier, page, limit
// ─────────────────────────────────────────────────────────────────────────
router.get('/detail', async (req, res) => {
  try {
    const { search = '', location = '', supplier = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ` AND (count_desc LIKE ? OR yarn_code LIKE ? OR lot_no LIKE ? OR inward_no LIKE ?)`;
      params.push(`%${esc(search)}%`, `%${esc(search)}%`, `%${esc(search)}%`, `%${esc(search)}%`);
    }
    if (location) {
      where += ` AND location_name = ?`;
      params.push(esc(location));
    }
    if (supplier) {
      where += ` AND supplier_name = ?`;
      params.push(esc(supplier));
    }

    const [rows] = await db.query(
      `SELECT * FROM v_yarn_stock_items_all
       ${where}
       ORDER BY inward_date DESC, item_id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM v_yarn_stock_items_all ${where}`,
      params,
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /yarn-stock/detail]', err);
    res.status(500).json({ message: 'Failed to fetch yarn stock detail', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /manual  — add a manual stock entry
// ─────────────────────────────────────────────────────────────────────────
router.post('/manual', async (req, res) => {
  try {
    const b = req.body || {};

    if (!esc(b.count_desc)) {
      return res.status(400).json({ message: 'Count / Yarn description is required.' });
    }
    const kgs = Number(b.received_kgs);
    if (!kgs || Number.isNaN(kgs) || kgs <= 0) {
      return res.status(400).json({ message: 'Enter a valid KGS value greater than 0.' });
    }

    const [result] = await db.query(
      `INSERT INTO yarn_manual_stock
         (entry_date, count_desc, yarn_code, hsn_code, supplier_name, location_name, lot_no, received_kgs, rate, remarks)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        b.entry_date || new Date().toISOString().slice(0, 10),
        esc(b.count_desc),
        esc(b.yarn_code) || null,
        esc(b.hsn_code) || null,
        esc(b.supplier_name) || null,
        esc(b.location_name) || null,
        esc(b.lot_no) || null,
        kgs,
        b.rate !== undefined && b.rate !== '' ? Number(b.rate) : null,
        esc(b.remarks) || null,
      ],
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('[POST /yarn-stock/manual]', err);
    res.status(500).json({ message: 'Failed to add manual stock entry', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// PUT /manual/:id  — edit a manual stock entry
// ─────────────────────────────────────────────────────────────────────────
router.put('/manual/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};

    if (!esc(b.count_desc)) {
      return res.status(400).json({ message: 'Count / Yarn description is required.' });
    }
    const kgs = Number(b.received_kgs);
    if (!kgs || Number.isNaN(kgs) || kgs <= 0) {
      return res.status(400).json({ message: 'Enter a valid KGS value greater than 0.' });
    }

    const [result] = await db.query(
      `UPDATE yarn_manual_stock SET
         entry_date = ?, count_desc = ?, yarn_code = ?, hsn_code = ?, supplier_name = ?,
         location_name = ?, lot_no = ?, received_kgs = ?, rate = ?, remarks = ?
       WHERE id = ?`,
      [
        b.entry_date || new Date().toISOString().slice(0, 10),
        esc(b.count_desc),
        esc(b.yarn_code) || null,
        esc(b.hsn_code) || null,
        esc(b.supplier_name) || null,
        esc(b.location_name) || null,
        esc(b.lot_no) || null,
        kgs,
        b.rate !== undefined && b.rate !== '' ? Number(b.rate) : null,
        esc(b.remarks) || null,
        id,
      ],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Manual stock entry not found.' });
    }
    res.json({ id: Number(id) });
  } catch (err) {
    console.error('[PUT /yarn-stock/manual/:id]', err);
    res.status(500).json({ message: 'Failed to update manual stock entry', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// DELETE /manual/:id  — remove a manual stock entry
// ─────────────────────────────────────────────────────────────────────────
router.delete('/manual/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query(`DELETE FROM yarn_manual_stock WHERE id = ?`, [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Manual stock entry not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /yarn-stock/manual/:id]', err);
    res.status(500).json({ message: 'Failed to delete manual stock entry', detail: err.message });
  }
});

module.exports = router;