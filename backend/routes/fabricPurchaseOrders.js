// backend/routes/fabric-purchase-orders.js

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { auth } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — introspect production_plans columns once at startup
// ─────────────────────────────────────────────────────────────────────────────
let _planCols = null;
const getPlanColumns = async () => {
  if (_planCols) return _planCols;
  const [rows] = await db.query('DESCRIBE production_plans');
  _planCols = new Set(rows.map(r => r.Field));
  return _planCols;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — shared FPO number generator
// Format: FPO-YYYY-001  (3-digit zero-padded, resets each year)
// ─────────────────────────────────────────────────────────────────────────────
const generateNextFpoNo = async () => {
  const year   = new Date().getFullYear();
  const prefix = `FPO-${year}-`;

  const [rows] = await db.query(
    `SELECT fpo_no
     FROM fabric_purchase_orders
     WHERE fpo_no LIKE ?
     ORDER BY id DESC
     LIMIT 1`,
    [`${prefix}%`]
  );

  let nextSeq = 1;
  if (rows.length > 0) {
    const lastSeqStr = rows[0].fpo_no.split('-').pop();
    const lastSeq    = parseInt(lastSeqStr, 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fabric-purchase-orders/pending-purchase
// Returns production_plans that have purchase_qty > 0 and no FPO linked yet.
// Dynamically selects columns that exist so it works across schema versions.
//
// FIX (June 2026): "fpo_id IS NULL" was excluding everything when fpo_id is
// declared NOT NULL DEFAULT 0 — 0 is never NULL, so no row ever qualified.
// Now treats NULL *and* 0 (and empty string for fpo_no) as "unlinked".
//
// DIAGNOSTIC (June 2026): logs which physical database this connection is
// actually pointed at (SELECT DATABASE()). If this route ever returns 0 rows
// while MySQL Workbench shows real data, compare this log line against the
// `USE <db>;` line you ran in Workbench — a mismatch here (e.g. Node connects
// to "fabric_flow_dev" while Workbench queries "fabricflow") is a classic,
// silent cause of "table has data but API returns empty array".
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pending-purchase', auth, async (req, res) => {
  try {
    // ── DIAGNOSTIC: which DB is this connection actually using? ──
    const [[{ db_name }]] = await db.query('SELECT DATABASE() AS db_name');
    console.log(`[pending-purchase] connected database = "${db_name}"`);

    const cols = await getPlanColumns();

    // ── Column availability guards ──
    const hasFpoId              = cols.has('fpo_id');
    const hasFpoNo              = cols.has('fpo_no');
    const hasRecNo              = cols.has('rec_no');
    const hasCustomerName       = cols.has('customer_name');
    const hasOrderSortNo        = cols.has('order_sort_no');
    const hasConstnForProd      = cols.has('constn_for_production');
    const hasConstruction       = cols.has('construction');        // alternate name
    const hasPurchaseSpecialIns = cols.has('purchase_special_instruction');
    const hasRecDate            = cols.has('rec_date');
    const hasPlanDate           = cols.has('plan_date');          // alternate name
    const hasOrderType          = cols.has('order_type');
    const hasOrderNo            = cols.has('order_no');
    const hasPurchaseQty        = cols.has('purchase_qty');

    if (!hasPurchaseQty) {
      return res.status(500).json({ message: 'production_plans.purchase_qty column missing.' });
    }

    // ── DIAGNOSTIC: row counts at each stage, regardless of outcome ──
    const [[{ cnt: totalCnt }]] = await db.query('SELECT COUNT(*) AS cnt FROM production_plans');
    const [[{ cnt: qtyCnt }]]   = await db.query('SELECT COUNT(*) AS cnt FROM production_plans WHERE purchase_qty > 0');
    console.log(`[pending-purchase] total plans=${totalCnt} | purchase_qty>0=${qtyCnt}`);

    if (hasFpoId) {
      const [[{ cnt: linkedCnt }]] = await db.query(
        'SELECT COUNT(*) AS cnt FROM production_plans WHERE purchase_qty > 0 AND fpo_id IS NOT NULL AND fpo_id != 0'
      );
      console.log(`[pending-purchase] of those, already linked via fpo_id=${linkedCnt} | should remain unlinked=${qtyCnt - linkedCnt}`);
    }

    // Build SELECT list dynamically
    const selectCols = [
      'id',
      hasRecNo ? 'rec_no' : 'CAST(id AS CHAR) AS rec_no',   // fallback if rec_no doesn't exist
      hasRecDate  ? 'rec_date'  : hasPlanDate ? 'plan_date AS rec_date' : 'NULL AS rec_date',
      hasOrderType ? 'order_type' : 'NULL AS order_type',
      hasOrderNo   ? 'order_no'   : 'NULL AS order_no',
      hasCustomerName       ? 'customer_name'             : 'NULL AS customer_name',
      // order_sort_no — the key autofill field (Sort No in items table)
      hasOrderSortNo        ? 'order_sort_no'             : 'NULL AS order_sort_no',
      // constn_for_production — the key autofill field (Construction in items table)
      hasConstnForProd      ? 'constn_for_production'     :
        hasConstruction     ? 'construction AS constn_for_production' :
                              'NULL AS constn_for_production',
      'purchase_qty',
      hasPurchaseSpecialIns ? 'purchase_special_instruction' : 'NULL AS purchase_special_instruction',
    ];

    // Only show plans not yet linked to an FPO
    // FIXED: fpo_id may be NOT NULL DEFAULT 0 rather than nullable, so check both.
    const whereParts = ['purchase_qty > 0'];
    if (hasFpoId) {
      whereParts.push('(fpo_id IS NULL OR fpo_id = 0)');
    } else if (hasFpoNo) {
      whereParts.push('(fpo_no IS NULL OR fpo_no = \'\')');
    }

    const sql = `
      SELECT ${selectCols.join(', \n             ')}
      FROM   production_plans
      WHERE  ${whereParts.join(' AND ')}
      ORDER  BY id DESC
    `;

    console.log('[pending-purchase] SQL:\n', sql);
    const [rows] = await db.query(sql);

    // Normalise so the frontend always gets a consistent shape
    const normalised = rows.map(r => ({
      id:                           Number(r.id),
      rec_no:                       String(r.rec_no ?? ''),
      rec_date:                     r.rec_date ?? null,
      order_type:                   r.order_type ?? '',
      order_no:                     String(r.order_no ?? ''),
      customer_name:                r.customer_name ?? '',
      order_sort_no:                r.order_sort_no != null ? String(r.order_sort_no) : '',
      constn_for_production:        r.constn_for_production ?? '',
      purchase_qty:                 Number(r.purchase_qty) || 0,
      purchase_special_instruction: r.purchase_special_instruction ?? '',
    }));

    console.log(`[pending-purchase] returning ${normalised.length} plan(s)`);
    res.json(normalised);

  } catch (err) {
    console.error('[GET /fabric-purchase-orders/pending-purchase]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET ALL FPOs
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id, fpo_no, fpo_date, supplier,
        plan_id, plan_rec_no, order_no, purchase_qty,
        billing_from, delivery_to, pay_terms, pinning,
        packing_type, rate_type, freight, delivery_dt, remarks,
        cgst_pct, sgst_pct, igst_pct,
        sub_total, cgst_amt, sgst_amt, igst_amt, net_value,
        created_at, updated_at
      FROM fabric_purchase_orders
      ORDER BY id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /fabric-purchase-orders ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a. GET NEXT FPO NO — MUST come BEFORE /:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/next-fpo', auth, async (req, res) => {
  try {
    const fpo_no = await generateNextFpoNo();
    console.log('✅ next-fpo generated:', fpo_no);
    res.json({ fpo_no });
  } catch (err) {
    console.error('❌ GET /fabric-purchase-orders/next-fpo ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get('/next-no', auth, async (req, res) => {
  try {
    const fpo_no = await generateNextFpoNo();
    res.json({ fpo_no });
  } catch (err) {
    console.error('❌ GET /fabric-purchase-orders/next-no ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET SINGLE FPO WITH LINE ITEMS  (/:id must come AFTER all named routes)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const [[fpo]] = await db.query(
      'SELECT * FROM fabric_purchase_orders WHERE id = ?',
      [req.params.id]
    );
    if (!fpo) return res.status(404).json({ message: 'FPO not found' });

    const [items] = await db.query(
      'SELECT * FROM fpo_items WHERE fpo_id = ? ORDER BY id ASC',
      [req.params.id]
    );
    res.json({ ...fpo, items });
  } catch (err) {
    console.error('❌ GET /fabric-purchase-orders/:id ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CREATE NEW FPO  (POST /)
//    When plan_id is provided, stamps the Production Plan row so it drops
//    off the pending-purchase list.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const {
      fpo_no, fpo_date, supplier,
      billing_from, delivery_to, pay_terms, pinning,
      packing_type, rate_type, freight, delivery_dt, remarks,
      cgst_pct, sgst_pct, igst_pct,
      sub_total, cgst_amt, sgst_amt, igst_amt, net_value,
      plan_id, plan_rec_no, order_no, purchase_qty,
      items = [],
    } = req.body;

    const [r] = await conn.query(`
      INSERT INTO fabric_purchase_orders (
        fpo_no, fpo_date, supplier,
        billing_from, delivery_to, pay_terms, pinning,
        packing_type, rate_type, freight, delivery_dt, remarks,
        cgst_pct, sgst_pct, igst_pct,
        sub_total, cgst_amt, sgst_amt, igst_amt, net_value,
        plan_id, plan_rec_no, order_no, purchase_qty
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )`,
      [
        fpo_no, fpo_date || null, supplier,
        billing_from || null, delivery_to || null, pay_terms || null, pinning || null,
        packing_type || null, rate_type || null, freight || null,
        delivery_dt || null, remarks || null,
        cgst_pct  || 0, sgst_pct  || 0, igst_pct  || 0,
        sub_total || 0, cgst_amt  || 0, sgst_amt  || 0,
        igst_amt  || 0, net_value || 0,
        plan_id   || null, plan_rec_no || null,
        order_no  || null, purchase_qty || 0,
      ]
    );

    const fpoId = r.insertId;

    for (const item of items) {
      await conn.query(
        `INSERT INTO fpo_items
           (fpo_id, sort_no, construction, hsn_code, qty, rate, basic_value)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          fpoId,
          item.sort_no      || '',
          item.construction || '',
          item.hsn_code     || '',
          item.qty          || 0,
          item.rate         || 0,
          item.basic_value  || 0,
        ]
      );
    }

    // ── Stamp the plan so it vanishes from pending-purchase ──
    if (plan_id) {
      const cols = await getPlanColumns();
      const stampParts = [];
      const stampVals  = [];

      if (cols.has('fpo_id')) { stampParts.push('fpo_id = ?');  stampVals.push(fpoId); }
      if (cols.has('fpo_no')) { stampParts.push('fpo_no = ?');  stampVals.push(fpo_no); }

      if (stampParts.length > 0) {
        stampVals.push(plan_id);
        await conn.query(
          `UPDATE production_plans SET ${stampParts.join(', ')} WHERE id = ?`,
          stampVals
        );
        console.log(`✅ Stamped production_plan id=${plan_id} with fpo_id=${fpoId} fpo_no=${fpo_no}`);
      } else {
        console.warn('⚠ production_plans has neither fpo_id nor fpo_no column — plan not stamped');
      }
    }

    await conn.commit();
    console.log('✅ FPO INSERT success — id:', fpoId, '| fpo_no:', fpo_no);
    res.status(201).json({ id: fpoId, fpo_no });

  } catch (err) {
    await conn.rollback();
    console.error('❌ POST /fabric-purchase-orders ERROR:', err.message);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: 'This FPO number was just used. Refresh and try again.',
        code: err.code,
      });
    }
    res.status(500).json({ message: err.message, code: err.code });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. UPDATE EXISTING FPO  (PUT /:id)
//    plan_id / plan_rec_no / order_no / purchase_qty excluded — link is permanent.
//    Line items replaced wholesale (delete-then-insert).
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const {
      fpo_no, fpo_date, supplier,
      billing_from, delivery_to, pay_terms, pinning,
      packing_type, rate_type, freight, delivery_dt, remarks,
      cgst_pct, sgst_pct, igst_pct,
      sub_total, cgst_amt, sgst_amt, igst_amt, net_value,
      items = [],
    } = req.body;

    await conn.query(`
      UPDATE fabric_purchase_orders SET
        fpo_no        = ?,
        fpo_date      = ?,
        supplier      = ?,
        billing_from  = ?,
        delivery_to   = ?,
        pay_terms     = ?,
        pinning       = ?,
        packing_type  = ?,
        rate_type     = ?,
        freight       = ?,
        delivery_dt   = ?,
        remarks       = ?,
        cgst_pct      = ?,
        sgst_pct      = ?,
        igst_pct      = ?,
        sub_total     = ?,
        cgst_amt      = ?,
        sgst_amt      = ?,
        igst_amt      = ?,
        net_value     = ?
      WHERE id = ?`,
      [
        fpo_no, fpo_date || null, supplier,
        billing_from || null, delivery_to || null,
        pay_terms || null, pinning || null,
        packing_type || null, rate_type || null,
        freight || null, delivery_dt || null, remarks || null,
        cgst_pct  || 0, sgst_pct  || 0, igst_pct  || 0,
        sub_total || 0, cgst_amt  || 0, sgst_amt  || 0,
        igst_amt  || 0, net_value || 0,
        req.params.id,
      ]
    );

    await conn.query('DELETE FROM fpo_items WHERE fpo_id = ?', [req.params.id]);
    for (const item of items) {
      await conn.query(
        `INSERT INTO fpo_items
           (fpo_id, sort_no, construction, hsn_code, qty, rate, basic_value)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id,
          item.sort_no      || '',
          item.construction || '',
          item.hsn_code     || '',
          item.qty          || 0,
          item.rate         || 0,
          item.basic_value  || 0,
        ]
      );
    }

    await conn.commit();
    console.log('✅ FPO UPDATE success — id:', req.params.id);
    res.json({ message: 'Updated' });

  } catch (err) {
    await conn.rollback();
    console.error('❌ PUT /fabric-purchase-orders/:id ERROR:', err.message);
    res.status(500).json({ message: err.message, code: err.code });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. DELETE FPO  (DELETE /:id)
//    Unlinks plan if present so it reappears in pending-purchase dropdown.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[fpo]] = await conn.query(
      'SELECT plan_id FROM fabric_purchase_orders WHERE id = ?',
      [req.params.id]
    );

    if (fpo && fpo.plan_id) {
      const cols       = await getPlanColumns();
      const clearParts = [];
      if (cols.has('fpo_id')) clearParts.push('fpo_id = NULL');
      if (cols.has('fpo_no')) clearParts.push('fpo_no = NULL');
      if (clearParts.length > 0) {
        await conn.query(
          `UPDATE production_plans SET ${clearParts.join(', ')} WHERE id = ?`,
          [fpo.plan_id]
        );
        console.log(`✅ Unlinked plan id=${fpo.plan_id} — it will reappear in pending-purchase`);
      }
    }

    await conn.query('DELETE FROM fpo_items WHERE fpo_id = ?', [req.params.id]);
    await conn.query('DELETE FROM fabric_purchase_orders WHERE id = ?', [req.params.id]);

    await conn.commit();
    console.log('✅ FPO DELETE success — id:', req.params.id);
    res.json({ message: 'Deleted' });

  } catch (err) {
    await conn.rollback();
    console.error('❌ DELETE /fabric-purchase-orders/:id ERROR:', err.message);
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;