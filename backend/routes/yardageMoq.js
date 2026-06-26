const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

const run = async (sql, params = []) => {
  const [rows] = await db.query(sql, params);
  return rows;
};

// GET /api/yardage-moq?sample_request_id=X
router.get('/', async (req, res) => {
  try {
    const { sample_request_id } = req.query;
    if (!sample_request_id) {
      return res.status(400).json({ message: 'sample_request_id required' });
    }
    const rows = await run(
      `SELECT * FROM yardage_moq_price WHERE sample_request_id = ? ORDER BY id ASC`,
      [sample_request_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /yardage-moq]', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// POST /api/yardage-moq — DO NOT insert moq_yards / price_per_yard (generated columns)
router.post('/', async (req, res) => {
  try {
    const {
      sample_request_id, fabric_code, order_type,
      moq_meters, price_per_meter, currency,
      valid_from, valid_until,
    } = req.body;

    if (!sample_request_id) return res.status(400).json({ message: 'sample_request_id required' });
    if (!moq_meters || isNaN(parseFloat(moq_meters)))
      return res.status(400).json({ message: 'moq_meters required' });
    if (!price_per_meter || isNaN(parseFloat(price_per_meter)))
      return res.status(400).json({ message: 'price_per_meter required' });

    await run(
      `INSERT INTO yardage_moq_price
       (sample_request_id, fabric_code, order_type,
        moq_meters, price_per_meter,
        currency, valid_from, valid_until, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        parseInt(sample_request_id, 10),
        fabric_code  || null,
        order_type   || 'sample',
        parseFloat(moq_meters),
        parseFloat(price_per_meter),
        currency     || 'INR',
        valid_from   || null,
        valid_until  || null,
      ]
    );

    res.status(201).json({ message: 'Yardage & MOQ saved successfully' });
  } catch (err) {
    console.error('[POST /yardage-moq]', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// PUT /api/yardage-moq/:id — DO NOT update moq_yards / price_per_yard (generated columns)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fabric_code, order_type,
      moq_meters, price_per_meter,
      currency, valid_from, valid_until,
    } = req.body;

    const result = await run(
      `UPDATE yardage_moq_price
       SET fabric_code=?, order_type=?,
           moq_meters=?, price_per_meter=?,
           currency=?, valid_from=?, valid_until=?
       WHERE id=?`,
      [
        fabric_code  || null,
        order_type   || 'sample',
        parseFloat(moq_meters    || 0),
        parseFloat(price_per_meter || 0),
        currency     || 'INR',
        valid_from   || null,
        valid_until  || null,
        id,
      ]
    );

    if (result.affectedRows === 0) return res.status(404).json({ message: 'Row not found' });
    res.json({ message: 'Updated successfully' });
  } catch (err) {
    console.error('[PUT /yardage-moq/:id]', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// DELETE /api/yardage-moq/:id
router.delete('/:id', async (req, res) => {
  try {
    await run(`DELETE FROM yardage_moq_price WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error('[DELETE /yardage-moq/:id]', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

module.exports = router;