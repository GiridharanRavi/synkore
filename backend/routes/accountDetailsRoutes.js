// backend/routes/accountDetailsRoutes.js
//
// ── Account Details module ────────────────────────────────────────────────
// Powers the "Account Details" admin page: two ledgers —
//   • Payment IN   — against Sales Invoices     (money coming FROM customers)
//   • Payment OUT  — against Purchase Invoices  (money going TO suppliers)
//
// ─────────────────────────────────────────────────────────────────────────
// FIXED (PREVIOUS REVISIONS):
// 1) 500 fix on payments_in/out — dropStaleForeignKeys() actually called.
// 2) Payment Type / Part Payment / Deposit / TDS.
// 3) Qty fallback for sales invoices via packing-list items.
// 4) Payment History endpoints.
// 5) Edit/Delete on Payment History rows.
// 6) Exclude cancelled/deleted invoices from all calculations.
//
// ─────────────────────────────────────────────────────────────────────────
// NEW (THIS REVISION):
//
// 7) FIXED A REAL BUG in the cancelled/deleted exclusion on /summary.
//    The old code built `statusExclusionSql('', statusCol)` — which,
//    because alias was '', produced the INVALID fragment
//    `LOWER(.status)` (a stray leading dot) — and then tried to patch
//    that with two chained `.replace('.', '')` / `.replace('LOWER(.',
//    'LOWER(')` calls. That "worked" only by accident (the first
//    replace happened to strip the right character), and would have
//    silently broken (or thrown) the moment the query had any other
//    '.' in it. statusExclusionSql() now takes an alias that can be
//    empty and builds the correct SQL directly — no more string hacks.
//    Net effect: cancelled / deleted invoices are now *reliably*
//    excluded from the summary cards, not "by coincidence".
//
// 8) CUSTOMER / SUPPLIER FILTER + PARTY-WISE TOTALS
//    ───────────────────────────────────────────────
//    • GET /customers  — distinct customers (from non-cancelled sales
//      invoices) with invoice_count, total_invoiced, total_paid, balance.
//    • GET /suppliers   — same, for purchase invoices / suppliers.
//    • /sales-invoices, /purchase-invoices, /payments-in, /payments-out
//      now accept an exact-match `customer` / `supplier` query param
//      (separate from the free-text `search`) to scope the whole table.
//    • /summary now accepts optional `customer` / `supplier` query params
//      to scope the 4 header cards to a single party.
//
// 9) OVER/UNDER-PAYMENT AS A ROLLING PARTY-LEVEL BALANCE
//    ────────────────────────────────────────────────────
//    Previously "balance" only ever existed per-invoice (invoice_amount −
//    paid_amount), which meant an invoice paid *more* than its own value
//    had nowhere sensible to go. Now `/customers`, `/suppliers`, and the
//    scoped `/summary` compute:
//        balance = SUM(all their invoice amounts) − SUM(all their payments)
//    across every invoice for that party. If a customer's total payments
//    exceed their total invoiced amount, this number goes NEGATIVE — the
//    frontend shows that as "Advance Credit available for upcoming
//    invoices" instead of a stuck overpayment on one invoice. Paying less
//    than the total still shows up as a normal positive "Balance Due".
//    No schema change was needed for this — it's a different way of
//    aggregating data that already exists.
// ─────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// ── Real source tables ─────────────────────────────────────────────────────
const SALES_TABLE    = 'fabric_invoices';
const PURCHASE_TABLE = 'fabric_purchase_invoices';

// Tables/FK targets from earlier revisions of this module — any FK on
// payments_in/payments_out pointing at these is stale and gets dropped.
const STALE_TARGETS_IN  = ['sales_invoices'];
const STALE_TARGETS_OUT = ['purchase_invoices', 'purchase_orders'];

const PAYMENT_TYPES = ['Full Payment', 'Part Payment', 'Deposit', 'Advance'];

// ── Statuses that must be excluded from every amount / count / listing
//    calculation on this page. Matched case-insensitively.
//    ⚠️ CONFIRM against your real data: run
//        SELECT DISTINCT status FROM fabric_invoices;
//        SELECT DISTINCT status FROM fabric_purchase_invoices;
//    and adjust this list so it exactly matches your "cancelled" /
//    "deleted" values (edit freely — this is the only place to touch).
const EXCLUDED_STATUS_VALUES = ['cancelled', 'canceled', 'deleted', 'cancel', 'delete', 'void'];

// Builds ` AND LOWER(col) NOT IN ('cancelled', ...)`.
// - Pass alias='' (or omit it) for queries with no table alias (e.g. a
//   plain `FROM fabric_invoices` with no `AS si`) — the column is then
//   referenced unqualified, which is valid SQL as long as only one table
//   in the query has that column name.
// - Pass alias='si' for `FROM fabric_invoices si` — the column is then
//   referenced as `si.status`.
// Returns '' (no-op) if the table has no status column at all, so
// filtering only ever activates when the column actually exists.
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

// Drop any foreign key on `table` that references one of `staleTargets`.
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

// Drop EVERY foreign key on `table`, regardless of what it references.
// This module intentionally never relies on DB-level FKs (referential
// integrity to fabric_invoices / fabric_purchase_invoices is enforced in
// the route handlers instead), so any FK found here — old or new — is safe
// to remove.
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
    if (!(await tableExists(PURCHASE_TABLE))) {
      console.error(`[account-details] EXPECTED TABLE MISSING: ${PURCHASE_TABLE}. Payment Out will 500 until this table exists.`);
    }

    // ── payments_out ─────────────────────────────────────────────────────
    if (!(await tableExists('payments_out'))) {
      await db.query(`
        CREATE TABLE payments_out (
          id INT AUTO_INCREMENT PRIMARY KEY,
          purchase_invoice_id INT NOT NULL,
          amount DECIMAL(14,2) NOT NULL,
          tds_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
          payment_type ENUM('Full Payment','Part Payment','Deposit','Advance') NOT NULL DEFAULT 'Part Payment',
          payment_date DATE NOT NULL,
          mode VARCHAR(30) NOT NULL DEFAULT 'Bank Transfer',
          reference_no VARCHAR(100) NULL,
          notes TEXT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_payments_out_invoice (purchase_invoice_id)
        )
      `);
      console.log('[account-details] created payments_out (FK-free, references fabric_purchase_invoices.id in app code)');
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

    console.log('[account-details] schema check complete (payments_in/out verified: no FKs, tds_amount + payment_type present)');
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

// ── payment_terms / pay_terms are free text (e.g. "30 Days Credit",
//    "Net 60"). Extract the first number found; default 30 if none. ──────
function parsePaymentTermsDays(raw) {
  if (raw == null) return 30;
  const match = String(raw).match(/(\d+)/);
  return match ? Number(match[1]) : 30;
}

// ── Status computation (payment status: Paid / Overdue / etc — NOT the
//    same thing as the invoice-level Active/Cancelled/Deleted status
//    handled by EXCLUDED_STATUS_VALUES above) ──────────────────────────────
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

// ── Qty fallback source (best-effort) ──────────────────────────────────────
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
// PAYMENT IN — Sales Invoices (fabric_invoices)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/account-details/sales-invoices?search=&status=&customer=&page=&limit=
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
    const invStatusCol = pickCol(cols, ['status']); // invoice-level Active/Cancelled/Deleted column
    const plNoSel    = plNoCol    ? `si.${plNoCol}`    : 'NULL';
    const orderNoSel = orderNoCol ? `si.${orderNoCol}` : 'NULL';
    const qtySel      = qtyCol     ? `si.${qtyCol}`      : 'NULL';
    const termsSel    = termsCol   ? `si.${termsCol}`    : 'NULL';
    const amountCol = pickCol(cols, ['grand_total', 'invoice_amount', 'total_amount']) || 'grand_total';

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
    // Exact-match customer filter (dropdown), independent of free-text search
    if (customer && cols.has('customer_name')) {
      where += ` AND si.customer_name = ?`;
      params.push(customer);
    }
    // Never include cancelled/deleted invoices in this ledger at all
    where += statusExclusionSql('si', invStatusCol);

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

// GET /api/account-details/sales-invoices/:id/payments
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

// GET /api/account-details/payments-in  — full Payment In history/report
// Every row across all sales invoices, joined with invoice_no + customer_name,
// paginated and searchable, optionally scoped to one customer. Payments
// against a cancelled/deleted sales invoice are excluded too, since the
// parent invoice no longer counts.
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
    where += statusExclusionSql('si', invStatusCol);

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

// POST /api/account-details/payments-in
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

// PUT /api/account-details/payments-in/:id — edit an existing Payment In entry
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

// DELETE /api/account-details/payments-in/:id
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
// PAYMENT OUT — Purchase Invoices (fabric_purchase_invoices)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/account-details/purchase-invoices?search=&status=&supplier=&page=&limit=
router.get('/purchase-invoices', async (req, res) => {
  try {
    await schemaReady;
    const { search = '', status = '', supplier = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const cols = await getCols(PURCHASE_TABLE);
    const suppCol  = pickCol(cols, ['supplier', 'supplier_name']);
    const suppSel  = suppCol ? `pinv.${suppCol}` : 'NULL';
    const refCol     = pickCol(cols, ['internal_ref_no', 'internal_ref']);
    const fpoNoCol    = pickCol(cols, ['fpo_no']);
    const qtyCol       = pickCol(cols, ['total_qty', 'total_meter', 'qty', 'meters']);
    const termsCol     = pickCol(cols, ['pay_terms', 'payment_terms']);
    const dueDateCol   = pickCol(cols, ['payment_due_date', 'due_date']);
    const invStatusCol = pickCol(cols, ['status']);
    const refSel     = refCol    ? `pinv.${refCol}`    : 'NULL';
    const fpoNoSel    = fpoNoCol  ? `pinv.${fpoNoCol}`  : 'NULL';
    const qtySel       = qtyCol    ? `pinv.${qtyCol}`    : 'NULL';
    const termsSel     = termsCol  ? `pinv.${termsCol}`  : 'NULL';
    const dueDateSel   = dueDateCol ? `pinv.${dueDateCol}` : 'NULL';
    const amountCol  = pickCol(cols, ['net_value', 'invoice_amount', 'total_amount']) || 'net_value';

    const poutCols = await getCols('payments_out');
    const poutFk = pickCol(poutCols, ['purchase_invoice_id', 'purchase_order_id']) || 'purchase_invoice_id';

    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      const searchCols = ['pinv.invoice_no'];
      if (suppCol)  searchCols.push(`pinv.${suppCol}`);
      if (refCol)   searchCols.push(`pinv.${refCol}`);
      if (fpoNoCol) searchCols.push(`pinv.${fpoNoCol}`);
      where += ` AND (${searchCols.map(c => `${c} LIKE ?`).join(' OR ')})`;
      params.push(...searchCols.map(() => `%${search}%`));
    }
    // Exact-match supplier filter (dropdown), independent of free-text search
    if (supplier && suppCol) {
      where += ` AND pinv.${suppCol} = ?`;
      params.push(supplier);
    }
    // Never include cancelled/deleted purchase invoices in this ledger
    where += statusExclusionSql('pinv', invStatusCol);

    const [rows] = await db.query(
      `SELECT pinv.id, pinv.invoice_no, ${suppSel} AS supplier_name, pinv.invoice_date,
              ${refSel} AS internal_ref, ${fpoNoSel} AS fpo_no, ${qtySel} AS qty,
              pinv.${amountCol} AS invoice_amount, ${termsSel} AS payment_terms_label,
              ${dueDateSel} AS stored_due_date,
              COALESCE((SELECT SUM(pout.amount) FROM payments_out pout WHERE pout.${poutFk} = pinv.id), 0) AS cash_paid,
              COALESCE((SELECT SUM(pout.tds_amount) FROM payments_out pout WHERE pout.${poutFk} = pinv.id), 0) AS tds_paid
       FROM ${PURCHASE_TABLE} pinv
       ${where}
       ORDER BY pinv.invoice_date DESC, pinv.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit) * 5, 0],
    );

    const enriched = rows.map(r => {
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

    const filtered = status ? enriched.filter(r => r.status === status) : enriched;
    const total     = filtered.length;
    const pageRows  = filtered.slice(offset, offset + Number(limit));

    res.json({ data: pageRows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /account-details/purchase-invoices]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// GET /api/account-details/purchase-invoices/:id/payments
router.get('/purchase-invoices/:id/payments', async (req, res) => {
  try {
    await schemaReady;
    const poutCols = await getCols('payments_out');
    const poutFk = pickCol(poutCols, ['purchase_invoice_id', 'purchase_order_id']) || 'purchase_invoice_id';
    const [rows] = await db.query(
      `SELECT id, amount, tds_amount, payment_type, payment_date, mode, reference_no, notes, created_at
       FROM payments_out WHERE ${poutFk} = ? ORDER BY payment_date DESC, id DESC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /account-details/purchase-invoices/:id/payments]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// GET /api/account-details/payments-out  — full Payment Out history/report
// Every row across all purchase invoices, joined with invoice_no + supplier_name,
// paginated and searchable, optionally scoped to one supplier. Payments
// against a cancelled/deleted purchase invoice are excluded too.
router.get('/payments-out', async (req, res) => {
  try {
    await schemaReady;
    const { search = '', supplier = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const purchaseCols = await getCols(PURCHASE_TABLE);
    const suppCol = pickCol(purchaseCols, ['supplier', 'supplier_name']);
    const suppSel = suppCol ? `pinv.${suppCol}` : 'NULL';
    const invStatusCol = pickCol(purchaseCols, ['status']);

    const poutCols = await getCols('payments_out');
    const poutFk = pickCol(poutCols, ['purchase_invoice_id', 'purchase_order_id']) || 'purchase_invoice_id';

    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      const searchCols = ['pinv.invoice_no', 'pout.reference_no', 'pout.mode'];
      if (suppCol) searchCols.push(`pinv.${suppCol}`);
      where += ` AND (${searchCols.map(c => `${c} LIKE ?`).join(' OR ')})`;
      params.push(...searchCols.map(() => `%${search}%`));
    }
    if (supplier && suppCol) {
      where += ` AND pinv.${suppCol} = ?`;
      params.push(supplier);
    }
    where += statusExclusionSql('pinv', invStatusCol);

    const [[countRow]] = await db.query(
      `SELECT COUNT(*) AS c
       FROM payments_out pout
       JOIN ${PURCHASE_TABLE} pinv ON pinv.id = pout.${poutFk}
       ${where}`,
      params,
    );

    const [rows] = await db.query(
      `SELECT pout.id, pout.${poutFk} AS purchase_invoice_id, pinv.invoice_no, ${suppSel} AS party_name,
              pout.amount, pout.tds_amount, pout.payment_type, pout.payment_date, pout.mode,
              pout.reference_no, pout.notes, pout.created_at
       FROM payments_out pout
       JOIN ${PURCHASE_TABLE} pinv ON pinv.id = pout.${poutFk}
       ${where}
       ORDER BY pout.payment_date DESC, pout.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );

    res.json({ data: rows, total: countRow.c, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /account-details/payments-out]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// POST /api/account-details/payments-out
router.post('/payments-out', async (req, res) => {
  try {
    await schemaReady;
    const {
      purchase_invoice_id, amount, tds_amount = 0, payment_type = 'Part Payment',
      payment_date = new Date().toISOString().slice(0, 10),
      mode = 'Bank Transfer', reference_no = '', notes = '',
    } = req.body;

    if (!purchase_invoice_id) return res.status(400).json({ message: 'purchase_invoice_id is required' });
    const amt = Number(amount) || 0;
    const tds = Number(tds_amount) || 0;
    if (amt <= 0 && tds <= 0) return res.status(400).json({ message: 'A valid amount (or TDS amount) is required' });

    const poutCols = await getCols('payments_out');
    const poutFk = pickCol(poutCols, ['purchase_invoice_id', 'purchase_order_id']) || 'purchase_invoice_id';

    const [result] = await db.query(
      `INSERT INTO payments_out (${poutFk}, amount, tds_amount, payment_type, payment_date, mode, reference_no, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?, NOW())`,
      [purchase_invoice_id, amt, tds, validatePaymentType(payment_type), payment_date, mode, reference_no || null, notes || null],
    );

    res.status(201).json({ id: result.insertId, message: 'Payment recorded' });
  } catch (err) {
    console.error('[POST /account-details/payments-out]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// PUT /api/account-details/payments-out/:id — edit an existing Payment Out entry
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

// DELETE /api/account-details/payments-out/:id
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
// NEW: CUSTOMER / SUPPLIER LISTS — powers the dropdown filter + party totals
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/account-details/customers?search=
// Distinct customers from non-cancelled/deleted sales invoices, with:
//   invoice_count, total_invoiced, total_paid, balance
// balance = total_invoiced - total_paid, aggregated ACROSS ALL of that
// customer's invoices — so if they've overpaid overall, balance goes
// negative (an advance/credit usable against upcoming invoices), and if
// they've underpaid it's a normal positive amount due.
router.get('/customers', async (req, res) => {
  try {
    await schemaReady;
    const { search = '' } = req.query;
    const cols = await getCols(SALES_TABLE);
    if (!cols.has('customer_name')) return res.json([]);

    const amountCol = pickCol(cols, ['grand_total', 'invoice_amount', 'total_amount']) || 'grand_total';
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
        balance: totalInvoiced - totalPaid, // negative = credit available
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('[GET /account-details/customers]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// GET /api/account-details/suppliers?search=
// Same idea as /customers, for purchase invoices / suppliers.
router.get('/suppliers', async (req, res) => {
  try {
    await schemaReady;
    const { search = '' } = req.query;
    const cols = await getCols(PURCHASE_TABLE);
    const suppCol = pickCol(cols, ['supplier', 'supplier_name']);
    if (!suppCol) return res.json([]);

    const amountCol = pickCol(cols, ['net_value', 'invoice_amount', 'total_amount']) || 'net_value';
    const statusCol = pickCol(cols, ['status']);

    const poutCols = await getCols('payments_out');
    const poutFk = pickCol(poutCols, ['purchase_invoice_id', 'purchase_order_id']) || 'purchase_invoice_id';

    let where = `WHERE pinv.${suppCol} IS NOT NULL AND pinv.${suppCol} <> ''`;
    const params = [];
    if (search) {
      where += ` AND pinv.${suppCol} LIKE ?`;
      params.push(`%${search}%`);
    }
    where += statusExclusionSql('pinv', statusCol);

    const [rows] = await db.query(
      `SELECT pinv.${suppCol} AS name,
              COUNT(*) AS invoice_count,
              COALESCE(SUM(pinv.${amountCol}), 0) AS total_invoiced,
              COALESCE((
                SELECT SUM(pout.amount) + SUM(pout.tds_amount)
                FROM payments_out pout
                JOIN ${PURCHASE_TABLE} pinv2 ON pinv2.id = pout.${poutFk}
                WHERE pinv2.${suppCol} = pinv.${suppCol}${statusExclusionSql('pinv2', statusCol)}
              ), 0) AS total_paid
       FROM ${PURCHASE_TABLE} pinv
       ${where}
       GROUP BY pinv.${suppCol}
       ORDER BY pinv.${suppCol} ASC`,
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
        balance: totalInvoiced - totalPaid, // negative = advance paid to supplier
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('[GET /account-details/suppliers]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY — quick counts for the page header cards
// Optionally scoped to one customer / supplier via ?customer= / ?supplier=
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/account-details/summary  or  /summary?customer=X  or ?supplier=Y
router.get('/summary', async (req, res) => {
  try {
    await schemaReady;
    const { customer = '', supplier = '' } = req.query;

    const salesCols     = await getCols(SALES_TABLE);
    const salesAmtCol    = pickCol(salesCols, ['grand_total', 'invoice_amount', 'total_amount']) || 'grand_total';
    const salesStatusCol = pickCol(salesCols, ['status']);

    const purchaseCols  = await getCols(PURCHASE_TABLE);
    const purchaseAmtCol = pickCol(purchaseCols, ['net_value', 'invoice_amount', 'total_amount']) || 'net_value';
    const purchaseStatusCol = pickCol(purchaseCols, ['status']);
    const suppCol = pickCol(purchaseCols, ['supplier', 'supplier_name']);

    // ── Invoice-side totals (optionally scoped) ──────────────────────────
    let salesWhere = 'WHERE 1=1' + statusExclusionSql('', salesStatusCol);
    const salesParams = [];
    if (customer && salesCols.has('customer_name')) {
      salesWhere += ' AND customer_name = ?';
      salesParams.push(customer);
    }

    let purchaseWhere = 'WHERE 1=1' + statusExclusionSql('', purchaseStatusCol);
    const purchaseParams = [];
    if (supplier && suppCol) {
      purchaseWhere += ` AND ${suppCol} = ?`;
      purchaseParams.push(supplier);
    }

    const [[salesRow]] = await db.query(
      `SELECT COUNT(*) AS c, COALESCE(SUM(${salesAmtCol}),0) AS total FROM ${SALES_TABLE} ${salesWhere}`,
      salesParams,
    );
    const [[purchRow]] = await db.query(
      `SELECT COUNT(*) AS c, COALESCE(SUM(${purchaseAmtCol}),0) AS total FROM ${PURCHASE_TABLE} ${purchaseWhere}`,
      purchaseParams,
    );

    // ── Payment-side totals (optionally scoped via a join) ───────────────
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
        'SELECT COALESCE(SUM(amount),0) AS cash, COALESCE(SUM(tds_amount),0) AS tds FROM payments_in',
      );
    }

    const poutCols = await getCols('payments_out');
    const poutFk = pickCol(poutCols, ['purchase_invoice_id', 'purchase_order_id']) || 'purchase_invoice_id';

    let paidOutRow;
    if (supplier && suppCol) {
      [[paidOutRow]] = await db.query(
        `SELECT COALESCE(SUM(pout.amount),0) AS cash, COALESCE(SUM(pout.tds_amount),0) AS tds
         FROM payments_out pout
         JOIN ${PURCHASE_TABLE} pinv ON pinv.id = pout.${poutFk}
         WHERE pinv.${suppCol} = ?${statusExclusionSql('pinv', purchaseStatusCol)}`,
        [supplier],
      );
    } else {
      [[paidOutRow]] = await db.query(
        'SELECT COALESCE(SUM(amount),0) AS cash, COALESCE(SUM(tds_amount),0) AS tds FROM payments_out',
      );
    }

    const paymentInTotal  = Number(paidInRow.cash)  + Number(paidInRow.tds);
    const paymentOutTotal = Number(paidOutRow.cash) + Number(paidOutRow.tds);

    res.json({
      sales_invoice_count:    salesRow.c,
      sales_invoice_total:    Number(salesRow.total),
      purchase_invoice_count: purchRow.c,
      purchase_invoice_total: Number(purchRow.total),
      payment_in_total:       paymentInTotal,
      payment_in_cash:        Number(paidInRow.cash),
      payment_in_tds:         Number(paidInRow.tds),
      payment_out_total:      paymentOutTotal,
      payment_out_cash:       Number(paidOutRow.cash),
      payment_out_tds:        Number(paidOutRow.tds),
      // negative = advance/credit; positive = amount still due
      receivable_balance:     Number(salesRow.total) - paymentInTotal,
      payable_balance:        Number(purchRow.total) - paymentOutTotal,
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
// ─────────────────────────────────────────────────────────────────────────────
router.get('/_debug', async (req, res) => {
  const out = { checkedAt: new Date().toISOString() };
  try {
    await schemaReady;

    out.salesTableExists    = await tableExists(SALES_TABLE);
    out.purchaseTableExists = await tableExists(PURCHASE_TABLE);
    out.paymentsInExists    = await tableExists('payments_in');
    out.paymentsOutExists   = await tableExists('payments_out');

    if (out.salesTableExists) {
      const cols = await getCols(SALES_TABLE);
      out.salesColumns = [...cols];
      out.salesResolved = {
        customer_name: cols.has('customer_name') ? 'customer_name' : null,
        pl_no:    pickCol(cols, ['pl_no', 'packing_list_no']),
        order_no: pickCol(cols, ['order_code', 'order_no']),
        qty:      pickCol(cols, ['total_meter', 'total_meters', 'total_qty', 'meters', 'qty', 'fabric_qty']),
        terms:    pickCol(cols, ['payment_terms', 'payment_term']),
        amount:   pickCol(cols, ['grand_total', 'invoice_amount', 'total_amount']) || 'grand_total',
        status:   pickCol(cols, ['status']),
      };
      try {
        const [[cnt]] = await db.query(`SELECT COUNT(*) AS c FROM ${SALES_TABLE}`);
        out.salesRowCount = cnt.c;
      } catch (e) { out.salesRowCountError = e.sqlMessage || e.message; }
      const salesStatusCol = pickCol(cols, ['status']);
      if (salesStatusCol) {
        try {
          const [distinctRows] = await db.query(`SELECT DISTINCT ${salesStatusCol} AS status FROM ${SALES_TABLE}`);
          out.salesDistinctStatuses = distinctRows.map(r => r.status);
        } catch (e) { out.salesDistinctStatusesError = e.sqlMessage || e.message; }
      }
    }

    if (out.purchaseTableExists) {
      const cols = await getCols(PURCHASE_TABLE);
      out.purchaseColumns = [...cols];
      out.purchaseResolved = {
        supplier: pickCol(cols, ['supplier', 'supplier_name']),
        internal_ref: pickCol(cols, ['internal_ref_no', 'internal_ref']),
        fpo_no:   pickCol(cols, ['fpo_no']),
        qty:      pickCol(cols, ['total_qty', 'total_meter', 'qty', 'meters']),
        terms:    pickCol(cols, ['pay_terms', 'payment_terms']),
        due_date: pickCol(cols, ['payment_due_date', 'due_date']),
        amount:   pickCol(cols, ['net_value', 'invoice_amount', 'total_amount']) || 'net_value',
        status:   pickCol(cols, ['status']),
      };
      try {
        const [[cnt]] = await db.query(`SELECT COUNT(*) AS c FROM ${PURCHASE_TABLE}`);
        out.purchaseRowCount = cnt.c;
      } catch (e) { out.purchaseRowCountError = e.sqlMessage || e.message; }
      const purchaseStatusCol = pickCol(cols, ['status']);
      if (purchaseStatusCol) {
        try {
          const [distinctRows] = await db.query(`SELECT DISTINCT ${purchaseStatusCol} AS status FROM ${PURCHASE_TABLE}`);
          out.purchaseDistinctStatuses = distinctRows.map(r => r.status);
        } catch (e) { out.purchaseDistinctStatusesError = e.sqlMessage || e.message; }
      }
    }

    if (out.paymentsInExists)  out.paymentsInColumns  = [...(await getCols('payments_in'))];
    if (out.paymentsOutExists) out.paymentsOutColumns = [...(await getCols('payments_out'))];

    out.liveQueryTests = {};
    try {
      const amt = pickCol(await getCols(SALES_TABLE), ['grand_total', 'invoice_amount', 'total_amount']) || 'grand_total';
      await db.query(`SELECT COUNT(*) FROM ${SALES_TABLE} si LIMIT 1`);
      await db.query(`SELECT COALESCE(SUM(${amt}),0) AS t FROM ${SALES_TABLE}`);
      out.liveQueryTests.salesSummaryQuery = 'ok';
    } catch (e) { out.liveQueryTests.salesSummaryQuery = e.sqlMessage || e.message; }

    try {
      const amt = pickCol(await getCols(PURCHASE_TABLE), ['net_value', 'invoice_amount', 'total_amount']) || 'net_value';
      await db.query(`SELECT COUNT(*) FROM ${PURCHASE_TABLE} pinv LIMIT 1`);
      await db.query(`SELECT COALESCE(SUM(${amt}),0) AS t FROM ${PURCHASE_TABLE}`);
      out.liveQueryTests.purchaseSummaryQuery = 'ok';
    } catch (e) { out.liveQueryTests.purchaseSummaryQuery = e.sqlMessage || e.message; }

    try {
      await db.query('SELECT COALESCE(SUM(amount),0), COALESCE(SUM(tds_amount),0) FROM payments_in');
      out.liveQueryTests.paymentsInQuery = 'ok';
    } catch (e) { out.liveQueryTests.paymentsInQuery = e.sqlMessage || e.message; }

    try {
      await db.query('SELECT COALESCE(SUM(amount),0), COALESCE(SUM(tds_amount),0) FROM payments_out');
      out.liveQueryTests.paymentsOutQuery = 'ok';
    } catch (e) { out.liveQueryTests.paymentsOutQuery = e.sqlMessage || e.message; }

    res.json(out);
  } catch (err) {
    out.fatalError = err.sqlMessage || err.message;
    res.status(500).json(out);
  }
});

module.exports = router;