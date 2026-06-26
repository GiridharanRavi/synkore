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
══════════════════════════════════════════════════════ */

router.get('/client-profile', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return sendErr(res, 400, 'user_id is required');

  try {
    // 1. Get user row first
    const [userRows] = await db.query(
      'SELECT * FROM users WHERE id = ? LIMIT 1', [user_id]
    );
    const user = userRows[0];

    if (!user) return sendErr(res, 404, 'User not found');

    // 2. Try saved profile
    const [profileRows] = await db.query(
      'SELECT * FROM client_profiles WHERE user_id = ? LIMIT 1', [user_id]
    );

    if (profileRows.length) {
      return res.json({
        ...profileRows[0],
        customer_id: profileRows[0].customer_id || user.customer_id || null,
      });
    }

    // 3. Seed from customer_master if customer_id exists
    if (user.customer_id) {
      const [custRows] = await db.query(
        `SELECT
           c.customer_id,
           c.customer_name  AS company_name,
           c.contact_person AS display_name,
           c.phone,
           c.email          AS alternate_email,
           c.gst_number,
           c.pan_number,
           c.website        AS company_website,
           c.address_line1,
           c.address_line2,
           c.city,
           c.state,
           c.pincode,
           c.country
         FROM customer_master c
         WHERE c.customer_id = ?
         LIMIT 1`,
        [user.customer_id]
      );

      if (custRows.length) {
        const cm = custRows[0];
        return res.json({
          user_id:             Number(user_id),
          customer_id:         user.customer_id,
          display_name:        cm.display_name        || '',
          phone:               cm.phone               || '',
          alternate_email:     cm.alternate_email      || '',
          designation:         '',
          department:          '',
          company_name:        cm.company_name        || '',
          gst_number:          cm.gst_number          || '',
          pan_number:          cm.pan_number          || '',
          company_website:     cm.company_website      || '',
          address_line1:       cm.address_line1        || '',
          address_line2:       cm.address_line2        || '',
          city:                cm.city                || '',
          state:               cm.state               || '',
          pincode:             cm.pincode             || '',
          country:             cm.country             || 'India',
          language:            'en',
          timezone:            'Asia/Kolkata',
          notification_email:  true,
          notification_in_app: true,
          notification_sms:    false,
          avatar_url:          '',
          _seeded:             true,
        });
      }
    }

    // 4. Blank profile
    return res.json({
      user_id:             Number(user_id),
      customer_id:         user.customer_id || null,
      display_name:        user.name        || '',
      phone:               '',
      alternate_email:     '',
      designation:         '',
      department:          '',
      company_name:        '',
      gst_number:          '',
      pan_number:          '',
      company_website:     '',
      address_line1:       '',
      address_line2:       '',
      city:                '',
      state:               '',
      pincode:             '',
      country:             'India',
      language:            'en',
      timezone:            'Asia/Kolkata',
      notification_email:  true,
      notification_in_app: true,
      notification_sms:    false,
      avatar_url:          '',
      _seeded:             false,
    });

  } catch (e) {
    console.error('[GET /client-profile]', e.message, e.sqlMessage);
    sendErr(res, 500, e.sqlMessage || 'Failed to fetch profile');
  }
});

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

  if (!user_id) return sendErr(res, 400, 'user_id is required');

  // Verify user exists before insert (avoids FK violation)
  try {
    const [userRows] = await db.query('SELECT id FROM users WHERE id = ? LIMIT 1', [user_id]);
    if (!userRows.length) return sendErr(res, 400, `User ${user_id} not found in users table`);
  } catch (e) {
    return sendErr(res, 500, 'Failed to verify user');
  }

  // Never store base64 blobs in the DB — only real URLs
  const safeAvatarUrl = (avatar_url && !avatar_url.startsWith('data:')) ? avatar_url : null;

  const vals = [
    Number(user_id),
    customer_id         || null,
    display_name        || null,
    phone               || null,
    alternate_email     || null,
    designation         || null,
    department          || null,
    company_name        || null,
    gst_number          || null,
    pan_number          || null,
    company_website     || null,
    address_line1       || null,
    address_line2       || null,
    city                || null,
    state               || null,
    pincode             || null,
    country             || 'India',
    language            || 'en',
    timezone            || 'Asia/Kolkata',
    notification_email  !== false ? 1 : 0,
    notification_in_app !== false ? 1 : 0,
    notification_sms    === true  ? 1 : 0,
    safeAvatarUrl,
  ];

  try {
    await db.query(
      `INSERT INTO client_profiles
         (user_id, customer_id,
          display_name, phone, alternate_email, designation, department,
          company_name, gst_number, pan_number, company_website,
          address_line1, address_line2, city, state, pincode, country,
          language, timezone,
          notification_email, notification_in_app, notification_sms,
          avatar_url, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE
         customer_id         = VALUES(customer_id),
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

    const [rows] = await db.query(
      'SELECT * FROM client_profiles WHERE user_id = ?', [user_id]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('[PUT /client-profile] Error:', e.message, e.sqlMessage);
    sendErr(res, 500, e.sqlMessage || 'Failed to save profile');
  }
});
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

  if (!user_id) return sendErr(res, 400, 'user_id is required');

  // Reject avatar_url if it's a base64 blob (> 200 chars = not a real URL)
  const safeAvatarUrl = avatar_url && avatar_url.length < 500 ? avatar_url : null;

  const vals = [
    user_id,
    customer_id        || null,
    display_name       || null,
    phone              || null,
    alternate_email    || null,
    designation        || null,
    department         || null,
    company_name       || null,
    gst_number         || null,
    pan_number         || null,
    company_website    || null,
    address_line1      || null,
    address_line2      || null,
    city               || null,
    state              || null,
    pincode            || null,
    country            || 'India',
    language           || 'en',
    timezone           || 'Asia/Kolkata',
    notification_email  !== false ? 1 : 0,
    notification_in_app !== false ? 1 : 0,
    notification_sms    === true  ? 1 : 0,
    safeAvatarUrl,
  ];

  try {
    await db.query(
      `INSERT INTO client_profiles
         (user_id, customer_id,
          display_name, phone, alternate_email, designation, department,
          company_name, gst_number, pan_number, company_website,
          address_line1, address_line2, city, state, pincode, country,
          language, timezone,
          notification_email, notification_in_app, notification_sms,
          avatar_url, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE
         customer_id         = VALUES(customer_id),
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
    const [rows] = await db.query(
      'SELECT * FROM client_profiles WHERE user_id = ?', [user_id]
    );
    res.json(rows[0]);
  } catch (e) {
    // 👇 Log the FULL MySQL error so you can see exactly what's wrong
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
module.exports.notifySampleStatus = notifySampleStatus;
module.exports.notifyOrderNew     = notifyOrderNew;
module.exports.notifyOrderStatus  = notifyOrderStatus;
module.exports.notifyChatMessage  = notifyChatMessage;
module.exports.notifyReportReady  = notifyReportReady;