const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const run = async (sql, params = []) => { const [rows] = await db.query(sql, params); return rows; };

// GET /api/price-lists?sample_request_id=X
router.get('/', async (req, res) => {
  try {
    const { sample_request_id } = req.query;
    if (!sample_request_id) return res.status(400).json({ message: 'sample_request_id required' });
    const rows = await run(
      `SELECT * FROM fabric_price_list WHERE sample_request_id = ? ORDER BY id ASC`,
      [sample_request_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/price-lists  (insert new row)
router.post('/', async (req, res) => {
  try {
    const { sample_request_id, fabric_code, fabric_quality, color, list_type,
      min_quantity_meters, max_quantity_meters, price_per_meter,
      discount_percent, currency, remarks } = req.body;

    if (!sample_request_id) return res.status(400).json({ message: 'sample_request_id required' });

    const ppm   = parseFloat(price_per_meter    || 0);
    const qty   = parseFloat(min_quantity_meters || 0);
    const disc  = parseFloat(discount_percent    || 0);
    const total = (ppm * qty).toFixed(2);
    const final = (ppm * qty * (1 - disc / 100)).toFixed(2);

    await run(
      `INSERT INTO fabric_price_list
       (sample_request_id, fabric_code, fabric_quality, color, list_type,
        min_quantity_meters, max_quantity_meters, price_per_meter,
        total_price, discount_percent, final_price, currency, remarks, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [sample_request_id, fabric_code, fabric_quality, color, list_type,
       min_quantity_meters, max_quantity_meters||null, ppm,
       total, disc, final, currency, remarks||null]
    );
    res.status(201).json({ message: 'Price list entry saved' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/price-lists/:id
router.put('/:id', async (req, res) => {
  try {
    const { fabric_code, fabric_quality, color, list_type,
      min_quantity_meters, max_quantity_meters, price_per_meter,
      discount_percent, currency, remarks } = req.body;

    const ppm   = parseFloat(price_per_meter    || 0);
    const qty   = parseFloat(min_quantity_meters || 0);
    const disc  = parseFloat(discount_percent    || 0);
    const total = (ppm * qty).toFixed(2);
    const final = (ppm * qty * (1 - disc / 100)).toFixed(2);

    const result = await run(
      `UPDATE fabric_price_list
       SET fabric_code=?, fabric_quality=?, color=?, list_type=?,
           min_quantity_meters=?, max_quantity_meters=?,
           price_per_meter=?, total_price=?, discount_percent=?,
           final_price=?, currency=?, remarks=?
       WHERE id=?`,
      [fabric_code, fabric_quality, color, list_type,
       min_quantity_meters, max_quantity_meters||null,
       ppm, total, disc, final, currency, remarks||null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Row not found' });
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/price-lists/:id
router.delete('/:id', async (req, res) => {
  try {
    await run(`DELETE FROM fabric_price_list WHERE id=?`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;






