// backend/routes/certificationRoutes.js
// Full CRUD + file upload for Certification Master

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');   // mysql2/promise pool
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ── Multer config ─────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/certification-docs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /pdf|jpg|jpeg|png|doc|docx/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  },
});

// ── Generate CERT-YYYY-NNN ID ─────────────────────────────────
async function generateCertId(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(cert_id, '-', -1) AS UNSIGNED)) AS max_seq
     FROM certification WHERE cert_id LIKE ?`,
    [`CERT-${year}-%`],
  );
  const nextSeq = (row.max_seq ?? 0) + 1;
  return `CERT-${year}-${String(nextSeq).padStart(3, '0')}`;
}

// ── Fetch full certification object ───────────────────────────
async function fetchCert(id) {
  const [[row]] = await db.query('SELECT * FROM certification WHERE id = ?', [id]);
  if (!row) return null;
  const [attachments] = await db.query('SELECT * FROM certification_attachments WHERE certification_id = ?', [id]);
  const [history]     = await db.query(
    'SELECT * FROM certification_number_history WHERE certification_id = ? ORDER BY replaced_at DESC', [id],
  );
  return { ...row, attachments, cert_number_history: history };
}

// ── GET /api/certifications  — list with search & pagination ──
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (certification_name LIKE ? OR certification_number LIKE ? OR cert_id LIKE ? OR certification_body LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { where += ' AND status = ?'; params.push(status); }

    const [rows] = await db.query(
      `SELECT * FROM certification ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM certification ${where}`, params,
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch certification' });
  }
});

// ── GET /api/certifications/:id ───────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const cert = await fetchCert(req.params.id);
    if (!cert) return res.status(404).json({ message: 'Certification not found' });
    res.json(cert);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching certification' });
  }
});

// ── POST /api/certifications  — create ───────────────────────
router.post('/', upload.array('attachments', 5), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const certCode = await generateCertId(conn);

    const { certification_name, certification_number, valid_from, valid_to, certification_body, status } = req.body;

    const [result] = await conn.query(
      `INSERT INTO certification
        (cert_id, certification_name, certification_number, valid_from, valid_to, certification_body, status)
       VALUES (?,?,?,?,?,?,?)`,
      [certCode, certification_name, certification_number || null,
       valid_from || null, valid_to || null, certification_body || null,
       status || 'Active'],
    );
    const dbId = result.insertId;

    // Attachments
    if (req.files?.length) {
      for (const f of req.files) {
        await conn.query(
          'INSERT INTO certification_attachments (certification_id, file_name, file_path, file_size, mime_type) VALUES (?,?,?,?,?)',
          [dbId, f.originalname, f.filename, f.size, f.mimetype],
        );
      }
    }

    await conn.commit();
    res.status(201).json(await fetchCert(dbId));
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to create certification' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/certifications/:id  — update ────────────────────
router.put('/:id', upload.array('attachments', 5), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    const {
      certification_name, certification_number, valid_from, valid_to,
      certification_body, status, deleted_attachments,
    } = req.body;

    // If cert number is changing, save history first
    const [[existing]] = await conn.query('SELECT certification_number, valid_from, valid_to FROM certification WHERE id = ?', [id]);
    if (existing && existing.certification_number && existing.certification_number !== certification_number) {
      await conn.query(
        'INSERT INTO certification_number_history (certification_id, cert_number, valid_from, valid_to) VALUES (?,?,?,?)',
        [id, existing.certification_number, existing.valid_from, existing.valid_to],
      );
    }

    await conn.query(
      `UPDATE certification SET
        certification_name=?, certification_number=?, valid_from=?, valid_to=?,
        certification_body=?, status=?
       WHERE id=?`,
      [certification_name, certification_number || null, valid_from || null,
       valid_to || null, certification_body || null, status || 'Active', id],
    );

    // Delete removed attachments
    if (deleted_attachments) {
      const ids = JSON.parse(deleted_attachments);
      if (ids.length) {
        const [files] = await conn.query('SELECT file_path FROM certification_attachments WHERE id IN (?)', [ids]);
        for (const f of files) {
          const fp = path.join(uploadDir, f.file_path);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
        await conn.query('DELETE FROM certification_attachments WHERE id IN (?)', [ids]);
      }
    }

    // New attachments
    if (req.files?.length) {
      for (const f of req.files) {
        await conn.query(
          'INSERT INTO certification_attachments (certification_id, file_name, file_path, file_size, mime_type) VALUES (?,?,?,?,?)',
          [id, f.originalname, f.filename, f.size, f.mimetype],
        );
      }
    }

    await conn.commit();
    res.json(await fetchCert(id));
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to update certification' });
  } finally {
    conn.release();
  }
});

// ── DELETE /api/certifications/:id ───────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [files] = await db.query('SELECT file_path FROM certification_attachments WHERE certification_id = ?', [req.params.id]);
    for (const f of files) {
      const fp = path.join(uploadDir, f.file_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await db.query('DELETE FROM certification WHERE id = ?', [req.params.id]);
    res.json({ message: 'Certification deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete certification' });
  }
});

// ── GET /api/certifications/attachment/:filename — serve file ─
router.get('/attachment/:filename', (req, res) => {
  const fp = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ message: 'File not found' });
  res.sendFile(fp);
});

module.exports = router;