const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try { const [rows] = await db.query('SELECT * FROM outward ORDER BY id DESC'); res.json(rows); }
  catch (err) { res.status(500).json({ message: err.message }); }
});
router.post('/', auth, async (req, res) => {
  try {
    const { lot_no, quantity, destination, outward_date, status } = req.body;
    const [r] = await db.query('INSERT INTO outward (lot_no,quantity,destination,outward_date,status) VALUES (?,?,?,?,?)',
      [lot_no, quantity, destination, outward_date, status || 'pending']);
    res.status(201).json({ id: r.insertId });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
router.put('/:id', auth, async (req, res) => {
  try {
    const { lot_no, quantity, destination, outward_date, status } = req.body;
    await db.query('UPDATE outward SET lot_no=?,quantity=?,destination=?,outward_date=?,status=? WHERE id=?',
      [lot_no, quantity, destination, outward_date, status, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
router.delete('/:id', auth, async (req, res) => {
  try { await db.query('DELETE FROM outward WHERE id=?', [req.params.id]); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ message: err.message }); }
});
module.exports = router;
