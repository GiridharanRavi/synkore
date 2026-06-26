const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

const run = async (sql, params = []) => {
  const [rows] = await db.query(sql, params);
  return rows;
};

// ─────────────────────────────────────────────
// ENSURE TABLE
// ─────────────────────────────────────────────

const ensureTable = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS development_analysis (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        sample_request_id INT           NOT NULL,
        style_number      VARCHAR(100)  NULL,
        construction      VARCHAR(255)  NULL,
        blend             VARCHAR(255)  NULL,
        gsm               VARCHAR(50)   NULL,
        weave_type        VARCHAR(100)  NULL,
        analyzed_by       VARCHAR(255)  NULL,
        analysis_date     DATE          NULL,
        remarks           TEXT          NULL,
        created_at        DATETIME      DEFAULT NOW(),
        updated_at        DATETIME      DEFAULT NOW() ON UPDATE NOW()
      )
    `);

    // Patch existing tables: if gsm is DECIMAL, convert it to VARCHAR(50)
    const cols = await run(`SHOW COLUMNS FROM development_analysis LIKE 'gsm'`);
    if (cols.length === 0) {
      await db.query(`
        ALTER TABLE development_analysis
        ADD COLUMN gsm VARCHAR(50) NULL AFTER blend
      `);
      console.log('[dev-analysis] gsm column added');
    } else if (cols[0].Type && cols[0].Type.toLowerCase().includes('decimal')) {
      // Migrate DECIMAL → VARCHAR so range strings like "135-140" can be stored
      await db.query(`
        ALTER TABLE development_analysis
        MODIFY COLUMN gsm VARCHAR(50) NULL
      `);
      console.log('[dev-analysis] gsm column migrated from DECIMAL to VARCHAR(50)');
    }
  } catch (err) {
    console.error('[dev-analysis] ensureTable error:', err.message);
  }
};

ensureTable();

// ─────────────────────────────────────────────
// GET /api/dev-analysis?sample_request_id=X
// ─────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    // ✅ FIX: GET requests carry params in req.query, not req.body
    const { sample_request_id } = req.query;

    if (!sample_request_id) {
      return res.status(400).json({ message: 'sample_request_id required' });
    }

    const rows = await run(
      `SELECT * FROM development_analysis WHERE sample_request_id = ? ORDER BY id ASC`,
      [sample_request_id]
    );

    res.json(rows);
  } catch (err) {
    console.error('[GET dev-analysis]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/dev-analysis  (upsert by sample_request_id)
// ─────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const {
      sample_request_id,
      style_number,
      construction,
      blend,
      gsm,          // ✅ stored as-is (string) — supports "180", "135-140", etc.
      weave_type,
      analyzed_by,
      analysis_date,
      remarks,
    } = req.body;

    if (!sample_request_id) {
      return res.status(400).json({ message: 'sample_request_id required' });
    }

    const existing = await run(
      `SELECT id FROM development_analysis WHERE sample_request_id = ? LIMIT 1`,
      [sample_request_id]
    );

    // ✅ FIX: gsm is VARCHAR — store as trimmed string, not parseFloat
    const gsmVal = (gsm !== undefined && gsm !== null && String(gsm).trim() !== '')
      ? String(gsm).trim()
      : null;

    const vals = [
      style_number   || null,
      construction   || null,
      blend          || null,
      gsmVal,
      weave_type     || null,
      analyzed_by    || null,
      analysis_date  || null,
      remarks        || null,
    ];

    if (existing.length > 0) {
      await run(
        `UPDATE development_analysis
         SET style_number  = ?,
             construction  = ?,
             blend         = ?,
             gsm           = ?,
             weave_type    = ?,
             analyzed_by   = ?,
             analysis_date = ?,
             remarks       = ?
         WHERE sample_request_id = ?`,
        [...vals, sample_request_id]
      );
    } else {
      await run(
        `INSERT INTO development_analysis
           (sample_request_id, style_number, construction, blend,
            gsm, weave_type, analyzed_by, analysis_date, remarks, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [sample_request_id, ...vals]
      );
    }

    res.json({ message: 'Development analysis saved' });
  } catch (err) {
    console.error('[POST dev-analysis]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// PUT /api/dev-analysis/:id
// ─────────────────────────────────────────────

router.put('/:id', async (req, res) => {
  try {
    const {
      style_number,
      construction,
      blend,
      gsm,
      weave_type,
      analyzed_by,
      analysis_date,
      remarks,
    } = req.body;

    const gsmVal = (gsm !== undefined && gsm !== null && String(gsm).trim() !== '')
      ? String(gsm).trim()
      : null;

    const result = await run(
      `UPDATE development_analysis
       SET style_number  = ?,
           construction  = ?,
           blend         = ?,
           gsm           = ?,
           weave_type    = ?,
           analyzed_by   = ?,
           analysis_date = ?,
           remarks       = ?
       WHERE id = ?`,
      [
        style_number   || null,
        construction   || null,
        blend          || null,
        gsmVal,
        weave_type     || null,
        analyzed_by    || null,
        analysis_date  || null,
        remarks        || null,
        req.params.id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Record not found' });
    }

    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('[PUT dev-analysis/:id]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/dev-analysis/:id
// ─────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    await run(`DELETE FROM development_analysis WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[DELETE dev-analysis/:id]', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;