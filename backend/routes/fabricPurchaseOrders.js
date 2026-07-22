// backend/routes/fabric-purchase-orders.js
//
// FIX (THIS REVISION — debug route 500 error, "planLine1Expr is not
// defined"-class crash):
//   The previous revision's Step 5 of GET /pending-purchase/debug/:rec_no
//   referenced planLine1Expr / planDistExpr / planStateExpr / planPinExpr /
//   planCountryExpr / planContactExpr / planGstinExpr inside its
//   coalesceSelect() calls, but those variables were only ever BUILT in
//   the main /pending-purchase route handler — the debug route only had
//   the raw column NAMES (planDelLine1Col etc.) destructured from
//   resolveCustomerShipToColumns(), never the "p.<col>" SQL expression
//   strings built from them. That made every call to the debug route
//   throw a ReferenceError → 500, which is exactly the failure you saw in
//   the browser console. Fixed by building those *Expr variables locally
//   in Step 5 (mirroring the main route exactly) BEFORE they're used, and
//   by actually including them as the top-priority candidate in each
//   coalesceSelect() call so the debug route's `resolved_*` fields match
//   what the real /pending-purchase route computes.
//
// FIX (earlier revision — "Shipping To" root cause #7 — COALESCE doesn't
// skip empty strings):
//   coalesceSelect() previously did:
//     COALESCE(candidate1, candidate2, candidate3)
//   MySQL's COALESCE only treats a candidate as "absent" when it's a true
//   SQL NULL — an empty string '' still counts as "the value" and wins.
//   A blank plan-level delivery column (e.g. production_plans' own
//   delivery_address_line1 = '' for a given plan) was therefore silently
//   shadowing a fully populated customers.address for the same plan —
//   which is why the debug route (which — before the ReferenceError bug
//   above — only ever checked the addr/customers columns, never the
//   plan-level one) could find a real address while the main route
//   returned blank. Fixed by wrapping every candidate in
//   NULLIF(TRIM(<expr>), '') before it enters COALESCE, so blank/
//   whitespace-only values are normalised to NULL and COALESCE correctly
//   falls through to the next real source. Lives in coalesceSelect()
//   below and is shared by both routes.
//
// ─────────────────────────────────────────────────────────────────────────────
// EARLIER FIX ("Shipping To" root cause #6 — stop fighting the
// customer/orders join, use the address the Production Plan ALREADY has):
//   resolveCustomerShipToColumns() also introspects production_plans for
//   its own delivery-address columns (resolvePlanDeliveryColumns() below
//   — wide candidate-name list, same pattern used everywhere else in this
//   file). Whenever any of those columns exist, they become the PRIMARY
//   source for Shipping To — simplest possible path, no join required.
//   The entire customer/orders/address-table join chain is kept as a
//   secondary fallback (via COALESCE) for any plan where the plan-level
//   columns happen to be empty.
//
// EARLIER FIX (root cause #5 — orphaned FK bug): a non-NULL, non-zero
//   p.customer_id does NOT mean it points at a customer that still
//   exists. It's now validated with a correlated subquery before being
//   allowed into the COALESCE for customer id resolution; otherwise it
//   evaluates to NULL and COALESCE moves on to the order-linked customer
//   id instead. Lives in buildCustomerJoinSql() below.
//
// EARLIER FIX (root cause #4 — the join-type bug): the ORDERS-side column
//   picker is restricted to the SAME category as production_plans' own
//   order-link column (id-shaped vs business-code-shaped), and the join
//   condition normalises both sides with TRIM(CAST(... AS CHAR)) instead
//   of a bare `=`.
//
// EARLIER FIX (root cause #3): resolveCustomerShipToColumns() introspects
//   an orders table and, when production_plans has an order-number-shaped
//   column, resolves the customer id/name from THAT table too, via
//   COALESCE at the JOIN CONDITION itself.
//
// PERSISTENCE FIX (earlier revision): ship_from, company_id, due_date,
//   place_of_supply, advance, and description are included in the
//   CREATE/UPDATE/GET-all statements. Required one-time migration
//   (MySQL 8+):
//
//     ALTER TABLE fabric_purchase_orders
//       ADD COLUMN IF NOT EXISTS ship_from        VARCHAR(255) NULL,
//       ADD COLUMN IF NOT EXISTS due_date         DATE         NULL,
//       ADD COLUMN IF NOT EXISTS place_of_supply  VARCHAR(255) NULL,
//       ADD COLUMN IF NOT EXISTS advance          DECIMAL(12,2) NULL DEFAULT 0,
//       ADD COLUMN IF NOT EXISTS description      TEXT         NULL,
//       ADD COLUMN IF NOT EXISTS company_id       INT          NULL;
//
// DELETE 500 FIX (earlier revision): FK-violation on delete of an
//   already-invoiced FPO now returns a clear 409 instead of a raw 500.

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { auth } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — introspect production_plans columns once at startup
// ─────────────────────────────────────────────────────────────────────────────
let _planCols = null;
const getPlanColumns = async () => {
  if (_planCols) return _planCols;
  const [rows] = await db.query('DESCRIBE production_plans');
  _planCols = new Set(rows.map(r => r.Field));
  return _planCols;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — introspect fabric_purchase_orders columns once at startup.
// Used so this route degrades gracefully (instead of throwing "unknown
// column") if the migration above hasn't been run yet in a given
// environment — the new fields are simply omitted from the query rather
// than crashing the whole save.
// ─────────────────────────────────────────────────────────────────────────────
let _fpoCols = null;
const getFpoColumns = async () => {
  if (_fpoCols) return _fpoCols;
  const [rows] = await db.query('DESCRIBE fabric_purchase_orders');
  _fpoCols = new Set(rows.map(r => r.Field));
  return _fpoCols;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — shared FPO number generator
// Format: FPO-YYYY-001  (3-digit zero-padded, resets each year)
// ─────────────────────────────────────────────────────────────────────────────
const generateNextFpoNo = async () => {
  const year   = new Date().getFullYear();
  const prefix = `FPO-${year}-`;

  const [rows] = await db.query(
    `SELECT fpo_no
     FROM fabric_purchase_orders
     WHERE fpo_no LIKE ?
     ORDER BY id DESC
     LIMIT 1`,
    [`${prefix}%`]
  );

  let nextSeq = 1;
  if (rows.length > 0) {
    const lastSeqStr = rows[0].fpo_no.split('-').pop();
    const lastSeq    = parseInt(lastSeqStr, 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — fiscal year string for the counter table, e.g. "25-26"
// Indian FY: April 1 → March 31. This is the ONLY place the format is
// generated — change it here if you want e.g. "2025-26" instead.
// ─────────────────────────────────────────────────────────────────────────────
const getFiscalYear = (d = new Date()) => {
  const y = d.getFullYear();
  const startYear   = d.getMonth() >= 3 ? y : y - 1; // month 3 = April (0-indexed)
  const shortStart  = String(startYear).slice(-2);
  const shortEnd    = String(startYear + 1).slice(-2);
  return `${shortStart}-${shortEnd}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — next internal reference number, e.g. "PINV/25-26/001"
// Reads/increments fabric_purchase_invoice_counters (one row per FY) inside
// the caller's transaction so the increment is atomic and rolls back with
// everything else if the conversion fails.
// ─────────────────────────────────────────────────────────────────────────────
const generateNextInternalRefNo = async (conn) => {
  const fy = getFiscalYear();

  // Ensure a counter row exists for this FY.
  await conn.query(
    `INSERT INTO fabric_purchase_invoice_counters (fy, last_no)
     VALUES (?, 0)
     ON DUPLICATE KEY UPDATE fy = fy`,
    [fy]
  );

  // Lock the row for this transaction, then increment.
  const [[row]] = await conn.query(
    `SELECT last_no FROM fabric_purchase_invoice_counters WHERE fy = ? FOR UPDATE`,
    [fy]
  );
  const nextNo = (row?.last_no || 0) + 1;
  await conn.query(
    `UPDATE fabric_purchase_invoice_counters SET last_no = ? WHERE fy = ?`,
    [nextNo, fy]
  );

  return `PINV/${fy}/${String(nextNo).padStart(3, '0')}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fabric-purchase-orders/pending-purchase
// Returns production_plans that have purchase_qty > 0 and no FPO linked yet,
// enriched with the linked customer's shipping address + GSTIN for the
// "Shipping To" autofill on the frontend.
// ─────────────────────────────────────────────────────────────────────────────

// Introspect `customers` — always expected to exist.
let _custCols = null;
const getCustomerColumns = async () => {
  if (_custCols) return _custCols;
  const [rows] = await db.query('DESCRIBE customers');
  _custCols = new Set(rows.map(r => r.Field));
  return _custCols;
};

// Introspect the dedicated shipping-address table, if it exists. Wrapped in
// try/catch — some schemas keep address fields directly on `customers`
// instead of a child table, in which case this table simply doesn't exist
// and we fall back gracefully (see useAddrTable below).
let _custAddrCols = null;
const getCustomerAddressColumns = async () => {
  if (_custAddrCols) return _custAddrCols;
  try {
    const [rows] = await db.query('DESCRIBE customer_delivery_addresses');
    _custAddrCols = new Set(rows.map(r => r.Field));
  } catch (err) {
    console.warn('[pending-purchase] customer_delivery_addresses table not found (or not accessible) — will fall back to columns on customers. Detail:', err.message);
    _custAddrCols = new Set();
  }
  return _custAddrCols;
};

// Introspect the dedicated GST-numbers table, if it exists. Same graceful
// fallback pattern as the address table above.
let _custGstCols = null;
const getCustomerGstColumns = async () => {
  if (_custGstCols) return _custGstCols;
  try {
    const [rows] = await db.query('DESCRIBE customer_gst_numbers');
    _custGstCols = new Set(rows.map(r => r.Field));
  } catch (err) {
    console.warn('[pending-purchase] customer_gst_numbers table not found (or not accessible) — will fall back to a gst column on customers. Detail:', err.message);
    _custGstCols = new Set();
  }
  return _custGstCols;
};

// ─────────────────────────────────────────────────────────────────────────────
// Introspect an "orders" table, if one exists, so the customer can be
// resolved via the plan's LINKED ORDER (production_plans.order_no →
// orders.<link col> → orders.customer_id/customer_name) rather than only
// via a customer_id/customer_name column that may not actually be
// populated directly on production_plans itself.
//
// Tries each candidate table name in turn (DESCRIBE will throw for any
// that don't exist) and uses the first one found. Adjust
// ORDERS_TABLE_CANDIDATES if your schema names this table something else
// — the console warning below will tell you if none of these matched.
// ─────────────────────────────────────────────────────────────────────────────
const ORDERS_TABLE_CANDIDATES = ['order_bookings', 'orders', 'customer_orders', 'order_master', 'sales_orders'];
let _ordersTableName = null;
let _ordersCols      = null;
let _ordersResolved  = false;
const getOrdersTableColumns = async () => {
  if (_ordersResolved) return { tableName: _ordersTableName, cols: _ordersCols };
  for (const candidate of ORDERS_TABLE_CANDIDATES) {
    try {
      const [rows] = await db.query(`DESCRIBE ${candidate}`);
      _ordersTableName = candidate;
      _ordersCols       = new Set(rows.map(r => r.Field));
      _ordersResolved    = true;
      console.log(`[pending-purchase] orders table resolved as "${candidate}" — columns:`, [..._ordersCols]);
      return { tableName: _ordersTableName, cols: _ordersCols };
    } catch (err) {
      // not this one — try the next candidate
    }
  }
  console.warn(
    `[pending-purchase] Could not find an orders table among candidates [${ORDERS_TABLE_CANDIDATES.join(', ')}] — ` +
    `order-mediated customer resolution will be unavailable. If your plans link to their customer via an Order ` +
    `(as opposed to production_plans.customer_id/customer_name being populated directly), Shipping To will stay ` +
    `blank for those plans until the real table name is added to ORDERS_TABLE_CANDIDATES.`
  );
  _ordersTableName = null;
  _ordersCols       = new Set();
  _ordersResolved    = true;
  return { tableName: null, cols: _ordersCols };
};

// Returns the first candidate name present in colsSet, or null if none
// match — the same "candidate-list column matching" pattern used
// throughout this codebase (Supplier/Company/HSN normalisation on the
// frontend, getHsnTableName() elsewhere on the backend, etc.).
const pickColumn = (colsSet, candidates) => candidates.find(c => colsSet.has(c)) || null;

// ─────────────────────────────────────────────────────────────────────────────
// resolve production_plans' OWN delivery-address columns, if it has any.
// This is the same address shown, read-only, in the "Delivery Address
// (from order)" box on the Edit Production Plan screen — populated
// directly on the plan row at Order-select time, rather than recomputed
// live via a join. When present, these are used as the PRIMARY source for
// Shipping To (see buildAddressExprs() below), with the customer/orders
// join chain kept only as a fallback.
//
// Adjust these candidate lists if your production_plans schema uses
// different column names — the startup log prints exactly which
// candidate (if any) matched for each field.
// ─────────────────────────────────────────────────────────────────────────────
const resolvePlanDeliveryColumns = (planCols) => {
  const planDelNameCol    = pickColumn(planCols, [
    'delivery_customer_name', 'ship_customer_name', 'delivery_name', 'ship_to_name',
  ]);
  const planDelLine1Col    = pickColumn(planCols, [
    'delivery_address_line1', 'delivery_address_line_1', 'delivery_address',
    'order_delivery_address', 'ship_address_line1', 'ship_address_line_1',
    'shipping_address_line1', 'shipping_address', 'delivery_addr', 'ship_to_address',
  ]);
  const planDelDistCol     = pickColumn(planCols, [
    'delivery_district', 'delivery_city', 'delivery_town', 'ship_district', 'ship_city',
    'delivery_taluk',
  ]);
  const planDelStateCol    = pickColumn(planCols, [
    'delivery_state', 'ship_state', 'delivery_state_name',
  ]);
  const planDelPinCol      = pickColumn(planCols, [
    'delivery_pincode', 'delivery_pin', 'delivery_pin_code', 'ship_pincode', 'ship_pin',
    'delivery_zip', 'delivery_zip_code',
  ]);
  const planDelCountryCol  = pickColumn(planCols, [
    'delivery_country', 'ship_country', 'delivery_country_name',
  ]);
  const planDelContactCol  = pickColumn(planCols, [
    'delivery_contact_no', 'delivery_phone', 'delivery_mobile', 'ship_contact_no', 'ship_phone',
  ]);
  const planDelGstinCol    = pickColumn(planCols, [
    'delivery_gstin', 'ship_gstin', 'delivery_gst_no',
  ]);

  const usePlanDeliveryCols = Boolean(
    planDelLine1Col || planDelDistCol || planDelStateCol || planDelPinCol || planDelCountryCol
  );

  return {
    planDelNameCol, planDelLine1Col, planDelDistCol, planDelStateCol,
    planDelPinCol, planDelCountryCol, planDelContactCol, planDelGstinCol,
    usePlanDeliveryCols,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED — resolve every column the pending-purchase / debug routes need.
// Extracted so BOTH routes call this one function instead of maintaining
// two copies of the same resolution logic.
// ─────────────────────────────────────────────────────────────────────────────
const resolveCustomerShipToColumns = async () => {
  const planCols   = await getPlanColumns();
  const custCols   = await getCustomerColumns();
  const addrCols   = await getCustomerAddressColumns();
  const gstCols    = await getCustomerGstColumns();
  const { tableName: ordersTable, cols: ordersCols } = await getOrdersTableColumns();

  // ── root cause #6 — plan's own delivery-address columns (primary source) ──
  const planDelivery = resolvePlanDeliveryColumns(planCols);

  const custIdCol   = pickColumn(custCols, ['id', 'customer_id']);
  const custNameCol = pickColumn(custCols, ['customer_name', 'name']);

  // Direct FK/name that MAY be stamped on production_plans itself.
  const planCustIdCol = pickColumn(planCols, ['customer_id', 'cust_id', 'customerId']);

  // The plan's link to its Order. Distinguish an ID-shaped reference
  // (order_id — a numeric FK into orders.id) from a business-CODE
  // reference (order_no / order_ref / order_number — a string like
  // "ORD-005") so the orders-side column picked below is NEVER of the
  // opposite kind.
  const planOrderNoCol     = pickColumn(planCols, ['order_id', 'order_no', 'order_ref', 'order_number']);
  const planOrderColIsIdRef = planOrderNoCol === 'order_id';

  // Orders-side link column — restricted to the SAME category as
  // planOrderNoCol. A business-code plan column must only ever be
  // compared against another business-code column on `orders`; an
  // id-shaped plan column must only ever be compared against
  // `orders.id`. Mixing the two (the old bug) produces a join that can
  // never match.
  const ordersLinkCol = planOrderColIsIdRef
    ? pickColumn(ordersCols, ['id'])
    : pickColumn(ordersCols, ['order_no', 'order_number', 'order_ref', 'order_code']);

  const orderCustIdCol   = pickColumn(ordersCols, ['customer_id', 'cust_id', 'customerId']);
  const orderCustNameCol = pickColumn(ordersCols, ['customer_name', 'name', 'customerName']);
  const useOrdersJoin = Boolean(ordersTable && planOrderNoCol && ordersLinkCol && (orderCustIdCol || orderCustNameCol));

  // Work out which path(s) are usable so the join builder and the debug
  // route can both report exactly what's happening.
  const hasDirectIdPath  = Boolean(planCustIdCol && custIdCol);
  const hasOrderIdPath   = Boolean(useOrdersJoin && orderCustIdCol && custIdCol);
  const hasDirectNamePath = Boolean(custIdCol && custNameCol); // via p.customer_name
  const hasOrderNamePath  = Boolean(useOrdersJoin && orderCustNameCol && custNameCol);

  let joinMode = 'none';
  if (hasDirectIdPath || hasOrderIdPath) {
    joinMode = hasDirectIdPath && hasOrderIdPath ? 'id+order_id' : hasDirectIdPath ? 'id' : 'order_id';
  } else if (hasDirectNamePath || hasOrderNamePath) {
    joinMode = hasDirectNamePath && hasOrderNamePath ? 'name+order_name' : hasDirectNamePath ? 'name' : 'order_name';
  }

  const addrLinkCol    = pickColumn(addrCols, ['customer_id', 'cust_id', 'customerId']);
  const addrLine1Col   = pickColumn(addrCols, ['address_line1', 'address_line_1', 'address', 'address1', 'shipping_address', 'delivery_address']);
  const addrDistCol    = pickColumn(addrCols, ['district', 'city', 'taluk', 'district_name', 'city_name']);
  const addrStateCol   = pickColumn(addrCols, ['state', 'state_name']);
  const addrPinCol     = pickColumn(addrCols, ['pincode', 'pin_code', 'zip', 'zip_code', 'postal_code', 'pin']);
  const addrCountryCol = pickColumn(addrCols, ['country', 'country_name']);
  const addrContactCol = pickColumn(addrCols, ['contact_no', 'phone', 'mobile', 'contact_number']);
  const addrDefaultCol = pickColumn(addrCols, ['is_default', 'is_primary', 'default_flag', 'is_active']);
  const useAddrTable   = Boolean(addrLinkCol && addrLine1Col && custIdCol);

  const custLine1Col   = pickColumn(custCols, ['shipping_address', 'address', 'address_line1', 'delivery_address', 'billing_address']);
  const custDistCol    = pickColumn(custCols, ['shipping_district', 'district', 'city', 'taluk']);
  const custStateCol   = pickColumn(custCols, ['shipping_state', 'state']);
  const custPinCol     = pickColumn(custCols, ['shipping_pin_code', 'shipping_pincode', 'pincode', 'pin_code', 'zip', 'zip_code']);
  const custCountryCol = pickColumn(custCols, ['shipping_country', 'country']);
  const custContactCol = pickColumn(custCols, ['contact_no', 'phone', 'mobile', 'contact_number']);

  const gstLinkCol   = pickColumn(gstCols, ['customer_id', 'cust_id', 'customerId']);
  const gstNoCol      = pickColumn(gstCols, ['gst_no', 'gstin', 'gst_number']);
  const gstDefaultCol = pickColumn(gstCols, ['is_default', 'is_primary', 'default_flag', 'is_active']);
  const useGstTable   = Boolean(gstLinkCol && gstNoCol && custIdCol);

  const custGstCol = pickColumn(custCols, ['gst_no', 'gstin', 'gst_number']);

  return {
    planCols, custCols, addrCols, gstCols, ordersCols,
    ordersTable, planOrderNoCol, planOrderColIsIdRef, ordersLinkCol, orderCustIdCol, orderCustNameCol, useOrdersJoin,
    planCustIdCol, joinMode,
    custIdCol, custNameCol,
    addrLinkCol, addrLine1Col, addrDistCol, addrStateCol, addrPinCol, addrCountryCol, addrContactCol, addrDefaultCol, useAddrTable,
    custLine1Col, custDistCol, custStateCol, custPinCol, custCountryCol, custContactCol,
    gstLinkCol, gstNoCol, gstDefaultCol, useGstTable, custGstCol,
    ...planDelivery,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED — builds the join clause(s) from production_plans to customers,
// used by BOTH /pending-purchase and the debug route, so the two can
// never disagree on how a plan is linked to its customer.
// ─────────────────────────────────────────────────────────────────────────────
const buildCustomerJoinSql = (resolved) => {
  const {
    joinMode, planCustIdCol, custIdCol, custNameCol,
    useOrdersJoin, ordersTable, planOrderNoCol, ordersLinkCol, orderCustIdCol, orderCustNameCol,
  } = resolved;

  if (joinMode === 'none') return ''; // no usable join path at all — customer_* fields will just be NULL

  const parts = [];

  if (useOrdersJoin) {
    parts.push(
      `LEFT JOIN ${ordersTable} ord
         ON TRIM(CAST(ord.${ordersLinkCol} AS CHAR)) = TRIM(CAST(p.${planOrderNoCol} AS CHAR))`
    );
  }

  if (joinMode === 'id' || joinMode === 'order_id' || joinMode === 'id+order_id') {
    const idExprParts = [];

    // A non-NULL, non-zero p.customer_id does NOT mean it points at a
    // customer that still exists. Validate it against `customers` inside
    // a correlated subquery before letting it into the COALESCE — if the
    // id is orphaned, this evaluates to NULL and the expression falls
    // through to the order-linked customer id instead.
    if (planCustIdCol) {
      idExprParts.push(
        `(SELECT vc.${custIdCol} FROM customers vc WHERE vc.${custIdCol} = NULLIF(p.${planCustIdCol}, 0))`
      );
    }
    if (useOrdersJoin && orderCustIdCol) idExprParts.push(`ord.${orderCustIdCol}`);

    const idExpr = idExprParts.length > 1 ? `COALESCE(${idExprParts.join(', ')})` : idExprParts[0];
    parts.push(`LEFT JOIN customers cu ON cu.${custIdCol} = ${idExpr}`);
  } else {
    // name-based match — prefer the plan's own customer_name, fall back
    // to the linked order's customer name.
    const nameExprParts = [`NULLIF(TRIM(p.customer_name), '')`];
    if (useOrdersJoin && orderCustNameCol) nameExprParts.push(`ord.${orderCustNameCol}`);
    const nameExpr = nameExprParts.length > 1 ? `COALESCE(${nameExprParts.join(', ')})` : nameExprParts[0];
    parts.push(`LEFT JOIN customers cu
              ON TRIM(cu.${custNameCol}) COLLATE utf8mb4_unicode_ci = TRIM(${nameExpr}) COLLATE utf8mb4_unicode_ci`);
  }

  return parts.join('\n');
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED — builds the SELECT expression for one Shipping-To field, given
// a PRIORITY-ORDERED list of candidate SQL expressions (highest priority
// first — typically [plan-level column, child address/GST table,
// customers table]). Any falsy entries are skipped.
//
// FIX (root cause #7): every candidate is wrapped in
// NULLIF(TRIM(<expr>), '') before entering COALESCE. Plain COALESCE only
// treats a candidate as "absent" when it's a true SQL NULL — an empty
// string '' (a very common shape for an unfilled VARCHAR column) still
// counts as "the value" and wins, silently shadowing a fully populated
// lower-priority candidate. Normalising blank/whitespace-only values to
// NULL first makes COALESCE fall through correctly.
// ─────────────────────────────────────────────────────────────────────────────
const coalesceSelect = (exprs, alias) => {
  const valid = (Array.isArray(exprs) ? exprs : [exprs]).filter(Boolean);
  if (valid.length === 0) return `NULL AS ${alias}`;

  const normalized = valid.map(e => `NULLIF(TRIM(${e}), '')`);
  if (normalized.length === 1) return `${normalized[0]} AS ${alias}`;
  return `COALESCE(${normalized.join(', ')}) AS ${alias}`;
};

router.get('/pending-purchase', auth, async (req, res) => {
  console.log('🟣🟣🟣 PENDING-PURCHASE ROUTE VERSION: 2026-07-22-SHIPTO-FIX-V8 (NULLIF/TRIM coalesce fix + debug-route parity) 🟣🟣🟣');
  try {
    const [[{ db_name }]] = await db.query('SELECT DATABASE() AS db_name');
    console.log(`[pending-purchase] connected database = "${db_name}"`);

    const planCols = await getPlanColumns();

    console.log('[pending-purchase] resolving customer/address/GST/orders columns...');
    const resolved = await resolveCustomerShipToColumns();
    const {
      custCols, addrCols, gstCols, ordersCols,
      ordersTable, planOrderNoCol, planOrderColIsIdRef, ordersLinkCol, orderCustIdCol, orderCustNameCol, useOrdersJoin,
      planCustIdCol, joinMode,
      custIdCol, custNameCol,
      addrLinkCol, addrLine1Col, addrDistCol, addrStateCol, addrPinCol, addrCountryCol, addrContactCol, addrDefaultCol, useAddrTable,
      custLine1Col, custDistCol, custStateCol, custPinCol, custCountryCol, custContactCol,
      gstLinkCol, gstNoCol, gstDefaultCol, useGstTable, custGstCol,
      planDelNameCol, planDelLine1Col, planDelDistCol, planDelStateCol,
      planDelPinCol, planDelCountryCol, planDelContactCol, planDelGstinCol, usePlanDeliveryCols,
    } = resolved;

    console.log('[pending-purchase] customers columns:', [...custCols]);
    console.log('[pending-purchase] customer_delivery_addresses columns:', [...addrCols]);
    console.log('[pending-purchase] customer_gst_numbers columns:', [...gstCols]);
    console.log(`[pending-purchase] orders table = ${ordersTable ? `"${ordersTable}"` : '(none found)'}${ordersTable ? `, columns: ${[...ordersCols]}` : ''}`);
    console.log(
      `[pending-purchase] PLAN-LEVEL delivery columns (primary source, root cause #6) → ` +
      `usePlanDeliveryCols=${usePlanDeliveryCols}, name=${planDelNameCol || 'none'}, line1=${planDelLine1Col || 'none'}, ` +
      `district=${planDelDistCol || 'none'}, state=${planDelStateCol || 'none'}, pincode=${planDelPinCol || 'none'}, ` +
      `country=${planDelCountryCol || 'none'}, contact=${planDelContactCol || 'none'}, gstin=${planDelGstinCol || 'none'}` +
      (usePlanDeliveryCols
        ? ' — these will be used first (blank values are now correctly skipped — see root cause #7); the customer/orders join below is only a fallback for rows where they are truly empty.'
        : ' — none found on production_plans; falling back entirely to the customer/orders join chain below.')
    );
    console.log(
      `[pending-purchase] customer JOIN MODE (fallback) = "${joinMode}" ` +
      `(planCustIdCol=${planCustIdCol || 'none'}, useOrdersJoin=${useOrdersJoin}, orderCustIdCol=${orderCustIdCol || 'none'}, orderCustNameCol=${orderCustNameCol || 'none'})`
    );

    const hasFpoId              = planCols.has('fpo_id');
    const hasFpoNo               = planCols.has('fpo_no');
    const hasRecNo               = planCols.has('rec_no');
    const hasCustomerName        = planCols.has('customer_name');
    const hasOrderSortNo         = planCols.has('order_sort_no');
    const hasConstnForProd       = planCols.has('constn_for_production');
    const hasConstruction        = planCols.has('construction');
    const hasPurchaseSpecialIns  = planCols.has('purchase_special_instruction');
    const hasRecDate             = planCols.has('rec_date');
    const hasPlanDate            = planCols.has('plan_date');
    const hasOrderType           = planCols.has('order_type');
    const hasOrderNo             = planCols.has('order_no');
    const hasPurchaseQty         = planCols.has('purchase_qty');

    if (!hasPurchaseQty) {
      return res.status(500).json({ message: 'production_plans.purchase_qty column missing.' });
    }

    const selectCols = [
      'p.id',
      hasRecNo ? 'p.rec_no' : 'CAST(p.id AS CHAR) AS rec_no',
      hasRecDate  ? 'p.rec_date'  : hasPlanDate ? 'p.plan_date AS rec_date' : 'NULL AS rec_date',
      hasOrderType ? 'p.order_type' : 'NULL AS order_type',
      hasOrderNo   ? 'p.order_no'   : 'NULL AS order_no',
      // Prefer a delivery-specific customer name if the plan has one
      // (e.g. "Ship To" may legitimately differ from the billed
      // customer); fall back to the plan's regular customer_name.
      planDelNameCol
        ? `COALESCE(NULLIF(TRIM(p.${planDelNameCol}), ''), ${hasCustomerName ? 'p.customer_name' : 'NULL'}) AS customer_name`
        : hasCustomerName ? 'p.customer_name' : 'NULL AS customer_name',
      hasOrderSortNo        ? 'p.order_sort_no'             : 'NULL AS order_sort_no',
      hasConstnForProd      ? 'p.constn_for_production'     :
        hasConstruction     ? 'p.construction AS constn_for_production' :
                              'NULL AS constn_for_production',
      'p.purchase_qty',
      hasPurchaseSpecialIns ? 'p.purchase_special_instruction' : 'NULL AS purchase_special_instruction',
    ];

    // ── Address / contact / GST fields ──
    // Priority order per field: PLAN-LEVEL column (root cause #6, matches
    // what the Production Plan screen already shows) → child address/GST
    // table → customers table. coalesceSelect() (root cause #7) skips
    // blank/whitespace-only values, not just true NULLs, so a blank
    // plan-level column correctly falls through to the next source.
    const planLine1Expr   = planDelLine1Col   ? `p.${planDelLine1Col}`   : null;
    const planDistExpr    = planDelDistCol    ? `p.${planDelDistCol}`    : null;
    const planStateExpr   = planDelStateCol   ? `p.${planDelStateCol}`   : null;
    const planPinExpr     = planDelPinCol     ? `p.${planDelPinCol}`     : null;
    const planCountryExpr = planDelCountryCol ? `p.${planDelCountryCol}` : null;
    const planContactExpr = planDelContactCol ? `p.${planDelContactCol}` : null;
    const planGstinExpr   = planDelGstinCol   ? `p.${planDelGstinCol}`   : null;

    const addrLine1Expr   = useAddrTable && addrLine1Col   ? `ca.${addrLine1Col}`   : null;
    const addrDistExpr    = useAddrTable && addrDistCol    ? `ca.${addrDistCol}`    : null;
    const addrStateExpr   = useAddrTable && addrStateCol   ? `ca.${addrStateCol}`   : null;
    const addrPinExpr     = useAddrTable && addrPinCol     ? `ca.${addrPinCol}`     : null;
    const addrCountryExpr = useAddrTable && addrCountryCol ? `ca.${addrCountryCol}` : null;
    const addrContactExpr = useAddrTable && addrContactCol ? `ca.${addrContactCol}` : null;
    const gstExpr         = useGstTable && gstNoCol        ? `cg.${gstNoCol}`       : null;

    const custLine1Expr   = custLine1Col   ? `cu.${custLine1Col}`   : null;
    const custDistExpr    = custDistCol    ? `cu.${custDistCol}`    : null;
    const custStateExpr   = custStateCol   ? `cu.${custStateCol}`   : null;
    const custPinExpr     = custPinCol     ? `cu.${custPinCol}`     : null;
    const custCountryExpr = custCountryCol ? `cu.${custCountryCol}` : null;
    const custContactExpr = custContactCol ? `cu.${custContactCol}` : null;
    const custGstExpr     = custGstCol     ? `cu.${custGstCol}`     : null;

    selectCols.push(coalesceSelect([planLine1Expr,   addrLine1Expr,   custLine1Expr],   'customer_address_line1'));
    selectCols.push(coalesceSelect([planDistExpr,    addrDistExpr,    custDistExpr],    'customer_district'));
    selectCols.push(coalesceSelect([planStateExpr,   addrStateExpr,   custStateExpr],   'customer_state'));
    selectCols.push(coalesceSelect([planPinExpr,     addrPinExpr,     custPinExpr],     'customer_pincode'));
    selectCols.push(coalesceSelect([planCountryExpr, addrCountryExpr, custCountryExpr], 'customer_country'));
    selectCols.push(coalesceSelect([planContactExpr, addrContactExpr, custContactExpr], 'customer_contact_no'));
    selectCols.push(coalesceSelect([planGstinExpr,   gstExpr,         custGstExpr],     'customer_gstin'));
    // Diagnostic-only column — which customer id actually got matched via
    // the JOIN fallback path (irrelevant when plan-level columns already
    // supplied the address, but still useful to see in the log), so the
    // console (and the debug route) can confirm resolution without a
    // separate query. Not consumed by the frontend.
    selectCols.push(`cu.${custIdCol || 'id'} AS _matched_customer_id`);
    // Diagnostic-only — records whether THIS row's address actually came
    // from the plan-level columns, purely for the console summary below.
    if (planLine1Expr) selectCols.push(`(NULLIF(TRIM(${planLine1Expr}), '') IS NOT NULL) AS _from_plan_level`);
    else selectCols.push(`0 AS _from_plan_level`);

    const whereParts = ['p.purchase_qty > 0'];
    if (hasFpoId) {
      whereParts.push('(p.fpo_id IS NULL OR p.fpo_id = 0)');
    } else if (hasFpoNo) {
      whereParts.push('(p.fpo_no IS NULL OR p.fpo_no = \'\')');
    }

    const joinParts = [];
    const custJoinSql = buildCustomerJoinSql(resolved);
    if (custJoinSql) joinParts.push(custJoinSql);

    // Pick ONE address row per customer via a correlated subquery —
    // preferring a default/primary flag column if the table has one,
    // otherwise the most recently added row (highest id). Only needed as
    // a fallback path — harmless (and skipped) when plan-level columns
    // already cover every row.
    if (useAddrTable && custJoinSql) {
      const addrOrderBy = addrDefaultCol ? `${addrDefaultCol} DESC, id DESC` : 'id DESC';
      joinParts.push(`
        LEFT JOIN customer_delivery_addresses ca
               ON ca.${addrLinkCol} = cu.${custIdCol}
              AND ca.id = (
                    SELECT ca2.id FROM customer_delivery_addresses ca2
                    WHERE ca2.${addrLinkCol} = cu.${custIdCol}
                    ORDER BY ca2.${addrOrderBy}
                    LIMIT 1
                  )
      `);
    }

    // Same pattern for GST numbers — one row per customer.
    if (useGstTable && custJoinSql) {
      const gstOrderBy = gstDefaultCol ? `${gstDefaultCol} DESC, id DESC` : 'id DESC';
      joinParts.push(`
        LEFT JOIN customer_gst_numbers cg
               ON cg.${gstLinkCol} = cu.${custIdCol}
              AND cg.id = (
                    SELECT cg2.id FROM customer_gst_numbers cg2
                    WHERE cg2.${gstLinkCol} = cu.${custIdCol}
                    ORDER BY cg2.${gstOrderBy}
                    LIMIT 1
                  )
      `);
    }

    const sql = `
      SELECT ${selectCols.join(', \n             ')}
      FROM   production_plans p
      ${joinParts.join('\n')}
      WHERE  ${whereParts.join(' AND ')}
      ORDER  BY p.id DESC
    `;

    console.log('[pending-purchase] SQL:\n', sql);
    const [rows] = await db.query(sql);

    const normalised = rows.map(r => ({
      id:                           Number(r.id),
      rec_no:                       String(r.rec_no ?? ''),
      rec_date:                     r.rec_date ?? null,
      order_type:                   r.order_type ?? '',
      order_no:                     String(r.order_no ?? ''),
      customer_name:                r.customer_name ?? '',
      order_sort_no:                r.order_sort_no != null ? String(r.order_sort_no) : '',
      constn_for_production:        r.constn_for_production ?? '',
      purchase_qty:                 Number(r.purchase_qty) || 0,
      purchase_special_instruction: r.purchase_special_instruction ?? '',
      customer_address_line1:       r.customer_address_line1 ?? '',
      customer_district:            r.customer_district ?? '',
      customer_state:                r.customer_state ?? '',
      customer_pincode:              r.customer_pincode ?? '',
      customer_country:              r.customer_country ?? '',
      customer_contact_no:           r.customer_contact_no ?? '',
      customer_gstin:                r.customer_gstin ?? '',
    }));

    console.log(`[pending-purchase] returning ${normalised.length} plan(s)`);
    if (normalised[0]) {
      console.log('[pending-purchase] sample row:', JSON.stringify(normalised[0], null, 2));
    }
    const fromPlanLevelCount = rows.filter(r => Number(r._from_plan_level) === 1).length;
    console.log(`[pending-purchase] ${fromPlanLevelCount}/${rows.length} row(s) got their Shipping To address from production_plans' own delivery columns; the rest (if any) used the customer/orders join fallback.`);
    // Extra visibility: flag any plan whose Shipping To fields are ALL
    // still empty, along with the matched customer id (or "no match"),
    // so an incomplete fix shows up in the server log immediately.
    const blankShipTo = rows.filter(r =>
      !r.customer_address_line1 && !r.customer_district && !r.customer_state && !r.customer_pincode
    );
    if (blankShipTo.length) {
      console.warn(
        `[pending-purchase] ${blankShipTo.length}/${rows.length} plan(s) have a completely empty Shipping To: ` +
        blankShipTo.map(r => `"${r.customer_name || r.rec_no}" (matched_customer_id=${r._matched_customer_id ?? 'NULL — no customer row matched at all'})`).join(', ') +
        `. Use GET /pending-purchase/debug/<rec_no> on one of these to see exactly why.`
      );
    }
    res.json(normalised);

  } catch (err) {
    console.error('[GET /fabric-purchase-orders/pending-purchase]', err);
    res.status(500).json({ message: err.message, sqlMessage: err.sqlMessage });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 0b. GET /pending-purchase/debug/:rec_no
//     Diagnostic route. MUST be declared before any other "/:something"
//     route below it that could otherwise swallow this path.
//
//     Reuses resolveCustomerShipToColumns() / buildCustomerJoinSql() /
//     coalesceSelect() — the EXACT same helpers the real /pending-purchase
//     route calls — so this can never give an answer that disagrees with
//     what the real route actually returns.
//
//     FIX (this revision): Step 5 below now builds its OWN planLine1Expr /
//     planDistExpr / planStateExpr / planPinExpr / planCountryExpr /
//     planContactExpr / planGstinExpr — mirroring the main route exactly —
//     instead of referencing variables that were never declared in this
//     route's scope (that was throwing a ReferenceError → 500 on every
//     call). The resolved_* fields in the JSON response now also include
//     the plan-level column as the top-priority candidate, so this route
//     can never again report "no address" while the main route finds one
//     via the plan-level column (or vice versa).
//
//     Call it as:
//       GET /api/fabric-purchase-orders/pending-purchase/debug/PLN-2026-002
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pending-purchase/debug/:rec_no', auth, async (req, res) => {
  try {
    const recNo = req.params.rec_no;
    const [[{ db_name }]] = await db.query('SELECT DATABASE() AS db_name');

    const resolved = await resolveCustomerShipToColumns();
    const {
      custCols, addrCols, gstCols, ordersCols,
      ordersTable, planOrderNoCol, planOrderColIsIdRef, ordersLinkCol, orderCustIdCol, orderCustNameCol, useOrdersJoin,
      planCustIdCol, joinMode,
      custIdCol, custNameCol,
      addrLinkCol, addrLine1Col, addrDistCol, addrStateCol, addrPinCol, addrCountryCol, addrContactCol, addrDefaultCol, useAddrTable,
      custLine1Col, custDistCol, custStateCol, custPinCol, custCountryCol, custContactCol,
      gstLinkCol, gstNoCol, gstDefaultCol, useGstTable, custGstCol,
      planDelNameCol, planDelLine1Col, planDelDistCol, planDelStateCol,
      planDelPinCol, planDelCountryCol, planDelContactCol, planDelGstinCol, usePlanDeliveryCols,
    } = resolved;

    const debug = {
      db_name,
      rec_no: recNo,
      joinMode,
      ordersTable,
      planLevelDeliveryColumns: {
        usePlanDeliveryCols,
        planDelNameCol, planDelLine1Col, planDelDistCol, planDelStateCol,
        planDelPinCol, planDelCountryCol, planDelContactCol, planDelGstinCol,
        note: usePlanDeliveryCols
          ? 'These plan-level columns are the PRIMARY source for Shipping To — the join-chain fields below are only a fallback for rows where these are empty.'
          : 'No plan-level delivery columns were found on production_plans — Shipping To relies entirely on the customer/orders join chain below.',
      },
      resolvedColumns: {
        planCustIdCol, custIdCol, custNameCol,
        planOrderNoCol, planOrderColIsIdRef, ordersLinkCol, orderCustIdCol, orderCustNameCol, useOrdersJoin,
        useAddrTable, addrLinkCol, addrLine1Col, addrDistCol, addrStateCol, addrPinCol, addrCountryCol, addrContactCol, addrDefaultCol,
        custLine1Col, custDistCol, custStateCol, custPinCol, custCountryCol, custContactCol,
        useGstTable, gstLinkCol, gstNoCol, gstDefaultCol, custGstCol,
      },
      tableColumns: {
        customers: [...custCols],
        customer_delivery_addresses: [...addrCols],
        customer_gst_numbers: [...gstCols],
        [ordersTable || '(orders table not found)']: [...ordersCols],
      },
    };

    // Step 1: does production_plans have this rec_no?
    const [planRows] = await db.query(
      `SELECT * FROM production_plans WHERE rec_no = ?`,
      [recNo]
    );
    debug.productionPlanRow = planRows[0] || null;

    if (!planRows.length) {
      debug.warning = `No plan found with rec_no = ${recNo}.`;
      return res.json(debug);
    }

    const plan = planRows[0];

    // Report exactly what the plan-level columns hold for THIS plan —
    // this alone usually answers "why is Shipping To blank/wrong".
    if (usePlanDeliveryCols) {
      debug.planLevelDeliveryValues = {
        name:     planDelNameCol    ? plan[planDelNameCol]    : null,
        line1:    planDelLine1Col   ? plan[planDelLine1Col]   : null,
        district: planDelDistCol    ? plan[planDelDistCol]    : null,
        state:    planDelStateCol   ? plan[planDelStateCol]   : null,
        pincode:  planDelPinCol     ? plan[planDelPinCol]     : null,
        country:  planDelCountryCol ? plan[planDelCountryCol] : null,
        contact:  planDelContactCol ? plan[planDelContactCol] : null,
        gstin:    planDelGstinCol   ? plan[planDelGstinCol]   : null,
      };
      const anyPlanLevelValue = Object.values(debug.planLevelDeliveryValues).some(v => v !== null && String(v).trim() !== '');
      if (anyPlanLevelValue) {
        debug.info = 'This plan has plan-level delivery-address data — Shipping To will be filled from planLevelDeliveryValues above, regardless of what the customer/orders join chain below resolves.';
      } else {
        debug.info = 'Plan-level delivery columns exist on production_plans, but are ALL empty/blank for this specific plan — falling through to the customer/orders join chain below.';
      }
    }

    if (joinMode === 'none' && !usePlanDeliveryCols) {
      debug.warning = 'No usable join path from production_plans to customers (no customer_id/customer_name on production_plans, no orders table found, and customers.id/name pair could not be resolved either) AND no plan-level delivery columns exist — Shipping To cannot work at all until one of these is fixed.';
      return res.json(debug);
    }

    // ── FIX: build the plan-level *Expr variables locally, mirroring the
    //    main route exactly. These were previously referenced below
    //    without ever being declared in this route's scope, which threw
    //    a ReferenceError on every call ("planLine1Expr is not defined")
    //    — the 500 error you saw in the browser console. ──
    const planLine1Expr   = planDelLine1Col   ? `p.${planDelLine1Col}`   : null;
    const planDistExpr    = planDelDistCol    ? `p.${planDelDistCol}`    : null;
    const planStateExpr   = planDelStateCol   ? `p.${planDelStateCol}`   : null;
    const planPinExpr     = planDelPinCol     ? `p.${planDelPinCol}`     : null;
    const planCountryExpr = planDelCountryCol ? `p.${planDelCountryCol}` : null;
    const planContactExpr = planDelContactCol ? `p.${planDelContactCol}` : null;
    const planGstinExpr   = planDelGstinCol   ? `p.${planDelGstinCol}`   : null;

    if (joinMode === 'none') {
      // Plan-level columns are the whole story for this schema — nothing
      // further to resolve via the join chain, and there's no customer
      // join to run Steps 2–6 against. Still worth reporting what the
      // plan-level-only resolution would produce, mirroring
      // coalesceSelect()'s blank-skipping behaviour.
      const pick = (v) => (v != null && String(v).trim() !== '' ? v : null);
      debug.result = {
        resolved_address:  pick(planDelLine1Col   ? plan[planDelLine1Col]   : null),
        resolved_district: pick(planDelDistCol    ? plan[planDelDistCol]    : null),
        resolved_state:    pick(planDelStateCol   ? plan[planDelStateCol]   : null),
        resolved_pincode:  pick(planDelPinCol     ? plan[planDelPinCol]     : null),
        resolved_country:  pick(planDelCountryCol ? plan[planDelCountryCol] : null),
        resolved_gstin:    pick(planDelGstinCol   ? plan[planDelGstinCol]   : null),
        resolved_contact:  pick(planDelContactCol ? plan[planDelContactCol] : null),
      };
      return res.json(debug);
    }

    debug.planCustomerName    = plan.customer_name ?? null;
    debug.planCustomerIdValue = planCustIdCol ? plan[planCustIdCol] : null;
    debug.planOrderNoValue    = planOrderNoCol ? plan[planOrderNoCol] : null;

    // Step 2: if an orders table is wired up, look up the matching order
    // row so we can see the order's own customer id/name.
    let orderRow = null;
    if (useOrdersJoin && debug.planOrderNoValue != null && debug.planOrderNoValue !== '') {
      const [orderRows] = await db.query(
        `SELECT * FROM ${ordersTable}
         WHERE TRIM(CAST(${ordersLinkCol} AS CHAR)) = TRIM(CAST(? AS CHAR))`,
        [debug.planOrderNoValue]
      );
      orderRow = orderRows[0] || null;
      debug.matchedOrderRow = orderRow;
      if (!orderRow) {
        debug.orderJoinWarning = `production_plans.${planOrderNoCol} = "${debug.planOrderNoValue}" but no row in ${ordersTable} has ${ordersLinkCol} matching that value (compared as trimmed text).`;
      }
    } else if (useOrdersJoin) {
      debug.orderJoinWarning = `production_plans.${planOrderNoCol} is empty for this plan — cannot look up an order to resolve the customer through.`;
    }

    // Step 3: work out which source actually supplies the customer id/name.
    let resolvedCustomerId = null;
    let resolvedCustomerName = null;
    let resolvedFrom = null;
    if (joinMode === 'id' || joinMode === 'order_id' || joinMode === 'id+order_id') {
      let planCustIdIsValid = false;
      if (planCustIdCol && plan[planCustIdCol]) {
        const [[validityCheck]] = await db.query(
          `SELECT ${custIdCol} AS id FROM customers WHERE ${custIdCol} = ?`,
          [plan[planCustIdCol]]
        );
        planCustIdIsValid = Boolean(validityCheck);
        debug.planCustomerIdValidity = planCustIdIsValid
          ? `production_plans.${planCustIdCol} = ${plan[planCustIdCol]} — confirmed this customer exists`
          : `production_plans.${planCustIdCol} = ${plan[planCustIdCol]} — ORPHANED: no customers row has this id. Falling back to the linked order's customer instead.`;
      }

      if (planCustIdCol && plan[planCustIdCol] && planCustIdIsValid) {
        resolvedCustomerId = plan[planCustIdCol];
        resolvedFrom = 'production_plans.' + planCustIdCol;
      } else if (orderRow && orderCustIdCol && orderRow[orderCustIdCol]) {
        resolvedCustomerId = orderRow[orderCustIdCol];
        resolvedFrom = `${ordersTable}.${orderCustIdCol} (via linked order)` +
          (planCustIdCol && plan[planCustIdCol]
            ? ` — production_plans.${planCustIdCol}=${plan[planCustIdCol]} was orphaned, so it was skipped`
            : '');
      } else {
        resolvedFrom = 'NONE — plan.customer_id is empty/orphaned AND no matching order (or order has no customer_id)';
      }
    } else {
      if (plan.customer_name && String(plan.customer_name).trim()) {
        resolvedCustomerName = plan.customer_name;
        resolvedFrom = 'production_plans.customer_name';
      } else if (orderRow && orderCustNameCol && orderRow[orderCustNameCol]) {
        resolvedCustomerName = orderRow[orderCustNameCol];
        resolvedFrom = `${ordersTable}.${orderCustNameCol} (via linked order)`;
      } else {
        resolvedFrom = 'NONE — plan.customer_name is empty AND no matching order (or order has no customer name)';
      }
    }
    debug.resolvedCustomerId   = resolvedCustomerId;
    debug.resolvedCustomerName = resolvedCustomerName;
    debug.resolvedFrom         = resolvedFrom;

    if (resolvedCustomerId == null && resolvedCustomerName == null && !usePlanDeliveryCols) {
      debug.warning = resolvedFrom;
      return res.json(debug);
    }

    // Step 4: does customers have a matching row? (skip gracefully if we
    // have nothing to match on — plan-level columns may still carry the
    // whole answer, already reported in planLevelDeliveryValues above.)
    let custMatch = [];
    if (resolvedCustomerId != null) {
      [custMatch] = await db.query(
        `SELECT ${custIdCol} AS id, ${custNameCol} AS name FROM customers WHERE ${custIdCol} = ?`,
        [resolvedCustomerId]
      );
      if (!custMatch.length) {
        debug.warning = `Resolved customer id = ${resolvedCustomerId} (from ${resolvedFrom}) but no customers row has ${custIdCol} = ${resolvedCustomerId}.`;
        if (!usePlanDeliveryCols) return res.json(debug);
      }
    } else if (resolvedCustomerName != null) {
      [custMatch] = await db.query(
        `SELECT ${custIdCol} AS id, ${custNameCol} AS name
         FROM customers
         WHERE TRIM(${custNameCol}) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci`,
        [resolvedCustomerName]
      );
      if (!custMatch.length) {
        debug.warning = `Resolved customer name = "${resolvedCustomerName}" (from ${resolvedFrom}) but no customers row matches — check for typos/whitespace/case differences vs customers.${custNameCol}.`;
        if (!usePlanDeliveryCols) return res.json(debug);
      }
    }
    debug.customerMatch = custMatch;

    // Step 5: build and run the exact same SQL the real route builds,
    // now INCLUDING the plan-level expression as the top-priority
    // candidate in every field, exactly like the main /pending-purchase
    // route — so this debug route can never disagree with it again.
    const addrLine1Expr   = useAddrTable && addrLine1Col   ? `ca.${addrLine1Col}`   : null;
    const addrDistExpr    = useAddrTable && addrDistCol    ? `ca.${addrDistCol}`    : null;
    const addrStateExpr   = useAddrTable && addrStateCol   ? `ca.${addrStateCol}`   : null;
    const addrPinExpr     = useAddrTable && addrPinCol     ? `ca.${addrPinCol}`     : null;
    const addrCountryExpr = useAddrTable && addrCountryCol ? `ca.${addrCountryCol}` : null;
    const addrContactExpr = useAddrTable && addrContactCol ? `ca.${addrContactCol}` : null;
    const gstExpr         = useGstTable && gstNoCol        ? `cg.${gstNoCol}`       : null;

    const custLine1Expr   = custLine1Col   ? `cu.${custLine1Col}`   : null;
    const custDistExpr    = custDistCol    ? `cu.${custDistCol}`    : null;
    const custStateExpr   = custStateCol   ? `cu.${custStateCol}`   : null;
    const custPinExpr     = custPinCol     ? `cu.${custPinCol}`     : null;
    const custCountryExpr = custCountryCol ? `cu.${custCountryCol}` : null;
    const custContactExpr = custContactCol ? `cu.${custContactCol}` : null;
    const custGstExpr     = custGstCol     ? `cu.${custGstCol}`     : null;

    const joinParts = [buildCustomerJoinSql(resolved)];
    if (useAddrTable) {
      const addrOrderBy = addrDefaultCol ? `${addrDefaultCol} DESC, id DESC` : 'id DESC';
      joinParts.push(`
        LEFT JOIN customer_delivery_addresses ca
               ON ca.${addrLinkCol} = cu.${custIdCol}
              AND ca.id = (
                    SELECT ca2.id FROM customer_delivery_addresses ca2
                    WHERE ca2.${addrLinkCol} = cu.${custIdCol}
                    ORDER BY ca2.${addrOrderBy}
                    LIMIT 1
                  )
      `);
    }
    if (useGstTable) {
      const gstOrderBy = gstDefaultCol ? `${gstDefaultCol} DESC, id DESC` : 'id DESC';
      joinParts.push(`
        LEFT JOIN customer_gst_numbers cg
               ON cg.${gstLinkCol} = cu.${custIdCol}
              AND cg.id = (
                    SELECT cg2.id FROM customer_gst_numbers cg2
                    WHERE cg2.${gstLinkCol} = cu.${custIdCol}
                    ORDER BY cg2.${gstOrderBy}
                    LIMIT 1
                  )
      `);
    }

    const sql = `
      SELECT
        cu.${custIdCol}   AS matched_customer_id,
        cu.${custNameCol} AS matched_customer_name,
        ${coalesceSelect([planLine1Expr,   addrLine1Expr,   custLine1Expr],   'resolved_address')},
        ${coalesceSelect([planDistExpr,    addrDistExpr,    custDistExpr],    'resolved_district')},
        ${coalesceSelect([planStateExpr,   addrStateExpr,   custStateExpr],   'resolved_state')},
        ${coalesceSelect([planPinExpr,     addrPinExpr,     custPinExpr],     'resolved_pincode')},
        ${coalesceSelect([planCountryExpr, addrCountryExpr, custCountryExpr], 'resolved_country')},
        ${coalesceSelect([planGstinExpr,   gstExpr,         custGstExpr],     'resolved_gstin')},
        ${coalesceSelect([planContactExpr, addrContactExpr, custContactExpr], 'resolved_contact')},
        ca.${addrLine1Col || 'NULL'} AS raw_child_table_address,
        cu.${custLine1Col || 'NULL'} AS raw_customers_table_address
      FROM production_plans p
      ${joinParts.join('\n')}
      WHERE p.rec_no = ?
    `;
    debug.generatedSql = sql;

    const [joinRows] = await db.query(sql, [recNo]);
    debug.result = joinRows[0] || null;

    // Step 6: sanity-check the child tables directly for this customer.
    if (joinRows.length && joinRows[0].matched_customer_id) {
      const custId = joinRows[0].matched_customer_id;
      if (useAddrTable) {
        const [addrRowsForCust] = await db.query(
          `SELECT * FROM customer_delivery_addresses WHERE ${addrLinkCol} = ?`,
          [custId]
        );
        debug.customerDeliveryAddressRows = addrRowsForCust;
        if (!addrRowsForCust.length) {
          debug.addressChildTableWarning = `Customer id=${custId} matched, but has ZERO rows in customer_delivery_addresses. The COALESCE fallback should still pick up customers.${custLine1Col || '(no fallback column found — this is the real problem if resolved_address above is also empty)'}.`;
        }
      }
      if (useGstTable) {
        const [gstRowsForCust] = await db.query(
          `SELECT * FROM customer_gst_numbers WHERE ${gstLinkCol} = ?`,
          [custId]
        );
        debug.customerGstRows = gstRowsForCust;
      }
      const [[custRow]] = await db.query(`SELECT * FROM customers WHERE ${custIdCol} = ?`, [custId]);
      debug.rawCustomerRow = custRow || null;
    }

    res.json(debug);

  } catch (err) {
    console.error('[GET /fabric-purchase-orders/pending-purchase/debug/:rec_no]', err);
    res.status(500).json({ message: err.message, sqlMessage: err.sqlMessage });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET ALL FPOs
//    Includes ship_from, company_id, due_date, place_of_supply, advance,
//    description whenever the DB migration for them has been applied.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const cols = await getFpoColumns();
    const optionalCols = ['ship_from', 'company_id', 'due_date', 'place_of_supply', 'advance', 'description']
      .filter(c => cols.has(c));

    const [rows] = await db.query(`
      SELECT
        id, fpo_no, fpo_date, supplier,
        plan_id, plan_rec_no, order_no, purchase_qty,
        billing_from, delivery_to, pay_terms, pinning,
        packing_type, rate_type, freight, delivery_dt, remarks,
        cgst_pct, sgst_pct, igst_pct,
        sub_total, cgst_amt, sgst_amt, igst_amt, net_value,
        status, invoice_no, invoice_id,
        ${optionalCols.length ? optionalCols.join(', ') + ',' : ''}
        created_at, updated_at
      FROM fabric_purchase_orders
      ORDER BY id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /fabric-purchase-orders ERROR:', err.message);
    res.status(500).json({ message: err.message, sqlMessage: err.sqlMessage });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a. GET NEXT FPO NO — MUST come BEFORE /:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/next-fpo', auth, async (req, res) => {
  try {
    const fpo_no = await generateNextFpoNo();
    console.log('✅ next-fpo generated:', fpo_no);
    res.json({ fpo_no });
  } catch (err) {
    console.error('❌ GET /fabric-purchase-orders/next-fpo ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get('/next-no', auth, async (req, res) => {
  try {
    const fpo_no = await generateNextFpoNo();
    res.json({ fpo_no });
  } catch (err) {
    console.error('❌ GET /fabric-purchase-orders/next-no ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET SINGLE FPO WITH LINE ITEMS  (/:id must come AFTER all named routes)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const [[fpo]] = await db.query(
      'SELECT * FROM fabric_purchase_orders WHERE id = ?',
      [req.params.id]
    );
    if (!fpo) return res.status(404).json({ message: 'FPO not found' });

    const [items] = await db.query(
      'SELECT * FROM fpo_items WHERE fpo_id = ? ORDER BY id ASC',
      [req.params.id]
    );
    res.json({ ...fpo, items });
  } catch (err) {
    console.error('❌ GET /fabric-purchase-orders/:id ERROR:', err.message);
    res.status(500).json({ message: err.message, sqlMessage: err.sqlMessage });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CREATE NEW FPO  (POST /)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const {
      fpo_no, fpo_date, supplier,
      billing_from, delivery_to, pay_terms, pinning,
      packing_type, rate_type, freight, delivery_dt, remarks,
      cgst_pct, sgst_pct, igst_pct,
      sub_total, cgst_amt, sgst_amt, igst_amt, net_value,
      plan_id, plan_rec_no, order_no, purchase_qty,
      ship_from, company_id, due_date, place_of_supply, advance, description,
      items = [],
    } = req.body;

    const fpoCols = await getFpoColumns();

    const columns = [
      'fpo_no', 'fpo_date', 'supplier',
      'billing_from', 'delivery_to', 'pay_terms', 'pinning',
      'packing_type', 'rate_type', 'freight', 'delivery_dt', 'remarks',
      'cgst_pct', 'sgst_pct', 'igst_pct',
      'sub_total', 'cgst_amt', 'sgst_amt', 'igst_amt', 'net_value',
      'plan_id', 'plan_rec_no', 'order_no', 'purchase_qty',
    ];
    const values = [
      fpo_no, fpo_date || null, supplier,
      billing_from || null, delivery_to || null, pay_terms || null, pinning || null,
      packing_type || null, rate_type || null, freight || null,
      delivery_dt || null, remarks || null,
      cgst_pct  || 0, sgst_pct  || 0, igst_pct  || 0,
      sub_total || 0, cgst_amt  || 0, sgst_amt  || 0,
      igst_amt  || 0, net_value || 0,
      plan_id   || null, plan_rec_no || null,
      order_no  || null, purchase_qty || 0,
    ];

    const optionalFieldMap = {
      ship_from:       ship_from || null,
      company_id:      company_id || null,
      due_date:        due_date || null,
      place_of_supply: place_of_supply || null,
      advance:         advance || 0,
      description:     description || null,
    };
    for (const [col, val] of Object.entries(optionalFieldMap)) {
      if (fpoCols.has(col)) { columns.push(col); values.push(val); }
    }

    const placeholders = columns.map(() => '?').join(', ');
    const [r] = await conn.query(
      `INSERT INTO fabric_purchase_orders (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );

    const fpoId = r.insertId;

    for (const item of items) {
      await conn.query(
        `INSERT INTO fpo_items
           (fpo_id, sort_no, construction, hsn_code, qty, rate, basic_value)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          fpoId,
          item.sort_no      || '',
          item.construction || '',
          item.hsn_code     || '',
          item.qty          || 0,
          item.rate         || 0,
          item.basic_value  || 0,
        ]
      );
    }

    if (plan_id) {
      const cols = await getPlanColumns();
      const stampParts = [];
      const stampVals  = [];

      if (cols.has('fpo_id')) { stampParts.push('fpo_id = ?');  stampVals.push(fpoId); }
      if (cols.has('fpo_no')) { stampParts.push('fpo_no = ?');  stampVals.push(fpo_no); }

      if (stampParts.length > 0) {
        stampVals.push(plan_id);
        await conn.query(
          `UPDATE production_plans SET ${stampParts.join(', ')} WHERE id = ?`,
          stampVals
        );
        console.log(`✅ Stamped production_plan id=${plan_id} with fpo_id=${fpoId} fpo_no=${fpo_no}`);
      } else {
        console.warn('⚠ production_plans has neither fpo_id nor fpo_no column — plan not stamped');
      }
    }

    await conn.commit();
    console.log('✅ FPO INSERT success — id:', fpoId, '| fpo_no:', fpo_no);
    res.status(201).json({ id: fpoId, fpo_no });

  } catch (err) {
    await conn.rollback();
    console.error('❌ POST /fabric-purchase-orders ERROR:', err.message);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: 'This FPO number was just used. Refresh and try again.',
        code: err.code,
      });
    }
    res.status(500).json({ message: err.message, code: err.code, sqlMessage: err.sqlMessage });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. UPDATE EXISTING FPO  (PUT /:id)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const {
      fpo_no, fpo_date, supplier,
      billing_from, delivery_to, pay_terms, pinning,
      packing_type, rate_type, freight, delivery_dt, remarks,
      cgst_pct, sgst_pct, igst_pct,
      sub_total, cgst_amt, sgst_amt, igst_amt, net_value,
      ship_from, company_id, due_date, place_of_supply, advance, description,
      items = [],
    } = req.body;

    const fpoCols = await getFpoColumns();

    const setParts = [
      'fpo_no = ?', 'fpo_date = ?', 'supplier = ?',
      'billing_from = ?', 'delivery_to = ?', 'pay_terms = ?', 'pinning = ?',
      'packing_type = ?', 'rate_type = ?', 'freight = ?', 'delivery_dt = ?', 'remarks = ?',
      'cgst_pct = ?', 'sgst_pct = ?', 'igst_pct = ?',
      'sub_total = ?', 'cgst_amt = ?', 'sgst_amt = ?', 'igst_amt = ?', 'net_value = ?',
    ];
    const setVals = [
      fpo_no, fpo_date || null, supplier,
      billing_from || null, delivery_to || null,
      pay_terms || null, pinning || null,
      packing_type || null, rate_type || null,
      freight || null, delivery_dt || null, remarks || null,
      cgst_pct  || 0, sgst_pct  || 0, igst_pct  || 0,
      sub_total || 0, cgst_amt  || 0, sgst_amt  || 0,
      igst_amt  || 0, net_value || 0,
    ];

    const optionalFieldMap = {
      ship_from:       ship_from || null,
      company_id:      company_id || null,
      due_date:        due_date || null,
      place_of_supply: place_of_supply || null,
      advance:         advance || 0,
      description:     description || null,
    };
    for (const [col, val] of Object.entries(optionalFieldMap)) {
      if (fpoCols.has(col)) { setParts.push(`${col} = ?`); setVals.push(val); }
    }

    setVals.push(req.params.id);

    await conn.query(
      `UPDATE fabric_purchase_orders SET ${setParts.join(', ')} WHERE id = ?`,
      setVals
    );

    await conn.query('DELETE FROM fpo_items WHERE fpo_id = ?', [req.params.id]);
    for (const item of items) {
      await conn.query(
        `INSERT INTO fpo_items
           (fpo_id, sort_no, construction, hsn_code, qty, rate, basic_value)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id,
          item.sort_no      || '',
          item.construction || '',
          item.hsn_code     || '',
          item.qty          || 0,
          item.rate         || 0,
          item.basic_value  || 0,
        ]
      );
    }

    await conn.commit();
    console.log('✅ FPO UPDATE success — id:', req.params.id);
    res.json({ message: 'Updated' });

  } catch (err) {
    await conn.rollback();
    console.error('❌ PUT /fabric-purchase-orders/:id ERROR:', err.message);
    res.status(500).json({ message: err.message, code: err.code, sqlMessage: err.sqlMessage });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// DELETE /api/fabric-purchase-invoices/:id
//
// Deletes a Purchase Invoice and — critically — unlinks it from its
// source FPO by clearing fabric_purchase_orders.status/invoice_id/
// invoice_no back to 'open'/NULL. Without this second step, deleting an
// invoice would leave its FPO permanently stuck at status='invoiced'
// with a dangling invoice_id, and the FPO's own DELETE route would keep
// rejecting it with a 409 forever (see fabric-purchase-orders.js).
// ─────────────────────────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[invoice]] = await conn.query(
      'SELECT id, fpo_id, invoice_no, internal_ref_no FROM fabric_purchase_invoices WHERE id = ?',
      [req.params.id]
    );

    if (!invoice) {
      await conn.rollback();
      return res.status(404).json({ message: 'Purchase Invoice not found.' });
    }

    // Delete line items first (FK child), then the invoice itself.
    await conn.query('DELETE FROM fabric_purchase_invoice_items WHERE invoice_id = ?', [req.params.id]);
    await conn.query('DELETE FROM fabric_purchase_invoices WHERE id = ?', [req.params.id]);

    // Unlink the source FPO so it becomes deletable/editable again — this
    // is the step that actually resolves the FPO-delete 409.
    if (invoice.fpo_id) {
      await conn.query(
        `UPDATE fabric_purchase_orders
         SET status = 'open', invoice_id = NULL, invoice_no = NULL
         WHERE id = ?`,
        [invoice.fpo_id]
      );
      console.log(`✅ Unlinked FPO id=${invoice.fpo_id} from deleted invoice "${invoice.internal_ref_no}" — FPO is now deletable again.`);
    }

    await conn.commit();
    console.log('✅ Purchase Invoice DELETE success — id:', req.params.id);
    res.json({ message: 'Deleted', unlinked_fpo_id: invoice.fpo_id || null });

  } catch (err) {
    await conn.rollback();
    console.error('❌ DELETE /fabric-purchase-invoices/:id ERROR:', err.message, '| code:', err.code, '| sqlMessage:', err.sqlMessage);

    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({
        message: 'Cannot delete this invoice — other records still reference it. Remove those first.',
        code: err.code,
        sqlMessage: err.sqlMessage,
      });
    }

    res.status(500).json({ message: err.message, code: err.code, sqlMessage: err.sqlMessage });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. DELETE FPO  (DELETE /:id)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[fpo]] = await conn.query(
      'SELECT plan_id, invoice_id, invoice_no, status FROM fabric_purchase_orders WHERE id = ?',
      [req.params.id]
    );

    if (!fpo) {
      await conn.rollback();
      return res.status(404).json({ message: 'FPO not found.' });
    }

    if (fpo.invoice_id || fpo.status === 'invoiced' || fpo.status === 'completed') {
      await conn.rollback();
      return res.status(409).json({
        message: `Cannot delete this FPO — it has already been converted to Purchase Invoice "${fpo.invoice_no || fpo.invoice_id}". Delete or unlink that invoice first.`,
      });
    }

    if (fpo.plan_id) {
      const cols       = await getPlanColumns();
      const clearParts = [];
      if (cols.has('fpo_id')) clearParts.push('fpo_id = NULL');
      if (cols.has('fpo_no')) clearParts.push('fpo_no = NULL');
      if (clearParts.length > 0) {
        await conn.query(
          `UPDATE production_plans SET ${clearParts.join(', ')} WHERE id = ?`,
          [fpo.plan_id]
        );
        console.log(`✅ Unlinked plan id=${fpo.plan_id} — it will reappear in pending-purchase`);
      }
    }

    await conn.query('DELETE FROM fpo_items WHERE fpo_id = ?', [req.params.id]);
    await conn.query('DELETE FROM fabric_purchase_orders WHERE id = ?', [req.params.id]);

    await conn.commit();
    console.log('✅ FPO DELETE success — id:', req.params.id);
    res.json({ message: 'Deleted' });

  } catch (err) {
    await conn.rollback();
    console.error('❌ DELETE /fabric-purchase-orders/:id ERROR:', err.message, '| code:', err.code, '| sqlMessage:', err.sqlMessage);

    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({
        message: 'Cannot delete this FPO — other records still reference it (e.g. a converted Purchase Invoice). Remove those first.',
        code: err.code,
        sqlMessage: err.sqlMessage,
      });
    }

    res.status(500).json({ message: err.message, code: err.code, sqlMessage: err.sqlMessage });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. CONVERT FPO → PURCHASE INVOICE  (POST /:id/convert-to-invoice)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/convert-to-invoice', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[fpo]] = await conn.query(
      'SELECT * FROM fabric_purchase_orders WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!fpo) {
      await conn.rollback();
      return res.status(404).json({ message: 'FPO not found' });
    }

    if (fpo.status === 'invoiced' || fpo.status === 'completed' || fpo.invoice_id) {
      await conn.rollback();
      return res.status(409).json({
        message: `This FPO was already converted to invoice "${fpo.invoice_no}".`,
      });
    }

    const { invoice_no, invoice_date } = req.body || {};
    if (!invoice_no || !invoice_date) {
      await conn.rollback();
      return res.status(400).json({ message: 'invoice_no and invoice_date are required to convert an FPO.' });
    }

    const [items] = await conn.query(
      'SELECT * FROM fpo_items WHERE fpo_id = ? ORDER BY id ASC',
      [req.params.id]
    );

    const total_qty    = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    const basic_value  = items.reduce((s, it) => s + (Number(it.basic_value) || 0), 0);
    const rate         = total_qty > 0 ? +(basic_value / total_qty).toFixed(2) : 0;

    const internal_ref_no = await generateNextInternalRefNo(conn);

    const [r] = await conn.query(
      `INSERT INTO fabric_purchase_invoices (
        internal_ref_no, invoice_no, invoice_date,
        fpo_id, fpo_no, fpo_date, supplier,
        billing_from, delivery_to, pay_terms, rate_type, freight, remarks,
        total_qty, rate, basic_value,
        discount_percent, discount_amount,
        sub_total, cgst_pct, cgst_amt, sgst_pct, sgst_amt, igst_pct, igst_amt,
        round_off, net_value,
        payment_due_date, prepared_by, checked_by, authorised_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        internal_ref_no, invoice_no, invoice_date,
        fpo.id, fpo.fpo_no, fpo.fpo_date, fpo.supplier,
        fpo.billing_from, fpo.delivery_to, fpo.pay_terms, fpo.rate_type, fpo.freight, fpo.remarks,
        total_qty, rate, basic_value,
        0, 0,
        fpo.sub_total, fpo.cgst_pct, fpo.cgst_amt, fpo.sgst_pct, fpo.sgst_amt, fpo.igst_pct, fpo.igst_amt,
        0, fpo.net_value,
        null, req.user?.name || null, null, null,
      ]
    );
    const invoiceId = r.insertId;

    for (const [i, it] of items.entries()) {
      await conn.query(
        `INSERT INTO fabric_purchase_invoice_items
           (invoice_id, s_no, sort_no, construction, hsn_code, qty, rate, basic_value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId, i + 1,
          it.sort_no      || '',
          it.construction || '',
          it.hsn_code     || '',
          it.qty          || 0,
          it.rate         || 0,
          it.basic_value  || 0,
        ]
      );
    }

    await conn.query(
      `UPDATE fabric_purchase_orders SET status = 'invoiced', invoice_no = ?, invoice_id = ? WHERE id = ?`,
      [internal_ref_no, invoiceId, req.params.id]
    );

    await conn.commit();
    console.log(`✅ FPO ${fpo.fpo_no} converted to Purchase Invoice ${internal_ref_no} (id ${invoiceId})`);
    res.status(201).json({ id: invoiceId, invoice_no: internal_ref_no });

  } catch (err) {
    await conn.rollback();
    console.error('❌ POST /fabric-purchase-orders/:id/convert-to-invoice ERROR:', err.message);
    res.status(500).json({ message: err.message, code: err.code, sqlMessage: err.sqlMessage });
  } finally {
    conn.release();
  }
});

module.exports = router;