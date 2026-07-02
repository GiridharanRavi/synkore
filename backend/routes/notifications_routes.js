// backend/routes/notifications_routes.js

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

const sendErr = (res, status, msg) => res.status(status).json({ error: msg });

/* ══════════════════════════════════════════════════════
   CLIENT NOTIFICATIONS
══════════════════════════════════════════════════════ */

router.get('/client-notifications', async (req, res) => {
  const { customer_id, limit = 20, unread_only } = req.query;
  if (!customer_id) return sendErr(res, 400, 'customer_id is required');
  try {
    let sql      = 'SELECT * FROM client_notifications WHERE customer_id = ?';
    const params = [customer_id];
    if (unread_only === 'true') sql += ' AND is_read = FALSE';
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(Math.min(Number(limit), 100));
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error('[GET /client-notifications]', e);
    sendErr(res, 500, 'Failed to fetch notifications');
  }
});

router.post('/client-notifications', async (req, res) => {
  const { customer_id, user_id, title, message, type = 'info', sample_request_id, order_id } = req.body;
  if (!customer_id || !title || !message)
    return sendErr(res, 400, 'customer_id, title and message are required');
  try {
    const [result] = await db.query(
      `INSERT INTO client_notifications
         (customer_id, user_id, title, message, type, sample_request_id, order_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [customer_id, user_id || null, title, message, type,
       sample_request_id || null, order_id || null]
    );
    const [rows] = await db.query(
      'SELECT * FROM client_notifications WHERE id = ?', [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[POST /client-notifications]', e);
    sendErr(res, 500, 'Failed to create notification');
  }
});

// MUST be before /:id
router.patch('/client-notifications/read-all', async (req, res) => {
  const { customer_id } = req.query;
  if (!customer_id) return sendErr(res, 400, 'customer_id is required');
  try {
    await db.query(
      `UPDATE client_notifications SET is_read = TRUE, read_at = NOW()
       WHERE customer_id = ? AND is_read = FALSE`,
      [customer_id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[PATCH /client-notifications/read-all]', e);
    sendErr(res, 500, 'Failed to mark all read');
  }
});

router.patch('/client-notifications/:id/read', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(
      'UPDATE client_notifications SET is_read = TRUE, read_at = NOW() WHERE id = ?', [id]
    );
    const [rows] = await db.query(
      'SELECT * FROM client_notifications WHERE id = ?', [id]
    );
    if (!rows.length) return sendErr(res, 404, 'Notification not found');
    res.json(rows[0]);
  } catch (e) {
    console.error('[PATCH /client-notifications/:id/read]', e);
    sendErr(res, 500, 'Failed to mark as read');
  }
});

router.delete('/client-notifications/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM client_notifications WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /client-notifications/:id]', e);
    sendErr(res, 500, 'Failed to delete notification');
  }
});


/* ══════════════════════════════════════════════════════
   CLIENT PROFILE
   FIX: Query `client_profiles` table (not `customers`).
        Supports lookup by user_id (numeric) OR customer_id (string like "CUS-2026-001").
        GET  /client-profile?user_id=43
        GET  /client-profile?customer_id=CUS-2026-001
══════════════════════════════════════════════════════ */

router.get('/client-profile', async (req, res) => {
  const { customer_id, user_id } = req.query;

  if (!customer_id && !user_id)
    return sendErr(res, 400, 'customer_id or user_id is required');

  try {
    let rows;

    if (user_id) {
      [rows] = await db.query(
        'SELECT * FROM client_profiles WHERE user_id = ? LIMIT 1',
        [parseInt(user_id, 10)]
      );
    }

    if ((!rows || rows.length === 0) && customer_id) {
      [rows] = await db.query(
        'SELECT * FROM client_profiles WHERE customer_id = ? LIMIT 1',
        [customer_id]
      );
    }

    if (!rows || rows.length === 0) {
      let customerRows;

      if (customer_id) {
        [customerRows] = await db.query(
          'SELECT * FROM customers WHERE customer_id = ? LIMIT 1',
          [customer_id]
        );
      } else if (user_id) {
        [customerRows] = await db.query(
          'SELECT * FROM customers WHERE id = ? LIMIT 1',
          [parseInt(user_id, 10)]
        );
      }

      if (customerRows && customerRows.length > 0) {
        const c = customerRows[0];

        const addressLines = (c.address || c.address_line1 || '').split('\n');
        const addrLine1 = addressLines[0]?.trim() || null;
        const addrLine2 = addressLines[1]?.trim() || null;

        return res.json({
          _seeded:       true,

          user_id:       user_id ? parseInt(user_id, 10) : null,
          customer_id:   c.customer_id  || customer_id || null,

          display_name:  c.customer_name || c.name      || null,
          phone:         c.phone         || c.mobile    || null,
          alternate_email: c.alternate_email             || null,
          designation:   c.contact_person || c.designation || null,
          department:    c.department                    || null,

          company_name:  c.company_name  || c.customer_name || null,
          company_type:  c.company_type  || c.type          || null,
          gst_number:    c.gst_number    || c.gst           || null,
          pan_number:    c.pan_number    || c.pan           || null,
          company_website: c.company_website || c.website   || null,

          address_line1: addrLine1,
          address_line2: addrLine2 || c.address_line2    || null,
          city:          c.city                           || null,
          state:         c.state                         || null,
          pincode:       c.pincode                       || null,
          country:       c.country                       || 'India',

          billing_address: c.billing_address || c.address  || null,
          billing_city:    c.billing_city    || c.city     || null,
          billing_state:   c.billing_state   || c.state    || null,
          billing_pincode: c.billing_pincode || c.pincode  || null,

          avatar_url:    c.avatar_url                    || null,
          language:      c.language                      || 'en',
          timezone:      c.timezone                      || 'Asia/Kolkata',

          notification_email:  true,
          notification_in_app: true,
          notification_sms:    false,
        });
      }

      return res.json({
        user_id:    user_id    ? parseInt(user_id, 10) : null,
        customer_id: customer_id || null,
        country:     'India',
        notification_email:  true,
        notification_in_app: true,
        notification_sms:    false,
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /client-profile] SQL error:', err.message, err.sqlMessage);
    sendErr(res, 500, err.sqlMessage || 'Failed to fetch profile');
  }
});

/* ──────────────────────────────────────────────────────
   PUT /client-profile  — upsert into client_profiles
   Primary key: user_id (UNIQUE in client_profiles)
────────────────────────────────────────────────────── */
router.put('/client-profile', async (req, res) => {
  const {
    user_id, customer_id,
    display_name, phone, alternate_email, designation, department,
    company_name, gst_number, pan_number, company_website,
    address_line1, address_line2, city, state, pincode, country,
    language, timezone,
    notification_email, notification_in_app, notification_sms,
    avatar_url,
  } = req.body;

  if (!user_id && !customer_id)
    return sendErr(res, 400, 'user_id or customer_id is required');

  if (customer_id) {
    try {
      const [custRows] = await db.query(
        'SELECT customer_id FROM customers WHERE customer_id = ? LIMIT 1',
        [customer_id]
      );
      if (!custRows.length)
        return sendErr(res, 400, `Customer ${customer_id} not found`);
    } catch (e) {
      console.error('[PUT /client-profile] customer check error:', e.message);
      return sendErr(res, 500, 'Failed to verify customer');
    }
  }

  const safeAvatarUrl = (avatar_url && !avatar_url.startsWith('data:') && avatar_url.length < 500)
    ? avatar_url
    : null;

  const vals = [
    customer_id          || null,
    user_id ? Number(user_id) : null,
    display_name         || null,
    phone                || null,
    alternate_email      || null,
    designation          || null,
    department           || null,
    company_name         || null,
    gst_number           || null,
    pan_number           || null,
    company_website      || null,
    address_line1        || null,
    address_line2        || null,
    city                 || null,
    state                || null,
    pincode              || null,
    country              || 'India',
    language             || 'en',
    timezone             || 'Asia/Kolkata',
    notification_email   !== false ? 1 : 0,
    notification_in_app  !== false ? 1 : 0,
    notification_sms     === true  ? 1 : 0,
    safeAvatarUrl,
  ];

  try {
    await db.query(
      `INSERT INTO client_profiles
         (customer_id, user_id,
          display_name, phone, alternate_email, designation, department,
          company_name, gst_number, pan_number, company_website,
          address_line1, address_line2, city, state, pincode, country,
          language, timezone,
          notification_email, notification_in_app, notification_sms,
          avatar_url, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE
         user_id             = VALUES(user_id),
         display_name        = VALUES(display_name),
         phone               = VALUES(phone),
         alternate_email     = VALUES(alternate_email),
         designation         = VALUES(designation),
         department          = VALUES(department),
         company_name        = VALUES(company_name),
         gst_number          = VALUES(gst_number),
         pan_number          = VALUES(pan_number),
         company_website     = VALUES(company_website),
         address_line1       = VALUES(address_line1),
         address_line2       = VALUES(address_line2),
         city                = VALUES(city),
         state               = VALUES(state),
         pincode             = VALUES(pincode),
         country             = VALUES(country),
         language            = VALUES(language),
         timezone            = VALUES(timezone),
         notification_email  = VALUES(notification_email),
         notification_in_app = VALUES(notification_in_app),
         notification_sms    = VALUES(notification_sms),
         avatar_url          = VALUES(avatar_url),
         updated_at          = NOW()`,
      vals
    );

    const whereClause = customer_id ? 'customer_id = ?' : 'user_id = ?';
    const whereVal    = customer_id || user_id;
    const [rows] = await db.query(
      `SELECT * FROM client_profiles WHERE ${whereClause} LIMIT 1`,
      [whereVal]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('[PUT /client-profile] MySQL error:', e.message, e.code, e.sqlMessage);
    sendErr(res, 500, e.sqlMessage || 'Failed to save profile');
  }
});


/* ══════════════════════════════════════════════════════
   AUTO-NOTIFY HELPERS
══════════════════════════════════════════════════════ */

async function pushNotification(dbConn, {
  customer_id, user_id = null, title, message,
  type = 'info', sample_request_id = null, order_id = null,
}) {
  await dbConn.query(
    `INSERT INTO client_notifications
       (customer_id, user_id, title, message, type, sample_request_id, order_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [customer_id, user_id, title, message, type, sample_request_id, order_id]
  );
}

// ⭐ NEW — fires when admin first logs/creates a sample request for a client
async function notifySampleNew(dbConn, sampleRequest) {
  await pushNotification(dbConn, {
    customer_id:       sampleRequest.customer_id,
    title:             'Sample Request Logged',
    message:           `Your sample request ${sampleRequest.request_code} has been recorded and is now pending.`,
    type:              'sample_new',
    sample_request_id: sampleRequest.id,
  });
}

async function notifySampleStatus(dbConn, sampleRequest) {
  const LABELS = {
    pending: 'Pending', quality_check: 'Quality Check',
    yardage_pricing: 'Yardage Pricing', price_listed: 'Price Listed',
    bulk_order_ready: 'Bulk Order Ready', approved: 'Approved',
    rejected: 'Rejected', rework: 'Rework', collected: 'Collected',
  };
  await pushNotification(dbConn, {
    customer_id:       sampleRequest.customer_id,
    title:             'Sample Status Updated',
    message:           `${sampleRequest.request_code} status changed to "${LABELS[sampleRequest.status] || sampleRequest.status}".`,
    type:              'sample_status',
    sample_request_id: sampleRequest.id,
  });
}

async function notifyOrderNew(dbConn, order) {
  await pushNotification(dbConn, {
    customer_id:       order.customer_id,
    title:             'New Order Booked',
    message:           `Order ${order.order_code || '#' + order.id} has been confirmed.`,
    type:              'order_new',
    sample_request_id: order.sample_request_id || null,
    order_id:          order.id,
  });
}

async function notifyOrderStatus(dbConn, order) {
  const LABELS = {
    pending: 'Pending', booked: 'Booked', processing: 'Processing',
    job_work: 'Job Work', inward: 'Inward', outward: 'Outward',
    dispatch: 'Dispatched', completed: 'Completed', cancelled: 'Cancelled',
  };
  await pushNotification(dbConn, {
    customer_id:       order.customer_id,
    title:             'Order Status Updated',
    message:           `Order ${order.order_code || '#' + order.id} is now "${LABELS[order.status] || order.status}".`,
    type:              'order_status',
    sample_request_id: order.sample_request_id || null,
    order_id:          order.id,
  });
}

async function notifyChatMessage(dbConn, message, sampleRequest) {
  const preview = message.message.slice(0, 80) + (message.message.length > 80 ? '…' : '');
  await pushNotification(dbConn, {
    customer_id:       sampleRequest.customer_id,
    title:             'New Message from Admin',
    message:           `Admin replied on ${sampleRequest.request_code}: "${preview}"`,
    type:              'chat_message',
    sample_request_id: sampleRequest.id,
  });
}

async function notifyReportReady(dbConn, sampleRequest, processLabel) {
  await pushNotification(dbConn, {
    customer_id:       sampleRequest.customer_id,
    title:             'Report Updated',
    message:           `${processLabel} data saved for ${sampleRequest.request_code}. View your report for details.`,
    type:              'report_ready',
    sample_request_id: sampleRequest.id,
  });
}

module.exports = router;
module.exports.pushNotification   = pushNotification;
module.exports.notifySampleNew    = notifySampleNew;
module.exports.notifySampleStatus = notifySampleStatus;
module.exports.notifyOrderNew     = notifyOrderNew;
module.exports.notifyOrderStatus  = notifyOrderStatus;
module.exports.notifyChatMessage  = notifyChatMessage;
module.exports.notifyReportReady  = notifyReportReady;