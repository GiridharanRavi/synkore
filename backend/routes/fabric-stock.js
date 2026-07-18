// backend/routes/fabric-stock.js
//
// SINGLE canonical fabric-stock module — replaces BOTH of the old
// fabricStockRoute.js and fabric-stock.js files, which had drifted into
// two separate manual-stock tables (fabric_stock_manual vs
// fabric_manual_stock). That split is why Manual Stock added on the
// Fabric Stock page never showed up in the Packing List's Manual Stock
// picker: they were reading from different tables.
//
// This file:
//   - Is the ONLY file that should be mounted at /api/fabric-stock in
//     server.js (delete the old fabricStockRoute.js, or at minimum stop
//     requiring it — see instructions below).
//   - Is the ONLY file fabricPackingListRoutes.js should require via
//     require('./fabric-stock') for getAllStockRows / setManualRowPacked.
//   - Uses table `fabric_stock_manual` with column `entry_no` (MS-000001,
//     ...) — matching whatever data you've already entered via the old
//     fabricStockRoute.js UI, so nothing you've already saved is lost.
//   - Auto-adds the missing `used_in_pl_id` column to that existing table
//     on first run (ensureManualTable), instead of creating a second
//     table — this is what lets Packing List mark/release manual pieces.
//
// ─────────────────────────────────────────────────────────────────────────
// NEW (THIS REVISION) — ACTUAL STOCK DEDUCTION ON PACKING LIST CREATE
// ─────────────────────────────────────────────────────────────────────────
// Previously, packing a piece into a Packing List correctly EXCLUDED it
// from the Packing List's own "available stock" picker (available-stock
// endpoint in fabricPackingListRoutes.js), but the main Fabric Stock page
// (GET /api/fabric-stock and /summary) still counted every piece — packed
// or not — toward Total Stock. So the numbers on the Fabric Stock page
// never went down after creating a Packing List. That's the "stock
// deduction is broken/missing" bug.
//
// Fix: getAllStockRows() now computes packed status for EVERY piece
// (inward and manual alike) from fabric_packing_list_items — the same
// source of truth the Packing List picker already trusts — and, by
// default, GET /api/fabric-stock and GET /api/fabric-stock/summary now
// EXCLUDE packed pieces. The moment a Packing List is created (confirmed)
// and its items are inserted into fabric_packing_list_items, those pieces
// disappear from the Fabric Stock totals on the very next load — that IS
// the stock deduction, since each piece is a discrete unit.
//
// Each row also now carries `packed: true|false` regardless of filtering,
// and both GET routes accept `?include_packed=true` to see the full
// picture (packed + unpacked) if ever needed for an audit/report view.
// Nothing about /available-stock's own packed-filtering logic in
// fabricPackingListRoutes.js changed — it still calls
// getAllStockRows({}) (unpackedOnly defaults to false there) and filters
// itself, exactly as before.
//
// GET    /api/fabric-stock            → unpacked inward + manual rows
//        /api/fabric-stock?include_packed=true → all rows (packed shown too)
// GET    /api/fabric-stock/summary    → grouped by Sort No + Construction
//        (same include_packed option)
// GET    /api/fabric-stock/filters    → distinct locations/suppliers
// POST   /api/fabric-stock/manual     → add a manual entry
// PUT    /api/fabric-stock/manual/:id → edit a manual entry
// DELETE /api/fabric-stock/manual/:id → remove a manual entry (blocked if packed)

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { auth } = require('../middleware/auth');

const MANUAL_TABLE = 'fabric_stock_manual';

console.log('✅ fabric-stock router loaded — consolidated (inward + manual) v5 (stock deduction fix)');

// ── Table bootstrap ────────────────────────────────────────────────────
let manualTableReady = false;
async function ensureManualTable() {
  if (manualTableReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS ${MANUAL_TABLE} (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      entry_no      VARCHAR(20)  NOT NULL,
      entry_date    DATE         NULL,
      sort_no       VARCHAR(100) NOT NULL,
      construction  VARCHAR(255) NULL,
      hsn_code      VARCHAR(30)  NULL,
      supplier      VARCHAR(150) NULL,
      inward_to     VARCHAR(150) NULL,
      lot_no        VARCHAR(100) NULL,
      piece_no      VARCHAR(100) NULL,
      new_piece_no  VARCHAR(100) NULL,
      meter         DECIMAL(12,2) NOT NULL DEFAULT 0,
      remarks       TEXT NULL,
      created_by    INT NULL,
      used_in_pl_id INT NULL DEFAULT NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_entry_no (entry_no)
    )
  `);

  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'used_in_pl_id'`,
    [MANUAL_TABLE]
  );
  if (cols.length === 0) {
    console.log(`ℹ ${MANUAL_TABLE} is missing used_in_pl_id — adding it now.`);
    await db.query(`ALTER TABLE ${MANUAL_TABLE} ADD COLUMN used_in_pl_id INT NULL DEFAULT NULL`);
  }

  manualTableReady = true;
}

function fiscalYearParts(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const startYY = m >= 4 ? y % 100 : (y - 1) % 100;
  const endYY   = (startYY + 1) % 100;
  const pad = n => String(n).padStart(2, '0');
  return { startYY: pad(startYY), endYY: pad(endYY) };
}

async function generateNextEntryNo() {
  const { startYY, endYY } = fiscalYearParts();
  const prefix = `${startYY}/${endYY}-`; // e.g. "26/27-"

  const [rows] = await db.query(
    `SELECT entry_no FROM ${MANUAL_TABLE} WHERE entry_no LIKE ?`,
    [`${prefix}%`]
  );

  let maxSeq = 0;
  for (const r of rows) {
    const numPart = String(r.entry_no).slice(prefix.length);
    const n = parseInt(numPart, 10);
    if (!isNaN(n) && n > maxSeq) maxSeq = n;
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

// ── Inward stock (unchanged logic) ──────────────────────────────────────
async function buildConstructionMap(fpoNos) {
  const map = new Map();
  if (!fpoNos.length) return map;

  const [fpoRows] = await db.query(
    `SELECT id, fpo_no FROM fabric_purchase_orders WHERE fpo_no IN (?)`,
    [fpoNos]
  );
  if (!fpoRows.length) return map;

  const fpoIdToNo = new Map(fpoRows.map(r => [r.id, r.fpo_no]));
  const fpoIds    = fpoRows.map(r => r.id);

  const [itemRows] = await db.query(
    `SELECT fpo_id, sort_no, construction, hsn_code FROM fpo_items WHERE fpo_id IN (?)`,
    [fpoIds]
  );

  for (const it of itemRows) {
    const fpoNo = fpoIdToNo.get(it.fpo_id);
    if (!fpoNo) continue;
    const key = `${fpoNo}::${String(it.sort_no || '').trim()}`;
    if (!map.has(key)) {
      map.set(key, {
        construction: it.construction || '',
        hsn_code:     it.hsn_code || '',
      });
    }
  }
  return map;
}

async function getStockRows() {
  const [fpis] = await db.query(`
    SELECT id, fpi_no, fpi_date, fpo_no, supplier, inward_to,
           sort_no AS header_sort_no, dc_no, dc_date, lot_no
    FROM fabric_purchase_inward
    ORDER BY id DESC
  `);
  if (!fpis.length) return [];

  const fpiIds = fpis.map(f => f.id);
  const [items] = await db.query(
    `SELECT id, fpi_id, meter, piece_no, new_piece_no FROM fpi_items WHERE fpi_id IN (?)`,
    [fpiIds]
  );

  const fpoNos    = [...new Set(fpis.map(f => f.fpo_no).filter(Boolean))];
  const constnMap = await buildConstructionMap(fpoNos);
  const fpiById   = new Map(fpis.map(f => [f.id, f]));

  return items
    .map(it => {
      const fpi = fpiById.get(it.fpi_id);
      if (!fpi) return null;
      const sortNo = String(fpi.header_sort_no || '').trim();
      const meta   = constnMap.get(`${fpi.fpo_no}::${sortNo}`) || { construction: '', hsn_code: '' };

      return {
        id:            it.id,
        source:        'inward',
        fpi_id:        fpi.id,
        fpi_no:        fpi.fpi_no,
        fpi_date:      fpi.fpi_date,
        fpo_no:        fpi.fpo_no || '',
        supplier:      fpi.supplier || '',
        inward_to:     fpi.inward_to || '',
        sort_no:       sortNo,
        construction:  meta.construction,
        hsn_code:      meta.hsn_code,
        lot_no:        fpi.lot_no || '',
        dc_no:         fpi.dc_no || '',
        dc_date:       fpi.dc_date,
        piece_no:      it.piece_no || '',
        new_piece_no:  it.new_piece_no || '',
        meter:         Number(it.meter) || 0,
        remarks:       '',
        used_in_pl_id: null, // real inward "packed" tracking lives in fabric_packing_list_items — see getPackedFpiItemIds()
      };
    })
    .filter(Boolean);
}

// ── Manual stock ──────────────────────────────────────────────────────
async function getManualStockRows({ unpackedOnly = false } = {}) {
  await ensureManualTable();
  const where = unpackedOnly ? 'WHERE used_in_pl_id IS NULL' : '';
  const [rows] = await db.query(`SELECT * FROM ${MANUAL_TABLE} ${where} ORDER BY id DESC`);

  return rows.map(r => ({
    id:            1000000000 + r.id, // offset so it never collides with an inward fpi_items.id
    manual_row_id: r.id,              // real id, used for updates/deletes
    source:        'manual',
    fpi_id:        null,
    fpi_no:        r.entry_no,
    fpi_date:      r.entry_date,
    fpo_no:        '',
    supplier:      r.supplier || '',
    inward_to:     r.inward_to || '',
    sort_no:       String(r.sort_no || '').trim(),
    construction:  r.construction || '',
    hsn_code:      r.hsn_code || '',
    lot_no:        r.lot_no || '',
    dc_no:         '',
    dc_date:       null,
    piece_no:      r.piece_no || '',
    new_piece_no:  r.new_piece_no || '',
    meter:         Number(r.meter) || 0,
    remarks:       r.remarks || '',
    used_in_pl_id: r.used_in_pl_id,
  }));
}

// NEW: single source of truth for "is this piece (inward OR manual)
// currently packed into a Packing List". Mirrors exactly what the
// Packing List's own /available-stock endpoint already checks — a piece
// counts as packed the instant its id shows up as fpi_item_id in
// fabric_packing_list_items, which happens inside the same DB
// transaction that creates the Packing List (see
// fabricPackingListRoutes.js POST '/'). So this reflects deduction in
// real time, right after a Packing List is confirmed/created.
async function getPackedFpiItemIds() {
  const [rows] = await db.query(
    `SELECT DISTINCT fpi_item_id FROM fabric_packing_list_items WHERE fpi_item_id IS NOT NULL`
  );
  return new Set(rows.map(r => r.fpi_item_id));
}

// CHANGED: now always fetches every row (inward + manual) and tags each
// with `packed: true|false` using the shared fabric_packing_list_items
// check above — instead of relying on the manual table's own
// used_in_pl_id column in isolation, which is what let inward pieces slip
// through uncounted. `unpackedOnly` (default false, unchanged for
// existing callers like /available-stock) filters packed rows out.
async function getAllStockRows({ unpackedOnly = false } = {}) {
  const [inward, manual, packedIds] = await Promise.all([
    getStockRows(),
    getManualStockRows({}), // always fetch all; filtering happens uniformly below
    getPackedFpiItemIds(),
  ]);

  let all = [...inward, ...manual].map(r => ({ ...r, packed: packedIds.has(r.id) }));

  if (unpackedOnly) {
    all = all.filter(r => !r.packed);
  }
  return all;
}

// Marks/releases a manual row against a packing list. Called from
// fabricPackingListRoutes.js on create/update/delete.
async function setManualRowPacked(manualRowId, plId /* null to release */) {
  await ensureManualTable();
  await db.query(`UPDATE ${MANUAL_TABLE} SET used_in_pl_id = ? WHERE id = ?`, [plId, manualRowId]);
}

// ── Routes ────────────────────────────────────────────────────────────

function wantsIncludePacked(req) {
  return req.query.include_packed === 'true' || req.query.include_packed === '1';
}

router.get('/', auth, async (req, res) => {
  try {
    const rows = await getAllStockRows({ unpackedOnly: !wantsIncludePacked(req) });
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /fabric-stock ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get('/summary', auth, async (req, res) => {
  try {
    const rows   = await getAllStockRows({ unpackedOnly: !wantsIncludePacked(req) });
    const groups = new Map();

    for (const r of rows) {
      const key = `${r.sort_no}::${r.construction}`;
      if (!groups.has(key)) {
        groups.set(key, {
          sort_no: r.sort_no, construction: r.construction, hsn_code: r.hsn_code,
          total_meter: 0, piece_count: 0,
          suppliers: new Set(), locations: new Set(), fpo_nos: new Set(),
          last_inward: r.fpi_date,
        });
      }
      const g = groups.get(key);
      g.total_meter += r.meter;
      g.piece_count += 1;
      if (r.supplier)  g.suppliers.add(r.supplier);
      if (r.inward_to) g.locations.add(r.inward_to);
      if (r.fpo_no)     g.fpo_nos.add(r.fpo_no);
      if (r.fpi_date && (!g.last_inward || new Date(r.fpi_date) > new Date(g.last_inward))) {
        g.last_inward = r.fpi_date;
      }
      if (!g.construction && r.construction) g.construction = r.construction;
      if (!g.hsn_code && r.hsn_code) g.hsn_code = r.hsn_code;
    }

    const summary = [...groups.values()]
      .map(g => ({
        sort_no: g.sort_no, construction: g.construction, hsn_code: g.hsn_code,
        total_meter: +g.total_meter.toFixed(2), piece_count: g.piece_count,
        suppliers: [...g.suppliers], locations: [...g.locations], fpo_nos: [...g.fpo_nos],
        last_inward: g.last_inward,
      }))
      .sort((a, b) => b.total_meter - a.total_meter);

    res.json(summary);
  } catch (err) {
    console.error('❌ GET /fabric-stock/summary ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get('/filters', auth, async (req, res) => {
  try {
    await ensureManualTable();

    const [locRows] = await db.query(
      `SELECT DISTINCT inward_to FROM fabric_purchase_inward WHERE inward_to IS NOT NULL AND inward_to <> '' ORDER BY inward_to`
    );
    const [supRows] = await db.query(
      `SELECT DISTINCT supplier FROM fabric_purchase_inward WHERE supplier IS NOT NULL AND supplier <> '' ORDER BY supplier`
    );
    const [mLocRows] = await db.query(
      `SELECT DISTINCT inward_to FROM ${MANUAL_TABLE} WHERE inward_to IS NOT NULL AND inward_to <> ''`
    );
    const [mSupRows] = await db.query(
      `SELECT DISTINCT supplier FROM ${MANUAL_TABLE} WHERE supplier IS NOT NULL AND supplier <> ''`
    );

    const locations = [...new Set([...locRows.map(r => r.inward_to), ...mLocRows.map(r => r.inward_to)])].sort();
    const suppliers = [...new Set([...supRows.map(r => r.supplier), ...mSupRows.map(r => r.supplier)])].sort();

    res.json({ locations, suppliers });
  } catch (err) {
    console.error('❌ GET /fabric-stock/filters ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── Manual stock CRUD ────────────────────────────────────────────────────

router.post('/manual', auth, async (req, res) => {
  try {
    await ensureManualTable();
    const {
      entry_date, sort_no, construction, hsn_code, supplier,
      inward_to, lot_no, piece_no, new_piece_no, meter, remarks,
    } = req.body;

    if (!sort_no || !String(sort_no).trim()) {
      return res.status(400).json({ message: 'Sort No is required.' });
    }
    const meterNum = Number(meter);
    if (!meter || isNaN(meterNum) || meterNum <= 0) {
      return res.status(400).json({ message: 'Enter a valid Meter value greater than 0.' });
    }

    const entryNo = await generateNextEntryNo();
    const [r] = await db.query(
      `INSERT INTO ${MANUAL_TABLE} (
        entry_no, entry_date, sort_no, construction, hsn_code, supplier,
        inward_to, lot_no, piece_no, new_piece_no, meter, remarks, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        entryNo, entry_date || null, String(sort_no).trim(), construction || null, hsn_code || null,
        supplier || null, inward_to || null, lot_no || null, piece_no || null, new_piece_no || null,
        meterNum, remarks || null, req.user?.id || null,
      ]
    );

    console.log('✅ Manual Fabric Stock added, id:', r.insertId, '| entry_no:', entryNo);
    res.status(201).json({ id: r.insertId, entry_no: entryNo, message: 'Stock entry added.' });
  } catch (err) {
    console.error('❌ POST /fabric-stock/manual ERROR:', err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

router.put('/manual/:id', auth, async (req, res) => {
  try {
    await ensureManualTable();
    const {
      entry_date, sort_no, construction, hsn_code, supplier,
      inward_to, lot_no, piece_no, new_piece_no, meter, remarks,
    } = req.body;

    if (!sort_no || !String(sort_no).trim()) {
      return res.status(400).json({ message: 'Sort No is required.' });
    }
    const meterNum = Number(meter);
    if (!meter || isNaN(meterNum) || meterNum <= 0) {
      return res.status(400).json({ message: 'Enter a valid Meter value greater than 0.' });
    }

    const [result] = await db.query(
      `UPDATE ${MANUAL_TABLE} SET
        entry_date=?, sort_no=?, construction=?, hsn_code=?, supplier=?,
        inward_to=?, lot_no=?, piece_no=?, new_piece_no=?, meter=?, remarks=?
       WHERE id=?`,
      [
        entry_date || null, String(sort_no).trim(), construction || null, hsn_code || null,
        supplier || null, inward_to || null, lot_no || null, piece_no || null, new_piece_no || null,
        meterNum, remarks || null,
        req.params.id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Manual stock entry not found.' });
    }
    console.log('✅ Manual Fabric Stock updated, id:', req.params.id);
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('❌ PUT /fabric-stock/manual/:id ERROR:', err.message);
    res.status(500).json({ message: err.sqlMessage || err.message });
  }
});

router.delete('/manual/:id', auth, async (req, res) => {
  try {
    await ensureManualTable();

    // Blocks deleting a manual entry that's currently packed into a
    // Packing List — mirrors how inward pieces can't silently vanish out
    // from under an existing PL either.
    const [[row]] = await db.query(`SELECT used_in_pl_id FROM ${MANUAL_TABLE} WHERE id=?`, [req.params.id]);
    if (!row) return res.status(404).json({ message: 'Manual stock entry not found.' });
    if (row.used_in_pl_id) {
      return res.status(409).json({
        message: `This entry is currently packed into Packing List id=${row.used_in_pl_id} and can't be deleted. Remove it from that packing list first.`,
      });
    }

    await db.query(`DELETE FROM ${MANUAL_TABLE} WHERE id=?`, [req.params.id]);
    console.log('✅ Manual Fabric Stock deleted, id:', req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('❌ DELETE /fabric-stock/manual/:id ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
module.exports.getStockRows        = getStockRows;
module.exports.getManualStockRows  = getManualStockRows;
module.exports.getAllStockRows     = getAllStockRows;
module.exports.getPackedFpiItemIds = getPackedFpiItemIds;
module.exports.setManualRowPacked  = setManualRowPacked;