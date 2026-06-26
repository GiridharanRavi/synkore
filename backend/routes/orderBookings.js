const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { auth } = require('../middleware/auth');

// ── helpers ──────────────────────────────────────────────────────────────────
const parseItems = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  const t = raw.trim();
  if (!t || t === 'null' || t === '[]') return [];
  try { return JSON.parse(t); } catch { return []; }
};

const parseRow = (row) => {
  if (!row) return row;
  return { ...row, items: parseItems(row.items) };
};

// ── Get actual table columns (cached after first call) ──────────────────────
let _cachedCols = null;
const getTableColumns = async () => {
  if (_cachedCols) return _cachedCols;
  const [rows] = await db.query('SHOW COLUMNS FROM order_bookings');
  _cachedCols = rows.map(r => r.Field);
  console.log('[order_bookings] table columns:', _cachedCols);
  return _cachedCols;
};

// ── Build insert/update payload using ONLY columns that exist in DB ──────────
const buildPayload = (body, tableColumns) => {
  const {
    order_code, sample_request_id, order_date, po_no, po_date,
    customer_name, customer_id,
    customer_address, customer_pincode, customer_state,
    customer_country, customer_gst_no, customer_contact_name,
    delivery_at, delivery_address, delivery_pincode, delivery_state,
    delivery_country, delivery_gst_no, delivery_contact_name,
    order_through, agent_id, agent_name, commission,
    packing_type_id, packing_type,
    confirm_mode, confirm_by, confirm_code,
    expect_delivery, pinning, rate_type, payment_terms,
    freight, transport, certification_type, certificate_no, remarks,
    order_type, quality_type, hsn_code, sort_no, quality,
    delivery_instruction,
    cgst_pct, sgst_pct, igst_pct,
    basic_value, cgst_value, sgst_value, igst_value, net_value,
    items,
  } = body;

  // All possible fields mapped to their values
  const allFields = {
    order_code:            order_code            || null,
    sample_request_id:     sample_request_id     || null,
    order_date:            order_date            || null,
    po_no:                 po_no                 || null,
    po_date:               po_date               || null,
    customer_name:         customer_name         || null,
    customer_id:           customer_id           || null,
    customer_address:      customer_address      || null,
    customer_pincode:      customer_pincode      || null,
    customer_state:        customer_state        || null,
    customer_country:      customer_country      || null,
    customer_gst_no:       customer_gst_no       || null,
    customer_contact_name: customer_contact_name || null,
    delivery_at:           delivery_at           || null,
    delivery_address:      delivery_address      || null,
    delivery_pincode:      delivery_pincode      || null,
    delivery_state:        delivery_state        || null,
    delivery_country:      delivery_country      || null,
    delivery_gst_no:       delivery_gst_no       || null,
    delivery_contact_name: delivery_contact_name || null,
    order_through:         order_through         || null,
    agent_id:              agent_id              || null,
    agent_name:            agent_name            || null,
    commission:            commission            || null,
    packing_type_id:       packing_type_id       || null,
    packing_type:          packing_type          || null,
    confirm_mode:          confirm_mode          || null,
    confirm_by:            confirm_by            || null,
    confirm_code:          confirm_code          || null,
    expect_delivery:       expect_delivery       || null,
    pinning:               pinning               || null,
    rate_type:             rate_type             || null,
    payment_terms:         payment_terms         || null,
    freight:               freight               || null,
    transport:             transport             || null,
    certification_type:    certification_type    || null,
    certificate_no:        certificate_no        || null,
    remarks:               remarks               || null,
    order_type:            order_type            || 'Domestic',
    quality_type:          quality_type          || 'Regular',
    hsn_code:              hsn_code              || null,
    sort_no:               sort_no               || null,
    quality:               quality               || null,
    delivery_instruction:  delivery_instruction  || null,
    cgst_pct:              Number(cgst_pct)      || 0,
    sgst_pct:              Number(sgst_pct)      || 0,
    igst_pct:              Number(igst_pct)      || 0,
    basic_value:           Number(basic_value)   || 0,
    cgst_value:            Number(cgst_value)    || 0,
    sgst_value:            Number(sgst_value)    || 0,
    igst_value:            Number(igst_value)    || 0,
    net_value:             Number(net_value)     || 0,
    items:                 (items && Array.isArray(items) && items.length > 0)
                             ? JSON.stringify(items)
                             : null,
  };

  // Filter to only columns that actually exist in the DB table
  const filtered = {};
  for (const [key, val] of Object.entries(allFields)) {
    if (tableColumns.includes(key)) {
      filtered[key] = val;
    }
  }

  console.log('[buildPayload] using columns:', Object.keys(filtered));
  return filtered;
};

// ======================================================
// GET ALL
// ======================================================
// FIX: Customer Orders is shared internal business data — both admin AND
// employee accounts should see every booking. Only a genuine customer/
// client-portal account (anyone NOT admin/employee) gets scoped to its own
// customer_id. Previously only 'admin' was treated as a staff role, so
// employees fell into the customer-scoped branch, had no customer_id on
// their JWT or in the query string, and got a 400 "customer_id is required".
router.get('/', auth, async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'admin' || req.user.role === 'employee') {
      const [data] = await db.query(`SELECT * FROM order_bookings ORDER BY id DESC`);
      rows = data;
    } else {
      const customerId = req.user.customer_id || req.query.customer_id;
      if (!customerId) return res.status(400).json({ message: 'customer_id is required' });
      const [data] = await db.query(
        `SELECT * FROM order_bookings WHERE customer_id = ? ORDER BY id DESC`,
        [customerId]
      );
      rows = data;
    }
    res.json(rows.map(parseRow));
  } catch (err) {
    console.error('[GET /order-bookings] Error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ======================================================
// GET BY ID
// ======================================================
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM order_bookings WHERE id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Order not found' });
    res.json(parseRow(rows[0]));
  } catch (err) {
    console.error('[GET /order-bookings/:id] Error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ======================================================
// POST — create
// ======================================================
router.post('/', auth, async (req, res) => {
  try {
    const tableColumns = await getTableColumns();
    const payload      = buildPayload(req.body, tableColumns);

    if (!payload.order_code) {
      return res.status(400).json({ message: 'order_code is required' });
    }

    const cols   = Object.keys(payload);
    const vals   = Object.values(payload);
    const marks  = cols.map(() => '?').join(',');
    const sql    = `INSERT INTO order_bookings (${cols.join(',')}) VALUES (${marks})`;

    console.log('[POST] SQL:', sql);
    console.log('[POST] values count:', vals.length);

    const [r] = await db.query(sql, vals);
    console.log('✅ INSERT id:', r.insertId);
    res.status(201).json({ id: r.insertId, message: 'Created' });

  } catch (err) {
    console.error('❌ POST /order-bookings ERROR:', err.message);
    console.error('   SQL state:', err.sqlState, '| code:', err.code);
    res.status(500).json({ message: err.message, code: err.code, sqlState: err.sqlState });
  }
});

// ======================================================
// PUT — update
// ======================================================
router.put('/:id', auth, async (req, res) => {
  try {
    const tableColumns = await getTableColumns();
    const payload      = buildPayload(req.body, tableColumns);

    const sets  = Object.keys(payload).map(k => `${k}=?`).join(',');
    const vals  = [...Object.values(payload), req.params.id];
    const sql   = `UPDATE order_bookings SET ${sets} WHERE id=?`;

    console.log('[PUT] SQL:', sql);
    console.log('[PUT] values count:', vals.length);

    const [result] = await db.query(sql, vals);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }
    console.log('✅ UPDATE id:', req.params.id);
    res.json({ message: 'Updated', id: req.params.id });

  } catch (err) {
    console.error('❌ PUT /order-bookings ERROR:', err.message);
    console.error('   SQL state:', err.sqlState, '| code:', err.code);
    res.status(500).json({ message: err.message, code: err.code, sqlState: err.sqlState });
  }
});

// ======================================================
// DELETE
// ======================================================
router.delete('/:id', auth, async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM order_bookings WHERE id=?',
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }
    console.log('✅ DELETE id:', req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('❌ DELETE /order-bookings ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;