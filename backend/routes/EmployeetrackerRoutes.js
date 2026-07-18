// backend/routes/EmployeetrackerRoutes.js
const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;                        // 'YYYY-MM'
const DATE_RE  = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;   // 'YYYY-MM-DD'

function isValidMonth(m) { return typeof m === 'string' && MONTH_RE.test(m); }
function isValidDate(d) {
  if (typeof d !== 'string' || !DATE_RE.test(d)) return false;
  const dt = new Date(`${d}T00:00:00`);
  return !Number.isNaN(dt.getTime());
}

// ─── GET /api/employee-tracker/meta/employees ──────────────────────────────
// Lightweight employee list for the "Employee" dropdown. Must be before /:id
router.get('/meta/employees', async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, employee_code, employee_name, employee_category
       FROM employees
       WHERE status = 'Active'
       ORDER BY employee_name`
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /employee-tracker/meta/employees:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/employee-tracker/budgets/:month ──────────────────────────────
// Per-employee budget vs allocated for a month — powers the Employee Budgets panel.
router.get('/budgets/:month', async (req, res) => {
  try {
    const { month } = req.params;
    if (!isValidMonth(month)) return res.status(400).json({ message: 'Invalid month format, expected YYYY-MM.' });

    const [rows] = await db.query(
      `SELECT
         e.id AS employee_id, e.employee_code, e.employee_name,
         b.id AS budget_id, COALESCE(b.total_budget, 0) AS total_budget,
         b.budget_set_on                                 AS budget_set_on,
         COALESCE(SUM(ee.total_expense), 0)              AS allocated,
         COUNT(ee.id)                                     AS entry_count
       FROM employees e
       LEFT JOIN employee_budgets b
         ON b.employee_id = e.id AND b.budget_month = ?
       LEFT JOIN employee_expenses ee
         ON ee.employee_id = e.id AND ee.expense_month = ?
       WHERE e.status = 'Active'
       GROUP BY e.id, e.employee_code, e.employee_name, b.id, b.total_budget, b.budget_set_on
       ORDER BY e.employee_name`,
      [month, month]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /employee-tracker/budgets/:month:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── PUT /api/employee-tracker/budget/:employeeId/:month ───────────────────
// Upsert a single employee's released budget for a month.
router.put('/budget/:employeeId/:month', async (req, res) => {
  try {
    const { employeeId, month } = req.params;
    const { total_budget = 0, notes = null, budget_set_on = null } = req.body;
    if (!isValidMonth(month)) return res.status(400).json({ message: 'Invalid month format, expected YYYY-MM.' });
    if (!employeeId) return res.status(400).json({ message: 'Employee is required.' });
    if (budget_set_on && !isValidDate(budget_set_on)) {
      return res.status(400).json({ message: 'Invalid budget_set_on date, expected YYYY-MM-DD.' });
    }

    await db.query(
      `INSERT INTO employee_budgets (employee_id, budget_month, total_budget, budget_set_on, notes)
       VALUES (?, ?, ?, COALESCE(?, CURDATE()), ?)
       ON DUPLICATE KEY UPDATE
         total_budget = VALUES(total_budget),
         budget_set_on = VALUES(budget_set_on),
         notes = VALUES(notes)`,
      [parseInt(employeeId), month, Number(total_budget) || 0, budget_set_on, notes]
    );

    const [[saved]] = await db.query(
      `SELECT b.*, e.employee_code, e.employee_name
       FROM employee_budgets b
       JOIN employees e ON e.id = b.employee_id
       WHERE b.employee_id = ? AND b.budget_month = ?`,
      [parseInt(employeeId), month]
    );
    res.json(saved);
  } catch (err) {
    console.error('PUT /employee-tracker/budget/:employeeId/:month:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/employee-tracker/summary/:month ──────────────────────────────
// Company-wide roll-up for the month (sum of all employee budgets + all entries).
router.get('/summary/:month', async (req, res) => {
  try {
    const { month } = req.params;
    if (!isValidMonth(month)) return res.status(400).json({ message: 'Invalid month format, expected YYYY-MM.' });

    const [[budgetAgg]] = await db.query(
      `SELECT COALESCE(SUM(total_budget), 0) AS total_budget, COUNT(*) AS budgeted_employees
       FROM employee_budgets WHERE budget_month = ?`,
      [month]
    );

    const [[agg]] = await db.query(
      `SELECT
         COUNT(DISTINCT employee_id)           AS employee_count,
         COALESCE(SUM(transport_expense), 0)   AS transport_total,
         COALESCE(SUM(food_expense), 0)        AS food_total,
         COALESCE(SUM(stationery_expense), 0)  AS stationery_total,
         COALESCE(SUM(other_expense), 0)       AS other_total,
         COALESCE(SUM(total_expense), 0)       AS total_allocated
       FROM employee_expenses
       WHERE expense_month = ?`,
      [month]
    );

    const totalBudget = budgetAgg.total_budget || 0;
    res.json({
      expense_month: month,
      total_budget: totalBudget,
      total_allocated: agg.total_allocated,
      remaining_budget: totalBudget - agg.total_allocated,
      employee_count: agg.employee_count,
      budgeted_employees: budgetAgg.budgeted_employees,
      transport_total: agg.transport_total,
      food_total: agg.food_total,
      stationery_total: agg.stationery_total,
      other_total: agg.other_total,
    });
  } catch (err) {
    console.error('GET /employee-tracker/summary/:month:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/employee-tracker ──────────────────────────────────────────────
// List daily expense entries. Filter by month and/or an exact date, employee, etc.
router.get('/', async (req, res) => {
  try {
    const {
      month = '', date = '', search = '', status = '', employee = '',
      page = 1, limit = 10,
    } = req.query;

    const conditions = [];
    const params     = [];

    if (month)    { conditions.push(`ee.expense_month = ?`); params.push(month); }
    if (date)     { conditions.push(`ee.expense_date = ?`);  params.push(date); }
    if (status)   { conditions.push(`ee.status = ?`);        params.push(status); }
    if (employee) { conditions.push(`ee.employee_id = ?`);   params.push(employee); }
    if (search) {
      conditions.push(`(e.employee_name LIKE ? OR e.employee_code LIKE ?)`);
      const q = `%${search}%`;
      params.push(q, q);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM employee_expenses ee
       JOIN employees e ON e.id = ee.employee_id
       ${whereClause}`,
      params
    );

    // LIMIT/OFFSET inlined as sanitized integers — mysql2 prepared-statement
    // binding for LIMIT/OFFSET has been unreliable elsewhere in this codebase.
    const limitNum  = Math.max(1, parseInt(limit) || 10);
    const pageNum   = Math.max(1, parseInt(page) || 1);
    const offsetNum = (pageNum - 1) * limitNum;

    const [data] = await db.query(
      `SELECT ee.*,
              e.employee_code, e.employee_name, e.employee_category
       FROM employee_expenses ee
       JOIN employees e ON e.id = ee.employee_id
       ${whereClause}
       ORDER BY ee.expense_date DESC, e.employee_name ASC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );

    res.json({ data, total });
  } catch (err) {
    console.error('GET /api/employee-tracker:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/employee-tracker/:id ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ee.*, e.employee_code, e.employee_name, e.employee_category
       FROM employee_expenses ee
       JOIN employees e ON e.id = ee.employee_id
       WHERE ee.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Expense record not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/employee-tracker/:id:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/employee-tracker (create) ────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      employee_id, expense_date,
      transport_expense = 0, food_expense = 0,
      stationery_expense = 0, other_expense = 0,
      remarks, status,
    } = req.body;

    if (!employee_id) return res.status(400).json({ message: 'Employee is required.' });
    if (!isValidDate(expense_date)) return res.status(400).json({ message: 'Invalid date format, expected YYYY-MM-DD.' });

    const [result] = await db.query(
      `INSERT INTO employee_expenses
         (employee_id, expense_date, transport_expense, food_expense,
          stationery_expense, other_expense, remarks, status)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        parseInt(employee_id), expense_date,
        Number(transport_expense) || 0, Number(food_expense) || 0,
        Number(stationery_expense) || 0, Number(other_expense) || 0,
        remarks || null, status || 'Pending',
      ]
    );

    const [[created]] = await db.query(
      `SELECT ee.*, e.employee_code, e.employee_name, e.employee_category
       FROM employee_expenses ee
       JOIN employees e ON e.id = ee.employee_id
       WHERE ee.id = ?`,
      [result.insertId]
    );
    res.status(201).json(created);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This employee already has an expense entry for the selected date.' });
    }
    console.error('POST /api/employee-tracker:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── PUT /api/employee-tracker/:id (update) ─────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const {
      expense_date,
      transport_expense = 0, food_expense = 0,
      stationery_expense = 0, other_expense = 0,
      remarks, status,
    } = req.body;

    if (expense_date && !isValidDate(expense_date)) {
      return res.status(400).json({ message: 'Invalid date format, expected YYYY-MM-DD.' });
    }

    const sets = [
      'transport_expense = ?', 'food_expense = ?',
      'stationery_expense = ?', 'other_expense = ?',
      'remarks = ?', 'status = ?',
    ];
    const values = [
      Number(transport_expense) || 0, Number(food_expense) || 0,
      Number(stationery_expense) || 0, Number(other_expense) || 0,
      remarks || null, status || 'Pending',
    ];
    if (expense_date) { sets.push('expense_date = ?'); values.push(expense_date); }
    values.push(req.params.id);

    const [result] = await db.query(
      `UPDATE employee_expenses SET ${sets.join(', ')} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0) return res.status(404).json({ message: 'Expense record not found.' });

    const [[updated]] = await db.query(
      `SELECT ee.*, e.employee_code, e.employee_name, e.employee_category
       FROM employee_expenses ee
       JOIN employees e ON e.id = ee.employee_id
       WHERE ee.id = ?`,
      [req.params.id]
    );
    res.json(updated);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This employee already has an expense entry for that date.' });
    }
    console.error('PUT /api/employee-tracker/:id:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/employee-tracker/:id ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query(`DELETE FROM employee_expenses WHERE id = ?`, [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Expense record not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/employee-tracker/:id:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;