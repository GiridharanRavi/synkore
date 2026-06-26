const express    = require('express');
const router     = express.Router();
const db         = require('../db/connection');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const { sendWelcomeEmail } = require('../utils/emailService');

// ── Multer config ─────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/customer-docs');
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
    const allowed = /pdf|jpg|jpeg|png|doc|docx|xlsx/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  },
});

// ── Safe value helpers ────────────────────────────────────────
const str  = (v) => (v === undefined || v === null || v === 'undefined' || v === 'null') ? null : String(v).trim() || null;
const num  = (v) => {
  if (v === undefined || v === null || v === '' || v === 'undefined' || v === 'null') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};
const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true') ? 1 : 0;

const joinAddr = (line1, line2) => {
  const a = str(line1) ?? '';
  const b = str(line2) ?? '';
  const combined = [a, b].filter(Boolean).join('\n');
  return combined || null;
};

// ── Resolve admin name from request ──────────────────────────
function resolveAdminName(req) {
  if (req.user?.name)        return req.user.name;
  if (req.user?.username)    return req.user.username;
  if (req.user?.email)       return req.user.email;
  if (req.body?.created_by)  return String(req.body.created_by).trim();
  return 'Administrator';
}

// ── Introspect table columns once (cached) ────────────────────
// This lets the route work even if optional columns don't exist yet
let _customerCols = null;
async function getCustomerColumns(conn) {
  if (_customerCols) return _customerCols;
  const [rows] = await conn.query('SHOW COLUMNS FROM customers');
  _customerCols = new Set(rows.map((r) => r.Field));
  return _customerCols;
}

// ── Generate next CUS-YYYY-NNN ID ─────────────────────────────
async function generateCustomerId(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(customer_id, '-', -1) AS UNSIGNED)) AS max_seq
     FROM customers WHERE customer_id LIKE ?`,
    [`CUS-${year}-%`],
  );
  const nextSeq = (row.max_seq ?? 0) + 1;
  return `CUS-${year}-${String(nextSeq).padStart(3, '0')}`;
}

// ── Generate next rec_no ──────────────────────────────────────
async function generateRecNo(conn) {
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(rec_no AS UNSIGNED)) AS max_rec FROM customers WHERE rec_no REGEXP '^[0-9]+$'`
  );
  const next = (row.max_rec ?? 0) + 1;
  return String(next).padStart(6, '0');
}

// ── Helper: build full customer object ────────────────────────
async function fetchCustomer(id) {
  const [[row]] = await db.query('SELECT * FROM customers WHERE id = ?', [id]);
  if (!row) return null;

  // Map old address columns → billing_* fields the frontend expects
  const billingLines = (row.address || '').split('\n');
  row.billing_address1 = row.billing_address1 || (row.address || '').split('\n')[0] || '';
row.billing_address2 = row.billing_address2 || (row.address || '').split('\n').slice(1).join('\n') || '';
row.billing_pin_code = row.billing_pin_code || row.pin_code || '';
row.billing_district = row.billing_district || row.district || '';
row.billing_state    = row.billing_state    || row.state    || '';
row.billing_country  = row.billing_country  || row.country  || 'India';

  const shippingLines = (row.shipping_address || '').split('\n');
  row.shipping_address1 = shippingLines[0] || '';
  row.shipping_address2 = shippingLines.slice(1).join('\n') || '';

  const [gstRows]     = await db.query('SELECT * FROM customer_gst_numbers        WHERE customer_id = ?', [id]);
  const [addrRows]    = await db.query('SELECT * FROM customer_delivery_addresses WHERE customer_id = ?', [id]);
  const [attachRows]  = await db.query('SELECT * FROM customer_attachments        WHERE customer_id = ?', [id]);
  const [paymentRows] = await db.query('SELECT * FROM customer_payment_accounts   WHERE customer_id = ?', [id]);

  return {
    ...row,
    gst_numbers:        gstRows,
    delivery_addresses: addrRows,
    attachments:        attachRows,
    payment_accounts:   paymentRows,
  };
}

// ─────────────────────────────────────────────────────────────
// ── ROUTES ───────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────

// ── GET /api/customers ────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', category = '', status = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (c.customer_name LIKE ? OR c.contact_no LIKE ? OR c.email LIKE ? OR c.customer_id LIKE ? OR c.email_username LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category) { where += ' AND c.category = ?'; params.push(category); }
    if (status)   { where += ' AND c.status = ?';   params.push(status);   }

    const [rows] = await db.query(
      `SELECT c.*, cg.group_name, r.region_name
       FROM customers c
       LEFT JOIN customer_group_master cg ON c.customer_group_id = cg.id
       LEFT JOIN regions r                ON c.region_id = r.id
       ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );

    const data = rows.map((row) => {
      const bl = (row.address || '').split('\n');
      row.billing_address1 = bl[0] || '';
      row.billing_address2 = bl.slice(1).join('\n') || '';
      row.billing_pin_code = row.pin_code || '';
      row.billing_district = row.district || '';
      row.billing_state    = row.state    || '';
      row.billing_country  = row.country  || 'India';
      const sl = (row.shipping_address || '').split('\n');
      row.shipping_address1 = sl[0] || '';
      row.shipping_address2 = sl.slice(1).join('\n') || '';
      return row;
    });

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM customers c ${where}`, params,
    );
    res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /customers]', err);
    res.status(500).json({ message: 'Failed to fetch customers' });
  }
});

// ── GET /api/customers/meta/lookup ────────────────────────────
router.get('/meta/lookup', async (_req, res) => {
  try {
    const [groups]  = await db.query(
      'SELECT id, group_name FROM customer_group_master WHERE status = "Active" ORDER BY group_name',
    );
    const [regions] = await db.query('SELECT id, region_name FROM regions ORDER BY region_name');
    let bankAccounts = [];
    try {
      [bankAccounts] = await db.query(
        'SELECT id, account_name, bank_name, account_no FROM vptex_bank_accounts WHERE status="Active"',
      );
    } catch (_) { /* table may not exist */ }
    res.json({ groups, regions, bankAccounts });
  } catch (err) {
    console.error('[GET /customers/meta/lookup]', err);
    res.status(500).json({ message: 'Failed to load lookup data' });
  }
});

// ── GET /api/customers/attachment/:filename ───────────────────
router.get('/attachment/:filename', (req, res) => {
  const fp = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ message: 'File not found' });
  res.sendFile(fp);
});

// ── GET /api/customers/:id ────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const customer = await fetchCustomer(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    console.error('[GET /customers/:id]', err);
    res.status(500).json({ message: 'Error fetching customer' });
  }
});

// ── POST /api/customers ───────────────────────────────────────
router.post('/', upload.array('attachments', 10), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const cols         = await getCustomerColumns(conn);
    const customerCode = await generateCustomerId(conn);
    const adminName    = resolveAdminName(req);

    const {
      category, customer_name, customer_group_id,
      billing_address1, billing_address2,
      billing_pin_code, billing_district, billing_state, billing_country,
      shipping_address1, shipping_address2,
      shipping_pin_code, shipping_district, shipping_state, shipping_country,
      is_same_as_billing,
      email, contact_name, designation, contact_no,
      email_password,
      agent, region_id, company_type,
      gst_no, pan_no, tan_no,
      status,
      gst_numbers, delivery_addresses, payment_accounts,
    } = req.body;

    if (!customer_name || !String(customer_name).trim()) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ message: 'customer_name is required' });
    }

    const isSameBilling         = bool(is_same_as_billing) === 1;
    const finalShippingAddr1    = isSameBilling ? billing_address1    : shipping_address1;
    const finalShippingAddr2    = isSameBilling ? billing_address2    : shipping_address2;
    const finalShippingPin      = isSameBilling ? billing_pin_code    : shipping_pin_code;
    const finalShippingDistrict = isSameBilling ? billing_district    : shipping_district;
    const finalShippingState    = isSameBilling ? billing_state       : shipping_state;
    const finalShippingCountry  = isSameBilling ? billing_country     : shipping_country;

    // ── Build INSERT dynamically based on actual columns ──────
    const fields = [];
    const values = [];

    const push = (col, val) => { fields.push(col); values.push(val); };

    push('customer_id',    customerCode);
    push('category',       str(category)      ?? 'Domestic');
    push('customer_name',  str(customer_name));

    // rec_no — only if column exists
    if (cols.has('rec_no')) {
      const recNo = await generateRecNo(conn);
      push('rec_no', recNo);
    }

    if (cols.has('customer_group_id')) push('customer_group_id', num(customer_group_id));

    // Billing → stored in old address/pin_code/district/state/country columns
   if (cols.has('billing_address1')) push('billing_address1', str(billing_address1));
if (cols.has('billing_address2')) push('billing_address2', str(billing_address2));
if (cols.has('billing_pin_code')) push('billing_pin_code', str(billing_pin_code));
if (cols.has('billing_district')) push('billing_district', str(billing_district));
if (cols.has('billing_state'))    push('billing_state',    str(billing_state)   ?? 'Tamil Nadu');
if (cols.has('billing_country'))  push('billing_country',  str(billing_country) ?? 'India');

    // Shipping
    push('shipping_address',  joinAddr(finalShippingAddr1, finalShippingAddr2));
    push('shipping_pin_code', str(finalShippingPin));
    push('shipping_district', str(finalShippingDistrict));
    push('shipping_state',    str(finalShippingState)   ?? 'Tamil Nadu');
    push('shipping_country',  str(finalShippingCountry) ?? 'India');

    push('is_same_as_billing', bool(is_same_as_billing));

    // Only write is_same_as_shipping if the column actually exists
    if (cols.has('is_same_as_shipping')) push('is_same_as_shipping', 0);

    push('email',          str(email));
    push('email_username', str(email));   // username = email
    push('email_password', str(email_password));

    // Optional email server columns — only if they exist
    if (cols.has('email_host')) push('email_host', null);
    if (cols.has('email_port')) push('email_port', null);
    if (cols.has('email_ssl'))  push('email_ssl',  0);

    push('contact_name', str(contact_name));
    push('designation',  str(designation));
    push('contact_no',   str(contact_no));
    push('agent',        str(agent));

    if (cols.has('region_id'))    push('region_id',    num(region_id));
    if (cols.has('company_type')) push('company_type', str(company_type) ?? 'Individual');

    push('gst_no',  str(gst_no));
    push('pan_no',  str(pan_no));
    push('tan_no',  str(tan_no));
    push('status',  str(status) ?? 'Active');

    const sql = `INSERT INTO customers (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`;
    const [result] = await conn.query(sql, values);
    const dbId = result.insertId;

    // ── Sub-tables ────────────────────────────────────────────
    if (gst_numbers) {
      let arr; try { arr = JSON.parse(gst_numbers); } catch { arr = []; }
      for (const g of arr) {
        if (!g.gst_no) continue;
        await conn.query(
          'INSERT INTO customer_gst_numbers (customer_id,gst_no,state,is_primary) VALUES (?,?,?,?)',
          [dbId, str(g.gst_no), str(g.state), bool(g.is_primary)],
        );
      }
    }
    if (delivery_addresses) {
      let arr; try { arr = JSON.parse(delivery_addresses); } catch { arr = []; }
      for (const a of arr) {
        await conn.query(
          `INSERT INTO customer_delivery_addresses
            (customer_id,label,address,pin_code,district,state,country,contact_name,contact_no,is_default)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [dbId, str(a.label), joinAddr(a.address1, a.address2), str(a.pin_code),
           str(a.district), str(a.state), str(a.country) ?? 'India',
           str(a.contact_name), str(a.contact_no), bool(a.is_default)],
        );
      }
    }
    if (req.files?.length) {
      for (const f of req.files) {
        await conn.query(
          'INSERT INTO customer_attachments (customer_id,file_name,file_path,file_size,mime_type) VALUES (?,?,?,?,?)',
          [dbId, f.originalname, f.filename, f.size, f.mimetype],
        );
      }
    }
    if (payment_accounts) {
      let arr; try { arr = JSON.parse(payment_accounts); } catch { arr = []; }
      for (const p of arr) {
        if (!p.bank_account_id) continue;
        await conn.query(
          'INSERT INTO customer_payment_accounts (customer_id,bank_account_id,is_primary) VALUES (?,?,?)',
          [dbId, num(p.bank_account_id), bool(p.is_primary)],
        );
      }
    }

    await conn.commit();
    const created = await fetchCustomer(dbId);

    // ── Send welcome email AFTER commit (non-blocking) ────────
    const emailResult = await sendWelcomeEmail({
      toEmail:       str(email),
      customerName:  str(customer_name),
      customerId:    customerCode,
      adminName,
      loginPassword: str(email_password) || '(not set)',
    });

    res.status(201).json({ ...created, emailNotification: emailResult });

  } catch (err) {
    await conn.rollback();
    console.error('[POST /customers] ERROR:', err.message, err.sql ?? '');
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({
      message: 'Failed to create customer',
      ...(isDev && { detail: err.message, sql: err.sql }),
    });
  } finally {
    conn.release();
  }
});

// ── PUT /api/customers/:id ────────────────────────────────────
router.put('/:id', upload.array('attachments', 10), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const cols    = await getCustomerColumns(conn);
    const { id }  = req.params;

    const {
      category, customer_name, customer_group_id,
      billing_address1, billing_address2,
      billing_pin_code, billing_district, billing_state, billing_country,
      shipping_address1, shipping_address2,
      shipping_pin_code, shipping_district, shipping_state, shipping_country,
      is_same_as_billing,
      email, contact_name, designation, contact_no,
      email_password,
      agent, region_id, company_type,
      gst_no, pan_no, tan_no,
      status,
      gst_numbers, delivery_addresses, payment_accounts, deleted_attachments,
    } = req.body;

    const isSameBilling         = bool(is_same_as_billing) === 1;
    const finalShippingAddr1    = isSameBilling ? billing_address1    : shipping_address1;
    const finalShippingAddr2    = isSameBilling ? billing_address2    : shipping_address2;
    const finalShippingPin      = isSameBilling ? billing_pin_code    : shipping_pin_code;
    const finalShippingDistrict = isSameBilling ? billing_district    : shipping_district;
    const finalShippingState    = isSameBilling ? billing_state       : shipping_state;
    const finalShippingCountry  = isSameBilling ? billing_country     : shipping_country;

    // ── Build UPDATE dynamically based on actual columns ──────
    const setClauses = [];
    const values     = [];

    const set = (col, val) => { setClauses.push(`${col}=?`); values.push(val); };

    set('category',      str(category)      ?? 'Domestic');
    set('customer_name', str(customer_name));

    if (cols.has('customer_group_id')) set('customer_group_id', num(customer_group_id));

    // Billing → old columns
    set('address',    joinAddr(billing_address1, billing_address2));
    set('pin_code',   str(billing_pin_code));
    set('district',   str(billing_district));
    set('state',      str(billing_state)   ?? 'Tamil Nadu');
    set('country',    str(billing_country) ?? 'India');

    // Shipping
    set('shipping_address',  joinAddr(finalShippingAddr1, finalShippingAddr2));
    set('shipping_pin_code', str(finalShippingPin));
    set('shipping_district', str(finalShippingDistrict));
    set('shipping_state',    str(finalShippingState)   ?? 'Tamil Nadu');
    set('shipping_country',  str(finalShippingCountry) ?? 'India');

    set('is_same_as_billing', bool(is_same_as_billing));
    if (cols.has('is_same_as_shipping')) set('is_same_as_shipping', 0);

    set('email',          str(email));
    set('email_username', str(email));
    set('email_password', str(email_password));

    set('contact_name', str(contact_name));
    set('designation',  str(designation));
    set('contact_no',   str(contact_no));
    set('agent',        str(agent));

    if (cols.has('region_id'))    set('region_id',    num(region_id));
    if (cols.has('company_type')) set('company_type', str(company_type) ?? 'Individual');

    set('gst_no',  str(gst_no));
    set('pan_no',  str(pan_no));
    set('tan_no',  str(tan_no));
    set('status',  str(status) ?? 'Active');

    values.push(id); // for WHERE id=?
    await conn.query(
      `UPDATE customers SET ${setClauses.join(', ')} WHERE id=?`,
      values,
    );

    // ── Sub-tables ────────────────────────────────────────────
    if (gst_numbers !== undefined) {
      await conn.query('DELETE FROM customer_gst_numbers WHERE customer_id=?', [id]);
      let arr; try { arr = JSON.parse(gst_numbers); } catch { arr = []; }
      for (const g of arr) {
        if (!g.gst_no) continue;
        await conn.query(
          'INSERT INTO customer_gst_numbers (customer_id,gst_no,state,is_primary) VALUES (?,?,?,?)',
          [id, str(g.gst_no), str(g.state), bool(g.is_primary)],
        );
      }
    }
    if (delivery_addresses !== undefined) {
      await conn.query('DELETE FROM customer_delivery_addresses WHERE customer_id=?', [id]);
      let arr; try { arr = JSON.parse(delivery_addresses); } catch { arr = []; }
      for (const a of arr) {
        await conn.query(
          `INSERT INTO customer_delivery_addresses
            (customer_id,label,address,pin_code,district,state,country,contact_name,contact_no,is_default)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [id, str(a.label), joinAddr(a.address1, a.address2), str(a.pin_code),
           str(a.district), str(a.state), str(a.country) ?? 'India',
           str(a.contact_name), str(a.contact_no), bool(a.is_default)],
        );
      }
    }
    if (deleted_attachments) {
      let ids; try { ids = JSON.parse(deleted_attachments); } catch { ids = []; }
      if (ids.length) {
        const [files] = await conn.query(
          'SELECT file_path FROM customer_attachments WHERE id IN (?)', [ids],
        );
        for (const f of files) {
          const fp = path.join(uploadDir, f.file_path);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
        await conn.query('DELETE FROM customer_attachments WHERE id IN (?)', [ids]);
      }
    }
    if (req.files?.length) {
      for (const f of req.files) {
        await conn.query(
          'INSERT INTO customer_attachments (customer_id,file_name,file_path,file_size,mime_type) VALUES (?,?,?,?,?)',
          [id, f.originalname, f.filename, f.size, f.mimetype],
        );
      }
    }
    if (payment_accounts !== undefined) {
      await conn.query('DELETE FROM customer_payment_accounts WHERE customer_id=?', [id]);
      let arr; try { arr = JSON.parse(payment_accounts); } catch { arr = []; }
      for (const p of arr) {
        if (!p.bank_account_id) continue;
        await conn.query(
          'INSERT INTO customer_payment_accounts (customer_id,bank_account_id,is_primary) VALUES (?,?,?)',
          [id, num(p.bank_account_id), bool(p.is_primary)],
        );
      }
    }

    await conn.commit();
    const updated = await fetchCustomer(id);
    res.json({ ...updated, emailNotification: { sent: false, reason: 'Update — no email sent' } });

  } catch (err) {
    await conn.rollback();
    console.error('[PUT /customers/:id] ERROR:', err.message, err.sql ?? '');
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({
      message: 'Failed to update customer',
      ...(isDev && { detail: err.message, sql: err.sql }),
    });
  } finally {
    conn.release();
  }
});

// ── DELETE /api/customers/:id ─────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [files] = await db.query(
      'SELECT file_path FROM customer_attachments WHERE customer_id=?', [req.params.id],
    );
    for (const f of files) {
      const fp = path.join(uploadDir, f.file_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await db.query('DELETE FROM customers WHERE id=?', [req.params.id]);
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    console.error('[DELETE /customers/:id]', err);
    res.status(500).json({ message: 'Failed to delete customer' });
  }
});

module.exports = router;