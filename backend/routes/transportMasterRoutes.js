// backend/routes/transportMasterRoutes.js
// Full CRUD + file-upload for Transport Master

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');   // mysql2/promise pool
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ── Multer config ────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/transport-docs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /pdf|jpg|jpeg|png|doc|docx|xlsx/.test(
      path.extname(file.originalname).toLowerCase(),
    );
    cb(null, ok);
  },
});

// ── Auto-generate TR-YYYY-NNN code ───────────────────────────────────────────
async function generateTransportCode(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(transport_code, '-', -1) AS UNSIGNED)) AS max_seq
     FROM transports
     WHERE transport_code LIKE ?`,
    [`TR-${year}-%`],
  );
  const nextSeq = (row.max_seq ?? 0) + 1;
  return `TR-${year}-${String(nextSeq).padStart(3, '0')}`;
}

// ── Fetch full transport record ───────────────────────────────────────────────
async function fetchTransport(id) {
  const [[row]] = await db.query('SELECT * FROM transports WHERE id = ?', [id]);
  if (!row) return null;
  const [attachRows] = await db.query(
    'SELECT * FROM transport_attachments WHERE transport_id = ?', [id],
  );
  return { ...row, attachments: attachRows };
}

// ── GET /api/transports  — list ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', transport_mode = '', status = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ` AND (
        t.transport_company LIKE ? OR t.transport_code LIKE ?
        OR t.contact_no LIKE ? OR t.email LIKE ?
      )`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (transport_mode) { where += ' AND t.transport_mode = ?'; params.push(transport_mode); }
    if (status)         { where += ' AND t.status = ?';         params.push(status); }

    const [rows] = await db.query(
      `SELECT t.* FROM transports t ${where} ORDER BY t.id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM transports t ${where}`, params,
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch transports' });
  }
});

// ── GET /api/transports/:id  — single record ─────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const transport = await fetchTransport(req.params.id);
    if (!transport) return res.status(404).json({ message: 'Transport not found' });
    res.json(transport);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching transport' });
  }
});

// ── POST /api/transports  — create ───────────────────────────────────────────
router.post('/', upload.array('attachments', 10), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const transportCode = await generateTransportCode(conn);

    const {
      transport_mode, transport_type, transport_company,
      address, pin_code, district, state, country,
      gst_no, msme, msme_reg_no,
      email, contact_name, designation, contact_no, contact_email,
      status,
    } = req.body;

    const [result] = await conn.query(
      `INSERT INTO transports
        (transport_code,
         transport_mode, transport_type, transport_company,
         address, pin_code, district, state, country,
         gst_no, msme, msme_reg_no,
         email, contact_name, designation, contact_no, contact_email,
         status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        transportCode,
        transport_mode, transport_type || null, transport_company,
        address, pin_code, district, state, country || 'India',
        gst_no, msme || 'No', msme === 'Yes' ? (msme_reg_no || null) : null,
        email, contact_name, designation, contact_no, contact_email,
        status || 'Active',
      ],
    );
    const dbId = result.insertId;

    // Attachments
    if (req.files && req.files.length) {
      for (const f of req.files) {
        await conn.query(
          `INSERT INTO transport_attachments
            (transport_id, file_name, file_path, file_size, mime_type)
           VALUES (?,?,?,?,?)`,
          [dbId, f.originalname, f.filename, f.size, f.mimetype],
        );
      }
    }

    await conn.commit();
    res.status(201).json(await fetchTransport(dbId));
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to create transport' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/transports/:id  — update ────────────────────────────────────────
router.put('/:id', upload.array('attachments', 10), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    const {
      transport_mode, transport_type, transport_company,
      address, pin_code, district, state, country,
      gst_no, msme, msme_reg_no,
      email, contact_name, designation, contact_no, contact_email,
      status, deleted_attachments,
    } = req.body;

    // transport_code is NEVER updated after creation
    await conn.query(
      `UPDATE transports SET
        transport_mode=?, transport_type=?, transport_company=?,
        address=?, pin_code=?, district=?, state=?, country=?,
        gst_no=?, msme=?, msme_reg_no=?,
        email=?, contact_name=?, designation=?, contact_no=?, contact_email=?,
        status=?
       WHERE id=?`,
      [
        transport_mode, transport_type || null, transport_company,
        address, pin_code, district, state, country || 'India',
        gst_no, msme || 'No', msme === 'Yes' ? (msme_reg_no || null) : null,
        email, contact_name, designation, contact_no, contact_email,
        status || 'Active',
        id,
      ],
    );

    // Delete removed attachments
    if (deleted_attachments) {
      const ids = JSON.parse(deleted_attachments);
      if (ids.length) {
        const [files] = await conn.query(
          'SELECT file_path FROM transport_attachments WHERE id IN (?)', [ids],
        );
        for (const f of files) {
          const fp = path.join(uploadDir, f.file_path);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
        await conn.query('DELETE FROM transport_attachments WHERE id IN (?)', [ids]);
      }
    }

    // New attachments
    if (req.files && req.files.length) {
      for (const f of req.files) {
        await conn.query(
          `INSERT INTO transport_attachments
            (transport_id, file_name, file_path, file_size, mime_type)
           VALUES (?,?,?,?,?)`,
          [id, f.originalname, f.filename, f.size, f.mimetype],
        );
      }
    }

    await conn.commit();
    res.json(await fetchTransport(id));
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to update transport' });
  } finally {
    conn.release();
  }
});

// ── DELETE /api/transports/:id ───────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [files] = await db.query(
      'SELECT file_path FROM transport_attachments WHERE transport_id = ?',
      [req.params.id],
    );
    for (const f of files) {
      const fp = path.join(uploadDir, f.file_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await db.query('DELETE FROM transports WHERE id = ?', [req.params.id]);
    res.json({ message: 'Transport deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete transport' });
  }
});

// ── GET /api/transports/attachment/:filename  — serve file ───────────────────
router.get('/attachment/:filename', (req, res) => {
  const fp = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ message: 'File not found' });
  res.sendFile(fp);
});

module.exports = router;