/**
 * routes/yarnPurchaseInward.js
 *
 * Full CRUD for Yarn Purchase Inward (YPI).
 * Mirrors the yarnPurchaseOrders.js pattern.
 *
 * Tables used:
 *   yarn_purchase_inwards        – header
 *   yarn_inward_items            – line items (TAB 2)
 *   yarn_inward_weighbridge      – weigh-bridge (TAB 3)
 *   yarn_purchase_orders         – autofill PO data
 *   suppliers                    – autofill supplier data
 *   yarn_master / hsn_master     – autofill count / HSN
 *   inward_locations             – lookup for inward location
 *
 * FIX: Weigh Bridge is now auto-disabled for certain Inward Types (currently
 * just "Factory Location") instead of always being optional. The frontend's
 * Weigh Bridge tab disables its inputs and shows a banner for these types;
 * this guard mirrors that on the backend so weighbridge data can never be
 * persisted against a disabled inward type — even if a stale payload or a
 * client bypassing the UI sends one — and so that switching an existing
 * inward's type *to* a disabled type during an edit cleans up any
 * previously-saved weighbridge row instead of leaving it stranded.
 *
 * FIX (2): Supplier Billing Name / Mill Name now fall back to the main
 * supplier's name in the PO lookup query when no distinct billing/mill
 * supplier is configured on the PO (billing_supplier_id / mill_supplier_id
 * is NULL) — previously these came back NULL, so the form showed them blank
 * and nothing meaningful ever got stored for those two fields.
 *
 * FIX (3): PO line-items lookup now (a) coalesces count_desc from
 * count_for_po → yarn short_name → yarn_code so the "actual count" always
 * shows, and (b) aliases gst_pct → cgst_pct so CGST % autofills correctly
 * (it was silently missing because the column name didn't match what the
 * frontend's computeItem()/autofill code expected — only SGST/IGST lined
 * up). The frontend also now keys PO-line selection by the line's own
 * po_item_id instead of yarn_id (which can repeat across lines or be
 * blank), so HSN code and every other field always autofill from the exact
 * PO line picked.
 *
 * FIX (4): yarn_id on each inward line is now validated against yarn_master
 * before insert/update. yarn_inward_items.yarn_id has an FK constraint
 * (fk_yii_yarn_new) that previously caused the ENTIRE save to fail with a
 * generic 500 whenever a PO line referenced a yarn_id that no longer exists
 * in yarn_master (e.g. a stale/deleted yarn record). Since count_desc,
 * hsn_code, lot_no, etc. are all denormalized snapshot fields already
 * stored directly on yarn_inward_items, yarn_id is not required for the
 * line to be meaningful — so an invalid yarn_id is now silently coerced to
 * NULL (mirroring the FK's own ON DELETE SET NULL behavior) instead of
 * blocking the whole transaction. A warning is logged so bad references can
 * still be tracked down.
 *
 * NEW: Transport Expenses (freight / loading / unloading / other charges +
 * a computed total) captured as plain fields in the Transport Details
 * section. Requires these new columns on yarn_purchase_inwards — run once:
 *
 *   ALTER TABLE yarn_purchase_inwards
 *     ADD COLUMN freight_charges DECIMAL(12,2) NULL,
 *     ADD COLUMN loading_charges DECIMAL(12,2) NULL,
 *     ADD COLUMN unloading_charges DECIMAL(12,2) NULL,
 *     ADD COLUMN other_transport_charges DECIMAL(12,2) NULL,
 *     ADD COLUMN total_transport_expenses DECIMAL(12,2) NULL;
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// ─── Safe value helpers ───────────────────────────────────────────────────────
const str = (v) =>
  v === undefined || v === null || v === 'undefined' || v === 'null'
    ? null : String(v).trim() || null;

const num = (v) => {
  if (v === undefined || v === null || v === '' || v === 'undefined' || v === 'null') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

// ─── Weigh Bridge applicability ───────────────────────────────────────────────
// Inward Types for which the Weigh Bridge tab is not applicable. Kept in
// sync with WEIGHBRIDGE_DISABLED_TYPES in YarnPurchaseInwardMaster.jsx —
// update both lists together if this set ever changes.
const WEIGHBRIDGE_DISABLED_TYPES = ['Factory Location'];
function weighbridgeApplicable(inwardType) {
  return !WEIGHBRIDGE_DISABLED_TYPES.includes(inwardType);
}

// ─── FIX (4): yarn_id FK guard ────────────────────────────────────────────────
// Loads the full set of valid yarn_master ids once per request and returns a
// helper that coerces any yarn_id not in that set to NULL. This prevents a
// single stale/deleted yarn reference on one PO line from failing the FK
// constraint and rolling back the entire inward save.
async function loadValidYarnIds(conn) {
  const [rows] = await conn.query(`SELECT id FROM yarn_master`);
  return new Set(rows.map(r => r.id));
}
function safeYarnId(validYarnIds, rawYarnId) {
  const id = num(rawYarnId);
  if (id === null) return null;
  if (!validYarnIds.has(id)) {
    console.warn(`[yarn-purchase-inward] yarn_id ${id} not found in yarn_master — storing NULL instead.`);
    return null;
  }
  return id;
}

// ─── Auto-generate Inward Number ──────────────────────────────────────────────
async function generateInwardNo(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(inward_no, '-', -1) AS UNSIGNED)) AS max_seq
     FROM yarn_purchase_inwards WHERE inward_no LIKE ?`,
    [`YPI-${year}-%`],
  );
  const nextSeq = (row.max_seq ?? 0) + 1;
  return `YPI-${year}-${String(nextSeq).padStart(4, '0')}`;
}

// ─── Compute totals from items ────────────────────────────────────────────────
function calcTotals(items) {
  let t_cgst = 0, t_sgst = 0, t_igst = 0, net_value = 0, t_value = 0;
  for (const it of items) {
    const base = (parseFloat(it.received_kgs) || 0) * (parseFloat(it.rate) || 0) *
                 (1 - (parseFloat(it.discount_pct) || 0) / 100);
    const cgst = base * (parseFloat(it.cgst_pct) || 0) / 100;
    const sgst = base * (parseFloat(it.sgst_pct) || 0) / 100;
    const igst = base * (parseFloat(it.igst_pct) || 0) / 100;
    t_cgst    += cgst;
    t_sgst    += sgst;
    t_igst    += igst;
    net_value += base;
    t_value   += base + cgst + sgst + igst;
  }
  return {
    net_value:   net_value.toFixed(4),
    t_cgst_value: t_cgst.toFixed(4),
    t_sgst_value: t_sgst.toFixed(4),
    t_igst_value: t_igst.toFixed(4),
    t_value:      t_value.toFixed(4),
  };
}

// ─── Fetch full inward by id ──────────────────────────────────────────────────
async function fetchInward(id) {
  const [[row]] = await db.query(
    `SELECT ypi.*,
            s.supplier_name,
            po.rec_no AS po_no,
            il.name   AS inward_location_name
     FROM yarn_purchase_inwards ypi
     LEFT JOIN yarn_purchase_orders po ON ypi.po_id  = po.id
     LEFT JOIN suppliers            s  ON ypi.supplier_id = s.id
     LEFT JOIN inward_locations     il ON ypi.inward_location_id = il.id
     WHERE ypi.id = ?`,
    [id],
  );
  if (!row) return null;

  const [items] = await db.query(
    `SELECT yii.*,
            ym.yarn_code, ym.short_name,
            h.hsn_code AS hsn_code_value
     FROM yarn_inward_items yii
     LEFT JOIN yarn_master ym ON yii.yarn_id = ym.id
     LEFT JOIN hsn_master  h  ON ym.hsn_code_id = h.id
     WHERE yii.inward_id = ?
     ORDER BY yii.line_no`,
    [id],
  );

  // weighbridge row is simply absent (NULL) for inward types where it
  // doesn't apply — the POST/PUT handlers below never insert one for those
  // types, and PUT actively deletes any pre-existing row if the type
  // changes to a disabled one.
  const [[wb]] = await db.query(
    `SELECT * FROM yarn_inward_weighbridge WHERE inward_id = ?`,
    [id],
  );

  return {
    ...row,
    items:       items.map(it => ({ ...it, _id: `item-${it.id}` })),
    weighbridge: wb ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /meta/lookup  — everything the form needs
// ─────────────────────────────────────────────────────────────────────────────
router.get('/meta/lookup', async (_req, res) => {
  try {
    // Purchase Orders (open / partially received)
    let purchaseOrders = [];
    try {
      [purchaseOrders] = await db.query(
        `SELECT po.id, po.rec_no AS po_no, po.rec_date,
                s.supplier_name, s.address, s.pin_code, s.district,
                s.state, s.country, s.gst_no,
                po.bill_address, po.bill_pin_code, po.bill_district,
                po.bill_state, po.bill_country, po.bill_gst_no,
                po.mill_address, po.mill_pin_code, po.mill_district,
                po.mill_state, po.mill_country, po.mill_gst_no,
                po.supplier_id,
                po.billing_supplier_id,
                po.mill_supplier_id,
                COALESCE(bs.supplier_name, s.supplier_name) AS billing_supplier_name,
                COALESCE(ms.supplier_name, s.supplier_name) AS mill_supplier_name
         FROM yarn_purchase_orders po
         LEFT JOIN suppliers s  ON po.supplier_id         = s.id
         LEFT JOIN suppliers bs ON po.billing_supplier_id = bs.id
         LEFT JOIN suppliers ms ON po.mill_supplier_id    = ms.id
         WHERE po.status IN ('Approved','Draft')
         ORDER BY po.id DESC
         LIMIT 500`,
      );
    } catch (e) { console.warn('[inward-lookup] purchaseOrders failed:', e.message); }

    // PO line items (for autofill in Inward Details tab)
    let poItems = [];
    try {
      [poItems] = await db.query(
        `SELECT ypi.po_id, ypi.id AS po_item_id,
                ypi.yarn_id,
                COALESCE(NULLIF(ypi.count_for_po, ''), ym.short_name, ym.yarn_code) AS count_desc,
                ym.yarn_code,
                h.hsn_code, ypi.lot_no, ypi.count_for_po,
                ypi.total_weight AS po_kgs,
                ypi.package_type AS packing_type,
                ypi.weight_per_package, ypi.cone_weight,
                ypi.no_of_cone_per_bag AS no_of_cones,
                ypi.rate,
                dt.discount_type_name AS discount_type,
                ypi.discount_pct,
                ypi.gst_pct AS cgst_pct, ypi.sgst_pct, ypi.igst_pct
         FROM yarn_po_items ypi
         LEFT JOIN yarn_master    ym ON ypi.yarn_id          = ym.id
         LEFT JOIN hsn_master     h  ON ym.hsn_code_id       = h.id
         LEFT JOIN discount_types dt ON ypi.discount_type_id = dt.id`,
      );
    } catch (e) { console.warn('[inward-lookup] poItems failed:', e.message); }

    // Inward locations
    let inwardLocations = [];
    try {
      [inwardLocations] = await db.query(
        `SELECT id, name, type FROM inward_locations WHERE status = 'Active' ORDER BY name`,
      );
    } catch (e) { console.warn('[inward-lookup] inwardLocations failed:', e.message); }

    res.json({ purchaseOrders, poItems, inwardLocations });
  } catch (err) {
    console.error('[GET /yarn-purchase-inward/meta/lookup]', err);
    res.status(500).json({ message: 'Failed to load lookup data', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /   — paginated list
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ` AND (ypi.inward_no LIKE ? OR s.supplier_name LIKE ? OR po.rec_no LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      where += ` AND ypi.inward_status = ?`;
      params.push(status);
    }

   const [rows] = await db.query(
  `SELECT ypi.id, ypi.inward_no, ypi.inward_date, ypi.inward_status,
          ypi.inward_type, ypi.inspection_completed,
          s.supplier_name, po.rec_no AS po_no,
          ypi.t_value, ypi.net_value, ypi.approved_qty, ypi.rejected_qty
   FROM yarn_purchase_inwards ypi
   LEFT JOIN yarn_purchase_orders po ON ypi.po_id        = po.id
   LEFT JOIN suppliers            s  ON ypi.supplier_id  = s.id
   ${where}
   ORDER BY ypi.id DESC
   LIMIT ? OFFSET ?`,
  [...params, Number(limit), offset],
);
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM yarn_purchase_inwards ypi
       LEFT JOIN yarn_purchase_orders po ON ypi.po_id       = po.id
       LEFT JOIN suppliers            s  ON ypi.supplier_id = s.id
       ${where}`,
      params,
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /yarn-purchase-inward]', err);
    res.status(500).json({ message: 'Failed to fetch inwards', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id  — single inward with items + weighbridge
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const inward = await fetchInward(req.params.id);
    if (!inward) return res.status(404).json({ message: 'Inward not found' });
    res.json(inward);
  } catch (err) {
    console.error('[GET /yarn-purchase-inward/:id]', err);
    res.status(500).json({ message: 'Error fetching inward', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /  — create
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const body       = req.body;
    const inward_no  = await generateInwardNo(conn);
    const items      = Array.isArray(body.items) ? body.items : [];
    const totals     = calcTotals(items);

    // FIX (4): pre-load valid yarn_master ids so bad yarn_id references on
    // individual lines can be nulled out instead of blowing up the whole save.
    const validYarnIds = await loadValidYarnIds(conn);

    // ── Header ────────────────────────────────────────────────────────────────
    const [result] = await conn.query(
      `INSERT INTO yarn_purchase_inwards
         (inward_no, inward_date, po_id, inward_status,
          supplier_id,
          sup_address, sup_pin_code, sup_district, sup_state, sup_country, sup_gst_no,
          billing_supplier_name,
          bill_address, bill_pin_code, bill_district, bill_state, bill_country, bill_gst_no,
          mill_name,
          mill_address, mill_pin_code, mill_district, mill_state, mill_country, mill_gst_no,
          trans_type, transport, transporter_name, vehicle_no, transport_ref_no,
          freight_charges, loading_charges, unloading_charges, other_transport_charges, total_transport_expenses,
          inward_type, inward_location_id, inward_location_name,
          net_value, t_cgst_value, t_sgst_value, t_igst_value, t_value,
          inspection_completed, approved_qty, rejected_qty,
          created_at)
       VALUES (?,?,?,?,  ?,  ?,?,?,?,?,?,  ?,  ?,?,?,?,?,?,  ?,  ?,?,?,?,?,?,  ?,?,?,?,?,  ?,?,?,?,?,  ?,?,?,  ?,?,?,?,?,  ?,?,?,  NOW())`,
      [
        inward_no,
        str(body.inward_date) ?? new Date().toISOString().slice(0, 10),
        num(body.po_id),
        str(body.inward_status) ?? 'DRAFT',

        num(body.supplier_id),
        str(body.sup_address), str(body.sup_pin_code), str(body.sup_district),
        str(body.sup_state), str(body.sup_country), str(body.sup_gst_no),

        str(body.billing_supplier_name),
        str(body.bill_address), str(body.bill_pin_code), str(body.bill_district),
        str(body.bill_state), str(body.bill_country), str(body.bill_gst_no),

        str(body.mill_name),
        str(body.mill_address), str(body.mill_pin_code), str(body.mill_district),
        str(body.mill_state), str(body.mill_country), str(body.mill_gst_no),

        str(body.trans_type), str(body.transport), str(body.transporter_name),
        str(body.vehicle_no), str(body.transport_ref_no),

        num(body.freight_charges), num(body.loading_charges),
        num(body.unloading_charges), num(body.other_transport_charges),
        num(body.total_transport_expenses),

        str(body.inward_type) ?? 'In-house',
        num(body.inward_location_id),
        str(body.inward_location_name),

        totals.net_value, totals.t_cgst_value, totals.t_sgst_value,
        totals.t_igst_value, totals.t_value,

        str(body.inspection_completed) ?? 'No',
        num(body.approved_qty),
        num(body.rejected_qty),
      ],
    );

    const inwardId = result.insertId;

    // ── Line Items ────────────────────────────────────────────────────────────
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.received_kgs && !it.invoice_no) continue;

      const base = (parseFloat(it.received_kgs) || 0) * (parseFloat(it.rate) || 0) *
                   (1 - (parseFloat(it.discount_pct) || 0) / 100);
      const discount_value = (parseFloat(it.received_kgs) || 0) * (parseFloat(it.rate) || 0) *
                             ((parseFloat(it.discount_pct) || 0) / 100);

      await conn.query(
        `INSERT INTO yarn_inward_items
           (inward_id, line_no,
            invoice_no, invoice_date,
            yarn_id, count_desc, hsn_code, lot_no, po_kgs,
            received_kgs,
            packing_type, weight_per_package, no_of_cones, cone_weight, unit,
            rate, discount_type, discount_pct, discount_value,
            spl_instructions,
            cgst_pct, sgst_pct, igst_pct)
         VALUES (?,?,  ?,?,  ?,?,?,?,?,  ?,  ?,?,?,?,?,  ?,?,?,?,  ?,  ?,?,?)`,
        [
          inwardId, i + 1,
          str(it.invoice_no), str(it.invoice_date) || null,
          safeYarnId(validYarnIds, it.yarn_id), str(it.count_desc), str(it.hsn_code), str(it.lot_no), num(it.po_kgs),
          num(it.received_kgs),
          str(it.packing_type), num(it.weight_per_package), num(it.no_of_cones),
          num(it.cone_weight), str(it.unit) ?? 'KGS',
          num(it.rate), str(it.discount_type), num(it.discount_pct),
          parseFloat(discount_value.toFixed(4)),
          str(it.spl_instructions),
          num(it.cgst_pct), num(it.sgst_pct), num(it.igst_pct),
        ],
      );
    }

    // ── Weigh Bridge ─────────────────────────────────────────────────────────
    // Only saved when the inward's type actually supports it (FIX: previously
    // any truthy body.weighbridge was inserted regardless of inward_type).
    const wb = body.weighbridge;
    if (wb && weighbridgeApplicable(body.inward_type)) {
      const totalReceivedKgs = items.reduce((s, it) => s + (parseFloat(it.received_kgs) || 0), 0);
      await conn.query(
        `INSERT INTO yarn_inward_weighbridge
           (inward_id, load_wt_no, load_wt, empty_wt_no, empty_wt,
            yarn_inward_total_wt, remarks, no_of_packages, yarn_wt, total_yarn_wt)
         VALUES (?,?,?,?,?,  ?,  ?,?,?,?)`,
        [
          inwardId,
          str(wb.load_wt_no), num(wb.load_wt),
          str(wb.empty_wt_no), num(wb.empty_wt),
          parseFloat(totalReceivedKgs.toFixed(4)),
          str(wb.remarks), num(wb.no_of_packages), num(wb.yarn_wt), num(wb.total_yarn_wt),
        ],
      );
    }

    await conn.commit();
    const saved = await fetchInward(inwardId);
    res.status(201).json(saved);
  } catch (err) {
    await conn.rollback();
    console.error('[POST /yarn-purchase-inward]', err.message, err.sql ?? '');
    res.status(500).json({ message: 'Failed to create inward', detail: err.message });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:id  — update
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const body   = req.body;
    const items  = Array.isArray(body.items) ? body.items : [];
    const totals = calcTotals(items);

    // FIX (4): same defensive yarn_id validation as POST.
    const validYarnIds = await loadValidYarnIds(conn);

    // ── Header update ─────────────────────────────────────────────────────────
    await conn.query(
      `UPDATE yarn_purchase_inwards SET
         inward_date=?, po_id=?, inward_status=?,
         supplier_id=?,
         sup_address=?, sup_pin_code=?, sup_district=?, sup_state=?, sup_country=?, sup_gst_no=?,
         billing_supplier_name=?,
         bill_address=?, bill_pin_code=?, bill_district=?, bill_state=?, bill_country=?, bill_gst_no=?,
         mill_name=?,
         mill_address=?, mill_pin_code=?, mill_district=?, mill_state=?, mill_country=?, mill_gst_no=?,
         trans_type=?, transport=?, transporter_name=?, vehicle_no=?, transport_ref_no=?,
         freight_charges=?, loading_charges=?, unloading_charges=?, other_transport_charges=?, total_transport_expenses=?,
         inward_type=?, inward_location_id=?, inward_location_name=?,
         net_value=?, t_cgst_value=?, t_sgst_value=?, t_igst_value=?, t_value=?,
         inspection_completed=?, approved_qty=?, rejected_qty=?,
         updated_at=NOW()
       WHERE id=?`,
      [
        str(body.inward_date),
        num(body.po_id),
        str(body.inward_status) ?? 'DRAFT',
        num(body.supplier_id),
        str(body.sup_address), str(body.sup_pin_code), str(body.sup_district),
        str(body.sup_state), str(body.sup_country), str(body.sup_gst_no),
        str(body.billing_supplier_name),
        str(body.bill_address), str(body.bill_pin_code), str(body.bill_district),
        str(body.bill_state), str(body.bill_country), str(body.bill_gst_no),
        str(body.mill_name),
        str(body.mill_address), str(body.mill_pin_code), str(body.mill_district),
        str(body.mill_state), str(body.mill_country), str(body.mill_gst_no),
        str(body.trans_type), str(body.transport), str(body.transporter_name),
        str(body.vehicle_no), str(body.transport_ref_no),
        num(body.freight_charges), num(body.loading_charges),
        num(body.unloading_charges), num(body.other_transport_charges),
        num(body.total_transport_expenses),
        str(body.inward_type) ?? 'In-house',
        num(body.inward_location_id),
        str(body.inward_location_name),
        totals.net_value, totals.t_cgst_value, totals.t_sgst_value,
        totals.t_igst_value, totals.t_value,
        str(body.inspection_completed) ?? 'No',
        num(body.approved_qty),
        num(body.rejected_qty),
        id,
      ],
    );

    // ── Replace items ─────────────────────────────────────────────────────────
    await conn.query('DELETE FROM yarn_inward_items WHERE inward_id = ?', [id]);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.received_kgs && !it.invoice_no) continue;
      const discount_value = (parseFloat(it.received_kgs) || 0) * (parseFloat(it.rate) || 0) *
                             ((parseFloat(it.discount_pct) || 0) / 100);
      await conn.query(
        `INSERT INTO yarn_inward_items
           (inward_id, line_no,
            invoice_no, invoice_date,
            yarn_id, count_desc, hsn_code, lot_no, po_kgs,
            received_kgs,
            packing_type, weight_per_package, no_of_cones, cone_weight, unit,
            rate, discount_type, discount_pct, discount_value,
            spl_instructions,
            cgst_pct, sgst_pct, igst_pct)
         VALUES (?,?,  ?,?,  ?,?,?,?,?,  ?,  ?,?,?,?,?,  ?,?,?,?,  ?,  ?,?,?)`,
        [
          id, i + 1,
          str(it.invoice_no), str(it.invoice_date) || null,
          safeYarnId(validYarnIds, it.yarn_id), str(it.count_desc), str(it.hsn_code), str(it.lot_no), num(it.po_kgs),
          num(it.received_kgs),
          str(it.packing_type), num(it.weight_per_package), num(it.no_of_cones),
          num(it.cone_weight), str(it.unit) ?? 'KGS',
          num(it.rate), str(it.discount_type), num(it.discount_pct),
          parseFloat(discount_value.toFixed(4)),
          str(it.spl_instructions),
          num(it.cgst_pct), num(it.sgst_pct), num(it.igst_pct),
        ],
      );
    }

    // ── Upsert (or remove) weigh bridge ──────────────────────────────────────
    // FIX: gated on weighbridgeApplicable(body.inward_type). If the inward
    // was switched to a type that no longer supports Weigh Bridge (or no wb
    // payload was sent), any previously-saved row is deleted instead of left
    // stranded — keeping the saved record consistent with what the frontend
    // tab actually shows (disabled / no data) for that type.
    const wb = body.weighbridge;
    if (wb && weighbridgeApplicable(body.inward_type)) {
      const totalReceivedKgs = items.reduce((s, it) => s + (parseFloat(it.received_kgs) || 0), 0);
      await conn.query(
        `INSERT INTO yarn_inward_weighbridge
           (inward_id, load_wt_no, load_wt, empty_wt_no, empty_wt,
            yarn_inward_total_wt, remarks, no_of_packages, yarn_wt, total_yarn_wt)
         VALUES (?,?,?,?,?,  ?,  ?,?,?,?)
         ON DUPLICATE KEY UPDATE
           load_wt_no=VALUES(load_wt_no), load_wt=VALUES(load_wt),
           empty_wt_no=VALUES(empty_wt_no), empty_wt=VALUES(empty_wt),
           yarn_inward_total_wt=VALUES(yarn_inward_total_wt),
           remarks=VALUES(remarks), no_of_packages=VALUES(no_of_packages),
           yarn_wt=VALUES(yarn_wt), total_yarn_wt=VALUES(total_yarn_wt)`,
        [
          id,
          str(wb.load_wt_no), num(wb.load_wt),
          str(wb.empty_wt_no), num(wb.empty_wt),
          parseFloat(totalReceivedKgs.toFixed(4)),
          str(wb.remarks), num(wb.no_of_packages), num(wb.yarn_wt), num(wb.total_yarn_wt),
        ],
      );
    } else {
      await conn.query('DELETE FROM yarn_inward_weighbridge WHERE inward_id = ?', [id]);
    }

    await conn.commit();
    const updated = await fetchInward(id);
    res.json(updated);
  } catch (err) {
    await conn.rollback();
    console.error('[PUT /yarn-purchase-inward/:id]', err.message, err.sql ?? '');
    res.status(500).json({ message: 'Failed to update inward', detail: err.message });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    await conn.query('DELETE FROM yarn_inward_weighbridge WHERE inward_id = ?', [id]);
    await conn.query('DELETE FROM yarn_inward_items       WHERE inward_id = ?', [id]);
    await conn.query('DELETE FROM yarn_purchase_inwards   WHERE id = ?',        [id]);
    await conn.commit();
    res.json({ message: 'Inward deleted' });
  } catch (err) {
    await conn.rollback();
    console.error('[DELETE /yarn-purchase-inward/:id]', err);
    res.status(500).json({ message: 'Failed to delete inward', detail: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;