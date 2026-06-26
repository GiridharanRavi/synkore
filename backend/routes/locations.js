// routes/locations.js
// Serves VP Tex in-house production locations.
// GET /api/locations?type=inhouse  → list of location records
// GET /api/locations                → all locations

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const { type } = req.query;

    let where  = 'WHERE 1=1';
    const params = [];

    if (type) {
      where += ' AND type = ?';
      params.push(type);
    }

    // Try dedicated locations table first; fall back to a static list if it
    // doesn't exist yet so the frontend never gets a hard 500.
    let rows = [];
    try {
      [rows] = await db.query(
        `SELECT id, name, type, address, is_active
         FROM locations ${where} ORDER BY name`,
        params,
      );
    } catch (tableErr) {
      // Table probably doesn't exist yet — return sensible defaults
      if (tableErr.code === 'ER_NO_SUCH_TABLE') {
        rows = [
          { id: 1, name: 'Main Unit',    type: 'inhouse' },
          { id: 2, name: 'Unit 2',        type: 'inhouse' },
          { id: 3, name: 'Processing Unit', type: 'inhouse' },
        ];
      } else {
        throw tableErr;
      }
    }

    res.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error('[locations] GET error:', err);
    res.status(500).json({ message: 'Failed to fetch locations' });
  }
});

module.exports = router;