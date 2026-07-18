const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { auth } = require('../middleware/auth');

// getStockRows() here must return the same "unpacked yarn lot" rows shown
// on the Yarn Stock → Piece Detail tab (lot_no, count_desc, hsn_code,
// received_kgs, rate, supplier_name, location_name, inward_no, inward_date,
// item id).
//
// ── FIX ─────────────────────────────────────────────────────────────────
// There is no separate Yarn Stock route module in this project to import
// from (unlike Fabric Packing List, which has fabric-stock.js). So instead
// of requiring an external file, getStockRows() is implemented right here
// using schema introspection — the same candidate-table / candidate-column
// pattern already used above for order tables / customer-master. It scans
// likely table names for yarn inward/stock, auto-detects the real column
// names, and (if a status column exists) prefers APPROVED rows, matching
// the "APPROVED inwards" behavior described in the frontend comments.
//
// If NONE of the candidate table names exist in your database, it throws
// an error that lists every table containing "yarn" so you can tell me the
// real table name and I can add it to YARN_STOCK_TABLE_CANDIDATES below.
// ───────────────────────────────────────────────────────────────────────
const YARN_STOCK_TABLE_CANDIDATES = [
  'yarn_stock',
  'yarn_stock_items',
  'yarn_inward',
  'yarn_inward_items',
  'yarn_purchase_inward',
  'yarn_purchase_inward_items',
  'yarn_purchase',
  'yarn_purchase_items',
  'yarn_lots',
  'yarn_item_stock',
];

const STOCK_ID_COL_CANDIDATES        = ['id', 'item_id', 'stock_id', 'yarn_item_id'];
const STOCK_LOT_NO_COL_CANDIDATES    = ['lot_no', 'lotNo', 'lot_number', 'piece_no', 'pieceNo'];
const STOCK_COUNT_DESC_COL_CANDIDATES= ['count_desc', 'countDesc', 'sort_no', 'sortNo', 'count', 'yarn_count'];
const STOCK_HSN_COL_CANDIDATES       = ['hsn_code', 'hsnCode', 'hsn'];
const STOCK_RECEIVED_KGS_COL_CANDIDATES = ['received_kgs', 'receivedKgs', 'kgs', 'net_weight', 'weight_kgs', 'qty_kgs'];
const STOCK_RATE_COL_CANDIDATES      = ['rate', 'rate_per_kg', 'ratePerKg'];
const STOCK_SUPPLIER_COL_CANDIDATES  = ['supplier_name', 'supplierName', 'supplier'];
const STOCK_LOCATION_COL_CANDIDATES  = ['location_name', 'locationName', 'location', 'godown', 'warehouse'];
const STOCK_INWARD_NO_COL_CANDIDATES = ['inward_no', 'inwardNo', 'inward_number', 'grn_no'];
const STOCK_INWARD_DATE_COL_CANDIDATES = ['inward_date', 'inwardDate', 'received_date', 'grn_date'];
const STOCK_STATUS_COL_CANDIDATES    = ['status', 'approval_status', 'inward_status'];

let resolvedYarnStockTable = null;

async function resolveYarnStockTable() {
  if (resolvedYarnStockTable) return resolvedYarnStockTable;
  for (const table of YARN_STOCK_TABLE_CANDIDATES) {
    if (await tableExists(table)) {
      resolvedYarnStockTable = table;
      console.log(`[yarn-packing-list] resolved yarn stock table -> '${table}'`);
      return table;
    }
  }
  return null;
}

async function getStockRows() {
  const table = await resolveYarnStockTable();
  if (!table) {
    // Help pinpoint the real table name instead of failing blind again.
    const [likely] = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE '%yarn%'`
    );
    throw new Error(
      `No yarn stock table found. Tried [${YARN_STOCK_TABLE_CANDIDATES.join(', ')}]. ` +
      `Tables in this database containing "yarn": ${likely.map(r => r.TABLE_NAME).join(', ') || '(none found)'}. ` +
      `Tell me the real table name so it can be added to YARN_STOCK_TABLE_CANDIDATES.`
    );
  }

  const cols = await getColumns(table);
  const idCol          = pickColumn(cols, STOCK_ID_COL_CANDIDATES);
  const lotNoCol        = pickColumn(cols, STOCK_LOT_NO_COL_CANDIDATES);
  const countDescCol    = pickColumn(cols, STOCK_COUNT_DESC_COL_CANDIDATES);
  const hsnCol          = pickColumn(cols, STOCK_HSN_COL_CANDIDATES);
  const receivedKgsCol  = pickColumn(cols, STOCK_RECEIVED_KGS_COL_CANDIDATES);
  const rateCol         = pickColumn(cols, STOCK_RATE_COL_CANDIDATES);
  const supplierCol     = pickColumn(cols, STOCK_SUPPLIER_COL_CANDIDATES);
  const locationCol     = pickColumn(cols, STOCK_LOCATION_COL_CANDIDATES);
  const inwardNoCol     = pickColumn(cols, STOCK_INWARD_NO_COL_CANDIDATES);
  const inwardDateCol   = pickColumn(cols, STOCK_INWARD_DATE_COL_CANDIDATES);
  const statusCol       = pickColumn(cols, STOCK_STATUS_COL_CANDIDATES);

  let sql = `SELECT * FROM ${table}`;
  if (statusCol) {
    // Only show APPROVED inward lots, matching the frontend's stated
    // "unpacked lots only, APPROVED inwards" behavior. If the approved
    // value in your data isn't literally 'APPROVED', tell me the real
    // value and this filter will be adjusted.
    sql += ` WHERE UPPER(${statusCol}) = 'APPROVED'`;
  }

  const [rows] = await db.query(sql);

  console.log(
    `[yarn-packing-list] getStockRows(): table='${table}' rows=${rows.length} ` +
    `cols matched -> id:${idCol} lot_no:${lotNoCol} count_desc:${countDescCol} hsn:${hsnCol} ` +
    `received_kgs:${receivedKgsCol} rate:${rateCol} supplier:${supplierCol} location:${locationCol} ` +
    `inward_no:${inwardNoCol} inward_date:${inwardDateCol} status:${statusCol}`
  );

  return rows.map(r => ({
    id:             idCol ? r[idCol] : undefined,
    item_id:        idCol ? r[idCol] : undefined,
    lot_no:         lotNoCol ? r[lotNoCol] : '',
    count_desc:     countDescCol ? r[countDescCol] : '',
    hsn_code:       hsnCol ? r[hsnCol] : '',
    received_kgs:   receivedKgsCol ? Number(r[receivedKgsCol]) || 0 : 0,
    rate:           rateCol ? Number(r[rateCol]) || 0 : 0,
    supplier_name:  supplierCol ? r[supplierCol] : '',
    location_name:  locationCol ? r[locationCol] : '',
    inward_no:      inwardNoCol ? r[inwardNoCol] : '',
    inward_date:    inwardDateCol ? r[inwardDateCol] : '',
  }));
}

// ── Schema introspection helpers (same pattern as Fabric Packing List) ────
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

// Yarn purchase/customer orders can live under any of these table names
// depending on how the order-booking module was set up.
const YARN_ORDER_TABLE_CANDIDATES = [
  'yarn_orders',
  'yarn_order_bookings',
  'customer_orders',
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

const ID_COLUMN_CANDIDATES = ['id', 'order_id', 'yo_id', 'co_id', 'orderId', 'oid'];

// ─────────────────────────────────────────────────────────────────────────
// Try every candidate order table and use whichever actually contains a row
// with that id. Column introspection is cached (safe — columns don't change
// between requests) but the matched table is never cached across ids.
// ─────────────────────────────────────────────────────────────────────────
async function findOrderRow(orderId) {
  const tried = [];
  for (const table of YARN_ORDER_TABLE_CANDIDATES) {
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

// Scans every pl_no for the fiscal year and takes the true MAX() of the
// numeric sequence part, instead of trusting "ORDER BY id DESC LIMIT 1"
// (which breaks on deleted rows / out-of-order ids and can regenerate a
// pl_no that already exists, tripping the UNIQUE constraint silently).
async function generateNextPlNo(conn) {
  const fy     = fiscalYearLabel();
  const suffix = `/${fy}`;

  const [rows] = await conn.query(
    `SELECT pl_no FROM yarn_packing_lists WHERE pl_no LIKE ?`,
    [`YPL%${suffix}`]
  );

  let maxSeq = 0;
  for (const r of rows) {
    const numPart = r.pl_no.replace('YPL', '').split('/')[0];
    const n = parseInt(numPart, 10);
    if (!isNaN(n) && n > maxSeq) maxSeq = n;
  }
  return `YPL${String(maxSeq + 1).padStart(5, '0')}${suffix}`;
}

router.get('/next-pl-no', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    res.json({ pl_no: await generateNextPlNo(conn) });
  } catch (err) {
    console.error('❌ GET /yarn-packing-list/next-pl-no ERROR:', err.message);
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
        `❌ GET /yarn-packing-list/order/${orderId} — id not found in any candidate table.`,
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

    console.log(`\n[yarn-packing-list] ── order lookup ──`);
    console.log(`  matched table='${table}'  pk column='${pkCol}'`);
    console.log(`  row:`, row);

    const orderCodeCol   = pickColumn(cols, ['order_code', 'order_no', 'yo_no', 'co_no', 'order_number']);
    const countDescCol   = pickColumn(cols, ['count_desc', 'sort_no', 'sortNo', 'count', 'yarn_count']);
    const qualityCol     = pickColumn(cols, ['quality', 'yarn_quality', 'construction']);
    const customerIdCol  = pickColumn(cols, ['customer_id', 'customerId', 'cust_id']);
    const customerNameCol= pickColumn(cols, ['customer_name', 'customer', 'customerName']);
    const billAddrCol    = pickColumn(cols, ['billing_address', 'bill_address', 'billingAddress']);
    const billPincodeCol = pickColumn(cols, [
      'billing_pincode', 'bill_pincode', 'billingPincode', 'bill_pin',
      'billing_pin', 'billing_pin_code', 'bill_pin_code',
      'billing_zip', 'billing_zipcode', 'billing_postal_code',
      'customer_pincode', 'cust_pincode', 'pincode', 'pin_code', 'pin',
    ]);
    const billStateCol   = pickColumn(cols, ['billing_state', 'bill_state', 'state']);
    const billCountryCol = pickColumn(cols, ['billing_country', 'bill_country', 'country']);
    const billGstCol     = pickColumn(cols, ['billing_gst', 'bill_gst', 'gst_no', 'gstin']);
    const delNameCol     = pickColumn(cols, ['delivery_name', 'ship_to_name', 'consignee_name']);
    const delAddrCol     = pickColumn(cols, ['delivery_address', 'ship_address', 'deliveryAddress']);
    const delPincodeCol  = pickColumn(cols, [
      'delivery_pincode', 'ship_pincode', 'deliveryPincode', 'ship_pin',
      'delivery_pin', 'delivery_pin_code', 'ship_pin_code',
      'delivery_zip', 'delivery_zipcode', 'delivery_postal_code',
    ]);
    const delStateCol    = pickColumn(cols, ['delivery_state', 'ship_state']);
    const delCountryCol  = pickColumn(cols, ['delivery_country', 'ship_country']);
    const delGstCol      = pickColumn(cols, ['delivery_gst', 'ship_gst']);
    const transportCol   = pickColumn(cols, ['transport_name', 'transport', 'transportName']);
    const vehicleCol     = pickColumn(cols, ['vehicle_no', 'vehicleNo']);
    const firmCol        = pickColumn(cols, ['firm', 'billing_firm', 'company_firm']);

    console.log(`  order row columns:`, Array.from(cols).sort());

    let masterRow = null;
    let masterCols = new Set();
    const customerId = customerIdCol ? row[customerIdCol] : null;

    // Always attempt the customer-master join whenever a customer_id
    // exists, regardless of which fields already live on the order row —
    // fields that live ONLY on the master table (like billing_pincode)
    // would otherwise stay blank whenever the order row already has its
    // own name/address/GST columns. Per-field values still prefer the
    // order row's own column when present (see finalXxx ternaries below).
    if (customerId) {
      const masterTable = await resolveCustomerMasterTable();
      if (!masterTable) {
        console.error(
          '⚠ Order references customer_id', customerId,
          'but no customer-master table found. Tried:', CUSTOMER_MASTER_TABLE_CANDIDATES
        );
      } else {
        masterCols = await getColumns(masterTable);
        const masterPkCol = pickColumn(masterCols, ID_COLUMN_CANDIDATES);
        if (masterPkCol) {
          const [[mRow]] = await db.query(`SELECT * FROM ${masterTable} WHERE ${masterPkCol} = ?`, [customerId]);
          if (mRow) {
            masterRow = mRow;
            console.log(`  master table='${masterTable}'  pk column='${masterPkCol}'`);
          } else {
            console.error(`⚠ customer_id ${customerId} not found in '${masterTable}' (pk: ${masterPkCol})`);
          }
        }
      }
    }

    const mName        = masterRow && pickColumn(masterCols, ['customer_name', 'name', 'company_name']);
    const mBillAddr     = masterRow && pickColumn(masterCols, ['billing_address', 'address', 'bill_address']);
    const mBillPincode  = masterRow && pickColumn(masterCols, [
      'billing_pincode', 'pincode', 'bill_pincode', 'billingPincode', 'bill_pin',
      'billing_pin', 'billing_pin_code', 'bill_pin_code',
      'billing_zip', 'billing_zipcode', 'billing_postal_code',
      'customer_pincode', 'cust_pincode', 'pin_code', 'pin',
    ]);
    const mBillState     = masterRow && pickColumn(masterCols, ['billing_state', 'state', 'bill_state']);
    const mBillCountry    = masterRow && pickColumn(masterCols, ['billing_country', 'country', 'bill_country']);
    const mBillGst          = masterRow && pickColumn(masterCols, ['gst_no', 'gstin', 'gst']);
    const mDelName            = masterRow && pickColumn(masterCols, ['delivery_name', 'ship_to_name', 'consignee_name']);
    const mDelAddr              = masterRow && pickColumn(masterCols, ['delivery_address', 'ship_address']);
    const mDelPincode             = masterRow && pickColumn(masterCols, ['delivery_pincode', 'ship_pincode']);
    const mDelState                 = masterRow && pickColumn(masterCols, ['delivery_state', 'ship_state']);
    const mDelCountry                 = masterRow && pickColumn(masterCols, ['delivery_country', 'ship_country']);
    const mDelGst                       = masterRow && pickColumn(masterCols, ['delivery_gst', 'ship_gst']);

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

    // Same known-good fallback used on Fabric Packing List: if no billing
    // pincode column matched anywhere, fall back to the delivery pincode
    // rather than leaving the field blank on the form.
    if (!finalBillPincode) {
      console.warn(
        `⚠ billing_pincode not found under any known column name for order ${orderId}.`,
        `— falling back to delivery pincode ('${finalDelPincode}') if available.`
      );
      if (finalDelPincode) finalBillPincode = finalDelPincode;
    }

    res.json({
      order_id:          row[pkCol],
      order_code:        orderCodeCol ? row[orderCodeCol] : '',
      count_desc:        countDescCol ? row[countDescCol] : '',
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
    console.error('❌ GET /yarn-packing-list/order/:orderId ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── Count/Sort normalization for the stock-availability filter ─────────────
function normalizeCountDesc(v) {
  return String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}
function countDescMatches(a, b) {
  const na = normalizeCountDesc(a);
  const nb = normalizeCountDesc(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (/^\d+$/.test(na) && /^\d+$/.test(nb)) {
    return parseInt(na, 10) === parseInt(nb, 10);
  }
  return false;
}
const STOCK_COUNT_DESC_KEYS = ['count_desc', 'countDesc', 'sort_no', 'sortNo', 'count'];
function getStockRowCountDesc(row) {
  for (const k of STOCK_COUNT_DESC_KEYS) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return '';
}

// ── Available yarn-stock lots ───────────────────────────────────────────
//
// Response shape (NOT a bare array):
//   {
//     pieces: [...],                      // unpacked lots to show/pick
//     total_unpacked: number,
//     requested_count_desc: string|null,
//     count_desc_found_in_stock: bool|null,
//     available_count_descs: string[]|undefined  // only when requested
//                                                  // count matched nothing
//   }
router.get('/available-stock', auth, async (req, res) => {
  try {
    const { count_desc, search } = req.query;

    const [packedRows] = await db.query(
      `SELECT DISTINCT yarn_item_id FROM yarn_packing_list_items WHERE yarn_item_id IS NOT NULL`
    );
    const packedIds = new Set(packedRows.map(r => r.yarn_item_id));

    const allUnpacked = (await getStockRows()).filter(r => !packedIds.has(r.id ?? r.item_id));

    let rows = allUnpacked;
    let countDescMismatch = false;

    if (count_desc) {
      rows = allUnpacked.filter(r => countDescMatches(getStockRowCountDesc(r), count_desc));
      countDescMismatch = rows.length === 0 && allUnpacked.length > 0;
    }

    if (search) {
      const q = String(search).toLowerCase();
      rows = rows.filter(r =>
        String(r.lot_no || '').toLowerCase().includes(q) ||
        String(r.hsn_code || '').toLowerCase().includes(q) ||
        String(r.supplier_name || '').toLowerCase().includes(q) ||
        String(getStockRowCountDesc(r) || '').toLowerCase().includes(q)
      );
    }

    let availableCountDescs;
    if (countDescMismatch) {
      availableCountDescs = [...new Set(
        allUnpacked.map(r => getStockRowCountDesc(r)).filter(Boolean)
      )].sort();
      console.warn(
        `⚠ /yarn-packing-list/available-stock: count_desc='${count_desc}' matched 0 of ${allUnpacked.length} unpacked lots.`,
        `Count/sort values actually present in unpacked stock:`, availableCountDescs
      );
    }

    res.json({
      pieces: rows,
      total_unpacked: allUnpacked.length,
      requested_count_desc: count_desc || null,
      count_desc_found_in_stock: count_desc ? !countDescMismatch : null,
      available_count_descs: availableCountDescs,
    });
  } catch (err) {
    console.error('❌ GET /yarn-packing-list/available-stock ERROR:', err.message);
    console.error('   stack:', err.stack);
    res.status(500).json({ message: err.message });
  }
});

// ── List (header rows) ─────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM yarn_packing_lists ORDER BY id DESC`);
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /yarn-packing-list ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── Single (header + items) ────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const [[pl]] = await db.query(`SELECT * FROM yarn_packing_lists WHERE id=?`, [req.params.id]);
    if (!pl) return res.status(404).json({ message: 'Packing List not found' });

    const [items] = await db.query(
      `SELECT * FROM yarn_packing_list_items WHERE pl_id=? ORDER BY id ASC`,
      [req.params.id]
    );
    res.json({ ...pl, items });
  } catch (err) {
    console.error('❌ GET /yarn-packing-list/:id ERROR:', err.message);
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
      order_id, order_code, count_desc, quality,
      customer_id, customer_name,
      billing_address, billing_pincode, billing_state, billing_country, billing_gst,
      delivery_name,
      delivery_address, delivery_pincode, delivery_state, delivery_country, delivery_gst,
      transport_name, vehicle_no, firm,
      prepared_by, remarks,
      items = [],
    } = req.body;

    // ── FK pre-checks — turn a cryptic MySQL 1452 error into a clear,
    // actionable message instead of a bare 500. ──
    if (order_id) {
      const { table: orderTable, row: orderRow } = await findOrderRow(order_id);
      if (!orderTable || !orderRow) {
        await conn.rollback();
        console.error(`❌ Create Yarn Packing List: order_id=${order_id} not found in any order table.`);
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
            console.error(`❌ Create Yarn Packing List: customer_id=${customer_id} not found in '${masterTable}'.`);
            return res.status(400).json({
              message: `Selected customer (id=${customer_id}) not found in ${masterTable}. Please re-select the Customer Order.`,
            });
          }
        }
      }
    }
    // yarn_item_id on each line should exist in yarn stock and not already
    // be packed elsewhere.
    if (items.length > 0) {
      const ids = items.map(it => it.yarn_item_id).filter(Boolean);
      if (ids.length !== items.length) {
        await conn.rollback();
        return res.status(400).json({ message: 'One or more selected lots are missing a valid stock reference (yarn_item_id). Try re-adding the lot from the picker.' });
      }
      const [[dupCheck]] = await conn.query(
        `SELECT GROUP_CONCAT(yarn_item_id) as dupes FROM yarn_packing_list_items WHERE yarn_item_id IN (?)`,
        [ids]
      );
      if (dupCheck?.dupes) {
        await conn.rollback();
        return res.status(409).json({ message: `Lot(s) already packed in another Packing List: ${dupCheck.dupes}. Refresh the stock picker and try again.` });
      }
    }

    const totals = items.reduce((acc, it) => {
      acc.kgs += Number(it.packed_kgs ?? it.received_kgs) || 0;
      return acc;
    }, { kgs: 0 });

    // Retries up to 3 times, regenerating a fresh pl_no via MAX() on every
    // retry, so a stale/colliding client-supplied pl_no self-heals instead
    // of failing the save with an opaque ER_DUP_ENTRY 500.
    let plId, finalPlNo, lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      finalPlNo = (pl_no && pl_no.trim() && attempt === 0) ? pl_no.trim() : await generateNextPlNo(conn);
      try {
        const [r] = await conn.query(
          `INSERT INTO yarn_packing_lists (
            pl_no, pl_date, order_id, order_code, count_desc, quality,
            customer_id, customer_name,
            billing_address, billing_pincode, billing_state, billing_country, billing_gst,
            delivery_name,
            delivery_address, delivery_pincode, delivery_state, delivery_country, delivery_gst,
            transport_name, vehicle_no, firm,
            total_pieces, total_kgs,
            prepared_by, remarks, status
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            finalPlNo, pl_date || null,
            order_id || null, order_code || null, count_desc || null, quality || null,
            customer_id || null, customer_name || null,
            billing_address || null, billing_pincode || null, billing_state || null, billing_country || null, billing_gst || null,
            delivery_name || null,
            delivery_address || null, delivery_pincode || null, delivery_state || null, delivery_country || null, delivery_gst || null,
            transport_name || null, vehicle_no || null, firm || null,
            items.length, +totals.kgs.toFixed(2),
            prepared_by || null, remarks || null, 'finalized',
          ]
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
        `INSERT INTO yarn_packing_list_items (
          pl_id, yarn_item_id, lot_no, count_desc, hsn_code,
          received_kgs, packed_kgs, rate, supplier_name, location_name
        ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          plId, it.yarn_item_id || null, it.lot_no || null,
          it.count_desc || null, it.hsn_code || null,
          it.received_kgs || 0, it.packed_kgs ?? it.received_kgs ?? 0,
          it.rate || 0, it.supplier_name || null, it.location_name || null,
        ]
      );
    }

    await conn.commit();
    console.log('✅ Yarn Packing List created, id:', plId, '| pl_no:', finalPlNo);
    res.status(201).json({ id: plId, pl_no: finalPlNo });
  } catch (err) {
    await conn.rollback();
    console.error('❌ POST /yarn-packing-list ERROR');
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
      order_id, order_code, count_desc, quality,
      customer_id, customer_name,
      billing_address, billing_pincode, billing_state, billing_country, billing_gst,
      delivery_name,
      delivery_address, delivery_pincode, delivery_state, delivery_country, delivery_gst,
      transport_name, vehicle_no, firm,
      prepared_by, remarks,
      items = [],
    } = req.body;

    const totals = items.reduce((acc, it) => {
      acc.kgs += Number(it.packed_kgs ?? it.received_kgs) || 0;
      return acc;
    }, { kgs: 0 });

    await conn.query(
      `UPDATE yarn_packing_lists SET
        pl_no=?, pl_date=?, order_id=?, order_code=?, count_desc=?, quality=?,
        customer_id=?, customer_name=?,
        billing_address=?, billing_pincode=?, billing_state=?, billing_country=?, billing_gst=?,
        delivery_name=?,
        delivery_address=?, delivery_pincode=?, delivery_state=?, delivery_country=?, delivery_gst=?,
        transport_name=?, vehicle_no=?, firm=?,
        total_pieces=?, total_kgs=?,
        prepared_by=?, remarks=?
       WHERE id=?`,
      [
        pl_no, pl_date || null,
        order_id || null, order_code || null, count_desc || null, quality || null,
        customer_id || null, customer_name || null,
        billing_address || null, billing_pincode || null, billing_state || null, billing_country || null, billing_gst || null,
        delivery_name || null,
        delivery_address || null, delivery_pincode || null, delivery_state || null, delivery_country || null, delivery_gst || null,
        transport_name || null, vehicle_no || null, firm || null,
        items.length, +totals.kgs.toFixed(2),
        prepared_by || null, remarks || null,
        req.params.id,
      ]
    );

    await conn.query(`DELETE FROM yarn_packing_list_items WHERE pl_id=?`, [req.params.id]);
    for (const it of items) {
      await conn.query(
        `INSERT INTO yarn_packing_list_items (
          pl_id, yarn_item_id, lot_no, count_desc, hsn_code,
          received_kgs, packed_kgs, rate, supplier_name, location_name
        ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          req.params.id, it.yarn_item_id || null, it.lot_no || null,
          it.count_desc || null, it.hsn_code || null,
          it.received_kgs || 0, it.packed_kgs ?? it.received_kgs ?? 0,
          it.rate || 0, it.supplier_name || null, it.location_name || null,
        ]
      );
    }

    await conn.commit();
    console.log('✅ Yarn Packing List updated, id:', req.params.id);
    res.json({ message: 'Updated' });
  } catch (err) {
    await conn.rollback();
    console.error('❌ PUT /yarn-packing-list/:id ERROR:', err.message, '| code:', err.code, '| sqlMessage:', err.sqlMessage);
    res.status(500).json({ message: err.sqlMessage || err.message, code: err.code });
  } finally { conn.release(); }
});

// ── Delete ──────────────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM yarn_packing_list_items WHERE pl_id=?`, [req.params.id]);
    await conn.query(`DELETE FROM yarn_packing_lists WHERE id=?`, [req.params.id]);
    await conn.commit();
    console.log('✅ Yarn Packing List deleted, id:', req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    await conn.rollback();
    console.error('❌ DELETE /yarn-packing-list/:id ERROR:', err.message);
    res.status(500).json({ message: err.message });
  } finally { conn.release(); }
});

// ── Convert to Yarn Invoice ─────────────────────────────────────────────
async function generateNextInvoiceNo(conn) {
  const fy     = fiscalYearLabel();
  const suffix = `/${fy}`;
  const [rows] = await conn.query(
    `SELECT invoice_no FROM yarn_invoices WHERE invoice_no LIKE ?`,
    [`YINV%${suffix}`]
  );
  let maxSeq = 0;
  for (const r of rows) {
    const numPart = r.invoice_no.replace('YINV', '').split('/')[0];
    const n = parseInt(numPart, 10);
    if (!isNaN(n) && n > maxSeq) maxSeq = n;
  }
  return `YINV${String(maxSeq + 1).padStart(5, '0')}${suffix}`;
}

router.post('/:id/convert-to-invoice', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[pl]] = await conn.query(`SELECT * FROM yarn_packing_lists WHERE id=?`, [req.params.id]);
    if (!pl) { await conn.rollback(); return res.status(404).json({ message: 'Packing List not found' }); }
    if (pl.status === 'invoiced') {
      await conn.rollback();
      return res.status(409).json({ message: `Already converted to invoice ${pl.invoice_no}` });
    }

    let invoiceId, invoiceNo, lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      invoiceNo = await generateNextInvoiceNo(conn);
      try {
        const [r] = await conn.query(
          `INSERT INTO yarn_invoices (
            invoice_no, invoice_date, pl_id, pl_no, order_id, order_code,
            customer_name, total_kgs, status
          ) VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            invoiceNo, new Date().toISOString().slice(0, 10),
            pl.id, pl.pl_no, pl.order_id, pl.order_code,
            pl.customer_name, pl.total_kgs, 'draft',
          ]
        );
        invoiceId = r.insertId;
        lastErr = null;
        break;
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          console.warn(`⚠ invoice_no collision on '${invoiceNo}', retrying (attempt ${attempt + 1}/3)`);
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    if (lastErr) throw lastErr;

    await conn.query(
      `UPDATE yarn_packing_lists SET status='invoiced', invoice_id=?, invoice_no=? WHERE id=?`,
      [invoiceId, invoiceNo, pl.id]
    );

    await conn.commit();
    console.log('✅ Yarn Packing List converted to invoice:', invoiceNo);
    res.json({ invoice_id: invoiceId, invoice_no: invoiceNo });
  } catch (err) {
    await conn.rollback();
    console.error('❌ POST /yarn-packing-list/:id/convert-to-invoice ERROR:', err.message, '| code:', err.code, '| sqlMessage:', err.sqlMessage);
    res.status(500).json({ message: err.sqlMessage || err.message, code: err.code });
  } finally { conn.release(); }
});

module.exports = router;