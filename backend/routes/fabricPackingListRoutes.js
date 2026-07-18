const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { auth } = require('../middleware/auth');

// Pulls in the combined (inward+manual) getter and the manual "packed"
// tracker from the SINGLE canonical fabric-stock module. This require
// path is the load-bearing part of the manual-stock fix — it must resolve
// to backend/routes/fabric-stock.js (the consolidated file), not to any
// other fabric-stock-ish file left in the routes folder.
const { getAllStockRows, setManualRowPacked } = require('./fabric-stock');

// ── Schema introspection helpers ─────────────────────────────────────────
const columnCache = new Map();
async function getColumns(table) {
  if (columnCache.has(table)) return columnCache.get(table);
  const [rows] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  const cols = new Set(rows.map(r => r.COLUMN_NAME));
  columnCache.set(table, cols);
  return cols;
}
function pickColumn(cols, candidates) {
  for (const c of candidates) if (cols.has(c)) return c;
  return null;
}

async function tableExists(table) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) as c FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return row.c > 0;
}

const CUSTOMER_ORDER_TABLE_CANDIDATES = [
  'customer_orders',
  'customer_order_bookings',
  'order_bookings',
  'orders',
];

const CUSTOMER_MASTER_TABLE_CANDIDATES = [
  'customer_master',
  'customers',
  'customer',
  'master_customers',
  'customer_masters',
];
let resolvedCustomerMasterTable = null;

async function resolveCustomerMasterTable() {
  if (resolvedCustomerMasterTable) return resolvedCustomerMasterTable;
  for (const table of CUSTOMER_MASTER_TABLE_CANDIDATES) {
    if (await tableExists(table)) {
      resolvedCustomerMasterTable = table;
      return table;
    }
  }
  return null;
}

// *** NEW ***
// company_details is the same table backing companyDetailsRoutes.js /
// Company Details Master. We validate against it below the same way
// findOrderRow()/customer_id already validate against the orders/customer
// tables — belt-and-suspenders so a stale/deleted company_id can't silently
// corrupt a Packing List header.
const COMPANY_DETAILS_TABLE = 'company_details';

let fabricPackingListsHasCompanyIdColumn = null;
async function hasCompanyIdColumn() {
  if (fabricPackingListsHasCompanyIdColumn !== null) return fabricPackingListsHasCompanyIdColumn;
  const cols = await getColumns('fabric_packing_lists');
  fabricPackingListsHasCompanyIdColumn = cols.has('company_id');
  if (!fabricPackingListsHasCompanyIdColumn) {
    console.warn(
      "⚠ fabric_packing_lists has no 'company_id' column yet. The selected " +
      "Company (from Company Details Master) will be stored via the existing " +
      "'firm' field only, which can't distinguish companies that don't have a " +
      "Firm code set. Run this migration to enable full company_id persistence:\n" +
      "  ALTER TABLE fabric_packing_lists ADD COLUMN company_id INT NULL AFTER firm;"
    );
  }
  return fabricPackingListsHasCompanyIdColumn;
}

const ID_COLUMN_CANDIDATES = ['id', 'order_id', 'co_id', 'orderId', 'oid'];

async function findOrderRow(orderId) {
  const tried = [];
  for (const table of CUSTOMER_ORDER_TABLE_CANDIDATES) {
    if (!(await tableExists(table))) {
      tried.push({ table, exists: false });
      continue;
    }
    const cols = await getColumns(table);
    const pkCol = pickColumn(cols, ID_COLUMN_CANDIDATES);
    if (!pkCol) {
      tried.push({ table, exists: true, pkCol: null });
      continue;
    }
    const [[row]] = await db.query(`SELECT * FROM ${table} WHERE ${pkCol} = ?`, [orderId]);
    if (row) {
      return { table, cols, pkCol, row, tried };
    }
    tried.push({ table, exists: true, pkCol, found: false });
  }
  return { table: null, tried };
}

// ── PL No generator ───────────────────────────────────────────────────
function fiscalYearLabel(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const startYY = m >= 4 ? y % 100 : (y - 1) % 100;
  const endYY   = (startYY + 1) % 100;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(startYY)}-${pad(endYY)}`;
}

async function generateNextPlNo(conn) {
  const fy     = fiscalYearLabel();
  const suffix = `/${fy}`;

  const [rows] = await conn.query(
    `SELECT pl_no FROM fabric_packing_lists WHERE pl_no LIKE ?`,
    [`PL%${suffix}`]
  );

  let maxSeq = 0;
  for (const r of rows) {
    const numPart = r.pl_no.replace('PL', '').split('/')[0];
    const n = parseInt(numPart, 10);
    if (!isNaN(n) && n > maxSeq) maxSeq = n;
  }
  return `PL${String(maxSeq + 1).padStart(5, '0')}${suffix}`;
}

async function reconcileCompletedStatuses(connOrPool, plId = null) {
  const params = [];
  let where = `fi.status = 'completed' AND pl.status <> 'completed'`;
  if (plId) {
    where += ` AND pl.id = ?`;
    params.push(plId);
  }
  await connOrPool.query(
    `UPDATE fabric_packing_lists pl
     JOIN fabric_invoices fi ON fi.pl_id = pl.id
     SET pl.status = 'completed'
     WHERE ${where}`,
    params
  );
}

router.get('/next-pl-no', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    res.json({ pl_no: await generateNextPlNo(conn) });
  } catch (err) {
    console.error('❌ GET /fabric-packing-list/next-pl-no ERROR:', err.message);
    res.status(500).json({ message: err.message });
  } finally { conn.release(); }
});

// ── Customer Order snapshot for autofill ──────────────────────────────────
router.get('/order/:orderId', auth, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { table, cols, pkCol, row, tried } = await findOrderRow(orderId);

    if (!table) {
      console.error(
        `❌ GET /fabric-packing-list/order/${orderId} — id not found in any candidate table.`,
        'Tried:', tried
      );
      for (const t of tried) {
        if (t.exists && t.pkCol) {
          const [sample] = await db.query(
            `SELECT ${t.pkCol} FROM ${t.table} ORDER BY ${t.pkCol} DESC LIMIT 5`
          );
          console.error(`   '${t.table}' most recent ${t.pkCol} values:`, sample.map(r => r[t.pkCol]));
        }
      }
      return res.status(404).json({
        message: `Order ${orderId} not found in any candidate orders table`,
        tried: tried.map(t => t.table),
      });
    }

    const orderCodeCol    = pickColumn(cols, ['order_code', 'order_no', 'co_no', 'order_number']);
    const sortNoCol        = pickColumn(cols, ['sort_no', 'sortNo', 'sort_number']);
    const qualityCol       = pickColumn(cols, ['quality', 'construction', 'fabric_quality']);
    const customerIdCol    = pickColumn(cols, ['customer_id', 'customerId', 'cust_id']);
    const customerNameCol  = pickColumn(cols, ['customer_name', 'customer', 'customerName']);
    const billAddrCol      = pickColumn(cols, ['billing_address', 'bill_address', 'billingAddress']);
    const billPincodeCol   = pickColumn(cols, [
      'billing_pincode', 'bill_pincode', 'billingPincode', 'bill_pin',
      'billing_pin', 'billing_pin_code', 'bill_pin_code',
      'billing_zip', 'billing_zipcode', 'billing_postal_code',
      'customer_pincode', 'cust_pincode', 'pincode', 'pin_code', 'pin',
    ]);
    const billStateCol     = pickColumn(cols, ['billing_state', 'bill_state', 'state']);
    const billCountryCol   = pickColumn(cols, ['billing_country', 'bill_country', 'country']);
    const billGstCol       = pickColumn(cols, ['billing_gst', 'bill_gst', 'gst_no', 'gstin']);
    const delNameCol       = pickColumn(cols, ['delivery_name', 'ship_to_name', 'consignee_name']);
    const delAddrCol       = pickColumn(cols, ['delivery_address', 'ship_address', 'deliveryAddress']);
    const delPincodeCol    = pickColumn(cols, [
      'delivery_pincode', 'ship_pincode', 'deliveryPincode', 'ship_pin',
      'delivery_pin', 'delivery_pin_code', 'ship_pin_code',
      'delivery_zip', 'delivery_zipcode', 'delivery_postal_code',
    ]);
    const delStateCol      = pickColumn(cols, ['delivery_state', 'ship_state']);
    const delCountryCol    = pickColumn(cols, ['delivery_country', 'ship_country']);
    const delGstCol        = pickColumn(cols, ['delivery_gst', 'ship_gst']);

    const transportCol     = pickColumn(cols, ['transport_name', 'transport', 'transportName']);
    const vehicleCol       = pickColumn(cols, ['vehicle_no', 'vehicleNo']);
    const firmCol          = pickColumn(cols, ['firm', 'billing_firm', 'company_firm']);

    let masterRow = null;
    let masterCols = new Set();
    const customerId = customerIdCol ? row[customerIdCol] : null;

    if (customerId) {
      const masterTable = await resolveCustomerMasterTable();
      if (masterTable) {
        masterCols = await getColumns(masterTable);
        const masterPkCol = pickColumn(masterCols, ID_COLUMN_CANDIDATES);
        if (masterPkCol) {
          const [[mRow]] = await db.query(`SELECT * FROM ${masterTable} WHERE ${masterPkCol} = ?`, [customerId]);
          if (mRow) masterRow = mRow;
        }
      }
    }

    const mName       = masterRow && pickColumn(masterCols, ['customer_name', 'name', 'company_name']);
    const mBillAddr    = masterRow && pickColumn(masterCols, ['billing_address', 'address', 'bill_address']);
    const mBillPincode = masterRow && pickColumn(masterCols, [
      'billing_pincode', 'pincode', 'bill_pincode', 'billingPincode', 'bill_pin',
      'billing_pin', 'billing_pin_code', 'bill_pin_code',
      'billing_zip', 'billing_zipcode', 'billing_postal_code',
      'customer_pincode', 'cust_pincode', 'pin_code', 'pin',
    ]);
    const mBillState    = masterRow && pickColumn(masterCols, ['billing_state', 'state', 'bill_state']);
    const mBillCountry  = masterRow && pickColumn(masterCols, ['billing_country', 'country', 'bill_country']);
    const mBillGst      = masterRow && pickColumn(masterCols, ['gst_no', 'gstin', 'gst']);
    const mDelName       = masterRow && pickColumn(masterCols, ['delivery_name', 'ship_to_name', 'consignee_name']);
    const mDelAddr        = masterRow && pickColumn(masterCols, ['delivery_address', 'ship_address']);
    const mDelPincode     = masterRow && pickColumn(masterCols, ['delivery_pincode', 'ship_pincode']);
    const mDelState        = masterRow && pickColumn(masterCols, ['delivery_state', 'ship_state']);
    const mDelCountry       = masterRow && pickColumn(masterCols, ['delivery_country', 'ship_country']);
    const mDelGst             = masterRow && pickColumn(masterCols, ['delivery_gst', 'ship_gst']);

    const finalCustomerName = customerNameCol ? row[customerNameCol] : (mName && masterRow[mName]) || '';
    const finalBillAddr    = billAddrCol    ? row[billAddrCol]    : (mBillAddr    && masterRow[mBillAddr])    || '';
    let   finalBillPincode = billPincodeCol ? row[billPincodeCol] : (mBillPincode && masterRow[mBillPincode]) || '';
    const finalBillState   = billStateCol   ? row[billStateCol]   : (mBillState   && masterRow[mBillState])   || '';
    const finalBillCountry = billCountryCol ? row[billCountryCol] : (mBillCountry && masterRow[mBillCountry]) || '';
    const finalBillGst     = billGstCol     ? row[billGstCol]     : (mBillGst     && masterRow[mBillGst])     || '';
    const finalDelName     = delNameCol     ? row[delNameCol]     : (mDelName     && masterRow[mDelName])     || finalCustomerName;
    const finalDelAddr     = delAddrCol     ? row[delAddrCol]     : (mDelAddr     && masterRow[mDelAddr])     || finalBillAddr;
    const finalDelPincode  = delPincodeCol  ? row[delPincodeCol]  : (mDelPincode  && masterRow[mDelPincode])  || finalBillPincode;
    const finalDelState    = delStateCol    ? row[delStateCol]    : (mDelState    && masterRow[mDelState])    || finalBillState;
    const finalDelCountry  = delCountryCol  ? row[delCountryCol]  : (mDelCountry  && masterRow[mDelCountry])  || finalBillCountry;
    const finalDelGst      = delGstCol      ? row[delGstCol]      : (mDelGst      && masterRow[mDelGst])      || finalBillGst;

    if (!finalBillPincode && finalDelPincode) {
      finalBillPincode = finalDelPincode;
    }

    res.json({
      order_id:          row[pkCol],
      order_code:        orderCodeCol ? row[orderCodeCol] : '',
      sort_no:           sortNoCol    ? row[sortNoCol]    : '',
      quality:           qualityCol   ? row[qualityCol]   : '',
      customer_id:       customerId,
      customer_name:     finalCustomerName,
      billing_address:   finalBillAddr,
      billing_pincode:   finalBillPincode,
      billing_state:     finalBillState,
      billing_country:   finalBillCountry,
      billing_gst:       finalBillGst,
      delivery_name:     finalDelName,
      delivery_address:  finalDelAddr,
      delivery_pincode:  finalDelPincode,
      delivery_state:    finalDelState,
      delivery_country:  finalDelCountry,
      delivery_gst:      finalDelGst,
      transport_name:    transportCol ? row[transportCol] : '',
      vehicle_no:        vehicleCol   ? row[vehicleCol]   : '',
      firm:              firmCol      ? row[firmCol]      : '',
    });
  } catch (err) {
    console.error('❌ GET /fabric-packing-list/order/:orderId ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── Sort-No normalization for the stock-availability filter ────────────────
function normalizeSortNo(v) {
  return String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}
function sortNoMatches(a, b) {
  const na = normalizeSortNo(a);
  const nb = normalizeSortNo(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (/^\d+$/.test(na) && /^\d+$/.test(nb)) {
    return parseInt(na, 10) === parseInt(nb, 10);
  }
  return false;
}
const STOCK_SORT_NO_KEYS = ['sort_no', 'sortNo', 'sort_number', 'fpi_sort_no', 'sortno'];
function getStockRowSortNo(row) {
  for (const k of STOCK_SORT_NO_KEYS) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return '';
}

// A stock row is "manual" if its own `source` field says so, OR
// (belt-and-suspenders, matching the id-offset convention used elsewhere
// in this file) if its id is >= 1e9. getAllStockRows() already tags rows
// with `source: 'inward' | 'manual'`, but we don't want a picker split
// silently breaking if that tagging is ever missing/renamed upstream.
function isManualStockRow(row) {
  if (row.source === 'manual') return true;
  if (row.source === 'inward') return false;
  return Number(row.id) >= 1000000000;
}

// ── Available fabric-stock pieces ──────────────────────────────────────
// The "Pick Fabric Stock Pieces" UI on the Packing List page shows two
// distinct sections:
//   1. Inward Stock  — fabric that came in against a Customer Order
//      (Purchase Inward). Driven by the selected Customer Order's Sort No.
//   2. Manual Stock   — fabric added directly via Fabric Stock →
//      "+ Add In-Stock". NOT tied to a customer order — any unpacked
//      manual entry can be picked for any packing list — but can still be
//      narrowed down with its own search/sort-no filter.
//
// Both come from the same getAllStockRows() union (inward+manual) — this
// endpoint partitions that single result set into `inward_pieces` and
// `manual_pieces` before responding. The legacy combined `pieces` field
// is kept for any older caller that hasn't been updated.
router.get('/available-stock', auth, async (req, res) => {
  try {
    const { sort_no, search } = req.query;

    const [packedRows] = await db.query(
      `SELECT DISTINCT fpi_item_id FROM fabric_packing_list_items WHERE fpi_item_id IS NOT NULL`
    );
    const packedIds = new Set(packedRows.map(r => r.fpi_item_id));

    // Pull EVERY row (inward + manual, packed or not) and decide
    // "unpacked" ourselves using fabric_packing_list_items — the same
    // source-of-truth check that has always worked correctly for inward
    // stock. Manual ids are offset by 1e9 so they can be checked against
    // this same table without colliding with inward fpi_items ids.
    const allRowsRaw = await getAllStockRows({});
    const allUnpacked = allRowsRaw.filter(r => !packedIds.has(r.id));

    // Diagnostic breakdown — safe to leave in; only logs, doesn't affect
    // the response. If manual stock ever goes missing again, this line
    // tells you immediately whether the problem is upstream (fabric-stock.js
    // not returning manual rows at all — check console for which module
    // got loaded) or downstream (rows returned but filtered out here).
    console.log(
      `ℹ available-stock: raw=${allRowsRaw.length} ` +
      `(inward=${allRowsRaw.filter(r => !isManualStockRow(r)).length}, ` +
      `manual=${allRowsRaw.filter(r => isManualStockRow(r)).length}) → ` +
      `unpacked=${allUnpacked.length} ` +
      `(inward=${allUnpacked.filter(r => !isManualStockRow(r)).length}, ` +
      `manual=${allUnpacked.filter(r => isManualStockRow(r)).length})`
    );

    let rows = allUnpacked;

    if (search) {
      const q = String(search).toLowerCase();
      rows = rows.filter(r =>
        String(r.piece_no || '').toLowerCase().includes(q) ||
        String(r.new_piece_no || '').toLowerCase().includes(q) ||
        String(r.fpi_no || '').toLowerCase().includes(q) ||
        String(getStockRowSortNo(r) || '').toLowerCase().includes(q)
      );
    }

    // sort_no applies to whichever section actually asked for it. The
    // Inward and Manual sections on the frontend each call this endpoint
    // separately, so a single shared `sort_no` param naturally scopes to
    // whichever one sent it — no cross-contamination between filters.
    if (sort_no) {
      rows = rows.filter(r => sortNoMatches(getStockRowSortNo(r), sort_no));
    }

    const inwardRows = rows.filter(r => !isManualStockRow(r));
    const manualRows = rows.filter(r => isManualStockRow(r));

    const totalInwardUnpacked = allUnpacked.filter(r => !isManualStockRow(r)).length;
    const totalManualUnpacked = allUnpacked.filter(r => isManualStockRow(r)).length;

    const sortNoMismatchInward = !!sort_no && inwardRows.length === 0 && totalInwardUnpacked > 0;
    const sortNoMismatchManual = !!sort_no && manualRows.length === 0 && totalManualUnpacked > 0;

    let availableSortNos;
    if (sortNoMismatchInward || sortNoMismatchManual) {
      availableSortNos = [...new Set(
        allUnpacked.map(r => getStockRowSortNo(r)).filter(Boolean)
      )].sort();
      console.warn(
        `⚠ /fabric-packing-list/available-stock: sort_no='${sort_no}' matched 0 pieces.`,
        `Sort numbers actually present in unpacked stock:`, availableSortNos
      );
    }

    res.json({
      inward_pieces: inwardRows,
      manual_pieces: manualRows,
      // Legacy combined field — kept for backward compatibility.
      pieces: [...inwardRows, ...manualRows],
      total_unpacked: allUnpacked.length,
      total_inward: totalInwardUnpacked,
      total_manual: totalManualUnpacked,
      requested_sort_no: sort_no || null,
      sort_no_found_in_stock: sort_no ? !(sortNoMismatchInward || sortNoMismatchManual) : null,
      available_sort_nos: availableSortNos,
    });
  } catch (err) {
    console.error('❌ GET /fabric-packing-list/available-stock ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// *** NEW ***
// GET /api/fabric-packing-list/companies — thin passthrough so the
// packing-list page can load the company-select dropdown from a route
// under this router too, if you'd rather not call /api/company-details
// directly from FabricPackingList.tsx. Not required — the frontend below
// still uses /api/company-details directly (it already had that working)
// — this is here only in case you want a single source of truth later.
router.get('/companies', auth, async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, company_code, firm, company_name, logo_path, gst_no, status
       FROM ${COMPANY_DETAILS_TABLE} WHERE status = 'Active' ORDER BY company_name`
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('❌ GET /fabric-packing-list/companies ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── List (header rows) ─────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    await reconcileCompletedStatuses(db);
    const [rows] = await db.query(`SELECT * FROM fabric_packing_lists ORDER BY id DESC`);
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /fabric-packing-list ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── Single (header + items) ────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    await reconcileCompletedStatuses(db, req.params.id);
    const [[pl]] = await db.query(`SELECT * FROM fabric_packing_lists WHERE id=?`, [req.params.id]);
    if (!pl) return res.status(404).json({ message: 'Packing List not found' });

    const [items] = await db.query(
      `SELECT * FROM fabric_packing_list_items WHERE pl_id=? ORDER BY id ASC`,
      [req.params.id]
    );
    res.json({ ...pl, items });
  } catch (err) {
    console.error('❌ GET /fabric-packing-list/:id ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── Create ──────────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const {
      pl_no, pl_date,
      order_id, order_code, sort_no, quality,
      customer_id, customer_name,
      billing_address, billing_pincode, billing_state, billing_country, billing_gst,
      delivery_name,
      delivery_address, delivery_pincode, delivery_state, delivery_country, delivery_gst,
      transport_name, vehicle_no, firm, company_id,
      prepared_by, remarks,
      items = [],
    } = req.body;

    if (order_id) {
      const { table: orderTable, row: orderRow } = await findOrderRow(order_id);
      if (!orderTable || !orderRow) {
        await conn.rollback();
        return res.status(400).json({
          message: `Selected order (id=${order_id}) no longer exists or could not be matched. Please re-select the Customer Order.`,
        });
      }
    }
    if (customer_id) {
      const masterTable = await resolveCustomerMasterTable();
      if (masterTable) {
        const masterCols = await getColumns(masterTable);
        const masterPkCol = pickColumn(masterCols, ID_COLUMN_CANDIDATES);
        if (masterPkCol) {
          const [[custRow]] = await conn.query(
            `SELECT ${masterPkCol} FROM ${masterTable} WHERE ${masterPkCol} = ?`,
            [customer_id]
          );
          if (!custRow) {
            await conn.rollback();
            return res.status(400).json({
              message: `Selected customer (id=${customer_id}) not found in ${masterTable}. Please re-select the Customer Order.`,
            });
          }
        }
      }
    }
    // *** NEW *** — validate the selected Company Details Master row the
    // same way order_id / customer_id are validated above, so a stale
    // company_id (e.g. that company was deleted after being picked in an
    // open form) is caught with a clear message instead of silently
    // saving an orphaned reference.
    const companyIdSupported = await hasCompanyIdColumn();
    if (company_id) {
      const [[compRow]] = await conn.query(
        `SELECT id FROM ${COMPANY_DETAILS_TABLE} WHERE id = ?`,
        [company_id]
      );
      if (!compRow) {
        await conn.rollback();
        return res.status(400).json({
          message: `Selected company (id=${company_id}) not found in Company Details Master. Please re-select the Company.`,
        });
      }
    }
    if (items.length > 0) {
      const ids = items.map(it => it.fpi_item_id).filter(Boolean);
      if (ids.length !== items.length) {
        await conn.rollback();
        return res.status(400).json({ message: 'One or more selected pieces are missing a valid stock reference (fpi_item_id). Try re-adding the piece from the picker.' });
      }
      const [[dupCheck]] = await conn.query(
        `SELECT GROUP_CONCAT(fpi_item_id) as dupes FROM fabric_packing_list_items WHERE fpi_item_id IN (?)`,
        [ids]
      );
      if (dupCheck?.dupes) {
        await conn.rollback();
        return res.status(409).json({ message: `Piece(s) already packed in another Packing List: ${dupCheck.dupes}. Refresh the stock picker and try again.` });
      }
    }

    const totals = items.reduce((acc, it) => {
      acc.meter    += Number(it.meter)    || 0;
      acc.gross_wt += Number(it.gross_wt) || 0;
      acc.net_wt   += Number(it.net_wt)   || 0;
      return acc;
    }, { meter: 0, gross_wt: 0, net_wt: 0 });

    // *** NEW *** — column list and values are built together as
    // [column, value] pairs (not two separately-maintained arrays), so
    // company_id being conditionally included can never desync the ?
    // placeholder count from the values array the way the earlier
    // Company Details INSERT bug did. This avoids the fragile
    // "find this value's position and splice" approach, which breaks if
    // two fields happen to share the same value (e.g. both null).
    let plId, finalPlNo, lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      finalPlNo = (pl_no && pl_no.trim() && attempt === 0) ? pl_no.trim() : await generateNextPlNo(conn);

      const pairs = [
        ['pl_no', finalPlNo], ['pl_date', pl_date || null],
        ['order_id', order_id || null], ['order_code', order_code || null], ['sort_no', sort_no || null], ['quality', quality || null],
        ['customer_id', customer_id || null], ['customer_name', customer_name || null],
        ['billing_address', billing_address || null], ['billing_pincode', billing_pincode || null], ['billing_state', billing_state || null], ['billing_country', billing_country || null], ['billing_gst', billing_gst || null],
        ['delivery_name', delivery_name || null],
        ['delivery_address', delivery_address || null], ['delivery_pincode', delivery_pincode || null], ['delivery_state', delivery_state || null], ['delivery_country', delivery_country || null], ['delivery_gst', delivery_gst || null],
        ['transport_name', transport_name || null], ['vehicle_no', vehicle_no || null], ['firm', firm || null],
      ];
      if (companyIdSupported) pairs.push(['company_id', company_id || null]);
      pairs.push(
        ['total_pieces', items.length], ['total_meter', +totals.meter.toFixed(2)], ['total_gross_wt', +totals.gross_wt.toFixed(2)], ['total_net_wt', +totals.net_wt.toFixed(2)],
        ['prepared_by', prepared_by || null], ['remarks', remarks || null], ['status', 'finalized'],
      );

      const baseColumns = pairs.map(p => p[0]);
      const baseValues  = pairs.map(p => p[1]);

      try {
        const [r] = await conn.query(
          `INSERT INTO fabric_packing_lists (${baseColumns.join(', ')})
           VALUES (${baseColumns.map(() => '?').join(',')})`,
          baseValues
        );
        plId = r.insertId;
        lastErr = null;
        break;
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          console.warn(`⚠ pl_no collision on '${finalPlNo}', retrying (attempt ${attempt + 1}/3)`);
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    if (lastErr) throw lastErr;

    for (const it of items) {
      await conn.query(
        `INSERT INTO fabric_packing_list_items (
          pl_id, fpi_item_id, fpi_id, fpi_no, sort_no, construction,
          piece_no, new_piece_no, meter, gross_wt, net_wt
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          plId, it.fpi_item_id || null, it.fpi_id || null, it.fpi_no || null,
          it.sort_no || null, it.construction || null,
          it.piece_no || null, it.new_piece_no || null,
          it.meter || 0, it.gross_wt || 0, it.net_wt || 0,
        ]
      );
    }

    // Marks any manual-stock pieces used in this PL as packed, so they
    // stop showing up in the picker (offset ids >= 1e9 mean manual).
    for (const it of items) {
      if (it.fpi_item_id && it.fpi_item_id >= 1000000000) {
        await setManualRowPacked(it.fpi_item_id - 1000000000, plId);
      }
    }

    await conn.commit();
    console.log('✅ Packing List created, id:', plId, '| pl_no:', finalPlNo);
    res.status(201).json({ id: plId, pl_no: finalPlNo });
  } catch (err) {
    await conn.rollback();
    console.error('❌ POST /fabric-packing-list ERROR');
    console.error('   message:', err.message);
    console.error('   code:', err.code);
    console.error('   sqlMessage:', err.sqlMessage);
    console.error('   sqlState:', err.sqlState);
    console.error('   sql:', err.sql);
    res.status(500).json({
      message: err.sqlMessage || err.message,
      code: err.code,
      sqlState: err.sqlState,
    });
  } finally { conn.release(); }
});

// ── Update ──────────────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const {
      pl_no, pl_date,
      order_id, order_code, sort_no, quality,
      customer_id, customer_name,
      billing_address, billing_pincode, billing_state, billing_country, billing_gst,
      delivery_name,
      delivery_address, delivery_pincode, delivery_state, delivery_country, delivery_gst,
      transport_name, vehicle_no, firm, company_id,
      prepared_by, remarks,
      items = [],
    } = req.body;

    const companyIdSupported = await hasCompanyIdColumn();
    if (company_id) {
      const [[compRow]] = await conn.query(
        `SELECT id FROM ${COMPANY_DETAILS_TABLE} WHERE id = ?`,
        [company_id]
      );
      if (!compRow) {
        await conn.rollback();
        return res.status(400).json({
          message: `Selected company (id=${company_id}) not found in Company Details Master. Please re-select the Company.`,
        });
      }
    }

    const totals = items.reduce((acc, it) => {
      acc.meter    += Number(it.meter)    || 0;
      acc.gross_wt += Number(it.gross_wt) || 0;
      acc.net_wt   += Number(it.net_wt)   || 0;
      return acc;
    }, { meter: 0, gross_wt: 0, net_wt: 0 });

    // Release previously-linked manual pieces before wiping the items
    // table, then re-mark whichever manual pieces are in the new item
    // list. Prevents a manual piece from staying "used" forever once
    // removed from a PL during edit, and prevents a re-added one from
    // staying unmarked.
    const [oldItemRows] = await conn.query(
      `SELECT fpi_item_id FROM fabric_packing_list_items WHERE pl_id=? AND fpi_item_id IS NOT NULL`,
      [req.params.id]
    );
    for (const row of oldItemRows) {
      if (row.fpi_item_id >= 1000000000) {
        await setManualRowPacked(row.fpi_item_id - 1000000000, null);
      }
    }

    const setClauses = [
      'pl_no=?', 'pl_date=?', 'order_id=?', 'order_code=?', 'sort_no=?', 'quality=?',
      'customer_id=?', 'customer_name=?',
      'billing_address=?', 'billing_pincode=?', 'billing_state=?', 'billing_country=?', 'billing_gst=?',
      'delivery_name=?',
      'delivery_address=?', 'delivery_pincode=?', 'delivery_state=?', 'delivery_country=?', 'delivery_gst=?',
      'transport_name=?', 'vehicle_no=?', 'firm=?',
      'total_pieces=?', 'total_meter=?', 'total_gross_wt=?', 'total_net_wt=?',
      'prepared_by=?', 'remarks=?',
    ];
    const setValues = [
      pl_no, pl_date || null,
      order_id || null, order_code || null, sort_no || null, quality || null,
      customer_id || null, customer_name || null,
      billing_address || null, billing_pincode || null, billing_state || null, billing_country || null, billing_gst || null,
      delivery_name || null,
      delivery_address || null, delivery_pincode || null, delivery_state || null, delivery_country || null, delivery_gst || null,
      transport_name || null, vehicle_no || null, firm || null,
      items.length, +totals.meter.toFixed(2), +totals.gross_wt.toFixed(2), +totals.net_wt.toFixed(2),
      prepared_by || null, remarks || null,
    ];
    if (companyIdSupported) {
      setClauses.push('company_id=?');
      setValues.push(company_id || null);
    }
    setValues.push(req.params.id);

    await conn.query(
      `UPDATE fabric_packing_lists SET ${setClauses.join(', ')} WHERE id=?`,
      setValues
    );

    await conn.query(`DELETE FROM fabric_packing_list_items WHERE pl_id=?`, [req.params.id]);
    for (const it of items) {
      await conn.query(
        `INSERT INTO fabric_packing_list_items (
          pl_id, fpi_item_id, fpi_id, fpi_no, sort_no, construction,
          piece_no, new_piece_no, meter, gross_wt, net_wt
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          req.params.id, it.fpi_item_id || null, it.fpi_id || null, it.fpi_no || null,
          it.sort_no || null, it.construction || null,
          it.piece_no || null, it.new_piece_no || null,
          it.meter || 0, it.gross_wt || 0, it.net_wt || 0,
        ]
      );
    }

    // Re-mark manual pieces in the (possibly changed) item list.
    for (const it of items) {
      if (it.fpi_item_id && it.fpi_item_id >= 1000000000) {
        await setManualRowPacked(it.fpi_item_id - 1000000000, req.params.id);
      }
    }

    await conn.commit();
    console.log('✅ Packing List updated, id:', req.params.id);
    res.json({ message: 'Updated' });
  } catch (err) {
    await conn.rollback();
    console.error('❌ PUT /fabric-packing-list/:id ERROR:', err.message, '| code:', err.code, '| sqlMessage:', err.sqlMessage);
    res.status(500).json({ message: err.sqlMessage || err.message, code: err.code });
  } finally { conn.release(); }
});

// ── Delete ──────────────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Release manual pieces this PL was holding before deleting the PL —
    // otherwise they'd stay marked "used" forever and never reappear in
    // the picker.
    const [itemRows] = await conn.query(
      `SELECT fpi_item_id FROM fabric_packing_list_items WHERE pl_id=? AND fpi_item_id IS NOT NULL`,
      [req.params.id]
    );
    for (const row of itemRows) {
      if (row.fpi_item_id >= 1000000000) {
        await setManualRowPacked(row.fpi_item_id - 1000000000, null);
      }
    }

    await conn.query(`DELETE FROM fabric_packing_list_items WHERE pl_id=?`, [req.params.id]);
    await conn.query(`DELETE FROM fabric_packing_lists WHERE id=?`, [req.params.id]);
    await conn.commit();
    console.log('✅ Packing List deleted, id:', req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    await conn.rollback();
    console.error('❌ DELETE /fabric-packing-list/:id ERROR:', err.message);
    res.status(500).json({ message: err.message });
  } finally { conn.release(); }
});

module.exports = router;