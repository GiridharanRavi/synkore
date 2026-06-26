// backend/routes/processingTypeRoutes.js
// CRUD for Processing Types Master — mirrors customerMasterRoutes.js pattern

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// ── Allowed preset type names (matches frontend constant) ─────────────────────
const PRESET_TYPE_NAMES = [
  'Desizing',
  'Bleaching (RFD - Ready for dyeing)',
  'Dyeing',
  'Printing',
  'Washing',
  'Zero Zero Finishing',
];

// ── Generate next PRT-YYYY-NNN ────────────────────────────────────────────────
async function generateRecNo(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(rec_no, '-', -1) AS UNSIGNED)) AS max_seq
     FROM processing_types WHERE rec_no LIKE ?`,
    [`PRT-${year}-%`],
  );
  const seq = (row.max_seq ?? 0) + 1;
  return `PRT-${year}-${String(seq).padStart(3, '0')}`;
}

// ── Helper: fetch single type ─────────────────────────────────────────────────
async function fetchType(id) {
  const [[row]] = await db.query('SELECT * FROM processing_types WHERE id = ?', [id]);
  return row ?? null;
}

// ── GET /api/processing-types  — list with search & pagination ────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where    = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (type_name LIKE ? OR type_description LIKE ? OR rec_no LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    const [rows] = await db.query(
      `SELECT * FROM processing_types
       ${where}
       ORDER BY id ASC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM processing_types ${where}`,
      params,
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch processing types' });
  }
});

// ── GET /api/processing-types/meta/presets  — returns preset names list ───────
router.get('/meta/presets', (_req, res) => {
  res.json({ presets: PRESET_TYPE_NAMES });
});

// ── GET /api/processing-types/:id ────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const type = await fetchType(req.params.id);
    if (!type) return res.status(404).json({ message: 'Processing type not found' });
    res.json(type);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching processing type' });
  }
});

// ── POST /api/processing-types  — create ─────────────────────────────────────
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { type_name, type_description = '', status = 'Active' } = req.body;

    if (!type_name?.trim()) {
      return res.status(400).json({ message: 'type_name is required' });
    }

    // Duplicate check
    const [[dup]] = await conn.query(
      'SELECT id FROM processing_types WHERE LOWER(type_name) = LOWER(?)',
      [type_name.trim()],
    );
    if (dup) {
      await conn.rollback();
      return res.status(409).json({ message: `Processing type "${type_name}" already exists` });
    }

    const recNo = await generateRecNo(conn);

    const [result] = await conn.query(
      `INSERT INTO processing_types (rec_no, type_name, type_description, status)
       VALUES (?, ?, ?, ?)`,
      [recNo, type_name.trim(), type_description.trim(), status],
    );

    await conn.commit();

    const created = await fetchType(result.insertId);
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to create processing type' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/processing-types/:id  — update ──────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { type_name, type_description, status } = req.body;
    const { id } = req.params;

    if (!type_name?.trim()) {
      return res.status(400).json({ message: 'type_name is required' });
    }

    // Duplicate check (exclude self)
    const [[dup]] = await db.query(
      'SELECT id FROM processing_types WHERE LOWER(type_name) = LOWER(?) AND id != ?',
      [type_name.trim(), id],
    );
    if (dup) {
      return res.status(409).json({ message: `Processing type "${type_name}" already exists` });
    }

    await db.query(
      `UPDATE processing_types
       SET type_name        = ?,
           type_description = ?,
           status           = ?,
           updated_at       = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [type_name.trim(), type_description?.trim() ?? '', status ?? 'Active', id],
    );

    const updated = await fetchType(id);
    if (!updated) return res.status(404).json({ message: 'Processing type not found' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update processing type' });
  }
});

// ── DELETE /api/processing-types/:id ─────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM processing_types WHERE id = ?',
      [req.params.id],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Processing type not found' });
    res.json({ message: 'Processing type deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete processing type' });
  }
});

module.exports = router;