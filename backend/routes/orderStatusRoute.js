// orderStatusRoute.js
// REST API routes for Order Status (delivery tracking) management
// Tables: order_status_master (header), order_status_deliveries (line items)
//
// GET    /api/order-status              → list all order statuses (with filters)
// GET    /api/order-status/:id          → get single order status with deliveries
// POST   /api/order-status              → create new order status record
// PUT    /api/order-status/:id          → update order status + deliveries
// DELETE /api/order-status/:id          → delete order status record
// GET    /api/order-status/by-order/:order_id → get status by customer order id

const express = require('express');
const router  = express.Router();
const db = require('../db/connection');

// ─── STATUS AUTO-CALCULATION ─────────────────────────────────────────────────
// Logic:
//   cancelled            → Cancel
//   delivered >= total   → Completed
//   delivered > 0        → Part Delivery
//   any delivery date <= today && delivered === 0 → In Process
//   otherwise            → Pending
function calcStatus(totalMeter, deliveredMeter, isCancelled) {
  if (isCancelled) return 'Cancel';
  const total     = Number(totalMeter)    || 0;
  const delivered = Number(deliveredMeter) || 0;
  if (total <= 0) return 'Pending';
  if (delivered >= total)                 return 'Completed';
  if (delivered > 0)                      return 'Part Delivery';
  return 'Pending';
}

// ─── GET /api/order-status ────────────────────────────────────────────────────
// FIX: previous version joined order_status_deliveries directly and used
// `GROUP BY osm.id` while selecting osm.*/co.* columns. Under MySQL's default
// ONLY_FULL_GROUP_BY sql_mode this throws:
//   "Expression #N of SELECT list is not in GROUP BY clause and contains
//    nonaggregated column 'co.customer_name' which is not functionally
//    dependent on columns in GROUP BY clause"
// because co.customer_name etc. come from a joined table that MySQL can't
// prove is functionally dependent on osm.id, even though logically it is
// (one order_booking per order_status row).
//
// The fix: pre-aggregate order_status_deliveries in a derived subquery keyed
// by order_status_id, then LEFT JOIN that single aggregated row per status.
// This means the outer query never fans out rows from the deliveries join,
// so no GROUP BY is needed at all — sidestepping ONLY_FULL_GROUP_BY entirely
// and it's cheaper than aggregating after a multi-row join.
router.get('/', async (req, res) => {
  try {
    const {
      employee_id,
      search       = '',
      status       = '',
      page         = 1,
      limit        = 50,
    } = req.query;

    let baseQuery = `
      SELECT
        osm.*,
        co.customer_name,
        co.order_date,
        co.po_no,
        co.transport,
        co.agent_name,
        COALESCE(d.total_delivered_meter, 0) AS total_delivered_meter,
        COALESCE(d.delivery_count, 0)        AS delivery_count
      FROM order_status_master osm
      LEFT JOIN order_bookings co ON co.id = osm.order_booking_id
      LEFT JOIN (
        SELECT
          order_status_id,
          SUM(delivered_meter) AS total_delivered_meter,
          COUNT(*)             AS delivery_count
        FROM order_status_deliveries
        GROUP BY order_status_id
      ) d ON d.order_status_id = osm.id
      WHERE 1=1
    `;

    const params = [];

    if (search) {
      baseQuery += ` AND (
        osm.order_code LIKE ? OR
        co.customer_name LIKE ? OR
        osm.status LIKE ?
      )`;
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    if (status) {
      baseQuery += ` AND osm.status = ?`;
      params.push(status);
    }

    baseQuery += ` ORDER BY osm.created_at DESC`;

    // ── pagination ──────────────────────────────────────────────────────
    // FIX: mysql2's db.execute() runs as a prepared statement, and many
    // MySQL/MariaDB server builds reject `?` parameter markers inside
    // LIMIT/OFFSET — even with valid integer values — throwing
    // ER_WRONG_ARGUMENTS ("Incorrect arguments to mysqld_stmt_execute").
    // Since pageNum/limitNum are forced to safe, bounded integers below
    // (never raw user input), it's safe to inline them directly into the
    // SQL string instead of binding them as placeholders.
    const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum = Math.min(10000, Math.max(1, parseInt(limit, 10) || 50));
    const offsetNum = (pageNum - 1) * limitNum;

    const dataQuery  = baseQuery + ` LIMIT ${limitNum} OFFSET ${offsetNum}`;
    const countQuery = `SELECT COUNT(*) AS total FROM (${baseQuery}) AS sub`;

    const [rows]  = await db.execute(dataQuery,  params);
    const [count] = await db.execute(countQuery, params);

    res.json({
      data:  rows,
      total: count[0]?.total ?? 0,
      page:  pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error('[GET /api/order-status]', err);
    res.status(500).json({ message: 'Failed to fetch order statuses', error: err.message });
  }
});

// ─── GET /api/order-status/by-order/:order_id ─────────────────────────────────
router.get('/by-order/:order_id', async (req, res) => {
  try {
    const { order_id } = req.params;

    const [rows] = await db.execute(
      `SELECT osm.*,
              co.customer_name, co.order_date, co.po_no,
              co.net_value, co.customer_state, co.transport
       FROM order_status_master osm
       LEFT JOIN order_bookings co ON co.id = osm.order_booking_id
       WHERE osm.order_booking_id = ?
       LIMIT 1`,
      [order_id]
    );

    if (!rows.length) return res.status(404).json({ message: 'No status found for this order' });

    const statusRecord = rows[0];
    const [deliveries] = await db.execute(
      `SELECT * FROM order_status_deliveries WHERE order_status_id = ? ORDER BY delivery_date ASC`,
      [statusRecord.id]
    );

    res.json({ data: { ...statusRecord, deliveries } });
  } catch (err) {
    console.error('[GET /api/order-status/by-order]', err);
    res.status(500).json({ message: 'Failed to fetch order status', error: err.message });
  }
});

// ─── GET /api/order-status/:id ────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.execute(
      `SELECT osm.*,
              co.customer_name, co.order_date, co.po_no,
              co.net_value, co.customer_state, co.transport, co.agent_name
       FROM order_status_master osm
       LEFT JOIN order_bookings co ON co.id = osm.order_booking_id
       WHERE osm.id = ?`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ message: 'Order status not found' });

    const [deliveries] = await db.execute(
      `SELECT * FROM order_status_deliveries WHERE order_status_id = ? ORDER BY delivery_date ASC`,
      [id]
    );

    res.json({ data: { ...rows[0], deliveries } });
  } catch (err) {
    console.error('[GET /api/order-status/:id]', err);
    res.status(500).json({ message: 'Failed to fetch order status', error: err.message });
  }
});

// ─── POST /api/order-status ───────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      order_booking_id,
      order_code,
      customer_id,
      total_meter,
      remarks,
      is_cancelled = 0,
      deliveries   = [],
    } = req.body;

    if (!order_code) return res.status(400).json({ message: 'order_code is required' });
    if (!total_meter || Number(total_meter) <= 0)
      return res.status(400).json({ message: 'total_meter must be > 0' });

    // Calculate delivered meter from deliveries array
    const deliveredMeter = deliveries.reduce((s, d) => s + (Number(d.delivered_meter) || 0), 0);
    const status         = calcStatus(total_meter, deliveredMeter, is_cancelled);

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [result] = await conn.execute(
        `INSERT INTO order_status_master
           (order_booking_id, order_code, customer_id, total_meter, delivered_meter,
            pending_meter, status, is_cancelled, remarks, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          order_booking_id || null,
          order_code,
          customer_id || null,
          Number(total_meter),
          deliveredMeter,
          Math.max(0, Number(total_meter) - deliveredMeter),
          status,
          is_cancelled ? 1 : 0,
          remarks || null,
        ]
      );

      const statusId = result.insertId;

      for (const d of deliveries) {
        if (!d.delivery_date) continue;
        await conn.execute(
          `INSERT INTO order_status_deliveries
             (order_status_id, delivery_date, delivered_meter, notes, created_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [statusId, d.delivery_date, Number(d.delivered_meter) || 0, d.notes || null]
        );
      }

      await conn.commit();
      conn.release();

      res.status(201).json({ message: 'Order status created', id: statusId, status });
    } catch (e) {
      await conn.rollback();
      conn.release();
      throw e;
    }
  } catch (err) {
    console.error('[POST /api/order-status]', err);
    res.status(500).json({ message: 'Failed to create order status', error: err.message });
  }
});

// ─── PUT /api/order-status/:id ────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      total_meter,
      remarks,
      is_cancelled = 0,
      deliveries   = [],
    } = req.body;

    if (!total_meter || Number(total_meter) <= 0)
      return res.status(400).json({ message: 'total_meter must be > 0' });

    const deliveredMeter = deliveries.reduce((s, d) => s + (Number(d.delivered_meter) || 0), 0);
    const status         = calcStatus(total_meter, deliveredMeter, is_cancelled);

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      await conn.execute(
        `UPDATE order_status_master SET
           total_meter     = ?,
           delivered_meter = ?,
           pending_meter   = ?,
           status          = ?,
           is_cancelled    = ?,
           remarks         = ?,
           updated_at      = NOW()
         WHERE id = ?`,
        [
          Number(total_meter),
          deliveredMeter,
          Math.max(0, Number(total_meter) - deliveredMeter),
          status,
          is_cancelled ? 1 : 0,
          remarks || null,
          id,
        ]
      );

      // Replace all delivery lines
      await conn.execute(`DELETE FROM order_status_deliveries WHERE order_status_id = ?`, [id]);

      for (const d of deliveries) {
        if (!d.delivery_date) continue;
        await conn.execute(
          `INSERT INTO order_status_deliveries
             (order_status_id, delivery_date, delivered_meter, notes, created_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [id, d.delivery_date, Number(d.delivered_meter) || 0, d.notes || null]
        );
      }

      await conn.commit();
      conn.release();

      res.json({ message: 'Order status updated', status });
    } catch (e) {
      await conn.rollback();
      conn.release();
      throw e;
    }
  } catch (err) {
    console.error('[PUT /api/order-status/:id]', err);
    res.status(500).json({ message: 'Failed to update order status', error: err.message });
  }
});

// ─── DELETE /api/order-status/:id ────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await db.execute(`DELETE FROM order_status_deliveries WHERE order_status_id = ?`, [id]);
    await db.execute(`DELETE FROM order_status_master WHERE id = ?`, [id]);

    res.json({ message: 'Order status deleted' });
  } catch (err) {
    console.error('[DELETE /api/order-status/:id]', err);
    res.status(500).json({ message: 'Failed to delete order status', error: err.message });
  }
});

module.exports = router;