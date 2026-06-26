// backend/routes/customerGroupRoutes.js
// CRUD for Customer Group Master — mirrors customerMasterRoutes.js pattern

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection'); // same mysql2/promise pool

// ── Generate next CGM-YYYY-NNN ────────────────────────────────────────────────
async function generateRecNo(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(rec_no, '-', -1) AS UNSIGNED)) AS max_seq
     FROM customer_group_master WHERE rec_no LIKE ?`,
    [`CGM-${year}-%`],
  );
  const seq = (row.max_seq ?? 0) + 1;
  return `CGM-${year}-${String(seq).padStart(3, '0')}`;
}

// ── Helper: fetch single group ────────────────────────────────────────────────
async function fetchGroup(id) {
  const [[row]] = await db.query('SELECT * FROM customer_group_master WHERE id = ?', [id]);
  return row ?? null;
}

// ── GET /api/customer-groups  — list with search & pagination ─────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where  = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (group_name LIKE ? OR description LIKE ? OR rec_no LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    const [rows] = await db.query(
      `SELECT * FROM customer_group_master
       ${where}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM customer_group_master ${where}`,
      params,
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch customer groups' });
  }
});

// ── GET /api/customer-groups/:id ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const group = await fetchGroup(req.params.id);
    if (!group) return res.status(404).json({ message: 'Customer group not found' });
    res.json(group);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching customer group' });
  }
});

// ── POST /api/customer-groups  — create ──────────────────────────────────────
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { group_name, description = '', status = 'Active' } = req.body;

    if (!group_name?.trim()) {
      return res.status(400).json({ message: 'group_name is required' });
    }

    // Duplicate check
    const [[dup]] = await conn.query(
      'SELECT id FROM customer_group_master WHERE LOWER(group_name) = LOWER(?)',
      [group_name.trim()],
    );
    if (dup) {
      await conn.rollback();
      return res.status(409).json({ message: `Customer group "${group_name}" already exists` });
    }

    const recNo = await generateRecNo(conn);

    const [result] = await conn.query(
      `INSERT INTO customer_group_master (rec_no, group_name, description, status)
       VALUES (?, ?, ?, ?)`,
      [recNo, group_name.trim(), description.trim(), status],
    );

    await conn.commit();

    const created = await fetchGroup(result.insertId);
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to create customer group' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/customer-groups/:id  — update ───────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { group_name, description, status } = req.body;
    const { id } = req.params;

    if (!group_name?.trim()) {
      return res.status(400).json({ message: 'group_name is required' });
    }

    // Duplicate check (exclude self)
    const [[dup]] = await db.query(
      'SELECT id FROM customer_group_master WHERE LOWER(group_name) = LOWER(?) AND id != ?',
      [group_name.trim(), id],
    );
    if (dup) {
      return res.status(409).json({ message: `Customer group "${group_name}" already exists` });
    }

    await db.query(
      `UPDATE customer_group_master
       SET group_name   = ?,
           description  = ?,
           status       = ?,
           updated_at   = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [group_name.trim(), description?.trim() ?? '', status ?? 'Active', id],
    );

    const updated = await fetchGroup(id);
    if (!updated) return res.status(404).json({ message: 'Customer group not found' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update customer group' });
  }
});

// ── DELETE /api/customer-groups/:id ──────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM customer_group_master WHERE id = ?',
      [req.params.id],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Customer group not found' });
    res.json({ message: 'Customer group deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete customer group' });
  }
});

module.exports = router;