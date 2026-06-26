// backend/routes/paymentTermsRoutes.js
// Full CRUD for Payment Terms Master

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection'); // mysql2/promise pool

// ── Generate next PAY-YYYY-NNN ────────────────────────────────────────────────
async function generateRecNo(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(rec_no, '-', -1) AS UNSIGNED)) AS max_seq
     FROM payment_terms WHERE rec_no LIKE ?`,
    [`PAY-${year}-%`],
  );
  const seq = (row.max_seq ?? 0) + 1;
  return `PAY-${year}-${String(seq).padStart(3, '0')}`;
}

// ── GET /api/payment-terms  — list ───────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where  = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (payment_term_name LIKE ? OR CAST(payment_term_days AS CHAR) LIKE ? OR rec_no LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [rows] = await db.query(
      `SELECT * FROM payment_terms ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM payment_terms ${where}`,
      params
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch payment terms' });
  }
});

// ── GET /api/payment-terms/:id  — single ─────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [[row]] = await db.query(
      'SELECT * FROM payment_terms WHERE id = ?', [req.params.id]
    );
    if (!row) return res.status(404).json({ message: 'Payment term not found' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching payment term' });
  }
});

// ── POST /api/payment-terms  — create ────────────────────────────────────────
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { payment_term_name, payment_term_days } = req.body;

    if (!payment_term_name?.trim()) {
      return res.status(400).json({ message: 'Payment Term Name is required' });
    }
    if (!payment_term_days) {
      return res.status(400).json({ message: 'Payment Term Days is required' });
    }

    // Duplicate check
    const [[dup]] = await conn.query(
      'SELECT id FROM payment_terms WHERE LOWER(payment_term_name) = LOWER(?)',
      [payment_term_name.trim()]
    );
    if (dup) {
      await conn.rollback();
      return res.status(409).json({ message: `Payment term "${payment_term_name}" already exists` });
    }

    const recNo = await generateRecNo(conn);

    const [result] = await conn.query(
      'INSERT INTO payment_terms (rec_no, payment_term_name, payment_term_days) VALUES (?, ?, ?)',
      [recNo, payment_term_name.trim(), String(payment_term_days)]
    );

    await conn.commit();

    const [[created]] = await db.query(
      'SELECT * FROM payment_terms WHERE id = ?', [result.insertId]
    );
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to create payment term' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/payment-terms/:id  — update ─────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_term_name, payment_term_days } = req.body;

    if (!payment_term_name?.trim()) {
      return res.status(400).json({ message: 'Payment Term Name is required' });
    }

    // Duplicate check (exclude self)
    const [[dup]] = await db.query(
      'SELECT id FROM payment_terms WHERE LOWER(payment_term_name) = LOWER(?) AND id != ?',
      [payment_term_name.trim(), id]
    );
    if (dup) {
      return res.status(409).json({ message: `Payment term "${payment_term_name}" already exists` });
    }

    await db.query(
      'UPDATE payment_terms SET payment_term_name = ?, payment_term_days = ? WHERE id = ?',
      [payment_term_name.trim(), String(payment_term_days), id]
    );

    const [[updated]] = await db.query(
      'SELECT * FROM payment_terms WHERE id = ?', [id]
    );
    if (!updated) return res.status(404).json({ message: 'Payment term not found' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update payment term' });
  }
});

// ── DELETE /api/payment-terms/:id ────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [[row]] = await db.query(
      'SELECT id FROM payment_terms WHERE id = ?', [req.params.id]
    );
    if (!row) return res.status(404).json({ message: 'Payment term not found' });

    await db.query('DELETE FROM payment_terms WHERE id = ?', [req.params.id]);
    res.json({ message: 'Payment term deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete payment term' });
  }
});

module.exports = router;