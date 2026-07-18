// backend/routes/fabricInvoiceRoutes.js
//
// Mount in server.js with (same pattern as fabricPackingListRoutes.js):
//   const fabricInvoiceRoutes = require('./routes/fabricInvoiceRoutes');
//   app.use('/api/fabric-invoices', fabricInvoiceRoutes);
//
// STATUS FLOW for a row in `fabric_invoices`:
//   created (from-packing-list)  -> status = 'active'
//   DELETE /:id                  -> status = 'cancelled'  (and its PL reopens to 'finalized')
//   POST /:id/complete           -> status = 'completed'  (and its PL becomes 'completed')
//   DELETE /:id/permanent        -> hard delete (only allowed once status = 'cancelled')
//
// ─────────────────────────────────────────────────────────────────────────
// CHANGED (THIS REVISION):
//
//   GET /:id's "live-check the Packing List's company_id" behaviour
//   (added last revision) is now OVERRIDE-AWARE.
//
//   Previously, if the linked Packing List had a company_id set, it
//   ALWAYS won — even if someone had gone into the invoice itself and
//   explicitly picked a *different* company via the "Company (Print
//   Header)" search box in FabricInvoice.tsx. That explicit choice would
//   silently get overwritten the very next time the invoice was opened
//   or printed, which is surprising and easy to lose track of.
//
//   Now: a new `company_id_overridden` column (TINYINT(1), default 0) on
//   `fabric_invoices` tracks whether the invoice's own company_id was an
//   explicit, deliberate pick made on the invoice (1) rather than a
//   value that should keep tracking the Packing List / firm-auto-lookup
//   (0). GET /:id only live-checks the Packing List when
//   company_id_overridden is falsy. If it's truthy, the invoice's own
//   stored company_id is used as-is and the PL is never consulted.
//
//   DB migration needed for this revision:
//     ALTER TABLE fabric_invoices
//       ADD COLUMN company_id_overridden TINYINT(1) NOT NULL DEFAULT 0;
//   (Nullable-safe — existing rows default to 0, i.e. "keep live-syncing
//   with the Packing List", which matches the previous revision's
//   always-live-check behaviour exactly, so this migration is 100%
//   backward compatible with no follow-up data fix needed.)
//
//   How the flag gets set:
//     • POST /from-packing-list/:plId (conversion): always creates the
//       invoice with company_id_overridden = 0 — the initial company_id
//       is just an inherited snapshot from the Packing List, not a
//       deliberate override, so live-sync should apply from day one.
//     • PUT /:id (Edit modal save): company_id_overridden passes straight
//       through from the request body like every other editable field
//       (PUT already spreads the whole body onto `SET ?`). The frontend
//       sets it to `true` when the user picks a company from the search
//       box, and back to `false` when they click "Clear".
//
//   company_id_source returned by GET /:id now reflects one of:
//     "packing_list_live"   → PL has a company_id and this invoice is not
//                              overridden, so the PL's live value was used.
//     "invoice_override"    → this invoice has company_id_overridden = 1,
//                              so its own stored company_id was used as-is.
//     "invoice_snapshot"    → not overridden, but either there's no
//                              linked pl_id or the linked PL has no
//                              company_id — falling back to whatever is
//                              stored directly on the invoice row.
//     "none"                → no company_id resolved from any source;
//                              FabricInvoice.tsx falls back to firm-based
//                              auto-lookup.
//
//   (All previous CHANGED notes — Customer Order lookup fix
//   (order_bookings), invoice number prefix, transactional /complete,
//   permanent delete, /schema-debug, /order-debug/:orderId, company_id
//   inheritance on creation, pl-debug diagnostic, live PL company_id
//   check on GET /:id, removal of the duplicated /search and /:id
//   company-lookup routes (BUG #2) — are preserved below as they were.)

const express = require("express");
const router = express.Router();
const db = require("../db/connection");
const { auth } = require("../middleware/auth");

// Real table (confirmed via CustomerOrder.tsx, which reads/writes
// /api/order-bookings).
const CUSTOMER_ORDERS_TABLE = "order_bookings";

// Candidate column names matching the ACTUAL order_bookings schema (see
// buildOrderPayload / normaliseOrder in CustomerOrder.tsx). Order
// matters: first match wins.
const ORDER_FIELD_CANDIDATES = {
  firm:             ["firm"],
  po_no:            ["po_no"],
  confirm_by:       ["confirm_by"],
  freight_terms:    ["freight"],
  rate_type:        ["rate_type"],
  payment_terms:    ["payment_terms"],
  cgst_percent:     ["cgst_pct"],
  sgst_percent:     ["sgst_pct"],
  igst_percent:     ["igst_pct"],
  // Useful extras carried over from the order, shown for reference /
  // future use even though the invoice doesn't currently have inputs for
  // all of them:
  quality:          ["quality"],
  hsn_code:         ["hsn_code"],
  sort_no:          ["sort_no"],
  basic_value:      ["basic_value"],
  net_value:        ["net_value"],
};

// ⚠ GUESSED candidates used only for the /order-options dropdown label
// (order_code, customer_name) — kept for backward compatibility even
// though the frontend dropdown that used them has been removed.
const ORDER_DISPLAY_CANDIDATES = {
  order_code:    ["order_code"],
  customer_name: ["customer_name"],
};

function pickCol(row, candidates, fallback = undefined) {
  if (!row) return fallback;
  for (const c of candidates) {
    const v = row[c];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return fallback;
}

// order_bookings.items is stored as JSON (array of
// { construction_po, meter, rate, disc_type, disc_pct, disc_value, total_value }).
// It may come back from mysql2 already parsed (JSON column) or as a raw
// string, depending on driver/column type — handle both.
function parseOrderItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "null" || trimmed === "[]") return [];
    try {
      const arr = JSON.parse(trimmed);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Derives order-level "Rate (per M)" and "Total Qty (M)" from the order's
// line items, since order_bookings has no single rate/total_qty column —
// only per-line meter/rate inside `items`.
//   total_qty = sum of every item's meter
//   rate      = basic_value / total_qty (true weighted average across all
//               lines), falling back to the first item's own rate if
//               basic_value/total_qty can't be computed, falling back to 0.
function deriveRateAndQtyFromItems(orderRow) {
  const items = parseOrderItems(orderRow.items);
  const totalQty = items.reduce((sum, it) => sum + (Number(it.meter) || 0), 0);

  let rate = 0;
  const basicValue = Number(orderRow.basic_value) || 0;
  if (totalQty > 0 && basicValue > 0) {
    rate = +(basicValue / totalQty).toFixed(2);
  } else if (items.length && Number(items[0].rate)) {
    rate = Number(items[0].rate);
  }

  return { rate, total_qty: totalQty };
}

// Looks up the Customer Order's (order_bookings row's) commercial fields
// to use as fallback defaults when creating/editing an invoice, or as the
// source of truth when the frontend auto-fetches on the Edit modal /
// "Refresh order data". Returns {} (never throws) if the order can't be
// found — this is purely additive and must never block invoice
// creation or editing.
async function fetchOrderCommercialDefaults(conn, orderId) {
  if (!orderId) return {};
  try {
    const [[orderRow]] = await conn.query(
      `SELECT * FROM ${CUSTOMER_ORDERS_TABLE} WHERE id = ?`,
      [orderId]
    );
    if (!orderRow) {
      console.warn(`[fabric-invoices] Customer Order #${orderId}: no row found in "${CUSTOMER_ORDERS_TABLE}".`);
      return {};
    }

    const out = {};
    const matched = [];
    const missed = [];
    for (const [field, candidates] of Object.entries(ORDER_FIELD_CANDIDATES)) {
      const v = pickCol(orderRow, candidates);
      if (v !== undefined) {
        out[field] = v;
        matched.push(field);
      } else {
        missed.push(field);
      }
    }

    // Derived fields — not simple 1:1 columns, computed from `items`.
    const { rate, total_qty } = deriveRateAndQtyFromItems(orderRow);
    if (total_qty > 0) {
      out.total_qty = total_qty;
      matched.push("total_qty (derived from items)");
    }
    if (rate > 0) {
      out.rate = rate;
      matched.push("rate (derived from items)");
    }

    console.warn(
      `[fabric-invoices] Order #${orderId} defaults — matched: [${matched.join(", ") || "none"}] ` +
      `| unmatched (check column names via /order-debug/${orderId} or /schema-debug): [${missed.join(", ") || "none"}]`
    );
    return out;
  } catch (err) {
    console.warn(
      `[fabric-invoices] Could not load Customer Order #${orderId} commercial defaults ` +
      `(table "${CUSTOMER_ORDERS_TABLE}" or its columns may not match — this is non-fatal):`,
      err.sqlMessage || err.message
    );
    return {};
  }
}

{
  // ── Helpers ────────────────────────────────────────────────────────────
  function currentFY() {
    // Indian FY: Apr–Mar. e.g. July 2026 -> "26-27"
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1; // 1-12
    const startYear = m >= 4 ? y : y - 1;
    const shortStart = String(startYear).slice(-2);
    const shortEnd = String(startYear + 1).slice(-2);
    return `${shortStart}-${shortEnd}`;
  }

  async function nextInvoiceNo(conn, firm) {
    const fy = currentFY();
    const normalizedFirm = (firm || "").trim().toUpperCase();
    const prefix =
      normalizedFirm === "AEF" ? "AEF" :
      normalizedFirm === "AE"  ? "AE"  :
      "AE"; // fallback default if firm is missing/unrecognized

    await conn.query(
      `INSERT INTO fabric_invoice_counters (fy, last_no) VALUES (?, 1)
       ON DUPLICATE KEY UPDATE last_no = last_no + 1`,
      [fy]
    );
    const [[row]] = await conn.query(
      `SELECT last_no FROM fabric_invoice_counters WHERE fy = ?`,
      [fy]
    );
    const seq = String(row.last_no).padStart(3, "0");
    return `${prefix}${seq}/${fy}`;
  }

  // Resolves which firm (AE/AEF) should determine the invoice number
  // prefix: the Customer Order's firm wins if we could look it up,
  // otherwise falls back to the packing list's own firm (old behaviour).
  function resolveInvoiceFirm(orderDefaults, pl) {
    return (orderDefaults && orderDefaults.firm) || pl.firm;
  }

  // ── GET /api/fabric-invoices ─────────────────────────────────────────
  router.get("/", auth, async (req, res) => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM fabric_invoices ORDER BY id DESC`
      );
      res.json(rows);
    } catch (err) {
      console.error("List fabric invoices failed:", err);
      res.status(500).json({ message: "Failed to fetch invoices", sqlMessage: err.sqlMessage });
    }
  });

  // ── GET /api/fabric-invoices/next-no?firm=AE&orderId=123 ────────────
  router.get("/next-no", auth, async (req, res) => {
    try {
      const fy = currentFY();
      let normalizedFirm = String(req.query.firm || "").trim().toUpperCase();

      if (req.query.orderId) {
        const orderDefaults = await fetchOrderCommercialDefaults(db, req.query.orderId);
        if (orderDefaults.firm) {
          normalizedFirm = String(orderDefaults.firm).trim().toUpperCase();
        }
      }

      const prefix =
        normalizedFirm === "AEF" ? "AEF" :
        normalizedFirm === "AE"  ? "AE"  :
        "AE";
      const [[row]] = await db.query(
        `SELECT last_no FROM fabric_invoice_counters WHERE fy = ?`,
        [fy]
      );
      const nextSeq = (row?.last_no || 0) + 1;
      res.json({ invoice_no_preview: `${prefix}${String(nextSeq).padStart(3, "0")}/${fy}` });
    } catch (err) {
      console.error("Preview invoice no failed:", err);
      res.status(500).json({ message: "Failed to preview invoice number", sqlMessage: err.sqlMessage });
    }
  });

  // ── GET /api/fabric-invoices/schema-debug ────────────────────────────
  router.get("/schema-debug", auth, async (req, res) => {
    try {
      const [tables] = await db.query(
        `SELECT TABLE_NAME FROM information_schema.tables
         WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`
      );
      const tableNames = tables.map((t) => t.TABLE_NAME || t.table_name);
      const orderLike = tableNames.filter((n) => /order/i.test(n));

      const details = {};
      for (const name of orderLike) {
        const [cols] = await db.query(
          `SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.columns
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
           ORDER BY ORDINAL_POSITION`,
          [name]
        );
        let rowCount = null;
        try {
          const [[cnt]] = await db.query(`SELECT COUNT(*) AS cnt FROM \`${name}\``);
          rowCount = cnt.cnt;
        } catch {
          // ignore — leave rowCount null if we can't count for some reason
        }
        details[name] = {
          columns: cols.map((c) => `${c.COLUMN_NAME} (${c.DATA_TYPE})`),
          row_count: rowCount,
        };
      }

      res.json({
        current_guess: CUSTOMER_ORDERS_TABLE,
        guess_exists: tableNames.includes(CUSTOMER_ORDERS_TABLE),
        all_tables: tableNames,
        order_like_tables: orderLike,
        order_like_table_details: details,
      });
    } catch (err) {
      console.error("Schema debug failed:", err);
      res.status(500).json({
        message: "Schema debug failed — check DB connection/permissions.",
        sqlMessage: err.sqlMessage || err.message,
      });
    }
  });

  // ── GET /api/fabric-invoices/pl-debug/:plId ──────────────────────────
  router.get("/pl-debug/:plId", auth, async (req, res) => {
    try {
      const [[colCheck]] = await db.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.columns
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fabric_packing_lists'
           AND COLUMN_NAME = 'company_id'`
      );
      const columnExists = colCheck.cnt > 0;

      const [[pl]] = await db.query(
        `SELECT id, pl_no, firm, company_id FROM fabric_packing_lists WHERE id = ?`,
        [req.params.plId]
      );

      let companyRow = null;
      if (pl && pl.company_id) {
        const [[row]] = await db.query(
          `SELECT id, company_name, firm FROM company_details WHERE id = ?`,
          [pl.company_id]
        );
        companyRow = row || null;
      }

      res.json({
        fabric_packing_lists_has_company_id_column: columnExists,
        packing_list: pl || null,
        pl_company_id_value: pl ? (pl.company_id ?? null) : null,
        resolved_company_details_row: companyRow,
        diagnosis: !columnExists
          ? "fabric_packing_lists is missing the company_id column entirely — run: ALTER TABLE fabric_packing_lists ADD COLUMN company_id INT NULL; then re-save the Packing List with its company picked."
          : (!pl)
            ? "No packing list found with that id."
            : (pl.company_id == null)
              ? "Column exists but this Packing List's company_id is NULL — the Packing List's own save/update route isn't persisting it. Check that route's field list."
              : (!companyRow)
                ? "pl.company_id is set but doesn't match any row in company_details — stale/orphaned id."
                : "Looks correct — this Packing List should hand off " + companyRow.company_name + " to its invoice on conversion.",
      });
    } catch (err) {
      console.error("PL debug lookup failed:", err);
      res.status(500).json({ message: "PL debug failed", sqlMessage: err.sqlMessage || err.message });
    }
  });

  // ── GET /api/fabric-invoices/order-options?search=xyz ────────────────
  router.get("/order-options", auth, async (req, res) => {
    try {
      const search = String(req.query.search || "").trim().toLowerCase();
      const [rows] = await db.query(
        `SELECT * FROM ${CUSTOMER_ORDERS_TABLE} ORDER BY id DESC LIMIT 500`
      );
      let options = rows.map((row) => {
        const id = pickCol(row, ["id"], row.id);
        const po_no = pickCol(row, ORDER_FIELD_CANDIDATES.po_no);
        const order_code = pickCol(row, ORDER_DISPLAY_CANDIDATES.order_code);
        const firm = pickCol(row, ORDER_FIELD_CANDIDATES.firm);
        const customer_name = pickCol(row, ORDER_DISPLAY_CANDIDATES.customer_name);
        return { id, po_no, order_code, firm, customer_name };
      }).filter((o) => o.id !== undefined && o.id !== null);

      if (search) {
        options = options.filter((o) =>
          String(o.po_no || "").toLowerCase().includes(search) ||
          String(o.order_code || "").toLowerCase().includes(search) ||
          String(o.customer_name || "").toLowerCase().includes(search)
        );
      }

      res.json({ options, error: null, raw_row_count: rows.length, table: CUSTOMER_ORDERS_TABLE });
    } catch (err) {
      console.warn(
        `[fabric-invoices] Could not list Customer Orders ` +
        `(table "${CUSTOMER_ORDERS_TABLE}" may not match):`,
        err.sqlMessage || err.message
      );
      res.json({ options: [], error: err.sqlMessage || err.message, raw_row_count: 0, table: CUSTOMER_ORDERS_TABLE });
    }
  });

  // ── GET /api/fabric-invoices/order-defaults/:orderId ────────────────
  router.get("/order-defaults/:orderId", auth, async (req, res) => {
    try {
      const defaults = await fetchOrderCommercialDefaults(db, req.params.orderId);
      res.json(defaults);
    } catch (err) {
      console.error("Fetch order commercial defaults failed:", err);
      res.status(500).json({ message: "Failed to fetch order defaults", sqlMessage: err.sqlMessage });
    }
  });

  // ── GET /api/fabric-invoices/order-debug/:orderId ────────────────────
  router.get("/order-debug/:orderId", auth, async (req, res) => {
    try {
      const [[orderRow]] = await db.query(
        `SELECT * FROM ${CUSTOMER_ORDERS_TABLE} WHERE id = ?`,
        [req.params.orderId]
      );
      const matched_defaults = await fetchOrderCommercialDefaults(db, req.params.orderId);
      res.json({
        table: CUSTOMER_ORDERS_TABLE,
        order_id: req.params.orderId,
        found: !!orderRow,
        columns_found: orderRow ? Object.keys(orderRow) : [],
        raw_row: orderRow || null,
        parsed_items: orderRow ? parseOrderItems(orderRow.items) : [],
        matched_defaults,
      });
    } catch (err) {
      console.error("Order debug lookup failed:", err);
      res.status(500).json({
        message: "Failed to load debug info — table name is probably wrong.",
        table_tried: CUSTOMER_ORDERS_TABLE,
        sqlMessage: err.sqlMessage || err.message,
      });
    }
  });

  // ── GET /api/fabric-invoices/:id ─────────────────────────────────────
  // NOTE: this MUST stay the only "/:id" GET route in this router.
  //
  // *** CHANGED (THIS REVISION) ***
  // Company (Print Header) resolution on GET /:id is now OVERRIDE-AWARE:
  //   - If invoice.company_id_overridden is truthy, the invoice's own
  //     stored company_id is authoritative and the Packing List is never
  //     consulted (company_id_source = "invoice_override"). This is what
  //     lets someone deliberately pick a different company directly on
  //     the invoice, via FabricInvoice.tsx's Company (Print Header)
  //     search box, and have it stick.
  //   - Otherwise (not overridden — the normal/default case, including
  //     every invoice created before this column existed), behaviour is
  //     unchanged from the previous revision: if this invoice has a
  //     linked pl_id, and that Packing List currently has a company_id
  //     set, the PL's LIVE company_id always wins
  //     (company_id_source = "packing_list_live"). This is what makes
  //     the invoice's header automatically follow the Packing List's
  //     company if it's changed there after conversion.
  //   - If neither an override nor a live PL value is available, falls
  //     back to whatever company_id is already stored directly on the
  //     invoice row (company_id_source = "invoice_snapshot").
  //   - If nothing resolves at all, company_id stays null
  //     (company_id_source = "none") and FabricInvoice.tsx's
  //     resolveCompanyInfoForInvoice() falls back to firm-based
  //     auto-lookup exactly as before.
  router.get("/:id", auth, async (req, res) => {
    try {
      const [[invoice]] = await db.query(
        `SELECT * FROM fabric_invoices WHERE id = ?`,
        [req.params.id]
      );
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });

      let resolvedCompanyId = invoice.company_id ?? null;
      let companySource = invoice.company_id != null ? "invoice_snapshot" : "none";
      const isOverridden = !!invoice.company_id_overridden;

      if (isOverridden) {
        // Explicit pick made directly on this invoice — never let the
        // Packing List silently replace it.
        companySource = invoice.company_id != null ? "invoice_override" : "none";
      } else if (invoice.pl_id) {
        const [[pl]] = await db.query(
          `SELECT company_id FROM fabric_packing_lists WHERE id = ?`,
          [invoice.pl_id]
        );
        if (pl && pl.company_id != null) {
          if (pl.company_id !== invoice.company_id) {
            console.info(
              `[fabric-invoices] Invoice #${invoice.id} (${invoice.invoice_no}): ` +
              `live-checked PL #${invoice.pl_id} company_id=${pl.company_id}, ` +
              `differs from invoice's stored company_id=${invoice.company_id ?? "null"} — using the PL's current value.`
            );
          }
          resolvedCompanyId = pl.company_id;
          companySource = "packing_list_live";
        }
      }

      const [items] = await db.query(
        `SELECT * FROM fabric_invoice_items WHERE invoice_id = ? ORDER BY s_no ASC`,
        [req.params.id]
      );
      res.json({
        ...invoice,
        company_id: resolvedCompanyId,
        company_id_overridden: isOverridden,
        company_id_source: companySource,
        items,
      });
    } catch (err) {
      console.error("Get fabric invoice failed:", err);
      res.status(500).json({ message: "Failed to fetch invoice", sqlMessage: err.sqlMessage });
    }
  });

  // ── POST /api/fabric-invoices/from-packing-list/:plId ───────────────
  router.post("/from-packing-list/:plId", auth, async (req, res) => {
    const plId = req.params.plId;
    const body = req.body || {};
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [[pl]] = await conn.query(
        `SELECT * FROM fabric_packing_lists WHERE id = ? FOR UPDATE`,
        [plId]
      );
      if (!pl) {
        await conn.rollback();
        return res.status(404).json({ message: "Packing list not found" });
      }
      if (pl.status === "invoiced" || pl.status === "completed") {
        await conn.rollback();
        return res.status(409).json({
          message: `${pl.pl_no} has already been converted (Invoice ${pl.invoice_no}).`,
        });
      }

      const [items] = await conn.query(
        `SELECT * FROM fabric_packing_list_items WHERE pl_id = ?`,
        [plId]
      );
      if (!items.length) {
        await conn.rollback();
        return res.status(400).json({ message: "This packing list has no pieces to invoice." });
      }

      const orderDefaults = await fetchOrderCommercialDefaults(conn, pl.order_id);

      const invoiceFirm = resolveInvoiceFirm(orderDefaults, pl);
      const invoiceNo = await nextInvoiceNo(conn, invoiceFirm);

      const rate = Number(
        body.rate != null ? body.rate : (orderDefaults.rate != null ? orderDefaults.rate : 0)
      ) || 0;
      const totalQty = Number(
        body.total_qty != null ? body.total_qty
          : (pl.total_meter != null ? pl.total_meter
            : (orderDefaults.total_qty != null ? orderDefaults.total_qty : 0))
      ) || 0;
      const basicValue = body.basic_value != null ? Number(body.basic_value) : rate * totalQty;
      const discountPercent = Number(body.discount_percent != null ? body.discount_percent : 0) || 0;
      const discountAmount = +(basicValue * discountPercent / 100).toFixed(2);
      const subTotal = +(basicValue - discountAmount).toFixed(2);

      const isInterState = (body.igst_percent != null && Number(body.igst_percent) > 0)
        || (pl.billing_state && body.company_state && pl.billing_state !== body.company_state);

      const cgstPercent = isInterState ? 0 : Number(
        body.cgst_percent != null ? body.cgst_percent
          : (orderDefaults.cgst_percent != null ? orderDefaults.cgst_percent : 2.5)
      );
      const sgstPercent = isInterState ? 0 : Number(
        body.sgst_percent != null ? body.sgst_percent
          : (orderDefaults.sgst_percent != null ? orderDefaults.sgst_percent : 2.5)
      );
      const igstPercent = isInterState ? Number(
        body.igst_percent != null ? body.igst_percent
          : (orderDefaults.igst_percent != null ? orderDefaults.igst_percent : 5)
      ) : 0;

      const cgstAmount = +(subTotal * cgstPercent / 100).toFixed(2);
      const sgstAmount = +(subTotal * sgstPercent / 100).toFixed(2);
      const igstAmount = +(subTotal * igstPercent / 100).toFixed(2);
      const tcsPercent = Number(body.tcs_percent != null ? body.tcs_percent : 0) || 0;
      const tcsAmount = +(subTotal * tcsPercent / 100).toFixed(2);

      const rawTotal = subTotal + cgstAmount + sgstAmount + igstAmount + tcsAmount;
      const roundedTotal = Math.round(rawTotal);
      const roundOff = +(roundedTotal - rawTotal).toFixed(2);

      // Inherit the Packing List's explicitly-picked print-header company
      // (if any) as the initial value at creation time. This is always a
      // non-overridden snapshot (company_id_overridden = 0) — GET /:id
      // above live-checks the PL on every fetch as long as it stays
      // non-overridden, so this initial value is superseded automatically
      // if the PL's company is ever changed later. It only becomes
      // "sticky" if someone explicitly re-picks a company directly on the
      // invoice afterwards (via the Edit modal), which sets
      // company_id_overridden = 1 on save.
      const inheritedCompanyId = body.company_id != null ? body.company_id : (pl.company_id || null);
      console.info(
        `[fabric-invoices] Converting ${pl.pl_no} (id ${pl.id}) -> ${invoiceNo}: ` +
        `pl.company_id=${pl.company_id ?? "null/undefined"} -> invoice company_id=${inheritedCompanyId} ` +
        `(company_id_overridden=0, will live-sync with PL going forward)` +
        (pl.company_id === undefined ? " (⚠ 'company_id' key was not present on the packing-list row at all — check the column exists via GET /pl-debug/" + pl.id + ")" : "")
      );

      const invoiceRow = {
        invoice_no: invoiceNo,
        invoice_date: body.invoice_date || new Date().toISOString().slice(0, 10),
        pl_id: pl.id,
        pl_no: pl.pl_no,
        pl_date: pl.pl_date,
        order_id: pl.order_id,
        order_code: pl.order_code,
        sort_no: pl.sort_no,
        quality: pl.quality,
        company_id: inheritedCompanyId,
        company_id_overridden: 0,
        po_no: body.po_no || orderDefaults.po_no || null,
        confirm_by: body.confirm_by || orderDefaults.confirm_by || null,
        rate_type: body.rate_type || orderDefaults.rate_type || "EX-MILL",
        freight_terms: body.freight_terms || orderDefaults.freight_terms || "To Pay",
        e_way_no: body.e_way_no || null,
        customer_id: pl.customer_id,
        customer_name: pl.customer_name,
        billing_address: pl.billing_address,
        billing_pincode: pl.billing_pincode,
        billing_state: pl.billing_state,
        billing_country: pl.billing_country,
        billing_gst: pl.billing_gst,
        consignee_name: pl.delivery_name || pl.customer_name,
        consignee_address: pl.delivery_address,
        consignee_pincode: pl.delivery_pincode,
        consignee_state: pl.delivery_state,
        consignee_country: pl.delivery_country,
        consignee_gst: pl.delivery_gst,
        transport_name: pl.transport_name,
        vehicle_no: pl.vehicle_no,
        lr_no: body.lr_no || null,
        lr_date: body.lr_date || null,
        trans_mode: body.trans_mode || "Road",
        firm: invoiceFirm,
        total_rolls: items.length,
        total_qty: totalQty,
        gross_wt: pl.total_gross_wt || 0,
        net_wt: pl.total_net_wt || 0,
        rate,
        basic_value: basicValue,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        sub_total: subTotal,
        cgst_percent: cgstPercent,
        cgst_amount: cgstAmount,
        sgst_percent: sgstPercent,
        sgst_amount: sgstAmount,
        igst_percent: igstPercent,
        igst_amount: igstAmount,
        tcs_percent: tcsPercent,
        tcs_amount: tcsAmount,
        round_off: roundOff,
        grand_total: roundedTotal,
        payment_terms: body.payment_terms || orderDefaults.payment_terms || "60 DAYS PAYMENT",
        bank_name: body.bank_name || null,
        bank_branch: body.bank_branch || null,
        bank_account_no: body.bank_account_no || null,
        ifsc_code: body.ifsc_code || null,
        bank_agent: body.bank_agent || null,
        irn: body.irn || null,
        ack_no: body.ack_no || null,
        ack_date: body.ack_date || null,
        policy_no: body.policy_no || null,
        prepared_by: body.prepared_by || pl.prepared_by || null,
        checked_by: body.checked_by || null,
        authorised_by: body.authorised_by || null,
        status: "active",
      };

      const [insertResult] = await conn.query(`INSERT INTO fabric_invoices SET ?`, [invoiceRow]);
      const invoiceId = insertResult.insertId;

      await conn.query(
        `INSERT INTO fabric_invoice_items
          (invoice_id, s_no, description, hsn_code, no_of_rolls, qty, rate, basic_value)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
        [invoiceId, pl.quality || "", body.hsn_code || orderDefaults.hsn_code || "", items.length, totalQty, rate, basicValue]
      );

      await conn.query(
        `UPDATE fabric_packing_lists
         SET status = 'invoiced', invoice_no = ?, invoice_id = ?
         WHERE id = ?`,
        [invoiceNo, invoiceId, pl.id]
      );

      await conn.commit();
      res.json({ id: invoiceId, invoice_no: invoiceNo });
    } catch (err) {
      await conn.rollback();
      console.error("Convert packing list to invoice failed:", err);
      res.status(500).json({ message: "Failed to convert to invoice", sqlMessage: err.sqlMessage });
    } finally {
      conn.release();
    }
  });

  // ── PUT /api/fabric-invoices/:id ─────────────────────────────────────
  // company_id_overridden flows through here like any other editable
  // field, since `updatable` is whatever's left of the body after
  // stripping the read-only/derived keys below. The frontend sends
  // `company_id_overridden: true` when the user explicitly picks a
  // company on the invoice, and `false` (with company_id: null) when
  // they click "Clear" — see FabricInvoice.tsx's handlePickCompany /
  // handleClearCompany.
  router.put("/:id", auth, async (req, res) => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const body = req.body || {};
      const { items, id, invoice_no, pl_id, pl_no, created_at, updated_at, company_id_source, ...updatable } = body;

      await conn.query(`UPDATE fabric_invoices SET ? WHERE id = ?`, [updatable, req.params.id]);

      if (Array.isArray(items)) {
        await conn.query(`DELETE FROM fabric_invoice_items WHERE invoice_id = ?`, [req.params.id]);
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          await conn.query(
            `INSERT INTO fabric_invoice_items
              (invoice_id, s_no, description, hsn_code, no_of_rolls, qty, rate, basic_value)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.params.id, i + 1, it.description || "", it.hsn_code || "",
             it.no_of_rolls || 0, it.qty || 0, it.rate || 0, it.basic_value || 0]
          );
        }
      }

      await conn.commit();
      res.json({ id: req.params.id });
    } catch (err) {
      await conn.rollback();
      console.error("Update fabric invoice failed:", err);
      res.status(500).json({ message: "Failed to update invoice", sqlMessage: err.sqlMessage });
    } finally {
      conn.release();
    }
  });

  // ── DELETE /api/fabric-invoices/:id ──────────────────────────────────
  router.delete("/:id", auth, async (req, res) => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[inv]] = await conn.query(`SELECT * FROM fabric_invoices WHERE id = ?`, [req.params.id]);
      if (!inv) {
        await conn.rollback();
        return res.status(404).json({ message: "Invoice not found" });
      }
      if (inv.status === "completed") {
        await conn.rollback();
        return res.status(409).json({
          message: `${inv.invoice_no} is already marked Completed and can't be cancelled.`,
        });
      }

      await conn.query(`UPDATE fabric_invoices SET status = 'cancelled' WHERE id = ?`, [req.params.id]);
      await conn.query(
        `UPDATE fabric_packing_lists SET status = 'finalized', invoice_no = NULL, invoice_id = NULL WHERE id = ?`,
        [inv.pl_id]
      );

      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      await conn.rollback();
      console.error("Cancel fabric invoice failed:", err);
      res.status(500).json({ message: "Failed to cancel invoice", sqlMessage: err.sqlMessage });
    } finally {
      conn.release();
    }
  });

  // ── POST /api/fabric-invoices/:id/complete ───────────────────────────
  router.post("/:id/complete", auth, async (req, res) => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [[inv]] = await conn.query(`SELECT * FROM fabric_invoices WHERE id = ? FOR UPDATE`, [req.params.id]);
      if (!inv) {
        await conn.rollback();
        return res.status(404).json({ message: "Invoice not found" });
      }

      if (inv.status === "cancelled") {
        await conn.rollback();
        return res.status(409).json({
          message: `${inv.invoice_no} is cancelled and can't be marked completed.`,
        });
      }

      await conn.query(`UPDATE fabric_invoices SET status = 'completed' WHERE id = ?`, [req.params.id]);
      await conn.query(`UPDATE fabric_packing_lists SET status = 'completed' WHERE id = ?`, [inv.pl_id]);

      await conn.commit();
      res.json({ success: true, invoice_no: inv.invoice_no, pl_no: inv.pl_no });
    } catch (err) {
      await conn.rollback();
      console.error("Complete invoice failed:", err);
      res.status(500).json({ message: "Failed to mark invoice completed", sqlMessage: err.sqlMessage });
    } finally {
      conn.release();
    }
  });

  // ── DELETE /api/fabric-invoices/:id/permanent ────────────────────────
  router.delete("/:id/permanent", auth, async (req, res) => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [[inv]] = await conn.query(`SELECT * FROM fabric_invoices WHERE id = ? FOR UPDATE`, [req.params.id]);
      if (!inv) {
        await conn.rollback();
        return res.status(404).json({ message: "Invoice not found" });
      }
      if (inv.status !== "cancelled") {
        await conn.rollback();
        return res.status(409).json({
          message: `${inv.invoice_no} must be cancelled before it can be permanently deleted.`,
        });
      }

      await conn.query(
        `UPDATE fabric_packing_lists SET invoice_no = NULL, invoice_id = NULL WHERE invoice_id = ?`,
        [inv.id]
      );

      await conn.query(`DELETE FROM fabric_invoice_items WHERE invoice_id = ?`, [req.params.id]);
      await conn.query(`DELETE FROM fabric_invoices WHERE id = ?`, [req.params.id]);

      await conn.commit();
      res.json({ success: true, invoice_no: inv.invoice_no });
    } catch (err) {
      await conn.rollback();
      console.error("Permanent delete fabric invoice failed:", err);
      res.status(500).json({ message: "Failed to delete invoice", sqlMessage: err.sqlMessage });
    } finally {
      conn.release();
    }
  });
}

module.exports = router;