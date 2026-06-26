// backend/routes/discountTypeMasterRoutes.js
// Full CRUD for Discount Type Master

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

const VALID_TYPES = ['Trade Discount', 'Quantity Discount', 'Cash Discount', 'Scheme Discount'];

// ── Generate next REC-YYYY-NNN ────────────────────────────────────────────────
async function generateRecNo(conn, prefix) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(rec_no, '-', -1) AS UNSIGNED)) AS max_seq
     FROM discount_types WHERE rec_no LIKE ?`,
    [`${prefix}-${year}-%`],
  );
  const seq = (row.max_seq ?? 0) + 1;
  return `${prefix}-${year}-${String(seq).padStart(3, '0')}`;
}

// ── GET /api/discount-types  — list ──────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', type = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (discount_type_name LIKE ? OR type LIKE ? OR rec_no LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { where += ' AND status = ?'; params.push(status); }
    if (type)   { where += ' AND type = ?';   params.push(type); }

    const [rows] = await db.query(
      `SELECT * FROM discount_types ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM discount_types ${where}`, params,
    );
    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch discount types' });
  }
});

// ── GET /api/discount-types/:id ───────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM discount_types WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ message: 'Discount type not found' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching discount type' });
  }
});

// ── POST /api/discount-types  — create ───────────────────────────────────────
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { discount_type_name, type, status = 'Active' } = req.body;

    if (!discount_type_name?.trim()) {
      return res.status(400).json({ message: 'discount_type_name is required' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }

    const recNo = await generateRecNo(conn, 'DT');
    const [result] = await conn.query(
      `INSERT INTO discount_types (rec_no, discount_type_name, type, status) VALUES (?, ?, ?, ?)`,
      [recNo, discount_type_name.trim(), type, status],
    );
    await conn.commit();
    const [[created]] = await db.query('SELECT * FROM discount_types WHERE id = ?', [result.insertId]);
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to create discount type' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/discount-types/:id  — update ────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { discount_type_name, type, status } = req.body;
    const { id } = req.params;

    if (!discount_type_name?.trim()) {
      return res.status(400).json({ message: 'discount_type_name is required' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }

    await db.query(
      `UPDATE discount_types SET discount_type_name=?, type=?, status=? WHERE id=?`,
      [discount_type_name.trim(), type, status, id],
    );
    const [[updated]] = await db.query('SELECT * FROM discount_types WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update discount type' });
  }
});

// ── DELETE /api/discount-types/:id ───────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM discount_types WHERE id = ?', [req.params.id]);
    res.json({ message: 'Discount type deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete discount type' });
  }
});

module.exports = router;