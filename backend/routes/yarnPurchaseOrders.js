/**
 * routes/yarnPurchaseOrders.js
 *
 * FIXES IN THIS VERSION (responding to the "0 of 0 HSN codes" lookup bug):
 *
 * 18. ROOT CAUSE OF THE EMPTY HSN DROPDOWN: this file was hardcoding the
 *     table name "hsn_master" in every HSN-related query and in
 *     tableExists('hsn_master'). But the standalone HSN Master CRUD module
 *     (hsnRoutes.js, mounted at /api/hsn) actually reads and writes a table
 *     called hsn_codes — not hsn_master. Since hsn_master either doesn't
 *     exist or is a different/empty table in this database, tableExists()
 *     was returning false, hsnTableOk stayed false, and /meta/lookup always
 *     returned hsnCodes: [] — which is exactly the "No HSN codes found /
 *     0 of 0 codes" the frontend dropdown was showing.
 *
 *     Fixed by adding getHsnTableName(), which checks for 'hsn_codes' FIRST
 *     (since that's what the actual HSN Master screen uses) and falls back
 *     to 'hsn_master' for safety, caching whichever one is found. Every
 *     place that used to hardcode the literal "hsn_master" table name —
 *     getYarnSchema(), the yarns query in /meta/lookup, the hsnCodes query
 *     in /meta/lookup, and BOTH hsn joins inside fetchPO() (h_item and
 *     h_yarn) — now uses this resolved name instead.
 *
 * Everything below this point keeps fixes 13-17 from the previous version
 * (dynamic yarn_master count/count_type columns, fetchPO() schema-safe
 * item query, hsn_short_desc + gst_percent in the HSN select, dynamic
 * work_orders FK resolution, cached yarn schema) unchanged in behaviour —
 * only the table name they point at for HSN data has changed.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// ─── Safe value helpers ───────────────────────────────────────────────────────
const str = (v) =>
  v === undefined || v === null || v === 'undefined' || v === 'null'
    ? null : String(v).trim() || null;

const num = (v) => {
  if (v === undefined || v === null || v === '' || v === 'undefined' || v === 'null') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

// ─── Schema introspection helpers ─────────────────────────────────────────────
// getColumns() fetches + caches a table's real column names from
// information_schema. pickColumn() then finds the first candidate name that
// actually exists, so we never have to hardcode a guess — and when NOTHING
// in the candidate list matches, callers log the full real column list so
// the actual name is visible in the server console instead of staying a
// silent mystery.
const _columnCache = new Map();

async function getColumns(table) {
  if (_columnCache.has(table)) return _columnCache.get(table);
  try {
    const [rows] = await db.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
    const cols = rows.map(r => r.COLUMN_NAME);
    _columnCache.set(table, cols);
    return cols;
  } catch (e) {
    console.warn(`[schema] getColumns(${table}) failed:`, e.message);
    return [];
  }
}

function pickColumn(columns, candidates) {
  for (const c of candidates) {
    if (columns.includes(c)) return c;
  }
  return null;
}

async function hasColumn(table, column) {
  const cols = await getColumns(table);
  return cols.includes(column);
}

async function tableExists(table) {
  try {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
    return rows[0].cnt > 0;
  } catch (e) {
    console.warn(`[schema] tableExists(${table}) check failed:`, e.message);
    return false;
  }
}

// ─── Shared HSN table name resolution ─────────────────────────────────────────
// FIX #18: the HSN Master CRUD screen (hsnRoutes.js, /api/hsn) actually
// stores rows in a table called hsn_codes — not hsn_master. This was
// hardcoded as hsn_master everywhere in this file, so every HSN lookup
// silently matched nothing. Resolved once, cached, and tried in priority
// order: hsn_codes (the real table) first, hsn_master as a fallback in
// case some deployments genuinely use that name instead.
let _hsnTableNameCache;

async function getHsnTableName() {
  if (_hsnTableNameCache !== undefined) return _hsnTableNameCache;
  for (const candidate of ['hsn_codes', 'hsn_master']) {
    if (await tableExists(candidate)) {
      _hsnTableNameCache = candidate;
      return candidate;
    }
  }
  console.warn('[schema] Neither "hsn_codes" nor "hsn_master" table found in this database — all HSN lookups will be empty.');
  _hsnTableNameCache = null;
  return null;
}

// ─── Shared yarn_master schema resolution ─────────────────────────────────────
// Resolved once and cached — both /meta/lookup and fetchPO() need to know
// the real count / count_type / hsn_code_id column names on yarn_master,
// plus which table (hsn_codes / hsn_master) actually holds HSN rows.
let _yarnSchemaCache = null;

async function getYarnSchema() {
  if (_yarnSchemaCache) return _yarnSchemaCache;

  const cols = await getColumns('yarn_master');

  const countCol = pickColumn(cols, [
    'count', 'actual_count', 'yarn_count', 'count_value', 'ne_count', 'count_no', 'yarn_count_value',
  ]);
  const countTypeCol = pickColumn(cols, [
    'count_type', 'count_unit', 'yarn_count_type', 'count_uom', 'yarn_type',
  ]);
  const hsnIdCol = pickColumn(cols, ['hsn_code_id', 'hsn_id', 'hsn_master_id']);
  const hsnTable = await getHsnTableName();
  const hsnTableOk = !!hsnTable;

  if (!countCol) {
    console.warn('[schema] yarn_master has no recognizable "count" column. Actual columns:', cols.join(', '));
  }
  if (!countTypeCol) {
    console.warn('[schema] yarn_master has no recognizable "count_type" column. Actual columns:', cols.join(', '));
  }

  _yarnSchemaCache = { cols, countCol, countTypeCol, hsnIdCol, hsnTableOk, hsnTable };
  return _yarnSchemaCache;
}

// ─── Compute net_value from a DB item row ─────────────────────────────────────
// Mirrors the frontend computeItem() logic so both sides agree.
// Formula: net_value = total_po_value + (total_po_value × gst_pct/100)
//                                     + (total_po_value × sgst_pct/100)
//                                     + (total_po_value × igst_pct/100)
function calcNetValue(it) {
  const poVal = parseFloat(it.total_po_value) || 0;
  const gst   = parseFloat(it.gst_pct)        || 0;
  const sgst  = parseFloat(it.sgst_pct)       || 0;
  const igst  = parseFloat(it.igst_pct)       || 0;
  return (poVal + poVal * (gst / 100) + poVal * (sgst / 100) + poVal * (igst / 100)).toFixed(2);
}

// ─── Auto-generate PO number ──────────────────────────────────────────────────
async function generatePoNumber(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(rec_no, '-', -1) AS UNSIGNED)) AS max_seq
     FROM yarn_purchase_orders WHERE rec_no LIKE ?`,
    [`YPO-${year}-%`],
  );
  const nextSeq = (row.max_seq ?? 0) + 1;
  return `YPO-${year}-${String(nextSeq).padStart(4, '0')}`;
}

// ─── Fetch full PO by id ──────────────────────────────────────────────────────
async function fetchPO(id) {
  const [[row]] = await db.query(
    `SELECT ypo.*,
            s.supplier_name,
            s.address    AS sup_address,  s.pin_code AS sup_pin_code,
            s.district   AS sup_district, s.state    AS sup_state,
            s.country    AS sup_country,  s.gst_no   AS sup_gst_no,
            bs.supplier_name AS billing_supplier_name,
            ms.supplier_name AS mill_supplier_name,
            ca.company_name,
            ca.address   AS comp_address,  ca.pin_code AS comp_pin_code,
            ca.district  AS comp_district, ca.state    AS comp_state,
            ca.country   AS comp_country,  ca.gst_no   AS comp_gst_no,
            pt.payment_term_name, pt.payment_term_days,
            a.agent_name
     FROM yarn_purchase_orders ypo
     LEFT JOIN suppliers         s   ON ypo.supplier_id         = s.id
     LEFT JOIN suppliers         bs  ON ypo.billing_supplier_id = bs.id
     LEFT JOIN suppliers         ms  ON ypo.mill_supplier_id    = ms.id
     LEFT JOIN company_addresses ca  ON ypo.company_address_id  = ca.id
     LEFT JOIN payment_terms     pt  ON ypo.payment_term_id     = pt.id
     LEFT JOIN agents            a   ON ypo.agent_id            = a.id
     WHERE ypo.id = ?`,
    [id],
  );
  if (!row) return null;

  // ── Items ────────────────────────────────────────────────────────────────
  // count / count_type / hsn_code_id on yarn_master are resolved dynamically
  // via getYarnSchema() instead of being hardcoded as ym.count / ym.count_type
  // (FIX #14). hsnTable is now resolved dynamically too (FIX #18) instead of
  // being hardcoded as "hsn_master" — both the h_item join (per-line-item
  // snapshot FK on yarn_po_items.hsn_code_id) and the h_yarn join (yarn's
  // *current* HSN mapping, used as a fallback for legacy rows saved before
  // hsn_code_id existed) now point at whichever table actually holds the
  // HSN rows (hsn_codes, normally).
  const { countCol, countTypeCol, hsnIdCol, hsnTableOk, hsnTable } = await getYarnSchema();

  const yarnSelect = `ym.yarn_code, ym.short_name, ym.category,
            ${countCol     ? `ym.${countCol} AS count`         : 'NULL AS count'},
            ${countTypeCol ? `ym.${countTypeCol} AS count_type` : 'NULL AS count_type'}`;

  const hsnItemJoin = hsnTableOk
    ? `LEFT JOIN ${hsnTable} h_item ON ypi.hsn_code_id = h_item.id`
    : '';
  const hsnYarnJoin = (hsnIdCol && hsnTableOk)
    ? `LEFT JOIN ${hsnTable} h_yarn ON ym.${hsnIdCol} = h_yarn.id`
    : '';
  // hsn_code_value prefers the per-item snapshot (h_item, via ypi.hsn_code_id)
  // and falls back to the yarn's *current* HSN mapping (h_yarn) only when the
  // snapshot is missing — i.e. legacy rows saved before this column existed.
  // If the HSN table can't be resolved at all, both joins are skipped above
  // and this falls back to NULL rather than referencing a join that isn't there.
  const hsnValueSel = !hsnTableOk
    ? 'NULL AS hsn_code_value'
    : (hsnIdCol
      ? 'COALESCE(h_item.hsn_code, h_yarn.hsn_code) AS hsn_code_value'
      : 'h_item.hsn_code AS hsn_code_value');

  const [items] = await db.query(
    `SELECT ypi.*,
            ${yarnSelect},
            ${hsnValueSel},
            dt.discount_type_name, dt.discount_pct AS discount_type_default_pct,
            u.uom_name
     FROM yarn_po_items ypi
     LEFT JOIN yarn_master    ym      ON ypi.yarn_id          = ym.id
     ${hsnItemJoin}
     ${hsnYarnJoin}
     LEFT JOIN discount_types dt      ON ypi.discount_type_id = dt.id
     LEFT JOIN uom_master     u       ON ypi.uom_id           = u.id
     WHERE ypi.po_id = ?
     ORDER BY ypi.line_no`,
    [id],
  );

  // CO links: resolve pwo_ids as array of strings
  const [coLinks] = await db.query(
    `SELECT ycl.*,
            ob.order_code AS co_no,
            ob.id         AS co_ob_id,
            ob.customer_name,
            GROUP_CONCAT(yclpw.wo_id ORDER BY yclpw.id) AS pwo_ids_csv
     FROM yarn_po_co_links ycl
     LEFT JOIN order_bookings       ob    ON ycl.co_id     = ob.id
     LEFT JOIN yarn_po_co_link_pwos yclpw ON yclpw.link_id = ycl.id
     WHERE ycl.po_id = ?
     GROUP BY ycl.id`,
    [id],
  );

  return {
    ...row,
    items: items.map(it => ({
      ...it,
      _id:       `item-${it.id}`,
      net_value: calcNetValue(it),   // computed — not stored in DB
    })),
    co_links: coLinks.map(l => ({
      ...l,
      _id:     `co-${l.id}`,
      pwo_ids: l.pwo_ids_csv ? l.pwo_ids_csv.split(',') : [],
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /meta/lookup
// Returns all master data needed by the form.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/meta/lookup', async (_req, res) => {
  try {

    // ── Suppliers ──────────────────────────────────────────────────────────────
    let suppliers = [];
    try {
      [suppliers] = await db.query(
        `SELECT id, supplier_name, address, pin_code, district, state, country, gst_no
         FROM suppliers WHERE status = 'Active' ORDER BY supplier_name`,
      );
    } catch (e) { console.warn('[lookup] suppliers failed:', e.message); }

    // ── Agents ────────────────────────────────────────────────────────────────
    let agents = [];
    try {
      [agents] = await db.query(
        `SELECT id, agent_name, commission_pct
         FROM agents WHERE status = 'Active' ORDER BY agent_name`,
      );
    } catch (e) { console.warn('[lookup] agents failed:', e.message); }

    // ── Yarns (with Count + HSN autofill) ─────────────────────────────────────
    // count / count_type are resolved against a list of likely alternate
    // column names (FIX #13). hsnTable is now resolved dynamically instead
    // of hardcoded "hsn_master" (FIX #18), so this join actually finds rows
    // when the real table is hsn_codes.
    let yarns = [];
    try {
      const { countCol, countTypeCol, hsnIdCol, hsnTableOk, hsnTable, cols } = await getYarnSchema();

      const hsnJoin   = (hsnIdCol && hsnTableOk) ? `LEFT JOIN ${hsnTable} h ON ym.${hsnIdCol} = h.id` : '';
      const hsnValSel = (hsnIdCol && hsnTableOk) ? 'h.hsn_code AS hsn_code_value' : 'NULL AS hsn_code_value';

      [yarns] = await db.query(
        `SELECT ym.id, ym.yarn_code, ym.short_name, ym.category,
                ${countCol     ? `ym.${countCol} AS count`         : 'NULL AS count'},
                ${countTypeCol ? `ym.${countTypeCol} AS count_type` : 'NULL AS count_type'},
                ${hsnIdCol     ? `ym.${hsnIdCol} AS hsn_code_id`    : 'NULL AS hsn_code_id'},
                ${hsnValSel}
         FROM yarn_master ym
         ${hsnJoin}
         WHERE ym.status = 'Active'
         ORDER BY ym.short_name`,
      );


      if (!countCol || !countTypeCol) {
        console.warn('[lookup] yarn_master actual columns:', cols.join(', '));
      }
    } catch (e) {
      console.error('[lookup] yarns query failed:', e.message);
    }

    // ── UOMs ─────────────────────────────────────────────────────────────────
    let uoms = [];
    try {
      [uoms] = await db.query(
        `SELECT id, uom_name FROM uom_master ORDER BY uom_name`,
      );
    } catch (e) { console.warn('[lookup] uoms failed:', e.message); }

    // ── Discount Types — includes discount_pct for frontend autofill ──────────
    let discountTypes = [];
    try {
      [discountTypes] = await db.query(
        `SELECT id, discount_type_name, discount_pct
         FROM discount_types WHERE status = 'Active' ORDER BY discount_type_name`,
      );
    } catch (e) {
      console.warn('[lookup] discount_types with discount_pct failed:', e.message);
      try {
        [discountTypes] = await db.query(
          `SELECT id, discount_type_name, NULL AS discount_pct
           FROM discount_types WHERE status = 'Active' ORDER BY discount_type_name`,
        );
      } catch (e2) { console.warn('[lookup] discount_types fallback failed:', e2.message); }
    }

    // ── Payment Terms ─────────────────────────────────────────────────────────
    let paymentTerms = [];
    try {
      [paymentTerms] = await db.query(
        `SELECT id, payment_term_name, payment_term_days
         FROM payment_terms ORDER BY payment_term_name`,
      );
    } catch (e) { console.warn('[lookup] payment_terms failed:', e.message); }

    // ── Company Addresses ─────────────────────────────────────────────────────
    let companyAddresses = [];
    try {
      [companyAddresses] = await db.query(
        `SELECT id, company_name, address, pin_code, district, state, country, gst_no
         FROM company_addresses WHERE status = 'Active' ORDER BY company_name`,
      );
    } catch (e) { console.warn('[lookup] companyAddresses failed:', e.message); }

    // ── Customer Orders ───────────────────────────────────────────────────────
    let customerOrders = [];
    try {
      [customerOrders] = await db.query(
        `SELECT id, order_code AS co_no, customer_name, order_date AS co_date
         FROM order_bookings
         ORDER BY id DESC LIMIT 200`,
      );
    } catch (e) { console.warn('[lookup] customerOrders failed:', e.message); }

    // ── Work Orders (PWOs) ─────────────────────────────────────────────────────
    // Introspects work_orders' real columns and tries a list of likely FK
    // names to order_bookings before falling back to the co_no
    // collation-safe string match, then to no join at all (FIX #16).
    let pwos = [];
    try {
      const woCols = await getColumns('work_orders');
      const fkCol = pickColumn(woCols, [
        'co_id', 'customer_order_id', 'order_booking_id', 'booking_id', 'ob_id', 'order_id',
      ]);

      if (!fkCol) {
        throw new Error('no FK column found on work_orders');
      }

      [pwos] = await db.query(
        `SELECT wo.id, wo.wo_no, wo.status,
                ob.id          AS co_id,
                ob.order_code  AS co_no
         FROM work_orders wo
         LEFT JOIN order_bookings ob ON ob.id = wo.${fkCol}
         WHERE wo.status NOT IN ('Cancelled')
         ORDER BY wo.id DESC LIMIT 500`,
      );

    } catch (e) {

      try {
        [pwos] = await db.query(
          `SELECT wo.id,
                  wo.wo_no,
                  wo.status,
                  ob.id          AS co_id,
                  ob.order_code  AS co_no
           FROM work_orders wo
           LEFT JOIN order_bookings ob
             ON CONVERT(wo.co_no USING utf8mb4) COLLATE utf8mb4_0900_ai_ci
              = CONVERT(ob.order_code USING utf8mb4) COLLATE utf8mb4_0900_ai_ci
           WHERE wo.status NOT IN ('Cancelled')
           ORDER BY wo.id DESC LIMIT 500`,
        );

      } catch (e2) {
        console.warn('[lookup] pwos collation fix failed:', e2.message);
        try {
          [pwos] = await db.query(
            `SELECT id, wo_no, status,
                    NULL AS co_id,
                    co_no
             FROM work_orders
             WHERE status NOT IN ('Cancelled')
             ORDER BY id DESC LIMIT 500`,
          );

        } catch (e3) { console.warn('[lookup] pwos all strategies failed:', e3.message); }
      }
    }

    // ── HSN Codes ───────────────────────────────────────────────────────────
    // FIX #18: table name resolved dynamically via getHsnTableName() instead
    // of being hardcoded as "hsn_master" — the actual table the HSN Master
    // CRUD screen reads/writes is hsn_codes, which is why this previously
    // always returned an empty array. Column resolution (hsn_short_desc,
    // gst_percent, optional status filter) still dynamic per FIX #15.
    let hsnCodes = [];
    try {
      const hsnTable = await getHsnTableName();
      if (hsnTable) {
        const hsnCols = await getColumns(hsnTable);
        const hasDesc      = hsnCols.includes('description');
        const shortDescCol = pickColumn(hsnCols, ['hsn_short_desc', 'short_desc', 'short_description']);
        const gstPctCol    = pickColumn(hsnCols, ['gst_percent', 'gst_pct', 'gst_rate']);
        const hasStatus    = hsnCols.includes('status');

        // No dedicated "short description" column exists in some schemas —
        // reuse the plain "description" column for hsn_short_desc too, so
        // the frontend's HsnDropdown (which expects hsn_short_desc) still
        // has something to display instead of going blank.
        const shortDescSelect = shortDescCol
          ? `${shortDescCol} AS hsn_short_desc`
          : (hasDesc ? 'description AS hsn_short_desc' : 'NULL AS hsn_short_desc');

        [hsnCodes] = await db.query(
          `SELECT id, hsn_code,
                  ${hasDesc ? 'description' : 'NULL AS description'},
                  ${shortDescSelect},
                  ${gstPctCol ? `${gstPctCol} AS gst_percent` : 'NULL AS gst_percent'}
           FROM ${hsnTable}
           ${hasStatus ? "WHERE status = 'Active'" : ''}
           ORDER BY hsn_code`,
        );


        if (hsnCodes.length === 0) {
          console.warn(`[lookup] "${hsnTable}" table exists but has 0 rows — add HSN codes via the HSN Master screen.`);
        }
        if (!gstPctCol) {
          console.warn(`[lookup] "${hsnTable}" has no recognizable GST% column. Actual columns:`, hsnCols.join(', '));
        }
      } else {
        console.warn('[lookup] Neither "hsn_codes" nor "hsn_master" table found in this database — HSN dropdown will be empty.');
      }
    } catch (e) {
      console.error('[lookup] hsnCodes query failed:', e.message);
    }

    res.json({
      suppliers,
      agents,
      yarns,
      uoms,
      discountTypes,
      paymentTerms,
      companyAddresses,
      customerOrders,
      pwos,
      hsnCodes,
    });

  } catch (err) {
    console.error('[GET /yarn-purchase-orders/meta/lookup]', err);
    res.status(500).json({ message: 'Failed to load lookup data', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /   (list with pagination, search, status filter)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ` AND (ypo.rec_no LIKE ? OR s.supplier_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
      where += ` AND ypo.status = ?`;
      params.push(status);
    }

    const [rows] = await db.query(
      `SELECT ypo.*, s.supplier_name, s.state
       FROM yarn_purchase_orders ypo
       LEFT JOIN suppliers s ON ypo.supplier_id = s.id
       ${where}
       ORDER BY ypo.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );

    // Hydrate items for each PO (for net_value & total_po_value display in list)
    const ids = rows.map(r => r.id);
    const itemsMap = {};
    if (ids.length) {
      const [allItems] = await db.query(
        `SELECT po_id, total_po_value, gst_pct, sgst_pct, igst_pct
         FROM yarn_po_items WHERE po_id IN (?)`,
        [ids],
      );
      allItems.forEach(it => {
        if (!itemsMap[it.po_id]) itemsMap[it.po_id] = [];
        itemsMap[it.po_id].push({
          ...it,
          net_value: calcNetValue(it),
        });
      });
    }

    const data = rows.map(r => ({ ...r, items: itemsMap[r.id] ?? [] }));

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM yarn_purchase_orders ypo
       LEFT JOIN suppliers s ON ypo.supplier_id = s.id
       ${where}`,
      params,
    );

    res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /yarn-purchase-orders]', err);
    res.status(500).json({ message: 'Failed to fetch purchase orders', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id   (single PO with full items + co_links)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const po = await fetchPO(req.params.id);
    if (!po) return res.status(404).json({ message: 'Purchase order not found' });
    res.json(po);
  } catch (err) {
    console.error('[GET /yarn-purchase-orders/:id]', err);
    res.status(500).json({ message: 'Error fetching purchase order', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /   (create)
// NOTE: total_weight, no_of_cone_per_bag, total_po_value are GENERATED columns
//       in yarn_po_items — do NOT include them in INSERT.
//       net_value is NOT stored — computed on read by calcNetValue().
//       hsn_code_id IS stored — it's a snapshot FK to the HSN table, captured
//       from the yarn selected on the frontend at save time.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const body     = req.body;
    const rec_no   = await generatePoNumber(conn);
    const rec_date = str(body.rec_date) ?? new Date().toISOString().slice(0, 10);

    // ── Header ────────────────────────────────────────────────────────────────
    const [result] = await conn.query(
      `INSERT INTO yarn_purchase_orders
         (rec_no, rec_date,
          supplier_id, order_through, agent_id, commission_pct, rate_type,
          billing_same_as_supplier, billing_supplier_id,
          bill_address, bill_pin_code, bill_district, bill_state, bill_country, bill_gst_no,
          mill_same_as_supplier, mill_supplier_id,
          mill_address, mill_pin_code, mill_district, mill_state, mill_country, mill_gst_no,
          company_address_id,
          comp_address, comp_pin_code, comp_district, comp_state, comp_country, comp_gst_no,
          exp_delivery, payment_term_id, transport_freight_terms,
          status, created_at)
       VALUES (?,?,  ?,?,?,?,?,  ?,?,  ?,?,?,?,?,?,  ?,?,  ?,?,?,?,?,?,  ?,  ?,?,?,?,?,?,  ?,?,?,  ?,NOW())`,
      [
        rec_no, rec_date,
        num(body.supplier_id), str(body.order_through) ?? 'Direct',
        num(body.agent_id), num(body.commission_pct), str(body.rate_type) ?? 'Net rate',
        str(body.billing_same_as_supplier) ?? 'Yes', num(body.billing_supplier_id),
        str(body.bill_address), str(body.bill_pin_code), str(body.bill_district),
        str(body.bill_state), str(body.bill_country), str(body.bill_gst_no),
        str(body.mill_same_as_supplier) ?? 'Yes', num(body.mill_supplier_id),
        str(body.mill_address), str(body.mill_pin_code), str(body.mill_district),
        str(body.mill_state), str(body.mill_country), str(body.mill_gst_no),
        num(body.company_address_id),
        str(body.comp_address), str(body.comp_pin_code), str(body.comp_district),
        str(body.comp_state), str(body.comp_country), str(body.comp_gst_no),
        str(body.exp_delivery) || null, num(body.payment_term_id),
        str(body.transport_freight_terms) ?? 'Paid',
        str(body.status) ?? 'Draft',
      ],
    );

    const poId = result.insertId;

    // ── Yarn line items — NO generated columns in INSERT ──────────────────────
    const items = Array.isArray(body.items) ? body.items : [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.yarn_id) continue;

      // Recalculate computed fields server-side (don't trust frontend values)
      const pkgs = parseFloat(it.no_of_packages)    || 0;
      const wpp  = parseFloat(it.weight_per_package) || 0;
      const cw   = parseFloat(it.cone_weight)        || 0;
      const rate = parseFloat(it.rate)               || 0;
      const disc = parseFloat(it.discount_pct)       || 0;
      const gst  = parseFloat(it.gst_pct)            || 0;
      const sgst = parseFloat(it.sgst_pct)           || 0;
      const igst = parseFloat(it.igst_pct)           || 0;

      const total_weight       = parseFloat((pkgs * wpp).toFixed(3));
      const no_of_cone_per_bag = cw > 0 ? parseFloat((wpp / cw).toFixed(2)) : null;
      const rawValue           = pkgs * wpp * rate;
      const total_po_value     = parseFloat((rawValue - rawValue * (disc / 100)).toFixed(2));
      const net_value          = parseFloat((total_po_value * (1 + gst / 100 + sgst / 100 + igst / 100)).toFixed(2));

      // hsn_code_id: snapshot of the yarn's HSN mapping at save time, sent by the
      // frontend (lookup.yarns[].hsn_code_id) — kept independent of later edits
      // to the Yarn Master so historical POs always show the GST classification
      // that was actually used.
      await conn.query(
        `INSERT INTO yarn_po_items
           (po_id, line_no,
            yarn_id, hsn_code_id, count_for_po, lot_no, uom_id, package_type,
            no_of_packages, weight_per_package, cone_weight, no_of_cone_per_bag,
            total_weight,
            rate, discount_type_id, discount_pct,
            total_po_value,
            gst_pct, sgst_pct, igst_pct,
            net_value,
            instructions)
         VALUES (?,?,  ?,?,?,?,?,?,  ?,?,?,?,  ?,  ?,?,?,  ?,  ?,?,?,  ?,  ?)`,
        [
          poId, i + 1,
          num(it.yarn_id), num(it.hsn_code_id), str(it.count_for_po), str(it.lot_no), num(it.uom_id),
          str(it.package_type),
          num(it.no_of_packages), num(it.weight_per_package), num(it.cone_weight),
          no_of_cone_per_bag,
          total_weight,
          num(it.rate), num(it.discount_type_id), num(it.discount_pct),
          total_po_value,
          num(it.gst_pct), num(it.sgst_pct), num(it.igst_pct),
          net_value,
          str(it.instructions),
        ],
      );
    }

    // ── CO links + PWO selections ─────────────────────────────────────────────
    const coLinks = Array.isArray(body.co_links) ? body.co_links : [];
    for (const link of coLinks) {
      if (!link.co_id) continue;
      const [lr] = await conn.query(
        `INSERT INTO yarn_po_co_links (po_id, co_id, required_kgs) VALUES (?,?,?)`,
        [poId, num(link.co_id), num(link.required_kgs)],
      );
      const linkId = lr.insertId;
      for (const wid of (link.pwo_ids ?? []).filter(Boolean)) {
        await conn.query(
          `INSERT INTO yarn_po_co_link_pwos (link_id, wo_id) VALUES (?,?)`,
          [linkId, num(wid)],
        );
      }
    }

    await conn.commit();
    const saved = await fetchPO(poId);
    res.status(201).json(saved);
  } catch (err) {
    await conn.rollback();
    console.error('[POST /yarn-purchase-orders]', err.message, err.sql ?? '');
    res.status(500).json({ message: 'Failed to create purchase order', detail: err.message });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:id   (update)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;
    const body   = req.body;

    // ── Header update ─────────────────────────────────────────────────────────
    await conn.query(
      `UPDATE yarn_purchase_orders SET
         rec_date=?,
         supplier_id=?, order_through=?, agent_id=?, commission_pct=?, rate_type=?,
         billing_same_as_supplier=?, billing_supplier_id=?,
         bill_address=?, bill_pin_code=?, bill_district=?, bill_state=?, bill_country=?, bill_gst_no=?,
         mill_same_as_supplier=?, mill_supplier_id=?,
         mill_address=?, mill_pin_code=?, mill_district=?, mill_state=?, mill_country=?, mill_gst_no=?,
         company_address_id=?,
         comp_address=?, comp_pin_code=?, comp_district=?, comp_state=?, comp_country=?, comp_gst_no=?,
         exp_delivery=?, payment_term_id=?, transport_freight_terms=?,
         status=?, updated_at=NOW()
       WHERE id=?`,
      [
        str(body.rec_date),
        num(body.supplier_id), str(body.order_through) ?? 'Direct',
        num(body.agent_id), num(body.commission_pct), str(body.rate_type) ?? 'Net rate',
        str(body.billing_same_as_supplier) ?? 'Yes', num(body.billing_supplier_id),
        str(body.bill_address), str(body.bill_pin_code), str(body.bill_district),
        str(body.bill_state), str(body.bill_country), str(body.bill_gst_no),
        str(body.mill_same_as_supplier) ?? 'Yes', num(body.mill_supplier_id),
        str(body.mill_address), str(body.mill_pin_code), str(body.mill_district),
        str(body.mill_state), str(body.mill_country), str(body.mill_gst_no),
        num(body.company_address_id),
        str(body.comp_address), str(body.comp_pin_code), str(body.comp_district),
        str(body.comp_state), str(body.comp_country), str(body.comp_gst_no),
        str(body.exp_delivery) || null, num(body.payment_term_id),
        str(body.transport_freight_terms) ?? 'Paid',
        str(body.status) ?? 'Draft',
        id,
      ],
    );

    // ── Replace yarn line items ───────────────────────────────────────────────
    await conn.query('DELETE FROM yarn_po_items WHERE po_id = ?', [id]);
    const items = Array.isArray(body.items) ? body.items : [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.yarn_id) continue;
      await conn.query(
        `INSERT INTO yarn_po_items
           (po_id, line_no,
            yarn_id, hsn_code_id, count_for_po, lot_no, uom_id, package_type,
            no_of_packages, weight_per_package, cone_weight,
            rate, discount_type_id, discount_pct,
            gst_pct, sgst_pct, igst_pct,
            instructions)
         VALUES (?,?,  ?,?,?,?,?,?,  ?,?,?,  ?,?,?,  ?,?,?,  ?)`,
        [
          id, i + 1,
          num(it.yarn_id), num(it.hsn_code_id), str(it.count_for_po), str(it.lot_no), num(it.uom_id),
          str(it.package_type),
          num(it.no_of_packages), num(it.weight_per_package), num(it.cone_weight),
          num(it.rate), num(it.discount_type_id), num(it.discount_pct),
          num(it.gst_pct), num(it.sgst_pct), num(it.igst_pct),
          str(it.instructions),
        ],
      );
    }

    // ── Replace CO links ──────────────────────────────────────────────────────
    const [existingLinks] = await conn.query(
      'SELECT id FROM yarn_po_co_links WHERE po_id = ?', [id],
    );
    for (const l of existingLinks) {
      await conn.query('DELETE FROM yarn_po_co_link_pwos WHERE link_id = ?', [l.id]);
    }
    await conn.query('DELETE FROM yarn_po_co_links WHERE po_id = ?', [id]);

    const coLinks = Array.isArray(body.co_links) ? body.co_links : [];
    for (const link of coLinks) {
      if (!link.co_id) continue;
      const [lr] = await conn.query(
        `INSERT INTO yarn_po_co_links (po_id, co_id, required_kgs) VALUES (?,?,?)`,
        [id, num(link.co_id), num(link.required_kgs)],
      );
      const linkId = lr.insertId;
      for (const wid of (link.pwo_ids ?? []).filter(Boolean)) {
        await conn.query(
          `INSERT INTO yarn_po_co_link_pwos (link_id, wo_id) VALUES (?,?)`,
          [linkId, num(wid)],
        );
      }
    }

    await conn.commit();
    const updated = await fetchPO(id);
    res.json(updated);
  } catch (err) {
    await conn.rollback();
    console.error('[PUT /yarn-purchase-orders/:id]', err.message, err.sql ?? '');
    res.status(500).json({ message: 'Failed to update purchase order', detail: err.message });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    // Delete child rows first (FK constraints)
    const [links] = await conn.query(
      'SELECT id FROM yarn_po_co_links WHERE po_id = ?', [id],
    );
    for (const l of links) {
      await conn.query('DELETE FROM yarn_po_co_link_pwos WHERE link_id = ?', [l.id]);
    }
    await conn.query('DELETE FROM yarn_po_co_links WHERE po_id = ?', [id]);
    await conn.query('DELETE FROM yarn_po_items     WHERE po_id = ?', [id]);
    await conn.query('DELETE FROM yarn_purchase_orders WHERE id = ?', [id]);

    await conn.commit();
    res.json({ message: 'Purchase order deleted' });
  } catch (err) {
    await conn.rollback();
    console.error('[DELETE /yarn-purchase-orders/:id]', err);
    res.status(500).json({ message: 'Failed to delete purchase order', detail: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;