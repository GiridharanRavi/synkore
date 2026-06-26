// backend/routes/colorRoutes.js
// Full CRUD for Color Master

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection'); // mysql2/promise pool

// ── Generate next CLR-YYYY-NNN ────────────────────────────────────────────────
async function generateRecNo(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(rec_no, '-', -1) AS UNSIGNED)) AS max_seq
     FROM colors WHERE rec_no LIKE ?`,
    [`CLR-${year}-%`],
  );
  const seq = (row.max_seq ?? 0) + 1;
  return `CLR-${year}-${String(seq).padStart(3, '0')}`;
}

// ── GET /api/colors  — list ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (color_name LIKE ? OR pantone_color_name LIKE ? OR pantone_color_number LIKE ? OR rec_no LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    console.log('COLOR QUERY:', `SELECT * FROM colors ${where}`, params);

    const [rows] = await db.query(
      `SELECT * FROM colors ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM colors ${where}`,
      params
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('COLOR ROUTE ERROR:', err.message, err.stack);
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/colors/:id  — single ────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [[row]] = await db.query(
      'SELECT * FROM colors WHERE id = ?', [req.params.id]
    );
    if (!row) return res.status(404).json({ message: 'Color not found' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching color' });
  }
});

// ── POST /api/colors  — create ────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const {
      color_name,
      pantone_color_name   = '',
      pantone_color_number = '',
      status = 'Active',
    } = req.body;

    if (!color_name?.trim()) {
      return res.status(400).json({ message: 'Color Name is required' });
    }

    // Duplicate check
    const [[dup]] = await conn.query(
      'SELECT id FROM colors WHERE LOWER(color_name) = LOWER(?)',
      [color_name.trim()]
    );
    if (dup) {
      await conn.rollback();
      return res.status(409).json({ message: `Color "${color_name}" already exists` });
    }

    const recNo = await generateRecNo(conn);

    const [result] = await conn.query(
      `INSERT INTO colors
        (rec_no, color_name, pantone_color_name, pantone_color_number, status)
       VALUES (?, ?, ?, ?, ?)`,
      [recNo, color_name.trim(), pantone_color_name.trim(), pantone_color_number.trim(), status]
    );

    await conn.commit();

    const [[created]] = await db.query(
      'SELECT * FROM colors WHERE id = ?', [result.insertId]
    );
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to create color' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/colors/:id  — update ────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      color_name,
      pantone_color_name   = '',
      pantone_color_number = '',
      status = 'Active',
    } = req.body;

    if (!color_name?.trim()) {
      return res.status(400).json({ message: 'Color Name is required' });
    }

    // Duplicate check (exclude self)
    const [[dup]] = await db.query(
      'SELECT id FROM colors WHERE LOWER(color_name) = LOWER(?) AND id != ?',
      [color_name.trim(), id]
    );
    if (dup) {
      return res.status(409).json({ message: `Color "${color_name}" already exists` });
    }

    await db.query(
      `UPDATE colors SET
        color_name = ?, pantone_color_name = ?,
        pantone_color_number = ?, status = ?
       WHERE id = ?`,
      [color_name.trim(), pantone_color_name.trim(), pantone_color_number.trim(), status, id]
    );

    const [[updated]] = await db.query(
      'SELECT * FROM colors WHERE id = ?', [id]
    );
    if (!updated) return res.status(404).json({ message: 'Color not found' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update color' });
  }
});

// ── DELETE /api/colors/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [[row]] = await db.query(
      'SELECT id FROM colors WHERE id = ?', [req.params.id]
    );
    if (!row) return res.status(404).json({ message: 'Color not found' });

    await db.query('DELETE FROM colors WHERE id = ?', [req.params.id]);
    res.json({ message: 'Color deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete color' });
  }
});

module.exports = router;