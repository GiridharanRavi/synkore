const express = require('express');
const router = express.Router();
const db = require('../db/connection');

router.post('/', async (req, res) => {
  try {
    const {
      sample_request_id,
      actual_received_meters,
      unit,
      log_date,
      notes,
    } = req.body;

    const [[sr]] = await db.execute(
      'SELECT quantity_meters FROM sample_requests WHERE id=?',
      [sample_request_id]
    );

    if (!sr) {
      return res.status(404).json({
        message: 'Sample request not found'
      });
    }

    const [result] = await db.execute(
      `INSERT INTO quantity_logs
      (sample_request_id,fetched_quantity_meters,
      actual_received_meters,unit,log_date,notes)
      VALUES (?,?,?,?,?,?)`,
      [
        sample_request_id,
        sr.quantity_meters,
        actual_received_meters,
        unit || 'meters',
        log_date || null,
        notes || null,
      ]
    );

    res.json({
      success: true,
      id: result.insertId,
      fetched_quantity_meters: sr.quantity_meters
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:sampleId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT * FROM quantity_logs
       WHERE sample_request_id=?
       ORDER BY created_at DESC`,
      [req.params.sampleId]
    );

    res.json(rows);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;