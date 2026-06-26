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

// GET /api/production-plans/order/:orderNo
// ── Fetches authoritative order data from order_bookings ─────────────────────
// ── COLLATE fix prevents "Illegal mix of collations" 500 error ───────────────
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

    const selectCols = [
      'id', 'rec_no', 'rec_date', 'order_type', 'order_no',
      hasCustomerName ? 'customer_name' : 'NULL AS customer_name',
      'order_sort_no', 'constn_for_production', 'purchase_qty',
      'purchase_special_instruction',
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
      customer_name = '', confirmed_by = '',   // ← confirmed_by destructured
      constn_for_production = null, order_quantity = null,
      allocated_qty = 0, stock_special_instruction = null,
      production_qty = 0, inhouse_prod_qty = 0, vendor_prod_qty = 0,
      prod_special_instruction = null,
      purchase_qty = 0, purchase_special_instruction = null,
      order_links = '[]',
    } = req.body;

    const cols = await getColumns();
    const hasCustomerName = cols.has('customer_name');
    const hasConfirmedBy  = cols.has('confirmed_by');

    let insertSQL, insertVals;

    if (hasCustomerName && hasConfirmedBy) {
      // ── Full schema: customer_name + confirmed_by both present ────────────
      insertSQL = `INSERT INTO production_plans
        (rec_no, rec_date, order_type, order_no, order_date, order_sort_no,
         customer_name, confirmed_by, constn_for_production, order_quantity,
         allocated_qty, stock_special_instruction,
         production_qty, inhouse_prod_qty, vendor_prod_qty, prod_special_instruction,
         purchase_qty, purchase_special_instruction)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
      insertVals = [
        recNo, recDate, order_type, order_no,
        toDateOnly(order_date),
        order_sort_no || null,
        customer_name || null,
        confirmed_by  || null,           // ← saved to DB
        constn_for_production || null,
        order_quantity ? Number(order_quantity) : null,
        Number(allocated_qty) || 0,
        stock_special_instruction || null,
        Number(production_qty) || 0,
        Number(inhouse_prod_qty) || 0,
        Number(vendor_prod_qty) || 0,
        prod_special_instruction || null,
        Number(purchase_qty) || 0,
        purchase_special_instruction || null,
      ];
    } else if (hasCustomerName) {
      // ── customer_name present but no confirmed_by column ──────────────────
      insertSQL = `INSERT INTO production_plans
        (rec_no, rec_date, order_type, order_no, order_date, order_sort_no,
         customer_name, constn_for_production, order_quantity,
         allocated_qty, stock_special_instruction,
         production_qty, inhouse_prod_qty, vendor_prod_qty, prod_special_instruction,
         purchase_qty, purchase_special_instruction)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
      insertVals = [
        recNo, recDate, order_type, order_no,
        toDateOnly(order_date),
        order_sort_no || null,
        customer_name || null,
        constn_for_production || null,
        order_quantity ? Number(order_quantity) : null,
        Number(allocated_qty) || 0,
        stock_special_instruction || null,
        Number(production_qty) || 0,
        Number(inhouse_prod_qty) || 0,
        Number(vendor_prod_qty) || 0,
        prod_special_instruction || null,
        Number(purchase_qty) || 0,
        purchase_special_instruction || null,
      ];
    } else {
      // ── Minimal schema fallback ───────────────────────────────────────────
      insertSQL = `INSERT INTO production_plans
        (rec_no, rec_date, order_type, order_no, order_date, order_sort_no,
         constn_for_production, order_quantity,
         allocated_qty, stock_special_instruction,
         production_qty, inhouse_prod_qty, vendor_prod_qty, prod_special_instruction,
         purchase_qty, purchase_special_instruction)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
      insertVals = [
        recNo, recDate, order_type, order_no,
        toDateOnly(order_date),
        order_sort_no || null,
        constn_for_production || null,
        order_quantity ? Number(order_quantity) : null,
        Number(allocated_qty) || 0,
        stock_special_instruction || null,
        Number(production_qty) || 0,
        Number(inhouse_prod_qty) || 0,
        Number(vendor_prod_qty) || 0,
        prod_special_instruction || null,
        Number(purchase_qty) || 0,
        purchase_special_instruction || null,
      ];
    }

    const [result] = await conn.query(insertSQL, insertVals);
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
      customer_name = '', confirmed_by = '',   // ← confirmed_by destructured
      constn_for_production = null, order_quantity = null,
      allocated_qty = 0, stock_special_instruction = null,
      production_qty = 0, inhouse_prod_qty = 0, vendor_prod_qty = 0,
      prod_special_instruction = null,
      purchase_qty = 0, purchase_special_instruction = null,
      order_links = '[]', deleted_link_ids = '[]',
    } = req.body;

    const cols = await getColumns();
    const hasCustomerName = cols.has('customer_name');
    const hasConfirmedBy  = cols.has('confirmed_by');

    let updateSQL, updateVals;

    if (hasCustomerName && hasConfirmedBy) {
      // ── Full schema: customer_name + confirmed_by both present ────────────
      updateSQL = `UPDATE production_plans SET
        order_type=?, order_no=?, order_date=?, order_sort_no=?,
        customer_name=?, confirmed_by=?,
        constn_for_production=?, order_quantity=?,
        allocated_qty=?, stock_special_instruction=?,
        production_qty=?, inhouse_prod_qty=?, vendor_prod_qty=?,
        prod_special_instruction=?,
        purchase_qty=?, purchase_special_instruction=?
       WHERE id=?`;
      updateVals = [
        order_type, order_no,
        toDateOnly(order_date),
        order_sort_no || null,
        customer_name || null,
        confirmed_by  || null,           // ← saved to DB
        constn_for_production || null,
        order_quantity ? Number(order_quantity) : null,
        Number(allocated_qty) || 0,
        stock_special_instruction || null,
        Number(production_qty) || 0,
        Number(inhouse_prod_qty) || 0,
        Number(vendor_prod_qty) || 0,
        prod_special_instruction || null,
        Number(purchase_qty) || 0,
        purchase_special_instruction || null,
        id,
      ];
    } else if (hasCustomerName) {
      // ── customer_name present but no confirmed_by column ──────────────────
      updateSQL = `UPDATE production_plans SET
        order_type=?, order_no=?, order_date=?, order_sort_no=?,
        customer_name=?,
        constn_for_production=?, order_quantity=?,
        allocated_qty=?, stock_special_instruction=?,
        production_qty=?, inhouse_prod_qty=?, vendor_prod_qty=?,
        prod_special_instruction=?,
        purchase_qty=?, purchase_special_instruction=?
       WHERE id=?`;
      updateVals = [
        order_type, order_no,
        toDateOnly(order_date),
        order_sort_no || null,
        customer_name || null,
        constn_for_production || null,
        order_quantity ? Number(order_quantity) : null,
        Number(allocated_qty) || 0,
        stock_special_instruction || null,
        Number(production_qty) || 0,
        Number(inhouse_prod_qty) || 0,
        Number(vendor_prod_qty) || 0,
        prod_special_instruction || null,
        Number(purchase_qty) || 0,
        purchase_special_instruction || null,
        id,
      ];
    } else {
      // ── Minimal schema fallback ───────────────────────────────────────────
      updateSQL = `UPDATE production_plans SET
        order_type=?, order_no=?, order_date=?, order_sort_no=?,
        constn_for_production=?, order_quantity=?,
        allocated_qty=?, stock_special_instruction=?,
        production_qty=?, inhouse_prod_qty=?, vendor_prod_qty=?,
        prod_special_instruction=?,
        purchase_qty=?, purchase_special_instruction=?
       WHERE id=?`;
      updateVals = [
        order_type, order_no,
        toDateOnly(order_date),
        order_sort_no || null,
        constn_for_production || null,
        order_quantity ? Number(order_quantity) : null,
        Number(allocated_qty) || 0,
        stock_special_instruction || null,
        Number(production_qty) || 0,
        Number(inhouse_prod_qty) || 0,
        Number(vendor_prod_qty) || 0,
        prod_special_instruction || null,
        Number(purchase_qty) || 0,
        purchase_special_instruction || null,
        id,
      ];
    }

    await conn.query(updateSQL, updateVals);

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