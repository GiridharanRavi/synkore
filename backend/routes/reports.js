const express = require('express');
const router = express.Router();
const db = require('../db/connection');

// =====================================================
// QUALITY CHECKS
// GET /api/reports/quality-checks?sample_request_id=1
// =====================================================
router.get('/quality-checks', async (req, res) => {
  const { sample_request_id } = req.query;

  if (!sample_request_id) {
    return res.json([]);
  }

  try {
    const [rows] = await db.query(
      `SELECT * FROM quality_checks
       WHERE sample_request_id = ?`,
      [sample_request_id]
    );

    res.json(rows);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: 'Failed to fetch quality checks'
    });
  }
});


// =====================================================
// QUANTITY LOGS
// GET /api/reports/quantity-logs?sample_request_id=1
// =====================================================
router.get('/quantity-logs', async (req, res) => {
  const { sample_request_id } = req.query;

  if (!sample_request_id) {
    return res.json([]);
  }

  try {
    const [rows] = await db.query(
      `SELECT * FROM quantity_logs
       WHERE sample_request_id = ?`,
      [sample_request_id]
    );

    res.json(rows);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: 'Failed to fetch quantity logs'
    });
  }
});


// =====================================================
// YARDAGE MOQ
// GET /api/reports/yardage-moq?sample_request_id=1
// =====================================================
router.get('/yardage-moq', async (req, res) => {
  const { sample_request_id } = req.query;

  if (!sample_request_id) {
    return res.json([]);
  }

  try {
    const [rows] = await db.query(
      `SELECT * FROM yardage_moq
       WHERE sample_request_id = ?`,
      [sample_request_id]
    );

    res.json(rows);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: 'Failed to fetch yardage MOQ'
    });
  }
});


// =====================================================
// PRICE LIST
// GET /api/reports/price-list?sample_request_id=1
// =====================================================
router.get('/price-list', async (req, res) => {
  const { sample_request_id } = req.query;

  if (!sample_request_id) {
    return res.json([]);
  }

  try {
    const [rows] = await db.query(
      `SELECT * FROM price_list
       WHERE sample_request_id = ?`,
      [sample_request_id]
    );

    res.json(rows);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: 'Failed to fetch price list'
    });
  }
});

module.exports = router;