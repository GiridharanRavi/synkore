// backend/routes/supplierMasterRoutes.js
// Full CRUD + file-upload for Supplier Master + Supplier Type Master

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');   // your existing mysql2/promise pool
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ── Multer config ─────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/supplier-docs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },           // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /pdf|jpg|jpeg|png|doc|docx|xlsx/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  },
});

// ── Generate next SUP-YYYY-NNN ID (inside open transaction) ──────────────────
async function generateSupplierId(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(supplier_id, '-', -1) AS UNSIGNED)) AS max_seq
     FROM suppliers
     WHERE supplier_id LIKE ?`,
    [`SUP-${year}-%`],
  );
  const nextSeq = (row.max_seq ?? 0) + 1;
  return `SUP-${year}-${String(nextSeq).padStart(3, '0')}`;
}

// ── Auto-create tables if they don't exist yet ────────────────────────────────
// This prevents 500 errors on first run before migrations are applied.
async function ensureTables() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS supplier_types (
        id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
        type_name        VARCHAR(100) NOT NULL,
        supply_type      ENUM('Bulk','Normal') NOT NULL DEFAULT 'Normal',
        type_description TEXT NULL,
        created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_supplier_type_name (type_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
        supplier_id   VARCHAR(20)  NOT NULL,
        type_id       INT UNSIGNED NULL,
        supplier_name VARCHAR(200) NOT NULL,
        address       TEXT NULL,
        pin_code      VARCHAR(10)  NULL,
        district      VARCHAR(100) NULL,
        state         VARCHAR(100) NULL,
        country       VARCHAR(100) NOT NULL DEFAULT 'India',
        gst_no        VARCHAR(20)  NULL,
        msme          ENUM('Yes','No') NOT NULL DEFAULT 'No',
        msme_reg_no   VARCHAR(50)  NULL,
        email         VARCHAR(150) NULL,
        contact_name  VARCHAR(150) NULL,
        designation   VARCHAR(100) NULL,
        contact_no    VARCHAR(20)  NULL,
        contact_email VARCHAR(150) NULL,
        status        ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
        created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_supplier_id (supplier_id),
        KEY idx_supplier_type (type_id),
        CONSTRAINT fk_supplier_type
          FOREIGN KEY (type_id) REFERENCES supplier_types (id)
          ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS supplier_attachments (
        id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
        supplier_id INT UNSIGNED NOT NULL,
        file_name   VARCHAR(255) NOT NULL,
        file_path   VARCHAR(255) NOT NULL,
        file_size   INT UNSIGNED NULL,
        mime_type   VARCHAR(100) NULL,
        created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_att_supplier (supplier_id),
        CONSTRAINT fk_att_supplier
          FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // Seed default types only if the table is empty
    const [[{ cnt }]] = await db.query('SELECT COUNT(*) AS cnt FROM supplier_types');
    if (cnt === 0) {
      await db.query(`
        INSERT IGNORE INTO supplier_types (type_name, supply_type, type_description) VALUES
          ('Raw Material',     'Bulk',   'Suppliers of raw materials in bulk quantities'),
          ('Spare Parts',      'Normal', 'Suppliers of machine spare parts'),
          ('Consumables',      'Normal', 'Suppliers of day-to-day consumable items'),
          ('Service Provider', 'Normal', 'Third-party service providers'),
          ('Packaging',        'Bulk',   'Packaging material suppliers')
      `);
      console.log('[SupplierMaster] Seeded default supplier types.');
    }
  } catch (err) {
    console.error('[SupplierMaster] Table init error:', err.message);
  }
}
// Run once at startup (non-blocking)
ensureTables();

// ── Helper: build full supplier object ───────────────────────────────────────
async function fetchSupplier(id) {
  const [[row]] = await db.query(
    `SELECT s.*, st.type_name, st.supply_type
     FROM suppliers s
     LEFT JOIN supplier_types st ON s.type_id = st.id
     WHERE s.id = ?`,
    [id],
  );
  if (!row) return null;

  const [attachRows] = await db.query(
    'SELECT * FROM supplier_attachments WHERE supplier_id = ?', [id],
  );

  return { ...row, attachments: attachRows };
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUPPLIER TYPE MASTER
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/suppliers/types  — list all supplier types
router.get('/types', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM supplier_types ORDER BY type_name');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch supplier types' });
  }
});

// GET /api/suppliers/types/:id
router.get('/types/:id', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM supplier_types WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ message: 'Supplier type not found' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching supplier type' });
  }
});

// POST /api/suppliers/types  — create
router.post('/types', async (req, res) => {
  try {
    const { type_name, supply_type, type_description } = req.body;
    if (!type_name)   return res.status(400).json({ message: 'type_name is required' });
    if (!supply_type) return res.status(400).json({ message: 'supply_type is required' });

    const [result] = await db.query(
      'INSERT INTO supplier_types (type_name, supply_type, type_description) VALUES (?,?,?)',
      [type_name, supply_type, type_description ?? null],
    );
    const [[created]] = await db.query('SELECT * FROM supplier_types WHERE id = ?', [result.insertId]);
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create supplier type' });
  }
});

// PUT /api/suppliers/types/:id  — update
router.put('/types/:id', async (req, res) => {
  try {
    const { type_name, supply_type, type_description } = req.body;
    await db.query(
      'UPDATE supplier_types SET type_name=?, supply_type=?, type_description=? WHERE id=?',
      [type_name, supply_type, type_description ?? null, req.params.id],
    );
    const [[updated]] = await db.query('SELECT * FROM supplier_types WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update supplier type' });
  }
});

// DELETE /api/suppliers/types/:id
router.delete('/types/:id', async (req, res) => {
  try {
    // Prevent deletion if suppliers are using this type
    const [[{ cnt }]] = await db.query(
      'SELECT COUNT(*) AS cnt FROM suppliers WHERE type_id = ?', [req.params.id],
    );
    if (cnt > 0) {
      return res.status(409).json({ message: `Cannot delete: ${cnt} supplier(s) use this type.` });
    }
    await db.query('DELETE FROM supplier_types WHERE id = ?', [req.params.id]);
    res.json({ message: 'Supplier type deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete supplier type' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  SUPPLIER META / LOOKUP
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/suppliers/meta/lookup
router.get('/meta/lookup', async (_req, res) => {
  try {
    const [supplierTypes] = await db.query(
      'SELECT id, type_name, supply_type FROM supplier_types ORDER BY type_name',
    );
    res.json({ supplierTypes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load lookup data' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  SUPPLIER CRUD
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/suppliers  — list with search & pagination
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', type_id = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ` AND (
        s.supplier_name LIKE ? OR s.contact_no LIKE ? OR
        s.email LIKE ? OR s.supplier_id LIKE ? OR s.gst_no LIKE ?
      )`;
      const like = `%${search}%`;
      params.push(like, like, like, like, like);
    }
    if (status)  { where += ' AND s.status = ?';  params.push(status); }
    if (type_id) { where += ' AND s.type_id = ?'; params.push(type_id); }

    const [rows] = await db.query(
      `SELECT s.*, st.type_name, st.supply_type
       FROM suppliers s
       LEFT JOIN supplier_types st ON s.type_id = st.id
       ${where}
       ORDER BY s.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM suppliers s ${where}`, params,
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch suppliers' });
  }
});

// GET /api/suppliers/:id
router.get('/:id', async (req, res) => {
  try {
    const supplier = await fetchSupplier(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json(supplier);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching supplier' });
  }
});

// POST /api/suppliers  — create
router.post('/', upload.array('attachments', 10), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const supplierCode = await generateSupplierId(conn);

    const {
      type_id, supplier_name, address, pin_code, district, state, country,
      gst_no, msme, msme_reg_no, email,
      contact_name, designation, contact_no, contact_email, status,
    } = req.body;

    const [result] = await conn.query(
      `INSERT INTO suppliers
        (supplier_id, type_id, supplier_name,
         address, pin_code, district, state, country,
         gst_no, msme, msme_reg_no,
         email, contact_name, designation, contact_no, contact_email,
         status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        supplierCode,
        type_id || null,
        supplier_name,
        address, pin_code, district, state, country || 'India',
        gst_no,
        msme || 'No',
        msme_reg_no || null,
        email, contact_name, designation, contact_no, contact_email,
        status || 'Active',
      ],
    );
    const dbId = result.insertId;

    // Attachments
    if (req.files && req.files.length) {
      for (const f of req.files) {
        await conn.query(
          'INSERT INTO supplier_attachments (supplier_id, file_name, file_path, file_size, mime_type) VALUES (?,?,?,?,?)',
          [dbId, f.originalname, f.filename, f.size, f.mimetype],
        );
      }
    }

    await conn.commit();
    const created = await fetchSupplier(dbId);
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to create supplier' });
  } finally {
    conn.release();
  }
});

// PUT /api/suppliers/:id  — update
router.put('/:id', upload.array('attachments', 10), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    const {
      type_id, supplier_name, address, pin_code, district, state, country,
      gst_no, msme, msme_reg_no, email,
      contact_name, designation, contact_no, contact_email, status,
      deleted_attachments,
    } = req.body;

    await conn.query(
      `UPDATE suppliers SET
        type_id=?, supplier_name=?,
        address=?, pin_code=?, district=?, state=?, country=?,
        gst_no=?, msme=?, msme_reg_no=?,
        email=?, contact_name=?, designation=?, contact_no=?, contact_email=?,
        status=?
       WHERE id=?`,
      [
        type_id || null,
        supplier_name,
        address, pin_code, district, state, country || 'India',
        gst_no,
        msme || 'No',
        msme_reg_no || null,
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
          'SELECT file_path FROM supplier_attachments WHERE id IN (?)', [ids],
        );
        for (const f of files) {
          const fp = path.join(uploadDir, f.file_path);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
        await conn.query('DELETE FROM supplier_attachments WHERE id IN (?)', [ids]);
      }
    }

    // New attachments
    if (req.files && req.files.length) {
      for (const f of req.files) {
        await conn.query(
          'INSERT INTO supplier_attachments (supplier_id, file_name, file_path, file_size, mime_type) VALUES (?,?,?,?,?)',
          [id, f.originalname, f.filename, f.size, f.mimetype],
        );
      }
    }

    await conn.commit();
    const updated = await fetchSupplier(id);
    res.json(updated);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to update supplier' });
  } finally {
    conn.release();
  }
});

// DELETE /api/suppliers/:id
router.delete('/:id', async (req, res) => {
  try {
    const [files] = await db.query(
      'SELECT file_path FROM supplier_attachments WHERE supplier_id = ?', [req.params.id],
    );
    for (const f of files) {
      const fp = path.join(uploadDir, f.file_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await db.query('DELETE FROM suppliers WHERE id = ?', [req.params.id]);
    res.json({ message: 'Supplier deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete supplier' });
  }
});

// GET /api/suppliers/attachment/:filename  — serve file
router.get('/attachment/:filename', (req, res) => {
  const fp = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ message: 'File not found' });
  res.sendFile(fp);
});

module.exports = router;