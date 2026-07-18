// backend/routes/companyDetailsRoutes.js
// Full CRUD + logo upload for Company Details Master
// Same pattern as vendorMasterRoutes.js
//
// ─────────────────────────────────────────────────────────────────────────
// CHANGED (THIS REVISION):
//
//   Added GET /search — the ONLY thing this file was missing. FabricInvoice
//   .tsx's "Company (Print Header)" search box calls
//   fabricServices.searchCompanies(q) -> GET /api/company-details/search?q=...
//   to filter-as-you-type. This route didn't exist before (only
//   /meta/lookup existed, which returns the full unfiltered active list),
//   so that search box would 404/fail silently.
//
//   GET /:id (exact-id lookup, used by fetchCompanyInfoById() for invoices
//   with an explicit/inherited company_id) and GET /by-firm/:firm (used by
//   the firm-based fallback) were ALREADY present and correct in this file
//   — no changes needed there. If invoices are still printing the wrong
//   company after adding /search below, the remaining suspect is
//   services.ts not exporting getCompanyById/searchCompanies/getCompanyByFirm
//   at all (check your browser console for the "is missing from services.ts"
//   warnings baked into FabricInvoice.tsx).
//
//   Route order below is preserved as-is: /search is declared alongside
//   /meta/lookup and /by-firm/:firm, all BEFORE /:id — same reasoning as
//   the existing comment on /meta/lookup: any of these would otherwise be
//   swallowed by /:id matching first.
// ─────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');   // mysql2/promise pool
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ── Multer config (logo upload) ───────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/company-logos');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /jpg|jpeg|png|svg|webp/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  },
});

// ── Generate next COM-YYYY-NNN ID ─────────────────────────────
async function generateCompanyCode(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(company_code, '-', -1) AS UNSIGNED)) AS max_seq
     FROM company_details
     WHERE company_code LIKE ?`,
    [`COM-${year}-%`],
  );
  const nextSeq = (row.max_seq ?? 0) + 1;
  return `COM-${year}-${String(nextSeq).padStart(3, '0')}`;
}

// ── Safe value helpers ─────────────────────────────────────────
const str = (v) => (v === undefined || v === null || v === 'undefined' || v === 'null') ? null : String(v).trim() || null;

// ─────────────────────────────────────────────────────────────
// GET /api/company-details  — list with search & pagination
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', firm = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ` AND (
        company_name LIKE ? OR contact_no LIKE ? OR email LIKE ?
        OR company_code LIKE ? OR gst_no LIKE ?
      )`;
      const like = `%${search}%`;
      params.push(like, like, like, like, like);
    }
    if (status) { where += ' AND status = ?'; params.push(status); }
    if (firm)   { where += ' AND firm = ?';   params.push(firm);   }

    const [rows] = await db.query(
      `SELECT * FROM company_details ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM company_details ${where}`, params,
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /company-details]', err);
    res.status(500).json({ message: 'Failed to fetch company details' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/company-details/meta/lookup  — light list for dropdowns
// (e.g. the Firm-based COMPANY_INFO lookup used by FabricInvoice.tsx /
// FabricPackingList.tsx). MUST be declared before /:id.
// ─────────────────────────────────────────────────────────────
router.get('/meta/lookup', async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, company_code, firm, company_name, gst_no
       FROM company_details WHERE status = 'Active' ORDER BY company_name`,
    );
    res.json({ companies: rows });
  } catch (err) {
    console.error('[GET /company-details/meta/lookup]', err);
    res.status(500).json({ message: 'Failed to load lookup data' });
  }
});

// *** NEW ***
// ─────────────────────────────────────────────────────────────
// GET /api/company-details/search?q=...  — filtered search for the
// "Company (Print Header)" search-as-you-type box in FabricInvoice.tsx
// (fabricServices.searchCompanies). Returns a small, purpose-shaped
// result — id/company_name/firm/gst_no — matching what that dropdown
// renders (see companyOptions.map(row => ...) in FabricInvoice.tsx).
// Declared here (before /:id) for the same route-ordering reason as
// /meta/lookup and /by-firm/:firm above — otherwise Express would treat
// "search" as an :id value and this route would never be reached.
// Never throws for an empty/no-match query — always 200s with an array
// (possibly empty), matching the defensive pattern the rest of this
// codebase uses for lookup endpoints.
// ─────────────────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  try {
    const q = `%${String(req.query.q || '').trim()}%`;
    const [rows] = await db.query(
      `SELECT id, company_name, firm, gst_no, logo_path
       FROM company_details
       WHERE company_name LIKE ? OR firm LIKE ? OR company_code LIKE ?
       ORDER BY company_name ASC
       LIMIT 20`,
      [q, q, q],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /company-details/search]', err);
    res.status(500).json({ message: 'Company search failed', sqlMessage: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/company-details/by-firm/:firm  — used by print headers to
// pull the right company block for AE / AEF without needing an id.
// ─────────────────────────────────────────────────────────────
router.get('/by-firm/:firm', async (req, res) => {
  try {
    const [[row]] = await db.query(
      `SELECT * FROM company_details WHERE firm = ? AND status = 'Active' LIMIT 1`,
      [req.params.firm],
    );
    if (!row) return res.status(404).json({ message: `No active company profile found for firm "${req.params.firm}"` });
    res.json(row);
  } catch (err) {
    console.error('[GET /company-details/by-firm/:firm]', err);
    res.status(500).json({ message: 'Failed to fetch company by firm' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/company-details/logo/:filename  — serve logo file
// ─────────────────────────────────────────────────────────────
router.get('/logo/:filename', (req, res) => {
  const fp = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ message: 'File not found' });
  res.sendFile(fp);
});

// ─────────────────────────────────────────────────────────────
// GET /api/company-details/:id  — single record
// (Already existed in this file — used by fetchCompanyInfoById() in
// FabricInvoice.tsx via getCompanyById(). This is the exact-id lookup
// that resolves each invoice's inherited/explicit company_id.)
// ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM company_details WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ message: 'Company not found' });
    res.json(row);
  } catch (err) {
    console.error('[GET /company-details/:id]', err);
    res.status(500).json({ message: 'Error fetching company' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/company-details  — create
// ─────────────────────────────────────────────────────────────
router.post('/', upload.single('logo'), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const companyCode = await generateCompanyCode(conn);
    const b = req.body;

    if (!b.company_name || !String(b.company_name).trim()) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ message: 'company_name is required' });
    }

    const logoPath = req.file ? req.file.filename : (str(b.existing_logo_path) || null);

    // *** FIX ***
    // The VALUES clause previously had 25 "?" placeholders for only 24
    // columns/params (an extra "?" had crept into the address/works_address
    // group), which MySQL rejects with "Column count doesn't match value
    // count at row 1" — that's what was producing the 500 here. Column list,
    // placeholder count, and the params array below are now all verified to
    // be exactly 24, one-to-one, in the same order.
    const [result] = await conn.query(
      `INSERT INTO company_details
        (company_code, firm, company_name, logo_path,
         address, works_address,
         pin_code, district, state, country,
         gst_no, pan_no, cin_no, policy_no,
         email, website, contact_name, contact_no,
         bank_name, branch_name, ac_no, ifsc_code,
         certifications, status)
       VALUES (?, ?, ?, ?,
               ?, ?,
               ?, ?, ?, ?,
               ?, ?, ?, ?,
               ?, ?, ?, ?,
               ?, ?, ?, ?,
               ?, ?)`,
      [
        companyCode, str(b.firm), str(b.company_name), logoPath,
        str(b.address), str(b.works_address),
        str(b.pin_code), str(b.district), str(b.state) || 'Tamil Nadu', str(b.country) || 'India',
        str(b.gst_no), str(b.pan_no), str(b.cin_no), str(b.policy_no),
        str(b.email), str(b.website), str(b.contact_name), str(b.contact_no),
        str(b.bank_name), str(b.branch_name), str(b.ac_no), str(b.ifsc_code),
        str(b.certifications), str(b.status) || 'Active',
      ],
    );

    await conn.commit();
    const [[created]] = await db.query('SELECT * FROM company_details WHERE id = ?', [result.insertId]);
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    console.error('[POST /company-details]', err);
    res.status(500).json({ message: err.sqlMessage || err.message || 'Failed to create company' });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/company-details/:id  — update
// ─────────────────────────────────────────────────────────────
router.put('/:id', upload.single('logo'), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const b = req.body;

    const [[existing]] = await conn.query('SELECT logo_path FROM company_details WHERE id = ?', [id]);
    if (!existing) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ message: 'Company not found' });
    }

    let logoPath = existing.logo_path;
    if (req.file) {
      // Replace: remove old file if present
      if (existing.logo_path) {
        const oldFp = path.join(uploadDir, existing.logo_path);
        if (fs.existsSync(oldFp)) fs.unlinkSync(oldFp);
      }
      logoPath = req.file.filename;
    } else if (b.remove_logo === '1' || b.remove_logo === 'true') {
      if (existing.logo_path) {
        const oldFp = path.join(uploadDir, existing.logo_path);
        if (fs.existsSync(oldFp)) fs.unlinkSync(oldFp);
      }
      logoPath = null;
    }

    await conn.query(
      `UPDATE company_details SET
        firm=?, company_name=?, logo_path=?,
        address=?, works_address=?,
        pin_code=?, district=?, state=?, country=?,
        gst_no=?, pan_no=?, cin_no=?, policy_no=?,
        email=?, website=?, contact_name=?, contact_no=?,
        bank_name=?, branch_name=?, ac_no=?, ifsc_code=?,
        certifications=?, status=?
       WHERE id=?`,
      [
        str(b.firm), str(b.company_name), logoPath,
        str(b.address), str(b.works_address),
        str(b.pin_code), str(b.district), str(b.state) || 'Tamil Nadu', str(b.country) || 'India',
        str(b.gst_no), str(b.pan_no), str(b.cin_no), str(b.policy_no),
        str(b.email), str(b.website), str(b.contact_name), str(b.contact_no),
        str(b.bank_name), str(b.branch_name), str(b.ac_no), str(b.ifsc_code),
        str(b.certifications), str(b.status) || 'Active',
        id,
      ],
    );

    await conn.commit();
    const [[updated]] = await db.query('SELECT * FROM company_details WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    await conn.rollback();
    console.error('[PUT /company-details/:id]', err);
    res.status(500).json({ message: err.sqlMessage || err.message || 'Failed to update company' });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/company-details/:id
// ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT logo_path FROM company_details WHERE id = ?', [req.params.id]);
    if (row?.logo_path) {
      const fp = path.join(uploadDir, row.logo_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await db.query('DELETE FROM company_details WHERE id = ?', [req.params.id]);
    res.json({ message: 'Company deleted' });
  } catch (err) {
    console.error('[DELETE /company-details/:id]', err);
    res.status(500).json({ message: 'Failed to delete company' });
  }
});

module.exports = router;