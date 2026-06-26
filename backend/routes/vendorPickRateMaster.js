// routes/vendorPickRateMaster.js
const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// GET /api/vendor-pick-rate-master?sort_no=52
router.get('/', async (req, res) => {
  try {
    const { sort_no } = req.query;

    if (!sort_no) {
      return res.status(400).json({ message: 'sort_no query param is required' });
    }

    // Try exact match first, then loose LIKE match as fallback
    const [rows] = await db.query(
      `SELECT * FROM vendor_pick_rate_master WHERE sort_no = ? LIMIT 1`,
      [sort_no]
    );

    if (!rows.length) {
      // Return 200 with empty array so the frontend warning logic works correctly
      // (a 404 causes authFetch to return the response, but the frontend checks
      //  for a record — returning [] lets it show the "enter manually" warning)
      return res.status(200).json([]);
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('[vendorPickRateMaster]', err);
    res.status(500).json({ message: 'Failed to fetch pick rate' });
  }
});

module.exports = router;