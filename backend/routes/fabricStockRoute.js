// backend/routes/fabricStockRoute.js
//
// Fabric Stock — combined aggregation over two sources:
//   1. Fabric Purchase Inward  → fpi_items
//   2. Manual Stock Entry      → fabric_stock_manual
//
// GET /api/fabric-stock and GET /api/fabric-stock/summary return the
// UNION of both sources, each row tagged with source: "inward" | "manual".

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const db      = require('../db/connection');
const { auth } = require('../middleware/auth');

// ── Server instance fingerprint ───────────────────────────────────────────
// Generated ONCE when this module is loaded (i.e. once per server process
// boot). Sent back as a response header on every route below. If you ever
// see this value differ between two requests in the same browser session
// (e.g. compare the GET /fabric-stock request vs the DELETE /manual/:id
// request in DevTools → Network → Headers), that's conclusive proof you
// have more than one backend process alive and traffic is bouncing between
// them — which fully explains "GET shows a row, DELETE 404s on it" even
// though nothing is wrong with the query logic itself.
const SERVER_INSTANCE_ID = crypto.randomUUID();
router.use((req, res, next) => {
  res.set('X-Server-Instance', SERVER_INSTANCE_ID);
  next();
});

console.log(`✅ fabric-stock router loaded — combined (inward + manual) v6 — instance ${SERVER_INSTANCE_ID}`);

// ── Build a "fpo_no::sort_no" → { construction, hsn_code } map ───────────────
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

function normSort(s) { return String(s || '').trim().toLowerCase(); }
function normConstruction(s) { return String(s || '').trim().toLowerCase(); }

// ── Inward-derived piece rows ─────────────────────────────────────────────
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
        id:           it.id,
        fpi_id:       fpi.id,
        fpi_no:       fpi.fpi_no,
        fpi_date:     fpi.fpi_date,
        fpo_no:       fpi.fpo_no || '',
        supplier:     fpi.supplier || '',
        inward_to:    fpi.inward_to || '',
        sort_no:      sortNo,
        construction: meta.construction,
        hsn_code:     meta.hsn_code,
        lot_no:       fpi.lot_no || '',
        dc_no:        fpi.dc_no || '',
        dc_date:      fpi.dc_date,
        piece_no:     it.piece_no || '',
        new_piece_no: it.new_piece_no || '',
        meter:        Number(it.meter) || 0,
      };
    })
    .filter(Boolean);
}

// ── Manually-added piece rows ─────────────────────────────────────────────
async function getManualStockRows() {
  const [rows] = await db.query(`SELECT * FROM fabric_stock_manual ORDER BY id DESC`);

  return rows.map(r => ({
    id:           r.id,
    fpi_id:       null,
    fpi_no:       r.entry_no,
    fpi_date:     r.entry_date,
    fpo_no:       '',
    supplier:     r.supplier || '',
    inward_to:    r.inward_to || '',
    sort_no:      r.sort_no || '',
    construction: r.construction || '',
    hsn_code:     r.hsn_code || '',
    lot_no:       r.lot_no || '',
    dc_no:        '',
    dc_date:      null,
    piece_no:     r.piece_no || '',
    new_piece_no: r.new_piece_no || '',
    meter:        Number(r.meter) || 0,
    remarks:      r.remarks || '',
  }));
}

// ── Combined rows (inward + manual), tagged with `source` ────────────────
async function getCombinedStockRows() {
  const [inwardRows, manualRows] = await Promise.all([
    getStockRows(),
    getManualStockRows(),
  ]);

  const tagged = [
    ...inwardRows.map(r => ({ ...r, source: 'inward' })),
    ...manualRows.map(r => ({ ...r, source: 'manual' })),
  ];

  tagged.sort((a, b) => {
    const da = a.fpi_date ? new Date(a.fpi_date).getTime() : 0;
    const dbv = b.fpi_date ? new Date(b.fpi_date).getTime() : 0;
    return dbv - da;
  });

  return tagged;
}

// ── Next entry_no generator: MS-000001, MS-000002, ... ────────────────────
async function generateManualEntryNo() {
  const [lastRows] = await db.query(
    `SELECT entry_no FROM fabric_stock_manual ORDER BY id DESC LIMIT 1`
  );
  let nextNum = 1;
  if (lastRows.length && lastRows[0].entry_no) {
    const m = String(lastRows[0].entry_no).match(/(\d+)$/);
    if (m) nextNum = parseInt(m[1], 10) + 1;
  }
  return `MS-${String(nextNum).padStart(6, '0')}`;
}

// ── GET /api/fabric-stock — piece-level rows (inward + manual) ───────────
router.get('/', auth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const rows = await getCombinedStockRows();
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /fabric-stock ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/fabric-stock/summary — grouped by Sort No + Construction ────
router.get('/summary', auth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const rows   = await getCombinedStockRows();
    const groups = new Map();

    for (const r of rows) {
      const key = `${normSort(r.sort_no)}::${normConstruction(r.construction)}`;
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

// ── GET /api/fabric-stock/filters — distinct dropdown values (both sources) ─
router.get('/filters', auth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const [locInward] = await db.query(
      `SELECT DISTINCT inward_to AS v FROM fabric_purchase_inward WHERE inward_to IS NOT NULL AND inward_to <> ''`
    );
    const [locManual] = await db.query(
      `SELECT DISTINCT inward_to AS v FROM fabric_stock_manual WHERE inward_to IS NOT NULL AND inward_to <> ''`
    );
    const [supInward] = await db.query(
      `SELECT DISTINCT supplier AS v FROM fabric_purchase_inward WHERE supplier IS NOT NULL AND supplier <> ''`
    );
    const [supManual] = await db.query(
      `SELECT DISTINCT supplier AS v FROM fabric_stock_manual WHERE supplier IS NOT NULL AND supplier <> ''`
    );

    const locations = [...new Set([...locInward, ...locManual].map(r => r.v))].sort();
    const suppliers = [...new Set([...supInward, ...supManual].map(r => r.v))].sort();

    res.json({ locations, suppliers });
  } catch (err) {
    console.error('❌ GET /fabric-stock/filters ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/fabric-stock/debug — raw table dump for troubleshooting ─────
// TEMPORARY diagnostic route, reinstated because rows with hardcoded,
// non-sequential ids (e.g. 1000000002, 1000000004 — note these don't
// match the MS-000001 style generateManualEntryNo() produces) are
// reappearing after restarts. That pattern means they're being inserted
// by something OTHER than POST /manual — most likely a seed script,
// fixtures file, or DB init script that runs on server/container boot.
// Hit this route (logged in) to see the raw current contents + which DB
// the server is actually using:
//   GET http://localhost:5000/api/fabric-stock/debug
// Remove this route again once the source of the re-insertion is found
// and disabled.
router.get('/debug', auth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const [rows] = await db.query(`SELECT * FROM fabric_stock_manual ORDER BY id DESC`);
    const [dbInfo] = await db.query(`SELECT DATABASE() AS db_name`);
    const [procRows] = await db.query(`SHOW PROCESSLIST`).catch(() => [[]]);
    res.json({
      server_instance: SERVER_INSTANCE_ID,
      connected_database: dbInfo[0]?.db_name || 'unknown',
      row_count: rows.length,
      rows,
      // helps spot if multiple app connections are hitting this DB at once
      active_connections: Array.isArray(procRows) ? procRows.length : undefined,
    });
  } catch (err) {
    console.error('❌ GET /fabric-stock/debug ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/fabric-stock/manual — add a manual in-stock entry ──────────
router.post('/manual', auth, async (req, res) => {
  try {
    const {
      entry_date, sort_no, construction, hsn_code,
      supplier, inward_to, lot_no, piece_no, new_piece_no,
      meter, remarks,
    } = req.body;

    if (!sort_no || !String(sort_no).trim()) {
      return res.status(400).json({ message: 'Sort No is required.' });
    }
    const meterNum = Number(meter);
    if (!meter || isNaN(meterNum) || meterNum <= 0) {
      return res.status(400).json({ message: 'A valid Meter value is required.' });
    }

    const entryNo = await generateManualEntryNo();

    const [result] = await db.query(
      `INSERT INTO fabric_stock_manual
        (entry_no, entry_date, sort_no, construction, hsn_code, supplier,
         inward_to, lot_no, piece_no, new_piece_no, meter, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entryNo,
        entry_date || new Date().toISOString().slice(0, 10),
        String(sort_no).trim(),
        construction || '',
        hsn_code || '',
        supplier || '',
        inward_to || '',
        lot_no || '',
        piece_no || '',
        new_piece_no || '',
        meterNum,
        remarks || '',
        req.user?.id || null,
      ]
    );

    console.log(`✅ Manual stock entry inserted — id=${result.insertId}, entry_no=${entryNo}`);
    res.status(201).json({ id: result.insertId, entry_no: entryNo, message: 'Stock entry added.' });
  } catch (err) {
    console.error('❌ POST /fabric-stock/manual ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/fabric-stock/manual/:id — edit a manual entry ───────────────
router.put('/manual/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      entry_date, sort_no, construction, hsn_code,
      supplier, inward_to, lot_no, piece_no, new_piece_no,
      meter, remarks,
    } = req.body;

    if (!sort_no || !String(sort_no).trim()) {
      return res.status(400).json({ message: 'Sort No is required.' });
    }
    const meterNum = Number(meter);
    if (!meter || isNaN(meterNum) || meterNum <= 0) {
      return res.status(400).json({ message: 'A valid Meter value is required.' });
    }

    const [result] = await db.query(
      `UPDATE fabric_stock_manual SET
         entry_date = ?, sort_no = ?, construction = ?, hsn_code = ?,
         supplier = ?, inward_to = ?, lot_no = ?, piece_no = ?, new_piece_no = ?,
         meter = ?, remarks = ?
       WHERE id = ?`,
      [
        entry_date || new Date().toISOString().slice(0, 10),
        String(sort_no).trim(),
        construction || '',
        hsn_code || '',
        supplier || '',
        inward_to || '',
        lot_no || '',
        piece_no || '',
        new_piece_no || '',
        meterNum,
        remarks || '',
        id,
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: 'Manual stock entry not found.' });
    }
    res.json({ message: 'Stock entry updated.' });
  } catch (err) {
    console.error('❌ PUT /fabric-stock/manual/:id ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/fabric-stock/manual/:id — remove a manual entry ──────────
router.delete('/manual/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query(`DELETE FROM fabric_stock_manual WHERE id = ?`, [id]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: 'Manual stock entry not found.' });
    }
    res.json({ message: 'Manual stock entry deleted.' });
  } catch (err) {
    console.error('❌ DELETE /fabric-stock/manual/:id ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
module.exports.getStockRows = getStockRows;