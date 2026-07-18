// backend/routes/fabric-purchase-orders.js
//
// FIX (THIS REVISION):
//   1. PERSISTENCE BUG: ship_from, company_id, due_date, place_of_supply,
//      advance, and description were being silently dropped on save. The
//      frontend has sent these fields for a while (see FabricPurchaseOrders.tsx
//      comments), but the INSERT/UPDATE/SELECT statements here never
//      referenced them, so every FPO was created/updated with those columns
//      left at their DB default (NULL / 0) regardless of what was picked on
//      screen. This is why:
//        - "Ship From" never made it into the database.
//        - The printed PO header always fell back to FALLBACK_COMPANY, even
//          after picking a company in "Company (Print Header)" — company_id
//          was never saved.
//      Fixed by adding all six columns to the CREATE/UPDATE INSERTs and to
//      the GET-all SELECT list (GET /:id already used SELECT * so it was
//      unaffected once the columns exist in the DB — see migration note
//      below).
//
//   2. DELETE 500 BUG: deleting an FPO that has already been converted to a
//      Purchase Invoice (fabric_purchase_invoices.fpo_id references this
//      row) hit the DB's foreign-key constraint and threw a raw, unhelpful
//      500. Fixed by explicitly checking for FK violation error codes and
//      returning a clear 409 with an actionable message instead, and by
//      including err.sqlMessage in every 500 response so the real cause is
//      visible in the Network tab without needing server console access.
//
//   REQUIRED ONE-TIME DB MIGRATION (run this before deploying, MySQL 8+):
//
//     ALTER TABLE fabric_purchase_orders
//       ADD COLUMN IF NOT EXISTS ship_from        VARCHAR(255) NULL,
//       ADD COLUMN IF NOT EXISTS due_date         DATE         NULL,
//       ADD COLUMN IF NOT EXISTS place_of_supply  VARCHAR(255) NULL,
//       ADD COLUMN IF NOT EXISTS advance          DECIMAL(12,2) NULL DEFAULT 0,
//       ADD COLUMN IF NOT EXISTS description      TEXT         NULL,
//       ADD COLUMN IF NOT EXISTS company_id       INT          NULL;
//
//   If your MySQL version doesn't support "ADD COLUMN IF NOT EXISTS", drop
//   the "IF NOT EXISTS" and run each ADD COLUMN individually, skipping any
//   that already exist.

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
// HELPER — introspect fabric_purchase_orders columns once at startup.
// Used so this route degrades gracefully (instead of throwing "unknown
// column") if the migration above hasn't been run yet in a given
// environment — the new fields are simply omitted from the query rather
// than crashing the whole save.
// ─────────────────────────────────────────────────────────────────────────────
let _fpoCols = null;
const getFpoColumns = async () => {
  if (_fpoCols) return _fpoCols;
  const [rows] = await db.query('DESCRIBE fabric_purchase_orders');
  _fpoCols = new Set(rows.map(r => r.Field));
  return _fpoCols;
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
// HELPER — fiscal year string for the counter table, e.g. "25-26"
// Indian FY: April 1 → March 31. This is the ONLY place the format is
// generated — change it here if you want e.g. "2025-26" instead.
// ─────────────────────────────────────────────────────────────────────────────
const getFiscalYear = (d = new Date()) => {
  const y = d.getFullYear();
  const startYear   = d.getMonth() >= 3 ? y : y - 1; // month 3 = April (0-indexed)
  const shortStart  = String(startYear).slice(-2);
  const shortEnd    = String(startYear + 1).slice(-2);
  return `${shortStart}-${shortEnd}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — next internal reference number, e.g. "PINV/25-26/001"
// Reads/increments fabric_purchase_invoice_counters (one row per FY) inside
// the caller's transaction so the increment is atomic and rolls back with
// everything else if the conversion fails.
// ─────────────────────────────────────────────────────────────────────────────
const generateNextInternalRefNo = async (conn) => {
  const fy = getFiscalYear();

  // Ensure a counter row exists for this FY.
  await conn.query(
    `INSERT INTO fabric_purchase_invoice_counters (fy, last_no)
     VALUES (?, 0)
     ON DUPLICATE KEY UPDATE fy = fy`,
    [fy]
  );

  // Lock the row for this transaction, then increment.
  const [[row]] = await conn.query(
    `SELECT last_no FROM fabric_purchase_invoice_counters WHERE fy = ? FOR UPDATE`,
    [fy]
  );
  const nextNo = (row?.last_no || 0) + 1;
  await conn.query(
    `UPDATE fabric_purchase_invoice_counters SET last_no = ? WHERE fy = ?`,
    [nextNo, fy]
  );

  return `PINV/${fy}/${String(nextNo).padStart(3, '0')}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fabric-purchase-orders/pending-purchase
// Returns production_plans that have purchase_qty > 0 and no FPO linked yet.
// Dynamically selects columns that exist so it works across schema versions.
// (unchanged from previous revision)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pending-purchase', auth, async (req, res) => {
  try {
    const [[{ db_name }]] = await db.query('SELECT DATABASE() AS db_name');
    console.log(`[pending-purchase] connected database = "${db_name}"`);

    const cols = await getPlanColumns();

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

    const [[{ cnt: totalCnt }]] = await db.query('SELECT COUNT(*) AS cnt FROM production_plans');
    const [[{ cnt: qtyCnt }]]   = await db.query('SELECT COUNT(*) AS cnt FROM production_plans WHERE purchase_qty > 0');
    console.log(`[pending-purchase] total plans=${totalCnt} | purchase_qty>0=${qtyCnt}`);

    if (hasFpoId) {
      const [[{ cnt: linkedCnt }]] = await db.query(
        'SELECT COUNT(*) AS cnt FROM production_plans WHERE purchase_qty > 0 AND fpo_id IS NOT NULL AND fpo_id != 0'
      );
      console.log(`[pending-purchase] of those, already linked via fpo_id=${linkedCnt} | should remain unlinked=${qtyCnt - linkedCnt}`);
    }

    const selectCols = [
      'id',
      hasRecNo ? 'rec_no' : 'CAST(id AS CHAR) AS rec_no',
      hasRecDate  ? 'rec_date'  : hasPlanDate ? 'plan_date AS rec_date' : 'NULL AS rec_date',
      hasOrderType ? 'order_type' : 'NULL AS order_type',
      hasOrderNo   ? 'order_no'   : 'NULL AS order_no',
      hasCustomerName       ? 'customer_name'             : 'NULL AS customer_name',
      hasOrderSortNo        ? 'order_sort_no'             : 'NULL AS order_sort_no',
      hasConstnForProd      ? 'constn_for_production'     :
        hasConstruction     ? 'construction AS constn_for_production' :
                              'NULL AS constn_for_production',
      'purchase_qty',
      hasPurchaseSpecialIns ? 'purchase_special_instruction' : 'NULL AS purchase_special_instruction',
    ];

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
//    FIX: now includes ship_from, company_id, due_date, place_of_supply,
//    advance, description — these were missing before, so the table/list
//    view and export never carried them even on records where they *were*
//    saved via a direct SQL edit.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const cols = await getFpoColumns();
    const optionalCols = ['ship_from', 'company_id', 'due_date', 'place_of_supply', 'advance', 'description']
      .filter(c => cols.has(c));

    const [rows] = await db.query(`
      SELECT
        id, fpo_no, fpo_date, supplier,
        plan_id, plan_rec_no, order_no, purchase_qty,
        billing_from, delivery_to, pay_terms, pinning,
        packing_type, rate_type, freight, delivery_dt, remarks,
        cgst_pct, sgst_pct, igst_pct,
        sub_total, cgst_amt, sgst_amt, igst_amt, net_value,
        status, invoice_no, invoice_id,
        ${optionalCols.length ? optionalCols.join(', ') + ',' : ''}
        created_at, updated_at
      FROM fabric_purchase_orders
      ORDER BY id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /fabric-purchase-orders ERROR:', err.message);
    res.status(500).json({ message: err.message, sqlMessage: err.sqlMessage });
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
//    Uses SELECT * so it already returns ship_from/company_id/etc. once the
//    migration has been run — no change needed here beyond the fix in
//    CREATE/UPDATE that actually populates those columns.
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
    res.status(500).json({ message: err.message, sqlMessage: err.sqlMessage });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CREATE NEW FPO  (POST /)
//    FIX: ship_from, company_id, due_date, place_of_supply, advance,
//    description are now read from the body and written to the DB. Columns
//    are added dynamically (via getFpoColumns) so this doesn't crash in an
//    environment where the migration hasn't been run yet — it just silently
//    skips whichever of the six columns don't exist, same defensive pattern
//    already used for production_plans above.
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
      // ── previously dropped on the floor — now persisted ──
      ship_from, company_id, due_date, place_of_supply, advance, description,
      items = [],
    } = req.body;

    const fpoCols = await getFpoColumns();

    // Base columns that have always existed.
    const columns = [
      'fpo_no', 'fpo_date', 'supplier',
      'billing_from', 'delivery_to', 'pay_terms', 'pinning',
      'packing_type', 'rate_type', 'freight', 'delivery_dt', 'remarks',
      'cgst_pct', 'sgst_pct', 'igst_pct',
      'sub_total', 'cgst_amt', 'sgst_amt', 'igst_amt', 'net_value',
      'plan_id', 'plan_rec_no', 'order_no', 'purchase_qty',
    ];
    const values = [
      fpo_no, fpo_date || null, supplier,
      billing_from || null, delivery_to || null, pay_terms || null, pinning || null,
      packing_type || null, rate_type || null, freight || null,
      delivery_dt || null, remarks || null,
      cgst_pct  || 0, sgst_pct  || 0, igst_pct  || 0,
      sub_total || 0, cgst_amt  || 0, sgst_amt  || 0,
      igst_amt  || 0, net_value || 0,
      plan_id   || null, plan_rec_no || null,
      order_no  || null, purchase_qty || 0,
    ];

    // New optional columns — only included if the DB has been migrated.
    const optionalFieldMap = {
      ship_from:       ship_from || null,
      company_id:      company_id || null,
      due_date:        due_date || null,
      place_of_supply: place_of_supply || null,
      advance:         advance || 0,
      description:     description || null,
    };
    for (const [col, val] of Object.entries(optionalFieldMap)) {
      if (fpoCols.has(col)) { columns.push(col); values.push(val); }
    }

    const placeholders = columns.map(() => '?').join(', ');
    const [r] = await conn.query(
      `INSERT INTO fabric_purchase_orders (${columns.join(', ')}) VALUES (${placeholders})`,
      values
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
    res.status(500).json({ message: err.message, code: err.code, sqlMessage: err.sqlMessage });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. UPDATE EXISTING FPO  (PUT /:id)
//    plan_id / plan_rec_no / order_no / purchase_qty excluded — link is permanent.
//    Line items replaced wholesale (delete-then-insert).
//    FIX: same as CREATE — ship_from, company_id, due_date, place_of_supply,
//    advance, description are now written on update too.
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
      // ── previously dropped on the floor — now persisted ──
      ship_from, company_id, due_date, place_of_supply, advance, description,
      items = [],
    } = req.body;

    const fpoCols = await getFpoColumns();

    const setParts = [
      'fpo_no = ?', 'fpo_date = ?', 'supplier = ?',
      'billing_from = ?', 'delivery_to = ?', 'pay_terms = ?', 'pinning = ?',
      'packing_type = ?', 'rate_type = ?', 'freight = ?', 'delivery_dt = ?', 'remarks = ?',
      'cgst_pct = ?', 'sgst_pct = ?', 'igst_pct = ?',
      'sub_total = ?', 'cgst_amt = ?', 'sgst_amt = ?', 'igst_amt = ?', 'net_value = ?',
    ];
    const setVals = [
      fpo_no, fpo_date || null, supplier,
      billing_from || null, delivery_to || null,
      pay_terms || null, pinning || null,
      packing_type || null, rate_type || null,
      freight || null, delivery_dt || null, remarks || null,
      cgst_pct  || 0, sgst_pct  || 0, igst_pct  || 0,
      sub_total || 0, cgst_amt  || 0, sgst_amt  || 0,
      igst_amt  || 0, net_value || 0,
    ];

    const optionalFieldMap = {
      ship_from:       ship_from || null,
      company_id:      company_id || null,
      due_date:        due_date || null,
      place_of_supply: place_of_supply || null,
      advance:         advance || 0,
      description:     description || null,
    };
    for (const [col, val] of Object.entries(optionalFieldMap)) {
      if (fpoCols.has(col)) { setParts.push(`${col} = ?`); setVals.push(val); }
    }

    setVals.push(req.params.id);

    await conn.query(
      `UPDATE fabric_purchase_orders SET ${setParts.join(', ')} WHERE id = ?`,
      setVals
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
    res.status(500).json({ message: err.message, code: err.code, sqlMessage: err.sqlMessage });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. DELETE FPO  (DELETE /:id)
//    Unlinks plan if present so it reappears in pending-purchase dropdown.
//
//    FIX (500 error): if this FPO was already converted to a Purchase
//    Invoice, fabric_purchase_invoices.fpo_id still references this row's
//    id. Deleting straight away hit the DB's foreign-key constraint
//    (ER_ROW_IS_REFERENCED_2 / ER_ROW_IS_REFERENCED), which surfaced as a
//    generic 500 with no useful message on the frontend. Now:
//      1. We check upfront whether an invoice references this FPO and
//         return a clear, actionable 409 instead of letting the DB throw.
//      2. As a second safety net, if some other FK still blocks the delete
//         for a reason we didn't anticipate, the FK error codes are caught
//         explicitly and translated into a readable message rather than a
//         bare "Internal Server Error", and err.sqlMessage is always
//         included in the response so the real reason is visible in
//         DevTools without needing server console access.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[fpo]] = await conn.query(
      'SELECT plan_id, invoice_id, invoice_no, status FROM fabric_purchase_orders WHERE id = ?',
      [req.params.id]
    );

    if (!fpo) {
      await conn.rollback();
      return res.status(404).json({ message: 'FPO not found.' });
    }

    // ── Block delete up front if this FPO has already been converted to
    //    an invoice, instead of letting the FK constraint throw a raw 500.
    if (fpo.invoice_id || fpo.status === 'invoiced' || fpo.status === 'completed') {
      await conn.rollback();
      return res.status(409).json({
        message: `Cannot delete this FPO — it has already been converted to Purchase Invoice "${fpo.invoice_no || fpo.invoice_id}". Delete or unlink that invoice first.`,
      });
    }

    if (fpo.plan_id) {
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
    console.error('❌ DELETE /fabric-purchase-orders/:id ERROR:', err.message, '| code:', err.code, '| sqlMessage:', err.sqlMessage);

    // Second safety net — translate FK constraint errors into something
    // readable if they slip past the upfront invoice check above (e.g. a
    // different table starts referencing fabric_purchase_orders later).
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({
        message: 'Cannot delete this FPO — other records still reference it (e.g. a converted Purchase Invoice). Remove those first.',
        code: err.code,
        sqlMessage: err.sqlMessage,
      });
    }

    res.status(500).json({ message: err.message, code: err.code, sqlMessage: err.sqlMessage });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. CONVERT FPO → PURCHASE INVOICE  (POST /:id/convert-to-invoice)
//    (unchanged — left in place per the frontend's note that this route is
//    intentionally still here even though the row-menu no longer calls it)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/convert-to-invoice', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[fpo]] = await conn.query(
      'SELECT * FROM fabric_purchase_orders WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!fpo) {
      await conn.rollback();
      return res.status(404).json({ message: 'FPO not found' });
    }

    if (fpo.status === 'invoiced' || fpo.status === 'completed' || fpo.invoice_id) {
      await conn.rollback();
      return res.status(409).json({
        message: `This FPO was already converted to invoice "${fpo.invoice_no}".`,
      });
    }

    const { invoice_no, invoice_date } = req.body || {};
    if (!invoice_no || !invoice_date) {
      await conn.rollback();
      return res.status(400).json({ message: 'invoice_no and invoice_date are required to convert an FPO.' });
    }

    const [items] = await conn.query(
      'SELECT * FROM fpo_items WHERE fpo_id = ? ORDER BY id ASC',
      [req.params.id]
    );

    const total_qty    = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    const basic_value  = items.reduce((s, it) => s + (Number(it.basic_value) || 0), 0);
    const rate         = total_qty > 0 ? +(basic_value / total_qty).toFixed(2) : 0;

    const internal_ref_no = await generateNextInternalRefNo(conn);

    const [r] = await conn.query(
      `INSERT INTO fabric_purchase_invoices (
        internal_ref_no, invoice_no, invoice_date,
        fpo_id, fpo_no, fpo_date, supplier,
        billing_from, delivery_to, pay_terms, rate_type, freight, remarks,
        total_qty, rate, basic_value,
        discount_percent, discount_amount,
        sub_total, cgst_pct, cgst_amt, sgst_pct, sgst_amt, igst_pct, igst_amt,
        round_off, net_value,
        payment_due_date, prepared_by, checked_by, authorised_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        internal_ref_no, invoice_no, invoice_date,
        fpo.id, fpo.fpo_no, fpo.fpo_date, fpo.supplier,
        fpo.billing_from, fpo.delivery_to, fpo.pay_terms, fpo.rate_type, fpo.freight, fpo.remarks,
        total_qty, rate, basic_value,
        0, 0,
        fpo.sub_total, fpo.cgst_pct, fpo.cgst_amt, fpo.sgst_pct, fpo.sgst_amt, fpo.igst_pct, fpo.igst_amt,
        0, fpo.net_value,
        null, req.user?.name || null, null, null,
      ]
    );
    const invoiceId = r.insertId;

    for (const [i, it] of items.entries()) {
      await conn.query(
        `INSERT INTO fabric_purchase_invoice_items
           (invoice_id, s_no, sort_no, construction, hsn_code, qty, rate, basic_value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId, i + 1,
          it.sort_no      || '',
          it.construction || '',
          it.hsn_code     || '',
          it.qty          || 0,
          it.rate         || 0,
          it.basic_value  || 0,
        ]
      );
    }

    await conn.query(
      `UPDATE fabric_purchase_orders SET status = 'invoiced', invoice_no = ?, invoice_id = ? WHERE id = ?`,
      [internal_ref_no, invoiceId, req.params.id]
    );

    await conn.commit();
    console.log(`✅ FPO ${fpo.fpo_no} converted to Purchase Invoice ${internal_ref_no} (id ${invoiceId})`);
    res.status(201).json({ id: invoiceId, invoice_no: internal_ref_no });

  } catch (err) {
    await conn.rollback();
    console.error('❌ POST /fabric-purchase-orders/:id/convert-to-invoice ERROR:', err.message);
    res.status(500).json({ message: err.message, code: err.code, sqlMessage: err.sqlMessage });
  } finally {
    conn.release();
  }
});

module.exports = router;