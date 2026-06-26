// backend/routes/hsnRoutes.js
// Full CRUD for HSN Master

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// ── Generate HSN-YYYY-NNN ID ──────────────────────────────────
async function generateHsnId(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(hsn_id, '-', -1) AS UNSIGNED)) AS max_seq
     FROM hsn_codes WHERE hsn_id LIKE ?`,
    [`HSN-${year}-%`],
  );
  const nextSeq = (row.max_seq ?? 0) + 1;
  return `HSN-${year}-${String(nextSeq).padStart(3, '0')}`;
}

// ── GET /api/hsn  — list with search & pagination ─────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (hsn_code LIKE ? OR hsn_short_desc LIKE ? OR hsn_long_desc LIKE ? OR hsn_id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { where += ' AND status = ?'; params.push(status); }

    const [rows] = await db.query(
      `SELECT * FROM hsn_codes ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM hsn_codes ${where}`, params,
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch HSN codes' });
  }
});

// ── GET /api/hsn/:id ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM hsn_codes WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ message: 'HSN code not found' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching HSN code' });
  }
});

// ── POST /api/hsn  — create ───────────────────────────────────
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const hsnCode = await generateHsnId(conn);

    const { hsn_code, hsn_short_desc, hsn_long_desc, gst_percent, status } = req.body;

    // Validate HSN code: 4-8 numeric digits
    if (!/^\d{4,8}$/.test(hsn_code)) {
      await conn.rollback();
      return res.status(400).json({ message: 'HSN code must be 4 to 8 numeric digits' });
    }

    const [result] = await conn.query(
      `INSERT INTO hsn_codes (hsn_id, hsn_code, hsn_short_desc, hsn_long_desc, gst_percent, status)
       VALUES (?,?,?,?,?,?)`,
      [hsnCode, hsn_code, hsn_short_desc, hsn_long_desc || null,
       parseFloat(gst_percent) || 0, status || 'Active'],
    );

    await conn.commit();
    const [[created]] = await db.query('SELECT * FROM hsn_codes WHERE id = ?', [result.insertId]);
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'HSN code already exists' });
    }
    res.status(500).json({ message: 'Failed to create HSN code' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/hsn/:id  — update ────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { hsn_code, hsn_short_desc, hsn_long_desc, gst_percent, status } = req.body;

    if (!/^\d{4,8}$/.test(hsn_code)) {
      return res.status(400).json({ message: 'HSN code must be 4 to 8 numeric digits' });
    }

    await db.query(
      `UPDATE hsn_codes SET hsn_code=?, hsn_short_desc=?, hsn_long_desc=?, gst_percent=?, status=? WHERE id=?`,
      [hsn_code, hsn_short_desc, hsn_long_desc || null, parseFloat(gst_percent) || 0, status || 'Active', id],
    );

    const [[updated]] = await db.query('SELECT * FROM hsn_codes WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'HSN code already exists' });
    }
    res.status(500).json({ message: 'Failed to update HSN code' });
  }
});

// ── DELETE /api/hsn/:id ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM hsn_codes WHERE id = ?', [req.params.id]);
    res.json({ message: 'HSN code deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete HSN code' });
  }
});

module.exports = router;