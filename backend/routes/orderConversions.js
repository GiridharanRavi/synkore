const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
 
const run = async (sql, params = []) => {
  const [rows] = await db.query(sql, params);
  return rows;
};
 
// ═══════════════════════════════════════════════
// ORDER CONVERSIONS
// ═══════════════════════════════════════════════
 
// POST /api/order-conversions
// Body: { sample_request_id, request_code, customer_name, customer_id,
//         agent_name, fabric_code, fabric_quality, color,
//         quantity_meters, converted_by, notes }
router.post('/', async (req, res) => {
  try {
    const {
      sample_request_id, request_code, customer_name, customer_id,
      agent_name, fabric_code, fabric_quality, color,
      quantity_meters, converted_by, notes,
    } = req.body;
 
    if (!sample_request_id || !request_code) {
      return res.status(400).json({ message: 'sample_request_id and request_code are required' });
    }
 
    // Insert conversion record
    const result = await run(
      `INSERT INTO order_conversions
       (sample_request_id, request_code, customer_name, customer_id,
        agent_name, fabric_code, fabric_quality, color,
        quantity_meters, converted_by, notes, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',NOW())`,
      [
        sample_request_id, request_code,
        customer_name  || null, customer_id   || null,
        agent_name     || null, fabric_code   || null,
        fabric_quality || null, color         || null,
        quantity_meters || null, converted_by || null,
        notes          || null,
      ]
    );
 
    const conversionId = result.insertId;
 
    // Insert notification so the bell panel can surface it
    await run(
      `INSERT INTO notifications
       (type, title, body, sample_request_id, conversion_id,
        target_role, is_read, meta, created_at)
       VALUES ('order_conversion', ?, ?, ?, ?, 'admin', 0, ?, NOW())`,
      [
        `Convert to order: ${request_code}`,
        `${customer_name || 'Customer'} · ${fabric_code || ''}${fabric_quality ? ' · ' + fabric_quality : ''}`,
        sample_request_id,
        conversionId,
        JSON.stringify({
          sample_request_id,
          request_code,
          customer_name,
          customer_id,
          agent_name,
          fabric_code,
          fabric_quality,
          color,
          quantity_meters,
        }),
      ]
    );
 
    res.status(201).json({
      message: 'Conversion created',
      id: conversionId,
    });
  } catch (err) {
    console.error('[POST /order-conversions]', err);
    res.status(500).json({ message: err.message });
  }
});
 
// GET /api/order-conversions?status=pending&limit=50
router.get('/', async (req, res) => {
  try {
    const { status, limit = 100, offset = 0 } = req.query;
    let sql    = 'SELECT * FROM order_conversions';
    const params = [];
    if (status) { sql += ' WHERE status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const rows = await run(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[GET /order-conversions]', err);
    res.status(500).json({ message: err.message });
  }
});
 
// GET /api/order-conversions/:id
router.get('/:id', async (req, res) => {
  try {
    const rows = await run(
      'SELECT * FROM order_conversions WHERE id = ? LIMIT 1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /order-conversions/:id]', err);
    res.status(500).json({ message: err.message });
  }
});
 
// PUT /api/order-conversions/:id
// Body: { status, order_id, order_code, notes }
router.put('/:id', async (req, res) => {
  try {
    const { status, order_id, order_code, notes } = req.body;
    const result = await run(
      `UPDATE order_conversions
       SET status=COALESCE(?,status),
           order_id=COALESCE(?,order_id),
           order_code=COALESCE(?,order_code),
           notes=COALESCE(?,notes),
           updated_at=NOW()
       WHERE id=?`,
      [
        status     || null,
        order_id   || null,
        order_code || null,
        notes      || null,
        req.params.id,
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Not found' });
    }
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('[PUT /order-conversions/:id]', err);
    res.status(500).json({ message: err.message });
  }
});
 
// DELETE /api/order-conversions/:id  (soft cancel)
router.delete('/:id', async (req, res) => {
  try {
    await run(
      `UPDATE order_conversions SET status='cancelled', updated_at=NOW() WHERE id=?`,
      [req.params.id]
    );
    res.json({ message: 'Cancelled' });
  } catch (err) {
    console.error('[DELETE /order-conversions/:id]', err);
    res.status(500).json({ message: err.message });
  }
});
 
// ═══════════════════════════════════════════════
// NOTIFICATIONS  (separate sub-router exported on /api/notifications)
// ═══════════════════════════════════════════════
 
const notifRouter = express.Router();
 
// GET /api/notifications?role=admin&limit=50
notifRouter.get('/', async (req, res) => {
  try {
    const { role = 'admin', limit = 50, unread_only } = req.query;
    let sql    = `SELECT * FROM notifications WHERE (target_role = ? OR target_role = 'all')`;
    const params = [role];
    if (unread_only === '1') { sql += ' AND is_read = 0'; }
    sql += ' ORDER BY is_read ASC, created_at DESC LIMIT ?';
    params.push(Number(limit));
    const rows = await run(sql, params);
    // Parse meta JSON
    res.json(rows.map(r => ({
      ...r,
      meta: r.meta && typeof r.meta === 'string' ? (() => { try { return JSON.parse(r.meta); } catch { return {}; } })() : (r.meta || {}),
    })));
  } catch (err) {
    console.error('[GET /notifications]', err);
    res.status(500).json({ message: err.message });
  }
});
 
// PATCH /api/notifications/read-all
notifRouter.patch('/read-all', async (req, res) => {
  try {
    const { role = 'admin' } = req.body;
    await run(
      `UPDATE notifications SET is_read=1, read_at=NOW()
       WHERE (target_role=? OR target_role='all') AND is_read=0`,
      [role]
    );
    res.json({ message: 'All marked read' });
  } catch (err) {
    console.error('[PATCH /notifications/read-all]', err);
    res.status(500).json({ message: err.message });
  }
});
 
// PATCH /api/notifications/:id/read
notifRouter.patch('/:id/read', async (req, res) => {
  try {
    await run(
      `UPDATE notifications SET is_read=1, read_at=NOW() WHERE id=?`,
      [req.params.id]
    );
    res.json({ message: 'Marked read' });
  } catch (err) {
    console.error('[PATCH /notifications/:id/read]', err);
    res.status(500).json({ message: err.message });
  }
});
 
// Export both routers
module.exports        = router;
module.exports.notif  = notifRouter;