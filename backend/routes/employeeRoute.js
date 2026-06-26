// backend/routes/employees.js
const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { sendEmployeeWelcomeEmail } = require('../utils/emailService');

// ─── Helper: Generate EMP-YYYY-NNN ────────────────────────────────────────────
async function generateEmployeeCode(conn) {
  const year   = new Date().getFullYear();
  const prefix = `EMP-${year}-`;

  const [[row]] = await (conn || db).query(
    `SELECT employee_code
     FROM employees
     WHERE employee_code LIKE ?
     ORDER BY employee_code DESC
     LIMIT 1`,
    [`${prefix}%`]
  );

  let nextSeq = 1;
  if (row) {
    const parts   = row.employee_code.split('-');
    const lastSeq = parseInt(parts[2], 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
  // → EMP-2026-001, EMP-2026-002 … next year resets to EMP-2027-001
}

// ─── GET /api/employees/meta/lookup ──────────────────────────────────────────
// Must be before /:id
router.get('/meta/lookup', async (_req, res) => {
  try {
    const [designations] = await db.query(
      `SELECT id, description FROM designations WHERE status = 'Active' ORDER BY description`
    );
    const [units] = await db.query(
      `SELECT id, unit_name FROM units WHERE status = 'Active' ORDER BY unit_name`
    );
    res.json({ designations, units });
  } catch (err) {
    console.error('GET /meta/lookup:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/employees ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      search = '', page = 1, limit = 10,
      category = '', status = '', unit = '',
    } = req.query;

    const offset     = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params     = [];

    if (search) {
      conditions.push(
        `(e.employee_name LIKE ? OR e.employee_code LIKE ? OR e.contact_number LIKE ?)`
      );
      const q = `%${search}%`;
      params.push(q, q, q);
    }
    if (category) { conditions.push(`e.employee_category = ?`); params.push(category); }
    if (status)   { conditions.push(`e.status = ?`);            params.push(status);   }
    if (unit)     { conditions.push(`e.unit_id = ?`);           params.push(unit);     }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM employees e ${whereClause}`, params
    );

    const [data] = await db.query(
      `SELECT e.*,
              d.description AS designation_name,
              u.unit_name   AS unit_name
       FROM employees e
       LEFT JOIN designations d ON d.id = e.designation_id
       LEFT JOIN units        u ON u.id = e.unit_id
       ${whereClause}
       ORDER BY e.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({ data, total });
  } catch (err) {
    console.error('GET /api/employees:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/employees/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT e.*,
              d.description AS designation_name,
              u.unit_name   AS unit_name
       FROM employees e
       LEFT JOIN designations d ON d.id = e.designation_id
       LEFT JOIN units        u ON u.id = e.unit_id
       WHERE e.id = ?`,
      [req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ message: 'Employee not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/employees/:id:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/employees (create) ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const {
      employee_name,
      contact_number,
      email,
      address,
      pin_code,
      state,
      district,
      country,
      designation_id,
      unit_id,
      employee_category,
      status,
      password,
      module_access,
      stage_access,
      send_email_notification = false,   // ← from frontend toggle
    } = req.body;

    // Validation
    if (!employee_name?.trim())
      return res.status(400).json({ message: 'Employee name is required.' });

    // Auto-generate EMP code inside transaction to avoid race conditions
    const employee_code = await generateEmployeeCode(conn);

    const moduleStr = Array.isArray(module_access)
      ? JSON.stringify(module_access)
      : (module_access || '[]');
    const stageStr  = Array.isArray(stage_access)
      ? JSON.stringify(stage_access)
      : (stage_access  || '[]');

    const [result] = await conn.query(
      `INSERT INTO employees
         (employee_code, employee_name, contact_number, email,
          address, pin_code, state, district, country,
          designation_id, unit_id, employee_category,
          status, password, module_access, stage_access)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        employee_code,
        employee_name.trim(),
        contact_number  || null,
        email           || null,
        address         || null,
        pin_code        || null,
        state           || null,
        district        || null,
        country         || 'India',
        designation_id  ? parseInt(designation_id)  : null,
        unit_id         ? parseInt(unit_id)         : null,
        employee_category || 'User',
        status            || 'Active',
        password          || null,
        moduleStr,
        stageStr,
      ]
    );

    await conn.commit();

    // Fetch full row with joined names
    const [[newEmployee]] = await db.query(
      `SELECT e.*,
              d.description AS designation_name,
              u.unit_name   AS unit_name
       FROM employees e
       LEFT JOIN designations d ON d.id = e.designation_id
       LEFT JOIN units        u ON u.id = e.unit_id
       WHERE e.id = ?`,
      [result.insertId]
    );

    // ── Send welcome email (non-fatal) ────────────────────────────────────────
    if (send_email_notification && email && email.trim()) {
      sendEmployeeWelcomeEmail({
        toEmail:      email.trim(),
        employeeName: newEmployee.employee_name,
        employeeCode: newEmployee.employee_code,
        loginPassword: password || '',
        designation:  newEmployee.designation_name || '',
      })
        .then(result => {
          if (result.sent) {
            console.log(`[employees] ✅ Welcome email sent to ${email}`);
            // Optional: log to notifications table
            db.query(
              `INSERT INTO notifications (type, recipient_id, message, status, created_at)
               VALUES ('employee_welcome_email', ?, ?, 'sent', NOW())`,
              [newEmployee.id, `Welcome email sent to ${email}`]
            ).catch(() => {}); // non-fatal if table missing
          } else {
            console.warn(`[employees] ⚠️  Email not sent: ${result.reason || result.error}`);
          }
        })
        .catch(err => console.error('[employees] Email error:', err.message));
    }

    res.status(201).json(newEmployee);
  } catch (err) {
    await conn.rollback();
    console.error('POST /api/employees:', err);
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
});

// ─── PUT /api/employees/:id (update) ──────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const {
      employee_name,
      contact_number,
      email,
      address,
      pin_code,
      state,
      district,
      country,
      designation_id,
      unit_id,
      employee_category,
      status,
      password,
      module_access,
      stage_access,
    } = req.body;

    if (!employee_name?.trim())
      return res.status(400).json({ message: 'Employee name is required.' });

    const moduleStr = Array.isArray(module_access)
      ? JSON.stringify(module_access)
      : (module_access || '[]');
    const stageStr  = Array.isArray(stage_access)
      ? JSON.stringify(stage_access)
      : (stage_access  || '[]');

    const fields = [
      'employee_name = ?',
      'contact_number = ?',
      'email = ?',
      'address = ?',
      'pin_code = ?',
      'state = ?',
      'district = ?',
      'country = ?',
      'designation_id = ?',
      'unit_id = ?',
      'employee_category = ?',
      'status = ?',
      'module_access = ?',
      'stage_access = ?',
    ];
    const values = [
      employee_name.trim(),
      contact_number  || null,
      email           || null,
      address         || null,
      pin_code        || null,
      state           || null,
      district        || null,
      country         || 'India',
      designation_id  ? parseInt(designation_id)  : null,
      unit_id         ? parseInt(unit_id)         : null,
      employee_category || 'User',
      status            || 'Active',
      moduleStr,
      stageStr,
    ];

    // Only overwrite password when a new one is provided
    if (password) {
      fields.push('password = ?');
      values.push(password);
    }

    values.push(req.params.id); // WHERE id = ?

    const [result] = await db.query(
      `UPDATE employees SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Employee not found.' });

    const [[updated]] = await db.query(
      `SELECT e.*,
              d.description AS designation_name,
              u.unit_name   AS unit_name
       FROM employees e
       LEFT JOIN designations d ON d.id = e.designation_id
       LEFT JOIN units        u ON u.id = e.unit_id
       WHERE e.id = ?`,
      [req.params.id]
    );

    res.json(updated);
  } catch (err) {
    console.error('PUT /api/employees/:id:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/employees/:id ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query(
      `DELETE FROM employees WHERE id = ?`,
      [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Employee not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/employees/:id:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;