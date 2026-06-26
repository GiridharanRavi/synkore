const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const safeCount = async (query) => {
      try {
        const [[row]] = await db.query(query);
        return row?.count ?? 0;
      } catch {
        return 0;
      }
    };

    const [
      inward,
      dyeing,
      dispatch,
      orders,
      samples,
      pendingInward,
      jobWork,
      outward,
    ] = await Promise.all([
      safeCount('SELECT COUNT(*) as count FROM inward'),
      safeCount('SELECT COUNT(*) as count FROM dyeing'),
      safeCount('SELECT COUNT(*) as count FROM dispatch'),
      safeCount('SELECT COUNT(*) as count FROM order_bookings'),
      safeCount('SELECT COUNT(*) as count FROM sample_requests'),
      safeCount("SELECT COUNT(*) as count FROM inward WHERE status = 'pending'"),
      safeCount('SELECT COUNT(*) as count FROM job_work'),
      safeCount('SELECT COUNT(*) as count FROM outward'),
    ]);

    res.json({
      inward,
      dyeing,
      dispatch,
      orders,
      samples,
      pendingInward,
      jobWork,
      outward,
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;