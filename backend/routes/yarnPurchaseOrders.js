/**
 * routes/yarnPurchaseOrders.js
 *
 * THIS REVISION — fixes the "Company (Print Header) still empty" bug that
 * persisted even after company_details (the REAL Company Details Master,
 * confirmed via companyDetailsRoutes.js) was populated.
 *
 * ROOT CAUSE: getCompanyTableName() picked the FIRST table in the candidate
 * list that merely EXISTED, regardless of whether it had any rows. An
 * earlier troubleshooting step created an empty `company_addresses` table.
 * Because `company_addresses` was probed before `company_details` in the
 * candidate list, it won the probe every time — even though it was empty —
 * and the result was cached in-process (`_companyTableCache`), permanently
 * shadowing the real, populated `company_details` table for the life of
 * the server.
 *
 * FIX (this revision):
 *   1. COMPANY_TABLE_CANDIDATES now lists `company_details` FIRST, matching
 *      the table actually used by companyDetailsRoutes.js.
 *   2. getCompanyTableName() now does a two-pass resolution:
 *        Pass 1 — pick the first candidate that EXISTS *and has rows*.
 *        Pass 2 — only if none have rows, fall back to the first candidate
 *                 that merely exists (so INSERT/CREATE still has somewhere
 *                 to write), with a loud console.warn since this is almost
 *                 certainly wrong if real data lives elsewhere.
 *   3. getCompanyMeta() now also resolves the LOGO and PHONE column names
 *      dynamically (company_details uses `logo_path` / `contact_no`, not
 *      `logo_url` / `phone`), instead of hardcoding `logo_url`/`phone` in
 *      every SELECT. The API response still aliases these AS logo_url /
 *      AS phone so the frontend (which expects those names) needs zero
 *      changes.
 *
 * Everything else — dynamic yarn_master columns, dynamic HSN table
 * resolution, schema-safe fetchPO, print-only optional fields (due_date /
 * place_of_supply / advance / description), FK-constraint-safe DELETE — is
 * unchanged from the previous revision.
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

// NEW — used by the two-pass company table resolution below, so we don't
// just pick a table because it exists; we prefer one that actually has data.
async function tableRowCount(table) {
  try {
    const [[row]] = await db.query(`SELECT COUNT(*) AS cnt FROM ${table}`);
    return row.cnt;
  } catch (e) {
    console.warn(`[schema] tableRowCount(${table}) failed:`, e.message);
    return 0;
  }
}

// ─── Shared HSN table name resolution (unchanged) ─────────────────────────────
let _hsnTableNameCache;
async function getHsnTableName() {
  if (_hsnTableNameCache !== undefined) return _hsnTableNameCache;
  for (const candidate of ['hsn_codes', 'hsn_master']) {
    if (await tableExists(candidate)) {
      _hsnTableNameCache = candidate;
      return candidate;
    }
  }
  console.warn('[schema] Neither "hsn_codes" nor "hsn_master" table found — all HSN lookups will be empty.');
  _hsnTableNameCache = null;
  return null;
}

// ─── Shared yarn_master schema resolution (unchanged) ─────────────────────────
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
  _yarnSchemaCache = { cols, countCol, countTypeCol, hsnIdCol, hsnTableOk, hsnTable };
  return _yarnSchemaCache;
}

// ─── Company Details Master resolution — "Company (Print Header)" ───────────
// company_details (per companyDetailsRoutes.js) is the REAL master used
// elsewhere in this codebase. It's listed first. The others remain as
// fallbacks in case a given deployment genuinely uses a differently named
// table — but resolution now prefers whichever candidate actually HAS ROWS,
// not just whichever exists first.
const COMPANY_TABLE_CANDIDATES = ['company_details', 'company_addresses', 'company_master', 'companies'];
const COMPANY_NAME_COL_CANDIDATES  = ['company_name', 'name', 'company', 'title'];
const COMPANY_LOGO_COL_CANDIDATES  = ['logo_path', 'logo_url', 'logo'];
const COMPANY_PHONE_COL_CANDIDATES = ['contact_no', 'phone', 'mobile'];

let _companyTableCache;
async function getCompanyTableName() {
  if (_companyTableCache !== undefined) return _companyTableCache;

  // Pass 1: prefer a candidate table that EXISTS and HAS ROWS. This is the
  // actual fix — previously the first *existing* table won regardless of
  // whether it had any data, which let an empty company_addresses table
  // permanently shadow a populated company_details table.
  for (const candidate of COMPANY_TABLE_CANDIDATES) {
    if (await tableExists(candidate)) {
      const rows = await tableRowCount(candidate);
      if (rows > 0) {
        console.log(`[schema] Company Details Master resolved to "${candidate}" (${rows} row(s)).`);
        _companyTableCache = candidate;
        return candidate;
      }
    }
  }

  // Pass 2: nothing had rows — fall back to the first table that merely
  // exists, so create/insert flows still have somewhere to write. Loud
  // warning because this is very likely NOT what you want if real company
  // data lives in one of the other candidates but happens to be empty too
  // (e.g. freshly created but not yet seeded).
  for (const candidate of COMPANY_TABLE_CANDIDATES) {
    if (await tableExists(candidate)) {
      console.warn(
        `[schema] No candidate company table had any rows — falling back to empty "${candidate}". ` +
        `Checked in order: ${COMPANY_TABLE_CANDIDATES.join(', ')}. ` +
        'If your real company data lives in one of these but still shows empty, insert at least one row into it.',
      );
      _companyTableCache = candidate;
      return candidate;
    }
  }

  console.warn(
    `[schema] No Company Details Master table found at all (checked: ${COMPANY_TABLE_CANDIDATES.join(', ')}). ` +
    'The "Company (Print Header)" picker will stay empty until one of these tables exists with rows in it.',
  );
  _companyTableCache = null;
  return null;
}

let _companyMetaCache = null;
async function getCompanyMeta() {
  if (_companyMetaCache) return _companyMetaCache;
  const table = await getCompanyTableName();
  if (!table) {
    _companyMetaCache = { table: null, nameCol: null, logoCol: null, phoneCol: null, cols: [] };
    return _companyMetaCache;
  }
  const cols = await getColumns(table);
  const nameCol  = pickColumn(cols, COMPANY_NAME_COL_CANDIDATES) || 'company_name';
  const logoCol  = pickColumn(cols, COMPANY_LOGO_COL_CANDIDATES);   // e.g. logo_path on company_details
  const phoneCol = pickColumn(cols, COMPANY_PHONE_COL_CANDIDATES);  // e.g. contact_no on company_details
  if (!cols.includes(nameCol)) {
    console.warn(`[schema] "${table}" has no recognizable company-name column (checked: ${COMPANY_NAME_COL_CANDIDATES.join(', ')}) — falling back to "company_name", which may error.`);
  }
  if (!logoCol) {
    console.warn(`[schema] "${table}" has no recognizable logo column (checked: ${COMPANY_LOGO_COL_CANDIDATES.join(', ')}) — letterhead will print without a logo.`);
  }
  _companyMetaCache = { table, nameCol, logoCol, phoneCol, cols };
  return _companyMetaCache;
}

// ─── yarn_purchase_orders optional print-field resolution (unchanged) ───────
let _ypoColsCache = null;
async function getYpoColumns() {
  if (_ypoColsCache) return _ypoColsCache;
  _ypoColsCache = await getColumns('yarn_purchase_orders');
  return _ypoColsCache;
}
const YPO_PRINT_FIELDS = ['due_date', 'place_of_supply', 'advance', 'description'];

// ─── Compute net_value from a DB item row ─────────────────────────────────────
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
  const { table: companyTable, nameCol: companyNameCol } = await getCompanyMeta();
  const companyJoin = companyTable
    ? `LEFT JOIN ${companyTable} ca ON ypo.company_address_id = ca.id`
    : '';
  const companyNameSelect = companyTable ? `ca.${companyNameCol} AS company_name` : 'NULL AS company_name';

  const [[row]] = await db.query(
    `SELECT ypo.*,
            s.supplier_name,
            s.address    AS sup_address_raw,  s.pin_code AS sup_pin_code_raw,
            s.district   AS sup_district_raw, s.state    AS sup_state_raw,
            s.country    AS sup_country_raw,  s.gst_no   AS sup_gst_no_raw,
            bs.supplier_name AS billing_supplier_name,
            ms.supplier_name AS mill_supplier_name,
            ${companyNameSelect},
            pt.payment_term_name, pt.payment_term_days,
            a.agent_name
     FROM yarn_purchase_orders ypo
     LEFT JOIN suppliers         s   ON ypo.supplier_id         = s.id
     LEFT JOIN suppliers         bs  ON ypo.billing_supplier_id = bs.id
     LEFT JOIN suppliers         ms  ON ypo.mill_supplier_id    = ms.id
     ${companyJoin}
     LEFT JOIN payment_terms     pt  ON ypo.payment_term_id     = pt.id
     LEFT JOIN agents            a   ON ypo.agent_id            = a.id
     WHERE ypo.id = ?`,
    [id],
  );
  if (!row) return null;

  const { countCol, countTypeCol, hsnIdCol, hsnTableOk, hsnTable } = await getYarnSchema();

  const yarnSelect = `ym.yarn_code, ym.short_name, ym.category,
            ${countCol     ? `ym.${countCol} AS count`         : 'NULL AS count'},
            ${countTypeCol ? `ym.${countTypeCol} AS count_type` : 'NULL AS count_type'}`;

  const hsnItemJoin = hsnTableOk ? `LEFT JOIN ${hsnTable} h_item ON ypi.hsn_code_id = h_item.id` : '';
  const hsnYarnJoin = (hsnIdCol && hsnTableOk) ? `LEFT JOIN ${hsnTable} h_yarn ON ym.${hsnIdCol} = h_yarn.id` : '';
  const hsnValueSel = !hsnTableOk
    ? 'NULL AS hsn_code_value'
    : (hsnIdCol
      ? 'COALESCE(h_item.hsn_code, h_yarn.hsn_code) AS hsn_code_value'
      : 'h_item.hsn_code AS hsn_code_value');

  // Wrapped in try/catch: a broken join here (e.g. order_bookings missing,
  // a renamed column) previously threw and took down the ENTIRE PO fetch
  // with a bare 500 — even though the core PO row above had already loaded
  // fine. Degrade to an empty array with a loud warning instead, so one PO
  // with an unusual item/co-link doesn't block viewing/editing/printing it.
  let items = [];
  try {
    [items] = await db.query(
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
  } catch (e) {
    console.error(`[fetchPO ${id}] items query failed:`, e.message, e.sql ?? '');
  }

  let coLinks = [];
  try {
    [coLinks] = await db.query(
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
  } catch (e) {
    console.error(`[fetchPO ${id}] co_links query failed:`, e.message, e.sql ?? '');
  }

  return {
    ...row,
    // Present the joined supplier address fields under the plain names the
    // frontend expects (sup_address, sup_pin_code, ...).
    sup_address:  row.sup_address_raw,
    sup_pin_code: row.sup_pin_code_raw,
    sup_district: row.sup_district_raw,
    sup_state:    row.sup_state_raw,
    sup_country:  row.sup_country_raw,
    sup_gst_no:   row.sup_gst_no_raw,
    items: items.map(it => ({
      ...it,
      _id:       `item-${it.id}`,
      net_value: calcNetValue(it),
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
// ─────────────────────────────────────────────────────────────────────────────
router.get('/meta/lookup', async (_req, res) => {
  try {
    let suppliers = [];
    try {
      [suppliers] = await db.query(
        `SELECT id, supplier_name, address, pin_code, district, state, country, gst_no
         FROM suppliers WHERE status = 'Active' ORDER BY supplier_name`,
      );
    } catch (e) { console.warn('[lookup] suppliers failed:', e.message); }

    let agents = [];
    try {
      [agents] = await db.query(
        `SELECT id, agent_name, commission_pct
         FROM agents WHERE status = 'Active' ORDER BY agent_name`,
      );
    } catch (e) { console.warn('[lookup] agents failed:', e.message); }

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
    } catch (e) { console.error('[lookup] yarns query failed:', e.message); }

    let uoms = [];
    try {
      [uoms] = await db.query(`SELECT id, uom_name FROM uom_master ORDER BY uom_name`);
    } catch (e) { console.warn('[lookup] uoms failed:', e.message); }

    let discountTypes = [];
    try {
      [discountTypes] = await db.query(
        `SELECT id, discount_type_name, discount_pct
         FROM discount_types WHERE status = 'Active' ORDER BY discount_type_name`,
      );
    } catch (e) {
      console.warn('[lookup] discount_types failed:', e.message);
      try {
        [discountTypes] = await db.query(
          `SELECT id, discount_type_name, NULL AS discount_pct
           FROM discount_types WHERE status = 'Active' ORDER BY discount_type_name`,
        );
      } catch (e2) { console.warn('[lookup] discount_types fallback failed:', e2.message); }
    }

    let paymentTerms = [];
    try {
      [paymentTerms] = await db.query(
        `SELECT id, payment_term_name, payment_term_days FROM payment_terms ORDER BY payment_term_name`,
      );
    } catch (e) { console.warn('[lookup] payment_terms failed:', e.message); }

    // ── Company Details Master — doubles as the "Company (Print Header)"
    // master. Resolves to whichever candidate table actually has rows (see
    // getCompanyTableName() two-pass resolution above), and reads whichever
    // column actually holds the logo/phone (logo_path/contact_no on
    // company_details) rather than assuming logo_url/phone. The result is
    // still aliased AS logo_url / AS phone so the frontend needs no changes.
    //
    // The status filter is applied ONLY if a `status` column exists on the
    // resolved table, and — if applying it returns zero rows — we retry
    // once without it and log a warning.
    let companyAddresses = [];
    try {
      const { table: companyTable, nameCol: companyNameCol, logoCol, phoneCol, cols: compCols } = await getCompanyMeta();

      if (!companyTable) {
        console.warn(
          `[lookup] companyAddresses: no Company Details Master table found among ${COMPANY_TABLE_CANDIDATES.join(', ')}.`,
        );
      } else {
        const hasStatus   = compCols.includes('status');
        const hasAddress  = compCols.includes('address');
        const hasPin      = compCols.includes('pin_code');
        const hasDistrict = compCols.includes('district');
        const hasState    = compCols.includes('state');
        const hasCountry  = compCols.includes('country');
        const hasGst      = compCols.includes('gst_no');
        const hasEmail    = compCols.includes('email');
        const hasCin      = compCols.includes('cin_no');

        const buildQuery = (withStatus) => `
          SELECT id, ${companyNameCol} AS company_name,
                 ${hasAddress  ? 'address'  : 'NULL AS address'},
                 ${hasPin      ? 'pin_code' : 'NULL AS pin_code'},
                 ${hasDistrict ? 'district' : 'NULL AS district'},
                 ${hasState    ? 'state'    : 'NULL AS state'},
                 ${hasCountry  ? 'country'  : 'NULL AS country'},
                 ${hasGst      ? 'gst_no'   : 'NULL AS gst_no'},
                 ${logoCol     ? `${logoCol} AS logo_url`  : 'NULL AS logo_url'},
                 ${phoneCol    ? `${phoneCol} AS phone`     : 'NULL AS phone'},
                 ${hasEmail    ? 'email'    : 'NULL AS email'},
                 ${hasCin      ? 'cin_no'   : 'NULL AS cin_no'}
          FROM ${companyTable}
          ${withStatus ? "WHERE status = 'Active'" : ''}
          ORDER BY ${companyNameCol}`;

        [companyAddresses] = await db.query(buildQuery(hasStatus));

        if (hasStatus && companyAddresses.length === 0) {
          console.warn(
            `[lookup] companyAddresses: 0 rows in "${companyTable}" matched status = 'Active' — ` +
            'retrying without the status filter so the Company (Print Header) picker is not empty. ' +
            'Check the actual status values in that table if this persists.',
          );
          [companyAddresses] = await db.query(buildQuery(false));
        }

        if (!logoCol) {
          console.warn(`[lookup] "${companyTable}" has no recognizable logo column — letterhead logos will be blank.`);
        }
        if (companyAddresses.length === 0) {
          console.warn(`[lookup] "${companyTable}" is still empty after fallback — the table itself has no rows. Insert at least one company.`);
        }

        // ── LOGO FIX ──────────────────────────────────────────────────────
        // company_details.logo_path (the column companyDetailsRoutes.js
        // actually writes to on upload) stores a BARE FILENAME, e.g.
        // "1730000000-logo.png" — it is only ever servable through that
        // route file's dedicated endpoint:
        //   GET /api/company-details/logo/:filename
        // There is no static file mount for it. The frontend's
        // resolveAssetUrl() just prepends the backend origin to whatever
        // logo_url it receives, so a bare filename silently 404s instead
        // of hitting that route.
        //
        // Fix at the source: rewrite bare filenames into the correct route
        // path here, once, so every consumer (Yarn PO picker + preview +
        // print letterhead) gets a URL that actually resolves. Only done
        // when the resolved logo column is `logo_path` (i.e. reading from
        // company_details) — if a different candidate table is in use
        // instead and already stores a full URL/static path, that value
        // is left untouched.
        if (logoCol === 'logo_path') {
          companyAddresses = companyAddresses.map(c => {
            const raw = c.logo_url;
            if (!raw) return c;
            const looksLikeUrlOrPath = /^(https?:|data:|blob:)/i.test(raw) || raw.startsWith('/');
            return looksLikeUrlOrPath
              ? c
              : { ...c, logo_url: `/api/company-details/logo/${raw}` };
          });
        }
      }
    } catch (e) { console.error('[lookup] companyAddresses query failed:', e.message); }

    let customerOrders = [];
    try {
      [customerOrders] = await db.query(
        `SELECT id, order_code AS co_no, customer_name, order_date AS co_date
         FROM order_bookings ORDER BY id DESC LIMIT 200`,
      );
    } catch (e) { console.warn('[lookup] customerOrders failed:', e.message); }

    let pwos = [];
    try {
      const woCols = await getColumns('work_orders');
      const fkCol = pickColumn(woCols, [
        'co_id', 'customer_order_id', 'order_booking_id', 'booking_id', 'ob_id', 'order_id',
      ]);
      if (!fkCol) throw new Error('no FK column found on work_orders');
      [pwos] = await db.query(
        `SELECT wo.id, wo.wo_no, wo.status, ob.id AS co_id, ob.order_code AS co_no
         FROM work_orders wo
         LEFT JOIN order_bookings ob ON ob.id = wo.${fkCol}
         WHERE wo.status NOT IN ('Cancelled')
         ORDER BY wo.id DESC LIMIT 500`,
      );
    } catch (e) {
      try {
        [pwos] = await db.query(
          `SELECT id, wo_no, status, NULL AS co_id, co_no
           FROM work_orders WHERE status NOT IN ('Cancelled')
           ORDER BY id DESC LIMIT 500`,
        );
      } catch (e2) { console.warn('[lookup] pwos fallback failed:', e2.message); }
    }

    let hsnCodes = [];
    try {
      const hsnTable = await getHsnTableName();
      if (hsnTable) {
        const hsnCols = await getColumns(hsnTable);
        const hasDesc      = hsnCols.includes('description');
        const shortDescCol = pickColumn(hsnCols, ['hsn_short_desc', 'short_desc', 'short_description']);
        const gstPctCol    = pickColumn(hsnCols, ['gst_percent', 'gst_pct', 'gst_rate']);
        const hasStatus    = hsnCols.includes('status');
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
      }
    } catch (e) { console.error('[lookup] hsnCodes query failed:', e.message); }

    res.json({
      suppliers, agents, yarns, uoms, discountTypes, paymentTerms,
      companyAddresses, customerOrders, pwos, hsnCodes,
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
    if (search) { where += ` AND (ypo.rec_no LIKE ? OR s.supplier_name LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
    if (status) { where += ` AND ypo.status = ?`; params.push(status); }

    const { table: companyTable, nameCol: companyNameCol } = await getCompanyMeta();
    const companyJoin = companyTable
      ? `LEFT JOIN ${companyTable} ca ON ypo.company_address_id = ca.id`
      : '';
    const companyNameSelect = companyTable ? `ca.${companyNameCol} AS print_company_name` : 'NULL AS print_company_name';

    const [rows] = await db.query(
      `SELECT ypo.*, s.supplier_name, s.state, ${companyNameSelect}
       FROM yarn_purchase_orders ypo
       LEFT JOIN suppliers s ON ypo.supplier_id = s.id
       ${companyJoin}
       ${where}
       ORDER BY ypo.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );

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
        itemsMap[it.po_id].push({ ...it, net_value: calcNetValue(it) });
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
// GET /:id
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
// POST /   (create) — persists due_date/place_of_supply/advance/description
// (print-only fields) via the optionalFieldMap pattern, unchanged.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const body     = req.body;
    const rec_no   = await generatePoNumber(conn);
    const rec_date = str(body.rec_date) ?? new Date().toISOString().slice(0, 10);
    const ypoCols  = await getYpoColumns();

    const columns = [
      'rec_no', 'rec_date',
      'supplier_id', 'order_through', 'agent_id', 'commission_pct', 'rate_type',
      'billing_same_as_supplier', 'billing_supplier_id',
      'bill_address', 'bill_pin_code', 'bill_district', 'bill_state', 'bill_country', 'bill_gst_no',
      'mill_same_as_supplier', 'mill_supplier_id',
      'mill_address', 'mill_pin_code', 'mill_district', 'mill_state', 'mill_country', 'mill_gst_no',
      'company_address_id',
      'comp_address', 'comp_pin_code', 'comp_district', 'comp_state', 'comp_country', 'comp_gst_no',
      'exp_delivery', 'payment_term_id', 'transport_freight_terms',
      'status', 'created_at',
    ];
    const values = [
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
      str(body.status) ?? 'Draft', new Date(),
    ];

    // Print-only optional fields (due_date, place_of_supply, advance, description)
    const optionalFieldMap = {
      due_date:        str(body.due_date) || str(body.exp_delivery) || null,
      place_of_supply: str(body.place_of_supply),
      advance:         num(body.advance) ?? 0,
      description:     str(body.description),
    };
    for (const [col, val] of Object.entries(optionalFieldMap)) {
      if (ypoCols.includes(col)) { columns.push(col); values.push(val); }
    }

    const placeholderParts = columns.map(c => (c === 'created_at' ? 'NOW()' : '?'));
    const insertValues = values.filter((_, i) => columns[i] !== 'created_at');

    const [result] = await conn.query(
      `INSERT INTO yarn_purchase_orders (${columns.join(', ')}) VALUES (${placeholderParts.join(', ')})`,
      insertValues,
    );

    const poId = result.insertId;

    const items = Array.isArray(body.items) ? body.items : [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.yarn_id) continue;
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

      await conn.query(
        `INSERT INTO yarn_po_items
           (po_id, line_no, yarn_id, hsn_code_id, count_for_po, lot_no, uom_id, package_type,
            no_of_packages, weight_per_package, cone_weight, no_of_cone_per_bag, total_weight,
            rate, discount_type_id, discount_pct, total_po_value,
            gst_pct, sgst_pct, igst_pct, net_value, instructions)
         VALUES (?,?, ?,?,?,?,?,?, ?,?,?,?, ?, ?,?,?, ?, ?,?,?, ?, ?)`,
        [
          poId, i + 1, num(it.yarn_id), num(it.hsn_code_id), str(it.count_for_po), str(it.lot_no), num(it.uom_id),
          str(it.package_type), num(it.no_of_packages), num(it.weight_per_package), num(it.cone_weight),
          no_of_cone_per_bag, total_weight, num(it.rate), num(it.discount_type_id), num(it.discount_pct),
          total_po_value, num(it.gst_pct), num(it.sgst_pct), num(it.igst_pct), net_value, str(it.instructions),
        ],
      );
    }

    const coLinks = Array.isArray(body.co_links) ? body.co_links : [];
    for (const link of coLinks) {
      if (!link.co_id) continue;
      const [lr] = await conn.query(
        `INSERT INTO yarn_po_co_links (po_id, co_id, required_kgs) VALUES (?,?,?)`,
        [poId, num(link.co_id), num(link.required_kgs)],
      );
      const linkId = lr.insertId;
      for (const wid of (link.pwo_ids ?? []).filter(Boolean)) {
        await conn.query(`INSERT INTO yarn_po_co_link_pwos (link_id, wo_id) VALUES (?,?)`, [linkId, num(wid)]);
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
// PUT /:id   (update) — same optional print-field persistence as POST.
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const body   = req.body;
    const ypoCols = await getYpoColumns();

    const setParts = [
      'rec_date=?',
      'supplier_id=?', 'order_through=?', 'agent_id=?', 'commission_pct=?', 'rate_type=?',
      'billing_same_as_supplier=?', 'billing_supplier_id=?',
      'bill_address=?', 'bill_pin_code=?', 'bill_district=?', 'bill_state=?', 'bill_country=?', 'bill_gst_no=?',
      'mill_same_as_supplier=?', 'mill_supplier_id=?',
      'mill_address=?', 'mill_pin_code=?', 'mill_district=?', 'mill_state=?', 'mill_country=?', 'mill_gst_no=?',
      'company_address_id=?',
      'comp_address=?', 'comp_pin_code=?', 'comp_district=?', 'comp_state=?', 'comp_country=?', 'comp_gst_no=?',
      'exp_delivery=?', 'payment_term_id=?', 'transport_freight_terms=?',
      'status=?', 'updated_at=NOW()',
    ];
    const setVals = [
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
    ];

    const optionalFieldMap = {
      due_date:        str(body.due_date) || str(body.exp_delivery) || null,
      place_of_supply: str(body.place_of_supply),
      advance:         num(body.advance) ?? 0,
      description:     str(body.description),
    };
    for (const [col, val] of Object.entries(optionalFieldMap)) {
      if (ypoCols.includes(col)) { setParts.push(`${col}=?`); setVals.push(val); }
    }
    setVals.push(id);

    await conn.query(`UPDATE yarn_purchase_orders SET ${setParts.join(', ')} WHERE id=?`, setVals);

    await conn.query('DELETE FROM yarn_po_items WHERE po_id = ?', [id]);
    const items = Array.isArray(body.items) ? body.items : [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.yarn_id) continue;
      await conn.query(
        `INSERT INTO yarn_po_items
           (po_id, line_no, yarn_id, hsn_code_id, count_for_po, lot_no, uom_id, package_type,
            no_of_packages, weight_per_package, cone_weight,
            rate, discount_type_id, discount_pct,
            gst_pct, sgst_pct, igst_pct, instructions)
         VALUES (?,?, ?,?,?,?,?,?, ?,?,?, ?,?,?, ?,?,?, ?)`,
        [
          id, i + 1, num(it.yarn_id), num(it.hsn_code_id), str(it.count_for_po), str(it.lot_no), num(it.uom_id),
          str(it.package_type), num(it.no_of_packages), num(it.weight_per_package), num(it.cone_weight),
          num(it.rate), num(it.discount_type_id), num(it.discount_pct),
          num(it.gst_pct), num(it.sgst_pct), num(it.igst_pct), str(it.instructions),
        ],
      );
    }

    const [existingLinks] = await conn.query('SELECT id FROM yarn_po_co_links WHERE po_id = ?', [id]);
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
        await conn.query(`INSERT INTO yarn_po_co_link_pwos (link_id, wo_id) VALUES (?,?)`, [linkId, num(wid)]);
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
// DELETE /:id — translates FK constraint errors into a clear 409.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    const [links] = await conn.query('SELECT id FROM yarn_po_co_links WHERE po_id = ?', [id]);
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
    console.error('[DELETE /yarn-purchase-orders/:id]', err.message, '| code:', err.code);
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({
        message: 'Cannot delete this purchase order — other records still reference it. Remove those first.',
        code: err.code,
      });
    }
    res.status(500).json({ message: 'Failed to delete purchase order', detail: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;