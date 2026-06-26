// backend/routes/vendorMasterRoutes.js
// Full CRUD + file-upload for Vendor Master
// Fixes: address1/address2 split, junction tables for type_ids / processing_type_ids

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');   // mysql2/promise pool
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ── Multer config ─────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/vendor-docs');
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
    const allowed = /pdf|jpg|jpeg|png|doc|docx|xlsx/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  },
});

// ── Generate next VEN-YYYY-NNN ID ────────────────────────────
async function generateVendorId(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(vendor_id, '-', -1) AS UNSIGNED)) AS max_seq
     FROM vendors
     WHERE vendor_id LIKE ?`,
    [`VEN-${year}-%`],
  );
  const nextSeq = (row.max_seq ?? 0) + 1;
  return `VEN-${year}-${String(nextSeq).padStart(3, '0')}`;
}

// ── Helper: sync junction table rows ────────────────────────
async function syncJunction(conn, table, vendorCol, typeCol, vendorId, ids) {
  await conn.query(`DELETE FROM ${table} WHERE ${vendorCol} = ?`, [vendorId]);
  for (const id of ids) {
    await conn.query(
      `INSERT INTO ${table} (${vendorCol}, ${typeCol}) VALUES (?, ?)`,
      [vendorId, id],
    );
  }
}

// ── Helper: build full vendor object ─────────────────────────
async function fetchVendor(id) {
  const [[row]] = await db.query('SELECT * FROM vendors WHERE id = ?', [id]);
  if (!row) return null;

  const [attachRows] = await db.query(
    'SELECT * FROM vendor_attachments WHERE vendor_id = ?', [id],
  );

  const [typeRows] = await db.query(
    `SELECT st.id, st.service_type AS service_type_name
     FROM vendor_service_types vst
     JOIN service_types st ON vst.service_type_id = st.id
     WHERE vst.vendor_id = ?`, [id],
  );

  const [procRows] = await db.query(
    `SELECT pt.id, pt.type_name AS processing_type_name
     FROM vendor_processing_types vpt
     JOIN processing_types pt ON vpt.processing_type_id = pt.id
     WHERE vpt.vendor_id = ?`, [id],
  );

  return {
    ...row,
    types:            typeRows,
    processing_types: procRows,
    attachments:      attachRows,
  };
}

// ── Helper: parse JSON array field safely ─────────────────────
function parseIds(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw).map(Number).filter(Boolean); }
  catch { return []; }
}

// ─────────────────────────────────────────────────────────────
// GET /api/vendors  — list with search & pagination
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ` AND (
        v.vendor_name LIKE ? OR v.contact_no LIKE ? OR v.email LIKE ?
        OR v.vendor_id LIKE ? OR v.gst_no LIKE ?
      )`;
      const like = `%${search}%`;
      params.push(like, like, like, like, like);
    }
    if (status) { where += ' AND v.status = ?'; params.push(status); }

    const [rows] = await db.query(
      `SELECT v.* FROM vendors v ${where} ORDER BY v.id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM vendors v ${where}`, params,
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch vendors' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/vendors/meta/lookup  — dropdowns
// ─────────────────────────────────────────────────────────────
// NOTE: this route MUST be declared before /:id to avoid "meta" being
// treated as an id parameter.
router.get('/meta/lookup', async (_req, res) => {
  try {
    let serviceTypes = [], processingTypes = [];
    try {
      [serviceTypes] = await db.query(
        `SELECT id, service_type AS service_type_name
         FROM service_types WHERE status = 'Active' ORDER BY service_type`,
      );
      [processingTypes] = await db.query(
        `SELECT id, type_name AS processing_type_name
         FROM processing_types WHERE status = 'Active' ORDER BY type_name`,
      );
    } catch (_) { /* tables may not exist yet */ }
    res.json({ serviceTypes, processingTypes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load lookup data' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/vendors/attachment/:filename  — serve file
// ─────────────────────────────────────────────────────────────
router.get('/attachment/:filename', (req, res) => {
  const fp = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ message: 'File not found' });
  res.sendFile(fp);
});

// ─────────────────────────────────────────────────────────────
// GET /api/vendors/:id  — single record
// ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const vendor = await fetchVendor(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    res.json(vendor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching vendor' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/vendors  — create
// ─────────────────────────────────────────────────────────────
router.post('/', upload.array('attachments', 10), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const vendorCode = await generateVendorId(conn);

    const {
      vendor_name,
      address1 = '',   // ✅ frontend now sends address1 / address2
      address2 = '',
      pin_code, district, state, country,
      gst_no,
      msme, msme_sector, msme_type, msme_reg_no,
      email, contact_name, designation, contact_no, contact_email,
      status,
      type_ids,
      processing_type_ids,
    } = req.body;

    // Combine for legacy `address` column if you still need it
    const addressLegacy = [address1, address2].filter(Boolean).join('\n');

    const [result] = await conn.query(
      `INSERT INTO vendors
        (vendor_id,
         vendor_name, address, address1, address2,
         pin_code, district, state, country,
         gst_no, msme, msme_sector, msme_type, msme_reg_no,
         email, contact_name, designation, contact_no, contact_email,
         status)
       VALUES (?,  ?,?,?,?,  ?,?,?,?,  ?,?,?,?,?,  ?,?,?,?,?,  ?)`,
      [
        vendorCode,
        vendor_name, addressLegacy, address1, address2,
        pin_code || '', district || '', state || 'Tamil Nadu', country || 'India',
        gst_no || '',
        msme || 'No',
        msme_sector || null,
        msme_type   || null,
        msme_reg_no || null,
        email || '', contact_name || '', designation || '', contact_no || '', contact_email || '',
        status || 'Active',
      ],
    );
    const dbId = result.insertId;

    // ✅ Sync service types junction table
    const typeIdsParsed = parseIds(type_ids);
    await syncJunction(conn, 'vendor_service_types', 'vendor_id', 'service_type_id', dbId, typeIdsParsed);

    // ✅ Sync processing types junction table
    const procIdsParsed = parseIds(processing_type_ids);
    await syncJunction(conn, 'vendor_processing_types', 'vendor_id', 'processing_type_id', dbId, procIdsParsed);

    // Attachments
    if (req.files && req.files.length) {
      for (const f of req.files) {
        await conn.query(
          'INSERT INTO vendor_attachments (vendor_id, file_name, file_path, file_size, mime_type) VALUES (?,?,?,?,?)',
          [dbId, f.originalname, f.filename, f.size, f.mimetype],
        );
      }
    }

    await conn.commit();
    const created = await fetchVendor(dbId);
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: err.message || 'Failed to create vendor' });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/vendors/:id  — update
// ─────────────────────────────────────────────────────────────
router.put('/:id', upload.array('attachments', 10), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    const {
      vendor_name,
      address1 = '',   // ✅ address1 / address2 from frontend
      address2 = '',
      pin_code, district, state, country,
      gst_no,
      msme, msme_sector, msme_type, msme_reg_no,
      email, contact_name, designation, contact_no, contact_email,
      status,
      type_ids,
      processing_type_ids,
      deleted_attachments,
    } = req.body;

    const addressLegacy = [address1, address2].filter(Boolean).join('\n');

    await conn.query(
      `UPDATE vendors SET
        vendor_name=?, address=?, address1=?, address2=?,
        pin_code=?, district=?, state=?, country=?,
        gst_no=?, msme=?, msme_sector=?, msme_type=?, msme_reg_no=?,
        email=?, contact_name=?, designation=?, contact_no=?, contact_email=?,
        status=?
       WHERE id=?`,
      [
        vendor_name, addressLegacy, address1, address2,
        pin_code || '', district || '', state || 'Tamil Nadu', country || 'India',
        gst_no || '',
        msme || 'No',
        msme_sector || null,
        msme_type   || null,
        msme_reg_no || null,
        email || '', contact_name || '', designation || '', contact_no || '', contact_email || '',
        status || 'Active',
        id,
      ],
    );

    // ✅ Re-sync service types
    if (type_ids !== undefined) {
      const ids = parseIds(type_ids);
      await syncJunction(conn, 'vendor_service_types', 'vendor_id', 'service_type_id', id, ids);
    }

    // ✅ Re-sync processing types
    if (processing_type_ids !== undefined) {
      const ids = parseIds(processing_type_ids);
      await syncJunction(conn, 'vendor_processing_types', 'vendor_id', 'processing_type_id', id, ids);
    }

    // Delete removed attachments
    if (deleted_attachments) {
      const ids = parseIds(deleted_attachments);
      if (ids.length) {
        const [files] = await conn.query(
          'SELECT file_path FROM vendor_attachments WHERE id IN (?)', [ids],
        );
        for (const f of files) {
          const fp = path.join(uploadDir, f.file_path);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
        await conn.query('DELETE FROM vendor_attachments WHERE id IN (?)', [ids]);
      }
    }

    // New attachments
    if (req.files && req.files.length) {
      for (const f of req.files) {
        await conn.query(
          'INSERT INTO vendor_attachments (vendor_id, file_name, file_path, file_size, mime_type) VALUES (?,?,?,?,?)',
          [id, f.originalname, f.filename, f.size, f.mimetype],
        );
      }
    }

    await conn.commit();
    const updated = await fetchVendor(id);
    res.json(updated);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: err.message || 'Failed to update vendor' });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/vendors/:id
// ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [files] = await db.query(
      'SELECT file_path FROM vendor_attachments WHERE vendor_id = ?', [req.params.id],
    );
    for (const f of files) {
      const fp = path.join(uploadDir, f.file_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    // Junction rows deleted automatically via ON DELETE CASCADE
    await db.query('DELETE FROM vendors WHERE id = ?', [req.params.id]);
    res.json({ message: 'Vendor deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete vendor' });
  }
});

module.exports = router;