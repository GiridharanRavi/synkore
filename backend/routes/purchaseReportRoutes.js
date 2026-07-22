// backend/routes/purchaseReportRoutes.js
//
// Purchase Report — a supplier-statement style ledger, the mirror image of
// Sales Report (frontend/src/pages/admin/PurchaseReportMaster.tsx), built
// on top of the SAME source tables Account Details uses for Payment Out:
//
//   Purchase Invoices (Fabric)  = Debit   → purchase_invoices
//   Purchase Invoices (Yarn)    = Debit   → yarn_purchase_invoice_bills
//   Payments Out (both types)   = Credit  → payments_out
//
// Because it reads the exact same tables/columns as accountDetailsRoutes.js,
// the two pages can never disagree — this file does its own lightweight
// column-candidate resolution (kept self-contained on purpose, so this
// route file has zero import-time dependency on accountDetailsRoutes.js).
//
// Columns: Purchase Date · Purchase Invoice No · Supplier Name · Bill To ·
//          Credit · Debit · Balance (running, resets per supplier)
//
// Endpoints:
//   GET /api/purchase-report/ledger        — paginated ledger rows
//   GET /api/purchase-report/ledger/all    — full ledger (no pagination), for export
//   GET /api/purchase-report/summary       — header summary cards
//   GET /api/purchase-report/trend         — monthly Debit/Credit + cumulative Balance
//   GET /api/purchase-report/suppliers     — distinct supplier names (filter dropdown)
//   GET /api/purchase-report/_debug        — resolved table/column report
//
// LIFECYCLE RULE (same as Account Details' Payment Out):
//   A row only appears here while its source invoice exists in
//   purchase_invoices / yarn_purchase_invoice_bills AND its status is not
//   cancelled/deleted/void. This is re-derived live on every request —
//   nothing to keep in sync.
// ─────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// ── Real source tables (kept identical to accountDetailsRoutes.js) ────────
const FABRIC_PURCHASE_TABLE = 'purchase_invoices';
const YARN_PURCHASE_TABLE   = 'yarn_purchase_invoice_bills';

const YARN_TABLE_CANDIDATES = [
  YARN_PURCHASE_TABLE,
  'yarn_purchase_invoices',
  'yarn_invoices',
  'yarn_purchase_invoice',
  'yarn_purchase_bills',
  'yarn_bills',
];

const EXCLUDED_STATUS_VALUES = ['cancelled', 'canceled', 'deleted', 'cancel', 'delete', 'void'];

const PURCHASE_TABLE_META = {
  Fabric: {
    table: FABRIC_PURCHASE_TABLE,
    supplierCands:  ['supplier', 'supplier_name'],
    billToCands:    ['bill_to', 'billing_address', 'bill_to_address', 'ship_to'],
    amountCands:    ['net_value', 'invoice_amount', 'total_amount', 'bill_amount', 'invoice_value', 'grand_total', 'amount', 'net_amount', 'total'],
    dateCands:      ['invoice_date', 'date', 'bill_date', 'purchase_date', 'created_date'],
    invoiceNoCands: ['invoice_no', 'bill_no', 'inv_no', 'invoice_number', 'bill_number'],
    statusCands:    ['status'],
  },
  Yarn: {
    table: null, // resolved at runtime
    supplierCands:  ['supplier', 'supplier_name'],
    billToCands:    ['bill_to', 'billing_address', 'bill_to_address', 'ship_to'],
    amountCands:    ['net_value', 'invoice_amount', 'total_amount', 'bill_amount', 'invoice_value', 'grand_total', 'amount', 'net_amount', 'total'],
    dateCands:      ['invoice_date', 'date', 'bill_date', 'purchase_date', 'created_date'],
    invoiceNoCands: ['invoice_no', 'bill_no', 'inv_no', 'invoice_number', 'bill_number'],
    statusCands:    ['status'],
  },
};

// ── Low-level schema helpers ───────────────────────────────────────────────
async function tableExists(table) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table],
  );
  return rows[0].c > 0;
}

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
function resolveRequiredCol(cols, candidates, table, purpose) {
  const found = pickCol(cols, candidates);
  if (!found) {
    console.error(
      `[purchase-report] "${table}" has no recognizable ${purpose} column. Tried: ${candidates.join(', ')}. ` +
      `Actual columns: ${[...cols].join(', ') || '(table not found)'}.`
    );
  }
  return found;
}

function statusExclusionSql(alias, statusCol) {
  if (!statusCol) return '';
  const list = EXCLUDED_STATUS_VALUES.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
  const colRef = alias ? `${alias}.${statusCol}` : statusCol;
  return ` AND LOWER(${colRef}) NOT IN (${list})`;
}

// ── Yarn table resolution (mirrors accountDetailsRoutes.js) ───────────────
let _yarnTableName;
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
      if (/purchase_order|_po$|^ypo/i.test(t) && !/invoice|bill/i.test(t)) continue;
      const cols = await getCols(t);
      const hasInvoiceNo = PURCHASE_TABLE_META.Yarn.invoiceNoCands.some(c => cols.has(c));
      const hasAmount    = PURCHASE_TABLE_META.Yarn.amountCands.some(c => cols.has(c));
      const hasDate      = PURCHASE_TABLE_META.Yarn.dateCands.some(c => cols.has(c));
      if (hasInvoiceNo && hasAmount && hasDate) return t;
    }
  } catch (err) {
    console.error('[purchase-report] discoverYarnPurchaseTable failed:', err.sqlMessage || err.message);
  }
  return false;
}
async function resolveYarnPurchaseTable() {
  if (_yarnTableName !== undefined) return _yarnTableName;
  for (const t of YARN_TABLE_CANDIDATES) {
    if (await tableExists(t)) { _yarnTableName = t; return t; }
  }
  const discovered = await discoverYarnPurchaseTable();
  _yarnTableName = discovered || false;
  if (!_yarnTableName) {
    console.warn(`[purchase-report] No Yarn Purchase Invoice table found. Purchase Report will only show Fabric invoices until this is fixed.`);
  }
  return _yarnTableName;
}

// ── payments_out FK column resolution (table itself is owned/created by
//    accountDetailsRoutes.js — this file only ever reads it) ──────────────
async function poutFkCol() {
  const cols = await getCols('payments_out');
  return pickCol(cols, ['purchase_invoice_id', 'purchase_order_id']) || 'purchase_invoice_id';
}
async function poutHasTypeCol() {
  const cols = await getCols('payments_out');
  return cols.has('invoice_type');
}

// ─────────────────────────────────────────────────────────────────────────
// Fetch raw Debit rows (invoices) + Credit rows (payments) for one type
// (Fabric / Yarn), already filtered by search/supplier/from/to.
// ─────────────────────────────────────────────────────────────────────────
async function fetchLedgerEntriesForType(invoiceType, { search = '', supplier = '', from = '', to = '' } = {}) {
  const meta = { ...PURCHASE_TABLE_META[invoiceType] };
  if (invoiceType === 'Yarn') {
    const yarnTable = await resolveYarnPurchaseTable();
    if (!yarnTable) return [];
    meta.table = yarnTable;
  }
  const table = meta.table;
  const cols = await getCols(table);
  if (cols.size === 0) return [];

  const invoiceNoCol = resolveRequiredCol(cols, meta.invoiceNoCands, table, 'invoice number');
  const amountCol    = resolveRequiredCol(cols, meta.amountCands, table, 'invoice amount');
  const dateCol       = resolveRequiredCol(cols, meta.dateCands, table, 'invoice date');
  if (!invoiceNoCol || !amountCol || !dateCol) return [];

  const suppCol   = pickCol(cols, meta.supplierCands);
  const billToCol = pickCol(cols, meta.billToCands);
  const statusCol = pickCol(cols, meta.statusCands);

  let where = 'WHERE 1=1';
  const params = [];
  if (search) {
    const searchCols = [`t.${invoiceNoCol}`];
    if (suppCol) searchCols.push(`t.${suppCol}`);
    where += ` AND (${searchCols.map(c => `${c} LIKE ?`).join(' OR ')})`;
    params.push(...searchCols.map(() => `%${search}%`));
  }
  if (supplier && suppCol) { where += ` AND t.${suppCol} = ?`; params.push(supplier); }
  if (from) { where += ` AND t.${dateCol} >= ?`; params.push(from); }
  if (to)   { where += ` AND t.${dateCol} <= ?`; params.push(to); }
  where += statusExclusionSql('t', statusCol);

  const [invRows] = await db.query(
    `SELECT t.id, t.${invoiceNoCol} AS invoice_no, ${suppCol ? `t.${suppCol}` : 'NULL'} AS supplier_name,
            ${billToCol ? `t.${billToCol}` : 'NULL'} AS bill_to, t.${dateCol} AS purchase_date,
            t.${amountCol} AS invoice_amount
     FROM ${table} t
     ${where}
     ORDER BY t.${dateCol} ASC, t.id ASC`,
    params,
  );

  const debitRows = invRows.map(r => ({
    date: r.purchase_date,
    invoice_no: r.invoice_no,
    supplier_name: r.supplier_name,
    bill_to: r.bill_to,
    debit: Number(r.invoice_amount) || 0,
    credit: 0,
    invoice_type: invoiceType,
    sort_seq: 0, // invoices sort before same-day payments
  }));

  // Credit rows — payments_out joined back to this same invoice table so a
  // payment silently disappears once its parent invoice is excluded/deleted,
  // and so it inherits the invoice's supplier_name / bill_to / invoice_no.
  const fk = await poutFkCol();
  const hasType = await poutHasTypeCol();
  const typeCond = hasType ? `AND pout.invoice_type = ${db.escape(invoiceType)}` : (invoiceType === 'Fabric' ? '' : 'AND 1=0');

  let payWhere = 'WHERE 1=1';
  const payParams = [];
  if (search) {
    const sc = [`t.${invoiceNoCol}`, 'pout.reference_no', 'pout.mode'];
    if (suppCol) sc.push(`t.${suppCol}`);
    payWhere += ` AND (${sc.map(c => `${c} LIKE ?`).join(' OR ')})`;
    payParams.push(...sc.map(() => `%${search}%`));
  }
  if (supplier && suppCol) { payWhere += ` AND t.${suppCol} = ?`; payParams.push(supplier); }
  if (from) { payWhere += ` AND pout.payment_date >= ?`; payParams.push(from); }
  if (to)   { payWhere += ` AND pout.payment_date <= ?`; payParams.push(to); }
  payWhere += statusExclusionSql('t', statusCol);

  let payRows = [];
  try {
    [payRows] = await db.query(
      `SELECT pout.id, t.${invoiceNoCol} AS invoice_no, ${suppCol ? `t.${suppCol}` : 'NULL'} AS supplier_name,
              ${billToCol ? `t.${billToCol}` : 'NULL'} AS bill_to, pout.payment_date,
              pout.amount, pout.tds_amount
       FROM payments_out pout
       JOIN ${table} t ON t.id = pout.${fk} ${typeCond}
       ${payWhere}
       ORDER BY pout.payment_date ASC, pout.id ASC`,
      payParams,
    );
  } catch (err) {
    console.error(`[purchase-report] payments_out join (${invoiceType}) failed:`, err.sqlMessage || err.message);
  }

  const creditRows = payRows.map(r => ({
    date: r.payment_date,
    invoice_no: r.invoice_no,
    supplier_name: r.supplier_name,
    bill_to: r.bill_to,
    debit: 0,
    credit: (Number(r.amount) || 0) + (Number(r.tds_amount) || 0),
    invoice_type: invoiceType,
    sort_seq: 1, // payments sort after same-day invoices
  }));

  return [...debitRows, ...creditRows];
}

async function fetchAllLedgerEntries(filters) {
  const [fabric, yarn] = await Promise.all([
    fetchLedgerEntriesForType('Fabric', filters),
    fetchLedgerEntriesForType('Yarn', filters),
  ]);
  return [...fabric, ...yarn];
}

// Compute a running balance PER SUPPLIER (Debit increases balance owed,
// Credit reduces it), in true chronological order, then return the rows
// sorted most-recent-first for display (balance value travels with the
// row it was computed for).
function withRunningBalance(entries) {
  const bySupplier = new Map();
  for (const e of entries) {
    const key = e.supplier_name || '—';
    if (!bySupplier.has(key)) bySupplier.set(key, []);
    bySupplier.get(key).push(e);
  }

  const out = [];
  for (const [, rows] of bySupplier) {
    rows.sort((a, b) => {
      const d = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (d !== 0) return d;
      return a.sort_seq - b.sort_seq;
    });
    let balance = 0;
    for (const r of rows) {
      balance += r.debit - r.credit;
      out.push({ ...r, balance });
    }
  }

  out.sort((a, b) => {
    const d = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (d !== 0) return d;
    return b.sort_seq - a.sort_seq;
  });
  return out;
}

function formatRow(r, i) {
  return {
    row_no: i + 1,
    purchase_date: r.date ? new Date(r.date).toISOString().slice(0, 10) : null,
    invoice_no: r.invoice_no,
    supplier_name: r.supplier_name || '—',
    bill_to: r.bill_to || '—',
    credit: Number(r.credit) || 0,
    debit: Number(r.debit) || 0,
    balance: Number(r.balance) || 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// GET /ledger — paginated
// ─────────────────────────────────────────────────────────────────────────
router.get('/ledger', async (req, res) => {
  try {
    const { search = '', supplier = '', from = '', to = '', page = 1, limit = 25 } = req.query;
    const entries = await fetchAllLedgerEntries({ search, supplier, from, to });
    const withBalance = withRunningBalance(entries);
    const total = withBalance.length;
    const offset = (Number(page) - 1) * Number(limit);
    const pageRows = withBalance.slice(offset, offset + Number(limit)).map(formatRow);
    res.json({ data: pageRows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /purchase-report/ledger]', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// GET /ledger/all — full export (no pagination)
router.get('/ledger/all', async (req, res) => {
  try {
    const { search = '', supplier = '', from = '', to = '' } = req.query;
    const entries = await fetchAllLedgerEntries({ search, supplier, from, to });
    const withBalance = withRunningBalance(entries);
    res.json({ data: withBalance.map(formatRow), total: withBalance.length });
  } catch (err) {
    console.error('[GET /purchase-report/ledger/all]', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /summary — header summary cards
// ─────────────────────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const { search = '', supplier = '', from = '', to = '' } = req.query;
    const entries = await fetchAllLedgerEntries({ search, supplier, from, to });

    const total_debit  = entries.reduce((s, r) => s + r.debit, 0);
    const total_credit = entries.reduce((s, r) => s + r.credit, 0);
    const invoice_count = entries.filter(r => r.debit > 0).length;
    const supplier_count = new Set(entries.map(r => r.supplier_name).filter(Boolean)).size;

    res.json({
      total_debit,
      total_credit,
      net_balance: total_debit - total_credit,
      invoice_count,
      supplier_count,
    });
  } catch (err) {
    console.error('[GET /purchase-report/summary]', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /trend — monthly Debit vs Credit + cumulative Balance (all suppliers
// combined, or scoped to one supplier)
// ─────────────────────────────────────────────────────────────────────────
router.get('/trend', async (req, res) => {
  try {
    const { supplier = '', from = '', to = '' } = req.query;
    const entries = await fetchAllLedgerEntries({ search: '', supplier, from, to });

    const byMonth = new Map(); // 'YYYY-MM' -> { debit, credit }
    for (const e of entries) {
      if (!e.date) continue;
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth.has(key)) byMonth.set(key, { debit: 0, credit: 0 });
      const m = byMonth.get(key);
      m.debit += e.debit;
      m.credit += e.credit;
    }

    const months = [...byMonth.keys()].sort();
    let cumulative = 0;
    const trend = months.map(month => {
      const { debit, credit } = byMonth.get(month);
      cumulative += debit - credit;
      return { month, debit, credit, balance: cumulative };
    });

    res.json(trend);
  } catch (err) {
    console.error('[GET /purchase-report/trend]', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /suppliers — distinct supplier names (Fabric + Yarn merged)
// ─────────────────────────────────────────────────────────────────────────
router.get('/suppliers', async (req, res) => {
  try {
    async function namesFor(invoiceType) {
      const meta = { ...PURCHASE_TABLE_META[invoiceType] };
      if (invoiceType === 'Yarn') {
        const t = await resolveYarnPurchaseTable();
        if (!t) return [];
        meta.table = t;
      }
      const cols = await getCols(meta.table);
      const suppCol = pickCol(cols, meta.supplierCands);
      const statusCol = pickCol(cols, meta.statusCands);
      if (!suppCol) return [];
      let where = `WHERE t.${suppCol} IS NOT NULL AND t.${suppCol} <> ''` + statusExclusionSql('t', statusCol);
      const [rows] = await db.query(`SELECT DISTINCT t.${suppCol} AS name FROM ${meta.table} t ${where}`);
      return rows.map(r => r.name);
    }
    const [fabric, yarn] = await Promise.all([namesFor('Fabric'), namesFor('Yarn')]);
    const merged = [...new Set([...fabric, ...yarn])].sort((a, b) => a.localeCompare(b));
    res.json(merged);
  } catch (err) {
    console.error('[GET /purchase-report/suppliers]', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /_debug — resolved table/column report
// ─────────────────────────────────────────────────────────────────────────
router.get('/_debug', async (req, res) => {
  const out = { checkedAt: new Date().toISOString() };
  try {
    out.fabricTable = FABRIC_PURCHASE_TABLE;
    out.fabricExists = await tableExists(FABRIC_PURCHASE_TABLE);
    out.yarnTable = await resolveYarnPurchaseTable();
    out.paymentsOutExists = await tableExists('payments_out');
    if (out.fabricExists) {
      const cols = await getCols(FABRIC_PURCHASE_TABLE);
      out.fabricColumns = [...cols];
      out.fabricResolved = {
        supplier: pickCol(cols, PURCHASE_TABLE_META.Fabric.supplierCands),
        bill_to: pickCol(cols, PURCHASE_TABLE_META.Fabric.billToCands),
        amount: pickCol(cols, PURCHASE_TABLE_META.Fabric.amountCands),
        date: pickCol(cols, PURCHASE_TABLE_META.Fabric.dateCands),
        invoice_no: pickCol(cols, PURCHASE_TABLE_META.Fabric.invoiceNoCands),
        status: pickCol(cols, PURCHASE_TABLE_META.Fabric.statusCands),
      };
    }
    if (out.yarnTable) {
      const cols = await getCols(out.yarnTable);
      out.yarnColumns = [...cols];
      out.yarnResolved = {
        supplier: pickCol(cols, PURCHASE_TABLE_META.Yarn.supplierCands),
        bill_to: pickCol(cols, PURCHASE_TABLE_META.Yarn.billToCands),
        amount: pickCol(cols, PURCHASE_TABLE_META.Yarn.amountCands),
        date: pickCol(cols, PURCHASE_TABLE_META.Yarn.dateCands),
        invoice_no: pickCol(cols, PURCHASE_TABLE_META.Yarn.invoiceNoCands),
        status: pickCol(cols, PURCHASE_TABLE_META.Yarn.statusCands),
      };
    }
    res.json(out);
  } catch (err) {
    out.fatalError = err.sqlMessage || err.message;
    res.status(500).json(out);
  }
});

module.exports = router;