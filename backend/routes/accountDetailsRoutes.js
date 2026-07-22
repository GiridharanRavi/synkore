// backend/routes/accountDetailsRoutes.js
//
// ── Account Details module ────────────────────────────────────────────────
// Powers the "Account Details" admin page: two ledgers —
//   • Payment IN   — against Sales Invoices              (money coming FROM customers)
//   • Payment OUT  — against Fabric + Yarn Purchase Invoices (money going TO suppliers)
//
// ─────────────────────────────────────────────────────────────────────────
// FIXED (PREVIOUS REVISIONS): 500 fix, Payment Type/TDS, Qty fallback,
// Payment History endpoints, Edit/Delete on history rows, cancelled/
// deleted-invoice exclusion, Fabric+Yarn merge for Payment Out, widened
// Fabric column candidates (po_no / delivered_qty), Yarn table
// auto-discovery + /_debug reporting.
//
// ─────────────────────────────────────────────────────────────────────────
// NEW (THIS REVISION) — REAL TABLE NAMES LOCKED IN:
//
//   Payment In   → fabric_invoices           (Sales Invoices)
//   Payment Out  → purchase_invoices          (Fabric Purchase Invoices)
//               + yarn_purchase_invoice_bills (Yarn Purchase Invoices)
//
// These are now the primary/first-choice table names everywhere (constants
// below + head of each candidate list), so the module connects straight to
// them without needing auto-discovery. The old candidate lists / discovery
// scan are KEPT as a safety net only — if for some reason
// 'yarn_purchase_invoice_bills' doesn't exist in a given environment, the
// module still tries the old fallback names before giving up, and logs
// clearly which table it actually bound to (see ensureSchema() logs and
// GET /api/account-details/_debug).
//
// LIFECYCLE RULE (Payment In / Payment Out visibility):
//   1) A row only appears in the Payment In ledger while its matching row
//      exists in `fabric_invoices` AND its status is not cancelled/deleted/
//      void (see EXCLUDED_STATUS_VALUES + statusExclusionSql()). Delete the
//      sales invoice, or mark it cancelled/deleted, and it (and its summary
//      contribution) disappears from Payment In immediately — no separate
//      flag to maintain, this is derived live from the source table on
//      every request.
//   2) Same rule for Payment Out, applied independently to `purchase_invoices`
//      (Fabric) and `yarn_purchase_invoice_bills` (Yarn) — each type is
//      filtered by its own status column via statusExclusionSql(), then the
//      two are merged for the combined Payment Out ledger/summary.
//   3) Because payments_in / payments_out are joined (INNER JOIN) to their
//      source invoice table wherever a party name / invoice no is needed,
//      a payment history row also silently disappears once its parent
//      invoice is excluded/deleted — you don't get an orphaned payment row
//      pointing at nothing.
// ─────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// ── Real source tables ─────────────────────────────────────────────────────
// Payment In
const SALES_TABLE          = 'fabric_invoices';
// Payment Out — Fabric
const FABRIC_PURCHASE_TABLE = 'purchase_invoices';
// Payment Out — Yarn (explicit real table name; discovery below is a
// fallback only, in case this literal name isn't present in some DB).
const YARN_PURCHASE_TABLE   = 'yarn_purchase_invoice_bills';

// Kept as an alias so nothing downstream that expected the old name breaks.
const PURCHASE_TABLE = FABRIC_PURCHASE_TABLE;

// Tables/FK targets from earlier revisions of this module — any FK on
// payments_in/payments_out pointing at these is stale and gets dropped.
const STALE_TARGETS_IN  = ['sales_invoices'];
const STALE_TARGETS_OUT = ['fabric_purchase_invoices', 'purchase_orders'];

const PAYMENT_TYPES = ['Full Payment', 'Part Payment', 'Deposit', 'Advance'];

// ── Yarn Purchase Invoice table resolution ──────────────────────────────
// 'yarn_purchase_invoice_bills' is the real table and is tried FIRST. The
// rest of this list is a fallback only, preserved from earlier revisions
// for environments where the table might have a different literal name.
const YARN_TABLE_CANDIDATES = [
  YARN_PURCHASE_TABLE,          // 'yarn_purchase_invoice_bills' — real table
  'yarn_purchase_invoices',
  'yarn_invoices',
  'yarn_purchase_invoice',
  'yarn_purchase_bills',
  'yarn_bills',
];
let _yarnTableName; // undefined = not yet resolved, false = none found, string = resolved

// Column-name candidate map used to resolve BOTH the Fabric and Yarn
// purchase-invoice tables the same way. (Declared here, ABOVE
// discoverYarnPurchaseTable, because discovery needs Yarn's candidate
// lists to validate a discovered table's columns.)
const PURCHASE_TABLE_META = {
  Fabric: {
    table: FABRIC_PURCHASE_TABLE,
    supplierCands: ['supplier', 'supplier_name'],
    refCands: ['internal_ref_no', 'internal_ref'],
    orderNoCands: ['po_no', 'fpo_no', 'order_no', 'purchase_order_no'],
    qtyCands: ['delivered_qty', 'total_qty', 'total_meter', 'qty', 'meters'],
    termsCands: ['pay_terms', 'payment_terms'],
    dueDateCands: ['payment_due_date', 'due_date'],
    amountCands: ['net_value', 'invoice_amount', 'total_amount', 'bill_amount', 'invoice_value', 'grand_total', 'amount', 'net_amount', 'total'],
    dateCands: ['invoice_date', 'date', 'bill_date', 'purchase_date', 'created_date'],
    invoiceNoCands: ['invoice_no', 'bill_no', 'inv_no', 'invoice_number', 'bill_number'],
  },
  Yarn: {
    table: null, // resolved at runtime — 'yarn_purchase_invoice_bills' first
    supplierCands: ['supplier', 'supplier_name'],
    refCands: ['internal_ref_no', 'internal_ref'],
    orderNoCands: ['po_no', 'ypo_no', 'yarn_po_no', 'order_no'],
    qtyCands: ['delivered_qty', 'total_qty', 'qty', 'meters'],
    termsCands: ['pay_terms', 'payment_terms'],
    dueDateCands: ['payment_due_date', 'due_date'],
    amountCands: ['net_value', 'invoice_amount', 'total_amount', 'bill_amount', 'invoice_value', 'grand_total', 'amount', 'net_amount', 'total'],
    dateCands: ['invoice_date', 'date', 'bill_date', 'purchase_date', 'created_date'],
    invoiceNoCands: ['invoice_no', 'bill_no', 'inv_no', 'invoice_number', 'bill_number'],
  },
};

// Fallback discovery — only reached if NONE of YARN_TABLE_CANDIDATES
// (including the real 'yarn_purchase_invoice_bills') exist. Scans
// information_schema for ANY table whose name contains "yarn" and whose
// columns actually look like an invoice (has invoice_no + amount + date
// shaped columns per PURCHASE_TABLE_META.Yarn).
async function discoverYarnPurchaseTable() {
  try {
    const [rows] = await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND LOWER(table_name) LIKE '%yarn%'
         AND (LOWER(table_name) LIKE '%purchase%' OR LOWER(table_name) LIKE '%invoice%' OR LOWER(table_name) LIKE '%bill%')`
    );
    for (const row of rows) {
      const t = row.table_name || row.TABLE_NAME;
      if (!t) continue;

      // Skip a Yarn Purchase ORDER table (e.g. holds "YPO-2026-0003") if
      // it's clearly an order table and not an invoice/bill table — we
      // want the invoice, not the order it was raised against.
      if (/purchase_order|_po$|^ypo/i.test(t) && !/invoice|bill/i.test(t)) continue;

      const cols = await columnsOf(t);
      const hasInvoiceNo = PURCHASE_TABLE_META.Yarn.invoiceNoCands.some(c => cols.has(c));
      const hasAmount    = PURCHASE_TABLE_META.Yarn.amountCands.some(c => cols.has(c));
      const hasDate      = PURCHASE_TABLE_META.Yarn.dateCands.some(c => cols.has(c));

      if (hasInvoiceNo && hasAmount && hasDate) {
        console.log(`[account-details] Yarn Purchase Invoice table AUTO-DISCOVERED: "${t}" (expected "${YARN_PURCHASE_TABLE}" — add this real name to YARN_TABLE_CANDIDATES if it should always be used)`);
        return t;
      }
    }
  } catch (err) {
    console.error('[account-details] discoverYarnPurchaseTable failed:', err.code || '', err.sqlMessage || err.message);
  }
  return false;
}

async function resolveYarnPurchaseTable() {
  if (_yarnTableName !== undefined) return _yarnTableName;

  for (const t of YARN_TABLE_CANDIDATES) {
    if (await tableExists(t)) {
      _yarnTableName = t;
      console.log(`[account-details] Yarn Purchase Invoice table resolved: "${t}"${t === YARN_PURCHASE_TABLE ? ' (expected real table)' : ' (fallback candidate — expected table was not found)'}`);
      return t;
    }
  }

  // Fallback to dynamic discovery instead of giving up immediately
  const discovered = await discoverYarnPurchaseTable();
  if (discovered) {
    _yarnTableName = discovered;
    return discovered;
  }

  _yarnTableName = false;
  console.warn(
    `[account-details] No Yarn Purchase Invoice table found. Expected "${YARN_PURCHASE_TABLE}", also tried: ${YARN_TABLE_CANDIDATES.join(', ')}. ` +
    `Payment Out will only show Fabric invoices until this is fixed — check GET /api/account-details/_debug -> allYarnLikeTables ` +
    `to see every "yarn"-named table in the database.`
  );
  return false;
}

// ── Statuses that must be excluded from every amount / count / listing
//    calculation on this page. Matched case-insensitively. This is what
//    makes a deleted / cancelled invoice disappear from Payment In / Out
//    (and its summary totals) on every request — nothing else to toggle.
//    ⚠️ CONFIRM against your real data: run
//        SELECT DISTINCT status FROM fabric_invoices;
//        SELECT DISTINCT status FROM purchase_invoices;
//        SELECT DISTINCT status FROM yarn_purchase_invoice_bills;
//    and adjust this list so it exactly matches your "cancelled" /
//    "deleted" values (edit freely — this is the only place to touch).
const EXCLUDED_STATUS_VALUES = ['cancelled', 'canceled', 'deleted', 'cancel', 'delete', 'void'];

function statusExclusionSql(alias, statusCol) {
  if (!statusCol) return '';
  const list = EXCLUDED_STATUS_VALUES.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
  const colRef = alias ? `${alias}.${statusCol}` : statusCol;
  return ` AND LOWER(${colRef}) NOT IN (${list})`;
}

// ── Low-level schema helpers ───────────────────────────────────────────────
async function tableExists(table) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table],
  );
  return rows[0].c > 0;
}

async function columnsOf(table) {
  const [rows] = await db.query(`SHOW COLUMNS FROM \`${table}\``);
  return new Set(rows.map(r => r.Field));
}

async function dropStaleForeignKeys(table, staleTargets) {
  try {
    const [rows] = await db.query(
      `SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [table],
    );
    for (const row of rows) {
      if (staleTargets.includes(row.REFERENCED_TABLE_NAME)) {
        console.log(`[account-details] dropping stale FK ${row.CONSTRAINT_NAME} on ${table} (referenced ${row.REFERENCED_TABLE_NAME})`);
        await db.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``);
      }
    }
  } catch (err) {
    console.error(`[account-details] dropStaleForeignKeys(${table}) failed:`, err.code || '', err.sqlMessage || err.message);
  }
}

async function dropAllForeignKeys(table) {
  try {
    const [rows] = await db.query(
      `SELECT CONSTRAINT_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [table],
    );
    for (const row of rows) {
      console.log(`[account-details] dropping FK ${row.CONSTRAINT_NAME} on ${table} (this module doesn't use DB-level FKs)`);
      try {
        await db.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``);
      } catch (err) {
        console.error(`[account-details] could not drop FK ${row.CONSTRAINT_NAME} on ${table}:`, err.code || '', err.sqlMessage || err.message);
      }
    }
  } catch (err) {
    console.error(`[account-details] dropAllForeignKeys(${table}) failed:`, err.code || '', err.sqlMessage || err.message);
  }
}

async function addColumnIfMissing(table, column, ddl) {
  const cols = await columnsOf(table);
  if (!cols.has(column)) {
    console.log(`[account-details] adding missing ${table}.${column}`);
    try {
      await db.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
      delete _colCache[table];
    } catch (err) {
      console.error(`[account-details] addColumnIfMissing(${table}.${column}) failed:`, err.code || '', err.sqlMessage || err.message);
    }
  }
}

// ── Auto-migration ─────────────────────────────────────────────────────────
async function ensureSchema() {
  try {
    if (!(await tableExists(SALES_TABLE))) {
      console.error(`[account-details] EXPECTED TABLE MISSING: ${SALES_TABLE}. Payment In will 500 until this table exists.`);
    }
    if (!(await tableExists(FABRIC_PURCHASE_TABLE))) {
      console.error(`[account-details] EXPECTED TABLE MISSING: ${FABRIC_PURCHASE_TABLE}. Payment Out (Fabric) will 500 until this table exists.`);
    }
    const yarnTable = await resolveYarnPurchaseTable();
    if (!yarnTable) {
      console.error(`[account-details] EXPECTED TABLE MISSING: ${YARN_PURCHASE_TABLE}. Payment Out (Yarn) will show 0 records until this table exists.`);
    }

    // ── payments_out ─────────────────────────────────────────────────────
    if (!(await tableExists('payments_out'))) {
      await db.query(`
        CREATE TABLE payments_out (
          id INT AUTO_INCREMENT PRIMARY KEY,
          purchase_invoice_id INT NOT NULL,
          invoice_type ENUM('Fabric','Yarn') NOT NULL DEFAULT 'Fabric',
          amount DECIMAL(14,2) NOT NULL,
          tds_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
          payment_type ENUM('Full Payment','Part Payment','Deposit','Advance') NOT NULL DEFAULT 'Part Payment',
          payment_date DATE NOT NULL,
          mode VARCHAR(30) NOT NULL DEFAULT 'Bank Transfer',
          reference_no VARCHAR(100) NULL,
          notes TEXT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_payments_out_invoice (purchase_invoice_id, invoice_type)
        )
      `);
      console.log('[account-details] created payments_out (FK-free, invoice_type-aware, references purchase_invoices.id / yarn_purchase_invoice_bills.id in app code)');
    } else {
      await dropAllForeignKeys('payments_out');

      const cols = await columnsOf('payments_out');
      if (!cols.has('purchase_invoice_id')) {
        try {
          if (cols.has('purchase_order_id')) {
            console.log('[account-details] renaming payments_out.purchase_order_id -> purchase_invoice_id');
            await db.query(`ALTER TABLE payments_out CHANGE COLUMN purchase_order_id purchase_invoice_id INT NOT NULL`);
          } else {
            console.log('[account-details] adding missing payments_out.purchase_invoice_id column');
            await db.query(`ALTER TABLE payments_out ADD COLUMN purchase_invoice_id INT NOT NULL DEFAULT 0`);
          }
          delete _colCache['payments_out'];
        } catch (err) {
          console.error('[account-details] payments_out.purchase_invoice_id rename/add failed:', err.code || '', err.sqlMessage || err.message);
        }
      }
      await addColumnIfMissing('payments_out', 'tds_amount', `tds_amount DECIMAL(14,2) NOT NULL DEFAULT 0`);
      await addColumnIfMissing('payments_out', 'payment_type', `payment_type ENUM('Full Payment','Part Payment','Deposit','Advance') NOT NULL DEFAULT 'Part Payment'`);
      await addColumnIfMissing('payments_out', 'invoice_type', `invoice_type ENUM('Fabric','Yarn') NOT NULL DEFAULT 'Fabric'`);
    }

    // ── payments_in ──────────────────────────────────────────────────────
    if (!(await tableExists('payments_in'))) {
      await db.query(`
        CREATE TABLE payments_in (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sales_invoice_id INT NOT NULL,
          amount DECIMAL(14,2) NOT NULL,
          tds_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
          payment_type ENUM('Full Payment','Part Payment','Deposit','Advance') NOT NULL DEFAULT 'Part Payment',
          payment_date DATE NOT NULL,
          mode VARCHAR(30) NOT NULL DEFAULT 'Bank Transfer',
          reference_no VARCHAR(100) NULL,
          notes TEXT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_payments_in_invoice (sales_invoice_id)
        )
      `);
      console.log('[account-details] created payments_in (FK-free, references fabric_invoices.id in app code)');
    } else {
      await dropAllForeignKeys('payments_in');

      const cols = await columnsOf('payments_in');
      if (!cols.has('sales_invoice_id')) {
        try {
          console.log('[account-details] adding missing payments_in.sales_invoice_id column');
          await db.query(`ALTER TABLE payments_in ADD COLUMN sales_invoice_id INT NOT NULL DEFAULT 0`);
          delete _colCache['payments_in'];
        } catch (err) {
          console.error('[account-details] payments_in.sales_invoice_id add failed:', err.code || '', err.sqlMessage || err.message);
        }
      }
      await addColumnIfMissing('payments_in', 'tds_amount', `tds_amount DECIMAL(14,2) NOT NULL DEFAULT 0`);
      await addColumnIfMissing('payments_in', 'payment_type', `payment_type ENUM('Full Payment','Part Payment','Deposit','Advance') NOT NULL DEFAULT 'Part Payment'`);
    }

    console.log(`[account-details] schema check complete. Sales=${SALES_TABLE} FabricPurchase=${FABRIC_PURCHASE_TABLE} YarnPurchase=${yarnTable || '(not found)'} — payments_in/out verified (no FKs, tds_amount + payment_type present; payments_out.invoice_type present)`);
  } catch (err) {
    console.error('[account-details] ensureSchema failed:', err.code || '', err.sqlMessage || err.message);
  }
}

const schemaReady = ensureSchema();

// ── Column cache helpers (tolerant of schema drift) ───────────────────────
const _colCache = {};
async function getCols(table) {
  if (_colCache[table]) return _colCache[table];
  try {
    const [rows] = await db.query(`SHOW COLUMNS FROM \`${table}\``);
    _colCache[table] = new Set(rows.map(r => r.Field));
  } catch {
    _colCache[table] = new Set();
  }
  return _colCache[table];
}
function pickCol(cols, candidates) {
  for (const c of candidates) if (cols.has(c)) return c;
  return null;
}

// ── safe required-column resolver ──────────────────────────────────────
// Replaces the old `pickCol(cols, [...]) || 'some_hardcoded_name'` pattern,
// which would silently query a column that doesn't exist and crash with an
// opaque "Unknown column" 500. This version returns null (so the caller can
// skip that table/type gracefully) and logs the ACTUAL columns so the fix
// is obvious from the server console.
function resolveRequiredCol(cols, candidates, table, purpose) {
  const found = pickCol(cols, candidates);
  if (!found) {
    console.error(
      `[account-details] "${table}" has no recognizable ${purpose} column. ` +
      `Tried: ${candidates.join(', ')}. Actual columns on "${table}": ${[...cols].join(', ') || '(table not found / no columns)'}. ` +
      `Add the real column name to the candidate list for this table so this stops being skipped.`
    );
  }
  return found; // null if not found — callers must handle this
}

function parsePaymentTermsDays(raw) {
  if (raw == null) return 30;
  const match = String(raw).match(/(\d+)/);
  return match ? Number(match[1]) : 30;
}

function computeStatus(docDate, paymentTermsDays, docAmount, paidAmount, explicitDueDate) {
  const terms = Number(paymentTermsDays) || 30;
  const amt   = Number(docAmount)        || 0;
  const paid  = Number(paidAmount)       || 0;
  const balance = Math.max(amt - paid, 0);

  let due;
  if (explicitDueDate) {
    due = new Date(explicitDueDate);
  } else {
    due = docDate ? new Date(docDate) : new Date();
    due.setDate(due.getDate() + terms);
  }

  let status;
  if (balance <= 0 && amt > 0)      status = 'Paid';
  else if (paid > 0 && balance > 0) status = new Date() > due ? 'Overdue' : 'Partially Paid';
  else                              status = new Date() > due ? 'Overdue' : 'Pending';

  return {
    due_date: due.toISOString().slice(0, 10),
    balance,
    status,
  };
}

// ── Qty fallback source (best-effort, Fabric sales invoices only) ─────────
let _packingListQtySource;
async function resolvePackingListQtySource() {
  if (_packingListQtySource !== undefined) return _packingListQtySource;
  const candidates = [
    { table: 'fabric_packing_list_items', plCol: 'pl_no', qtyCol: 'meter' },
    { table: 'fabric_packing_list_items', plCol: 'pl_no', qtyCol: 'qty' },
    { table: 'fabric_packing_list_items', plCol: 'pl_no', qtyCol: 'meters' },
    { table: 'fabric_packing_lists',      plCol: 'pl_no', qtyCol: 'total_meter' },
    { table: 'fabric_packing_list',       plCol: 'pl_no', qtyCol: 'total_meter' },
  ];
  for (const c of candidates) {
    try {
      if (await tableExists(c.table)) {
        const cols = await columnsOf(c.table);
        if (cols.has(c.plCol) && cols.has(c.qtyCol)) {
          _packingListQtySource = c;
          console.log(`[account-details] qty fallback source resolved: ${c.table}.${c.qtyCol} grouped by ${c.plCol}`);
          return c;
        }
      }
    } catch { /* keep trying candidates */ }
  }
  _packingListQtySource = false;
  return false;
}

async function fillMissingQtyFromPackingList(rows) {
  const needFallback = rows.filter(r => (!r.qty || Number(r.qty) === 0) && r.pl_no);
  if (needFallback.length === 0) return rows;

  const src = await resolvePackingListQtySource();
  if (!src) return rows;

  try {
    const plNos = [...new Set(needFallback.map(r => r.pl_no))];
    if (plNos.length === 0) return rows;
    const [sumRows] = await db.query(
      `SELECT ${src.plCol} AS pl_no, SUM(${src.qtyCol}) AS qty_sum
       FROM ${src.table}
       WHERE ${src.plCol} IN (${plNos.map(() => '?').join(',')})
       GROUP BY ${src.plCol}`,
      plNos,
    );
    const byPlNo = new Map(sumRows.map(r => [r.pl_no, Number(r.qty_sum) || 0]));
    return rows.map(r => {
      if ((!r.qty || Number(r.qty) === 0) && r.pl_no && byPlNo.has(r.pl_no)) {
        return { ...r, qty: byPlNo.get(r.pl_no) };
      }
      return r;
    });
  } catch (err) {
    console.error('[account-details] fillMissingQtyFromPackingList failed:', err.sqlMessage || err.message);
    return rows;
  }
}

function validatePaymentType(t) {
  return PAYMENT_TYPES.includes(t) ? t : 'Part Payment';
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic purchase-invoice row fetcher — works for BOTH Fabric
// (purchase_invoices) and Yarn (yarn_purchase_invoice_bills) using the
// column-candidate map. invoiceNoCol, amountCol, and dateCol are resolved
// via resolveRequiredCol and, if any is missing, this function logs why
// and returns [] (contributes 0 rows) instead of building a query against
// a column that doesn't exist and crashing the request.
//
// Cancelled/deleted invoices are excluded here via statusExclusionSql, so
// once a Fabric or Yarn purchase invoice is deleted/cancelled it stops
// contributing rows to Payment Out on the very next request.
// ─────────────────────────────────────────────────────────────────────────────
async function fetchPurchaseInvoiceRowsForType(invoiceType, { search = '', supplier = '' } = {}) {
  const meta = { ...PURCHASE_TABLE_META[invoiceType] };
  if (invoiceType === 'Yarn') {
    const yarnTable = await resolveYarnPurchaseTable();
    if (!yarnTable) return []; // no Yarn table found — contributes zero rows
    meta.table = yarnTable;
  }

  const table = meta.table;
  const cols = await getCols(table);
  if (cols.size === 0) {
    console.error(`[account-details] Could not read columns for "${table}" (table missing or unreadable). Skipping ${invoiceType} purchase invoices.`);
    return [];
  }

  // Required columns — if any of these can't be resolved, we cannot safely
  // build the query, so skip this type entirely rather than 500.
  const invoiceNoCol = resolveRequiredCol(cols, meta.invoiceNoCands, table, 'invoice number');
  const amountCol    = resolveRequiredCol(cols, meta.amountCands, table, 'invoice amount');
  const dateCol      = resolveRequiredCol(cols, meta.dateCands, table, 'invoice date');
  if (!invoiceNoCol || !amountCol || !dateCol) {
    return [];
  }

  // Optional columns — fine to be NULL if not found.
  const suppCol      = pickCol(cols, meta.supplierCands);
  const refCol       = pickCol(cols, meta.refCands);
  const orderNoCol   = pickCol(cols, meta.orderNoCands);
  const qtyCol       = pickCol(cols, meta.qtyCands);
  const termsCol     = pickCol(cols, meta.termsCands);
  const dueDateCol   = pickCol(cols, meta.dueDateCands);
  const invStatusCol = pickCol(cols, ['status']);

  const suppSel  = suppCol     ? `t.${suppCol}`     : 'NULL';
  const refSel   = refCol      ? `t.${refCol}`      : 'NULL';
  const orderSel = orderNoCol  ? `t.${orderNoCol}`  : 'NULL';
  const qtySel   = qtyCol      ? `t.${qtyCol}`      : 'NULL';
  const termsSel = termsCol    ? `t.${termsCol}`    : 'NULL';
  const dueSel   = dueDateCol  ? `t.${dueDateCol}`  : 'NULL';

  const poutCols    = await getCols('payments_out');
  const poutFk      = pickCol(poutCols, ['purchase_invoice_id', 'purchase_order_id']) || 'purchase_invoice_id';
  const poutHasType = poutCols.has('invoice_type');

  const paidJoinCond = poutHasType
    ? `pout.${poutFk} = t.id AND pout.invoice_type = ${db.escape(invoiceType)}`
    : (invoiceType === 'Fabric' ? `pout.${poutFk} = t.id` : '1=0');

  let where = 'WHERE 1=1';
  const params = [];
  if (search) {
    const searchCols = [`t.${invoiceNoCol}`];
    if (suppCol)     searchCols.push(`t.${suppCol}`);
    if (refCol)      searchCols.push(`t.${refCol}`);
    if (orderNoCol)  searchCols.push(`t.${orderNoCol}`);
    where += ` AND (${searchCols.map(c => `${c} LIKE ?`).join(' OR ')})`;
    params.push(...searchCols.map(() => `%${search}%`));
  }
  if (supplier && suppCol) {
    where += ` AND t.${suppCol} = ?`;
    params.push(supplier);
  }
  where += statusExclusionSql('t', invStatusCol); // ⟵ deleted/cancelled excluded here

  try {
    const [rows] = await db.query(
      `SELECT t.id, t.${invoiceNoCol} AS invoice_no, ${suppSel} AS supplier_name, t.${dateCol} AS invoice_date,
              ${refSel} AS internal_ref, ${orderSel} AS order_no, ${qtySel} AS qty,
              t.${amountCol} AS invoice_amount, ${termsSel} AS payment_terms_label,
              ${dueSel} AS stored_due_date,
              COALESCE((SELECT SUM(pout.amount) FROM payments_out pout WHERE ${paidJoinCond}), 0) AS cash_paid,
              COALESCE((SELECT SUM(pout.tds_amount) FROM payments_out pout WHERE ${paidJoinCond}), 0) AS tds_paid
       FROM ${table} t
       ${where}
       ORDER BY t.${dateCol} DESC, t.id DESC`,
      params,
    );

    const withQty = invoiceType === 'Fabric' ? await fillMissingQtyFromPackingList(rows) : rows;
    return withQty.map(r => ({ ...r, invoice_type: invoiceType }));
  } catch (err) {
    console.error(`[account-details] fetchPurchaseInvoiceRowsForType(${invoiceType}) query failed:`, err.code || '', err.sqlMessage || err.message);
    return []; // don't let one type's query error take down the whole endpoint
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT IN — Sales Invoices (fabric_invoices)
//
// A row only appears here while it exists in fabric_invoices with a status
// NOT in EXCLUDED_STATUS_VALUES — statusExclusionSql('si', invStatusCol)
// below is what enforces "delete/cancel the sales invoice -> disappears
// from Payment In".
// ─────────────────────────────────────────────────────────────────────────────

router.get('/sales-invoices', async (req, res) => {
  try {
    await schemaReady;
    const { search = '', status = '', customer = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const cols = await getCols(SALES_TABLE);
    const custCol  = pickCol(cols, ['customer_name']) ? 'si.customer_name' : 'NULL';
    const plNoCol    = pickCol(cols, ['pl_no', 'packing_list_no']);
    const orderNoCol = pickCol(cols, ['order_code', 'order_no']);
    const qtyCol      = pickCol(cols, ['total_meter', 'total_meters', 'total_qty', 'meters', 'qty', 'fabric_qty']);
    const termsCol    = pickCol(cols, ['payment_terms', 'payment_term']);
    const invStatusCol = pickCol(cols, ['status']);
    const plNoSel    = plNoCol    ? `si.${plNoCol}`    : 'NULL';
    const orderNoSel = orderNoCol ? `si.${orderNoCol}` : 'NULL';
    const qtySel      = qtyCol     ? `si.${qtyCol}`      : 'NULL';
    const termsSel    = termsCol   ? `si.${termsCol}`    : 'NULL';
    const amountCol = resolveRequiredCol(cols, ['grand_total', 'invoice_amount', 'total_amount', 'bill_amount', 'invoice_value', 'net_value', 'amount', 'total'], SALES_TABLE, 'invoice amount');

    if (!amountCol) {
      return res.status(500).json({ message: `"${SALES_TABLE}" has no recognizable invoice-amount column — check the server console for the actual column list and add it to the candidate list in accountDetailsRoutes.js.` });
    }
    if (!qtyCol) {
      console.warn(`[account-details] no qty column found on ${SALES_TABLE} among candidates; Qty will show as "—". Run: SHOW COLUMNS FROM ${SALES_TABLE};`);
    }

    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      const searchCols = ['si.invoice_no', 'si.customer_name'];
      if (plNoCol)    searchCols.push(`si.${plNoCol}`);
      if (orderNoCol) searchCols.push(`si.${orderNoCol}`);
      where += ` AND (${searchCols.map(c => `${c} LIKE ?`).join(' OR ')})`;
      params.push(...searchCols.map(() => `%${search}%`));
    }
    if (customer && cols.has('customer_name')) {
      where += ` AND si.customer_name = ?`;
      params.push(customer);
    }
    where += statusExclusionSql('si', invStatusCol); // ⟵ deleted/cancelled sales invoices excluded

    const [rows] = await db.query(
      `SELECT si.id, si.invoice_no, ${custCol} AS customer_name, si.invoice_date,
              ${plNoSel} AS pl_no, ${orderNoSel} AS order_no, ${qtySel} AS qty,
              si.${amountCol} AS invoice_amount, ${termsSel} AS payment_terms_label,
              COALESCE((SELECT SUM(pi.amount) FROM payments_in pi WHERE pi.sales_invoice_id = si.id), 0) AS cash_paid,
              COALESCE((SELECT SUM(pi.tds_amount) FROM payments_in pi WHERE pi.sales_invoice_id = si.id), 0) AS tds_paid
       FROM ${SALES_TABLE} si
       ${where}
       ORDER BY si.invoice_date DESC, si.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit) * 5, 0],
    );

    const withQty = await fillMissingQtyFromPackingList(rows);

    const enriched = withQty.map(r => {
      const days = parsePaymentTermsDays(r.payment_terms_label);
      const effectivePaid = Number(r.cash_paid) + Number(r.tds_paid);
      const comp = computeStatus(r.invoice_date, days, r.invoice_amount, effectivePaid);
      const { cash_paid, tds_paid, ...rest } = r;
      return {
        ...rest,
        payment_terms_days: days,
        paid_amount: effectivePaid,
        cash_paid_amount: Number(cash_paid),
        tds_paid_amount: Number(tds_paid),
        ...comp,
      };
    });

    const filtered = status ? enriched.filter(r => r.status === status) : enriched;
    const total     = filtered.length;
    const pageRows  = filtered.slice(offset, offset + Number(limit));

    res.json({ data: pageRows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /account-details/sales-invoices]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

router.get('/sales-invoices/:id/payments', async (req, res) => {
  try {
    await schemaReady;
    const [rows] = await db.query(
      `SELECT id, amount, tds_amount, payment_type, payment_date, mode, reference_no, notes, created_at
       FROM payments_in WHERE sales_invoice_id = ? ORDER BY payment_date DESC, id DESC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /account-details/sales-invoices/:id/payments]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

router.get('/payments-in', async (req, res) => {
  try {
    await schemaReady;
    const { search = '', customer = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const salesCols = await getCols(SALES_TABLE);
    const custCol = salesCols.has('customer_name') ? 'si.customer_name' : 'NULL';
    const invStatusCol = pickCol(salesCols, ['status']);

    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      const searchCols = ['si.invoice_no', 'pi.reference_no', 'pi.mode'];
      if (salesCols.has('customer_name')) searchCols.push('si.customer_name');
      where += ` AND (${searchCols.map(c => `${c} LIKE ?`).join(' OR ')})`;
      params.push(...searchCols.map(() => `%${search}%`));
    }
    if (customer && salesCols.has('customer_name')) {
      where += ` AND si.customer_name = ?`;
      params.push(customer);
    }
    where += statusExclusionSql('si', invStatusCol); // ⟵ hides payments whose parent sales invoice was deleted/cancelled

    // INNER JOIN — a payment row is only returned while its parent sales
    // invoice still exists and isn't excluded, so payment history rows
    // vanish automatically once the parent invoice is gone.
    const [[countRow]] = await db.query(
      `SELECT COUNT(*) AS c
       FROM payments_in pi
       JOIN ${SALES_TABLE} si ON si.id = pi.sales_invoice_id
       ${where}`,
      params,
    );

    const [rows] = await db.query(
      `SELECT pi.id, pi.sales_invoice_id, si.invoice_no, ${custCol} AS party_name,
              pi.amount, pi.tds_amount, pi.payment_type, pi.payment_date, pi.mode,
              pi.reference_no, pi.notes, pi.created_at
       FROM payments_in pi
       JOIN ${SALES_TABLE} si ON si.id = pi.sales_invoice_id
       ${where}
       ORDER BY pi.payment_date DESC, pi.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );

    res.json({ data: rows, total: countRow.c, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /account-details/payments-in]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

router.post('/payments-in', async (req, res) => {
  try {
    await schemaReady;
    const {
      sales_invoice_id, amount, tds_amount = 0, payment_type = 'Part Payment',
      payment_date = new Date().toISOString().slice(0, 10),
      mode = 'Bank Transfer', reference_no = '', notes = '',
    } = req.body;

    if (!sales_invoice_id) return res.status(400).json({ message: 'sales_invoice_id is required' });
    const amt = Number(amount) || 0;
    const tds = Number(tds_amount) || 0;
    if (amt <= 0 && tds <= 0) return res.status(400).json({ message: 'A valid amount (or TDS amount) is required' });

    const [result] = await db.query(
      `INSERT INTO payments_in (sales_invoice_id, amount, tds_amount, payment_type, payment_date, mode, reference_no, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?, NOW())`,
      [sales_invoice_id, amt, tds, validatePaymentType(payment_type), payment_date, mode, reference_no || null, notes || null],
    );

    res.status(201).json({ id: result.insertId, message: 'Payment recorded' });
  } catch (err) {
    console.error('[POST /account-details/payments-in]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

router.put('/payments-in/:id', async (req, res) => {
  try {
    await schemaReady;
    const {
      amount, tds_amount = 0, payment_type = 'Part Payment',
      payment_date, mode = 'Bank Transfer', reference_no = '', notes = '',
    } = req.body;

    const amt = Number(amount) || 0;
    const tds = Number(tds_amount) || 0;
    if (amt <= 0 && tds <= 0) return res.status(400).json({ message: 'A valid amount (or TDS amount) is required' });
    if (!payment_date) return res.status(400).json({ message: 'payment_date is required' });

    const [result] = await db.query(
      `UPDATE payments_in
       SET amount = ?, tds_amount = ?, payment_type = ?, payment_date = ?, mode = ?, reference_no = ?, notes = ?
       WHERE id = ?`,
      [amt, tds, validatePaymentType(payment_type), payment_date, mode, reference_no || null, notes || null, req.params.id],
    );

    if (result.affectedRows === 0) return res.status(404).json({ message: 'Payment entry not found' });
    res.json({ message: 'Payment updated' });
  } catch (err) {
    console.error('[PUT /account-details/payments-in/:id]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

router.delete('/payments-in/:id', async (req, res) => {
  try {
    await schemaReady;
    await db.query('DELETE FROM payments_in WHERE id = ?', [req.params.id]);
    res.json({ message: 'Payment entry removed' });
  } catch (err) {
    console.error('[DELETE /account-details/payments-in/:id]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT OUT — Purchase Invoices — Fabric (purchase_invoices) + Yarn
// (yarn_purchase_invoice_bills)
//
// Each type is filtered against its OWN status column independently
// (fetchPurchaseInvoiceRowsForType -> statusExclusionSql), so deleting or
// cancelling a Fabric invoice never affects Yarn visibility and vice
// versa; each disappears from Payment Out as soon as its own row is
// deleted/cancelled.
// ─────────────────────────────────────────────────────────────────────────────

router.get('/purchase-invoices', async (req, res) => {
  try {
    await schemaReady;
    const { search = '', status = '', supplier = '', type = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const wantFabric = !type || type === 'Fabric';
    const wantYarn    = !type || type === 'Yarn';

    let rawRows = [];
    if (wantFabric) rawRows.push(...(await fetchPurchaseInvoiceRowsForType('Fabric', { search, supplier })));
    if (wantYarn)   rawRows.push(...(await fetchPurchaseInvoiceRowsForType('Yarn',   { search, supplier })));

    const enriched = rawRows.map(r => {
      const days = parsePaymentTermsDays(r.payment_terms_label);
      const effectivePaid = Number(r.cash_paid) + Number(r.tds_paid);
      const comp = computeStatus(r.invoice_date, days, r.invoice_amount, effectivePaid, r.stored_due_date);
      const { stored_due_date, cash_paid, tds_paid, ...rest } = r;
      return {
        ...rest,
        payment_terms_days: days,
        paid_amount: effectivePaid,
        cash_paid_amount: Number(cash_paid),
        tds_paid_amount: Number(tds_paid),
        ...comp,
      };
    });

    enriched.sort((a, b) => {
      const dateDiff = new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime();
      return dateDiff !== 0 ? dateDiff : b.id - a.id;
    });

    const filtered = status ? enriched.filter(r => r.status === status) : enriched;
    const total     = filtered.length;
    const pageRows  = filtered.slice(offset, offset + Number(limit));

    res.json({ data: pageRows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /account-details/purchase-invoices]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

router.get('/purchase-invoices/:id/payments', async (req, res) => {
  try {
    await schemaReady;
    const { type = 'Fabric' } = req.query;
    const poutCols = await getCols('payments_out');
    const poutFk = pickCol(poutCols, ['purchase_invoice_id', 'purchase_order_id']) || 'purchase_invoice_id';
    const poutHasType = poutCols.has('invoice_type');

    let sql = `SELECT id, amount, tds_amount, payment_type, payment_date, mode, reference_no, notes, created_at,
                      ${poutHasType ? 'invoice_type' : `'Fabric' AS invoice_type`}
               FROM payments_out WHERE ${poutFk} = ?`;
    const params = [req.params.id];
    if (poutHasType) {
      sql += ' AND invoice_type = ?';
      params.push(type === 'Yarn' ? 'Yarn' : 'Fabric');
    }
    sql += ' ORDER BY payment_date DESC, id DESC';

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[GET /account-details/purchase-invoices/:id/payments]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

router.get('/payments-out', async (req, res) => {
  try {
    await schemaReady;
    const { search = '', supplier = '', type = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const poutCols    = await getCols('payments_out');
    const poutFk      = pickCol(poutCols, ['purchase_invoice_id', 'purchase_order_id']) || 'purchase_invoice_id';
    const poutHasType = poutCols.has('invoice_type');

    const wantFabric = !type || type === 'Fabric';
    const wantYarn    = !type || type === 'Yarn';

    let allRows = [];

    if (wantFabric) {
      const cols = await getCols(FABRIC_PURCHASE_TABLE);
      const invoiceNoCol = resolveRequiredCol(cols, PURCHASE_TABLE_META.Fabric.invoiceNoCands, FABRIC_PURCHASE_TABLE, 'invoice number');
      if (invoiceNoCol) {
        const suppCol = pickCol(cols, ['supplier', 'supplier_name']);
        const invStatusCol = pickCol(cols, ['status']);
        let where = 'WHERE 1=1';
        const params = [];
        if (search) {
          const sc = [`pinv.${invoiceNoCol}`, 'pout.reference_no', 'pout.mode'];
          if (suppCol) sc.push(`pinv.${suppCol}`);
          where += ` AND (${sc.map(c => `${c} LIKE ?`).join(' OR ')})`;
          params.push(...sc.map(() => `%${search}%`));
        }
        if (supplier && suppCol) { where += ` AND pinv.${suppCol} = ?`; params.push(supplier); }
        where += statusExclusionSql('pinv', invStatusCol); // ⟵ deleted/cancelled Fabric purchase invoices excluded
        if (poutHasType) where += ` AND pout.invoice_type = 'Fabric'`;

        try {
          const [rows] = await db.query(
            // INNER JOIN — Fabric payment rows vanish once the parent
            // purchase_invoices row is deleted or excluded by status.
            `SELECT pout.id, pout.${poutFk} AS purchase_invoice_id, 'Fabric' AS invoice_type, pinv.${invoiceNoCol} AS invoice_no,
                    ${suppCol ? `pinv.${suppCol}` : 'NULL'} AS party_name,
                    pout.amount, pout.tds_amount, pout.payment_type, pout.payment_date, pout.mode,
                    pout.reference_no, pout.notes, pout.created_at
             FROM payments_out pout
             JOIN ${FABRIC_PURCHASE_TABLE} pinv ON pinv.id = pout.${poutFk}
             ${where}`,
            params,
          );
          allRows.push(...rows);
        } catch (err) {
          console.error('[account-details] payments-out Fabric query failed:', err.code || '', err.sqlMessage || err.message);
        }
      }
    }

    if (wantYarn) {
      const yarnTable = await resolveYarnPurchaseTable();
      if (yarnTable && poutHasType) {
        const cols = await getCols(yarnTable);
        const invoiceNoCol = resolveRequiredCol(cols, PURCHASE_TABLE_META.Yarn.invoiceNoCands, yarnTable, 'invoice number');
        if (invoiceNoCol) {
          const suppCol       = pickCol(cols, ['supplier', 'supplier_name']);
          const invStatusCol = pickCol(cols, ['status']);
          let where = 'WHERE 1=1';
          const params = [];
          if (search) {
            const sc = [`pinv.${invoiceNoCol}`, 'pout.reference_no', 'pout.mode'];
            if (suppCol) sc.push(`pinv.${suppCol}`);
            where += ` AND (${sc.map(c => `${c} LIKE ?`).join(' OR ')})`;
            params.push(...sc.map(() => `%${search}%`));
          }
          if (supplier && suppCol) { where += ` AND pinv.${suppCol} = ?`; params.push(supplier); }
          where += statusExclusionSql('pinv', invStatusCol); // ⟵ deleted/cancelled Yarn purchase invoices excluded
          where += ` AND pout.invoice_type = 'Yarn'`;

          try {
            const [rows] = await db.query(
              // INNER JOIN — Yarn payment rows vanish once the parent
              // yarn_purchase_invoice_bills row is deleted or excluded.
              `SELECT pout.id, pout.${poutFk} AS purchase_invoice_id, 'Yarn' AS invoice_type, pinv.${invoiceNoCol} AS invoice_no,
                      ${suppCol ? `pinv.${suppCol}` : 'NULL'} AS party_name,
                      pout.amount, pout.tds_amount, pout.payment_type, pout.payment_date, pout.mode,
                      pout.reference_no, pout.notes, pout.created_at
               FROM payments_out pout
               JOIN ${yarnTable} pinv ON pinv.id = pout.${poutFk}
               ${where}`,
              params,
            );
            allRows.push(...rows);
          } catch (err) {
            console.error('[account-details] payments-out Yarn query failed:', err.code || '', err.sqlMessage || err.message);
          }
        }
      }
    }

    allRows.sort((a, b) => {
      const dateDiff = new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime();
      return dateDiff !== 0 ? dateDiff : b.id - a.id;
    });

    const total    = allRows.length;
    const pageRows = allRows.slice(offset, offset + Number(limit));

    res.json({ data: pageRows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /account-details/payments-out]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

router.post('/payments-out', async (req, res) => {
  try {
    await schemaReady;
    const {
      purchase_invoice_id, invoice_type = 'Fabric', amount, tds_amount = 0, payment_type = 'Part Payment',
      payment_date = new Date().toISOString().slice(0, 10),
      mode = 'Bank Transfer', reference_no = '', notes = '',
    } = req.body;

    if (!purchase_invoice_id) return res.status(400).json({ message: 'purchase_invoice_id is required' });
    const amt = Number(amount) || 0;
    const tds = Number(tds_amount) || 0;
    if (amt <= 0 && tds <= 0) return res.status(400).json({ message: 'A valid amount (or TDS amount) is required' });

    const poutCols    = await getCols('payments_out');
    const poutFk      = pickCol(poutCols, ['purchase_invoice_id', 'purchase_order_id']) || 'purchase_invoice_id';
    const poutHasType = poutCols.has('invoice_type');
    const safeType    = invoice_type === 'Yarn' ? 'Yarn' : 'Fabric';

    const columns = [poutFk, 'amount', 'tds_amount', 'payment_type', 'payment_date', 'mode', 'reference_no', 'notes', 'created_at'];
    const values  = [purchase_invoice_id, amt, tds, validatePaymentType(payment_type), payment_date, mode, reference_no || null, notes || null];
    const placeholders = ['?', '?', '?', '?', '?', '?', '?', '?', 'NOW()'];

    if (poutHasType) {
      columns.splice(1, 0, 'invoice_type');
      values.splice(1, 0, safeType);
      placeholders.splice(1, 0, '?');
    }

    const [result] = await db.query(
      `INSERT INTO payments_out (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
      values,
    );

    res.status(201).json({ id: result.insertId, message: 'Payment recorded' });
  } catch (err) {
    console.error('[POST /account-details/payments-out]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

router.put('/payments-out/:id', async (req, res) => {
  try {
    await schemaReady;
    const {
      amount, tds_amount = 0, payment_type = 'Part Payment',
      payment_date, mode = 'Bank Transfer', reference_no = '', notes = '',
    } = req.body;

    const amt = Number(amount) || 0;
    const tds = Number(tds_amount) || 0;
    if (amt <= 0 && tds <= 0) return res.status(400).json({ message: 'A valid amount (or TDS amount) is required' });
    if (!payment_date) return res.status(400).json({ message: 'payment_date is required' });

    const [result] = await db.query(
      `UPDATE payments_out
       SET amount = ?, tds_amount = ?, payment_type = ?, payment_date = ?, mode = ?, reference_no = ?, notes = ?
       WHERE id = ?`,
      [amt, tds, validatePaymentType(payment_type), payment_date, mode, reference_no || null, notes || null, req.params.id],
    );

    if (result.affectedRows === 0) return res.status(404).json({ message: 'Payment entry not found' });
    res.json({ message: 'Payment updated' });
  } catch (err) {
    console.error('[PUT /account-details/payments-out/:id]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

router.delete('/payments-out/:id', async (req, res) => {
  try {
    await schemaReady;
    await db.query('DELETE FROM payments_out WHERE id = ?', [req.params.id]);
    res.json({ message: 'Payment entry removed' });
  } catch (err) {
    console.error('[DELETE /account-details/payments-out/:id]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER LIST — Payment In dropdown filter + party totals
// (fabric_invoices, excluded statuses removed)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/customers', async (req, res) => {
  try {
    await schemaReady;
    const { search = '' } = req.query;
    const cols = await getCols(SALES_TABLE);
    if (!cols.has('customer_name')) return res.json([]);

    const amountCol = resolveRequiredCol(cols, ['grand_total', 'invoice_amount', 'total_amount', 'bill_amount', 'invoice_value', 'net_value', 'amount', 'total'], SALES_TABLE, 'invoice amount');
    if (!amountCol) return res.json([]); // can't compute totals safely — return empty list rather than 500
    const statusCol = pickCol(cols, ['status']);

    let where = `WHERE si.customer_name IS NOT NULL AND si.customer_name <> ''`;
    const params = [];
    if (search) {
      where += ` AND si.customer_name LIKE ?`;
      params.push(`%${search}%`);
    }
    where += statusExclusionSql('si', statusCol);

    const [rows] = await db.query(
      `SELECT si.customer_name AS name,
              COUNT(*) AS invoice_count,
              COALESCE(SUM(si.${amountCol}), 0) AS total_invoiced,
              COALESCE((
                SELECT SUM(pi.amount) + SUM(pi.tds_amount)
                FROM payments_in pi
                JOIN ${SALES_TABLE} si2 ON si2.id = pi.sales_invoice_id
                WHERE si2.customer_name = si.customer_name${statusExclusionSql('si2', statusCol)}
              ), 0) AS total_paid
       FROM ${SALES_TABLE} si
       ${where}
       GROUP BY si.customer_name
       ORDER BY si.customer_name ASC`,
      params,
    );

    const enriched = rows.map(r => {
      const totalInvoiced = Number(r.total_invoiced);
      const totalPaid = Number(r.total_paid);
      return {
        name: r.name,
        invoice_count: r.invoice_count,
        total_invoiced: totalInvoiced,
        total_paid: totalPaid,
        balance: totalInvoiced - totalPaid,
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('[GET /account-details/customers]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPPLIER LIST — Payment Out dropdown filter + party totals (merged
// across purchase_invoices [Fabric] and yarn_purchase_invoice_bills
// [Yarn]). amountCol resolution never falls back to a hardcoded literal —
// if a real amount column can't be found on a given table, that table's
// suppliers are simply skipped (contribute 0 invoices) instead of
// crashing the endpoint.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/suppliers', async (req, res) => {
  try {
    await schemaReady;
    const { search = '' } = req.query;

    const poutCols    = await getCols('payments_out');
    const poutFk      = pickCol(poutCols, ['purchase_invoice_id', 'purchase_order_id']) || 'purchase_invoice_id';
    const poutHasType = poutCols.has('invoice_type');

    async function totalsForTable(table, invoiceType) {
      const cols = await getCols(table);
      const suppCol = pickCol(cols, ['supplier', 'supplier_name']);
      if (!suppCol) return [];
      const amountCol = resolveRequiredCol(cols, PURCHASE_TABLE_META[invoiceType].amountCands, table, 'invoice amount');
      if (!amountCol) return []; // skip this table gracefully — logged already
      const statusCol = pickCol(cols, ['status']);

      let where = `WHERE t.${suppCol} IS NOT NULL AND t.${suppCol} <> ''`;
      const params = [];
      if (search) { where += ` AND t.${suppCol} LIKE ?`; params.push(`%${search}%`); }
      where += statusExclusionSql('t', statusCol);

      const typeCond = poutHasType
        ? `AND pout.invoice_type = ${db.escape(invoiceType)}`
        : (invoiceType === 'Fabric' ? '' : 'AND 1=0');

      try {
        const [rows] = await db.query(
          `SELECT t.${suppCol} AS name, COUNT(*) AS invoice_count,
                  COALESCE(SUM(t.${amountCol}),0) AS total_invoiced,
                  COALESCE((
                    SELECT SUM(pout.amount) + SUM(pout.tds_amount)
                    FROM payments_out pout
                    JOIN ${table} t2 ON t2.id = pout.${poutFk}
                    WHERE t2.${suppCol} = t.${suppCol} ${typeCond}${statusExclusionSql('t2', statusCol)}
                  ), 0) AS total_paid
           FROM ${table} t
           ${where}
           GROUP BY t.${suppCol}`,
          params,
        );
        return rows.map(r => ({
          name: r.name,
          invoice_count: r.invoice_count,
          total_invoiced: Number(r.total_invoiced),
          total_paid: Number(r.total_paid),
        }));
      } catch (err) {
        console.error(`[account-details] suppliers totalsForTable(${table}) failed:`, err.code || '', err.sqlMessage || err.message);
        return [];
      }
    }

    const fabricList = await totalsForTable(FABRIC_PURCHASE_TABLE, 'Fabric');
    const yarnTable   = await resolveYarnPurchaseTable();
    const yarnList     = yarnTable ? await totalsForTable(yarnTable, 'Yarn') : [];

    const merged = new Map();
    for (const r of [...fabricList, ...yarnList]) {
      const existing = merged.get(r.name);
      if (existing) {
        existing.invoice_count  += r.invoice_count;
        existing.total_invoiced += r.total_invoiced;
        existing.total_paid     += r.total_paid;
      } else {
        merged.set(r.name, { ...r });
      }
    }

    const enriched = [...merged.values()]
      .map(r => ({ ...r, balance: r.total_invoiced - r.total_paid }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(enriched);
  } catch (err) {
    console.error('[GET /account-details/suppliers]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY — page header cards.
// Also returns the Payment Out side split by invoice type (Fabric vs
// Yarn), so the frontend can show a "Fabric Payable" and "Yarn Payable"
// card in addition to the combined Payable Balance card.
//   purchase_invoice_fabric_total / purchase_invoice_yarn_total
//   payment_out_fabric_total     / payment_out_yarn_total
//   payable_balance_fabric       / payable_balance_yarn
// ─────────────────────────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    await schemaReady;
    const { customer = '', supplier = '' } = req.query;

    const salesCols      = await getCols(SALES_TABLE);
    const salesAmtCol     = resolveRequiredCol(salesCols, ['grand_total', 'invoice_amount', 'total_amount', 'bill_amount', 'invoice_value', 'net_value', 'amount', 'total'], SALES_TABLE, 'invoice amount');
    const salesStatusCol = pickCol(salesCols, ['status']);

    const purchaseCols       = await getCols(FABRIC_PURCHASE_TABLE);
    const purchaseAmtCol     = resolveRequiredCol(purchaseCols, PURCHASE_TABLE_META.Fabric.amountCands, FABRIC_PURCHASE_TABLE, 'invoice amount');
    const purchaseStatusCol = pickCol(purchaseCols, ['status']);
    const suppCol             = pickCol(purchaseCols, ['supplier', 'supplier_name']);

    // ── Sales-side totals ──────────────────────────────────────────────────
    let salesRow = { c: 0, total: 0 };
    if (salesAmtCol) {
      let salesWhere = 'WHERE 1=1' + statusExclusionSql('', salesStatusCol);
      const salesParams = [];
      if (customer && salesCols.has('customer_name')) {
        salesWhere += ' AND customer_name = ?';
        salesParams.push(customer);
      }
      const [[row]] = await db.query(
        `SELECT COUNT(*) AS c, COALESCE(SUM(${salesAmtCol}),0) AS total FROM ${SALES_TABLE} ${salesWhere}`,
        salesParams,
      );
      salesRow = row;
    }
    // else: no recognizable amount column on the sales table — leave at 0,
    // already logged by resolveRequiredCol above.

    // ── Fabric purchase-side totals ───────────────────────────────────────
    let fabricPurchRow = { c: 0, total: 0 };
    if (purchaseAmtCol) {
      let fabricWhere = 'WHERE 1=1' + statusExclusionSql('', purchaseStatusCol);
      const fabricParams = [];
      if (supplier && suppCol) {
        fabricWhere += ` AND ${suppCol} = ?`;
        fabricParams.push(supplier);
      }
      const [[row]] = await db.query(
        `SELECT COUNT(*) AS c, COALESCE(SUM(${purchaseAmtCol}),0) AS total FROM ${FABRIC_PURCHASE_TABLE} ${fabricWhere}`,
        fabricParams,
      );
      fabricPurchRow = row;
    }

    // ── Yarn purchase-side totals ─────────────────────────────────────────
    const yarnTable = await resolveYarnPurchaseTable();
    let yarnPurchRow = { c: 0, total: 0 };
    let yarnSuppCol = null;
    if (yarnTable) {
      const yarnCols = await getCols(yarnTable);
      yarnSuppCol = pickCol(yarnCols, ['supplier', 'supplier_name']);
      const yarnAmtCol    = resolveRequiredCol(yarnCols, PURCHASE_TABLE_META.Yarn.amountCands, yarnTable, 'invoice amount');
      const yarnStatusCol = pickCol(yarnCols, ['status']);
      if (yarnAmtCol) {
        let yWhere = 'WHERE 1=1' + statusExclusionSql('', yarnStatusCol);
        const yParams = [];
        if (supplier && yarnSuppCol) { yWhere += ` AND ${yarnSuppCol} = ?`; yParams.push(supplier); }
        const [[row]] = await db.query(
          `SELECT COUNT(*) AS c, COALESCE(SUM(${yarnAmtCol}),0) AS total FROM ${yarnTable} ${yWhere}`,
          yParams,
        );
        yarnPurchRow = row;
      }
    }

    const purchRow = {
      c: Number(fabricPurchRow.c) + Number(yarnPurchRow.c),
      total: Number(fabricPurchRow.total) + Number(yarnPurchRow.total),
    };

    // ── Payment In ─────────────────────────────────────────────────────────
    let paidInRow;
    if (customer && salesCols.has('customer_name')) {
      [[paidInRow]] = await db.query(
        `SELECT COALESCE(SUM(pi.amount),0) AS cash, COALESCE(SUM(pi.tds_amount),0) AS tds
         FROM payments_in pi
         JOIN ${SALES_TABLE} si ON si.id = pi.sales_invoice_id
         WHERE si.customer_name = ?${statusExclusionSql('si', salesStatusCol)}`,
        [customer],
      );
    } else {
      [[paidInRow]] = await db.query(
        `SELECT COALESCE(SUM(pi.amount),0) AS cash, COALESCE(SUM(pi.tds_amount),0) AS tds
         FROM payments_in pi
         JOIN ${SALES_TABLE} si ON si.id = pi.sales_invoice_id
         WHERE 1=1${statusExclusionSql('si', salesStatusCol)}`,
      );
    }

    // ── Payment Out — aggregated across Fabric + Yarn, and split ───────────
    const poutCols    = await getCols('payments_out');
    const poutFk      = pickCol(poutCols, ['purchase_invoice_id', 'purchase_order_id']) || 'purchase_invoice_id';
    const poutHasType = poutCols.has('invoice_type');

    // per-type Payment Out helper — reused for both the combined total
    // (below) and the split cards.
    async function paidOutForType(invType, table, suppColLocal) {
      if (!table) return { cash: 0, tds: 0 };
      let where = 'WHERE 1=1';
      const params = [];
      if (supplier && suppColLocal) { where += ` AND pinv.${suppColLocal} = ?`; params.push(supplier); }
      where += poutHasType
        ? ` AND pout.invoice_type = ${db.escape(invType)}`
        : (invType === 'Fabric' ? '' : ' AND 1=0');
      // exclude cancelled/deleted invoices from the paid figure too, same
      // as everywhere else on this page
      const invCols = await getCols(table);
      const invStatusCol = pickCol(invCols, ['status']);
      where += statusExclusionSql('pinv', invStatusCol);

      try {
        const [[row]] = await db.query(
          `SELECT COALESCE(SUM(pout.amount),0) AS cash, COALESCE(SUM(pout.tds_amount),0) AS tds
           FROM payments_out pout
           JOIN ${table} pinv ON pinv.id = pout.${poutFk}
           ${where}`,
          params,
        );
        return { cash: Number(row.cash), tds: Number(row.tds) };
      } catch (err) {
        console.error(`[account-details] paidOutForType(${invType}) failed:`, err.code || '', err.sqlMessage || err.message);
        return { cash: 0, tds: 0 };
      }
    }

    const fabricPaidOut = await paidOutForType('Fabric', FABRIC_PURCHASE_TABLE, suppCol);
    const yarnPaidOut    = await paidOutForType('Yarn', yarnTable, yarnSuppCol);

    const paidOutRow = {
      cash: fabricPaidOut.cash + yarnPaidOut.cash,
      tds:  fabricPaidOut.tds  + yarnPaidOut.tds,
    };

    const paymentInTotal  = Number(paidInRow.cash)  + Number(paidInRow.tds);
    const paymentOutTotal = Number(paidOutRow.cash) + Number(paidOutRow.tds);

    const fabricPaidOutTotal = fabricPaidOut.cash + fabricPaidOut.tds;
    const yarnPaidOutTotal    = yarnPaidOut.cash + yarnPaidOut.tds;

    res.json({
      sales_invoice_count:    salesRow.c,
      sales_invoice_total:    Number(salesRow.total),
      purchase_invoice_count: purchRow.c,
      purchase_invoice_total: purchRow.total,
      payment_in_total:       paymentInTotal,
      payment_in_cash:        Number(paidInRow.cash),
      payment_in_tds:         Number(paidInRow.tds),
      payment_out_total:      paymentOutTotal,
      payment_out_cash:       Number(paidOutRow.cash),
      payment_out_tds:        Number(paidOutRow.tds),
      receivable_balance:     Number(salesRow.total) - paymentInTotal,
      payable_balance:        purchRow.total - paymentOutTotal,

      // ── Fabric / Yarn split (Payment Out side only — Payment In has no
      //    invoice type) ────────────────────────────────────────────────────
      purchase_invoice_fabric_total: Number(fabricPurchRow.total),
      purchase_invoice_yarn_total:    Number(yarnPurchRow.total),
      payment_out_fabric_total:      fabricPaidOutTotal,
      payment_out_yarn_total:         yarnPaidOutTotal,
      payable_balance_fabric:        Number(fabricPurchRow.total) - fabricPaidOutTotal,
      payable_balance_yarn:           Number(yarnPurchRow.total) - yarnPaidOutTotal,

      scoped_customer:        customer || null,
      scoped_supplier:        supplier || null,
    });
  } catch (err) {
    console.error('[GET /account-details/summary]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG — GET /api/account-details/_debug
// Reports the resolved Fabric AND Yarn columns (amount/date/invoice_no,
// etc), and which real table names this instance actually bound to. Use
// this FIRST whenever a type filter or a total looks wrong — any `null`
// in fabricResolved / yarnResolved means that field isn't matching your
// real schema and needs a candidate added above.
//
// allYarnLikeTables — every table in the database whose name contains
// "yarn" — so if Yarn is still showing 0 records, you can see exactly
// what tables exist and confirm 'yarn_purchase_invoice_bills' is really
// there.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/_debug', async (req, res) => {
  const out = { checkedAt: new Date().toISOString() };
  try {
    await schemaReady;

    out.expectedTables = {
      sales: SALES_TABLE,
      fabricPurchase: FABRIC_PURCHASE_TABLE,
      yarnPurchase: YARN_PURCHASE_TABLE,
    };

    out.salesTableExists    = await tableExists(SALES_TABLE);
    out.purchaseTableExists = await tableExists(FABRIC_PURCHASE_TABLE);
    out.paymentsInExists    = await tableExists('payments_in');
    out.paymentsOutExists   = await tableExists('payments_out');
    out.yarnTable            = await resolveYarnPurchaseTable();
    out.yarnTableIsExpected  = out.yarnTable === YARN_PURCHASE_TABLE;

    // List every "yarn"-named table so a wrong fallback (or a still-missing
    // table) is obvious at a glance.
    const [yarnLikeTables] = await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = DATABASE() AND LOWER(table_name) LIKE '%yarn%'`
    );
    out.allYarnLikeTables = yarnLikeTables.map(r => r.table_name || r.TABLE_NAME);

    if (out.salesTableExists) {
      const cols = await getCols(SALES_TABLE);
      out.salesColumns = [...cols];
      out.salesResolvedAmountCol = pickCol(cols, ['grand_total', 'invoice_amount', 'total_amount', 'bill_amount', 'invoice_value', 'net_value', 'amount', 'total']);
    }
    if (out.purchaseTableExists) {
      const cols = await getCols(FABRIC_PURCHASE_TABLE);
      out.purchaseColumns = [...cols];
      out.fabricResolved = {
        supplier: pickCol(cols, PURCHASE_TABLE_META.Fabric.supplierCands),
        internal_ref: pickCol(cols, PURCHASE_TABLE_META.Fabric.refCands),
        order_no: pickCol(cols, PURCHASE_TABLE_META.Fabric.orderNoCands),
        qty: pickCol(cols, PURCHASE_TABLE_META.Fabric.qtyCands),
        terms: pickCol(cols, PURCHASE_TABLE_META.Fabric.termsCands),
        due_date: pickCol(cols, PURCHASE_TABLE_META.Fabric.dueDateCands),
        amount: pickCol(cols, PURCHASE_TABLE_META.Fabric.amountCands),
        date: pickCol(cols, PURCHASE_TABLE_META.Fabric.dateCands),
        invoice_no: pickCol(cols, PURCHASE_TABLE_META.Fabric.invoiceNoCands),
        status: pickCol(cols, ['status']),
      };
    }
    if (out.yarnTable) {
      const cols = await getCols(out.yarnTable);
      out.yarnColumns = [...cols];
      out.yarnResolved = {
        supplier: pickCol(cols, PURCHASE_TABLE_META.Yarn.supplierCands),
        internal_ref: pickCol(cols, PURCHASE_TABLE_META.Yarn.refCands),
        order_no: pickCol(cols, PURCHASE_TABLE_META.Yarn.orderNoCands),
        qty: pickCol(cols, PURCHASE_TABLE_META.Yarn.qtyCands),
        terms: pickCol(cols, PURCHASE_TABLE_META.Yarn.termsCands),
        due_date: pickCol(cols, PURCHASE_TABLE_META.Yarn.dueDateCands),
        amount: pickCol(cols, PURCHASE_TABLE_META.Yarn.amountCands),
        date: pickCol(cols, PURCHASE_TABLE_META.Yarn.dateCands),
        status: pickCol(cols, ['status']),
        invoice_no: pickCol(cols, PURCHASE_TABLE_META.Yarn.invoiceNoCands),
      };
    }
    if (out.paymentsOutExists) {
      out.paymentsOutColumns = [...(await getCols('payments_out'))];
      out.paymentsOutHasInvoiceType = (await getCols('payments_out')).has('invoice_type');
    }

    res.json(out);
  } catch (err) {
    out.fatalError = err.sqlMessage || err.message;
    res.status(500).json(out);
  }
});

module.exports = router;