// backend/routes/productionPlanningRoutes.js

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

async function generatePlanCode(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(rec_no, '-', -1) AS UNSIGNED)) AS max_seq
     FROM production_plans WHERE rec_no LIKE ?`,
    [`PLN-${year}-%`],
  );
  const seq = (row.max_seq ?? 0) + 1;
  return `PLN-${year}-${String(seq).padStart(3, '0')}`;   // ← was padStart(4, '0')
}

function safeParseArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t || t === 'null' || t === '[]') return [];
    try { return JSON.parse(t); } catch { return []; }
  }
  return [];
}

// ── Strip time component — MySQL DATE columns reject ISO datetime strings ──
function toDateOnly(val) {
  if (!val) return null;
  return String(val).slice(0, 10);
}

async function fetchPlan(id) {
  const [[row]] = await db.query('SELECT * FROM production_plans WHERE id = ?', [id]);
  if (!row) return null;
  const [orderLinks] = await db.query(
    'SELECT * FROM plan_order_links WHERE plan_id = ? ORDER BY id ASC', [id],
  );
  return { ...row, order_links: orderLinks };
}

// ── Column cache — checked once per server start ──────────────────────────────
let _cols = null;
async function getColumns() {
  if (_cols) return _cols;
  const [rows] = await db.query('SHOW COLUMNS FROM production_plans');
  _cols = new Set(rows.map(r => r.Field));
  return _cols;
}

// ── order_bookings column cache ───────────────────────────────────────────────
let _obCols = null;
async function getObColumns() {
  if (_obCols) return _obCols;
  try {
    const [rows] = await db.query('SHOW COLUMNS FROM order_bookings');
    _obCols = new Set(rows.map(r => r.Field));
  } catch {
    _obCols = new Set();
  }
  return _obCols;
}

// ── AUTO-DISCOVERY: find the real vendor / supplier tables ───────────────────
// Instead of assuming fixed table names ("vendor_master", "supplier_master"),
// scan the database once per server start and pick the best-matching table
// by name and columns. This means it keeps working no matter what your DB
// actually calls these tables (vendors, tbl_vendor, mst_vendor, etc.)

let _allTableNames = null;
async function getAllTableNames() {
  if (_allTableNames) return _allTableNames;
  const [rows] = await db.query('SHOW TABLES');
  const key = Object.keys(rows[0] || {})[0];
  _allTableNames = rows.map(r => r[key]);
  return _allTableNames;
}

// Rank candidate table names for a given keyword ("vendor" / "supplier").
// Prefers: exact "<keyword>_master" > contains "master" > contains keyword.
function rankTableCandidates(tableNames, keyword) {
  const kw = keyword.toLowerCase();
  return tableNames
    .filter(t => t.toLowerCase().includes(kw))
    .sort((a, b) => {
      const score = (t) => {
        const tl = t.toLowerCase();
        if (tl === `${kw}_master`) return 0;
        if (tl.includes('master'))  return 1;
        if (tl.startsWith(kw))      return 2;
        return 3;
      };
      return score(a) - score(b);
    });
}

// Pick the first column name that exists in the given Set, else null
function pickCol(cols, candidates) {
  for (const c of candidates) if (cols.has(c)) return c;
  return null;
}

// Generic resolver: finds a table matching `keyword`, reads its columns,
// and returns { table, cols } or { table: null, cols: new Set() } if none found.
async function resolveMasterTable(keyword) {
  const tableNames = await getAllTableNames();
  const candidates  = rankTableCandidates(tableNames, keyword);

  for (const table of candidates) {
    try {
      const [rows] = await db.query(`SHOW COLUMNS FROM \`${table}\``);
      const cols = new Set(rows.map(r => r.Field));
      // Must have some kind of name-like column to be usable as a dropdown source
      const hasNameCol = pickCol(cols, [
        `${keyword}_name`, 'name', 'company_name', 'full_name', 'title',
      ]);
      if (hasNameCol) {
        console.log(`[${keyword} master] resolved to table "${table}". Columns:`, [...cols]);
        return { table, cols };
      }
    } catch { /* try next candidate */ }
  }

  console.warn(`[${keyword} master] could NOT auto-resolve a table.`);
  console.warn(`[${keyword} master] tables containing "${keyword}":`, candidates);
  console.warn(`[${keyword} master] all tables in DB:`, tableNames);
  return { table: null, cols: new Set() };
}

let _vendorResolved   = null;
async function getVendorTable() {
  if (_vendorResolved) return _vendorResolved;
  _vendorResolved = await resolveMasterTable('vendor');
  return _vendorResolved;
}

let _supplierResolved = null;
async function getSupplierTable() {
  if (_supplierResolved) return _supplierResolved;
  _supplierResolved = await resolveMasterTable('supplier');
  return _supplierResolved;
}

// ── NEW: Build a formatted "Delivery Address" text block from order_bookings ─
// Delivery Address is sourced from the SAME order the user selects in
// "Order No" — no separate customer lookup is used. This tries a wide range
// of common column-name variants so it keeps working regardless of exactly
// how your order_bookings table stores address data. Returns null if none of
// the candidate columns exist / have data, so the UI can show a clean
// "not available" state instead of an empty box.
const DELIVERY_ADDRESS_CANDIDATES = {
  company:  ['delivery_company_name', 'delivery_name', 'company_name', 'customer_company_name', 'customer_name'],
  line1:    ['delivery_address_line1', 'delivery_address', 'delivery_addr', 'ship_address', 'address_line1', 'address'],
  line2:    ['delivery_address_line2', 'address_line2', 'area', 'locality'],
  city:     ['delivery_city', 'city'],
  state:    ['delivery_state', 'state'],
  country:  ['delivery_country', 'country'],
  pincode:  ['delivery_pincode', 'delivery_pin', 'pincode', 'pin', 'zip', 'zipcode'],
  gst:      ['delivery_gst', 'delivery_gstin', 'gstin', 'gst_no', 'gst'],
};

// Column already selected/aliased elsewhere in the /order/:orderNo query —
// don't re-select it, just read it off the already-fetched row.
const DELIVERY_ADDRESS_ALREADY_SELECTED = new Set(['customer_name']);

function pickAddressCol(obCols, candidates) {
  for (const c of candidates) if (obCols.has(c)) return c;
  return null;
}

// Adds any not-yet-selected delivery-address candidate columns onto the
// SELECT list for the /order/:orderNo query (raw column name = result key).
function addDeliveryAddressSelectCols(selectCols, obCols) {
  const allCandidates = Object.values(DELIVERY_ADDRESS_CANDIDATES).flat();
  const seen = new Set();
  for (const c of allCandidates) {
    if (seen.has(c) || DELIVERY_ADDRESS_ALREADY_SELECTED.has(c)) continue;
    seen.add(c);
    if (obCols.has(c)) selectCols.push(`ob.\`${c}\``);
  }
}

// Builds the multi-line formatted address block from the fetched row.
function buildDeliveryAddressBlock(row, obCols) {
  const pick = (candidates) => {
    for (const c of candidates) {
      if (row[c] != null && String(row[c]).trim() !== '') return String(row[c]).trim();
    }
    return '';
  };

  const company  = pick(DELIVERY_ADDRESS_CANDIDATES.company);
  const line1    = pick(DELIVERY_ADDRESS_CANDIDATES.line1);
  const line2    = pick(DELIVERY_ADDRESS_CANDIDATES.line2);
  const city     = pick(DELIVERY_ADDRESS_CANDIDATES.city);
  const state    = pick(DELIVERY_ADDRESS_CANDIDATES.state);
  const country  = pick(DELIVERY_ADDRESS_CANDIDATES.country) || ((state || city) ? 'India' : '');
  const pincode  = pick(DELIVERY_ADDRESS_CANDIDATES.pincode);
  const gst      = pick(DELIVERY_ADDRESS_CANDIDATES.gst);

  const lines = [];
  if (company) lines.push(company);
  if (line1)   lines.push(line1);
  if (line2)   lines.push(line2);
  if (city)    lines.push(city);
  if (state || country) lines.push([state, country].filter(Boolean).join(', '));
  if (pincode) lines.push(`PIN: ${pincode}`);
  if (gst)     lines.push(`GST: ${gst}`);

  return lines.length ? lines.join('\n') : null;
}

// ── DEBUG ROUTE: GET /api/production-plans/_debug/masters ────────────────────
// Visit this in the browser (while logged in) or curl it to see exactly what
// the backend auto-detected for vendor/supplier tables.
// Safe to remove once vendor/supplier dropdowns are confirmed working.
router.get('/_debug/masters', async (req, res) => {
  try {
    const tableNames = await getAllTableNames();
    const vendor      = await getVendorTable();
    const supplier     = await getSupplierTable();

    let vendorRowCount = null, supplierRowCount = null;
    if (vendor.table)   { const [[c]] = await db.query(`SELECT COUNT(*) AS c FROM \`${vendor.table}\``);   vendorRowCount   = c.c; }
    if (supplier.table) { const [[c]] = await db.query(`SELECT COUNT(*) AS c FROM \`${supplier.table}\``); supplierRowCount = c.c; }

    const obCols = await getObColumns();
    const deliveryAddressColsFound = Object.entries(DELIVERY_ADDRESS_CANDIDATES)
      .reduce((acc, [key, candidates]) => {
        acc[key] = pickAddressCol(obCols, candidates);
        return acc;
      }, {});

    res.json({
      vendor: {
        resolved_table: vendor.table,
        columns: [...vendor.cols],
        row_count: vendorRowCount,
      },
      supplier: {
        resolved_table: supplier.table,
        columns: [...supplier.cols],
        row_count: supplierRowCount,
      },
      delivery_address: {
        order_bookings_columns_used: deliveryAddressColsFound,
      },
      all_tables_in_db: tableNames,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// NAMED SUB-ROUTES — must appear BEFORE /:id
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/production-plans
router.get('/', async (req, res) => {
  try {
    const { search = '', order_type = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const cols = await getColumns();
    const hasCustomerName = cols.has('customer_name');

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      if (hasCustomerName) {
        where += ' AND (rec_no LIKE ? OR order_no LIKE ? OR constn_for_production LIKE ? OR customer_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      } else {
        where += ' AND (rec_no LIKE ? OR order_no LIKE ? OR constn_for_production LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
    }
    if (order_type) { where += ' AND order_type = ?'; params.push(order_type); }

    const [rows] = await db.query(
      `SELECT * FROM production_plans ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM production_plans ${where}`, params,
    );
    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /production-plans]', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/production-plans/orders/search
router.get('/orders/search', async (req, res) => {
  try {
    const { q = '', type = 'Customer Order' } = req.query;
    const isOpen = type === 'Open Order';
    const [rows] = await db.query(
      `SELECT order_code AS order_no, order_date, sort_no,
              order_quantity AS quantity, customer_name
       FROM order_bookings
       WHERE (order_code COLLATE utf8mb4_unicode_ci LIKE ?
           OR customer_name COLLATE utf8mb4_unicode_ci LIKE ?)
         AND (is_open_order = ?)
       ORDER BY order_date DESC LIMIT 50`,
      [`%${q}%`, `%${q}%`, isOpen ? 1 : 0],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /orders/search]', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/production-plans/co/search
router.get('/co/search', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const [rows] = await db.query(
      `SELECT order_code AS order_no, order_date, sort_no,
              order_quantity AS quantity, customer_name
       FROM order_bookings
       WHERE (order_code COLLATE utf8mb4_unicode_ci LIKE ?
           OR customer_name COLLATE utf8mb4_unicode_ci LIKE ?)
         AND (is_open_order = 0 OR is_open_order IS NULL)
       ORDER BY order_date DESC LIMIT 20`,
      [`%${q}%`, `%${q}%`],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /co/search]', err);
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/production-plans/vendors/search ─────────────────────────────────
// Powers the "By Production" vendor dropdown. Reads from the auto-resolved
// vendor table (see resolveMasterTable / getVendorTable above). Column names
// are auto-detected so this survives minor schema differences.
router.get('/vendors/search', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const { table, cols } = await getVendorTable();

    if (!table) {
      // Table not found — respond with empty list rather than a 500 so the
      // frontend dropdown just shows "no vendors found" instead of erroring.
      return res.json([]);
    }

    const nameCol = pickCol(cols, ['vendor_name', 'name', 'company_name', 'full_name', 'title']);
    const codeCol = pickCol(cols, ['vendor_code', 'code']);
    const locCol  = pickCol(cols, ['location', 'city', 'address']);
    const idCol   = pickCol(cols, ['id']) || 'id';

    if (!nameCol) return res.json([]);

    const selectCols = [
      `\`${idCol}\` AS id`,
      `\`${nameCol}\` AS vendor_name`,
      codeCol ? `\`${codeCol}\` AS vendor_code` : `NULL AS vendor_code`,
      locCol  ? `\`${locCol}\` AS location`     : `NULL AS location`,
    ];

    const whereParts = [`\`${nameCol}\` COLLATE utf8mb4_unicode_ci LIKE ?`];
    const params = [`%${q}%`];
    if (codeCol) {
      whereParts.push(`\`${codeCol}\` COLLATE utf8mb4_unicode_ci LIKE ?`);
      params.push(`%${q}%`);
    }

    const sql = `
      SELECT ${selectCols.join(', ')}
      FROM \`${table}\`
      WHERE ${whereParts.join(' OR ')}
      ORDER BY \`${nameCol}\` ASC
      LIMIT 50`;

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[GET /vendors/search]', err);
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/production-plans/suppliers/search ───────────────────────────────
// Powers the "By Purchase" supplier dropdown. Reads from the auto-resolved
// supplier table (see resolveMasterTable / getSupplierTable above).
router.get('/suppliers/search', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const { table, cols } = await getSupplierTable();

    if (!table) {
      return res.json([]);
    }

    const nameCol = pickCol(cols, ['supplier_name', 'name', 'company_name', 'full_name', 'title']);
    const codeCol = pickCol(cols, ['supplier_code', 'code']);
    const locCol  = pickCol(cols, ['location', 'city', 'address']);
    const idCol   = pickCol(cols, ['id']) || 'id';

    if (!nameCol) return res.json([]);

    const selectCols = [
      `\`${idCol}\` AS id`,
      `\`${nameCol}\` AS supplier_name`,
      codeCol ? `\`${codeCol}\` AS supplier_code` : `NULL AS supplier_code`,
      locCol  ? `\`${locCol}\` AS location`       : `NULL AS location`,
    ];

    const whereParts = [`\`${nameCol}\` COLLATE utf8mb4_unicode_ci LIKE ?`];
    const params = [`%${q}%`];
    if (codeCol) {
      whereParts.push(`\`${codeCol}\` COLLATE utf8mb4_unicode_ci LIKE ?`);
      params.push(`%${q}%`);
    }

    const sql = `
      SELECT ${selectCols.join(', ')}
      FROM \`${table}\`
      WHERE ${whereParts.join(' OR ')}
      ORDER BY \`${nameCol}\` ASC
      LIMIT 50`;

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[GET /suppliers/search]', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/production-plans/order/:orderNo
// ── Fetches authoritative order data from order_bookings ─────────────────────
// ── COLLATE fix prevents "Illegal mix of collations" 500 error ───────────────
// ── NEW: also returns `delivery_address` — a formatted text block built from
//    whatever address-related columns exist on order_bookings (see
//    buildDeliveryAddressBlock above). Same auto-fill trigger as Order Date /
//    Order Sort No / Confirmed By — i.e. whenever Order No is selected.
router.get('/order/:orderNo', async (req, res) => {
  try {
    const obCols = await getObColumns();

    // Build SELECT list based on actual columns present in order_bookings
    const selectCols = ['ob.order_code AS order_no', 'ob.order_date'];

    if (obCols.has('sort_no'))
      selectCols.push('ob.sort_no AS order_sort_no');
    else
      selectCols.push('NULL AS order_sort_no');

    if (obCols.has('customer_name'))
      selectCols.push('ob.customer_name');
    else
      selectCols.push('NULL AS customer_name');

    // confirm_by → confirmed_by alias (order_bookings uses confirm_by)
    if (obCols.has('confirm_by'))
      selectCols.push('ob.confirm_by AS confirmed_by');
    else if (obCols.has('confirmed_by'))
      selectCols.push('ob.confirmed_by');
    else
      selectCols.push('NULL AS confirmed_by');

    // constn_as_po — try both column names
    if (obCols.has('constn_as_po'))
      selectCols.push('ob.constn_as_po');
    else if (obCols.has('constn_for_production'))
      selectCols.push('ob.constn_for_production AS constn_as_po');
    else
      selectCols.push('NULL AS constn_as_po');

    // quantity — try common column names
    if (obCols.has('order_quantity'))
      selectCols.push('ob.order_quantity');
    else if (obCols.has('total_meters'))
      selectCols.push('ob.total_meters AS order_quantity');
    else if (obCols.has('meter'))
      selectCols.push('ob.meter AS order_quantity');
    else
      selectCols.push('0 AS order_quantity');

    // ── NEW: pull in any delivery-address-related raw columns that exist ──────
    addDeliveryAddressSelectCols(selectCols, obCols);

    // Total already planned across all production_plans for this order
    selectCols.push(`COALESCE(
      (SELECT SUM(pp2.allocated_qty + pp2.production_qty + pp2.purchase_qty)
       FROM production_plans pp2
       WHERE pp2.order_no COLLATE utf8mb4_unicode_ci
           = ob.order_code COLLATE utf8mb4_unicode_ci
      ), 0) AS total_planned_qty`);

    // ── COLLATE on WHERE prevents "Illegal mix of collations" 500 error ──────
    const sql = `
      SELECT ${selectCols.join(',\n             ')}
      FROM order_bookings ob
      WHERE ob.order_code COLLATE utf8mb4_unicode_ci
          = ? COLLATE utf8mb4_unicode_ci
      LIMIT 1`;

    const [[ob]] = await db.query(sql, [req.params.orderNo]);

    if (!ob) return res.status(404).json({ message: 'Order not found' });

    if (ob.confirmed_by == null) ob.confirmed_by = null;
    if (ob.constn_as_po == null) ob.constn_as_po = null;

    // ── NEW: build the formatted delivery address block ────────────────────
    ob.delivery_address = buildDeliveryAddressBlock(ob, obCols);

    ob.balance_qty = Number(ob.order_quantity || 0) - Number(ob.total_planned_qty || 0);

    res.json(ob);
  } catch (err) {
    console.error('[GET /order/:orderNo]', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/production-plans/pending-purchase
// Plans whose "By Purchase" qty hasn't been converted into a Fabric PO yet.
// Consumed by the Fabric Purchase Order page to let users link a PO back to
// the plan that requested it. MUST stay above /:id.
// GET /api/production-plans/pending-purchase
router.get('/pending-purchase', async (req, res) => {
  try {
    const cols = await getColumns();
    const hasFpoId         = cols.has('fpo_id');
    const hasCustomerName  = cols.has('customer_name');
    const hasSupplierName  = cols.has('supplier_name');

    const selectCols = [
      'id', 'rec_no', 'rec_date', 'order_type', 'order_no',
      hasCustomerName ? 'customer_name' : 'NULL AS customer_name',
      'order_sort_no', 'constn_for_production', 'purchase_qty',
      'purchase_special_instruction',
      hasSupplierName ? 'supplier_name' : 'NULL AS supplier_name',
    ];

    let where = 'WHERE purchase_qty > 0';
    if (hasFpoId) where += ' AND fpo_id IS NULL';

    const [rows] = await db.query(
      `SELECT ${selectCols.join(', ')}
       FROM production_plans
       ${where}
       ORDER BY id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /production-plans/pending-purchase]', err);
    res.status(500).json({ message: err.message });
  }
});



// ─────────────────────────────────────────────────────────────────────────────
// PARAM ROUTES — /:id last
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/production-plans/:id
router.get('/:id', async (req, res) => {
  try {
    const plan = await fetchPlan(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    res.json(plan);
  } catch (err) {
    console.error('[GET /production-plans/:id]', err);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/production-plans
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const recNo   = await generatePlanCode(conn);
    const recDate = new Date().toISOString().slice(0, 10);

    const {
      order_type = '', order_no = '',
      order_date = null, order_sort_no = null,
      customer_name = '', confirmed_by = '',
      delivery_address = '',                       // ← NEW
      constn_for_production = null, order_quantity = null,
      allocated_qty = 0, stock_special_instruction = null,
      production_qty = 0, inhouse_prod_qty = 0, vendor_prod_qty = 0,
      prod_special_instruction = null,
      vendor_id = null, vendor_name = '',          // ← NEW
      purchase_qty = 0, purchase_special_instruction = null,
      supplier_id = null, supplier_name = '',       // ← NEW
      order_links = '[]',
    } = req.body;

    const cols = await getColumns();
    const hasCustomerName    = cols.has('customer_name');
    const hasConfirmedBy     = cols.has('confirmed_by');
    const hasDeliveryAddress = cols.has('delivery_address');   // ← NEW
    const hasVendorCols      = cols.has('vendor_name');    // implies vendor_id too
    const hasSupplierCols    = cols.has('supplier_name');  // implies supplier_id too

    // Build column/value lists dynamically so this keeps working whether or
    // not the migration adding vendor_id/vendor_name/supplier_id/supplier_name/
    // delivery_address (and the older customer_name/confirmed_by) has been
    // applied yet.
    const columns = ['rec_no', 'rec_date', 'order_type', 'order_no', 'order_date', 'order_sort_no'];
    const values  = [recNo, recDate, order_type, order_no, toDateOnly(order_date), order_sort_no || null];

    if (hasCustomerName)    { columns.push('customer_name');    values.push(customer_name || null); }
    if (hasConfirmedBy)     { columns.push('confirmed_by');     values.push(confirmed_by  || null); }
    if (hasDeliveryAddress) { columns.push('delivery_address'); values.push(delivery_address || null); }  // ← NEW

    columns.push(
      'constn_for_production', 'order_quantity',
      'allocated_qty', 'stock_special_instruction',
      'production_qty', 'inhouse_prod_qty', 'vendor_prod_qty', 'prod_special_instruction',
    );
    values.push(
      constn_for_production || null,
      order_quantity ? Number(order_quantity) : null,
      Number(allocated_qty) || 0,
      stock_special_instruction || null,
      Number(production_qty) || 0,
      Number(inhouse_prod_qty) || 0,
      Number(vendor_prod_qty) || 0,
      prod_special_instruction || null,
    );

    if (hasVendorCols) {
      columns.push('vendor_id', 'vendor_name');
      values.push(vendor_id ? Number(vendor_id) : null, vendor_name || null);
    }

    columns.push('purchase_qty', 'purchase_special_instruction');
    values.push(Number(purchase_qty) || 0, purchase_special_instruction || null);

    if (hasSupplierCols) {
      columns.push('supplier_id', 'supplier_name');
      values.push(supplier_id ? Number(supplier_id) : null, supplier_name || null);
    }

    const insertSQL = `INSERT INTO production_plans (${columns.join(', ')})
      VALUES (${columns.map(() => '?').join(',')})`;

    const [result] = await conn.query(insertSQL, values);
    const dbId = result.insertId;

    const links = safeParseArray(order_links);
    for (const lnk of links) {
      if (!lnk.co_no) continue;
      await conn.query(
        `INSERT INTO plan_order_links
           (plan_id, linking_date, co_no, co_date, customer_name,
            co_sort_no, co_quantity, plan_quantity_allocated)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          dbId,
          toDateOnly(lnk.linking_date) || recDate,
          lnk.co_no,
          toDateOnly(lnk.co_date),
          lnk.customer_name || null,
          lnk.co_sort_no || null,
          lnk.co_quantity ? Number(lnk.co_quantity) : null,
          lnk.plan_quantity_allocated ? Number(lnk.plan_quantity_allocated) : null,
        ],
      );
    }

    await conn.commit();
    const created = await fetchPlan(dbId);
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    console.error('[POST /production-plans] ERROR:', err.message);
    console.error(err);
    res.status(500).json({ message: err.message || 'Failed to create production plan' });
  } finally {
    conn.release();
  }
});

// PUT /api/production-plans/:id
router.put('/:id', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;
    const {
      order_type = '', order_no = '',
      order_date = null, order_sort_no = null,
      customer_name = '', confirmed_by = '',
      delivery_address = '',                       // ← NEW
      constn_for_production = null, order_quantity = null,
      allocated_qty = 0, stock_special_instruction = null,
      production_qty = 0, inhouse_prod_qty = 0, vendor_prod_qty = 0,
      prod_special_instruction = null,
      vendor_id = null, vendor_name = '',          // ← NEW
      purchase_qty = 0, purchase_special_instruction = null,
      supplier_id = null, supplier_name = '',       // ← NEW
      order_links = '[]', deleted_link_ids = '[]',
    } = req.body;

    const cols = await getColumns();
    const hasCustomerName    = cols.has('customer_name');
    const hasConfirmedBy     = cols.has('confirmed_by');
    const hasDeliveryAddress = cols.has('delivery_address');   // ← NEW
    const hasVendorCols      = cols.has('vendor_name');
    const hasSupplierCols    = cols.has('supplier_name');

    const setParts = ['order_type=?', 'order_no=?', 'order_date=?', 'order_sort_no=?'];
    const values   = [order_type, order_no, toDateOnly(order_date), order_sort_no || null];

    if (hasCustomerName)    { setParts.push('customer_name=?');    values.push(customer_name || null); }
    if (hasConfirmedBy)     { setParts.push('confirmed_by=?');     values.push(confirmed_by  || null); }
    if (hasDeliveryAddress) { setParts.push('delivery_address=?'); values.push(delivery_address || null); }  // ← NEW

    setParts.push(
      'constn_for_production=?', 'order_quantity=?',
      'allocated_qty=?', 'stock_special_instruction=?',
      'production_qty=?', 'inhouse_prod_qty=?', 'vendor_prod_qty=?',
      'prod_special_instruction=?',
    );
    values.push(
      constn_for_production || null,
      order_quantity ? Number(order_quantity) : null,
      Number(allocated_qty) || 0,
      stock_special_instruction || null,
      Number(production_qty) || 0,
      Number(inhouse_prod_qty) || 0,
      Number(vendor_prod_qty) || 0,
      prod_special_instruction || null,
    );

    if (hasVendorCols) {
      setParts.push('vendor_id=?', 'vendor_name=?');
      values.push(vendor_id ? Number(vendor_id) : null, vendor_name || null);
    }

    setParts.push('purchase_qty=?', 'purchase_special_instruction=?');
    values.push(Number(purchase_qty) || 0, purchase_special_instruction || null);

    if (hasSupplierCols) {
      setParts.push('supplier_id=?', 'supplier_name=?');
      values.push(supplier_id ? Number(supplier_id) : null, supplier_name || null);
    }

    values.push(id);
    const updateSQL = `UPDATE production_plans SET ${setParts.join(', ')} WHERE id=?`;

    await conn.query(updateSQL, values);

    const deletedIds = safeParseArray(deleted_link_ids).filter(Boolean);
    if (deletedIds.length) {
      await conn.query('DELETE FROM plan_order_links WHERE id IN (?)', [deletedIds]);
    }

    const links = safeParseArray(order_links);
    for (const lnk of links) {
      if (!lnk.co_no) continue;
      if (lnk.id) {
        await conn.query(
          `UPDATE plan_order_links SET
             linking_date=?, co_no=?, co_date=?, customer_name=?,
             co_sort_no=?, co_quantity=?, plan_quantity_allocated=?
           WHERE id=?`,
          [
            toDateOnly(lnk.linking_date),
            lnk.co_no,
            toDateOnly(lnk.co_date),
            lnk.customer_name || null,
            lnk.co_sort_no || null,
            lnk.co_quantity ? Number(lnk.co_quantity) : null,
            lnk.plan_quantity_allocated ? Number(lnk.plan_quantity_allocated) : null,
            lnk.id,
          ],
        );
      } else {
        await conn.query(
          `INSERT INTO plan_order_links
             (plan_id, linking_date, co_no, co_date, customer_name,
              co_sort_no, co_quantity, plan_quantity_allocated)
           VALUES (?,?,?,?,?,?,?,?)`,
          [
            id,
            toDateOnly(lnk.linking_date) || new Date().toISOString().slice(0, 10),
            lnk.co_no,
            toDateOnly(lnk.co_date),
            lnk.customer_name || null,
            lnk.co_sort_no || null,
            lnk.co_quantity ? Number(lnk.co_quantity) : null,
            lnk.plan_quantity_allocated ? Number(lnk.plan_quantity_allocated) : null,
          ],
        );
      }
    }

    await conn.commit();
    const updated = await fetchPlan(id);
    res.json(updated);
  } catch (err) {
    await conn.rollback();
    console.error('[PUT /production-plans/:id] ERROR:', err.message);
    console.error(err);
    res.status(500).json({ message: err.message || 'Failed to update production plan' });
  } finally {
    conn.release();
  }
});

// DELETE /api/production-plans/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM plan_order_links WHERE plan_id = ?', [req.params.id]);
    await db.query('DELETE FROM production_plans WHERE id = ?', [req.params.id]);
    res.json({ message: 'Production plan deleted' });
  } catch (err) {
    console.error('[DELETE /production-plans/:id] ERROR:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;