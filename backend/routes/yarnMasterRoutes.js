// backend/routes/yarnMasterRoutes.js
// Full CRUD — Yarn Master + Yarn Type Master + Count System Master
// Uses mysql2/promise pool  →  require('../db/connection')
//
// FIX: DELETE now removes child rows (yarn_fiber_certifications, yarn_fibers,
//      yarn_primary_certifications) BEFORE deleting yarn_master to avoid FK errors.

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// ══════════════════════════════════════════════════════════════
// STARTUP HELPER
// ══════════════════════════════════════════════════════════════
async function ensureYarnHsnColumn() {
  try {
    const [cols] = await db.query(`SHOW COLUMNS FROM yarn_master LIKE 'hsn_code'`);
    if (cols.length === 0) {
      await db.query(
        `ALTER TABLE yarn_master ADD COLUMN hsn_code VARCHAR(20) NULL AFTER hsn_code_id`
      );
      console.log('[startup] yarn_master.hsn_code column added successfully.');
    } else {
      console.log('[startup] yarn_master.hsn_code column already exists — OK.');
    }
  } catch (e) {
    console.warn('[startup] ensureYarnHsnColumn failed:', e.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────
const num = (v) => {
  if (v === undefined || v === null || v === '' || v === 'undefined' || v === 'null') return null;
  const n = Number(v); return isNaN(n) ? null : n;
};
const str = (v) =>
  v === undefined || v === null || v === 'undefined' || v === 'null'
    ? null
    : String(v).trim() || null;

async function resolveBrandId(conn, brandName) {
  if (!brandName || !brandName.trim()) return null;
  const name = brandName.trim();
  const [[existing]] = await conn.query(
    'SELECT id FROM yarn_brands WHERE brand_name = ? LIMIT 1', [name]
  );
  if (existing) return existing.id;
  const [r] = await conn.query(
    "INSERT INTO yarn_brands (brand_name, status) VALUES (?, 'Active')", [name]
  );
  return r.insertId;
}

async function resolveFiberId(conn, fiberName) {
  if (!fiberName || !fiberName.trim()) return null;
  const name = fiberName.trim();
  const [[existing]] = await conn.query(
    'SELECT id FROM fibers WHERE fiber_name = ? LIMIT 1', [name]
  );
  if (existing) return existing.id;
  const [r] = await conn.query(
    "INSERT INTO fibers (fiber_name, status) VALUES (?, 'Active')", [name]
  );
  return r.insertId;
}

async function resolveBrandName(conn, brandId) {
  const id = num(brandId);
  if (!id) return null;
  const [[row]] = await conn.query(
    'SELECT brand_name FROM yarn_brands WHERE id = ? LIMIT 1', [id]
  );
  return row ? String(row.brand_name).trim() : null;
}

async function resolveFiberName(conn, fiberId) {
  const id = num(fiberId);
  if (!id) return null;
  const [[row]] = await conn.query(
    'SELECT fiber_name FROM fibers WHERE id = ? LIMIT 1', [id]
  );
  return row ? String(row.fiber_name).trim() : null;
}

async function resolveYarnTypeName(conn, yarnTypeId) {
  const id = num(yarnTypeId);
  if (!id) return null;
  const [[row]] = await conn.query(
    'SELECT yarn_type FROM yarn_types WHERE id = ? LIMIT 1', [id]
  );
  return row ? row.yarn_type : null;
}

async function syncPrimaryCerts(conn, yarnId, certIds) {
  await conn.query(
    'DELETE FROM yarn_primary_certifications WHERE yarn_id = ?', [yarnId]
  );
  const ids = Array.isArray(certIds) ? certIds.map(Number).filter(Boolean) : [];
  for (const certId of ids) {
    await conn.query(
      'INSERT IGNORE INTO yarn_primary_certifications (yarn_id, certification_id) VALUES (?, ?)',
      [yarnId, certId]
    );
  }
}

async function fetchPrimaryCertIds(yarnId) {
  try {
    const [rows] = await db.query(
      'SELECT certification_id FROM yarn_primary_certifications WHERE yarn_id = ? ORDER BY certification_id',
      [yarnId]
    );
    return rows.map((r) => r.certification_id);
  } catch {
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
// HSN column auto-detection
// ══════════════════════════════════════════════════════════════
let _hsnColsCache = null;

async function resolveHsnColumns() {
  if (_hsnColsCache !== null) return _hsnColsCache;
  try {
    const [cols] = await db.query(`SHOW COLUMNS FROM \`hsn_codes\``);
    const names = cols.map(c => c.Field);
    console.log('[resolveHsnColumns] Actual hsn_codes columns:', names);

    const idCol = names.includes('id') ? 'id' : names[0];
    const codeCol =
      names.find(n => /^hsn[_-]?code$/i.test(n))
      || names.find(n => /hsn.*code|^code$/i.test(n))
      || names.find(n => /code/i.test(n) && n !== idCol)
      || (names.length > 1 ? names[1] : null);

    if (!codeCol) {
      console.error('[resolveHsnColumns] Could not identify HSN code column in:', names);
      _hsnColsCache = false;
      return false;
    }

    const descCol = names.find(n => /desc|short_desc|description|title|name/i.test(n)
                                    && n !== idCol && n !== codeCol)
                    || null;
    const hasStatus = names.includes('status');

    _hsnColsCache = { idCol, codeCol, descCol, hasStatus };
    console.log('[resolveHsnColumns] Resolved mapping:', _hsnColsCache);
  } catch (e) {
    console.error('[resolveHsnColumns] hsn_codes table not accessible:', e.message);
    _hsnColsCache = false;
  }
  return _hsnColsCache;
}

async function fetchHsnCodesForYarns() {
  const info = await resolveHsnColumns();
  if (!info) return [];
  const { idCol, codeCol, descCol, hasStatus } = info;
  const selectCols = [
    `\`${idCol}\` AS id`,
    `\`${codeCol}\` AS hsn_code`,
    descCol ? `\`${descCol}\` AS description` : 'NULL AS description',
  ].join(', ');
  const where = hasStatus
    ? `WHERE LOWER(TRIM(status)) IN ('active','1','yes','y','true')`
    : '';
  const [rows] = await db.query(
    `SELECT ${selectCols} FROM \`hsn_codes\` ${where} ORDER BY \`${codeCol}\``
  );
  return rows;
}

async function resolveHsnCodeValue(conn, hsnCodeId) {
  const id = num(hsnCodeId);
  if (!id) return null;
  const info = await resolveHsnColumns();
  if (!info) {
    console.warn('[resolveHsnCodeValue] HSN column info unavailable — hsn_code will be NULL');
    return null;
  }
  const { idCol, codeCol } = info;
  try {
    const [[row]] = await conn.query(
      `SELECT \`${codeCol}\` AS code FROM \`hsn_codes\` WHERE \`${idCol}\` = ? LIMIT 1`,
      [id],
    );
    if (!row) {
      console.warn(`[resolveHsnCodeValue] No row found in hsn_codes for id=${id}`);
      return null;
    }
    const val = String(row.code).trim();
    console.log(`[resolveHsnCodeValue] id=${id} → "${val}" (column: ${codeCol})`);
    return val;
  } catch (e) {
    console.error('[resolveHsnCodeValue] Query failed:', e.message);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// DIAGNOSTIC — visit /api/yarns/meta/debug in browser
// ══════════════════════════════════════════════════════════════
router.get('/meta/debug', async (_req, res) => {
  try {
    const report = {};
    const [tables] = await db.query('SHOW TABLES');
    const tableKey = Object.keys(tables[0] || {})[0];
    report.existing_tables = tables.map(t => t[tableKey]);

    const expected = [
      'yarn_master', 'colors', 'yarn_types', 'count_systems',
      'fibers', 'yarn_brands', 'certification',
      'hsn_codes', 'yarn_fibers', 'yarn_fiber_certifications',
      'yarn_primary_certifications',
    ];
    report.columns = {};
    for (const t of expected) {
      try {
        const [cols] = await db.query(`SHOW COLUMNS FROM \`${t}\``);
        report.columns[t] = cols.map(c => `${c.Field} (${c.Type})`);
      } catch (e) {
        report.columns[t] = `*** TABLE MISSING: ${e.message} ***`;
      }
    }

    _hsnColsCache = null;
    const hsnInfo = await resolveHsnColumns();
    report.hsn_column_detection = hsnInfo || 'FAILED — see server logs';

    res.json(report);
  } catch (e) {
    res.status(500).json({ fatal_error: e.message });
  }
});

router.get('/meta/debug-certs', async (_req, res) => {
  const report = {};
  const tableNames = ['certification', 'certifications', 'yarn_primary_certifications'];
  for (const t of tableNames) {
    try {
      const [cols] = await db.query(`SHOW COLUMNS FROM \`${t}\``);
      report[t] = { exists: true, columns: cols.map(c => c.Field) };
      try {
        const [rows] = await db.query(`SELECT * FROM \`${t}\` LIMIT 5`);
        report[t].sample_rows = rows;
        report[t].total_count = rows.length;
      } catch (e) {
        report[t].read_error = e.message;
      }
    } catch (e) {
      report[t] = { exists: false, error: e.message };
    }
  }
  res.json(report);
});

// ══════════════════════════════════════════════════════════════
// BACKFILL REPAIR ENDPOINT
// ══════════════════════════════════════════════════════════════
router.post('/meta/backfill-names', async (_req, res) => {
  const conn = await db.getConnection();
  try {
    const report = { yarn_fibers_fixed: 0, yarn_master_fixed: 0, errors: [] };

    const [fiberRows] = await conn.query(
      `SELECT id, brand_id, brand_name, fiber_id, fiber_name FROM yarn_fibers
       WHERE (brand_id IS NOT NULL AND (brand_name IS NULL OR brand_name = ''))
          OR (fiber_id  IS NOT NULL AND (fiber_name  IS NULL OR fiber_name  = ''))`
    );
    for (const row of fiberRows) {
      try {
        const newBrandName = row.brand_id ? await resolveBrandName(conn, row.brand_id) : row.brand_name;
        const newFiberName = row.fiber_id ? await resolveFiberName(conn, row.fiber_id) : row.fiber_name;
        await conn.query(
          'UPDATE yarn_fibers SET brand_name = ?, fiber_name = ? WHERE id = ?',
          [newBrandName, newFiberName, row.id]
        );
        report.yarn_fibers_fixed++;
      } catch (e) {
        report.errors.push(`yarn_fibers id=${row.id}: ${e.message}`);
      }
    }

    const [yarnRows] = await conn.query(
      `SELECT id, hsn_code_id, hsn_code FROM yarn_master
       WHERE hsn_code_id IS NOT NULL AND (hsn_code IS NULL OR hsn_code = '')`
    );
    for (const row of yarnRows) {
      try {
        const newHsnCode = await resolveHsnCodeValue(conn, row.hsn_code_id);
        if (newHsnCode) {
          await conn.query('UPDATE yarn_master SET hsn_code = ? WHERE id = ?', [newHsnCode, row.id]);
          report.yarn_master_fixed++;
        } else {
          report.errors.push(`yarn_master id=${row.id}: could not resolve hsn_code for hsn_code_id=${row.hsn_code_id}`);
        }
      } catch (e) {
        report.errors.push(`yarn_master id=${row.id}: ${e.message}`);
      }
    }

    res.json(report);
  } catch (err) {
    console.error('[POST /yarns/meta/backfill-names]', err);
    res.status(500).json({ message: 'Backfill failed', detail: err.message });
  } finally {
    conn.release();
  }
});

// ── Auto-generate YRN-YYYY-NNN ────────────────────────────────
async function generateYarnCode(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(yarn_code, '-', -1) AS UNSIGNED)) AS max_seq
     FROM yarn_master WHERE yarn_code LIKE ?`,
    [`YRN-${year}-%`],
  );
  return `YRN-${year}-${String((row.max_seq ?? 0) + 1).padStart(3, '0')}`;
}

// ── Fetch full yarn with fibers + certifications ──────────────
async function fetchYarn(id) {
  const hsnInfo      = await resolveHsnColumns();
  const hsnCodeExpr  = hsnInfo && hsnInfo.codeCol ? `h.\`${hsnInfo.codeCol}\`` : 'NULL';
  const hsnDescExpr  = hsnInfo && hsnInfo.descCol ? `h.\`${hsnInfo.descCol}\`` : 'NULL';

  const [[row]] = await db.query(
    `SELECT y.id,
            y.yarn_code,
            y.category,
            y.yarn_count,
            y.yarn_type        AS yarn_type_raw,
            y.uom,
            y.status,
            y.created_at,
            y.updated_at,
            y.hsn_code_id,
            y.hsn_code,
            y.number_of_filament,
            y.twist_unit,
            y.twist_value,
            y.twist_direction,
            y.formula,
            y.actual_count,
            y.short_name,
            y.yarn_type_id,
            y.count_system_id,
            y.color_id,
            y.ply,
            y.count_value,
            yt.yarn_type        AS yarn_type,
            cs.cs_name          AS count_system_name,
            cs.formula          AS count_system_formula,
            c.color_name,
            c.hex_code,
            ${hsnCodeExpr}      AS hsn_code_value,
            ${hsnDescExpr}      AS hsn_description
     FROM   yarn_master y
     LEFT JOIN yarn_types    yt ON yt.id = y.yarn_type_id
     LEFT JOIN count_systems cs ON cs.id = y.count_system_id
     LEFT JOIN colors         c ON c.id  = y.color_id
     LEFT JOIN hsn_codes      h ON h.id  = y.hsn_code_id
     WHERE y.id = ?`,
    [id],
  );
  if (!row) return null;

  const [fibers] = await db.query(
    `SELECT yf.id,
            yf.yarn_id,
            yf.row_order,
            yf.brand_id,
            yf.fiber_id,
            yf.fiber_percentage,
            yf.brand_name AS brand_name_stored,
            yf.fiber_name AS fiber_name_stored,
            b.brand_name,
            f.fiber_name
     FROM   yarn_fibers yf
     LEFT JOIN yarn_brands b ON b.id = yf.brand_id
     LEFT JOIN fibers      f ON f.id = yf.fiber_id
     WHERE  yf.yarn_id = ?
     ORDER  BY yf.row_order`,
    [id],
  );

  for (const fiber of fibers) {
    let certs = [];
    try {
      const [rows] = await db.query(
        `SELECT yfc.certification_id,
                cert.certification_name
         FROM   yarn_fiber_certifications yfc
         JOIN   certification cert ON cert.id = yfc.certification_id
         WHERE  yfc.yarn_fiber_id = ?`,
        [fiber.id],
      );
      certs = rows;
    } catch {
      /* no cert data */
    }
    fiber.certifications    = certs;
    fiber.certification_ids = certs.map((c) => c.certification_id);
    fiber.brand_name = fiber.brand_name ?? fiber.brand_name_stored ?? null;
    fiber.fiber_name = fiber.fiber_name ?? fiber.fiber_name_stored ?? null;
  }

  const primary_fiber_certification_ids = await fetchPrimaryCertIds(id);

  return { ...row, fibers, primary_fiber_certification_ids };
}

// ── syncFibers ─────────────────────────────────────────────
async function syncFibers(conn, yarnId, fiberArr) {
  const [existing] = await conn.query(
    'SELECT id FROM yarn_fibers WHERE yarn_id = ?', [yarnId],
  );
  for (const ef of existing) {
    await conn.query(
      'DELETE FROM yarn_fiber_certifications WHERE yarn_fiber_id = ?', [ef.id],
    );
  }
  await conn.query('DELETE FROM yarn_fibers WHERE yarn_id = ?', [yarnId]);

  const arr = Array.isArray(fiberArr) ? fiberArr : [];
  console.log(`[syncFibers] yarn_id=${yarnId} — incoming fiber rows:`, JSON.stringify(arr));

  for (let i = 0; i < arr.length; i++) {
    const f = arr[i];

    let brandId   = num(f.brand_id);
    let brandName = str(f.brand_name);

    if (brandName && !brandId) {
      brandId = await resolveBrandId(conn, brandName);
    } else if (brandId && !brandName) {
      brandName = await resolveBrandName(conn, brandId);
    } else if (brandName && brandId) {
      brandId = await resolveBrandId(conn, brandName);
    }

    let fiberId   = num(f.fiber_id);
    let fiberName = str(f.fiber_name);

    if (fiberName && !fiberId) {
      fiberId = await resolveFiberId(conn, fiberName);
    } else if (fiberId && !fiberName) {
      fiberName = await resolveFiberName(conn, fiberId);
    } else if (fiberName && fiberId) {
      fiberId = await resolveFiberId(conn, fiberName);
    }

    console.log(`[syncFibers] row ${i + 1} → INSERT:`, {
      yarnId, row_order: i + 1, brandId, brandName, fiberId, fiberName,
      fiber_percentage: parseFloat(f.fiber_percentage) || 0,
    });

    const [fRes] = await conn.query(
      `INSERT INTO yarn_fibers
         (yarn_id, row_order, brand_id, brand_name, fiber_id, fiber_name, fiber_percentage)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        yarnId, i + 1, brandId, brandName, fiberId, fiberName,
        parseFloat(f.fiber_percentage) || 0,
      ],
    );

    const [[verifyRow]] = await conn.query(
      'SELECT id, brand_id, brand_name, fiber_id, fiber_name, fiber_percentage FROM yarn_fibers WHERE id = ?',
      [fRes.insertId],
    );
    console.log(`[syncFibers] row ${i + 1} → VERIFIED:`, verifyRow);

    const certIds = Array.isArray(f.certification_ids) ? f.certification_ids : [];
    for (const certId of certIds) {
      await conn.query(
        'INSERT INTO yarn_fiber_certifications (yarn_fiber_id, certification_id) VALUES (?, ?)',
        [fRes.insertId, Number(certId)],
      );
    }
  }
}

// ══════════════════════════════════════════════════════════════
// YARN MASTER CRUD
// ══════════════════════════════════════════════════════════════

router.get('/', async (req, res) => {
  try {
    const { search = '', category = '', status = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ` AND (
        y.yarn_code  LIKE ? OR y.short_name  LIKE ?
        OR yt.yarn_type LIKE ? OR cs.cs_name LIKE ?
        OR c.color_name LIKE ?
      )`;
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }
    if (category) { where += ' AND y.category = ?'; params.push(category); }
    if (status)   { where += ' AND y.status = ?';   params.push(status);   }

    const [rows] = await db.query(
      `SELECT y.id, y.yarn_code, y.category, y.uom, y.count_value, y.ply,
              y.short_name, y.status, y.created_at, y.hsn_code_id, y.hsn_code,
              yt.yarn_type,
              cs.cs_name  AS count_system_name,
              c.color_name, c.hex_code
       FROM   yarn_master y
       LEFT JOIN yarn_types    yt ON yt.id = y.yarn_type_id
       LEFT JOIN count_systems cs ON cs.id = y.count_system_id
       LEFT JOIN colors         c ON c.id  = y.color_id
       ${where}
       ORDER BY y.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM   yarn_master y
       LEFT JOIN yarn_types    yt ON yt.id = y.yarn_type_id
       LEFT JOIN count_systems cs ON cs.id = y.count_system_id
       LEFT JOIN colors         c ON c.id  = y.color_id
       ${where}`,
      params,
    );

    res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /yarns]', err);
    res.status(500).json({ message: 'Failed to fetch yarns', detail: err.message, sql: err.sql });
  }
});

router.get('/meta/lookup', async (_req, res) => {
  try {
    const [yarnTypes]    = await db.query(
      "SELECT id, yarn_type FROM yarn_types WHERE status='Active' ORDER BY yarn_type"
    );
    const [countSystems] = await db.query(
      "SELECT id, cs_name, formula FROM count_systems WHERE status='Active' ORDER BY cs_name"
    );
    const [fibers]       = await db.query(
      "SELECT id, fiber_name FROM fibers WHERE status='Active' ORDER BY fiber_name"
    );
    const [brands]       = await db.query(
      "SELECT id, brand_name FROM yarn_brands WHERE status='Active' ORDER BY brand_name"
    );
    const [colors]       = await db.query(
      "SELECT id, color_name, hex_code FROM colors WHERE status='Active' ORDER BY color_name"
    );

    let hsnCodes = [];
    try {
      hsnCodes = await fetchHsnCodesForYarns();
      console.log(`[yarns/meta/lookup] Loaded ${hsnCodes.length} HSN codes`);
    } catch (e) {
      console.error('[yarns/meta/lookup] hsn_codes query failed:', e.message);
      hsnCodes = [];
    }

    let certifications = [];
    try {
      const [rows] = await db.query(
        `SELECT id, cert_id, certification_name, certification_body, valid_from, valid_to, status
         FROM   certification WHERE status = 'Active' ORDER BY certification_name`
      );
      certifications = rows;
    } catch (e) {
      console.warn(`[lookup] cert query with status filter failed: ${e.message} — retrying without filter`);
      try {
        const [rows] = await db.query(
          `SELECT id, cert_id, certification_name, certification_body, valid_from, valid_to, status
           FROM   certification ORDER BY certification_name`
        );
        certifications = rows;
      } catch (e2) {
        console.error(`[lookup] cert query failed entirely: ${e2.message}`);
        certifications = [];
      }
    }

    res.json({ yarnTypes, countSystems, fibers, brands, certifications, colors, hsnCodes });
  } catch (err) {
    console.error('[GET /yarns/meta/lookup]', err);
    res.status(500).json({ message: 'Failed to load lookup data', detail: err.message, sql: err.sql });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const yarn = await fetchYarn(req.params.id);
    if (!yarn) return res.status(404).json({ message: 'Yarn not found' });
    res.json(yarn);
  } catch (err) {
    console.error('[GET /yarns/:id]', err);
    res.status(500).json({ message: 'Error fetching yarn', detail: err.message });
  }
});

router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const yarnCode = await generateYarnCode(conn);

    const {
      category, yarn_type_id, count_system_id, color_id, hsn_code_id,
      count_value, ply, number_of_filament,
      twist_unit, twist_value, twist_direction,
      formula, actual_count, yarn_count,
      short_name, status, uom,
      fibers,
      primary_fiber_certification_ids,
    } = req.body;

    if (!category)        throw Object.assign(new Error('Category is required'),     { status: 400 });
    if (!yarn_type_id)    throw Object.assign(new Error('Yarn Type is required'),    { status: 400 });
    if (!count_system_id) throw Object.assign(new Error('Count System is required'), { status: 400 });
    if (!count_value)     throw Object.assign(new Error('Count Value is required'),  { status: 400 });

    const yarnTypeName = await resolveYarnTypeName(conn, yarn_type_id);
    const hsnCodeValue = await resolveHsnCodeValue(conn, hsn_code_id);
    console.log('[POST /yarns] hsn_code_id received =', hsn_code_id, '→ resolved hsn_code =', hsnCodeValue);

    const [result] = await conn.query(
      `INSERT INTO yarn_master
         (yarn_code, category, yarn_type_id, yarn_type, count_system_id, color_id, hsn_code_id, hsn_code,
          count_value, ply, number_of_filament,
          twist_unit, twist_value, twist_direction,
          formula, actual_count, yarn_count,
          short_name, status, uom)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        yarnCode, str(category), num(yarn_type_id), yarnTypeName, num(count_system_id),
        num(color_id), num(hsn_code_id), hsnCodeValue, num(count_value), num(ply) ?? 1,
        num(number_of_filament), str(twist_unit), num(twist_value), str(twist_direction),
        str(formula), num(actual_count), num(yarn_count), str(short_name),
        str(status) ?? 'Active', str(uom),
      ],
    );

    const yarnId = result.insertId;

    const fiberArr = Array.isArray(fibers) ? fibers
      : (typeof fibers === 'string' ? JSON.parse(fibers || '[]') : []);
    await syncFibers(conn, yarnId, fiberArr);
    await syncPrimaryCerts(conn, yarnId, primary_fiber_certification_ids);

    const [[verifyYarn]] = await conn.query(
      'SELECT id, hsn_code_id, hsn_code FROM yarn_master WHERE id = ?', [yarnId]
    );
    console.log('[POST /yarns] VERIFIED yarn_master row:', verifyYarn);

    await conn.commit();
    res.status(201).json(await fetchYarn(yarnId));
  } catch (err) {
    await conn.rollback();
    console.error('[POST /yarns]', err.message, err.sql ?? '');
    res.status(err.status ?? 500).json({
      message: err.message ?? 'Failed to create yarn',
      detail:  err.message,
      sql:     err.sql ?? null,
    });
  } finally {
    conn.release();
  }
});

router.put('/:id', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    const {
      category, yarn_type_id, count_system_id, color_id, hsn_code_id,
      count_value, ply, number_of_filament,
      twist_unit, twist_value, twist_direction,
      formula, actual_count, yarn_count,
      short_name, status, uom,
      fibers,
      primary_fiber_certification_ids,
    } = req.body;

    const yarnTypeName = await resolveYarnTypeName(conn, yarn_type_id);
    const hsnCodeValue = await resolveHsnCodeValue(conn, hsn_code_id);
    console.log('[PUT /yarns/:id] hsn_code_id received =', hsn_code_id, '→ resolved hsn_code =', hsnCodeValue);

    await conn.query(
      `UPDATE yarn_master SET
        category=?, yarn_type_id=?, yarn_type=?, count_system_id=?, color_id=?, hsn_code_id=?, hsn_code=?,
        count_value=?, ply=?, number_of_filament=?,
        twist_unit=?, twist_value=?, twist_direction=?,
        formula=?, actual_count=?, yarn_count=?,
        short_name=?, status=?, uom=?
       WHERE id=?`,
      [
        str(category), num(yarn_type_id), yarnTypeName, num(count_system_id), num(color_id),
        num(hsn_code_id), hsnCodeValue, num(count_value), num(ply) ?? 1, num(number_of_filament),
        str(twist_unit), num(twist_value), str(twist_direction), str(formula), num(actual_count),
        num(yarn_count), str(short_name), str(status) ?? 'Active', str(uom), id,
      ],
    );

    const fiberArr = Array.isArray(fibers) ? fibers
      : (typeof fibers === 'string' ? JSON.parse(fibers || '[]') : []);
    await syncFibers(conn, id, fiberArr);
    await syncPrimaryCerts(conn, id, primary_fiber_certification_ids);

    const [[verifyYarn]] = await conn.query(
      'SELECT id, hsn_code_id, hsn_code FROM yarn_master WHERE id = ?', [id]
    );
    console.log('[PUT /yarns/:id] VERIFIED yarn_master row:', verifyYarn);

    await conn.commit();
    res.json(await fetchYarn(id));
  } catch (err) {
    await conn.rollback();
    console.error('[PUT /yarns/:id]', err.message, err.sql ?? '');
    res.status(500).json({ message: 'Failed to update yarn', detail: err.message });
  } finally {
    conn.release();
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE  ★ FIXED — deletes child rows first to avoid FK errors
// Order: yarn_fiber_certifications → yarn_fibers
//        → yarn_primary_certifications → yarn_master
// ══════════════════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const yarnId = req.params.id;

    // 1. Verify the yarn exists
    const [[yarn]] = await conn.query(
      'SELECT id, yarn_code FROM yarn_master WHERE id = ? LIMIT 1', [yarnId]
    );
    if (!yarn) {
      await conn.rollback();
      return res.status(404).json({ message: 'Yarn not found' });
    }

    // 2. ★ NEW — Delete fabric_weft_yarns referencing this yarn
    try {
      await conn.query('DELETE FROM fabric_weft_yarns WHERE yarn_id = ?', [yarnId]);
    } catch (e) {
      console.warn('[DELETE] fabric_weft_yarns skip:', e.message);
    }

    // 3. Also check fabric_warp_yarns (same pattern — likely exists too)
    try {
      await conn.query('DELETE FROM fabric_warp_yarns WHERE yarn_id = ?', [yarnId]);
    } catch (e) {
      console.warn('[DELETE] fabric_warp_yarns skip:', e.message);
    }

    // 4. Delete yarn_fiber_certifications
    try {
      const [fiberRows] = await conn.query(
        'SELECT id FROM yarn_fibers WHERE yarn_id = ?', [yarnId]
      );
      for (const fiber of fiberRows) {
        await conn.query(
          'DELETE FROM yarn_fiber_certifications WHERE yarn_fiber_id = ?', [fiber.id]
        );
      }
    } catch (e) {
      console.warn('[DELETE] yarn_fiber_certifications skip:', e.message);
    }

    // 5. Delete yarn_fibers
    try {
      await conn.query('DELETE FROM yarn_fibers WHERE yarn_id = ?', [yarnId]);
    } catch (e) {
      console.warn('[DELETE] yarn_fibers skip:', e.message);
    }

    // 6. Delete yarn_primary_certifications
    try {
      await conn.query(
        'DELETE FROM yarn_primary_certifications WHERE yarn_id = ?', [yarnId]
      );
    } catch (e) {
      console.warn('[DELETE] yarn_primary_certifications skip:', e.message);
    }

    // 7. Finally delete yarn_master
    await conn.query('DELETE FROM yarn_master WHERE id = ?', [yarnId]);

    await conn.commit();
    console.log(`[DELETE /yarns/${yarnId}] "${yarn.yarn_code}" and all child rows deleted.`);
    res.json({ message: `Yarn ${yarn.yarn_code} deleted successfully` });

  } catch (err) {
    await conn.rollback();
    console.error('[DELETE /yarns/:id]', err.message, err.sql ?? '');
    res.status(500).json({
      message: err.message,
      detail:  err.message,
      sql:     err.sql ?? null,
    });
  } finally {
    conn.release();
  }
});

// ══════════════════════════════════════════════════════════════
// YARN TYPE MASTER  →  mount at /api/yarn-types in app.js
// ══════════════════════════════════════════════════════════════
const ytRouter = express.Router();

ytRouter.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE 1=1'; const params = [];
    if (search) { where += ' AND yarn_type LIKE ?'; params.push(`%${search}%`); }
    if (status) { where += ' AND status = ?'; params.push(status); }
    const [rows] = await db.query(
      `SELECT * FROM yarn_types ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM yarn_types ${where}`, params
    );
    res.json({ data: rows, total });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

ytRouter.post('/', async (req, res) => {
  try {
    const { yarn_type, status = 'Active' } = req.body;
    if (!yarn_type?.trim()) return res.status(400).json({ message: 'Yarn Type is required' });
    const [r] = await db.query(
      'INSERT INTO yarn_types (yarn_type, status) VALUES (?,?)', [yarn_type.trim(), status],
    );
    const [[row]] = await db.query('SELECT * FROM yarn_types WHERE id=?', [r.insertId]);
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

ytRouter.put('/:id', async (req, res) => {
  try {
    const { yarn_type, status } = req.body;
    await db.query(
      'UPDATE yarn_types SET yarn_type=?, status=? WHERE id=?',
      [yarn_type, status, req.params.id]
    );
    const [[row]] = await db.query('SELECT * FROM yarn_types WHERE id=?', [req.params.id]);
    res.json(row);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

ytRouter.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM yarn_types WHERE id=?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// COUNT SYSTEM MASTER  →  mount at /api/count-systems in app.js
// ══════════════════════════════════════════════════════════════
const csRouter = express.Router();

csRouter.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE 1=1'; const params = [];
    if (search) {
      where += ' AND (cs_name LIKE ? OR formula LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status) { where += ' AND status = ?'; params.push(status); }
    const [rows] = await db.query(
      `SELECT * FROM count_systems ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset],
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM count_systems ${where}`, params
    );
    res.json({ data: rows, total });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

csRouter.post('/', async (req, res) => {
  try {
    const { cs_name, formula, status = 'Active' } = req.body;
    if (!cs_name?.trim()) return res.status(400).json({ message: 'CS Name is required' });
    const [r] = await db.query(
      'INSERT INTO count_systems (cs_name, formula, status) VALUES (?,?,?)',
      [cs_name.trim(), formula?.trim() || null, status],
    );
    const [[row]] = await db.query('SELECT * FROM count_systems WHERE id=?', [r.insertId]);
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

csRouter.put('/:id', async (req, res) => {
  try {
    const { cs_name, formula, status } = req.body;
    await db.query(
      'UPDATE count_systems SET cs_name=?, formula=?, status=? WHERE id=?',
      [cs_name, formula?.trim() || null, status, req.params.id],
    );
    const [[row]] = await db.query('SELECT * FROM count_systems WHERE id=?', [req.params.id]);
    res.json(row);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

csRouter.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM count_systems WHERE id=?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = {
  yarnRouter:           router,
  yarnTypeRouter:       ytRouter,
  countSystemRouter:    csRouter,
  ensureYarnHsnColumn,
};