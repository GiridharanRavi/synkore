const express = require('express');
const router  = express.Router();
const db      = require('../db/connection'); // mysql2/promise pool

// ── Generate FAB-YYYY-NNN Fabric ID ───────────────────────────────────────────
async function generateFabricId(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(fabric_id, '-', -1) AS UNSIGNED)) AS max_seq
     FROM fabrics WHERE fabric_id LIKE ?`,
    [`FAB-${year}-%`],
  );
  const nextSeq = (row.max_seq ?? 0) + 1;
  return `FAB-${year}-${String(nextSeq).padStart(3, '0')}`;
}

// ── Helper: fetch full fabric record ──────────────────────────────────────────
async function fetchFabric(id) {
  const [[row]] = await db.query('SELECT * FROM fabrics WHERE id = ?', [id]);
  if (!row) return null;

  const [warpRows] = await db.query(
    `SELECT id, yarn_id, warp_count, actual_count AS act_cnt,
            ends, crimp_pct, vt_mtr AS wt_per_mtr,
            vt_mtr_vc AS wt_per_mtr_wc, display_order
     FROM fabric_warp_yarns
     WHERE fabric_id = ? ORDER BY display_order, id`,
    [id]
  );
  const [weftRows] = await db.query(
    `SELECT id, yarn_id, weft_count, actual_count AS act_cnt,
            onloom_pick, vt_mtr AS wt_per_mtr, display_order
     FROM fabric_weft_yarns
     WHERE fabric_id = ? ORDER BY display_order, id`,
    [id]
  );

  let attachments = [];
  try { attachments = row.attachments ? JSON.parse(row.attachments) : []; } catch { /* ignore */ }

  // hsn_code is VARCHAR(20) on `fabrics` — return as-is (string), no lookup needed.
  return { ...row, attachments, warp_details: warpRows, weft_details: weftRows };
}

// ── Calculation helpers ────────────────────────────────────────────────────────
function calcReedSpace(width) {
  const w = parseFloat(width);
  return isNaN(w) || w <= 0 ? null : +(w + 4).toFixed(4);
}

function calcWarpRow(row) {
  const ends  = parseFloat(row.ends);
  const cnt   = parseFloat(row.act_cnt);
  const crimp = parseFloat(row.crimp_pct);
  if (!ends || !cnt) return { wt_per_mtr: null, wt_per_mtr_wc: null };
  const wt   = ends / 1693 / cnt;
  const wtWC = isNaN(crimp) ? wt : wt * (1 + crimp / 100);
  return { wt_per_mtr: +wt.toFixed(6), wt_per_mtr_wc: +wtWC.toFixed(6) };
}

function calcWeftRow(row, fabricEnds, onloomReed, wastage) {
  const pick  = parseFloat(row.onloom_pick);
  const cnt   = parseFloat(row.act_cnt);
  const ends  = parseFloat(fabricEnds) || 0;
  const reed  = parseFloat(onloomReed);
  const wast  = parseFloat(wastage) || 0;
  if (!pick || !cnt || !reed) return null;
  const wt = ((ends / reed) + wast) * (pick / 1693 / cnt);
  return +wt.toFixed(6);
}

function calcFGSM(fabricWtPerMtr, widthInches) {
  const fw = parseFloat(fabricWtPerMtr);
  const w  = parseFloat(widthInches);
  if (!fw || !w) return null;
  return +(fw / (w * 0.0254)).toFixed(2);
}

function calcFabricTotals(warpArr, weftArr) {
  const warpWt   = warpArr.reduce((s, w) => s + (parseFloat(w.wt_per_mtr)    || 0), 0);
  const warpWtWC = warpArr.reduce((s, w) => s + (parseFloat(w.wt_per_mtr_wc) || 0), 0);
  const weftWt   = weftArr.reduce((s, w) => s + (parseFloat(w.wt_per_mtr)    || 0), 0);
  const fabricWt = warpWtWC + weftWt;
  return {
    warp_wt_per_mtr:    +warpWt.toFixed(6),
    warp_wt_per_mtr_wc: +warpWtWC.toFixed(6),
    weft_wt_per_mtr:    +weftWt.toFixed(6),
    fabric_wt_per_mtr:  +fabricWt.toFixed(6),
  };
}

function validateBody(body) {
  const errors = [];
  if (!body.reed)               errors.push('Reed is required');
  if (!body.body_weave_pattern) errors.push('Body Weave Pattern is required');
  if (!body.wastage)            errors.push('Wastage is required');
  const warp = body.warp_details ?? [];
  const weft = body.weft_details ?? [];
  for (let i = 0; i < warp.length; i++) {
    if (!warp[i].yarn_id) errors.push(`Warp row ${i+1}: Yarn is required`);
    if (!warp[i].act_cnt) errors.push(`Warp row ${i+1}: Actual Count is required`);
  }
  for (let i = 0; i < weft.length; i++) {
    if (!weft[i].yarn_id) errors.push(`Weft row ${i+1}: Yarn is required`);
    if (!weft[i].act_cnt) errors.push(`Weft row ${i+1}: Actual Count is required`);
  }
  return errors;
}

// ── Helper: get writable (non-generated) columns ──────────────────────────────
async function getWritableColumns(conn, tableName) {
  try {
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${tableName}\``);
    return cols
      .filter(c => !String(c.Extra || '').toUpperCase().includes('GENERATED'))
      .map(c => c.Field);
  } catch (e) {
    console.error(`[getWritableColumns] Failed for ${tableName}:`, e.message);
    return [];
  }
}

// ── Safe integer parser ────────────────────────────────────────────────────────
function safeIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

// ══════════════════════════════════════════════════════════════════════════════
// HSN helpers — permissive auto-detection
// Finds ANY table/column in the current database that looks like an HSN code
// column (matches %hsn%code% or is literally 'hsn' / 'hsn_code'), regardless
// of the table name. This covers hsn_master, hsn_codes, tbl_hsn, gst_hsn, etc.
// ══════════════════════════════════════════════════════════════════════════════

// Cache the resolved table/column info for the lifetime of the process so we
// don't re-run information_schema queries on every request.
let _hsnTableInfo = null; // { tableName, codeCol, idCol, descCol, hasStatus } | false (not found)

async function resolveHsnTable(connOrPool) {
  if (_hsnTableInfo !== null) return _hsnTableInfo;

  const runner = connOrPool || db;

  const [colMatches] = await runner.query(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND (
        COLUMN_NAME LIKE '%hsn%code%'
        OR COLUMN_NAME = 'hsn'
        OR COLUMN_NAME = 'hsn_code'
      )
  `);

  if (colMatches.length === 0) {
    console.warn('[HSN] No column matching %hsn%code% found anywhere in the database.');
    _hsnTableInfo = false;
    return _hsnTableInfo;
  }

  // Prefer a table whose name also contains "hsn"
  const preferred = colMatches.find(c => /hsn/i.test(c.TABLE_NAME)) || colMatches[0];
  const tableName = preferred.TABLE_NAME;
  const codeCol   = preferred.COLUMN_NAME;

  const [colRows] = await runner.query(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
  `, [tableName]);
  const cols = colRows.map(c => c.COLUMN_NAME);

  const idCol   = cols.includes('id') ? 'id' : (cols.find(c => /^id$|_id$/i.test(c)) || 'id');
  const descCol = cols.find(c => /desc/i.test(c)) || null;
  const hasStatus = cols.includes('status');

  _hsnTableInfo = { tableName, codeCol, idCol, descCol, hasStatus };

  return _hsnTableInfo;
}

// ── Fetch HSN codes for the dropdown ────────────────────────────────────────────
async function fetchHsnCodes() {
  const info = await resolveHsnTable();
  if (!info) return [];

  const { tableName, codeCol, idCol, descCol, hasStatus } = info;

  const selectCols = [
    `${idCol} AS id`,
    `${codeCol} AS hsn_code`,
    descCol ? `${descCol} AS description` : 'NULL AS description',
  ].join(', ');

  const whereClause = hasStatus
    ? `WHERE LOWER(TRIM(status)) IN ('active','1','yes','y','true')`
    : '';

  const [rows] = await db.query(
    `SELECT ${selectCols} FROM \`${tableName}\` ${whereClause} ORDER BY ${codeCol}`
  );


  return rows;
}

// ══════════════════════════════════════════════════════════════════════════════
// ★★★ FIX ★★★  safeHsnId — was treating the HSN CODE string as a numeric
// PRIMARY KEY and looking it up against hsn_master.id. Since fabrics.hsn_code
// is VARCHAR(20) and stores the human-readable code (e.g. "4155"), not a
// foreign key, the old lookup almost always failed and silently wrote NULL.
// That's why the fabric saved fine but hsn_code came back empty on reload.
//
// Fix: validate the CODE against the CODE COLUMN of the resolved HSN table
// (same table fetchHsnCodes() reads from) and return the trimmed STRING.
// If it's not found in master data, keep it anyway (manual entry is an
// explicitly supported flow on the frontend) rather than discarding user
// input. Only a genuinely empty value becomes null.
// ══════════════════════════════════════════════════════════════════════════════
async function safeHsnId(conn, rawVal) {
  if (rawVal === null || rawVal === undefined) return null;
  const code = String(rawVal).trim();
  if (code === '') return null;

  try {
    const info = await resolveHsnTable(conn);
    if (!info) return code; // no master table found anywhere — store typed value as-is

    const { tableName, codeCol } = info;
    const [[row]] = await conn.query(
      `SELECT \`${codeCol}\` AS code FROM \`${tableName}\` WHERE \`${codeCol}\` = ? LIMIT 1`,
      [code],
    );
    if (row) return code; // known, valid code

    console.warn(`[HSN] code "${code}" not found in "${tableName}"."${codeCol}" — saving as free text`);
    return code;
  } catch (e) {
    console.warn('[HSN] Validation error:', e.message, '— saving raw value as-is');
    return code;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/fabrics/meta/lookup   ⚠️ must be BEFORE /:id
// ══════════════════════════════════════════════════════════════════════════════
router.get('/meta/lookup', async (_req, res) => {
  try {
    // ── Yarns ──────────────────────────────────────────────────────────────────
    let yarns = [];
    try {
      const [yarnRows] = await db.query(`
        SELECT
          ym.id,
          ym.yarn_code,
          ym.short_name,
          ym.category,
          ym.count_value,
          ym.ply,
          ym.actual_count,
          ym.yarn_count,
          ym.status,
          yt.yarn_type,
          cs.cs_name   AS count_system_name,
          c.color_name,
          c.hex_code
        FROM yarn_master ym
        LEFT JOIN yarn_types    yt ON yt.id = ym.yarn_type_id
        LEFT JOIN count_systems cs ON cs.id = ym.count_system_id
        LEFT JOIN colors         c ON c.id  = ym.color_id
        WHERE ym.status = 'Active'
        ORDER BY ym.yarn_code
      `);

      for (const yarn of yarnRows) {
        try {
          const [fibers] = await db.query(`
            SELECT yf.fiber_percentage, f.fiber_name, b.brand_name
            FROM yarn_fibers yf
            LEFT JOIN fibers      f ON f.id = yf.fiber_id
            LEFT JOIN yarn_brands b ON b.id = yf.brand_id
            WHERE yf.yarn_id = ?
            ORDER BY yf.row_order
          `, [yarn.id]);
          yarn.fibers      = fibers;
          yarn.composition = fibers
            .map(f => [f.fiber_percentage ? `${f.fiber_percentage}%` : '', f.fiber_name].filter(Boolean).join(' '))
            .filter(Boolean).join(' / ') || '';
        } catch {
          yarn.fibers      = [];
          yarn.composition = '';
        }
      }
      yarns = yarnRows;
    } catch (e) {
      console.warn('[fabric/meta/lookup] yarn_master query failed:', e.message);
    }

    // ── HSN codes — uses auto-detecting fetchHsnCodes() ───────────────────────
    let hsnCodes = [];
    try {
      hsnCodes = await fetchHsnCodes();
    } catch (e) {
      console.error('[fabric/meta/lookup] fetchHsnCodes failed:', e.message);
    }

    res.json({ yarns, hsnCodes, weavePatterns: ['PLAIN','TWILL','DOBBY','SATIN','JACQUARD','RIB','CANVAS'] });
  } catch (err) {
    console.error('[GET /fabrics/meta/lookup]', err);
    res.status(500).json({ message: 'Failed to load lookup data', detail: err.message });
  }
});

// ── GET /api/fabrics  — list ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 500 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      where += ' AND (sort_no LIKE ? OR construction LIKE ? OR design LIKE ? OR fabric_id LIKE ? OR body_weave_pattern LIKE ?)';
      params.push(`%${search}%`,`%${search}%`,`%${search}%`,`%${search}%`,`%${search}%`);
    }
    if (status) { where += ' AND status = ?'; params.push(status); }

    const [rows] = await db.query(
      `SELECT * FROM fabrics ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM fabrics ${where}`, params);

    const data = rows.map(r => {
      let attachments = [];
      try { attachments = r.attachments ? JSON.parse(r.attachments) : []; } catch {}
      return { ...r, attachments };
    });
    res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[GET /fabrics]', err);
    res.status(500).json({ message: 'Failed to fetch fabrics', detail: err.message });
  }
});

// ── GET /api/fabrics/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const fabric = await fetchFabric(req.params.id);
    if (!fabric) return res.status(404).json({ message: 'Fabric not found' });
    res.json(fabric);
  } catch (err) {
    console.error('[GET /fabrics/:id]', err);
    res.status(500).json({ message: 'Error fetching fabric', detail: err.message });
  }
});

// ── POST /api/fabrics  — create ────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const errors = validateBody(req.body);
  if (errors.length) return res.status(400).json({ message: errors.join('; ') });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const fabricWritableCols = await getWritableColumns(conn, 'fabrics');
    const has = (col) => fabricWritableCols.includes(col);

    const fabricCode = await generateFabricId(conn);
    const {
      sort_no,
      reed, pick, on_pick, width,
      body_weave_pattern, weave, design,
      onloom_reed, total_ends, selvedge_ends, body_ends,
      wastage, construction, hsn_code, status,
      warp_details = [],
      weft_details = [],
      attachments  = [],
    } = req.body;

    // hsn_code column is VARCHAR(20) — returns the code STRING (or null), not a numeric id.
    const hsnCodeValue = await safeHsnId(conn, hsn_code);

    const serverReedSpace = calcReedSpace(width);
    const warpWithCalc = warp_details.map(w => ({ ...w, ...calcWarpRow(w) }));
    const weftWithCalc = weft_details.map(w => ({
      ...w,
      wt_per_mtr: calcWeftRow(w, body_ends, onloom_reed, wastage) ?? w.wt_per_mtr,
    }));
    const totals = calcFabricTotals(warpWithCalc, weftWithCalc);
    const fGsm   = calcFGSM(totals.fabric_wt_per_mtr, width);

    const attachmentsJson = JSON.stringify(
      attachments.map(({ name, url, size }) => ({ name, url, size: size || null }))
    );

    const candidates = [
      ['fabric_id',          fabricCode],
      ['sort_no',            sort_no            || null],
      ['reed',               reed               || null],
      ['pick',               pick               || null],
      ['width',              width              || null],
      ['body_weave_pattern', body_weave_pattern || null],
      ['weave',              weave              || null],
      ['design',             design             || null],
      ['onloom_reed',        onloom_reed        || null],
      ['reed_space',         serverReedSpace],
      ['selvedge_ends',      selvedge_ends      || null],
      ['body_ends',          body_ends          || null],
      ['total_ends',         total_ends         || null],
      ['wastage',            wastage            || null],
      ['construction',       construction       || null],
      ['warp_wt_per_mtr',    totals.warp_wt_per_mtr],
      ['warp_wt_per_mtr_wc', totals.warp_wt_per_mtr_wc],
      ['weft_wt_per_mtr',    totals.weft_wt_per_mtr],
      ['fabric_wt_per_mtr',  totals.fabric_wt_per_mtr],
      ['status',             status             || 'Active'],
      ['attachments',        attachmentsJson],
      ...(has('on_pick')  ? [['on_pick',  on_pick  || null]] : []),
      ...(has('f_gsm')    ? [['f_gsm',    fGsm]]             : []),
      ...(has('hsn_code') ? [['hsn_code', hsnCodeValue]]     : []),
    ];

    const toInsert = candidates.filter(([col]) => has(col));
    const [result] = await conn.query(
      `INSERT INTO fabrics (${toInsert.map(([c]) => c).join(', ')})
       VALUES (${toInsert.map(() => '?').join(', ')})`,
      toInsert.map(([, v]) => v)
    );
    const dbId = result.insertId;

    // ── Warp yarns ─────────────────────────────────────────────────────────────
    const warpWritable = await getWritableColumns(conn, 'fabric_warp_yarns');
    const hasWarp = (col) => warpWritable.includes(col);

    for (const [idx, w] of warpWithCalc.entries()) {
      const yarnId = safeIntOrNull(w.yarn_id);
      const wCandidates = [
        ['fabric_id',     dbId],
        ['yarn_id',       yarnId],
        ['warp_count',    w.warp_count  || null],
        ['actual_count',  w.act_cnt     || null],
        ['ends',          w.ends        || null],
        ['crimp_pct',     w.crimp_pct   || null],
        ['vt_mtr',        w.wt_per_mtr],
        ['vt_mtr_vc',     w.wt_per_mtr_wc],
        ['display_order', idx + 1],
      ];
      const toInsertW = wCandidates.filter(([col]) => hasWarp(col));
      await conn.query(
        `INSERT INTO fabric_warp_yarns (${toInsertW.map(([c]) => c).join(', ')})
         VALUES (${toInsertW.map(() => '?').join(', ')})`,
        toInsertW.map(([, v]) => v)
      );
    }

    // ── Weft yarns ─────────────────────────────────────────────────────────────
    const weftWritable = await getWritableColumns(conn, 'fabric_weft_yarns');
    const hasWeft = (col) => weftWritable.includes(col);

    for (const [idx, w] of weftWithCalc.entries()) {
      const yarnId = safeIntOrNull(w.yarn_id);
      const wCandidates = [
        ['fabric_id',     dbId],
        ['yarn_id',       yarnId],
        ['weft_count',    w.weft_count  || null],
        ['actual_count',  w.act_cnt     || null],
        ['onloom_pick',   w.onloom_pick || null],
        ['vt_mtr',        w.wt_per_mtr],
        ['display_order', idx + 1],
      ];
      const toInsertW = wCandidates.filter(([col]) => hasWeft(col));
      await conn.query(
        `INSERT INTO fabric_weft_yarns (${toInsertW.map(([c]) => c).join(', ')})
         VALUES (${toInsertW.map(() => '?').join(', ')})`,
        toInsertW.map(([, v]) => v)
      );
    }

    await conn.commit();
    res.status(201).json(await fetchFabric(dbId));
  } catch (err) {
    await conn.rollback();
    console.error('[POST /fabrics] ERROR:', err);
    res.status(500).json({
      message:  'Failed to create fabric',
      detail:   err.message,
      code:     err.code     ?? null,
      sqlState: err.sqlState ?? null,
    });
  } finally {
    conn.release();
  }
});

// ── Debug route: inspect HSN-related tables ───────────────────────────────────
router.get('/debug/hsn-tables', async (_req, res) => {
  const [tables] = await db.query(`
    SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE '%hsn%'
  `);
  const result = {};
  for (const t of tables) {
    const [cols] = await db.query(`
      SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    `, [t.TABLE_NAME]);
    const [[count]] = await db.query(`SELECT COUNT(*) AS c FROM \`${t.TABLE_NAME}\``);
    result[t.TABLE_NAME] = { columns: cols, rowCount: count.c };
  }

  // Also show what the resolver actually picked
  const resolved = await resolveHsnTable();
  res.json({ tablesLikeHsn: result, resolved });
});

// ── PUT /api/fabrics/:id  — update ────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const errors = validateBody(req.body);
  if (errors.length) return res.status(400).json({ message: errors.join('; ') });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const fabricWritableCols = await getWritableColumns(conn, 'fabrics');
    const has = (col) => fabricWritableCols.includes(col);

    const { id } = req.params;
    const {
      sort_no,
      reed, pick, on_pick, width,
      body_weave_pattern, weave, design,
      onloom_reed, total_ends, selvedge_ends, body_ends,
      wastage, construction, hsn_code, status,
      warp_details = [],
      weft_details = [],
      attachments  = [],
    } = req.body;

    // hsn_code column is VARCHAR(20) — returns the code STRING (or null), not a numeric id.
    const hsnCodeValue = await safeHsnId(conn, hsn_code);

    const serverReedSpace = calcReedSpace(width);
    const warpWithCalc = warp_details.map(w => ({ ...w, ...calcWarpRow(w) }));
    const weftWithCalc = weft_details.map(w => ({
      ...w,
      wt_per_mtr: calcWeftRow(w, body_ends, onloom_reed, wastage) ?? w.wt_per_mtr,
    }));
    const totals = calcFabricTotals(warpWithCalc, weftWithCalc);
    const fGsm   = calcFGSM(totals.fabric_wt_per_mtr, width);

    const attachmentsJson = JSON.stringify(
      attachments.map(({ name, url, size }) => ({ name, url, size: size || null }))
    );

    const candidates = [
      ['sort_no',            sort_no            || null],
      ['reed',               reed               || null],
      ['pick',               pick               || null],
      ['width',              width              || null],
      ['body_weave_pattern', body_weave_pattern || null],
      ['weave',              weave              || null],
      ['design',             design             || null],
      ['onloom_reed',        onloom_reed        || null],
      ['reed_space',         serverReedSpace],
      ['selvedge_ends',      selvedge_ends      || null],
      ['body_ends',          body_ends          || null],
      ['total_ends',         total_ends         || null],
      ['wastage',            wastage            || null],
      ['construction',       construction       || null],
      ['warp_wt_per_mtr',    totals.warp_wt_per_mtr],
      ['warp_wt_per_mtr_wc', totals.warp_wt_per_mtr_wc],
      ['weft_wt_per_mtr',    totals.weft_wt_per_mtr],
      ['fabric_wt_per_mtr',  totals.fabric_wt_per_mtr],
      ['status',             status             || 'Active'],
      ['attachments',        attachmentsJson],
      ...(has('on_pick')  ? [['on_pick',  on_pick  || null]] : []),
      ...(has('f_gsm')    ? [['f_gsm',    fGsm]]             : []),
      ...(has('hsn_code') ? [['hsn_code', hsnCodeValue]]     : []),
    ];

    const toUpdate = candidates.filter(([col]) => has(col));
    await conn.query(
      `UPDATE fabrics SET ${toUpdate.map(([c]) => `${c}=?`).join(', ')} WHERE id=?`,
      [...toUpdate.map(([, v]) => v), id]
    );

    await conn.query('DELETE FROM fabric_warp_yarns WHERE fabric_id = ?', [id]);
    await conn.query('DELETE FROM fabric_weft_yarns WHERE fabric_id = ?', [id]);

    // ── Warp yarns ─────────────────────────────────────────────────────────────
    const warpWritable = await getWritableColumns(conn, 'fabric_warp_yarns');
    const hasWarp = (col) => warpWritable.includes(col);

    for (const [idx, w] of warpWithCalc.entries()) {
      const yarnId = safeIntOrNull(w.yarn_id);
      const wCandidates = [
        ['fabric_id',     id],
        ['yarn_id',       yarnId],
        ['warp_count',    w.warp_count  || null],
        ['actual_count',  w.act_cnt     || null],
        ['ends',          w.ends        || null],
        ['crimp_pct',     w.crimp_pct   || null],
        ['vt_mtr',        w.wt_per_mtr],
        ['vt_mtr_vc',     w.wt_per_mtr_wc],
        ['display_order', idx + 1],
      ];
      const toInsertW = wCandidates.filter(([col]) => hasWarp(col));
      await conn.query(
        `INSERT INTO fabric_warp_yarns (${toInsertW.map(([c]) => c).join(', ')})
         VALUES (${toInsertW.map(() => '?').join(', ')})`,
        toInsertW.map(([, v]) => v)
      );
    }

    // ── Weft yarns ─────────────────────────────────────────────────────────────
    const weftWritable = await getWritableColumns(conn, 'fabric_weft_yarns');
    const hasWeft = (col) => weftWritable.includes(col);

    for (const [idx, w] of weftWithCalc.entries()) {
      const yarnId = safeIntOrNull(w.yarn_id);
      const wCandidates = [
        ['fabric_id',     id],
        ['yarn_id',       yarnId],
        ['weft_count',    w.weft_count  || null],
        ['actual_count',  w.act_cnt     || null],
        ['onloom_pick',   w.onloom_pick || null],
        ['vt_mtr',        w.wt_per_mtr],
        ['display_order', idx + 1],
      ];
      const toInsertW = wCandidates.filter(([col]) => hasWeft(col));
      await conn.query(
        `INSERT INTO fabric_weft_yarns (${toInsertW.map(([c]) => c).join(', ')})
         VALUES (${toInsertW.map(() => '?').join(', ')})`,
        toInsertW.map(([, v]) => v)
      );
    }

    await conn.commit();
    res.json(await fetchFabric(id));
  } catch (err) {
    await conn.rollback();
    console.error('[PUT /fabrics/:id] ERROR:', err);
    res.status(500).json({
      message:  'Failed to update fabric',
      detail:   err.message,
      code:     err.code     ?? null,
      sqlState: err.sqlState ?? null,
    });
  } finally {
    conn.release();
  }
});

// ── DELETE /api/fabrics/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM fabrics WHERE id = ?', [req.params.id]);
    res.json({ message: 'Fabric deleted' });
  } catch (err) {
    console.error('[DELETE /fabrics/:id]', err);
    res.status(500).json({ message: 'Failed to delete fabric', detail: err.message });
  }
});

// ── Debug route ────────────────────────────────────────────────────────────────
router.post('/debug', (req, res) => {
  res.json({ received: req.body });
});

module.exports = router;