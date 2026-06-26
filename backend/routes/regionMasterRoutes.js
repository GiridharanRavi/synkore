// backend/routes/regionMasterRoutes.js
// Full CRUD for Region Master — rec_no auto-generation (RGN-YYYY-NNN)
// Mirrors processingTypeRoutes.js pattern exactly

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

const REGION_OPTIONS = ['Delhi', 'Surat', 'Jaipur', 'Mumbai', 'Erode'];

// ── Generate next RGN-YYYY-NNN ────────────────────────────────────────────────
async function generateRecNo(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(rec_no, '-', -1) AS UNSIGNED)) AS max_seq
     FROM regions WHERE rec_no LIKE ?`,
    [`RGN-${year}-%`],
  );
  const seq = (row.max_seq ?? 0) + 1;
  return `RGN-${year}-${String(seq).padStart(3, '0')}`;
}

// ── Helper: fetch single row ──────────────────────────────────────────────────
async function fetchRow(id) {
  const [[row]] = await db.query('SELECT * FROM regions WHERE id = ?', [id]);
  return row ?? null;
}

// ── GET /api/regions  — list with search & pagination ─────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where    = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (region_name LIKE ? OR description LIKE ? OR rec_no LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    const [rows] = await db.query(
      `SELECT * FROM regions
       ${where}
       ORDER BY id ASC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM regions ${where}`,
      params,
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[RegionMaster] GET / error:', err.message, err.sqlMessage ?? '');
    res.status(500).json({ message: err.sqlMessage ?? 'Failed to fetch regions' });
  }
});

// ── GET /api/regions/meta/options ────────────────────────────────────────────
router.get('/meta/options', (_req, res) => {
  res.json({ regionOptions: REGION_OPTIONS });
});

// ── GET /api/regions/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const row = await fetchRow(req.params.id);
    if (!row) return res.status(404).json({ message: 'Region not found' });
    res.json(row);
  } catch (err) {
    console.error('[RegionMaster] GET /:id error:', err.message, err.sqlMessage ?? '');
    res.status(500).json({ message: err.sqlMessage ?? 'Error fetching region' });
  }
});

// ── POST /api/regions  — create ───────────────────────────────────────────────
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { region_name, description = '', status = 'Active' } = req.body;

    if (!region_name?.trim()) {
      return res.status(400).json({ message: 'Region Name is required' });
    }

    // Duplicate check
    const [[dup]] = await conn.query(
      'SELECT id FROM regions WHERE LOWER(region_name) = LOWER(?)',
      [region_name.trim()],
    );
    if (dup) {
      await conn.rollback();
      return res.status(409).json({ message: `Region "${region_name}" already exists` });
    }

    const recNo = await generateRecNo(conn);

    const [result] = await conn.query(
      `INSERT INTO regions (rec_no, region_name, description, status)
       VALUES (?, ?, ?, ?)`,
      [recNo, region_name.trim(), description.trim(), status],
    );

    await conn.commit();

    const created = await fetchRow(result.insertId);
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    console.error('[RegionMaster] POST error:', err.message, err.sqlMessage ?? '');
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Region name already exists' });
    }
    res.status(500).json({ message: err.sqlMessage ?? 'Failed to create region' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/regions/:id  — update ───────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { region_name, description, status } = req.body;
    const { id } = req.params;

    if (!region_name?.trim()) {
      return res.status(400).json({ message: 'Region Name is required' });
    }

    // Duplicate check (exclude self)
    const [[dup]] = await db.query(
      'SELECT id FROM regions WHERE LOWER(region_name) = LOWER(?) AND id != ?',
      [region_name.trim(), id],
    );
    if (dup) {
      return res.status(409).json({ message: `Region "${region_name}" already exists` });
    }

    await db.query(
      `UPDATE regions
       SET region_name  = ?,
           description  = ?,
           status       = ?,
           updated_at   = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [region_name.trim(), description?.trim() ?? '', status ?? 'Active', id],
    );

    const updated = await fetchRow(id);
    if (!updated) return res.status(404).json({ message: 'Region not found' });
    res.json(updated);
  } catch (err) {
    console.error('[RegionMaster] PUT error:', err.message, err.sqlMessage ?? '');
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Region name already exists' });
    }
    res.status(500).json({ message: err.sqlMessage ?? 'Failed to update region' });
  }
});

// ── DELETE /api/regions/:id ───────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    // Guard: block if customers are linked
    const [[{ cnt }]] = await db.query(
      'SELECT COUNT(*) AS cnt FROM customers WHERE region_id = ?',
      [req.params.id],
    ).catch(() => [[{ cnt: 0 }]]);

    if (cnt > 0) {
      return res.status(409).json({
        message: `Cannot delete: ${cnt} customer(s) are linked to this region`,
      });
    }

    const [result] = await db.query(
      'DELETE FROM regions WHERE id = ?',
      [req.params.id],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Region not found' });

    res.json({ message: 'Region deleted' });
  } catch (err) {
    console.error('[RegionMaster] DELETE error:', err.message, err.sqlMessage ?? '');
    res.status(500).json({ message: err.sqlMessage ?? 'Failed to delete region' });
  }
});

module.exports = router;