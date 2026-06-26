const express = require('express');
const router = express.Router();
const db = require('../db/connection');

router.post('/', async (req, res) => {
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
      (sample_request_id,fabric_code,order_type,
      moq_meters,price_per_meter,currency,
      valid_from,valid_until)
      VALUES (?,?,?,?,?,?,?,?)`,
      [
        sample_request_id,
        fabric_code || null,
        order_type || 'sample',
        moq_meters,
        price_per_meter,
        currency || 'INR',
        valid_from || null,
        valid_until || null,
      ]
    );

    res.json({
      success: true,
      id: result.insertId
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:sampleId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT * FROM yardage_moq_price
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