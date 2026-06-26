// routes/workOrders.js
const express = require('express');
const router  = express.Router();
const db      = require('../db/connection'); // mysql2/promise pool

// ── Helper: normalize any date string → YYYY-MM-DD (or null) ─
function toDateOnly(val) {
  if (!val) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;          // already clean
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);                        // strip time part
}

// ── Generate WO-YYYY-NNN inside an open transaction ──────────
async function generateWoNo(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(wo_no, '-', -1) AS UNSIGNED)) AS max_seq
     FROM work_orders WHERE wo_no LIKE ?`,
    [`WO-${year}-%`],
  );
  const seq = (row.max_seq ?? 0) + 1;
  return `WO-${year}-${String(seq).padStart(3, '0')}`;
}

// ── Fetch full WO object (header + warp rows + weft rows) ────
async function fetchWO(id) {
  const [[header]] = await db.query('SELECT * FROM work_orders WHERE id = ?', [id]);
  if (!header) return null;
  const [warpRows] = await db.query(
    'SELECT * FROM work_order_warp_details WHERE wo_id = ? ORDER BY sort_order, id', [id],
  );
  const [weftRows] = await db.query(
    'SELECT * FROM work_order_weft_details WHERE wo_id = ? ORDER BY sort_order, id', [id],
  );
  return { ...header, warp_details: warpRows, weft_details: weftRows };
}

// ─────────────────────────────────────────────────────────────
// GET /api/work-orders   — list with search, status filter, pagination
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', wo_type = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (wo_no LIKE ? OR co_no LIKE ? OR co_sort_no LIKE ? OR order_plan_no LIKE ? OR production_location LIKE ?)';
      const q = `%${search}%`;
      params.push(q, q, q, q, q);
    }
    if (status)  { where += ' AND status = ?';  params.push(status); }
    if (wo_type) { where += ' AND wo_type = ?'; params.push(wo_type); }

    const [rows] = await db.query(
      `SELECT * FROM work_orders ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM work_orders ${where}`, params,
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch work orders' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/work-orders/:id
// ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const wo = await fetchWO(req.params.id);
    if (!wo) return res.status(404).json({ message: 'Work order not found' });
    res.json(wo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching work order' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/work-orders  — create
// ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const woNo = await generateWoNo(conn);

    const {
      wo_date, wo_type,
      order_plan_no, co_no, co_sort_no, co_cons, roll_length, confirmed_by, co_comp_date,
      production_type, production_location,
      rate_type, pick_rate, per_mtr_rate,
      no_of_fabric_per_loom, total_planned_meters, previous_wo_meters, pwo_meter,
      loom_width, no_of_looms, direct_fab_prod,
      spl_instruction, remarks, weaver_instruction,
      status = 'Draft', created_by,
      warp_details = [], weft_details = [],
    } = req.body;

    const [result] = await conn.query(
      `INSERT INTO work_orders
         (wo_no, wo_date, wo_type,
          order_plan_no, co_no, co_sort_no, co_cons, roll_length, confirmed_by, co_comp_date,
          production_type, production_location,
          rate_type, pick_rate, per_mtr_rate,
          no_of_fabric_per_loom, total_planned_meters, previous_wo_meters, pwo_meter,
          loom_width, no_of_looms, direct_fab_prod,
          spl_instruction, remarks, weaver_instruction, status, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        woNo,
        toDateOnly(wo_date),
        wo_type || 'Bulk',
        order_plan_no || null,
        co_no         || null,
        co_sort_no    || null,
        co_cons       || null,
        roll_length   || null,
        confirmed_by  || null,
        toDateOnly(co_comp_date),             // ← fixed
        production_type    || 'In-house',
        production_location || null,
        rate_type || 'Per Mtr',
        pick_rate    ? Number(pick_rate)    : null,
        per_mtr_rate ? Number(per_mtr_rate) : null,
        no_of_fabric_per_loom ? Number(no_of_fabric_per_loom) : 1,
        total_planned_meters  ? Number(total_planned_meters)  : null,
        previous_wo_meters    ? Number(previous_wo_meters)    : 0,
        pwo_meter  ? Number(pwo_meter)  : null,
        loom_width || null,
        no_of_looms ? Number(no_of_looms) : null,
        direct_fab_prod ? 1 : 0,
        spl_instruction    || null,
        remarks            || null,
        weaver_instruction || null,
        status,
        created_by || null,
      ],
    );
    const woId = result.insertId;

    // Insert warp grid rows
    for (let i = 0; i < warp_details.length; i++) {
      const w = warp_details[i];
      await conn.query(
        `INSERT INTO work_order_warp_details
           (wo_id, beam_number, warp_type, warp_count, actual_count, warp_ends,
            reed, reed_space, warp_wt_per_mtr, crimp_pct, warp_mtr, warp_req, sort_order)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          woId,
          w.beam_number    || 'Beam 1',
          w.warp_type      || null,
          w.warp_count     || null,
          w.actual_count   || null,
          w.warp_ends      ? Number(w.warp_ends)      : null,
          w.reed           || null,
          w.reed_space     || null,
          w.warp_wt_per_mtr ? Number(w.warp_wt_per_mtr) : null,
          w.crimp_pct      ? Number(w.crimp_pct)      : 0,
          w.warp_mtr       ? Number(w.warp_mtr)       : null,
          w.warp_req       ? Number(w.warp_req)       : null,
          i,
        ],
      );
    }

    // Insert weft grid rows
    for (let i = 0; i < weft_details.length; i++) {
      const w = weft_details[i];
      await conn.query(
        `INSERT INTO work_order_weft_details
           (wo_id, weft_count, actual_count, onloom_pick, weft_wt_per_mtr, weft_req, sort_order)
         VALUES (?,?,?,?,?,?,?)`,
        [
          woId,
          w.weft_count     || null,
          w.actual_count   || null,
          w.onloom_pick    ? Number(w.onloom_pick)    : null,
          w.weft_wt_per_mtr ? Number(w.weft_wt_per_mtr) : null,
          w.weft_req       ? Number(w.weft_req)       : null,
          i,
        ],
      );
    }

    await conn.commit();
    const created = await fetchWO(woId);
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to create work order' });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/work-orders/:id  — update
// ─────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    const {
      wo_date, wo_type,
      order_plan_no, co_no, co_sort_no, co_cons, roll_length, confirmed_by, co_comp_date,
      production_type, production_location,
      rate_type, pick_rate, per_mtr_rate,
      no_of_fabric_per_loom, total_planned_meters, previous_wo_meters, pwo_meter,
      loom_width, no_of_looms, direct_fab_prod,
      spl_instruction, remarks, weaver_instruction,
      status,
      warp_details = [], weft_details = [],
    } = req.body;

    await conn.query(
      `UPDATE work_orders SET
         wo_date=?, wo_type=?,
         order_plan_no=?, co_no=?, co_sort_no=?, co_cons=?, roll_length=?,
         confirmed_by=?, co_comp_date=?,
         production_type=?, production_location=?,
         rate_type=?, pick_rate=?, per_mtr_rate=?,
         no_of_fabric_per_loom=?, total_planned_meters=?, previous_wo_meters=?,
         pwo_meter=?, loom_width=?, no_of_looms=?, direct_fab_prod=?,
         spl_instruction=?, remarks=?, weaver_instruction=?, status=?
       WHERE id=?`,
      [
        toDateOnly(wo_date),                  // ← fixed
        wo_type || 'Bulk',
        order_plan_no  || null,
        co_no          || null,
        co_sort_no     || null,
        co_cons        || null,
        roll_length    || null,
        confirmed_by   || null,
        toDateOnly(co_comp_date),             // ← fixed
        production_type    || 'In-house',
        production_location || null,
        rate_type || 'Per Mtr',
        pick_rate    ? Number(pick_rate)    : null,
        per_mtr_rate ? Number(per_mtr_rate) : null,
        no_of_fabric_per_loom ? Number(no_of_fabric_per_loom) : 1,
        total_planned_meters  ? Number(total_planned_meters)  : null,
        previous_wo_meters    ? Number(previous_wo_meters)    : 0,
        pwo_meter  ? Number(pwo_meter)  : null,
        loom_width || null,
        no_of_looms ? Number(no_of_looms) : null,
        direct_fab_prod ? 1 : 0,
        spl_instruction    || null,
        remarks            || null,
        weaver_instruction || null,
        status || 'Draft',
        id,
      ],
    );

    // Replace warp rows
    await conn.query('DELETE FROM work_order_warp_details WHERE wo_id = ?', [id]);
    for (let i = 0; i < warp_details.length; i++) {
      const w = warp_details[i];
      await conn.query(
        `INSERT INTO work_order_warp_details
           (wo_id, beam_number, warp_type, warp_count, actual_count, warp_ends,
            reed, reed_space, warp_wt_per_mtr, crimp_pct, warp_mtr, warp_req, sort_order)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          w.beam_number    || 'Beam 1',
          w.warp_type      || null,
          w.warp_count     || null,
          w.actual_count   || null,
          w.warp_ends      ? Number(w.warp_ends)      : null,
          w.reed           || null,
          w.reed_space     || null,
          w.warp_wt_per_mtr ? Number(w.warp_wt_per_mtr) : null,
          w.crimp_pct      ? Number(w.crimp_pct)      : 0,
          w.warp_mtr       ? Number(w.warp_mtr)       : null,
          w.warp_req       ? Number(w.warp_req)       : null,
          i,
        ],
      );
    }

    // Replace weft rows
    await conn.query('DELETE FROM work_order_weft_details WHERE wo_id = ?', [id]);
    for (let i = 0; i < weft_details.length; i++) {
      const w = weft_details[i];
      await conn.query(
        `INSERT INTO work_order_weft_details
           (wo_id, weft_count, actual_count, onloom_pick, weft_wt_per_mtr, weft_req, sort_order)
         VALUES (?,?,?,?,?,?,?)`,
        [
          id,
          w.weft_count     || null,
          w.actual_count   || null,
          w.onloom_pick    ? Number(w.onloom_pick)    : null,
          w.weft_wt_per_mtr ? Number(w.weft_wt_per_mtr) : null,
          w.weft_req       ? Number(w.weft_req)       : null,
          i,
        ],
      );
    }

    await conn.commit();
    const updated = await fetchWO(id);
    res.json(updated);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to update work order' });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/work-orders/:id/status  — approve / status change
// ─────────────────────────────────────────────────────────────
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, approved_by } = req.body;
    const approvedAt = ['Approved'].includes(status) ? new Date() : null;
    await db.query(
      'UPDATE work_orders SET status=?, approved_by=?, approved_at=? WHERE id=?',
      [status, approved_by || null, approvedAt, req.params.id],
    );
    const updated = await fetchWO(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update status' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/work-orders/:id
// ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM work_orders WHERE id = ?', [req.params.id]);
    res.json({ message: 'Work order deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete work order' });
  }
});

module.exports = router;