// backend/routes/chat.js
const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// ── GET messages ──────────────────────────────────────────────────────────────
// /api/chat/messages?sample_request_id=X&user_id=Y
router.get('/messages', async (req, res) => {
  const { sample_request_id, user_id } = req.query;
  if (!sample_request_id) return res.status(400).json({ error: 'sample_request_id required' });

  try {
    const [rows] = await db.query(
      `SELECT id, sample_request_id, user_id, sender, message, is_read, created_at
       FROM chat_messages
       WHERE sample_request_id = ?
       ORDER BY created_at ASC`,
      [sample_request_id]
    );

    // Mark admin messages as read for this user
    if (user_id) {
      await db.query(
        `UPDATE chat_messages
         SET is_read = 1
         WHERE sample_request_id = ? AND sender IN ('admin','bot') AND is_read = 0`,
        [sample_request_id]
      );
    }

    res.json(rows);
  } catch (err) {
    console.error('GET /chat/messages error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat/mark-read
router.post('/mark-read', async (req, res) => {
  try {
    const { sample_request_id } = req.body;
    if (!sample_request_id) return res.status(400).json({ message: 'sample_request_id required' });
    await run(
      `UPDATE chat_messages SET is_read = 1 WHERE sample_request_id = ? AND sender != 'admin'`,
      [sample_request_id]
    );
    res.json({ message: 'Messages marked as read' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST message ──────────────────────────────────────────────────────────────
router.post('/messages', async (req, res) => {
  const { sample_request_id, user_id, sender, message } = req.body;

  if (!sample_request_id || !sender || !message) {
    return res.status(400).json({
      error: 'sample_request_id, sender, and message are required',
    });
  }
  if (!['user', 'admin', 'bot'].includes(sender)) {
    return res.status(400).json({ error: 'sender must be user | admin | bot' });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO chat_messages (sample_request_id, user_id, sender, message, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [sample_request_id, user_id || null, sender, message]
    );
    const [rows] = await db.query('SELECT * FROM chat_messages WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /chat/messages error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET unread count per sample (for admin) ───────────────────────────────────
router.get('/unread', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT sample_request_id, COUNT(*) as count
       FROM chat_messages
       WHERE sender = 'user' AND is_read = 0
       GROUP BY sample_request_id`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET all conversations (admin overview) ────────────────────────────────────
router.get('/conversations', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT cm.sample_request_id,
              sr.request_code, sr.customer_name, sr.status,
              cm.message AS last_message, cm.created_at AS last_time,
              SUM(CASE WHEN cm2.sender='user' AND cm2.is_read=0 THEN 1 ELSE 0 END) AS unread_count
       FROM chat_messages cm
       JOIN sample_requests sr ON sr.id = cm.sample_request_id
       LEFT JOIN chat_messages cm2 ON cm2.sample_request_id = cm.sample_request_id
       WHERE cm.id = (
         SELECT MAX(id) FROM chat_messages c2 WHERE c2.sample_request_id = cm.sample_request_id
       )
       GROUP BY cm.sample_request_id
       ORDER BY cm.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
