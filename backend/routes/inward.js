const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth } = require('../middleware/auth');

// ─── Helper: generate next FPI No ────────────────────────────────────────────
// Format: FPI-YYYY-001  (resets each calendar year)
async function generateNextFpiNo(conn) {
  const year   = new Date().getFullYear();          // e.g. 2026
  const prefix = `FPI-${year}-`;                   // FPI-2026-

  const [[row]] = await conn.query(
    `SELECT fpi_no FROM fabric_purchase_inward
     WHERE fpi_no LIKE ? ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let nextSeq = 1;
  if (row?.fpi_no) {
    const parts = row.fpi_no.split('-');
    const last  = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(last)) nextSeq = last + 1;
  }

  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
  // → FPI-2026-001, FPI-2026-002, …
}

// ─── 0. GET NEXT FPI NO ───────────────────────────────────────────────────────
router.get('/next-fpi-no', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const fpi_no = await generateNextFpiNo(conn);
    res.json({ fpi_no });
  } catch (err) {
    console.error('❌ GET /next-fpi-no ERROR:', err.message);
    res.status(500).json({ message: err.message });
  } finally { conn.release(); }
});

// ─── 1. GET ALL FPIs ──────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM fabric_purchase_inward ORDER BY id DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /fabric-purchase-inward ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─── 2. GET SINGLE FPI WITH ITEMS ────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const [[fpi]] = await db.query(
      'SELECT * FROM fabric_purchase_inward WHERE id=?',
      [req.params.id]
    );
    if (!fpi) return res.status(404).json({ message: 'FPI not found' });

    const [items] = await db.query(
      'SELECT * FROM fpi_items WHERE fpi_id=? ORDER BY id ASC',
      [req.params.id]
    );
    res.json({ ...fpi, items });
  } catch (err) {
    console.error('❌ GET /fabric-purchase-inward/:id ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─── 3. CREATE NEW FPI (POST) ─────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const {
      fpi_no, fpi_date, fpo_no, vehicle_no,
      supplier, inward_to, sort_no, remarks,
      dc_no, dc_date, lot_no,
      total_meters,
      purchase_invoice_no,
      items = [],
    } = req.body;

    // Use provided fpi_no or auto-generate
    const finalFpiNo = (fpi_no && fpi_no.trim())
      ? fpi_no.trim()
      : await generateNextFpiNo(conn);

    const [r] = await conn.query(
      `INSERT INTO fabric_purchase_inward (
        fpi_no, fpi_date, fpo_no, vehicle_no,
        supplier, inward_to, sort_no, remarks,
        dc_no, dc_date, lot_no,
        total_meters, purchase_invoice_no
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        finalFpiNo,
        fpi_date   || null,
        fpo_no     || null,
        vehicle_no || null,
        supplier,
        inward_to  || null,
        sort_no    || null,
        remarks    || null,
        dc_no      || null,
        dc_date    || null,
        lot_no     || null,
        total_meters        || 0,
        purchase_invoice_no || null,
      ]
    );

    const fpiId = r.insertId;

    for (const item of items) {
      await conn.query(
        `INSERT INTO fpi_items (fpi_id, meter, piece_no, new_piece_no)
         VALUES (?,?,?,?)`,
        [fpiId, item.meter || 0, item.piece_no || '', item.new_piece_no || '']
      );
    }

    await conn.commit();
    console.log('✅ FPI INSERT success, id:', fpiId, '| fpi_no:', finalFpiNo);
    res.status(201).json({ id: fpiId, fpi_no: finalFpiNo });
  } catch (err) {
    await conn.rollback();
    console.error('❌ POST /fabric-purchase-inward ERROR:', err.message);
    res.status(500).json({ message: err.message, code: err.code });
  } finally { conn.release(); }
});

// ─── 4. UPDATE EXISTING FPI (PUT) ────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const {
      fpi_no, fpi_date, fpo_no, vehicle_no,
      supplier, inward_to, sort_no, remarks,
      dc_no, dc_date, lot_no,
      total_meters,
      purchase_invoice_no,
      items = [],
    } = req.body;

    await conn.query(
      `UPDATE fabric_purchase_inward SET
        fpi_no=?, fpi_date=?, fpo_no=?, vehicle_no=?,
        supplier=?, inward_to=?, sort_no=?, remarks=?,
        dc_no=?, dc_date=?, lot_no=?,
        total_meters=?, purchase_invoice_no=?
       WHERE id=?`,
      [
        fpi_no,
        fpi_date   || null,
        fpo_no     || null,
        vehicle_no || null,
        supplier,
        inward_to  || null,
        sort_no    || null,
        remarks    || null,
        dc_no      || null,
        dc_date    || null,
        lot_no     || null,
        total_meters        || 0,
        purchase_invoice_no || null,
        req.params.id,
      ]
    );

    // Replace items: delete old → insert new
    await conn.query('DELETE FROM fpi_items WHERE fpi_id=?', [req.params.id]);
    for (const item of items) {
      await conn.query(
        `INSERT INTO fpi_items (fpi_id, meter, piece_no, new_piece_no)
         VALUES (?,?,?,?)`,
        [req.params.id, item.meter || 0, item.piece_no || '', item.new_piece_no || '']
      );
    }

    await conn.commit();
    console.log('✅ FPI UPDATE success for id:', req.params.id);
    res.json({ message: 'Updated' });
  } catch (err) {
    await conn.rollback();
    console.error('❌ PUT /fabric-purchase-inward ERROR:', err.message);
    res.status(500).json({ message: err.message, code: err.code });
  } finally { conn.release(); }
});

// ─── 5. DELETE FPI ────────────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM fpi_items WHERE fpi_id=?', [req.params.id]);
    await conn.query('DELETE FROM fabric_purchase_inward WHERE id=?', [req.params.id]);
    await conn.commit();
    console.log('✅ FPI DELETE success for id:', req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    await conn.rollback();
    console.error('❌ DELETE /fabric-purchase-inward ERROR:', err.message);
    res.status(500).json({ message: err.message });
  } finally { conn.release(); }
});

module.exports = router;