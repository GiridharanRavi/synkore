import {
  useEffect, useRef, useState, useCallback,
} from 'react';
import {
  Plus, Search, X, ChevronDown, Loader2, AlertCircle,
  CheckCircle2, Info, AlertTriangle, Wallet, Bus, UtensilsCrossed,
  PenLine, Package, IndianRupee, Calendar, Download, FileSpreadsheet,
  FileText, Printer, Settings2, Users,
} from 'lucide-react';
import employeeTrackerService, {
  EmployeeExpense, EmployeeLite, MonthSummary, EmployeeBudgetRow,
} from '../../../api/services';

// ─── Types ────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string; }
interface FieldErrors {
  employee_id?: string;
  expense_date?: string;
  transport_expense?: string;
  food_expense?: string;
  stationery_expense?: string;
  other_expense?: string;
}

// ─── Expense category definitions ──────────────────────────────
const CATEGORIES = [
  { key: 'transport_expense',  label: 'Transport Expenses',  icon: Bus,              color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  { key: 'food_expense',       label: 'Food Expenses',       icon: UtensilsCrossed,  color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
  { key: 'stationery_expense', label: 'Stationery Expenses', icon: PenLine,          color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  { key: 'other_expense',      label: 'Other Expenses',      icon: Package,          color: '#7c3aed', bg: '#faf5ff', border: '#c4b5fd' },
] as const;
type CategoryKey = typeof CATEGORIES[number]['key'];

const STATUS_OPTS = ['Pending', 'Approved', 'Paid', 'Rejected'] as const;
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Pending:  { bg: '#fef3c7', color: '#92400e' },
  Approved: { bg: '#dbeafe', color: '#1e40af' },
  Paid:     { bg: '#dcfce7', color: '#166534' },
  Rejected: { bg: '#fee2e2', color: '#991b1b' },
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtMoney(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
}
function monthLabel(m: string) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
// Timezone-safe date formatter — regex extraction rather than `new Date()` parsing.
function fmtDate(d: string) {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  return `${parseInt(m[3], 10)} ${MONTHS_SHORT[parseInt(m[2], 10) - 1]} ${m[1]}`;
}
function csvEscape(v: any) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Toast system ───────────────────────────────────────────────
let _tid = 0;
function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++_tid;
    setToasts(p => [...p, { id, type, title, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);
  const remove = useCallback((id: number) => setToasts(p => p.filter(t => t.id !== id)), []);
  return { toasts, push, remove };
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  const cfg: Record<ToastType, { bg: string; border: string; color: string; icon: React.ReactNode }> = {
    success: { bg: '#f0fdf4', border: '#86efac', color: '#166534', icon: <CheckCircle2 size={16} color="#16a34a" /> },
    error:   { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', icon: <AlertCircle  size={16} color="#dc2626" /> },
    warning: { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: <AlertTriangle size={16} color="#d97706" /> },
    info:    { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af', icon: <Info          size={16} color="#2563eb" /> },
  };
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360, width: 'calc(100vw - 40px)', pointerEvents: 'none' }}>
      {toasts.map(t => {
        const c = cfg[t.type];
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', pointerEvents: 'all', fontFamily: "'DM Sans',sans-serif" }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: c.color }}>{t.title}</p>
              {t.message && <p style={{ margin: '2px 0 0', fontSize: 12, color: c.color, opacity: 0.8, lineHeight: 1.4 }}>{t.message}</p>}
            </div>
            <button onClick={() => onRemove(t.id)} style={{ flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.color, opacity: 0.6, display: 'flex', alignItems: 'center' }}><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Searchable employee dropdown ───────────────────────────────
interface SDOption { value: string; label: string; sub?: string; }
function SearchableDropdown({ value, onChange, options, placeholder = '— Select —', disabled = false }: {
  value: string; onChange: (v: string) => void; options: SDOption[]; placeholder?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find(o => o.value === value);
  const filtered = query.trim() ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase())) : options;
  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => { if (open) setTimeout(() => searchRef.current?.focus(), 60); }, [open]);
  return (
    <div ref={wrapRef} style={{ position: 'relative', fontFamily: "'DM Sans',sans-serif" }}>
      <div onClick={() => { if (!disabled) setOpen(v => !v); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px 8px 12px', border: `1px solid ${open ? '#2563eb' : '#cbd5e1'}`, borderRadius: 8, background: disabled ? '#f1f5f9' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, boxShadow: open ? '0 0 0 3px rgba(37,99,235,0.12)' : 'none', minHeight: 37 }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? '#1e293b' : '#9ca3af' }}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={15} color="#94a3b8" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
      </div>
      {open && !disabled && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.13)', zIndex: 9000, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
            <Search size={13} color="#94a3b8" style={{ flexShrink: 0 }} />
            <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search employee…" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: '#1e293b', background: 'transparent', fontFamily: "'DM Sans',sans-serif" }} />
            {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#94a3b8' }}><X size={12} /></button>}
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0
              ? <div style={{ padding: '12px 14px', fontSize: 12, color: '#94a3b8', textAlign: 'center', fontStyle: 'italic' }}>No results</div>
              : filtered.map(opt => {
                  const isSel = opt.value === value;
                  return (
                    <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); setQuery(''); }}
                      style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', background: isSel ? '#eff6ff' : 'transparent', color: isSel ? '#1d4ed8' : '#374151', fontWeight: isSel ? 600 : 400 }}>
                      <div>{opt.label}</div>
                      {opt.sub && <div style={{ fontSize: 11, color: '#94a3b8' }}>{opt.sub}</div>}
                    </div>
                  );
                })}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children, error, hint }: { label: string; required?: boolean; children: React.ReactNode; error?: string; hint?: string; }) {
  return (
    <div>
      <label style={s.label}>{label}{required && <span style={{ color: '#ef4444' }}> *</span>}</label>
      {children}
      {error ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#dc2626', marginTop: 4 }}><AlertCircle size={11} style={{ flexShrink: 0 }} />{error}</span>
        : hint ? <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{hint}</span> : null}
    </div>
  );
}

// ─── Export dropdown (CSV / Excel / Print) ─────────────────────
function ExportMenu({ rows, month, disabled }: { rows: EmployeeExpense[]; month: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const headers = ['Date', 'Employee Code', 'Employee Name', 'Transport', 'Food', 'Stationery', 'Other', 'Total', 'Status', 'Remarks'];
  const dataRows = rows.map(r => [
    fmtDate(r.expense_date), r.employee_code ?? '', r.employee_name ?? '',
    r.transport_expense, r.food_expense, r.stationery_expense, r.other_expense,
    r.total_expense ?? (r.transport_expense + r.food_expense + r.stationery_expense + r.other_expense),
    r.status, r.remarks ?? '',
  ]);

  const exportCsv = () => {
    const lines = [headers.join(','), ...dataRows.map(row => row.map(csvEscape).join(','))];
    downloadBlob(lines.join('\n'), `employee-expenses-${month}.csv`, 'text/csv;charset=utf-8;');
    setOpen(false);
  };

  const exportExcel = () => {
    const escHtml = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const table = `
      <table border="1">
        <thead><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${dataRows.map(row => `<tr>${row.map(c => `<td>${escHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>${table}</body></html>`;
    downloadBlob(html, `employee-expenses-${month}.xls`, 'application/vnd.ms-excel');
    setOpen(false);
  };

  const printTable = () => {
    const escHtml = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Employee Expenses — ${monthLabel(month)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#1e293b}
        h1{font-size:18px;margin:0 0 4px}
        p{margin:0 0 16px;color:#64748b;font-size:12px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
        th{background:#2563eb;color:#fff}
        tr:nth-child(even) td{background:#f8fafc}
      </style></head><body>
      <h1>Employee Expenses</h1>
      <p>${escHtml(monthLabel(month))} · ${rows.length} record(s)</p>
      <table>
        <thead><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${dataRows.map(row => `<tr>${row.map(c => `<td>${escHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button className="et-export-btn" disabled={disabled} onClick={() => setOpen(v => !v)}>
        <Download size={14} /> Export <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', zIndex: 9000, minWidth: 180, overflow: 'hidden' }}>
          <button className="et-export-item" onClick={exportCsv}><FileText size={14} color="#2563eb" /> Export CSV</button>
          <button className="et-export-item" onClick={exportExcel}><FileSpreadsheet size={14} color="#16a34a" /> Export Excel</button>
          <button className="et-export-item" onClick={printTable}><Printer size={14} color="#7c3aed" /> Print</button>
        </div>
      )}
    </div>
  );
}

// ─── Overall summary bar (company-wide roll-up for the month) ──
function SummaryPanel({ month, summary, onManageBudgets }: {
  month: string; summary: MonthSummary | null; onManageBudgets: () => void;
}) {
  const budget    = summary?.total_budget ?? 0;
  const allocated = summary?.total_allocated ?? 0;
  const remaining = summary?.remaining_budget ?? 0;
  const pct = budget > 0 ? Math.min(100, (allocated / budget) * 100) : 0;
  const overBudget = remaining < 0;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px', marginBottom: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wallet size={16} color="#2563eb" />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Budgets — {monthLabel(month)}</span>
        </div>
        <button onClick={onManageBudgets} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
          <Settings2 size={13} /> Manage Employee Budgets
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 14 }}>
        <MiniStat label="Total Budget" value={fmtMoney(budget)} color="#1e293b" />
        <MiniStat label="Allocated" value={fmtMoney(allocated)} color="#2563eb" />
        <MiniStat label={overBudget ? 'Over Budget' : 'Remaining'} value={fmtMoney(Math.abs(remaining))} color={overBudget ? '#dc2626' : '#16a34a'} />
        <MiniStat label="Employees Budgeted" value={String(summary?.budgeted_employees ?? 0)} color="#7c3aed" />
      </div>

      <div style={{ height: 8, borderRadius: 20, background: '#f1f5f9', overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: overBudget ? '#dc2626' : '#2563eb', borderRadius: 20, transition: 'width 0.3s' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const val = (summary as any)?.[`${cat.key.replace('_expense', '')}_total`] ?? 0;
          return (
            <div key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: 8, background: cat.bg, border: `1px solid ${cat.border}`, borderRadius: 9, padding: '8px 10px' }}>
              <Icon size={14} color={cat.color} style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: cat.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cat.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{fmtMoney(val)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 9, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

// ─── Employee Budgets modal (set each employee's budget for the month) ──
function EmployeeBudgetsModal({ month, onClose, onSaved, pushToast }: {
  month: string; onClose: () => void; onSaved: () => void;
  pushToast: (type: ToastType, title: string, message?: string) => void;
}) {
  const [rows, setRows] = useState<EmployeeBudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [dateDrafts, setDateDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await employeeTrackerService.listBudgets(month);
      setRows(data);
      setDrafts(Object.fromEntries(data.map(r => [r.employee_id, String(r.total_budget)])));
      setDateDrafts(Object.fromEntries(data.map(r => [r.employee_id, r.budget_set_on || todayDate()])));
    } catch { pushToast('error', 'Load Failed', 'Could not fetch employee budgets.'); }
    setLoading(false);
  }, [month, pushToast]);

  useEffect(() => { load(); }, [load]);

  const save = async (row: EmployeeBudgetRow) => {
    const val = Number(drafts[row.employee_id]) || 0;
    const setOn = dateDrafts[row.employee_id] || todayDate();
    setSavingId(row.employee_id);
    try {
      await employeeTrackerService.saveEmployeeBudget(row.employee_id, month, val, setOn);
      setRows(prev => prev.map(r => r.employee_id === row.employee_id ? { ...r, total_budget: val, budget_set_on: setOn } : r));
      pushToast('success', 'Budget Updated', `${fmtMoney(val)} set for ${row.employee_name} on ${fmtDate(setOn)}.`);
      onSaved();
    } catch (e: any) { pushToast('error', 'Save Failed', e.message ?? 'Could not update budget.'); }
    setSavingId(null);
  };

  const totalBudget    = rows.reduce((s, r) => s + (Number(drafts[r.employee_id]) || 0), 0);
  const totalAllocated = rows.reduce((s, r) => s + r.allocated, 0);

  return (
    <div className="et-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="et-modal" style={{ maxWidth: 720 }}>
        <div className="et-modal-header">
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={17} /> Employee Budgets — {monthLabel(month)}
          </h2>
          <button style={s.closeBtn} onClick={onClose}><X size={20} color="#fff" /></button>
        </div>
        <div className="et-modal-body" style={{ paddingTop: 8 }}>
          {loading ? (
            <div className="et-empty"><Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} /></div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="et-table" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th className="th-right">Budget</th>
                    <th>Set On</th>
                    <th className="th-right">Allocated</th>
                    <th className="th-right">Remaining</th>
                    <th className="th-center">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const draft = Number(drafts[r.employee_id]) || 0;
                    const remaining = draft - r.allocated;
                    return (
                      <tr key={r.employee_id}>
                        <td>
                          <div className="et-name">{r.employee_name}</div>
                          <span className="et-emp-id">{r.employee_code}</span>
                        </td>
                        <td className="td-right">
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <IndianRupee size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input type="number" min={0} value={drafts[r.employee_id] ?? '0'}
                              onChange={e => setDrafts(d => ({ ...d, [r.employee_id]: e.target.value }))}
                              style={{ width: 110, padding: '6px 8px 6px 22px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 12.5, fontFamily: "'DM Sans',sans-serif", textAlign: 'right' }} />
                          </div>
                        </td>
                        <td>
                          <input type="date" value={dateDrafts[r.employee_id] ?? todayDate()}
                            onChange={e => setDateDrafts(d => ({ ...d, [r.employee_id]: e.target.value }))}
                            style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
                        </td>
                        <td className="td-right">{fmtMoney(r.allocated)}</td>
                        <td className="td-right" style={{ fontWeight: 700, color: remaining < 0 ? '#dc2626' : '#16a34a' }}>{fmtMoney(remaining)}</td>
                        <td className="th-center">
                          <button disabled={savingId === r.employee_id} onClick={() => save(r)}
                            style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#16a34a', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                            {savingId === r.employee_id ? '…' : 'Save'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="et-modal-footer">
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Total budget: <strong>{fmtMoney(totalBudget)}</strong> · Allocated: <strong>{fmtMoney(totalAllocated)}</strong>
          </span>
          <button className="et-btn-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

const BLANK: EmployeeExpense = {
  employee_id: 0,
  expense_date: todayDate(),
  transport_expense: 0,
  food_expense: 0,
  stationery_expense: 0,
  other_expense: 0,
  remarks: '',
  status: 'Pending',
};

export default function EmployeeTracker() {
  const [expenses, setExpenses]   = useState<EmployeeExpense[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [summary, setSummary]     = useState<MonthSummary | null>(null);

  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [exportRows, setExportRows] = useState<EmployeeExpense[]>([]);

  const [month, setMonth]         = useState(currentMonth());
  const [search, setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(10);

  const [showForm, setShowForm]   = useState(false);
  const [showBudgets, setShowBudgets] = useState(false);
  const [form, setForm]           = useState<EmployeeExpense>(BLANK);
  const [editId, setEditId]       = useState<number | null>(null);
  const [error, setError]         = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const { toasts, push: pushToast, remove: removeToast } = useToast();

  const employeeOptions: SDOption[] = employees.map(e => ({ value: String(e.id), label: e.employee_name, sub: e.employee_code }));
  const employeeFilterOptions = [{ value: '', label: 'All Employees' }, ...employees.map(e => ({ value: String(e.id), label: `${e.employee_name} (${e.employee_code})` }))];

  const loadEmployees = async () => {
    try { setEmployees(await employeeTrackerService.listEmployees()); }
    catch { pushToast('error', 'Load Failed', 'Could not fetch employee list.'); }
  };

  const loadSummary = async () => {
    try { setSummary(await employeeTrackerService.getSummary(month)); }
    catch { /* non-fatal */ }
  };

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await employeeTrackerService.list({
        month, search, status: filterStatus, employee: filterEmployee, page, limit: pageSize,
      });
      setExpenses(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch { pushToast('error', 'Load Failed', 'Could not fetch expense records.'); }
    setLoading(false);
  };

  // Full (unpaginated) rows for the current filters — used by the export menu.
  const loadExportRows = async () => {
    try {
      const res = await employeeTrackerService.list({
        month, search, status: filterStatus, employee: filterEmployee, page: 1, limit: 5000,
      });
      setExportRows(res.data ?? []);
    } catch { /* export just falls back to the current page */ }
  };

  useEffect(() => { loadEmployees(); }, []);
  useEffect(() => { loadSummary(); }, [month]);
  useEffect(() => { loadList(); }, [month, search, filterStatus, filterEmployee, page, pageSize]);
  useEffect(() => { loadExportRows(); }, [month, search, filterStatus, filterEmployee]);
  useEffect(() => { setPage(1); }, [month, search, filterStatus, filterEmployee]);
  useEffect(() => { document.body.style.overflow = (showForm || showBudgets) ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [showForm, showBudgets]);

  const openCreate = () => {
    setForm({ ...BLANK, expense_date: todayDate() });
    setEditId(null); setError(''); setFieldErrors({}); setShowForm(true);
  };
  const openEdit = async (id: number) => {
    try {
      const data = await employeeTrackerService.get(id);
      setForm({ ...BLANK, ...data, remarks: data.remarks ?? '' });
      setEditId(id); setError(''); setFieldErrors({}); setShowForm(true);
    } catch { pushToast('error', 'Load Failed', 'Could not load this expense record.'); }
  };

  const validateAll = (): boolean => {
    const e: FieldErrors = {};
    if (!editId && !form.employee_id) e.employee_id = 'Please select an employee.';
    if (!form.expense_date) e.expense_date = 'Please select a date.';
    (['transport_expense', 'food_expense', 'stationery_expense', 'other_expense'] as CategoryKey[]).forEach(k => {
      if (Number(form[k]) < 0) (e as any)[k] = 'Cannot be negative.';
    });
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  };

  const refreshAfterSave = () => { loadSummary(); loadExportRows(); };

  const handleSave = async () => {
    if (!validateAll()) { setError('Please fix the highlighted errors before saving.'); return; }
    setError(''); setSaving(true);
    try {
      if (editId) {
        const updated = await employeeTrackerService.update(editId, form);
        setExpenses(prev => prev.map(x => x.id === editId ? updated : x));
        pushToast('success', 'Expense Updated', `${updated.employee_name} — ${fmtDate(updated.expense_date)} saved.`);
      } else {
        const created = await employeeTrackerService.create(form);
        if (created.expense_date.slice(0, 7) === month) {
          loadList();
        }
        pushToast('success', 'Expense Added', `${created.employee_name} — ${fmtDate(created.expense_date)} recorded.`);
      }
      refreshAfterSave();
      setShowForm(false);
    } catch (e: any) {
      const msg = e.message ?? 'Save failed';
      setError(msg); pushToast('error', 'Save Failed', msg);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number, name?: string) => {
    if (!confirm(`Delete this expense record${name ? ` for ${name}` : ''}?`)) return;
    try {
      await employeeTrackerService.remove(id);
      setExpenses(prev => prev.filter(x => x.id !== id));
      setTotal(t => Math.max(0, t - 1));
      pushToast('success', 'Record Deleted', 'Expense record removed.');
      refreshAfterSave();
      if (expenses.length === 1 && page > 1) setPage(p => p - 1);
    } catch { pushToast('error', 'Delete Failed', 'Could not delete record.'); }
  };

  const set = (key: keyof EmployeeExpense, val: any) => setForm(f => ({ ...f, [key]: val }));
  const formTotal = CATEGORIES.reduce((sum, c) => sum + (Number((form as any)[c.key]) || 0), 0);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNums = (() => {
    const pages: number[] = [];
    let start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  })();
  const goTo = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .et-wrap{font-family:'DM Sans',sans-serif;font-size:14px;color:#1e293b}
        .et-page-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px}
        .et-page-header h1{margin:0;font-size:20px;font-weight:700;color:#1e293b}
        .et-page-header p{margin:3px 0 0;font-size:13px;color:#64748b}
        .et-header-actions{display:flex;gap:8px;flex-wrap:wrap}
        .et-add-btn{display:flex;align-items:center;gap:6px;background:#2563eb;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 2px 6px rgba(37,99,235,0.3);white-space:nowrap}
        .et-add-btn:hover{background:#1d4ed8}
        .et-export-btn{display:flex;align-items:center;gap:6px;background:#fff;color:#374151;border:1px solid #cbd5e1;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;white-space:nowrap}
        .et-export-btn:hover:not(:disabled){background:#f8fafc}
        .et-export-btn:disabled{opacity:0.6;cursor:not-allowed}
        .et-export-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:9px 14px;font-size:13px;color:#374151;background:#fff;border:none;cursor:pointer;font-family:'DM Sans',sans-serif}
        .et-export-item:hover{background:#f8fafc}
        .et-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px}
        .et-month-input{border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;font-size:13px;font-family:'DM Sans',sans-serif;background:#fff;color:#374151;cursor:pointer}
        .et-search-wrap{position:relative;flex:1;min-width:180px;max-width:280px}
        .et-search-wrap svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#94a3b8}
        .et-search{width:100%;padding:8px 12px 8px 34px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-family:'DM Sans',sans-serif;background:#fff;color:#1e293b;outline:none}
        .et-filter-sel{border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;font-size:13px;font-family:'DM Sans',sans-serif;background:#fff;color:#374151;cursor:pointer;max-width:220px}
        .et-page-size{display:flex;align-items:center;gap:6px;font-size:13px;color:#64748b;margin-left:auto}
        .et-page-size select{border:1px solid #cbd5e1;border-radius:6px;padding:5px 8px;font-size:13px;font-family:'DM Sans',sans-serif;background:#fff;cursor:pointer}
        .et-card{background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.07);margin-bottom:24px}
        .et-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
        .et-table{width:100%;border-collapse:collapse;font-size:13px;font-family:'DM Sans',sans-serif;min-width:760px}
        .et-table thead tr{background:#2563eb}
        .et-table th{padding:11px 12px;color:#fff;font-weight:600;text-align:left;white-space:nowrap;font-size:12px}
        .et-table th.th-right{text-align:right}
        .et-table th.th-center{text-align:center}
        .et-table tbody tr:nth-child(odd) td{background:#fff}
        .et-table tbody tr:nth-child(even) td{background:#f8fafc}
        .et-table tbody tr:hover td{filter:brightness(0.97)}
        .et-table td{padding:10px 12px;color:#374151;font-size:12px;white-space:nowrap}
        .et-table td.td-right{text-align:right;font-family:'DM Mono',monospace}
        .et-emp-id{display:inline-block;font-family:'DM Mono',monospace;font-size:11px;font-weight:500;color:#1d4ed8;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:2px 7px}
        .et-name{font-weight:600}
        .et-date-chip{display:inline-block;font-family:'DM Mono',monospace;font-size:11px;font-weight:600;color:#374151}
        .et-chip{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600}
        .et-action-group{display:flex;align-items:center;gap:5px;justify-content:center}
        .et-btn-edit{display:inline-flex;align-items:center;gap:3px;background:#eff6ff;color:#2563eb;border:1px solid #93c5fd;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer}
        .et-btn-edit:hover{background:#dbeafe}
        .et-btn-del{display:inline-flex;align-items:center;gap:3px;background:#fff1f2;color:#dc2626;border:1px solid #fca5a5;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer}
        .et-btn-del:hover{background:#fee2e2}
        .et-empty{text-align:center;padding:40px 16px;color:#94a3b8;font-size:13px}
        .et-pagination{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-top:1px solid #f1f5f9;background:#f8fafc;font-size:12px;color:#64748b;flex-wrap:wrap;gap:8px;font-family:'DM Sans',sans-serif}
        .et-pag-btns{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
        .et-pag-btn{padding:4px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;min-width:30px;height:30px;display:flex;align-items:center;justify-content:center}
        .et-pag-btn:hover:not(:disabled){background:#f1f5f9}
        .et-pag-btn.active{background:#2563eb;color:#fff;border-color:#2563eb;font-weight:700}
        .et-pag-btn:disabled{border-color:#e2e8f0;background:#f1f5f9;color:#94a3b8;cursor:not-allowed}
        .et-modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.5);display:flex;align-items:flex-start;justify-content:center;z-index:2000;overflow-y:auto;padding:16px 8px}
        .et-modal{background:#fff;border-radius:14px;width:100%;max-width:640px;box-shadow:0 8px 40px rgba(0,0,0,0.22);display:flex;flex-direction:column;max-height:calc(100vh - 32px)}
        .et-modal-header{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#2563eb;border-radius:14px 14px 0 0;flex-shrink:0}
        .et-modal-body{padding:16px;overflow-y:auto;flex:1}
        .et-modal-footer{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid #f1f5f9;background:#f8fafc;flex-shrink:0;border-radius:0 0 14px 14px}
        .et-grid{display:grid;grid-template-columns:1fr;gap:12px;padding:12px 0}
        @media(min-width:480px){.et-grid{grid-template-columns:repeat(2,1fr);gap:14px}}
        .et-col-full{grid-column:1/-1}
        .et-btn-cancel{padding:9px 16px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;color:#475569;font-family:'DM Sans',sans-serif}
        .et-btn-save{display:flex;align-items:center;gap:6px;padding:9px 20px;border:none;background:#16a34a;color:#fff;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 2px 6px rgba(22,163,74,0.3)}
        .et-btn-save:disabled{opacity:0.7;cursor:not-allowed}
        input:focus,select:focus,textarea:focus{outline:none;border-color:#2563eb!important;box-shadow:0 0 0 3px rgba(37,99,235,0.1)!important}
        select,input,textarea{font-family:'DM Sans',sans-serif}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:#f1f5f9}
        ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
      `}</style>

      <div className="et-wrap">
        <div className="et-page-header">
          <div>
            <h1>Employee Tracker</h1>
            <p>Daily, date-wise employee expense records — Transport, Food, Stationery & Other</p>
          </div>
          <div className="et-header-actions">
            <ExportMenu rows={exportRows.length ? exportRows : expenses} month={month} disabled={loading && exportRows.length === 0} />
            <button className="et-add-btn" onClick={openCreate}><Plus size={15} /> New Expense Entry</button>
          </div>
        </div>

        <SummaryPanel month={month} summary={summary} onManageBudgets={() => setShowBudgets(true)} />

        <div className="et-toolbar">
          <label className="et-month-input" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={13} color="#64748b" />
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ border: 'none', outline: 'none', fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: '#374151', background: 'transparent' }} />
          </label>
          <div className="et-search-wrap">
            <Search size={14} />
            <input className="et-search" placeholder="Search employee name/code…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="et-filter-sel" value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
            {employeeFilterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="et-filter-sel" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            {STATUS_OPTS.map(st => <option key={st}>{st}</option>)}
          </select>
          <div className="et-page-size">
            <span>Show</span>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>entries</span>
          </div>
        </div>

        <div className="et-card">
          <div className="et-table-wrap">
            <table className="et-table">
              <thead>
                <tr>
                  <th>#</th><th>Date</th><th>Employee</th>
                  <th className="th-right">Transport</th>
                  <th className="th-right">Food</th>
                  <th className="th-right">Stationery</th>
                  <th className="th-right">Other</th>
                  <th className="th-right">Total</th>
                  <th>Status</th>
                  <th className="th-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="et-empty"><Loader2 size={22} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} /></td></tr>
                ) : expenses.length === 0 ? (
                  <tr><td colSpan={10} className="et-empty">{search || filterStatus || filterEmployee ? 'No expense records match your search' : `No expense records for ${monthLabel(month)} yet. Click "New Expense Entry" to add one.`}</td></tr>
                ) : expenses.map((ex, i) => {
                  const stColor = STATUS_COLOR[ex.status] || STATUS_COLOR.Pending;
                  return (
                    <tr key={ex.id}>
                      <td style={{ color: '#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                      <td><span className="et-date-chip">{fmtDate(ex.expense_date)}</span></td>
                      <td>
                        <div className="et-name">{ex.employee_name}</div>
                        <span className="et-emp-id">{ex.employee_code}</span>
                      </td>
                      <td className="td-right">{fmtMoney(ex.transport_expense)}</td>
                      <td className="td-right">{fmtMoney(ex.food_expense)}</td>
                      <td className="td-right">{fmtMoney(ex.stationery_expense)}</td>
                      <td className="td-right">{fmtMoney(ex.other_expense)}</td>
                      <td className="td-right" style={{ fontWeight: 700, color: '#1e293b' }}>{fmtMoney(ex.total_expense ?? 0)}</td>
                      <td><span className="et-chip" style={{ background: stColor.bg, color: stColor.color }}>{ex.status}</span></td>
                      <td>
                        <div className="et-action-group">
                          <button className="et-btn-edit" onClick={() => openEdit(ex.id!)}>✏️ Edit</button>
                          <button className="et-btn-del" onClick={() => handleDelete(ex.id!, ex.employee_name)}>🗑 Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!loading && total > 0 && (
            <div className="et-pagination">
              <span>Page {page} of {totalPages} · {total} record(s)</span>
              <div className="et-pag-btns">
                <button className="et-pag-btn" onClick={() => goTo(1)} disabled={page === 1}>«</button>
                <button className="et-pag-btn" onClick={() => goTo(page - 1)} disabled={page === 1}>‹</button>
                {pageNums.map(p => <button key={p} className={`et-pag-btn${p === page ? ' active' : ''}`} onClick={() => goTo(p)}>{p}</button>)}
                <button className="et-pag-btn" onClick={() => goTo(page + 1)} disabled={page === totalPages}>›</button>
                <button className="et-pag-btn" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* NEW / EDIT ENTRY MODAL */}
        {showForm && (
          <div className="et-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="et-modal">
              <div className="et-modal-header">
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>
                  {editId ? '✏️ Edit Expense Entry' : '➕ New Expense Entry'}
                </h2>
                <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={20} color="#fff" /></button>
              </div>

              {error && (
                <div style={s.errorBanner}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                  <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#ef4444', display: 'flex' }}><X size={14} /></button>
                </div>
              )}

              <div className="et-modal-body">
                <div className="et-grid">
                  <div className="et-col-full">
                    <Field label="Employee" required error={fieldErrors.employee_id}>
                      {editId ? (
                        <input type="text" readOnly value={`${form.employee_name} (${form.employee_code})`} style={{ ...s.input, ...s.inputDisabled }} />
                      ) : (
                        <SearchableDropdown value={String(form.employee_id || '')} onChange={v => set('employee_id', Number(v))} options={employeeOptions} placeholder="Select employee…" />
                      )}
                    </Field>
                  </div>

                  <Field label="Expense Date" required error={fieldErrors.expense_date}>
                    <input type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)} style={s.input} />
                  </Field>

                  <Field label="Status">
                    <select value={form.status} onChange={e => set('status', e.target.value)} style={s.input}>
                      {STATUS_OPTS.map(st => <option key={st}>{st}</option>)}
                    </select>
                  </Field>

                  {CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    const err = (fieldErrors as any)[cat.key];
                    return (
                      <Field key={cat.key} label={cat.label} error={err}>
                        <div style={{ position: 'relative' }}>
                          <Icon size={13} color={cat.color} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                          <input type="number" min={0} step="0.01" value={(form as any)[cat.key]}
                            onChange={e => set(cat.key, e.target.value === '' ? 0 : Number(e.target.value))}
                            placeholder="0.00"
                            style={{ ...s.input, paddingLeft: 32, ...(err ? s.inputError : {}) }} />
                        </div>
                      </Field>
                    );
                  })}

                  <div className="et-col-full">
                    <Field label="Remarks">
                      <textarea value={form.remarks || ''} onChange={e => set('remarks', e.target.value)} rows={2} placeholder="Optional note…" style={{ ...s.input, resize: 'vertical', lineHeight: 1.5 }} />
                    </Field>
                  </div>

                  <div className="et-col-full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total for this entry</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#2563eb' }}>{fmtMoney(formTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="et-modal-footer">
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{form.expense_date ? fmtDate(form.expense_date) : ''}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="et-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                  <button className="et-btn-save" onClick={handleSave} disabled={saving}>
                    {saving ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : (editId ? '✏️ Update' : '💾 Save Entry')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EMPLOYEE BUDGETS MODAL */}
        {showBudgets && (
          <EmployeeBudgetsModal
            month={month}
            onClose={() => setShowBudgets(false)}
            onSaved={loadSummary}
            pushToast={pushToast}
          />
        )}
      </div>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  closeBtn:      { background: 'none', border: 'none', padding: '0 4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.85 },
  errorBanner:   { display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#ef4444', padding: '10px 16px', margin: '12px 16px 0', fontSize: 13, fontFamily: "'DM Sans',sans-serif" },
  label:         { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' },
  input:         { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, color: '#1e293b', outline: 'none', boxSizing: 'border-box', background: '#fff' },
  inputDisabled: { background: '#f1f5f9', color: '#94a3b8', cursor: 'not-allowed', border: '1px solid #e2e8f0' },
  inputError:    { border: '1.5px solid #fca5a5', background: '#fff5f5', boxShadow: '0 0 0 3px rgba(239,68,68,0.08)' },
};