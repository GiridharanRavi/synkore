const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../db/connection');

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function safeParseArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') { try { return JSON.parse(val) || []; } catch { return []; } }
  return [];
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name    || !String(name).trim())    return res.status(400).json({ message: 'Name is required' });
    if (!email   || !String(email).trim())   return res.status(400).json({ message: 'Email is required' });
    if (!password || password.length < 6)    return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    if (existing.length) return res.status(400).json({ message: 'An account with this email already exists' });

    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [String(name).trim(), email.trim().toLowerCase(), hash, 'admin'],
    );

    res.status(201).json({ message: 'Admin account created successfully' });
  } catch (err) {
    console.error('[POST /auth/register]', err);
    res.status(500).json({ message: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// Stage 1: `users`     → admin login (bcrypt password)        → role: 'admin'
// Stage 2: `employees` → staff login (plain password, scoped) → role: 'employee'
// Stage 3: `customers` → client login (plain password)        → role: 'client'
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const identifier = String(email).trim().toLowerCase();
    console.log(`\n[LOGIN ATTEMPT] identifier="${identifier}" passwordLength=${String(password).length}`);

    // ── Stage 1: Admin (users table) ─────────────────────────────────────────
    const [adminRows] = await db.query('SELECT * FROM users WHERE email = ?', [identifier]);
    console.log(`[LOGIN] Stage 1 (users) → ${adminRows.length} row(s) matched`);

    if (adminRows.length) {
      const user  = adminRows[0];
      const match = await bcrypt.compare(password, user.password);
      console.log(`[LOGIN] Stage 1 password match: ${match}`);
      if (!match) return res.status(401).json({ message: 'Invalid email or password' });

      const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });
      return res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    }

    // ── Stage 2: Employee (employees table) ──────────────────────────────────
    const [empRows] = await db.query(
      `SELECT * FROM employees
       WHERE (LOWER(employee_code) = ? OR LOWER(email) = ?) AND status = 'Active'`,
      [identifier, identifier],
    );
    console.log(`[LOGIN] Stage 2 (employees) → ${empRows.length} row(s) matched`);

    if (empRows.length) {
      const employee = empRows[0];
      const passOk = !!employee.password && employee.password === password;
      console.log(`[LOGIN] Stage 2 stored password="${employee.password}" provided="${password}" match=${passOk}`);

      if (!passOk) return res.status(401).json({ message: 'Invalid email or password' });

      const module_access = safeParseArray(employee.module_access);
      const stage_access  = safeParseArray(employee.stage_access);

      const token = signToken({
        id:            employee.id,
        employee_code: employee.employee_code,
        name:          employee.employee_name,
        email:         employee.email,
        role:          'employee',
        employee_category: employee.employee_category,
        module_access,
        stage_access,
      });

      return res.json({
        token,
        user: {
          id:            employee.id,
          employee_code: employee.employee_code,
          name:          employee.employee_name,
          email:         employee.email,
          role:          'employee',
          employee_category: employee.employee_category,
          module_access,
          stage_access,
        },
      });
    }

    // ── Stage 3: Client (customers table via email_username) ──────────────────
    // First, look up WITHOUT the status filter so we can tell apart
    // "row not found at all" vs "row found but status/password wrong".
    const [debugRows] = await db.query(
      `SELECT id, customer_id, customer_name, email_username, email_password, status
       FROM customers
       WHERE LOWER(email_username) = ?`,
      [identifier],
    );
    console.log(`[LOGIN] Stage 3 (customers, no status filter) → ${debugRows.length} row(s) matched`);
    if (debugRows.length) {
      const c = debugRows[0];
      console.log(`[LOGIN] Stage 3 row found: customer_id=${c.customer_id} email_username="${c.email_username}" status="${c.status}" stored_password="${c.email_password}" provided_password="${password}"`);
      console.log(`[LOGIN] Stage 3 status === 'Active' ? ${c.status === 'Active'} | password match ? ${c.email_password === password}`);
    } else {
      console.log(`[LOGIN] Stage 3: NO row has email_username matching "${identifier}" — check the actual stored value with: SELECT customer_id, email_username, status FROM customers;`);
    }

    const clientRows = debugRows.filter(c => c.status === 'Active' && c.email_password === password);

    if (clientRows.length) {
      const customer = clientRows[0];

      const token = signToken({
        id:          customer.id,
        customer_id: customer.customer_id,
        name:        customer.customer_name,
        email:       customer.email_username,
        role:        'client',
      });

      return res.json({
        token,
        user: {
          id:          customer.id,
          customer_id: customer.customer_id,
          name:        customer.customer_name,
          email:       customer.email_username,
          role:        'client',
        },
      });
    }

    // ── No table matched ───────────────────────────────────────────────────────
    console.log(`[LOGIN] No match in any table for "${identifier}" — returning 401\n`);
    return res.status(401).json({ message: 'Invalid email or password' });

  } catch (err) {
    console.error('[POST /auth/login]', err);
    res.status(500).json({ message: 'Login failed. Please try again.' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    res.json({ user: payload });
  } catch {
    res.status(401).json({ message: 'Token invalid or expired' });
  }
});




module.exports = router;