// backend/routes/agentMasterRoutes.js
// Full CRUD + file-upload for Agent Master

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');   // mysql2/promise pool
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ── Multer config ──────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/agent-docs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file,  cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /pdf|jpg|jpeg|png|doc|docx/.test(
      path.extname(file.originalname).toLowerCase(),
    );
    cb(null, ok);
  },
});

// ── Generate AGT-YYYY-NNN inside an open transaction ──────────────────────────
async function generateAgentCode(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(agent_code, '-', -1) AS UNSIGNED)) AS max_seq
     FROM agents
     WHERE agent_code LIKE ?`,
    [`AGT-${year}-%`],
  );
  const seq    = (row.max_seq ?? 0) + 1;
  const padded = String(seq).padStart(3, '0');
  return `AGT-${year}-${padded}`;
}

// ── Helper: full agent object ─────────────────────────────────────────────────
async function fetchAgent(id) {
  const [[row]]  = await db.query('SELECT * FROM agents WHERE id = ?', [id]);
  if (!row) return null;
  const [attachRows] = await db.query(
    'SELECT * FROM agent_attachments WHERE agent_id = ?', [id],
  );
  return { ...row, attachments: attachRows };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/agents  — list with search, status filter, pagination
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where  = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (agent_name LIKE ? OR contact_no LIKE ? OR email LIKE ? OR agent_code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { where += ' AND status = ?'; params.push(status); }

    const [rows] = await db.query(
      `SELECT * FROM agents ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM agents ${where}`, params,
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch agents' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/agents/:id  — single agent with attachments
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const agent = await fetchAgent(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    res.json(agent);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching agent' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agents  — create
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', upload.array('attachments', 10), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const agentCode = await generateAgentCode(conn);

    const {
      type, agent_name, address, pin_code, district, state, country,
      gst_no, pan_no, tan_no,
      msme, msme_sector, msme_type, msme_reg_no,
      email, contact_name, designation, contact_no, contact_email,
      commission_pct, status,
    } = req.body;

    const [result] = await conn.query(
      `INSERT INTO agents
         (agent_code, type, agent_name, address, pin_code, district, state, country,
          gst_no, pan_no, tan_no, msme, msme_sector, msme_type, msme_reg_no,
          email, contact_name, designation, contact_no, contact_email,
          commission_pct, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        agentCode, type, agent_name,
        address, pin_code, district, state, country || 'India',
        gst_no, pan_no, tan_no,
        msme || 'No', msme_sector || null, msme_type || null, msme_reg_no || null,
        email, contact_name, designation, contact_no, contact_email,
        commission_pct ? Number(commission_pct) : null,
        status || 'Active',
      ],
    );
    const dbId = result.insertId;

    if (req.files && req.files.length) {
      for (const f of req.files) {
        await conn.query(
          'INSERT INTO agent_attachments (agent_id, file_name, file_path, file_size, mime_type) VALUES (?,?,?,?,?)',
          [dbId, f.originalname, f.filename, f.size, f.mimetype],
        );
      }
    }

    await conn.commit();
    const created = await fetchAgent(dbId);
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to create agent' });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/agents/:id  — update
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', upload.array('attachments', 10), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    const {
      type, agent_name, address, pin_code, district, state, country,
      gst_no, pan_no, tan_no,
      msme, msme_sector, msme_type, msme_reg_no,
      email, contact_name, designation, contact_no, contact_email,
      commission_pct, status,
      deleted_attachments,
    } = req.body;

    // agent_code is never updated after creation
    await conn.query(
      `UPDATE agents SET
         type=?, agent_name=?, address=?, pin_code=?, district=?, state=?, country=?,
         gst_no=?, pan_no=?, tan_no=?,
         msme=?, msme_sector=?, msme_type=?, msme_reg_no=?,
         email=?, contact_name=?, designation=?, contact_no=?, contact_email=?,
         commission_pct=?, status=?
       WHERE id=?`,
      [
        type, agent_name, address, pin_code, district, state, country || 'India',
        gst_no, pan_no, tan_no,
        msme || 'No', msme_sector || null, msme_type || null, msme_reg_no || null,
        email, contact_name, designation, contact_no, contact_email,
        commission_pct ? Number(commission_pct) : null,
        status || 'Active',
        id,
      ],
    );

    // Delete removed attachments
    if (deleted_attachments) {
      const ids = JSON.parse(deleted_attachments);
      if (ids.length) {
        const [files] = await conn.query(
          'SELECT file_path FROM agent_attachments WHERE id IN (?)', [ids],
        );
        for (const f of files) {
          const fp = path.join(uploadDir, f.file_path);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
        await conn.query('DELETE FROM agent_attachments WHERE id IN (?)', [ids]);
      }
    }

    // New attachments
    if (req.files && req.files.length) {
      for (const f of req.files) {
        await conn.query(
          'INSERT INTO agent_attachments (agent_id, file_name, file_path, file_size, mime_type) VALUES (?,?,?,?,?)',
          [id, f.originalname, f.filename, f.size, f.mimetype],
        );
      }
    }

    await conn.commit();
    const updated = await fetchAgent(id);
    res.json(updated);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to update agent' });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/agents/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [files] = await db.query(
      'SELECT file_path FROM agent_attachments WHERE agent_id = ?', [req.params.id],
    );
    for (const f of files) {
      const fp = path.join(uploadDir, f.file_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await db.query('DELETE FROM agents WHERE id = ?', [req.params.id]);
    res.json({ message: 'Agent deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete agent' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/agents/attachment/:filename  — serve file
// ─────────────────────────────────────────────────────────────────────────────
router.get('/attachment/:filename', (req, res) => {
  const fp = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ message: 'File not found' });
  res.sendFile(fp);
});

module.exports = router;
