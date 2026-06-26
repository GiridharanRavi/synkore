const express = require('express');
const router = express.Router();
const db = require('../db/connection');

// CREATE
router.post('/', async (req, res) => {
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
        fabric_weight_gsm || null,
        fabric_width_cm || null,
        texture_grade || 'A',
        color_fastness || 'good',
        shrinkage_percent || null,
        defects_noted || null,
        quality_passed ? 1 : 0,
        check_date || null,
        remarks || null,
      ]
    );

    res.json({ success: true, id: result.insertId });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// GET BY SAMPLE
router.get('/:sampleId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT * FROM quality_checks
       WHERE sample_request_id=?
       ORDER BY created_at DESC`,
      [req.params.sampleId]
    );

    res.json(rows);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/development-process/:id  — fetch one sample request by request_code
router.get('/development-process/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // id is the request_code (e.g. "SY002"), not the numeric DB id
    const [rows] = await db.query(
      'SELECT * FROM sample_requests WHERE request_code = ?',
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/development-process/:id  — update a sample request by request_code
router.put('/development-process/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { request_code, customer_name, agent_name, sample_type,
            fabric_code, fabric_quality, color, quantity_meters,
            customer_comments, status } = req.body;

    await db.query(
      `UPDATE sample_requests SET
        request_code = ?, customer_name = ?, agent_name = ?,
        sample_type = ?, fabric_code = ?, fabric_quality = ?,
        color = ?, quantity_meters = ?, customer_comments = ?, status = ?
       WHERE request_code = ?`,
      [request_code, customer_name, agent_name, sample_type,
       fabric_code, fabric_quality, color, quantity_meters,
       customer_comments, status, id]
    );
    res.json({ message: 'Updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;