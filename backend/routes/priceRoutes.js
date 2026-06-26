const express = require('express');
const router = express.Router();
const db = require('../db/connection');

router.post('/', async (req, res) => {
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

    const total =
      parseFloat(min_quantity_meters) *
      parseFloat(price_per_meter);

    const discount =
      parseFloat(discount_percent) || 0;

    const final_price =
      total - (total * discount / 100);

    const [result] = await db.execute(
      `INSERT INTO fabric_price_list
      (sample_request_id,fabric_code,fabric_quality,color,
      list_type,min_quantity_meters,max_quantity_meters,
      price_per_meter,total_price,discount_percent,
      final_price,currency,remarks)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        sample_request_id,
        fabric_code || null,
        fabric_quality || null,
        color || null,
        list_type || 'sample_meter',
        min_quantity_meters,
        max_quantity_meters || null,
        price_per_meter,
        total.toFixed(2),
        discount,
        final_price.toFixed(2),
        currency || 'INR',
        remarks || null,
      ]
    );

    res.json({
      success: true,
      id: result.insertId,
      total_price: total,
      final_price
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:sampleId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT * FROM fabric_price_list
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