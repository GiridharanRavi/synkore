// orderStatusRoute.js — UPDATED (quality / delivery-schedule fields now PERSISTED)
//
// ROOT CAUSE OF "Construction not stored" BUG:
//   The GET routes joined order_bookings but never SELECTed co.quality, so
//   after save/reload the Construction field always came back undefined.
//   Fixes below:
//     1. order_status_master now has real columns: quality, order_date,
//        expect_delivery, delivery_at, delivery_address, delivery_state,
//        delivery_country, delivery_pincode, delivery_gst_no.
//        ensureOrderStatusSchema() auto-adds them on boot if missing.
//     2. POST / PUT now snapshot these values (sent from the frontend form,
//        which already has them from the selected order) into osm.* at
//        save time — so the record is self-contained and immune to the
//        linked order changing later, or order_booking_id being null.
//     3. GET routes now SELECT COALESCE(osm.column, co.column) AS column
//        — prefers the stored snapshot, falls back to the live JOIN for
//        any legacy rows saved before this migration.

const express = require('express');
const router  = express.Router();
const db = require('../db/connection');

// ─── SCHEMA AUTO-MIGRATION ────────────────────────────────────────────────────
async function hasColumn(table, column) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

const OSM_SNAPSHOT_COLUMNS = [
  ['quality',          'TEXT NULL'],
  ['order_date',       'DATE NULL'],
  ['expect_delivery',  'DATE NULL'],
  ['delivery_at',      'VARCHAR(150) NULL'],
  ['delivery_address', 'TEXT NULL'],
  ['delivery_state',   'VARCHAR(100) NULL'],
  ['delivery_country', 'VARCHAR(100) NULL'],
  ['delivery_pincode', 'VARCHAR(20) NULL'],
  ['delivery_gst_no',  'VARCHAR(30) NULL'],
];

async function ensureOrderStatusSchema() {
  for (const [col, def] of OSM_SNAPSHOT_COLUMNS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const exists = await hasColumn('order_status_master', col);
      if (exists) continue;
      // eslint-disable-next-line no-await-in-loop
      await db.execute(`ALTER TABLE order_status_master ADD COLUMN ${col} ${def}`);
      console.log(`[order-status] migrated: added column '${col}' to order_status_master`);
    } catch (err) {
      // ER_DUP_FIELDNAME (1060) = another process/reload already added this
      // column between our hasColumn() check and the ALTER — safe to ignore.
      if (err && (err.code === 'ER_DUP_FIELDNAME' || err.errno === 1060)) {
        console.warn(`[order-status] column '${col}' already exists, skipping`);
        continue;
      }
      console.error(`[order-status] failed to add column '${col}'`, err);
    }
  }
}
ensureOrderStatusSchema();

// ─── STATUS AUTO-CALCULATION ─────────────────────────────────────────────────
function calcStatus(totalMeter, deliveredMeter, isCancelled) {
  if (isCancelled) return 'Cancel';
  const total     = Number(totalMeter)    || 0;
  const delivered = Number(deliveredMeter) || 0;
  if (total <= 0) return 'Pending';
  if (delivered >= total) return 'Completed';
  if (delivered > 0)      return 'Part Delivery';
  return 'Pending';
}

// Normalizes '' / undefined -> null so we never write empty strings into
// DATE columns (MySQL rejects '' as an invalid date).
const nz = (v) => (v === undefined || v === null || v === '' ? null : v);

// Merges the fallback_* columns (from the order_bookings JOIN, used only
// for legacy rows saved before the snapshot columns existed) into the
// canonical fields, then strips the helper columns from the response.
function mergeFallbacks(row) {
  const out = { ...row };
  out.quality           = out.quality           ?? out.fallback_quality;
  out.order_date        = out.order_date         ?? out.fallback_order_date;
  out.expect_delivery   = out.expect_delivery     ?? out.fallback_expect_delivery;
  out.delivery_at       = out.delivery_at         ?? out.fallback_delivery_at;
  out.delivery_address  = out.delivery_address    ?? out.fallback_delivery_address;
  out.delivery_state    = out.delivery_state      ?? out.fallback_delivery_state;
  out.delivery_country  = out.delivery_country    ?? out.fallback_delivery_country;
  out.delivery_pincode  = out.delivery_pincode    ?? out.fallback_delivery_pincode;
  out.delivery_gst_no   = out.delivery_gst_no     ?? out.fallback_delivery_gst_no;
  delete out.fallback_quality;
  delete out.fallback_order_date;
  delete out.fallback_expect_delivery;
  delete out.fallback_delivery_at;
  delete out.fallback_delivery_address;
  delete out.fallback_delivery_state;
  delete out.fallback_delivery_country;
  delete out.fallback_delivery_pincode;
  delete out.fallback_delivery_gst_no;
  return out;
}

// ─── GET /api/order-status ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      employee_id,
      search  = '',
      status  = '',
      page    = 1,
      limit   = 50,
    } = req.query;

    let baseQuery = `
      SELECT
        osm.*,
        co.customer_name,
        co.po_no,
        co.transport,
        co.agent_name,
        COALESCE(NULLIF(osm.quality, ''),          co.quality)          AS fallback_quality,
        COALESCE(osm.order_date,       co.order_date)       AS fallback_order_date,
        COALESCE(osm.expect_delivery,  co.expect_delivery)  AS fallback_expect_delivery,
        COALESCE(NULLIF(osm.delivery_at, ''),      co.delivery_at)      AS fallback_delivery_at,
        COALESCE(NULLIF(osm.delivery_address, ''), co.delivery_address) AS fallback_delivery_address,
        COALESCE(NULLIF(osm.delivery_state, ''),   co.delivery_state)   AS fallback_delivery_state,
        COALESCE(NULLIF(osm.delivery_country, ''), co.delivery_country) AS fallback_delivery_country,
        COALESCE(NULLIF(osm.delivery_pincode, ''), co.delivery_pincode) AS fallback_delivery_pincode,
        COALESCE(NULLIF(osm.delivery_gst_no, ''),  co.delivery_gst_no)  AS fallback_delivery_gst_no,
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
        osm.order_code    LIKE ? OR
        osm.firm_name     LIKE ? OR
        co.customer_name  LIKE ? OR
        osm.status        LIKE ?
      )`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    if (status) {
      baseQuery += ` AND osm.status = ?`;
      params.push(status);
    }

    baseQuery += ` ORDER BY osm.created_at DESC`;

    const pageNum   = Math.max(1, parseInt(page,  10) || 1);
    const limitNum  = Math.min(10000, Math.max(1, parseInt(limit, 10) || 50));
    const offsetNum = (pageNum - 1) * limitNum;

    const dataQuery  = baseQuery + ` LIMIT ${limitNum} OFFSET ${offsetNum}`;
    const countQuery = `SELECT COUNT(*) AS total FROM (${baseQuery}) AS sub`;

    const [rows]  = await db.execute(dataQuery,  params);
    const [count] = await db.execute(countQuery, params);

    // Merge legacy-row fallbacks (from the order_bookings JOIN) into the
    // canonical snapshot fields — the frontend only ever needs `quality`,
    // `expect_delivery`, etc., not the fallback_* helper columns.
    const merged = rows.map(mergeFallbacks);

    res.json({
      data:  merged,
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
              co.customer_name,
              co.po_no,
              co.net_value,
              co.customer_state,
              co.transport,
              COALESCE(NULLIF(osm.quality, ''),          co.quality)          AS fallback_quality,
              COALESCE(osm.order_date,       co.order_date)       AS fallback_order_date,
              COALESCE(osm.expect_delivery,  co.expect_delivery)  AS fallback_expect_delivery,
              COALESCE(NULLIF(osm.delivery_at, ''),      co.delivery_at)      AS fallback_delivery_at,
              COALESCE(NULLIF(osm.delivery_address, ''), co.delivery_address) AS fallback_delivery_address,
              COALESCE(NULLIF(osm.delivery_state, ''),   co.delivery_state)   AS fallback_delivery_state,
              COALESCE(NULLIF(osm.delivery_country, ''), co.delivery_country) AS fallback_delivery_country,
              COALESCE(NULLIF(osm.delivery_pincode, ''), co.delivery_pincode) AS fallback_delivery_pincode,
              COALESCE(NULLIF(osm.delivery_gst_no, ''),  co.delivery_gst_no)  AS fallback_delivery_gst_no
       FROM order_status_master osm
       LEFT JOIN order_bookings co ON co.id = osm.order_booking_id
       WHERE osm.order_booking_id = ?
       LIMIT 1`,
      [order_id]
    );

    if (!rows.length) return res.status(404).json({ message: 'No status found for this order' });

    const statusRecord = mergeFallbacks(rows[0]);
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
              co.customer_name,
              co.po_no,
              co.net_value,
              co.customer_state,
              co.transport,
              co.agent_name,
              COALESCE(NULLIF(osm.quality, ''),          co.quality)          AS fallback_quality,
              COALESCE(osm.order_date,       co.order_date)       AS fallback_order_date,
              COALESCE(osm.expect_delivery,  co.expect_delivery)  AS fallback_expect_delivery,
              COALESCE(NULLIF(osm.delivery_at, ''),      co.delivery_at)      AS fallback_delivery_at,
              COALESCE(NULLIF(osm.delivery_address, ''), co.delivery_address) AS fallback_delivery_address,
              COALESCE(NULLIF(osm.delivery_state, ''),   co.delivery_state)   AS fallback_delivery_state,
              COALESCE(NULLIF(osm.delivery_country, ''), co.delivery_country) AS fallback_delivery_country,
              COALESCE(NULLIF(osm.delivery_pincode, ''), co.delivery_pincode) AS fallback_delivery_pincode,
              COALESCE(NULLIF(osm.delivery_gst_no, ''),  co.delivery_gst_no)  AS fallback_delivery_gst_no
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

    res.json({ data: { ...mergeFallbacks(rows[0]), deliveries } });
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
      firm_name,
      total_meter,
      remarks,
      is_cancelled = 0,
      deliveries   = [],
      // ── NEW: snapshot fields, sent from the frontend form (already
      //         auto-filled from the selected order) ──────────────────────
      quality,
      order_date,
      expect_delivery,
      delivery_at,
      delivery_address,
      delivery_state,
      delivery_country,
      delivery_pincode,
      delivery_gst_no,
    } = req.body;

    if (!order_code)
      return res.status(400).json({ message: 'order_code is required' });
    if (!total_meter || Number(total_meter) <= 0)
      return res.status(400).json({ message: 'total_meter must be > 0' });

    const deliveredMeter = deliveries.reduce((s, d) => s + (Number(d.delivered_meter) || 0), 0);
    const status         = calcStatus(total_meter, deliveredMeter, is_cancelled);

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [result] = await conn.execute(
        `INSERT INTO order_status_master
           (order_booking_id, order_code, customer_id, firm_name, total_meter, delivered_meter,
            pending_meter, status, is_cancelled, remarks,
            quality, order_date, expect_delivery,
            delivery_at, delivery_address, delivery_state, delivery_country,
            delivery_pincode, delivery_gst_no,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          order_booking_id || null,
          order_code,
          customer_id || null,
          firm_name   || null,
          Number(total_meter),
          deliveredMeter,
          Math.max(0, Number(total_meter) - deliveredMeter),
          status,
          is_cancelled ? 1 : 0,
          remarks || null,
          nz(quality),
          nz(order_date),
          nz(expect_delivery),
          nz(delivery_at),
          nz(delivery_address),
          nz(delivery_state),
          nz(delivery_country),
          nz(delivery_pincode),
          nz(delivery_gst_no),
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
      firm_name,
      remarks,
      is_cancelled = 0,
      deliveries   = [],
      // ── NEW: snapshot fields ────────────────────────────────────────────
      quality,
      order_date,
      expect_delivery,
      delivery_at,
      delivery_address,
      delivery_state,
      delivery_country,
      delivery_pincode,
      delivery_gst_no,
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
           firm_name         = ?,
           total_meter       = ?,
           delivered_meter   = ?,
           pending_meter     = ?,
           status            = ?,
           is_cancelled      = ?,
           remarks           = ?,
           quality           = ?,
           order_date        = ?,
           expect_delivery   = ?,
           delivery_at       = ?,
           delivery_address  = ?,
           delivery_state    = ?,
           delivery_country  = ?,
           delivery_pincode  = ?,
           delivery_gst_no   = ?,
           updated_at        = NOW()
         WHERE id = ?`,
        [
          firm_name || null,
          Number(total_meter),
          deliveredMeter,
          Math.max(0, Number(total_meter) - deliveredMeter),
          status,
          is_cancelled ? 1 : 0,
          remarks || null,
          nz(quality),
          nz(order_date),
          nz(expect_delivery),
          nz(delivery_at),
          nz(delivery_address),
          nz(delivery_state),
          nz(delivery_country),
          nz(delivery_pincode),
          nz(delivery_gst_no),
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