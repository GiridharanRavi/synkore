const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try { const [rows] = await db.query('SELECT * FROM dyeing ORDER BY id DESC'); res.json(rows); }
  catch (err) { res.status(500).json({ message: err.message }); }
});
router.post('/', auth, async (req, res) => {
  try {
    const { inward_id, color, process, start_date, end_date, status } = req.body;
    const [r] = await db.query('INSERT INTO dyeing (inward_id,color,process,start_date,end_date,status) VALUES (?,?,?,?,?,?)',
      [inward_id, color, process, start_date, end_date, status || 'in-process']);
    res.status(201).json({ id: r.insertId });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
router.put('/:id', auth, async (req, res) => {
  try {
    const { inward_id, color, process, start_date, end_date, status } = req.body;
    await db.query('UPDATE dyeing SET inward_id=?,color=?,process=?,start_date=?,end_date=?,status=? WHERE id=?',
      [inward_id, color, process, start_date, end_date, status, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
router.delete('/:id', auth, async (req, res) => {
  try { await db.query('DELETE FROM dyeing WHERE id=?', [req.params.id]); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ message: err.message }); }
});
module.exports = router;
