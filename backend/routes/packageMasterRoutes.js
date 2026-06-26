// backend/routes/packageMasterRoutes.js
// Full CRUD for Package Master — with rec_no auto-generation (PKG-YYYY-NNN)
// Mirrors processingTypeRoutes.js pattern exactly

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

const PACKAGE_OPTIONS = {
  Yarn:   ['Bags', 'Cones', 'Pallette'],
  Fabric: ['Roll', 'Bale'],
};

// ── Generate next PKG-YYYY-NNN ────────────────────────────────────────────────
async function generateRecNo(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(rec_no, '-', -1) AS UNSIGNED)) AS max_seq
     FROM packages WHERE rec_no LIKE ?`,
    [`PKG-${year}-%`],
  );
  const seq = (row.max_seq ?? 0) + 1;
  return `PKG-${year}-${String(seq).padStart(3, '0')}`;
}

// ── Helper: fetch single row ──────────────────────────────────────────────────
async function fetchRow(id) {
  const [[row]] = await db.query('SELECT * FROM packages WHERE id = ?', [id]);
  return row ?? null;
}

// ── GET /api/packages  — list with search & pagination ────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', material_type = '', status = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where    = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (material_type LIKE ? OR package_name LIKE ? OR rec_no LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (material_type) { where += ' AND material_type = ?'; params.push(material_type); }
    if (status)        { where += ' AND status = ?';        params.push(status); }

    const [rows] = await db.query(
      `SELECT * FROM packages
       ${where}
       ORDER BY id ASC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM packages ${where}`,
      params,
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch packages' });
  }
});

// ── GET /api/packages/meta/options ───────────────────────────────────────────
router.get('/meta/options', (_req, res) => {
  res.json({ packageOptions: PACKAGE_OPTIONS });
});

// ── GET /api/packages/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const row = await fetchRow(req.params.id);
    if (!row) return res.status(404).json({ message: 'Package not found' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching package' });
  }
});

// ── POST /api/packages  — create ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { material_type, package_name, status = 'Active' } = req.body;

    if (!material_type?.trim()) {
      return res.status(400).json({ message: 'Material Type is required' });
    }
    if (!package_name?.trim()) {
      return res.status(400).json({ message: 'Package Name is required' });
    }

    // Validate package_name belongs to material_type
    const validOptions = PACKAGE_OPTIONS[material_type] ?? [];
    if (validOptions.length && !validOptions.includes(package_name)) {
      await conn.rollback();
      return res.status(400).json({ message: `Invalid package name for ${material_type}` });
    }

    // Duplicate check — same material_type + package_name combo
    const [[dup]] = await conn.query(
      'SELECT id FROM packages WHERE LOWER(material_type) = LOWER(?) AND LOWER(package_name) = LOWER(?)',
      [material_type.trim(), package_name.trim()],
    );
    if (dup) {
      await conn.rollback();
      return res.status(409).json({ message: `Package "${package_name}" for ${material_type} already exists` });
    }

    const recNo = await generateRecNo(conn);

    const [result] = await conn.query(
      `INSERT INTO packages (rec_no, material_type, package_name, status)
       VALUES (?, ?, ?, ?)`,
      [recNo, material_type.trim(), package_name.trim(), status],
    );

    await conn.commit();

    const created = await fetchRow(result.insertId);
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to create package' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/packages/:id  — update ──────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { material_type, package_name, status } = req.body;
    const { id } = req.params;

    if (!material_type?.trim()) {
      return res.status(400).json({ message: 'Material Type is required' });
    }
    if (!package_name?.trim()) {
      return res.status(400).json({ message: 'Package Name is required' });
    }

    // Validate package_name belongs to material_type
    const validOptions = PACKAGE_OPTIONS[material_type] ?? [];
    if (validOptions.length && !validOptions.includes(package_name)) {
      return res.status(400).json({ message: `Invalid package name for ${material_type}` });
    }

    // Duplicate check (exclude self)
    const [[dup]] = await db.query(
      'SELECT id FROM packages WHERE LOWER(material_type) = LOWER(?) AND LOWER(package_name) = LOWER(?) AND id != ?',
      [material_type.trim(), package_name.trim(), id],
    );
    if (dup) {
      return res.status(409).json({ message: `Package "${package_name}" for ${material_type} already exists` });
    }

    await db.query(
      `UPDATE packages
       SET material_type = ?,
           package_name  = ?,
           status        = ?,
           updated_at    = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [material_type.trim(), package_name.trim(), status ?? 'Active', id],
    );

    const updated = await fetchRow(id);
    if (!updated) return res.status(404).json({ message: 'Package not found' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update package' });
  }
});

// ── DELETE /api/packages/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM packages WHERE id = ?',
      [req.params.id],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Package not found' });
    res.json({ message: 'Package deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete package' });
  }
});

module.exports = router;