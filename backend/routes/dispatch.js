const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try { const [rows] = await db.query('SELECT * FROM dispatch ORDER BY id DESC'); res.json(rows); }
  catch (err) { res.status(500).json({ message: err.message }); }
});
router.post('/', auth, async (req, res) => {
  try {
    const { lot_no, quantity, dispatch_date, destination, status } = req.body;
    const [r] = await db.query('INSERT INTO dispatch (lot_no,quantity,dispatch_date,destination,status) VALUES (?,?,?,?,?)',
      [lot_no, quantity, dispatch_date, destination, status || 'pending']);
    res.status(201).json({ id: r.insertId });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
router.put('/:id', auth, async (req, res) => {
  try {
    const { lot_no, quantity, dispatch_date, destination, status } = req.body;
    await db.query('UPDATE dispatch SET lot_no=?,quantity=?,dispatch_date=?,destination=?,status=? WHERE id=?',
      [lot_no, quantity, dispatch_date, destination, status, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
router.delete('/:id', auth, async (req, res) => {
  try { await db.query('DELETE FROM dispatch WHERE id=?', [req.params.id]); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ message: err.message }); }
});
module.exports = router;
