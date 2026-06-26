// backend/routes/currencyMasterRoutes.js
// Full CRUD for Currency Master

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection'); // mysql2/promise pool

// ── Generate next REC-YYYY-NNN  ──────────────────────────────────────────────
async function generateRecNo(conn, prefix) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(rec_no, '-', -1) AS UNSIGNED)) AS max_seq
     FROM currencies WHERE rec_no LIKE ?`,
    [`${prefix}-${year}-%`],
  );
  const seq    = (row.max_seq ?? 0) + 1;
  return `${prefix}-${year}-${String(seq).padStart(3, '0')}`;
}

// ── GET /api/currencies  — list ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (currency_name LIKE ? OR currency_code LIKE ? OR currency_symbol LIKE ? OR rec_no LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { where += ' AND status = ?'; params.push(status); }

    const [rows] = await db.query(
      `SELECT * FROM currencies ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM currencies ${where}`, params,
    );
    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch currencies' });
  }
});

// ── GET /api/currencies/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM currencies WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ message: 'Currency not found' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching currency' });
  }
});

// ── POST /api/currencies  — create ───────────────────────────────────────────
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const recNo = await generateRecNo(conn, 'CUR');
    const { currency_name, currency_code, currency_symbol, status = 'Active' } = req.body;

    if (!currency_name || !currency_code) {
      return res.status(400).json({ message: 'currency_name and currency_code are required' });
    }

    // Prevent duplicate codes
    const [[dup]] = await conn.query(
      'SELECT id FROM currencies WHERE currency_code = ?', [currency_code],
    );
    if (dup) {
      await conn.rollback();
      return res.status(409).json({ message: `Currency code "${currency_code}" already exists` });
    }

    const [result] = await conn.query(
      `INSERT INTO currencies (rec_no, currency_name, currency_code, currency_symbol, status)
       VALUES (?, ?, ?, ?, ?)`,
      [recNo, currency_name, currency_code, currency_symbol, status],
    );
    await conn.commit();
    const [[created]] = await db.query('SELECT * FROM currencies WHERE id = ?', [result.insertId]);
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to create currency' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/currencies/:id  — update ────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { currency_name, currency_code, currency_symbol, status } = req.body;
    const { id } = req.params;

    // Duplicate code check (excluding self)
    const [[dup]] = await db.query(
      'SELECT id FROM currencies WHERE currency_code = ? AND id != ?', [currency_code, id],
    );
    if (dup) return res.status(409).json({ message: `Currency code "${currency_code}" already exists` });

    await db.query(
      `UPDATE currencies SET currency_name=?, currency_code=?, currency_symbol=?, status=? WHERE id=?`,
      [currency_name, currency_code, currency_symbol, status, id],
    );
    const [[updated]] = await db.query('SELECT * FROM currencies WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update currency' });
  }
});

// ── DELETE /api/currencies/:id ────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM currencies WHERE id = ?', [req.params.id]);
    res.json({ message: 'Currency deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete currency' });
  }
});

module.exports = router;