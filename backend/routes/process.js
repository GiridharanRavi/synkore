const express = require('express');
const router  = express.Router();

// ── Fix: try common db file locations ──
// Change this path to match your actual db file:
// Option A: backend/db/index.js   → require('../db')
// Option B: backend/db/db.js      → require('../db/db')
// Option C: backend/db/pool.js    → require('../db/pool')
// Option D: backend/db/connect.js → require('../db/connect')
const db = require('../db/connection');
const { auth } = require('../middleware/auth'); // ← update this if needed

// ─────────────────────────────────────────────
// PROCESS 1 — QUALITY CHECK
// ─────────────────────────────────────────────

router.post('/quality-check', async (req, res) => {
  try {
    const {
      sample_request_id,
      checked_by,
      fabric_weight_gsm,
      fabric_width_cm,
      texture_grade,
      color_fastness,
      shrinkage_percent,
      defects_noted,
      quality_passed,
      check_date,
      remarks,
    } = req.body;

    const [result] = await db.execute(
      `INSERT INTO quality_checks
       (sample_request_id, checked_by, fabric_weight_gsm, fabric_width_cm,
        texture_grade, color_fastness, shrinkage_percent, defects_noted,
        quality_passed, check_date, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sample_request_id,
        checked_by,
        fabric_weight_gsm   || null,
        fabric_width_cm     || null,
        texture_grade       || 'A',
        color_fastness      || 'good',
        shrinkage_percent   || null,
        defects_noted       || null,
        quality_passed ? 1 : 0,
        check_date          || null,
        remarks             || null,
      ]
    );

    res.json({ success: true, id: result.insertId });

  } catch (err) {
    console.error('quality-check error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/quality-check/:sampleId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM quality_checks WHERE sample_request_id = ? ORDER BY created_at DESC',
      [req.params.sampleId]
    );
    res.json(rows);
  } catch (err) {
    console.error('quality-check GET error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// PROCESS 2 — QUANTITY LOG
// ─────────────────────────────────────────────

router.post('/quantity-log', async (req, res) => {
  try {
    const {
      sample_request_id,
      actual_received_meters,
      unit,
      log_date,
      notes,
    } = req.body;

    // Auto-fetch quantity_meters from sample_requests
    const [[sr]] = await db.execute(
      'SELECT quantity_meters FROM sample_requests WHERE id = ?',
      [sample_request_id]
    );

    if (!sr) {
      return res.status(404).json({ message: 'Sample request not found' });
    }

    const [result] = await db.execute(
      `INSERT INTO quantity_logs
       (sample_request_id, fetched_quantity_meters, actual_received_meters, unit, log_date, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        sample_request_id,
        sr.quantity_meters,
        actual_received_meters,
        unit      || 'meters',
        log_date  || null,
        notes     || null,
      ]
    );

    res.json({
      success: true,
      id: result.insertId,
      fetched_quantity_meters: sr.quantity_meters,
    });

  } catch (err) {
    console.error('quantity-log error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/quantity-log/:sampleId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM quantity_logs WHERE sample_request_id = ? ORDER BY created_at DESC',
      [req.params.sampleId]
    );
    res.json(rows);
  } catch (err) {
    console.error('quantity-log GET error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// PROCESS 3 — YARDAGE MOQ
// ─────────────────────────────────────────────

router.post('/yardage-moq', async (req, res) => {
  try {
    const {
      sample_request_id,
      fabric_code,
      order_type,
      moq_meters,
      price_per_meter,
      currency,
      valid_from,
      valid_until,
    } = req.body;

    const [result] = await db.execute(
      `INSERT INTO yardage_moq_price
       (sample_request_id, fabric_code, order_type, moq_meters,
        price_per_meter, currency, valid_from, valid_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sample_request_id,
        fabric_code   || null,
        order_type    || 'sample',
        moq_meters,
        price_per_meter,
        currency      || 'INR',
        valid_from    || null,
        valid_until   || null,
      ]
    );

    res.json({ success: true, id: result.insertId });

  } catch (err) {
    console.error('yardage-moq error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/yardage-moq/:sampleId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM yardage_moq_price WHERE sample_request_id = ? ORDER BY created_at DESC',
      [req.params.sampleId]
    );
    res.json(rows);
  } catch (err) {
    console.error('yardage-moq GET error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// PROCESS 4 — PRICE LIST
// ─────────────────────────────────────────────

router.post('/price-list', async (req, res) => {
  try {
    const {
      sample_request_id,
      fabric_code,
      fabric_quality,
      color,
      list_type,
      min_quantity_meters,
      max_quantity_meters,
      price_per_meter,
      discount_percent,
      currency,
      remarks,
    } = req.body;

    const total       = parseFloat(min_quantity_meters) * parseFloat(price_per_meter);
    const discount    = parseFloat(discount_percent) || 0;
    const final_price = total - (total * discount / 100);

    const [result] = await db.execute(
      `INSERT INTO fabric_price_list
       (sample_request_id, fabric_code, fabric_quality, color, list_type,
        min_quantity_meters, max_quantity_meters, price_per_meter,
        total_price, discount_percent, final_price, currency, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sample_request_id,
        fabric_code         || null,
        fabric_quality      || null,
        color               || null,
        list_type           || 'sample_meter',
        min_quantity_meters,
        max_quantity_meters || null,
        price_per_meter,
        total.toFixed(2),
        discount,
        final_price.toFixed(2),
        currency            || 'INR',
        remarks             || null,
      ]
    );

    res.json({ success: true, id: result.insertId, total_price: total, final_price });

  } catch (err) {
    console.error('price-list error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/price-list/:sampleId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM fabric_price_list WHERE sample_request_id = ? ORDER BY list_type, created_at DESC',
      [req.params.sampleId]
    );
    res.json(rows);
  } catch (err) {
    console.error('price-list GET error:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;