const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
// ─────────────────────────────────────────────────────────────────────────
// NOTE: This module uses `purchase_invoice_bills` / `purchase_invoice_bill_items`
// (NOT `purchase_invoices`) because a table named `purchase_invoices` already
// existed in this database for the Account Details / Payment Out module
// (different schema: internal_ref, fpo_no, supplier_id, supplier_name,
// payment_terms_days, etc). Renaming avoids breaking that existing feature.
//
// ─────────────────────────────────────────────────────────────────────────
// FIX HISTORY:
//
// Rev 1 — 500 on /po-lines: "Illegal mix of collations" on the fabric
//   supplier JOIN (suppliers.<name> vs fabric_purchase_orders.supplier
//   had different default collations). Fixed with COLLATE on both sides.
//
// Rev 2 — yarn PO lines returned blank supplier / 0% GST: fetchYarnPoLines()
//   assumed a supplier_id FK into suppliers. Added a text-column fallback
//   (Shape B) plus header-vs-item GST fallback.
//
// Rev 3 (THIS REVISION) — yarn PO lines not appearing in the dropdown AT
//   ALL (zero results, no error): the yarn *header* table name
//   (`yarn_purchase_orders`) was hardcoded and never went through
//   resolveTable() the way the *items* table did. If your actual header
//   table has a different name (e.g. `yarn_po`, `yarn_orders`,
//   `yarn_purchase_order`), fetchYarnPoLines() would either silently find
//   no items-table match tied to it, or — if it did somehow match — the
//   query would throw on an unknown table (which would 500 the whole
//   /po-lines call, not just yarn). Since fabric results loaded fine and
//   yarn just came back empty with no error, the far more likely cause is
//   the items-table or FK-column guess failing silently. Both the header
//   table AND items table are now resolved dynamically with wider
//   candidate lists, and /schema-debug now reports row counts so you can
//   see exactly which table is empty vs. missing vs. unlinked.
// ─────────────────────────────────────────────────────────────────────────

// ── Auto-migration: create the two tables this module owns if missing ────
async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table],
  );
  return rows[0].c > 0;
}

async function ensureSchema() {
  try {
    if (!(await tableExists('purchase_invoice_bills'))) {
      await pool.query(`
        CREATE TABLE purchase_invoice_bills (
          id                  INT AUTO_INCREMENT PRIMARY KEY,
          invoice_no          VARCHAR(50) NOT NULL,
          invoice_date        DATE NOT NULL,
          due_date            DATE NULL,
          po_type             ENUM('fabric','yarn') NOT NULL,
          fpo_id              INT NULL,
          ypo_id              INT NULL,
          po_item_id          INT NULL,
          po_no               VARCHAR(50) NULL,
          po_date             DATE NULL,
          supplier            VARCHAR(150) NOT NULL,
          supplier_address    TEXT NULL,
          supplier_gstin      VARCHAR(20) NULL,
          quality             VARCHAR(150) NULL,
          hsn_code            VARCHAR(20) NULL,
          unit                VARCHAR(10) NOT NULL DEFAULT 'MTR',
          rate                DECIMAL(14,2) NOT NULL DEFAULT 0,
          total_order_qty     DECIMAL(14,2) NOT NULL DEFAULT 0,
          delivered_qty       DECIMAL(14,2) NOT NULL DEFAULT 0,
          balance_qty         DECIMAL(14,2) NOT NULL DEFAULT 0,
          gst_type            ENUM('CGST_SGST','IGST','NONE') NOT NULL DEFAULT 'CGST_SGST',
          cgst_pct            DECIMAL(5,2) NOT NULL DEFAULT 0,
          sgst_pct            DECIMAL(5,2) NOT NULL DEFAULT 0,
          igst_pct            DECIMAL(5,2) NOT NULL DEFAULT 0,
          advance             DECIMAL(14,2) NOT NULL DEFAULT 0,
          sub_total           DECIMAL(14,2) NOT NULL DEFAULT 0,
          gst_amount          DECIMAL(14,2) NOT NULL DEFAULT 0,
          net_value           DECIMAL(14,2) NOT NULL DEFAULT 0,
          balance_due         DECIMAL(14,2) NOT NULL DEFAULT 0,
          remarks             TEXT NULL,
          status              VARCHAR(20) NOT NULL DEFAULT 'Pending',
          created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_pib_invoice_no (invoice_no),
          INDEX idx_pib_po_item (po_item_id),
          INDEX idx_pib_po_type (po_type)
        )
      `);
      console.log('[purchase-invoices] created purchase_invoice_bills');
    }

    if (!(await tableExists('purchase_invoice_bill_items'))) {
      await pool.query(`
        CREATE TABLE purchase_invoice_bill_items (
          id           INT AUTO_INCREMENT PRIMARY KEY,
          invoice_id   INT NOT NULL,
          delivered_qty DECIMAL(14,2) NOT NULL DEFAULT 0,
          piece_no     VARCHAR(50) NULL,
          roll_no      VARCHAR(50) NULL,
          lot_no       VARCHAR(50) NULL,
          rate         DECIMAL(14,2) NOT NULL DEFAULT 0,
          amount       DECIMAL(14,2) NOT NULL DEFAULT 0,
          remarks      TEXT NULL,
          INDEX idx_pibi_invoice (invoice_id)
        )
      `);
      console.log('[purchase-invoices] created purchase_invoice_bill_items');
    }
  } catch (err) {
    console.error('[purchase-invoices] ensureSchema failed:', err.code || '', err.sqlMessage || err.message);
  }
}

const schemaReady = ensureSchema();

// ── Dynamic schema detection — so a column-name difference degrades to
//    NULL/blank instead of throwing a 500, and this module self-adjusts
//    to your real tables instead of guessing forever. ─────────────────────
const _colCache = {};
async function columnsOf(table) {
  if (!table) return new Set();
  if (_colCache[table]) return _colCache[table];
  try {
    const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
    _colCache[table] = new Set(rows.map(r => r.Field));
  } catch {
    _colCache[table] = new Set(); // table missing entirely -> every pickCol below returns null
  }
  return _colCache[table];
}
function pickCol(cols, candidates) {
  for (const c of candidates) if (cols.has(c)) return c;
  return null;
}

async function rowCountOf(table) {
  if (!table) return null;
  try {
    const [[{ c }]] = await pool.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
    return c;
  } catch {
    return null;
  }
}

// ── Table-name resolution — column-name guessing assumes the TABLE itself
//    has one of a few likely names, but that guess can be wrong. This
//    tries several candidates and caches whichever one actually exists. ──
const _tableNameCache = {};
async function resolveTable(candidates) {
  const cacheKey = candidates.join('|');
  if (_tableNameCache[cacheKey] !== undefined) return _tableNameCache[cacheKey];
  for (const t of candidates) {
    if (await tableExists(t)) {
      _tableNameCache[cacheKey] = t;
      console.log(`[purchase-invoices] resolved table candidate list [${candidates.join(', ')}] -> "${t}"`);
      return t;
    }
  }
  console.warn(`[purchase-invoices] none of these tables exist: ${candidates.join(', ')}`);
  _tableNameCache[cacheKey] = null;
  return null;
}

// Candidate name lists — pulled out so schema-debug can reuse them exactly.
const FABRIC_HEADER_CANDIDATES = ['fabric_purchase_orders', 'fabric_po', 'fabric_purchase_order', 'fpo_orders', 'fpo'];
const FABRIC_ITEMS_CANDIDATES = [
  'fabric_purchase_order_items', 'fabric_po_items', 'fpo_items',
  'fabric_purchase_orders_items', 'fabric_purchase_order_item',
];
const YARN_HEADER_CANDIDATES = ['yarn_purchase_orders', 'yarn_po', 'yarn_purchase_order', 'ypo_orders', 'ypo', 'yarn_orders'];
const YARN_ITEMS_CANDIDATES = [
  'yarn_purchase_order_items', 'yarn_po_items', 'ypo_items',
  'yarn_purchase_orders_items', 'yarn_purchase_order_item',
];

async function fetchFabricPoLines(searchTerm) {
  const like = `%${searchTerm}%`;

  // ★ Header table is now resolved dynamically too, not hardcoded.
  const headerTable = await resolveTable(FABRIC_HEADER_CANDIDATES);
  if (!headerTable) {
    console.warn(`[purchase-invoices] no fabric PO header table found among: ${FABRIC_HEADER_CANDIDATES.join(', ')} — fabric PO lines will be empty.`);
    return [];
  }

  const fpoCols = await columnsOf(headerTable);
  const suppCols = await columnsOf('suppliers');

  const itemsTable = await resolveTable(FABRIC_ITEMS_CANDIDATES);
  if (!itemsTable) {
    console.warn('[purchase-invoices] no fabric PO items table found — fabric PO lines will be empty. Run: SHOW TABLES LIKE \'%fpo%item%\'; or SHOW TABLES LIKE \'%fabric%item%\'; to find the real name.');
    return [];
  }

  const itemCols = await columnsOf(itemsTable);
  const fkCol = pickCol(itemCols, ['fpo_id', 'purchase_order_id', 'order_id', 'fabric_purchase_order_id']);
  if (!fkCol) {
    console.warn(`[purchase-invoices] "${itemsTable}" has no recognizable FK column back to ${headerTable} — fabric PO lines will be empty. Columns found: ${[...itemCols].join(', ')}`);
    return [];
  }

  const poNoCol   = pickCol(fpoCols, ['fpo_no', 'po_no', 'order_no']);
  const poDateCol = pickCol(fpoCols, ['fpo_date', 'po_date', 'order_date']);
  const supplierCol = pickCol(fpoCols, ['supplier', 'supplier_name']);
  if (!poNoCol || !poDateCol || !supplierCol) {
    console.warn(`[purchase-invoices] "${headerTable}" is missing an expected column (po_no/po_date/supplier candidates). Columns found: ${[...fpoCols].join(', ')}`);
    return [];
  }

  const dueDateCol  = pickCol(fpoCols, ['due_dt', 'due_date', 'delivery_dt']);
  const addressCol  = pickCol(fpoCols, ['delivery_to', 'billing_from']);
  const advanceCol  = pickCol(fpoCols, ['advance']);
  const cgstCol     = pickCol(fpoCols, ['cgst_pct']);
  const sgstCol     = pickCol(fpoCols, ['sgst_pct']);
  const igstCol     = pickCol(fpoCols, ['igst_pct']);

  const suppNameCol = pickCol(suppCols, ['supplier_name', 'name', 'vendor_name']);
  const suppGstCol  = pickCol(suppCols, ['gst_no', 'gstin', 'gst_number']);

  const qtyCol   = pickCol(itemCols, ['qty', 'total_qty', 'meter', 'quantity']);
  const rateCol  = pickCol(itemCols, ['rate']);
  const unitCol  = pickCol(itemCols, ['unit']);
  const hsnCol   = pickCol(itemCols, ['hsn_code']);
  const constrCol = pickCol(itemCols, ['construction', 'sort_no']);

  if (!qtyCol) {
    console.warn(`[purchase-invoices] no qty-like column found on ${itemsTable} — fabric PO lines will show 0 balance. Columns found: ${[...itemCols].join(', ')}`);
  }

  const dueDateSel = dueDateCol ? `fpo.${dueDateCol}` : 'NULL';
  const addressSel = addressCol ? `fpo.${addressCol}` : `''`;
  const advanceSel = advanceCol ? `fpo.${advanceCol}` : '0';
  const cgstSel    = cgstCol ? `fpo.${cgstCol}` : '0';
  const sgstSel    = sgstCol ? `fpo.${sgstCol}` : '0';
  const igstSel    = igstCol ? `fpo.${igstCol}` : '0';
  const suppGstSel = suppNameCol && suppGstCol ? `s.${suppGstCol}` : 'NULL';
  const qtySel     = qtyCol ? `it.${qtyCol}` : '0';
  const rateSel    = rateCol ? `it.${rateCol}` : '0';
  const unitSel    = unitCol ? `it.${unitCol}` : `'MTR'`;
  const hsnSel      = hsnCol ? `it.${hsnCol}` : `''`;
  const constrSel   = constrCol ? `it.${constrCol}` : `''`;

  // ★ FIX (Rev 1): force both sides of the cross-table text JOIN to the
  //   same collation — suppliers.<name> and <header>.supplier were created
  //   with different default collations in this DB.
  const supplierJoin = suppNameCol
    ? `LEFT JOIN suppliers s ON s.${suppNameCol} COLLATE utf8mb4_unicode_ci = fpo.${supplierCol} COLLATE utf8mb4_unicode_ci`
    : '';

  const [rows] = await pool.query(
    `SELECT
       fpo.id                AS po_id,
       fpo.${poNoCol}        AS po_no,
       fpo.${poDateCol}      AS po_date,
       ${dueDateSel}         AS due_date,
       fpo.${supplierCol}    AS supplier,
       ${addressSel}         AS supplier_address,
       ${suppGstSel}         AS supplier_gstin,
       ${advanceSel}         AS advance,
       ${cgstSel}            AS cgst_pct,
       ${sgstSel}            AS sgst_pct,
       ${igstSel}            AS igst_pct,
       it.id                 AS item_id,
       ${constrSel}          AS quality,
       ${hsnSel}             AS hsn_code,
       ${unitSel}            AS unit,
       ${rateSel}            AS rate,
       ${qtySel}             AS total_qty,
       COALESCE((
         SELECT SUM(pii.delivered_qty)
         FROM purchase_invoice_bills pi
         JOIN purchase_invoice_bill_items pii ON pii.invoice_id = pi.id
         WHERE pi.po_type = 'fabric' AND pi.po_item_id = it.id AND pi.status <> 'Cancelled'
       ), 0)                 AS already_invoiced_qty
     FROM \`${headerTable}\` fpo
     JOIN \`${itemsTable}\` it ON it.${fkCol} = fpo.id
     ${supplierJoin}
     WHERE fpo.${poNoCol} LIKE ? OR fpo.${supplierCol} LIKE ? OR ${constrSel} LIKE ?
     ORDER BY fpo.${poDateCol} DESC
     LIMIT 40`,
    [like, like, like]
  );
  return rows.map(r => ({
    key: `fabric:${r.po_id}:${r.item_id}`,
    po_type: 'fabric',
    po_id: r.po_id,
    item_id: r.item_id,
    po_no: r.po_no,
    po_date: r.po_date,
    due_date: r.due_date,
    supplier: r.supplier,
    supplier_address: r.supplier_address || '',
    supplier_gstin: r.supplier_gstin || '',
    quality: r.quality || '',
    hsn_code: r.hsn_code || '',
    unit: r.unit || 'MTR',
    rate: Number(r.rate) || 0,
    total_qty: Number(r.total_qty) || 0,
    already_invoiced_qty: Number(r.already_invoiced_qty) || 0,
    balance_qty: (Number(r.total_qty) || 0) - (Number(r.already_invoiced_qty) || 0),
    gst_type: 'CGST_SGST',
    cgst_pct: Number(r.cgst_pct) || 0,
    sgst_pct: Number(r.sgst_pct) || 0,
    igst_pct: Number(r.igst_pct) || 0,
    advance: Number(r.advance) || 0,
  }));
}

async function fetchYarnPoLines(searchTerm) {
  const like = `%${searchTerm}%`;

  // ★ FIX (Rev 3): header table resolved dynamically — this was previously
  //   hardcoded as `yarn_purchase_orders`, which is why yarn PO lines could
  //   come back completely empty if your real table has a different name.
  const headerTable = await resolveTable(YARN_HEADER_CANDIDATES);
  if (!headerTable) {
    console.warn(`[purchase-invoices] no yarn PO header table found among: ${YARN_HEADER_CANDIDATES.join(', ')} — yarn PO lines will be empty. Run: SHOW TABLES LIKE '%yarn%'; or SHOW TABLES LIKE '%ypo%'; and tell me the real name.`);
    return [];
  }

  const ypoCols  = await columnsOf(headerTable);
  const suppCols = await columnsOf('suppliers');

  const itemsTable = await resolveTable(YARN_ITEMS_CANDIDATES);
  if (!itemsTable) {
    console.warn('[purchase-invoices] no yarn PO items table found — yarn PO lines will be empty. Run: SHOW TABLES LIKE \'%ypo%item%\'; or SHOW TABLES LIKE \'%yarn%item%\'; to find the real name.');
    return [];
  }

  const itemCols = await columnsOf(itemsTable);
  const fkCol = pickCol(itemCols, ['ypo_id', 'purchase_order_id', 'order_id', 'yarn_purchase_order_id']);
  if (!fkCol) {
    console.warn(`[purchase-invoices] "${itemsTable}" has no recognizable FK column back to ${headerTable} — yarn PO lines will be empty. Columns found: ${[...itemCols].join(', ')}`);
    return [];
  }

  const poNoCol   = pickCol(ypoCols, ['rec_no', 'ypo_no', 'po_no', 'order_no']);
  const poDateCol = pickCol(ypoCols, ['rec_date', 'ypo_date', 'po_date', 'order_date']);
  if (!poNoCol || !poDateCol) {
    console.warn(`[purchase-invoices] "${headerTable}" is missing an expected PO-no/PO-date column. Columns found: ${[...ypoCols].join(', ')}`);
    return [];
  }

  const dueDateCol = pickCol(ypoCols, ['due_date', 'due_dt']);
  const addressCol = pickCol(ypoCols, ['sup_address', 'supplier_address', 'delivery_to']);
  const advanceCol  = pickCol(ypoCols, ['advance']);

  // ── Supplier resolution — try BOTH shapes, don't assume one ──────────
  // Shape A: header has a supplier_id FK into suppliers (INT ↔ INT join).
  // Shape B: header stores the supplier directly as text.
  const suppIdCol    = pickCol(ypoCols, ['supplier_id']);
  const suppNameCol  = pickCol(suppCols, ['supplier_name', 'name', 'vendor_name']);
  const suppGstColOnSuppliers = pickCol(suppCols, ['gst_no', 'gstin', 'gst_number']);
  const ypoSupplierTextCol = pickCol(ypoCols, ['supplier', 'supplier_name', 'sup_name', 'vendor', 'vendor_name']);
  const ypoGstTextCol      = pickCol(ypoCols, ['sup_gst_no', 'sup_gstin', 'supplier_gstin', 'gstin']);

  const useFkJoin = !!(suppIdCol && suppNameCol);
  const supplierJoin = useFkJoin
    ? `LEFT JOIN suppliers s ON s.id = ypo.${suppIdCol}`
    : (suppNameCol && ypoSupplierTextCol
        ? `LEFT JOIN suppliers s ON s.${suppNameCol} COLLATE utf8mb4_unicode_ci = ypo.${ypoSupplierTextCol} COLLATE utf8mb4_unicode_ci`
        : '');

  let supplierSel, gstSel;
  if (useFkJoin) {
    supplierSel = `s.${suppNameCol}`;
    gstSel = suppGstColOnSuppliers ? `s.${suppGstColOnSuppliers}` : (ypoGstTextCol ? `ypo.${ypoGstTextCol}` : 'NULL');
  } else if (ypoSupplierTextCol) {
    supplierSel = `ypo.${ypoSupplierTextCol}`;
    gstSel = ypoGstTextCol ? `ypo.${ypoGstTextCol}` : (supplierJoin && suppGstColOnSuppliers ? `s.${suppGstColOnSuppliers}` : 'NULL');
  } else {
    console.warn(`[purchase-invoices] could not resolve a supplier column for ${headerTable} — supplier will be blank and supplier search won't match. Columns found on ${headerTable}: ${[...ypoCols].join(', ')}; on suppliers: ${[...suppCols].join(', ')}`);
    supplierSel = `''`;
    gstSel = 'NULL';
  }

  const qtyCol   = pickCol(itemCols, ['total_weight', 'total_qty', 'qty']);
  const rateCol  = pickCol(itemCols, ['rate']);
  const hsnCol   = pickCol(itemCols, ['hsn_code']);
  const qualityCol = pickCol(itemCols, ['count_for_po', 'count_desc']);

  const cgstHeaderCol = pickCol(ypoCols, ['cgst_pct']);
  const cgstItemCol   = pickCol(itemCols, ['cgst_pct', 'gst_pct']);
  const cgstCol = cgstHeaderCol ? { src: 'ypo', col: cgstHeaderCol }
                : cgstItemCol ? { src: 'it', col: cgstItemCol }
                : null;

  const sgstHeaderCol = pickCol(ypoCols, ['sgst_pct']);
  const sgstItemCol   = pickCol(itemCols, ['sgst_pct']);
  const sgstCol = sgstHeaderCol ? { src: 'ypo', col: sgstHeaderCol }
                : sgstItemCol ? { src: 'it', col: sgstItemCol }
                : null;

  const igstHeaderCol = pickCol(ypoCols, ['igst_pct']);
  const igstItemCol   = pickCol(itemCols, ['igst_pct']);
  const igstCol = igstHeaderCol ? { src: 'ypo', col: igstHeaderCol }
                : igstItemCol ? { src: 'it', col: igstItemCol }
                : null;

  if (!qtyCol) {
    console.warn(`[purchase-invoices] no qty-like column found on ${itemsTable} — yarn PO lines will show 0 balance. Columns found: ${[...itemCols].join(', ')}`);
  }

  const dueDateSel = dueDateCol ? `ypo.${dueDateCol}` : 'NULL';
  const addressSel = addressCol ? `ypo.${addressCol}` : `''`;
  const advanceSel  = advanceCol ? `ypo.${advanceCol}` : '0';
  const qtySel      = qtyCol ? `it.${qtyCol}` : '0';
  const rateSel     = rateCol ? `it.${rateCol}` : '0';
  const hsnSel      = hsnCol ? `it.${hsnCol}` : `''`;
  const qualitySel  = qualityCol ? `it.${qualityCol}` : `''`;
  const cgstSel     = cgstCol ? `${cgstCol.src}.${cgstCol.col}` : '0';
  const sgstSel     = sgstCol ? `${sgstCol.src}.${sgstCol.col}` : '0';
  const igstSel     = igstCol ? `${igstCol.src}.${igstCol.col}` : '0';

  const [rows] = await pool.query(
    `SELECT
       ypo.id                AS po_id,
       ypo.${poNoCol}        AS po_no,
       ypo.${poDateCol}      AS po_date,
       ${dueDateSel}         AS due_date,
       ${supplierSel}        AS supplier,
       ${addressSel}         AS supplier_address,
       ${gstSel}             AS supplier_gstin,
       ${advanceSel}         AS advance,
       it.id                 AS item_id,
       ${qualitySel}         AS quality,
       ${hsnSel}             AS hsn_code,
       'KG'                  AS unit,
       ${rateSel}            AS rate,
       ${qtySel}             AS total_qty,
       ${cgstSel}            AS cgst_pct,
       ${sgstSel}            AS sgst_pct,
       ${igstSel}            AS igst_pct,
       COALESCE((
         SELECT SUM(pii.delivered_qty)
         FROM purchase_invoice_bills pi
         JOIN purchase_invoice_bill_items pii ON pii.invoice_id = pi.id
         WHERE pi.po_type = 'yarn' AND pi.po_item_id = it.id AND pi.status <> 'Cancelled'
       ), 0)                 AS already_invoiced_qty
     FROM \`${headerTable}\` ypo
     JOIN \`${itemsTable}\` it ON it.${fkCol} = ypo.id
     ${supplierJoin}
     WHERE ypo.${poNoCol} LIKE ? OR ${supplierSel} LIKE ? OR ${qualitySel} LIKE ?
     ORDER BY ypo.${poDateCol} DESC
     LIMIT 40`,
    [like, like, like]
  );
  return rows.map(r => ({
    key: `yarn:${r.po_id}:${r.item_id}`,
    po_type: 'yarn',
    po_id: r.po_id,
    item_id: r.item_id,
    po_no: r.po_no,
    po_date: r.po_date,
    due_date: r.due_date,
    supplier: r.supplier || '',
    supplier_address: r.supplier_address || '',
    supplier_gstin: r.supplier_gstin || '',
    quality: r.quality || '',
    hsn_code: r.hsn_code || '',
    unit: r.unit || 'KG',
    rate: Number(r.rate) || 0,
    total_qty: Number(r.total_qty) || 0,
    already_invoiced_qty: Number(r.already_invoiced_qty) || 0,
    balance_qty: (Number(r.total_qty) || 0) - (Number(r.already_invoiced_qty) || 0),
    gst_type: Number(r.igst_pct) > 0 ? 'IGST' : 'CGST_SGST',
    cgst_pct: Number(r.cgst_pct) || 0,
    sgst_pct: Number(r.sgst_pct) || 0,
    igst_pct: Number(r.igst_pct) || 0,
    advance: Number(r.advance) || 0,
  }));
}

// ── GET /api/purchase-invoices/po-lines?search=&type=all|fabric|yarn ──
// (accepts `q` too — the frontend's searchPoLines() sends `q`)
router.get('/po-lines', async (req, res) => {
  try {
    await schemaReady;
    const search = String(req.query.search ?? req.query.q ?? '').trim();
    const type = (req.query.type || 'all').toLowerCase();

    const [fabricLines, yarnLines] = await Promise.all([
      type === 'yarn' ? [] : fetchFabricPoLines(search),
      type === 'fabric' ? [] : fetchYarnPoLines(search),
    ]);

    const combined = [...fabricLines, ...yarnLines]
      .sort((a, b) => new Date(b.po_date) - new Date(a.po_date));

    res.json(combined);
  } catch (err) {
    console.error('[purchase-invoices/po-lines] failed:', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: 'Could not load PO lines for invoicing.', detail: err.sqlMessage || err.message });
  }
});

// ── GET /api/purchase-invoices/next-invoice-no ──
router.get('/next-invoice-no', async (req, res) => {
  try {
    await schemaReady;
    const year = new Date().getFullYear();
    const [rows] = await pool.query(
      `SELECT invoice_no FROM purchase_invoice_bills
       WHERE invoice_no LIKE ? ORDER BY id DESC LIMIT 1`,
      [`PINV-${year}-%`]
    );
    let nextSeq = 1;
    if (rows.length) {
      const parts = rows[0].invoice_no.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
    }
    const invoice_no = `PINV-${year}-${String(nextSeq).padStart(3, '0')}`;
    res.json({ invoice_no });
  } catch (err) {
    console.error('[purchase-invoices/next-invoice-no] failed:', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: 'Could not generate invoice number.', detail: err.sqlMessage || err.message });
  }
});

// ── GET /api/purchase-invoices ──  (list, with search + pagination)
router.get('/', async (req, res) => {
  try {
    await schemaReady;
    const { search = '', page = 1, limit = 10, status = '' } = req.query;
    const like = `%${search}%`;
    const offset = (Number(page) - 1) * Number(limit);

    const where = [];
    const params = [];
    if (search) {
      where.push('(pi.invoice_no LIKE ? OR pi.po_no LIKE ? OR pi.supplier LIKE ?)');
      params.push(like, like, like);
    }
    if (status) { where.push('pi.status = ?'); params.push(status); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT pi.* FROM purchase_invoice_bills pi
       ${whereSql}
       ORDER BY pi.invoice_date DESC, pi.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM purchase_invoice_bills pi ${whereSql}`,
      params
    );

    res.json({ data: rows, total });
  } catch (err) {
    console.error('[purchase-invoices] list failed:', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: 'Could not load purchase invoices.', detail: err.sqlMessage || err.message });
  }
});

// ── GET /api/purchase-invoices/:id ── (full record incl. delivery rows)
router.get('/:id', async (req, res) => {
  try {
    await schemaReady;
    const [[invoice]] = await pool.query(`SELECT * FROM purchase_invoice_bills WHERE id = ?`, [req.params.id]);
    if (!invoice) return res.status(404).json({ message: 'Purchase invoice not found.' });
    const [items] = await pool.query(
      `SELECT * FROM purchase_invoice_bill_items WHERE invoice_id = ? ORDER BY id`,
      [req.params.id]
    );
    res.json({ ...invoice, items });
  } catch (err) {
    console.error('[purchase-invoices/:id] failed:', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: 'Could not load purchase invoice.', detail: err.sqlMessage || err.message });
  }
});

// ── Shared totals/validation logic for create + update ──
function computeTotals(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const headerRate = Number(payload.rate) || 0;

  const normItems = items.map(it => {
    const qty = Number(it.delivered_qty) || 0;
    const rate = it.rate !== undefined && it.rate !== null && it.rate !== '' ? Number(it.rate) : headerRate;
    const amount = +(qty * rate).toFixed(2);
    return {
      delivered_qty: qty,
      piece_no: it.piece_no || '',
      roll_no: it.roll_no || '',
      lot_no: it.lot_no || '',
      rate,
      amount,
      remarks: it.remarks || '',
    };
  });

  const delivered_qty = +normItems.reduce((s, i) => s + i.delivered_qty, 0).toFixed(2);
  const sub_total = +normItems.reduce((s, i) => s + i.amount, 0).toFixed(2);

  const cgst_pct = Number(payload.cgst_pct) || 0;
  const sgst_pct = Number(payload.sgst_pct) || 0;
  const igst_pct = Number(payload.igst_pct) || 0;
  const gst_amount = +(sub_total * (cgst_pct + sgst_pct + igst_pct) / 100).toFixed(2);
  const net_value = +(sub_total + gst_amount).toFixed(2);
  const advance = Number(payload.advance) || 0;
  const balance_due = +(net_value - advance).toFixed(2);

  const total_order_qty = Number(payload.total_order_qty) || 0;
  const already_invoiced_before_this = Number(payload.already_invoiced_qty) || 0; // excludes this invoice
  const balance_qty = +(total_order_qty - already_invoiced_before_this - delivered_qty).toFixed(2);

  return { normItems, delivered_qty, sub_total, gst_amount, net_value, balance_due, balance_qty };
}

// ── POST /api/purchase-invoices ── (create)
router.post('/', async (req, res) => {
  await schemaReady;
  const conn = await pool.getConnection();
  try {
    const p = req.body;
    if (!p.invoice_no || !p.invoice_date || !p.supplier) {
      return res.status(400).json({ message: 'Invoice No, Invoice Date and Supplier are required.' });
    }
    if (!p.po_type || (!p.fpo_id && !p.ypo_id)) {
      return res.status(400).json({ message: 'Please select a Purchase Order line to invoice against.' });
    }

    const t = computeTotals(p);

    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO purchase_invoice_bills
        (invoice_no, invoice_date, due_date, po_type, fpo_id, ypo_id, po_item_id, po_no, po_date,
         supplier, supplier_address, supplier_gstin, quality, hsn_code, unit, rate,
         total_order_qty, delivered_qty, balance_qty,
         gst_type, cgst_pct, sgst_pct, igst_pct,
         advance, sub_total, gst_amount, net_value, balance_due,
         remarks, status)
       VALUES (?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?)`,
      [
        p.invoice_no, p.invoice_date, p.due_date || null, p.po_type, p.fpo_id || null, p.ypo_id || null,
        p.po_item_id || null, p.po_no || null, p.po_date || null,
        p.supplier, p.supplier_address || '', p.supplier_gstin || '', p.quality || '', p.hsn_code || '',
        p.unit || 'MTR', Number(p.rate) || 0,
        Number(p.total_order_qty) || 0, t.delivered_qty, t.balance_qty,
        p.gst_type || 'CGST_SGST', Number(p.cgst_pct) || 0, Number(p.sgst_pct) || 0, Number(p.igst_pct) || 0,
        Number(p.advance) || 0, t.sub_total, t.gst_amount, t.net_value, t.balance_due,
        p.remarks || '', p.status || 'Pending',
      ]
    );
    const invoiceId = result.insertId;

    for (const it of t.normItems) {
      await conn.query(
        `INSERT INTO purchase_invoice_bill_items
          (invoice_id, delivered_qty, piece_no, roll_no, lot_no, rate, amount, remarks)
         VALUES (?,?,?,?,?,?,?,?)`,
        [invoiceId, it.delivered_qty, it.piece_no, it.roll_no, it.lot_no, it.rate, it.amount, it.remarks]
      );
    }

    await conn.commit();
    const [[saved]] = await pool.query(`SELECT * FROM purchase_invoice_bills WHERE id = ?`, [invoiceId]);
    res.status(201).json(saved);
  } catch (err) {
    await conn.rollback();
    console.error('[purchase-invoices] create failed:', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || 'Could not save purchase invoice.' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/purchase-invoices/:id ── (update)
router.put('/:id', async (req, res) => {
  await schemaReady;
  const conn = await pool.getConnection();
  try {
    const p = req.body;
    const t = computeTotals(p);

    await conn.beginTransaction();

    await conn.query(
      `UPDATE purchase_invoice_bills SET
        invoice_date=?, due_date=?, po_type=?, fpo_id=?, ypo_id=?, po_item_id=?, po_no=?, po_date=?,
        supplier=?, supplier_address=?, supplier_gstin=?, quality=?, hsn_code=?, unit=?, rate=?,
        total_order_qty=?, delivered_qty=?, balance_qty=?,
        gst_type=?, cgst_pct=?, sgst_pct=?, igst_pct=?,
        advance=?, sub_total=?, gst_amount=?, net_value=?, balance_due=?,
        remarks=?, status=?
       WHERE id=?`,
      [
        p.invoice_date, p.due_date || null, p.po_type, p.fpo_id || null, p.ypo_id || null,
        p.po_item_id || null, p.po_no || null, p.po_date || null,
        p.supplier, p.supplier_address || '', p.supplier_gstin || '', p.quality || '', p.hsn_code || '',
        p.unit || 'MTR', Number(p.rate) || 0,
        Number(p.total_order_qty) || 0, t.delivered_qty, t.balance_qty,
        p.gst_type || 'CGST_SGST', Number(p.cgst_pct) || 0, Number(p.sgst_pct) || 0, Number(p.igst_pct) || 0,
        Number(p.advance) || 0, t.sub_total, t.gst_amount, t.net_value, t.balance_due,
        p.remarks || '', p.status || 'Pending',
        req.params.id,
      ]
    );

    await conn.query(`DELETE FROM purchase_invoice_bill_items WHERE invoice_id = ?`, [req.params.id]);
    for (const it of t.normItems) {
      await conn.query(
        `INSERT INTO purchase_invoice_bill_items
          (invoice_id, delivered_qty, piece_no, roll_no, lot_no, rate, amount, remarks)
         VALUES (?,?,?,?,?,?,?,?)`,
        [req.params.id, it.delivered_qty, it.piece_no, it.roll_no, it.lot_no, it.rate, it.amount, it.remarks]
      );
    }

    await conn.commit();
    const [[saved]] = await pool.query(`SELECT * FROM purchase_invoice_bills WHERE id = ?`, [req.params.id]);
    res.json(saved);
  } catch (err) {
    await conn.rollback();
    console.error('[purchase-invoices] update failed:', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || 'Could not update purchase invoice.' });
  } finally {
    conn.release();
  }
});

// ── DELETE /api/purchase-invoices/:id ──
router.delete('/:id', async (req, res) => {
  try {
    await schemaReady;
    const [result] = await pool.query(`DELETE FROM purchase_invoice_bills WHERE id = ?`, [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Purchase invoice not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error('[purchase-invoices] delete failed:', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: 'Could not delete purchase invoice.', detail: err.sqlMessage || err.message });
  }
});

// ── GET /api/purchase-invoices/schema-debug — inspect detected columns ────
router.get('/schema-debug', async (req, res) => {
  try {
    await schemaReady;
    const out = {};

    const fpoHeaderTable = await resolveTable(FABRIC_HEADER_CANDIDATES);
    const fpoItemsTable  = await resolveTable(FABRIC_ITEMS_CANDIDATES);
    const ypoHeaderTable = await resolveTable(YARN_HEADER_CANDIDATES);
    const ypoItemsTable  = await resolveTable(YARN_ITEMS_CANDIDATES);

    out.resolved_tables = {
      fabric_po_header_table: fpoHeaderTable,
      fabric_po_items_table: fpoItemsTable,
      yarn_po_header_table: ypoHeaderTable,
      yarn_po_items_table: ypoItemsTable,
    };

    // ★ NEW: row counts — the fastest way to tell "table doesn't exist"
    // apart from "table exists but is empty" apart from "table has data
    // but isn't linked to items."
    out.row_counts = {
      [fpoHeaderTable || 'fabric_header_UNRESOLVED']: fpoHeaderTable ? await rowCountOf(fpoHeaderTable) : null,
      [fpoItemsTable || 'fabric_items_UNRESOLVED']: fpoItemsTable ? await rowCountOf(fpoItemsTable) : null,
      [ypoHeaderTable || 'yarn_header_UNRESOLVED']: ypoHeaderTable ? await rowCountOf(ypoHeaderTable) : null,
      [ypoItemsTable || 'yarn_items_UNRESOLVED']: ypoItemsTable ? await rowCountOf(ypoItemsTable) : null,
    };

    const tablesToInspect = ['suppliers', 'purchase_invoice_bills', 'purchase_invoice_bill_items'];
    if (fpoHeaderTable) tablesToInspect.push(fpoHeaderTable);
    if (fpoItemsTable) tablesToInspect.push(fpoItemsTable);
    if (ypoHeaderTable) tablesToInspect.push(ypoHeaderTable);
    if (ypoItemsTable) tablesToInspect.push(ypoItemsTable);

    for (const t of tablesToInspect) {
      out[t] = [...(await columnsOf(t))];
    }

    // Yarn supplier-resolution diagnostic — shows which strategy
    // fetchYarnPoLines() will actually use.
    if (ypoHeaderTable) {
      const ypoCols = await columnsOf(ypoHeaderTable);
      const suppCols = await columnsOf('suppliers');
      const suppIdCol = pickCol(ypoCols, ['supplier_id']);
      const suppNameCol = pickCol(suppCols, ['supplier_name', 'name', 'vendor_name']);
      const ypoSupplierTextCol = pickCol(ypoCols, ['supplier', 'supplier_name', 'sup_name', 'vendor', 'vendor_name']);
      out.yarn_supplier_resolution = {
        header_table_used: ypoHeaderTable,
        yarn_header_columns: [...ypoCols],
        suppliers_columns: [...suppCols],
        detected_strategy: (suppIdCol && suppNameCol) ? `FK (${ypoHeaderTable}.${suppIdCol} -> suppliers.id)`
          : ypoSupplierTextCol ? `TEXT (${ypoHeaderTable}.${ypoSupplierTextCol})`
          : 'UNRESOLVED — supplier will be blank',
      };
    } else {
      out.yarn_supplier_resolution = {
        header_table_used: null,
        note: `No table found among candidates: ${YARN_HEADER_CANDIDATES.join(', ')}. Run: SHOW TABLES LIKE '%yarn%'; and tell me the real table name.`,
      };
    }

    // List every table whose name contains "yarn", "item", or "ypo" to
    // help find stragglers the resolvers' candidate lists didn't guess.
    const [allTables] = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND (table_name LIKE '%item%' OR table_name LIKE '%yarn%' OR table_name LIKE '%ypo%')`
    );
    out.all_relevant_tables = allTables.map(r => r.table_name || r.TABLE_NAME);

    res.json(out);
  } catch (err) {
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

module.exports = router;