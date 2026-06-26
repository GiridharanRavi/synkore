// ============================================================
// routes/developmentProcess.js
// Mount:
//   app.use('/api/development-process', require('./routes/developmentProcess'));
//
// 4-step pipeline
//   P1  Development Analysis
//   P2  Yardage & MOQ
//   P3  Price List
//   P4  Chat
// ============================================================

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

const run = async (sql, params = []) => {
  const [rows] = await db.query(sql, params);
  return rows;
};

// ═════════════════════════════════════════════════════════════
// P1 — DEVELOPMENT ANALYSIS
// GET  /api/development-process/dev-analysis?sample_request_id=X
// POST /api/development-process/dev-analysis  (upsert)
// PUT  /api/development-process/dev-analysis/:id
// DEL  /api/development-process/dev-analysis/:id
// NOTE: All static paths MUST be declared before /:code
// ═════════════════════════════════════════════════════════════

router.get('/dev-analysis', async (req, res) => {
  try {
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

router.post('/dev-analysis', async (req, res) => {
  try {
    const {
      sample_request_id,
      style_number, construction, blend,
      gsm, weave_type,
      analyzed_by, analysis_date, remarks,
    } = req.body;

    if (!sample_request_id) {
      return res.status(400).json({ message: 'sample_request_id required' });
    }

    const existing = await run(
      `SELECT id FROM development_analysis WHERE sample_request_id = ? LIMIT 1`,
      [sample_request_id]
    );

    if (existing.length > 0) {
      await run(
        `UPDATE development_analysis
         SET style_number=?, construction=?, blend=?,
             gsm=?, weave_type=?,
             analyzed_by=?, analysis_date=?, remarks=?
         WHERE sample_request_id=?`,
        [
          style_number  || null,
          construction  || null,
          blend         || null,
          gsm           || null,
          weave_type    || null,
          analyzed_by   || null,
          analysis_date || null,
          remarks       || null,
          sample_request_id,
        ]
      );
    } else {
      await run(
        `INSERT INTO development_analysis
         (sample_request_id, style_number, construction, blend,
          gsm, weave_type,
          analyzed_by, analysis_date, remarks, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,NOW())`,
        [
          sample_request_id,
          style_number  || null,
          construction  || null,
          blend         || null,
          gsm           || null,
          weave_type    || null,
          analyzed_by   || null,
          analysis_date || null,
          remarks       || null,
        ]
      );
    }
    res.json({ message: 'Development analysis saved' });
  } catch (err) {
    console.error('[POST dev-analysis]', err);
    res.status(500).json({ message: err.message });
  }
});

router.put('/dev-analysis/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      style_number, construction, blend,
      gsm, weave_type,
      analyzed_by, analysis_date, remarks,
    } = req.body;

    const result = await run(
      `UPDATE development_analysis
       SET style_number=?, construction=?, blend=?,
           gsm=?, weave_type=?,
           analyzed_by=?, analysis_date=?, remarks=?
       WHERE id=?`,
      [
        style_number  || null,
        construction  || null,
        blend         || null,
        gsm           || null,
        weave_type    || null,
        analyzed_by   || null,
        analysis_date || null,
        remarks       || null,
        id,
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Record not found' });
    }
    res.json({ message: 'Development analysis updated' });
  } catch (err) {
    console.error('[PUT dev-analysis/:id]', err);
    res.status(500).json({ message: err.message });
  }
});

router.delete('/dev-analysis/:id', async (req, res) => {
  try {
    await run(`DELETE FROM development_analysis WHERE id=?`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[DELETE dev-analysis/:id]', err);
    res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
// P2 — YARDAGE & MOQ
// GET  /api/development-process/yardage-moq?sample_request_id=X
// PUT  /api/development-process/yardage-moq/:id
// DEL  /api/development-process/yardage-moq/:id
// ═════════════════════════════════════════════════════════════

router.get('/yardage-moq', async (req, res) => {
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
    console.error('[GET yardage-moq]', err);
    res.status(500).json({ message: err.message });
  }
});

router.put('/yardage-moq/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fabric_code, order_type, moq_meters, moq_yards,
      price_per_meter, price_per_yard, currency,
      valid_from, valid_until,
    } = req.body;

    const result = await run(
      `UPDATE yardage_moq_price
       SET fabric_code=?, order_type=?, moq_meters=?, moq_yards=?,
           price_per_meter=?, price_per_yard=?, currency=?,
           valid_from=?, valid_until=?
       WHERE id=?`,
      [
        fabric_code, order_type, moq_meters, moq_yards,
        price_per_meter, price_per_yard, currency,
        valid_from || null, valid_until || null, id,
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Row not found' });
    }
    res.json({ message: 'Yardage row updated' });
  } catch (err) {
    console.error('[PUT yardage-moq/:id]', err);
    res.status(500).json({ message: err.message });
  }
});

router.delete('/yardage-moq/:id', async (req, res) => {
  try {
    await run(`DELETE FROM yardage_moq_price WHERE id=?`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[DELETE yardage-moq/:id]', err);
    res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
// P3 — PRICE LIST
// GET  /api/development-process/price-lists?sample_request_id=X
// PUT  /api/development-process/price-lists/:id
// DEL  /api/development-process/price-lists/:id
// ═════════════════════════════════════════════════════════════

router.get('/price-lists', async (req, res) => {
  try {
    const { sample_request_id } = req.query;
    if (!sample_request_id) {
      return res.status(400).json({ message: 'sample_request_id required' });
    }
    const rows = await run(
      `SELECT * FROM fabric_price_list WHERE sample_request_id = ? ORDER BY id ASC`,
      [sample_request_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET price-lists]', err);
    res.status(500).json({ message: err.message });
  }
});

router.put('/price-lists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fabric_code, fabric_quality, color, list_type,
      min_quantity_meters, max_quantity_meters,
      price_per_meter, discount_percent, currency, remarks,
    } = req.body;

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
      [
        fabric_code, fabric_quality, color, list_type,
        min_quantity_meters, max_quantity_meters,
        ppm, total, disc, final, currency, remarks, id,
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Row not found' });
    }
    res.json({ message: 'Price entry updated' });
  } catch (err) {
    console.error('[PUT price-lists/:id]', err);
    res.status(500).json({ message: err.message });
  }
});

router.delete('/price-lists/:id', async (req, res) => {
  try {
    await run(`DELETE FROM fabric_price_list WHERE id=?`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[DELETE price-lists/:id]', err);
    res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
// GET /api/development-process/:code
// Full pipeline data by request_code
// NOTE: Keep ALL static routes above this line
// ═════════════════════════════════════════════════════════════

router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const sampleRows = await run(
      `SELECT * FROM sample_requests WHERE request_code = ?`,
      [code]
    );
    const sr = sampleRows[0];
    if (!sr) {
      return res.status(404).json({ message: `No record found for "${code}"` });
    }

    const srId = sr.id;

    const daRows   = await run(
      `SELECT * FROM development_analysis   WHERE sample_request_id = ? ORDER BY id DESC LIMIT 1`, [srId]
    );
    const ymRows   = await run(
      `SELECT * FROM yardage_moq_price      WHERE sample_request_id = ? ORDER BY id ASC`,  [srId]
    );
    const plRows   = await run(
      `SELECT * FROM fabric_price_list      WHERE sample_request_id = ? ORDER BY id ASC`,  [srId]
    );
    const chatRows = await run(
      `SELECT id, sender, message, is_read, created_at
       FROM chat_messages WHERE sample_request_id = ? ORDER BY id ASC`,                    [srId]
    );

    res.json({
      sampleRequest: sr          || {},
      devAnalysis:   daRows[0]   || {},
      yardageRows:   ymRows      || [],
      priceRows:     plRows      || [],
      chatMessages:  chatRows    || [],
    });
  } catch (err) {
    console.error('[GET /development-process/:code]', err);
    res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
// PUT /api/development-process/:code/request-info
// ═════════════════════════════════════════════════════════════

router.put('/:code/request-info', async (req, res) => {
  try {
    const { code } = req.params;
    const {
      customer_name,
      customer_id,        // ← ADDED
      agent_name,
      sample_type,
      fabric_code,
      fabric_quality,
      color,
      quantity_meters,
      status,
      customer_comments,
    } = req.body;

    const result = await run(
      `UPDATE sample_requests
       SET customer_name=?, customer_id=?, agent_name=?, sample_type=?, fabric_code=?,
           fabric_quality=?, color=?, quantity_meters=?, status=?,
           customer_comments=?, updated_at=NOW()
       WHERE request_code=?`,
      [
        customer_name,
        customer_id || null,  // ← ADDED
        agent_name,
        sample_type,
        fabric_code,
        fabric_quality,
        color,
        quantity_meters,
        status,
        customer_comments,
        code,
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Sample request not found' });
    }
    res.json({ message: 'Request info updated' });
  } catch (err) {
    console.error('[PUT request-info]', err);
    res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
// PUT /api/development-process/:code/dev-analysis (code-based upsert)
// ═════════════════════════════════════════════════════════════

router.put('/:code/dev-analysis', async (req, res) => {
  try {
    const { code } = req.params;
    const {
      style_number, construction, blend,
      gsm, weave_type,
      analyzed_by, analysis_date, remarks,
    } = req.body;

    const sampleRows = await run(
      `SELECT id FROM sample_requests WHERE request_code=?`, [code]
    );
    const sr = sampleRows[0];
    if (!sr) return res.status(404).json({ message: 'Sample request not found' });
    const srId = sr.id;

    const existing = await run(
      `SELECT id FROM development_analysis WHERE sample_request_id=? LIMIT 1`, [srId]
    );

    if (existing.length > 0) {
      await run(
        `UPDATE development_analysis
         SET style_number=?, construction=?, blend=?,
             gsm=?, weave_type=?,
             analyzed_by=?, analysis_date=?, remarks=?
         WHERE sample_request_id=?`,
        [
          style_number  || null,
          construction  || null,
          blend         || null,
          gsm           || null,
          weave_type    || null,
          analyzed_by   || null,
          analysis_date || null,
          remarks       || null,
          srId,
        ]
      );
    } else {
      await run(
        `INSERT INTO development_analysis
         (sample_request_id, style_number, construction, blend,
          gsm, weave_type,
          analyzed_by, analysis_date, remarks, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,NOW())`,
        [
          srId,
          style_number  || null,
          construction  || null,
          blend         || null,
          gsm           || null,
          weave_type    || null,
          analyzed_by   || null,
          analysis_date || null,
          remarks       || null,
        ]
      );
    }
    res.json({ message: 'Development analysis saved' });
  } catch (err) {
    console.error('[PUT dev-analysis]', err);
    res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
// PUT /api/development-process/:code/yardage-moq (INSERT new row)
// ═════════════════════════════════════════════════════════════

router.put('/:code/yardage-moq', async (req, res) => {
  try {
    const { code } = req.params;
    const {
      fabric_code, order_type, moq_meters, moq_yards,
      price_per_meter, price_per_yard, currency,
      valid_from, valid_until,
    } = req.body;

    const sampleRows = await run(
      `SELECT id FROM sample_requests WHERE request_code=?`, [code]
    );
    const sr = sampleRows[0];
    if (!sr) return res.status(404).json({ message: 'Sample request not found' });
    const srId = sr.id;

    await run(
      `INSERT INTO yardage_moq_price
       (sample_request_id, fabric_code, order_type, moq_meters, moq_yards,
        price_per_meter, price_per_yard, currency, valid_from, valid_until, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,NOW())`,
      [
        srId, fabric_code, order_type, moq_meters, moq_yards,
        price_per_meter, price_per_yard, currency,
        valid_from || null, valid_until || null,
      ]
    );
    res.json({ message: 'Yardage & MOQ saved' });
  } catch (err) {
    console.error('[PUT yardage-moq]', err);
    res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
// PUT /api/development-process/:code/price-list (INSERT new row)
// ═════════════════════════════════════════════════════════════

router.put('/:code/price-list', async (req, res) => {
  try {
    const { code } = req.params;
    const {
      fabric_code, fabric_quality, color, list_type,
      min_quantity_meters, max_quantity_meters,
      price_per_meter, discount_percent, currency, remarks,
    } = req.body;

    const sampleRows = await run(
      `SELECT id FROM sample_requests WHERE request_code=?`, [code]
    );
    const sr = sampleRows[0];
    if (!sr) return res.status(404).json({ message: 'Sample request not found' });
    const srId = sr.id;

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
      [
        srId, fabric_code, fabric_quality, color, list_type,
        min_quantity_meters, max_quantity_meters, ppm,
        total, disc, final, currency, remarks,
      ]
    );
    res.json({ message: 'Price list saved' });
  } catch (err) {
    console.error('[PUT price-list]', err);
    res.status(500).json({ message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
// P4 — CHAT
// ═════════════════════════════════════════════════════════════

router.post('/:code/chat', async (req, res) => {
  try {
    const { code } = req.params;
    const { sender = 'admin', message, user_id = null } = req.body;

    const sampleRows = await run(
      `SELECT id FROM sample_requests WHERE request_code=?`, [code]
    );
    const sr = sampleRows[0];
    if (!sr) return res.status(404).json({ message: 'Sample request not found' });

    if (!message?.trim()) {
      return res.status(400).json({ message: 'Message cannot be empty' });
    }

    await run(
      `INSERT INTO chat_messages
       (sample_request_id, user_id, sender, message, is_read, created_at)
       VALUES (?,?,?,?,0,NOW())`,
      [sr.id, user_id, sender, message.trim()]
    );
    res.status(201).json({ message: 'Message sent' });
  } catch (err) {
    console.error('[POST chat]', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/:code/chat', async (req, res) => {
  try {
    const sampleRows = await run(
      `SELECT id FROM sample_requests WHERE request_code=?`, [req.params.code]
    );
    const sr = sampleRows[0];
    if (!sr) return res.status(404).json({ message: 'Sample request not found' });

    const rows = await run(
      `SELECT id, sender, message, is_read, created_at
       FROM chat_messages WHERE sample_request_id=? ORDER BY id ASC`,
      [sr.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET chat]', err);
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:code/chat/:msgId/read', async (req, res) => {
  try {
    await run(`UPDATE chat_messages SET is_read=1 WHERE id=?`, [req.params.msgId]);
    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('[PATCH chat read]', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;