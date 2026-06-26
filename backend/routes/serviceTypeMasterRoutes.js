// backend/routes/serviceTypeMasterRoutes.js
// Full CRUD for Service Type Master — with rec_no auto-generation (SVC-YYYY-NNN)

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection'); // mysql2/promise pool

const SERVICE_TYPE_OPTIONS = [
  'Yarn', 'Warper/Sizer', 'Weaver', 'Knitter',
  'Cut Butta', 'Yarn Rewinding', 'Processing', 'Doubling', 'Inspection',
];

// ── Generate next SVC-YYYY-NNN ────────────────────────────────────────────────
async function generateRecNo(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(rec_no, '-', -1) AS UNSIGNED)) AS max_seq
     FROM service_types WHERE rec_no LIKE ?`,
    [`SVC-${year}-%`],
  );
  const seq = (row.max_seq ?? 0) + 1;
  return `SVC-${year}-${String(seq).padStart(3, '0')}`;
}

// ── Helper: fetch single row ──────────────────────────────────────────────────
async function fetchRow(id) {
  const [[row]] = await db.query('SELECT * FROM service_types WHERE id = ?', [id]);
  return row ?? null;
}

// ── GET /api/service-types  — list with search & pagination ───────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where    = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (service_type LIKE ? OR description LIKE ? OR rec_no LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    const [rows] = await db.query(
      `SELECT * FROM service_types ${where} ORDER BY id ASC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM service_types ${where}`,
      params,
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch service types' });
  }
});

// ── GET /api/service-types/meta/options  — dropdown options ──────────────────
router.get('/meta/options', (_req, res) => {
  res.json({ serviceTypeOptions: SERVICE_TYPE_OPTIONS });
});

// ── GET /api/service-types/:id ────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const row = await fetchRow(req.params.id);
    if (!row) return res.status(404).json({ message: 'Service type not found' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching service type' });
  }
});

// ── POST /api/service-types  — create ────────────────────────────────────────
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { service_type, description = '', status = 'Active' } = req.body;

    if (!service_type?.trim()) {
      return res.status(400).json({ message: 'Service Type is required' });
    }

    // Duplicate check
    const [[dup]] = await conn.query(
      'SELECT id FROM service_types WHERE LOWER(service_type) = LOWER(?)',
      [service_type.trim()],
    );
    if (dup) {
      await conn.rollback();
      return res.status(409).json({ message: `Service type "${service_type}" already exists` });
    }

    const recNo = await generateRecNo(conn);

    const [result] = await conn.query(
      `INSERT INTO service_types (rec_no, service_type, description, status)
       VALUES (?, ?, ?, ?)`,
      [recNo, service_type.trim(), description.trim(), status],
    );

    await conn.commit();

    const created = await fetchRow(result.insertId);
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to create service type' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/service-types/:id  — update ─────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { service_type, description, status } = req.body;
    const { id } = req.params;

    if (!service_type?.trim()) {
      return res.status(400).json({ message: 'Service Type is required' });
    }

    // Duplicate check (exclude self)
    const [[dup]] = await db.query(
      'SELECT id FROM service_types WHERE LOWER(service_type) = LOWER(?) AND id != ?',
      [service_type.trim(), id],
    );
    if (dup) {
      return res.status(409).json({ message: `Service type "${service_type}" already exists` });
    }

    await db.query(
      `UPDATE service_types
       SET service_type = ?,
           description  = ?,
           status       = ?,
           updated_at   = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [service_type.trim(), description?.trim() ?? '', status ?? 'Active', id],
    );

    const updated = await fetchRow(id);
    if (!updated) return res.status(404).json({ message: 'Service type not found' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update service type' });
  }
});

// ── DELETE /api/service-types/:id ────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM service_types WHERE id = ?',
      [req.params.id],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Service type not found' });
    res.json({ message: 'Service type deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete service type' });
  }
});

module.exports = router;