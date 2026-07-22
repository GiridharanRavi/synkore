// routes/yarnPurchaseInvoiceRoutes.js
//
// YARN PURCHASE INVOICE — supplier's bill entry against a Yarn Purchase
// Order (YPO) raised via routes/yarnPurchaseOrders.js.
//
// Mirrors routes/purchaseInvoices.js (the Fabric invoice routes) but is
// scoped to yarn only and reads straight from the REAL yarn tables
// (yarn_purchase_orders / yarn_po_items / suppliers) rather than the
// generic multi-shape guessing the Fabric+Yarn combined module needs,
// since those tables' real column names are already known from
// routes/yarnPurchaseOrders.js.
//
// Own tables: yarn_purchase_invoice_bills / yarn_purchase_invoice_bill_items
// (see yarn_purchase_invoice_schema.sql).

const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// ── Auto-migration: create this module's own tables if missing ───────────
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
    if (!(await tableExists('yarn_purchase_invoice_bills'))) {
      await pool.query(`
        CREATE TABLE yarn_purchase_invoice_bills (
          id                  INT AUTO_INCREMENT PRIMARY KEY,
          invoice_no          VARCHAR(50) NOT NULL,
          invoice_date        DATE NOT NULL,
          due_date            DATE NULL,
          ypo_id              INT NOT NULL,
          ypo_item_id         INT NOT NULL,
          po_no               VARCHAR(50) NULL,
          po_date             DATE NULL,
          supplier            VARCHAR(150) NOT NULL,
          supplier_address    TEXT NULL,
          supplier_gstin      VARCHAR(20) NULL,
          count_lot           VARCHAR(150) NULL,
          hsn_code            VARCHAR(20) NULL,
          unit                VARCHAR(10) NOT NULL DEFAULT 'KG',
          rate                DECIMAL(14,2) NOT NULL DEFAULT 0,
          total_order_qty     DECIMAL(14,3) NOT NULL DEFAULT 0,
          delivered_qty       DECIMAL(14,3) NOT NULL DEFAULT 0,
          balance_qty         DECIMAL(14,3) NOT NULL DEFAULT 0,
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
          UNIQUE KEY uq_yib_invoice_no (invoice_no),
          INDEX idx_yib_ypo_item (ypo_item_id),
          INDEX idx_yib_ypo (ypo_id)
        )
      `);
      console.log('[yarn-purchase-invoices] created yarn_purchase_invoice_bills');
    }

    if (!(await tableExists('yarn_purchase_invoice_bill_items'))) {
      await pool.query(`
        CREATE TABLE yarn_purchase_invoice_bill_items (
          id             INT AUTO_INCREMENT PRIMARY KEY,
          invoice_id     INT NOT NULL,
          delivered_qty  DECIMAL(14,3) NOT NULL DEFAULT 0,
          no_of_bags     INT NULL,
          bag_no         VARCHAR(50) NULL,
          lot_no         VARCHAR(50) NULL,
          rate           DECIMAL(14,2) NOT NULL DEFAULT 0,
          amount         DECIMAL(14,2) NOT NULL DEFAULT 0,
          remarks        TEXT NULL,
          INDEX idx_yibi_invoice (invoice_id)
        )
      `);
      console.log('[yarn-purchase-invoices] created yarn_purchase_invoice_bill_items');
    }
  } catch (err) {
    console.error('[yarn-purchase-invoices] ensureSchema failed:', err.code || '', err.sqlMessage || err.message);
  }
}
const schemaReady = ensureSchema();

// ── Small schema helpers (only needed for the optional HSN table name,
//    which — same as in yarnPurchaseOrders.js — can be hsn_codes or
//    hsn_master depending on deployment) ──────────────────────────────────
const _colCache = {};
async function columnsOf(table) {
  if (_colCache[table]) return _colCache[table];
  try {
    const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
    _colCache[table] = new Set(rows.map(r => r.Field));
  } catch {
    _colCache[table] = new Set();
  }
  return _colCache[table];
}

let _hsnTableCache;
async function getHsnTableName() {
  if (_hsnTableCache !== undefined) return _hsnTableCache;
  for (const candidate of ['hsn_codes', 'hsn_master']) {
    if (await tableExists(candidate)) { _hsnTableCache = candidate; return candidate; }
  }
  console.warn('[yarn-purchase-invoices] no hsn_codes/hsn_master table found — HSN will be blank.');
  _hsnTableCache = null;
  return null;
}

// ── Fetch YPO lines for the "PO No" search dropdown ───────────────────────
async function fetchYarnPoLines(searchTerm) {
  const like = `%${searchTerm}%`;
  const hsnTable = await getHsnTableName();
  const ypoCols = await columnsOf('yarn_purchase_orders');
  const hasDueDate = ypoCols.has('due_date');

  const hsnJoin = hsnTable ? `LEFT JOIN ${hsnTable} h ON ypi.hsn_code_id = h.id` : '';
  const hsnSel  = hsnTable ? 'h.hsn_code' : 'NULL';

  const [rows] = await pool.query(
    `SELECT
       ypo.id                         AS po_id,
       ypo.rec_no                     AS po_no,
       ypo.rec_date                   AS po_date,
       ${hasDueDate ? 'ypo.due_date' : 'NULL'} AS due_date,
       s.supplier_name                AS supplier,
       s.address                      AS supplier_address,
       s.pin_code, s.district, s.state, s.country,
       s.gst_no                       AS supplier_gstin,
       ypi.id                         AS item_id,
       CONCAT(COALESCE(ypi.count_for_po,''),
              CASE WHEN ypi.lot_no IS NOT NULL AND ypi.lot_no <> ''
                   THEN CONCAT(' (Lot ', ypi.lot_no, ')') ELSE '' END) AS quality,
       ${hsnSel}                      AS hsn_code,
       ypi.rate                       AS rate,
       ypi.total_weight               AS total_qty,
       ypi.gst_pct                    AS cgst_pct,
       ypi.sgst_pct                   AS sgst_pct,
       ypi.igst_pct                   AS igst_pct,
       COALESCE(ypo.advance, 0)       AS advance,
       COALESCE((
         SELECT SUM(yii.delivered_qty)
         FROM yarn_purchase_invoice_bills yi
         JOIN yarn_purchase_invoice_bill_items yii ON yii.invoice_id = yi.id
         WHERE yi.ypo_item_id = ypi.id AND yi.status <> 'Cancelled'
       ), 0)                          AS already_invoiced_qty
     FROM yarn_purchase_orders ypo
     JOIN yarn_po_items ypi ON ypi.po_id = ypo.id
     LEFT JOIN suppliers s ON s.id = ypo.supplier_id
     ${hsnJoin}
     WHERE ypo.rec_no LIKE ? OR s.supplier_name LIKE ? OR ypi.count_for_po LIKE ? OR ypi.lot_no LIKE ?
     ORDER BY ypo.rec_date DESC
     LIMIT 40`,
    [like, like, like, like],
  );

  return rows.map(r => {
    const addrParts = [r.address, r.pin_code, r.district, r.state, r.country].filter(Boolean);
    return {
      key: `yarn:${r.po_id}:${r.item_id}`,
      po_type: 'yarn',
      po_id: r.po_id,
      item_id: r.item_id,
      po_no: r.po_no,
      po_date: r.po_date,
      due_date: r.due_date,
      supplier: r.supplier || '',
      supplier_address: addrParts.join(', '),
      supplier_gstin: r.supplier_gstin || '',
      quality: (r.quality || '').trim(),
      hsn_code: r.hsn_code || '',
      unit: 'KG',
      rate: Number(r.rate) || 0,
      total_qty: Number(r.total_qty) || 0,
      already_invoiced_qty: Number(r.already_invoiced_qty) || 0,
      balance_qty: (Number(r.total_qty) || 0) - (Number(r.already_invoiced_qty) || 0),
      gst_type: Number(r.igst_pct) > 0 ? 'IGST' : 'CGST_SGST',
      cgst_pct: Number(r.cgst_pct) || 0,
      sgst_pct: Number(r.sgst_pct) || 0,
      igst_pct: Number(r.igst_pct) || 0,
      advance: Number(r.advance) || 0,
    };
  });
}

// ── GET /api/yarn-purchase-invoices/po-lines?search= ──
router.get('/po-lines', async (req, res) => {
  try {
    await schemaReady;
    const search = String(req.query.search ?? req.query.q ?? '').trim();
    const lines = await fetchYarnPoLines(search);
    res.json(lines);
  } catch (err) {
    console.error('[yarn-purchase-invoices/po-lines] failed:', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: 'Could not load YPO lines for invoicing.', detail: err.sqlMessage || err.message });
  }
});

// ── GET /api/yarn-purchase-invoices/next-invoice-no ──
router.get('/next-invoice-no', async (req, res) => {
  try {
    await schemaReady;
    const year = new Date().getFullYear();
    const [rows] = await pool.query(
      `SELECT invoice_no FROM yarn_purchase_invoice_bills
       WHERE invoice_no LIKE ? ORDER BY id DESC LIMIT 1`,
      [`YINV-${year}-%`],
    );
    let nextSeq = 1;
    if (rows.length) {
      const parts = rows[0].invoice_no.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
    }
    res.json({ invoice_no: `YINV-${year}-${String(nextSeq).padStart(3, '0')}` });
  } catch (err) {
    console.error('[yarn-purchase-invoices/next-invoice-no] failed:', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: 'Could not generate invoice number.', detail: err.sqlMessage || err.message });
  }
});

// ── GET /api/yarn-purchase-invoices ── (list, search + pagination) ──
router.get('/', async (req, res) => {
  try {
    await schemaReady;
    const { search = '', page = 1, limit = 10, status = '' } = req.query;
    const like = `%${search}%`;
    const offset = (Number(page) - 1) * Number(limit);

    const where = [];
    const params = [];
    if (search) {
      where.push('(yi.invoice_no LIKE ? OR yi.po_no LIKE ? OR yi.supplier LIKE ?)');
      params.push(like, like, like);
    }
    if (status) { where.push('yi.status = ?'); params.push(status); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT yi.* FROM yarn_purchase_invoice_bills yi
       ${whereSql}
       ORDER BY yi.invoice_date DESC, yi.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM yarn_purchase_invoice_bills yi ${whereSql}`,
      params,
    );

    res.json({ data: rows, total });
  } catch (err) {
    console.error('[yarn-purchase-invoices] list failed:', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: 'Could not load yarn purchase invoices.', detail: err.sqlMessage || err.message });
  }
});

// ── GET /api/yarn-purchase-invoices/:id ── (full record incl. items) ──
router.get('/:id', async (req, res) => {
  try {
    await schemaReady;
    const [[invoice]] = await pool.query(`SELECT * FROM yarn_purchase_invoice_bills WHERE id = ?`, [req.params.id]);
    if (!invoice) return res.status(404).json({ message: 'Yarn purchase invoice not found.' });
    const [items] = await pool.query(
      `SELECT * FROM yarn_purchase_invoice_bill_items WHERE invoice_id = ? ORDER BY id`,
      [req.params.id],
    );
    res.json({ ...invoice, items });
  } catch (err) {
    console.error('[yarn-purchase-invoices/:id] failed:', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: 'Could not load yarn purchase invoice.', detail: err.sqlMessage || err.message });
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
      no_of_bags: it.no_of_bags !== undefined && it.no_of_bags !== '' ? Number(it.no_of_bags) : null,
      bag_no: it.bag_no || '',
      lot_no: it.lot_no || '',
      rate,
      amount,
      remarks: it.remarks || '',
    };
  });

  const delivered_qty = +normItems.reduce((s, i) => s + i.delivered_qty, 0).toFixed(3);
  const sub_total = +normItems.reduce((s, i) => s + i.amount, 0).toFixed(2);

  const cgst_pct = Number(payload.cgst_pct) || 0;
  const sgst_pct = Number(payload.sgst_pct) || 0;
  const igst_pct = Number(payload.igst_pct) || 0;
  const gst_amount = +(sub_total * (cgst_pct + sgst_pct + igst_pct) / 100).toFixed(2);
  const net_value = +(sub_total + gst_amount).toFixed(2);
  const advance = Number(payload.advance) || 0;
  const balance_due = +(net_value - advance).toFixed(2);

  const total_order_qty = Number(payload.total_order_qty) || 0;
  const already_invoiced_before_this = Number(payload.already_invoiced_qty) || 0;
  const balance_qty = +(total_order_qty - already_invoiced_before_this - delivered_qty).toFixed(3);

  return { normItems, delivered_qty, sub_total, gst_amount, net_value, balance_due, balance_qty };
}

// ── POST /api/yarn-purchase-invoices ── (create) ──
router.post('/', async (req, res) => {
  await schemaReady;
  const conn = await pool.getConnection();
  try {
    const p = req.body;
    if (!p.invoice_no || !p.invoice_date || !p.supplier) {
      return res.status(400).json({ message: 'Invoice No, Invoice Date and Supplier are required.' });
    }
    if (!p.ypo_id || !p.ypo_item_id) {
      return res.status(400).json({ message: 'Please select a Yarn PO line to invoice against.' });
    }

    const t = computeTotals(p);
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO yarn_purchase_invoice_bills
        (invoice_no, invoice_date, due_date, ypo_id, ypo_item_id, po_no, po_date,
         supplier, supplier_address, supplier_gstin, count_lot, hsn_code, unit, rate,
         total_order_qty, delivered_qty, balance_qty,
         gst_type, cgst_pct, sgst_pct, igst_pct,
         advance, sub_total, gst_amount, net_value, balance_due,
         remarks, status)
       VALUES (?,?,?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?)`,
      [
        p.invoice_no, p.invoice_date, p.due_date || null, p.ypo_id, p.ypo_item_id,
        p.po_no || null, p.po_date || null,
        p.supplier, p.supplier_address || '', p.supplier_gstin || '', p.quality || '', p.hsn_code || '',
        p.unit || 'KG', Number(p.rate) || 0,
        Number(p.total_order_qty) || 0, t.delivered_qty, t.balance_qty,
        p.gst_type || 'CGST_SGST', Number(p.cgst_pct) || 0, Number(p.sgst_pct) || 0, Number(p.igst_pct) || 0,
        Number(p.advance) || 0, t.sub_total, t.gst_amount, t.net_value, t.balance_due,
        p.remarks || '', p.status || 'Pending',
      ],
    );
    const invoiceId = result.insertId;

    for (const it of t.normItems) {
      await conn.query(
        `INSERT INTO yarn_purchase_invoice_bill_items
          (invoice_id, delivered_qty, no_of_bags, bag_no, lot_no, rate, amount, remarks)
         VALUES (?,?,?,?,?,?,?,?)`,
        [invoiceId, it.delivered_qty, it.no_of_bags, it.bag_no, it.lot_no, it.rate, it.amount, it.remarks],
      );
    }

    await conn.commit();
    const [[saved]] = await pool.query(`SELECT * FROM yarn_purchase_invoice_bills WHERE id = ?`, [invoiceId]);
    res.status(201).json(saved);
  } catch (err) {
    await conn.rollback();
    console.error('[yarn-purchase-invoices] create failed:', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || 'Could not save yarn purchase invoice.' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/yarn-purchase-invoices/:id ── (update) ──
router.put('/:id', async (req, res) => {
  await schemaReady;
  const conn = await pool.getConnection();
  try {
    const p = req.body;
    const t = computeTotals(p);
    await conn.beginTransaction();

    await conn.query(
      `UPDATE yarn_purchase_invoice_bills SET
        invoice_date=?, due_date=?, ypo_id=?, ypo_item_id=?, po_no=?, po_date=?,
        supplier=?, supplier_address=?, supplier_gstin=?, count_lot=?, hsn_code=?, unit=?, rate=?,
        total_order_qty=?, delivered_qty=?, balance_qty=?,
        gst_type=?, cgst_pct=?, sgst_pct=?, igst_pct=?,
        advance=?, sub_total=?, gst_amount=?, net_value=?, balance_due=?,
        remarks=?, status=?
       WHERE id=?`,
      [
        p.invoice_date, p.due_date || null, p.ypo_id, p.ypo_item_id, p.po_no || null, p.po_date || null,
        p.supplier, p.supplier_address || '', p.supplier_gstin || '', p.quality || '', p.hsn_code || '',
        p.unit || 'KG', Number(p.rate) || 0,
        Number(p.total_order_qty) || 0, t.delivered_qty, t.balance_qty,
        p.gst_type || 'CGST_SGST', Number(p.cgst_pct) || 0, Number(p.sgst_pct) || 0, Number(p.igst_pct) || 0,
        Number(p.advance) || 0, t.sub_total, t.gst_amount, t.net_value, t.balance_due,
        p.remarks || '', p.status || 'Pending',
        req.params.id,
      ],
    );

    await conn.query(`DELETE FROM yarn_purchase_invoice_bill_items WHERE invoice_id = ?`, [req.params.id]);
    for (const it of t.normItems) {
      await conn.query(
        `INSERT INTO yarn_purchase_invoice_bill_items
          (invoice_id, delivered_qty, no_of_bags, bag_no, lot_no, rate, amount, remarks)
         VALUES (?,?,?,?,?,?,?,?)`,
        [req.params.id, it.delivered_qty, it.no_of_bags, it.bag_no, it.lot_no, it.rate, it.amount, it.remarks],
      );
    }

    await conn.commit();
    const [[saved]] = await pool.query(`SELECT * FROM yarn_purchase_invoice_bills WHERE id = ?`, [req.params.id]);
    res.json(saved);
  } catch (err) {
    await conn.rollback();
    console.error('[yarn-purchase-invoices] update failed:', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: err.sqlMessage || 'Could not update yarn purchase invoice.' });
  } finally {
    conn.release();
  }
});

// ── DELETE /api/yarn-purchase-invoices/:id ──
router.delete('/:id', async (req, res) => {
  try {
    await schemaReady;
    const [result] = await pool.query(`DELETE FROM yarn_purchase_invoice_bills WHERE id = ?`, [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Yarn purchase invoice not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error('[yarn-purchase-invoices] delete failed:', err.code || '', err.sqlMessage || err.message);
    res.status(500).json({ message: 'Could not delete yarn purchase invoice.', detail: err.sqlMessage || err.message });
  }
});

module.exports = router;