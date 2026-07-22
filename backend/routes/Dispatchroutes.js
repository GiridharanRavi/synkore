// backend/routes/dispatchRoutes.js
//
// ── Dispatch Summary module ────────────────────────────────────────────
// Logistics tracking for outbound shipments. Unlike Sales Report /
// Purchase Report (derived, read-only ledgers), this module OWNS a new
// table — `dispatches` — because nothing in the schema captured
// transporter/vehicle/delivery-status data before this.
//
// A dispatch optionally links back to a Sales Invoice (fabric_invoices)
// via sales_invoice_id, FK-free (same convention as payments_in /
// payments_out), so a deleted/renamed invoice never blocks or corrupts a
// dispatch row — invoice_no_snapshot + customer_name are captured at
// dispatch time regardless.
//
// Columns: Dispatch Date · Dispatch No · Invoice No · Customer · Ship To ·
//          Product Type · Qty · Transporter · Vehicle/LR No · Status ·
//          Expected/Actual Delivery (→ Delay badge)
//
// Endpoints:
//   GET    /api/dispatches                — paginated list
//   GET    /api/dispatches/all            — full list (export)
//   GET    /api/dispatches/summary        — header summary cards
//   GET    /api/dispatches/status-breakdown — counts per status (donut chart)
//   GET    /api/dispatches/trend          — monthly dispatch count/qty trend
//   GET    /api/dispatches/customers      — distinct customer names (filter)
//   GET    /api/dispatches/transporters   — distinct transporter names (filter)
//   GET    /api/dispatches/invoices       — sales invoices to link a new dispatch to
//   POST   /api/dispatches                — record a new dispatch
//   PUT    /api/dispatches/:id            — edit a dispatch
//   DELETE /api/dispatches/:id            — delete a dispatch
// ─────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

const TABLE = 'dispatches';
const SALES_TABLE = 'fabric_invoices';

const STATUS_VALUES = ['Pending', 'Dispatched', 'In Transit', 'Delivered', 'Returned'];
const FREIGHT_PAID_BY_VALUES = ['Consignor', 'Consignee', 'To Pay'];

// ── schema helpers (same pattern as accountDetailsRoutes.js / salesReportRoutes.js) ──
async function tableExists(table) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table],
  );
  return rows[0].c > 0;
}
const _colCache = {};
async function getCols(table) {
  if (_colCache[table]) return _colCache[table];
  try {
    const [rows] = await db.query(`SHOW COLUMNS FROM \`${table}\``);
    _colCache[table] = new Set(rows.map(r => r.Field));
  } catch {
    _colCache[table] = new Set();
  }
  return _colCache[table];
}
function pickCol(cols, candidates) {
  for (const c of candidates) if (cols.has(c)) return c;
  return null;
}

async function ensureSchema() {
  try {
    if (!(await tableExists(TABLE))) {
      await db.query(`
        CREATE TABLE ${TABLE} (
          id                      INT AUTO_INCREMENT PRIMARY KEY,
          dispatch_no             VARCHAR(50)  NOT NULL,
          dispatch_date           DATE         NOT NULL,
          sales_invoice_id        INT          NULL,
          invoice_no_snapshot     VARCHAR(50)  NULL,
          customer_name           VARCHAR(255) NOT NULL,
          ship_to                 VARCHAR(255) NULL,
          product_type            ENUM('Fabric','Yarn') NOT NULL DEFAULT 'Fabric',
          qty_dispatched          DECIMAL(12,2) NOT NULL DEFAULT 0,
          qty_unit                VARCHAR(20)  NOT NULL DEFAULT 'Meters',
          no_of_packages          INT          NULL,
          transporter_name        VARCHAR(255) NULL,
          vehicle_no              VARCHAR(50)  NULL,
          lr_no                   VARCHAR(100) NULL,
          driver_name              VARCHAR(100) NULL,
          driver_phone              VARCHAR(20)  NULL,
          freight_charges           DECIMAL(12,2) NOT NULL DEFAULT 0,
          freight_paid_by           ENUM('Consignor','Consignee','To Pay') NOT NULL DEFAULT 'Consignor',
          status                    ENUM('Pending','Dispatched','In Transit','Delivered','Returned') NOT NULL DEFAULT 'Pending',
          expected_delivery_date    DATE NULL,
          actual_delivery_date      DATE NULL,
          remarks                   TEXT NULL,
          dispatched_by             VARCHAR(100) NULL,
          created_at                 DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at                 DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_dispatch_no (dispatch_no),
          INDEX idx_dispatches_invoice (sales_invoice_id),
          INDEX idx_dispatches_customer_date (customer_name, dispatch_date),
          INDEX idx_dispatches_status (status),
          INDEX idx_dispatches_expected_delivery (expected_delivery_date)
        )
      `);
      console.log('[dispatches] created dispatches table');
    }
    if (!(await tableExists(SALES_TABLE))) {
      console.warn(`[dispatches] "${SALES_TABLE}" not found — the "link to invoice" picker will be empty until it exists, but dispatches can still be recorded without a linked invoice.`);
    }
    console.log('[dispatches] schema check complete.');
  } catch (err) {
    console.error('[dispatches] ensureSchema failed:', err.code || '', err.sqlMessage || err.message);
  }
}
const schemaReady = ensureSchema();

// ── helpers ─────────────────────────────────────────────────────────────
function validateStatus(s) { return STATUS_VALUES.includes(s) ? s : 'Pending'; }
function validateFreightPaidBy(s) { return FREIGHT_PAID_BY_VALUES.includes(s) ? s : 'Consignor'; }

// Generates dispatch numbers in the Indian-financial-year format used
// elsewhere in the app, e.g. "DC001/26-27" (FY runs Apr → Mar).
// The running sequence resets whenever the financial year changes,
// since it's scoped to dispatch_no LIKE 'DC%/<fyLabel>'.
function currentFinancialYearLabel(d = new Date()) {
  const month = d.getMonth() + 1; // 1-12
  const fyStart = month >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  const fyEnd = fyStart + 1;
  return `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;
}

async function nextDispatchNo() {
  const fyLabel = currentFinancialYearLabel();
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS c FROM ${TABLE} WHERE dispatch_no LIKE ?`,
    [`DC%/${fyLabel}`],
  );
  const seq = (Number(row.c) || 0) + 1;
  return `DC${String(seq).padStart(3, '0')}/${fyLabel}`;
}

// Delay/ETA classification — mirrors AccountDetailsMaster's Invoice ETA
// badge logic, adapted for delivery status instead of payment status.
function computeDelay(row) {
  if (!row.expected_delivery_date) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const expected = new Date(row.expected_delivery_date); expected.setHours(0, 0, 0, 0);

  if (row.status === 'Delivered') {
    if (row.actual_delivery_date) {
      const actual = new Date(row.actual_delivery_date); actual.setHours(0, 0, 0, 0);
      const diff = Math.round((expected.getTime() - actual.getTime()) / 86400000);
      if (diff > 0) return { label: `Delivered ${diff}d early`, tone: 'early' };
      if (diff < 0) return { label: `Delivered ${Math.abs(diff)}d late`, tone: 'late' };
      return { label: 'Delivered on time', tone: 'ontime' };
    }
    return { label: 'Delivered', tone: 'ontime' };
  }
  if (row.status === 'Returned') return { label: 'Returned', tone: 'returned' };

  const diffToday = Math.round((expected.getTime() - today.getTime()) / 86400000);
  if (diffToday >= 0) return { label: diffToday === 0 ? 'Due today' : `${diffToday}d left`, tone: 'ontrack' };
  return { label: `${Math.abs(diffToday)}d overdue`, tone: 'overdue' };
}

function formatRow(r) {
  return {
    id: r.id,
    dispatch_no: r.dispatch_no,
    dispatch_date: r.dispatch_date ? new Date(r.dispatch_date).toISOString().slice(0, 10) : null,
    invoice_no: r.live_invoice_no || r.invoice_no_snapshot || null,
    invoice_value: r.invoice_value != null ? Number(r.invoice_value) : null,
    customer_name: r.customer_name,
    ship_to: r.ship_to || r.customer_name,
    product_type: r.product_type,
    qty_dispatched: Number(r.qty_dispatched) || 0,
    qty_unit: r.qty_unit,
    no_of_packages: r.no_of_packages != null ? Number(r.no_of_packages) : null,
    transporter_name: r.transporter_name,
    vehicle_no: r.vehicle_no,
    lr_no: r.lr_no,
    driver_name: r.driver_name,
    driver_phone: r.driver_phone,
    freight_charges: Number(r.freight_charges) || 0,
    freight_paid_by: r.freight_paid_by,
    status: r.status,
    expected_delivery_date: r.expected_delivery_date ? new Date(r.expected_delivery_date).toISOString().slice(0, 10) : null,
    actual_delivery_date: r.actual_delivery_date ? new Date(r.actual_delivery_date).toISOString().slice(0, 10) : null,
    delay: computeDelay(r),
    remarks: r.remarks,
    dispatched_by: r.dispatched_by,
  };
}

// Resolve the sales invoice amount column once (used for invoice_value).
// buildSelect() below does the actual LEFT JOIN so a dispatch survives
// even if its linked invoice is later deleted/renamed —
// invoice_no_snapshot is the fallback display value in that case.
let _salesAmountCol;
async function resolveSalesAmountCol() {
  if (_salesAmountCol !== undefined) return _salesAmountCol;
  const cols = await getCols(SALES_TABLE);
  _salesAmountCol = pickCol(cols, ['grand_total', 'invoice_amount', 'total_amount', 'bill_amount', 'invoice_value', 'net_value', 'amount', 'total']);
  return _salesAmountCol;
}

async function buildSelect() {
  const amtCol = await resolveSalesAmountCol();
  const salesExists = await tableExists(SALES_TABLE);
  const joinSel = salesExists
    ? `si.invoice_no AS live_invoice_no, ${amtCol ? `si.${amtCol}` : 'NULL'} AS invoice_value`
    : `NULL AS live_invoice_no, NULL AS invoice_value`;
  const join = salesExists ? `LEFT JOIN ${SALES_TABLE} si ON si.id = d.sales_invoice_id` : '';
  return `SELECT d.*, ${joinSel} FROM ${TABLE} d ${join}`;
}

// ─────────────────────────────────────────────────────────────────────────
// GET /  — paginated list
// ─────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    await schemaReady;
    const { search = '', customer = '', status = '', transporter = '', from = '', to = '', page = 1, limit = 25 } = req.query;

    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      where += ` AND (d.dispatch_no LIKE ? OR d.customer_name LIKE ? OR d.invoice_no_snapshot LIKE ? OR d.vehicle_no LIKE ? OR d.lr_no LIKE ? OR d.transporter_name LIKE ?)`;
      params.push(...Array(6).fill(`%${search}%`));
    }
    if (customer)    { where += ' AND d.customer_name = ?'; params.push(customer); }
    if (status)      { where += ' AND d.status = ?'; params.push(status); }
    if (transporter) { where += ' AND d.transporter_name = ?'; params.push(transporter); }
    if (from)        { where += ' AND d.dispatch_date >= ?'; params.push(from); }
    if (to)          { where += ' AND d.dispatch_date <= ?'; params.push(to); }

    const selectSql = await buildSelect();
    const [[countRow]] = await db.query(`SELECT COUNT(*) AS c FROM ${TABLE} d ${where}`, params);
    const offset = (Number(page) - 1) * Number(limit);
    const [rows] = await db.query(
      `${selectSql} ${where} ORDER BY d.dispatch_date DESC, d.id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );

    res.json({ data: rows.map(formatRow), total: countRow.c, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /dispatches]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// GET /all — full export
router.get('/all', async (req, res) => {
  try {
    await schemaReady;
    const { search = '', customer = '', status = '', transporter = '', from = '', to = '' } = req.query;

    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      where += ` AND (d.dispatch_no LIKE ? OR d.customer_name LIKE ? OR d.invoice_no_snapshot LIKE ? OR d.vehicle_no LIKE ? OR d.lr_no LIKE ? OR d.transporter_name LIKE ?)`;
      params.push(...Array(6).fill(`%${search}%`));
    }
    if (customer)    { where += ' AND d.customer_name = ?'; params.push(customer); }
    if (status)      { where += ' AND d.status = ?'; params.push(status); }
    if (transporter) { where += ' AND d.transporter_name = ?'; params.push(transporter); }
    if (from)        { where += ' AND d.dispatch_date >= ?'; params.push(from); }
    if (to)          { where += ' AND d.dispatch_date <= ?'; params.push(to); }

    const selectSql = await buildSelect();
    const [rows] = await db.query(`${selectSql} ${where} ORDER BY d.dispatch_date DESC, d.id DESC`, params);
    res.json({ data: rows.map(formatRow), total: rows.length });
  } catch (err) {
    console.error('[GET /dispatches/all]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /summary — header summary cards
// ─────────────────────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    await schemaReady;
    const { customer = '', from = '', to = '' } = req.query;

    let where = 'WHERE 1=1';
    const params = [];
    if (customer) { where += ' AND customer_name = ?'; params.push(customer); }
    if (from)     { where += ' AND dispatch_date >= ?'; params.push(from); }
    if (to)       { where += ' AND dispatch_date <= ?'; params.push(to); }

    const [[totals]] = await db.query(
      `SELECT COUNT(*) AS total_dispatches,
              SUM(CASE WHEN status = 'In Transit' THEN 1 ELSE 0 END) AS in_transit_count,
              SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS pending_count,
              SUM(CASE WHEN status NOT IN ('Delivered','Returned') AND expected_delivery_date IS NOT NULL AND expected_delivery_date < CURDATE() THEN 1 ELSE 0 END) AS delayed_count,
              SUM(CASE WHEN status = 'Delivered' AND actual_delivery_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN 1 ELSE 0 END) AS delivered_this_month
       FROM ${TABLE} ${where}`,
      params,
    );

    res.json({
      total_dispatches: Number(totals.total_dispatches) || 0,
      in_transit_count: Number(totals.in_transit_count) || 0,
      pending_count: Number(totals.pending_count) || 0,
      delayed_count: Number(totals.delayed_count) || 0,
      delivered_this_month: Number(totals.delivered_this_month) || 0,
    });
  } catch (err) {
    console.error('[GET /dispatches/summary]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /status-breakdown — counts per status, for the donut chart
// ─────────────────────────────────────────────────────────────────────────
router.get('/status-breakdown', async (req, res) => {
  try {
    await schemaReady;
    const { customer = '', from = '', to = '' } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (customer) { where += ' AND customer_name = ?'; params.push(customer); }
    if (from)     { where += ' AND dispatch_date >= ?'; params.push(from); }
    if (to)       { where += ' AND dispatch_date <= ?'; params.push(to); }

    const [rows] = await db.query(
      `SELECT status, COUNT(*) AS count FROM ${TABLE} ${where} GROUP BY status`,
      params,
    );
    // Always return all 5 statuses (0-filled) so the chart legend is stable
    const byStatus = new Map(rows.map(r => [r.status, Number(r.count)]));
    res.json(STATUS_VALUES.map(s => ({ status: s, count: byStatus.get(s) || 0 })));
  } catch (err) {
    console.error('[GET /dispatches/status-breakdown]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /trend — monthly dispatch count + quantity
// ─────────────────────────────────────────────────────────────────────────
router.get('/trend', async (req, res) => {
  try {
    await schemaReady;
    const { customer = '', from = '', to = '' } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (customer) { where += ' AND customer_name = ?'; params.push(customer); }
    if (from)     { where += ' AND dispatch_date >= ?'; params.push(from); }
    if (to)       { where += ' AND dispatch_date <= ?'; params.push(to); }

    const [rows] = await db.query(
      `SELECT DATE_FORMAT(dispatch_date, '%Y-%m') AS month,
              COUNT(*) AS dispatch_count,
              COALESCE(SUM(qty_dispatched), 0) AS total_qty,
              SUM(CASE WHEN status = 'Delivered' THEN 1 ELSE 0 END) AS delivered_count
       FROM ${TABLE} ${where}
       GROUP BY DATE_FORMAT(dispatch_date, '%Y-%m')
       ORDER BY month ASC`,
      params,
    );

    res.json(rows.map(r => ({
      month: r.month,
      dispatch_count: Number(r.dispatch_count),
      total_qty: Number(r.total_qty),
      delivered_count: Number(r.delivered_count),
    })));
  } catch (err) {
    console.error('[GET /dispatches/trend]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /customers — dropdown filter list
// ─────────────────────────────────────────────────────────────────────────
router.get('/customers', async (req, res) => {
  try {
    await schemaReady;
    const [rows] = await db.query(
      `SELECT DISTINCT customer_name AS name FROM ${TABLE} WHERE customer_name IS NOT NULL AND customer_name <> '' ORDER BY customer_name ASC`,
    );
    res.json(rows.map(r => r.name));
  } catch (err) {
    console.error('[GET /dispatches/customers]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// GET /transporters — dropdown filter list
router.get('/transporters', async (req, res) => {
  try {
    await schemaReady;
    const [rows] = await db.query(
      `SELECT DISTINCT transporter_name AS name FROM ${TABLE} WHERE transporter_name IS NOT NULL AND transporter_name <> '' ORDER BY transporter_name ASC`,
    );
    res.json(rows.map(r => r.name));
  } catch (err) {
    console.error('[GET /dispatches/transporters]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /invoices — sales invoices for the "link to invoice" picker in the
// Record Dispatch modal. Returns id/invoice_no/customer_name/bill_to/amount.
// ─────────────────────────────────────────────────────────────────────────
router.get('/invoices', async (req, res) => {
  try {
    await schemaReady;
    if (!(await tableExists(SALES_TABLE))) return res.json([]);
    const { search = '' } = req.query;
    const cols = await getCols(SALES_TABLE);
    const amtCol = pickCol(cols, ['grand_total', 'invoice_amount', 'total_amount', 'bill_amount', 'invoice_value', 'net_value', 'amount', 'total']);
    const billToCol = pickCol(cols, ['bill_to']);
    const statusCol = pickCol(cols, ['status']);

    // ── extra columns for dispatch-form auto-fill ──────────────────────
    // Resolved defensively via pickCol — if fabric_invoices doesn't carry
    // one of these (e.g. no transporter info at invoice stage), the SELECT
    // falls back to NULL and the frontend just leaves that field for the
    // user to fill in manually.
    const shipToCol      = pickCol(cols, ['ship_to', 'ship_to_address', 'shipping_address', 'delivery_address', 'consignee_address', 'address']);
    const qtyCol          = pickCol(cols, ['total_quantity', 'total_qty', 'quantity', 'qty', 'qty_total']);
    const qtyUnitCol      = pickCol(cols, ['qty_unit', 'unit', 'uom']);
    const packagesCol     = pickCol(cols, ['no_of_packages', 'no_of_pkgs', 'package_count', 'packages', 'total_packages']);
    const transporterCol  = pickCol(cols, ['transporter_name', 'transporter']);
    const vehicleCol      = pickCol(cols, ['vehicle_no', 'vehicle_number']);
    const lrCol            = pickCol(cols, ['lr_no', 'lr_number', 'tracking_no', 'tracking_number']);

    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      where += ' AND (invoice_no LIKE ? OR customer_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (statusCol) {
      where += ` AND LOWER(${statusCol}) NOT IN ('cancelled','canceled','deleted','cancel','delete','void')`;
    }

    const [rows] = await db.query(
      `SELECT id, invoice_no, customer_name,
              ${billToCol ? billToCol : 'NULL'} AS bill_to,
              ${amtCol ? amtCol : 'NULL'} AS invoice_amount,
              ${shipToCol ? shipToCol : 'NULL'} AS ship_to_address,
              ${qtyCol ? qtyCol : 'NULL'} AS total_qty,
              ${qtyUnitCol ? qtyUnitCol : 'NULL'} AS qty_unit,
              ${packagesCol ? packagesCol : 'NULL'} AS no_of_packages,
              ${transporterCol ? transporterCol : 'NULL'} AS transporter_name,
              ${vehicleCol ? vehicleCol : 'NULL'} AS vehicle_no,
              ${lrCol ? lrCol : 'NULL'} AS lr_no
       FROM ${SALES_TABLE} ${where}
       ORDER BY invoice_date DESC, id DESC
       LIMIT 100`,
      params,
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /dispatches/invoices]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST / — record a new dispatch
// ─────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    await schemaReady;
    const {
      dispatch_no, dispatch_date, sales_invoice_id = null, invoice_no_snapshot = '',
      customer_name, ship_to = '', product_type = 'Fabric',
      qty_dispatched = 0, qty_unit = 'Meters', no_of_packages = null,
      transporter_name = '', vehicle_no = '', lr_no = '',
      driver_name = '', driver_phone = '',
      freight_charges = 0, freight_paid_by = 'Consignor',
      status = 'Pending', expected_delivery_date = null, actual_delivery_date = null,
      remarks = '', dispatched_by = '',
    } = req.body;

    if (!customer_name) return res.status(400).json({ message: 'customer_name is required' });
    if (!dispatch_date) return res.status(400).json({ message: 'dispatch_date is required' });

    const finalDispatchNo = dispatch_no && dispatch_no.trim() ? dispatch_no.trim() : await nextDispatchNo();

    const [result] = await db.query(
      `INSERT INTO ${TABLE} (
         dispatch_no, dispatch_date, sales_invoice_id, invoice_no_snapshot, customer_name, ship_to,
         product_type, qty_dispatched, qty_unit, no_of_packages,
         transporter_name, vehicle_no, lr_no, driver_name, driver_phone,
         freight_charges, freight_paid_by, status, expected_delivery_date, actual_delivery_date,
         remarks, dispatched_by, created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, NOW())`,
      [
        finalDispatchNo, dispatch_date, sales_invoice_id || null, invoice_no_snapshot || null, customer_name, ship_to || null,
        product_type === 'Yarn' ? 'Yarn' : 'Fabric', Number(qty_dispatched) || 0, qty_unit || 'Meters', no_of_packages || null,
        transporter_name || null, vehicle_no || null, lr_no || null, driver_name || null, driver_phone || null,
        Number(freight_charges) || 0, validateFreightPaidBy(freight_paid_by), validateStatus(status),
        expected_delivery_date || null, actual_delivery_date || null,
        remarks || null, dispatched_by || null,
      ],
    );

    res.status(201).json({ id: result.insertId, dispatch_no: finalDispatchNo, message: 'Dispatch recorded' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A dispatch with this Dispatch No already exists.' });
    }
    console.error('[POST /dispatches]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// PUT /:id — edit a dispatch
// ─────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    await schemaReady;
    const {
      dispatch_date, sales_invoice_id = null, invoice_no_snapshot = '',
      customer_name, ship_to = '', product_type = 'Fabric',
      qty_dispatched = 0, qty_unit = 'Meters', no_of_packages = null,
      transporter_name = '', vehicle_no = '', lr_no = '',
      driver_name = '', driver_phone = '',
      freight_charges = 0, freight_paid_by = 'Consignor',
      status = 'Pending', expected_delivery_date = null, actual_delivery_date = null,
      remarks = '', dispatched_by = '',
    } = req.body;

    if (!customer_name) return res.status(400).json({ message: 'customer_name is required' });
    if (!dispatch_date) return res.status(400).json({ message: 'dispatch_date is required' });

    // Auto-set actual_delivery_date to today if status flips to Delivered
    // and the caller didn't supply one.
    let finalActualDelivery = actual_delivery_date || null;
    if (status === 'Delivered' && !finalActualDelivery) {
      finalActualDelivery = new Date().toISOString().slice(0, 10);
    }

    const [result] = await db.query(
      `UPDATE ${TABLE} SET
         dispatch_date = ?, sales_invoice_id = ?, invoice_no_snapshot = ?, customer_name = ?, ship_to = ?,
         product_type = ?, qty_dispatched = ?, qty_unit = ?, no_of_packages = ?,
         transporter_name = ?, vehicle_no = ?, lr_no = ?, driver_name = ?, driver_phone = ?,
         freight_charges = ?, freight_paid_by = ?, status = ?, expected_delivery_date = ?, actual_delivery_date = ?,
         remarks = ?, dispatched_by = ?
       WHERE id = ?`,
      [
        dispatch_date, sales_invoice_id || null, invoice_no_snapshot || null, customer_name, ship_to || null,
        product_type === 'Yarn' ? 'Yarn' : 'Fabric', Number(qty_dispatched) || 0, qty_unit || 'Meters', no_of_packages || null,
        transporter_name || null, vehicle_no || null, lr_no || null, driver_name || null, driver_phone || null,
        Number(freight_charges) || 0, validateFreightPaidBy(freight_paid_by), validateStatus(status),
        expected_delivery_date || null, finalActualDelivery,
        remarks || null, dispatched_by || null,
        req.params.id,
      ],
    );

    if (result.affectedRows === 0) return res.status(404).json({ message: 'Dispatch not found' });
    res.json({ message: 'Dispatch updated' });
  } catch (err) {
    console.error('[PUT /dispatches/:id]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// DELETE /:id
// ─────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await schemaReady;
    const [result] = await db.query(`DELETE FROM ${TABLE} WHERE id = ?`, [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Dispatch not found' });
    res.json({ message: 'Dispatch removed' });
  } catch (err) {
    console.error('[DELETE /dispatches/:id]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

module.exports = router;