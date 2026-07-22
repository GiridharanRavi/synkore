// backend/routes/salesReportRoutes.js
//
// ── Sales Report module ─────────────────────────────────────────────────
// Powers the "Sales Report" admin page — a customer-statement style
// ledger built from the SAME source tables as the Account Details module
// (no duplicate data entry, no new invoice/payment tables):
//
//   DEBIT  rows  ← fabric_invoices   (a sales invoice raises what the
//                                      customer owes you)
//   CREDIT rows  ← payments_in       (a payment received reduces what the
//                                      customer owes you)
//
// Columns on the report:
//   Sales Date | Sales Invoice No | Customer Name | Bill To | Credit |
//   Debit | Balance
//
// "Bill To" is a billing-party label that can differ from the shipping /
// display customer name (e.g. Head Office vs a branch). It is read from
// fabric_invoices.bill_to if that column exists; ensureSchema() below
// adds it automatically (nullable) if missing, and the API falls back to
// customer_name when a row has no bill_to value set.
//
// RUNNING BALANCE RULE:
//   The ledger is always sorted CUSTOMER, then DATE (then created_at/id
//   as a tiebreaker), and the running balance resets to 0 at the start of
//   each customer's block — i.e. this is a per-customer statement, same
//   as a bank/ledger statement. Balance = cumulative debit - cumulative
//   credit for that customer, in chronological order. When a single
//   customer is selected via ?customer=, the response is exactly that
//   customer's statement with a true running balance. When no customer is
//   selected, rows from every customer are returned back-to-back in
//   customer-name order, each with ITS OWN running balance (not mixed
//   with other customers) — the UI groups by customer visually.
//
// LIFECYCLE: cancelled/deleted invoices are excluded exactly like the
// Account Details module (EXCLUDED_STATUS_VALUES), so this report always
// matches what Account Details shows as outstanding.
// ─────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

const SALES_TABLE = 'fabric_invoices';

const EXCLUDED_STATUS_VALUES = ['cancelled', 'canceled', 'deleted', 'cancel', 'delete', 'void'];

function statusExclusionSql(alias, statusCol) {
  if (!statusCol) return '';
  const list = EXCLUDED_STATUS_VALUES.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
  const colRef = alias ? `${alias}.${statusCol}` : statusCol;
  return ` AND LOWER(${colRef}) NOT IN (${list})`;
}

// ── schema helpers (same pattern as accountDetailsRoutes.js) ──────────────
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
      `[sales-report] "${table}" has no recognizable ${purpose} column. Tried: ${candidates.join(', ')}. ` +
      `Actual columns: ${[...cols].join(', ') || '(none)'}.`
    );
  }
  return found;
}

async function ensureSchema() {
  try {
    if (!(await tableExists(SALES_TABLE))) {
      console.error(`[sales-report] EXPECTED TABLE MISSING: ${SALES_TABLE}. Sales Report will return empty data until this exists.`);
      return;
    }
    if (!(await tableExists('payments_in'))) {
      console.error('[sales-report] payments_in table missing — Credit rows will be empty until Account Details module has created it.');
    }

    const cols = await getCols(SALES_TABLE);
    if (!cols.has('bill_to')) {
      try {
        console.log(`[sales-report] adding missing ${SALES_TABLE}.bill_to`);
        await db.query(`ALTER TABLE \`${SALES_TABLE}\` ADD COLUMN bill_to VARCHAR(255) NULL AFTER customer_name`);
        delete _colCache[SALES_TABLE];
      } catch (err) {
        console.error('[sales-report] could not add bill_to column:', err.code || '', err.sqlMessage || err.message);
      }
    }
    console.log('[sales-report] schema check complete.');
  } catch (err) {
    console.error('[sales-report] ensureSchema failed:', err.code || '', err.sqlMessage || err.message);
  }
}
const schemaReady = ensureSchema();

// ── Build raw (unbalanced) debit + credit rows, filtered ──────────────────
async function fetchRawLedgerRows({ search = '', customer = '', from = '', to = '' } = {}) {
  const cols = await getCols(SALES_TABLE);
  if (cols.size === 0) return [];

  const amountCol = resolveRequiredCol(
    cols,
    ['grand_total', 'invoice_amount', 'total_amount', 'bill_amount', 'invoice_value', 'net_value', 'amount', 'total'],
    SALES_TABLE, 'invoice amount',
  );
  if (!amountCol) return [];

  const statusCol  = pickCol(cols, ['status']);
  const billToCol  = pickCol(cols, ['bill_to']);
  const billToSel  = billToCol ? `si.${billToCol}` : 'NULL';

  let where = 'WHERE 1=1';
  const params = [];
  if (search) {
    where += ` AND (si.invoice_no LIKE ? OR si.customer_name LIKE ?${billToCol ? ` OR si.${billToCol} LIKE ?` : ''})`;
    params.push(`%${search}%`, `%${search}%`);
    if (billToCol) params.push(`%${search}%`);
  }
  if (customer) { where += ' AND si.customer_name = ?'; params.push(customer); }
  if (from)     { where += ' AND si.invoice_date >= ?'; params.push(from); }
  if (to)       { where += ' AND si.invoice_date <= ?'; params.push(to); }
  where += statusExclusionSql('si', statusCol);

  // DEBIT rows — one per sales invoice
  const [debitRows] = await db.query(
    `SELECT si.id, si.invoice_no, si.customer_name, ${billToSel} AS bill_to,
            si.invoice_date AS txn_date, si.${amountCol} AS debit, 0 AS credit,
            si.id AS sort_id, si.invoice_date AS sort_date
     FROM ${SALES_TABLE} si
     ${where}
     ORDER BY si.invoice_date ASC, si.id ASC`,
    params,
  );

  // CREDIT rows — one per payment received against a (still-visible) invoice
  let creditRows = [];
  if (await tableExists('payments_in')) {
    let cwhere = 'WHERE 1=1';
    const cparams = [];
    if (search) {
      cwhere += ` AND (si.invoice_no LIKE ? OR si.customer_name LIKE ?${billToCol ? ` OR si.${billToCol} LIKE ?` : ''} OR pi.reference_no LIKE ?)`;
      cparams.push(`%${search}%`, `%${search}%`);
      if (billToCol) cparams.push(`%${search}%`);
      cparams.push(`%${search}%`);
    }
    if (customer) { cwhere += ' AND si.customer_name = ?'; cparams.push(customer); }
    if (from)     { cwhere += ' AND pi.payment_date >= ?'; cparams.push(from); }
    if (to)       { cwhere += ' AND pi.payment_date <= ?'; cparams.push(to); }
    cwhere += statusExclusionSql('si', statusCol);

    const [rows] = await db.query(
      `SELECT pi.id, si.invoice_no, si.customer_name, ${billToSel} AS bill_to,
              pi.payment_date AS txn_date, 0 AS debit, (pi.amount + pi.tds_amount) AS credit,
              pi.id AS sort_id, pi.payment_date AS sort_date
       FROM payments_in pi
       JOIN ${SALES_TABLE} si ON si.id = pi.sales_invoice_id
       ${cwhere}
       ORDER BY pi.payment_date ASC, pi.id ASC`,
      cparams,
    );
    creditRows = rows;
  }

  return [...debitRows, ...creditRows].map(r => ({
    ...r,
    bill_to: r.bill_to || r.customer_name,
    debit: Number(r.debit) || 0,
    credit: Number(r.credit) || 0,
  }));
}

// ── Sort customer -> date -> id, and compute a running balance that
//    resets to 0 at each customer boundary. ────────────────────────────────
function buildStatement(rawRows) {
  const sorted = [...rawRows].sort((a, b) => {
    const custDiff = String(a.customer_name).localeCompare(String(b.customer_name));
    if (custDiff !== 0) return custDiff;
    const dateDiff = new Date(a.sort_date).getTime() - new Date(b.sort_date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return Number(a.sort_id) - Number(b.sort_id);
  });

  let runningBalance = 0;
  let lastCustomer = null;
  return sorted.map((r, i) => {
    if (r.customer_name !== lastCustomer) {
      runningBalance = 0;
      lastCustomer = r.customer_name;
    }
    runningBalance += r.debit - r.credit;
    return {
      row_no: i + 1,
      sales_date: r.txn_date,
      invoice_no: r.invoice_no,
      customer_name: r.customer_name,
      bill_to: r.bill_to,
      credit: r.credit,
      debit: r.debit,
      balance: Number(runningBalance.toFixed(2)),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/sales-report/ledger — paginated statement rows
// ─────────────────────────────────────────────────────────────────────────
router.get('/ledger', async (req, res) => {
  try {
    await schemaReady;
    const { search = '', customer = '', from = '', to = '', page = 1, limit = 25 } = req.query;
    const raw = await fetchRawLedgerRows({ search, customer, from, to });
    const statement = buildStatement(raw);

    const total = statement.length;
    const offset = (Number(page) - 1) * Number(limit);
    const pageRows = statement.slice(offset, offset + Number(limit));

    res.json({ data: pageRows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /sales-report/ledger]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/sales-report/ledger/all — full (unpaginated) statement, used by
// the frontend's Export-to-PDF/CSV/Excel actions so the file always
// contains every matching row, not just the current page.
// ─────────────────────────────────────────────────────────────────────────
router.get('/ledger/all', async (req, res) => {
  try {
    await schemaReady;
    const { search = '', customer = '', from = '', to = '' } = req.query;
    const raw = await fetchRawLedgerRows({ search, customer, from, to });
    const statement = buildStatement(raw);
    res.json({ data: statement, total: statement.length });
  } catch (err) {
    console.error('[GET /sales-report/ledger/all]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/sales-report/summary — header cards: total debit/credit/balance
// ─────────────────────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    await schemaReady;
    const { search = '', customer = '', from = '', to = '' } = req.query;
    const raw = await fetchRawLedgerRows({ search, customer, from, to });

    const totalDebit  = raw.reduce((s, r) => s + r.debit, 0);
    const totalCredit = raw.reduce((s, r) => s + r.credit, 0);
    const invoiceCount = new Set(raw.filter(r => r.debit > 0).map(r => r.invoice_no)).size;
    const customerCount = new Set(raw.map(r => r.customer_name)).size;

    res.json({
      total_debit: Number(totalDebit.toFixed(2)),
      total_credit: Number(totalCredit.toFixed(2)),
      net_balance: Number((totalDebit - totalCredit).toFixed(2)),
      invoice_count: invoiceCount,
      customer_count: customerCount,
      scoped_customer: customer || null,
      from: from || null,
      to: to || null,
    });
  } catch (err) {
    console.error('[GET /sales-report/summary]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/sales-report/trend — monthly Credit vs Debit vs Balance series,
// for the chart. Balance in the trend is the OVERALL (all customers
// combined) cumulative debit-minus-credit at the end of each month, which
// is a different (aggregate) number from the per-customer statement
// balance above — this is intentional, it answers "how is our
// receivable trending over time" rather than one customer's statement.
// ─────────────────────────────────────────────────────────────────────────
router.get('/trend', async (req, res) => {
  try {
    await schemaReady;
    const { customer = '', from = '', to = '' } = req.query;
    const raw = await fetchRawLedgerRows({ customer, from, to });

    const byMonth = new Map(); // 'YYYY-MM' -> { debit, credit }
    for (const r of raw) {
      const d = new Date(r.sort_date);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = byMonth.get(key) || { debit: 0, credit: 0 };
      bucket.debit += r.debit;
      bucket.credit += r.credit;
      byMonth.set(key, bucket);
    }

    const months = [...byMonth.keys()].sort();
    let cumulative = 0;
    const series = months.map(key => {
      const b = byMonth.get(key);
      cumulative += b.debit - b.credit;
      return {
        month: key,
        debit: Number(b.debit.toFixed(2)),
        credit: Number(b.credit.toFixed(2)),
        balance: Number(cumulative.toFixed(2)),
      };
    });

    res.json(series);
  } catch (err) {
    console.error('[GET /sales-report/trend]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/sales-report/customers — dropdown filter list
// ─────────────────────────────────────────────────────────────────────────
router.get('/customers', async (req, res) => {
  try {
    await schemaReady;
    const { search = '' } = req.query;
    const cols = await getCols(SALES_TABLE);
    if (!cols.has('customer_name')) return res.json([]);
    const statusCol = pickCol(cols, ['status']);

    let where = `WHERE customer_name IS NOT NULL AND customer_name <> ''`;
    const params = [];
    if (search) { where += ' AND customer_name LIKE ?'; params.push(`%${search}%`); }
    where += statusExclusionSql('', statusCol);

    const [rows] = await db.query(
      `SELECT DISTINCT customer_name AS name FROM ${SALES_TABLE} ${where} ORDER BY customer_name ASC`,
      params,
    );
    res.json(rows.map(r => r.name));
  } catch (err) {
    console.error('[GET /sales-report/customers]', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

module.exports = router;