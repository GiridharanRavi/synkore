// frontend/src/pages/admin/AccountDetailsMaster.tsx
//
// Account Details page — two ledgers in one view:
//   • Payment IN  tab → Sales Invoices    → record customer payments received
//   • Payment OUT tab → Purchase Invoices → record supplier payments made
//
// ─────────────────────────────────────────────────────────────────────────
// PREVIOUS REVISIONS: backend 500 fix, Payment Type + TDS Amount fields,
// Export dropdown (CSV/Excel/Print), Payment History report view, Edit/
// Delete actions on Payment History rows, Delivery ETA column, column
// cleanup/reorder on the Invoices tables.
//
// NEW (THIS REVISION):
//
// 1) CUSTOMER / SUPPLIER FILTER + PARTY TOTALS
//    A dropdown next to the search box lists every customer (Payment In
//    tab) or supplier (Payment Out tab) with non-cancelled invoices.
//    Picking one filters the Invoices table, the Payment History table,
//    and scopes the 4 header cards to just that party. A dedicated
//    "Party Summary" strip appears showing that party's total invoiced,
//    total paid, and running balance.
//
// 2) OVER/UNDER-PAYMENT SHOWN AS A RUNNING BALANCE, NOT STUCK PER-INVOICE
//    The Party Summary balance is (their total invoiced) − (their total
//    paid), added up across ALL of their invoices — not just one. Pay
//    less than the total and it shows as a normal "Balance Due" in red.
//    Pay more than the total (across their invoices) and it flips to
//    "Advance Credit" in purple — the extra amount that's logically
//    available against their next order, instead of being invisible or
//    showing as a confusing negative number on a single invoice row.
//
// 3) Deleted/cancelled invoices: the backend fix means these no longer
//    show up in the Invoices table, Payment History, dropdown lists, or
//    the summary cards — nothing to change here on the frontend, it just
//    reflects what the (now-fixed) backend returns.
// ─────────────────────────────────────────────────────────────────────────

import {
  useEffect,
  useState,
  useCallback,
} from 'react';

import {
  Search,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  Receipt,
  CalendarClock,
  Clock,
  Banknote,
  History,
  PiggyBank,
  Download,
  ChevronDown,
  FileText,
  FileSpreadsheet,
  Printer,
  Pencil,
  Trash2,
  Users,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

import {
  fetchSalesInvoicePayments,
  fetchPurchaseInvoicePayments,
  recordPaymentIn,
  recordPaymentOut,
  type SalesInvoiceRow,
  type PurchaseInvoiceRow,
  type PaymentEntry,
  type PaymentStatus,
} from '../../api/services';

// ─── Payment type ───────────────────────────────────────────────────────────
export type PaymentType = 'Full Payment' | 'Part Payment' | 'Deposit' | 'Advance';
const PAYMENT_TYPES: PaymentType[] = ['Full Payment', 'Part Payment', 'Deposit', 'Advance'];

// ─── Extended row types ───────────────────────────────────────────────────
type SalesInvoiceRowExt = SalesInvoiceRow & {
  pl_no?: string | null;
  order_no?: string | null;
  qty?: number | string | null;
  payment_terms_label?: string | null;
  cash_paid_amount?: number;
  tds_paid_amount?: number;
  last_payment_date?: string | null;
};

type PurchaseInvoiceRowExt = PurchaseInvoiceRow & {
  internal_ref?: string | null;
  fpo_no?: string | null;
  qty?: number | string | null;
  payment_terms_label?: string | null;
  cash_paid_amount?: number;
  tds_paid_amount?: number;
  last_payment_date?: string | null;
};

type PaymentEntryExt = PaymentEntry & {
  tds_amount?: number;
  payment_type?: PaymentType;
};

// ─── Payment History row (ledger-style, one row per payment) ──────────────
interface PaymentHistoryRow {
  id: number;
  invoice_no: string;
  party_name: string | null;
  amount: number;
  tds_amount: number;
  payment_type: PaymentType;
  payment_date: string;
  mode: string;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
}

interface PaymentHistoryListResponse {
  data: PaymentHistoryRow[];
  total: number;
  page: number;
  limit: number;
}

// ─── NEW: party (customer/supplier) summary row ────────────────────────────
interface PartySummary {
  name: string;
  invoice_count: number;
  total_invoiced: number;
  total_paid: number;
  balance: number; // negative = advance credit available
}

// ─── NEW: scoped account summary (matches backend /summary response) ──────
interface ScopedAccountSummary {
  sales_invoice_count: number;
  sales_invoice_total: number;
  purchase_invoice_count: number;
  purchase_invoice_total: number;
  payment_in_total: number;
  payment_in_cash: number;
  payment_in_tds: number;
  payment_out_total: number;
  payment_out_cash: number;
  payment_out_tds: number;
  receivable_balance: number;
  payable_balance: number;
  scoped_customer: string | null;
  scoped_supplier: string | null;
}

// ─── Local fetchers (raw fetch — mirrors the backend routes exactly) ──────

async function apiGet<T>(path: string, qs: Record<string, string | number>): Promise<T> {
  const params = new URLSearchParams();
  Object.entries(qs).forEach(([k, v]) => params.set(k, String(v)));
  const res = await fetch(`${path}?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    throw new Error(body.message || `Request to ${path} failed.`);
  }
  return res.json();
}

async function fetchSalesInvoicesScoped(params: { search: string; status: string; customer: string; page: number; limit: number }) {
  return apiGet<{ data: SalesInvoiceRowExt[]; total: number; page: number; limit: number }>(
    '/api/account-details/sales-invoices', params,
  );
}

async function fetchPurchaseInvoicesScoped(params: { search: string; status: string; supplier: string; page: number; limit: number }) {
  return apiGet<{ data: PurchaseInvoiceRowExt[]; total: number; page: number; limit: number }>(
    '/api/account-details/purchase-invoices', params,
  );
}

async function fetchPaymentInHistory(params: { search: string; customer: string; page: number; limit: number }): Promise<PaymentHistoryListResponse> {
  return apiGet<PaymentHistoryListResponse>('/api/account-details/payments-in', params);
}

async function fetchPaymentOutHistory(params: { search: string; supplier: string; page: number; limit: number }): Promise<PaymentHistoryListResponse> {
  return apiGet<PaymentHistoryListResponse>('/api/account-details/payments-out', params);
}

async function fetchCustomerList(search: string = ''): Promise<PartySummary[]> {
  return apiGet<PartySummary[]>('/api/account-details/customers', { search });
}

async function fetchSupplierList(search: string = ''): Promise<PartySummary[]> {
  return apiGet<PartySummary[]>('/api/account-details/suppliers', { search });
}

async function fetchScopedSummary(params: { customer?: string; supplier?: string }): Promise<ScopedAccountSummary> {
  const qs: Record<string, string> = {};
  if (params.customer) qs.customer = params.customer;
  if (params.supplier) qs.supplier = params.supplier;
  return apiGet<ScopedAccountSummary>('/api/account-details/summary', qs);
}

// ─── Local update/delete calls for editing payment history entries ────────
interface EditablePaymentFields {
  amount: number;
  tds_amount: number;
  payment_type: PaymentType;
  payment_date: string;
  mode: string;
  reference_no: string;
  notes: string;
}

async function updatePaymentIn(id: number, fields: EditablePaymentFields): Promise<void> {
  const res = await fetch(`/api/account-details/payments-in/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    throw new Error(body.message || 'Could not update this Payment In entry.');
  }
}

async function updatePaymentOut(id: number, fields: EditablePaymentFields): Promise<void> {
  const res = await fetch(`/api/account-details/payments-out/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    throw new Error(body.message || 'Could not update this Payment Out entry.');
  }
}

async function deletePaymentInEntry(id: number): Promise<void> {
  const res = await fetch(`/api/account-details/payments-in/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    throw new Error(body.message || 'Could not delete this Payment In entry.');
  }
}

async function deletePaymentOutEntry(id: number): Promise<void> {
  const res = await fetch(`/api/account-details/payments-out/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    throw new Error(body.message || 'Could not delete this Payment Out entry.');
  }
}

// ─── Toast (same pattern as Customer Master) ─────────────────────────────────

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string }
let _toastId = 0;

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++_toastId;
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
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', pointerEvents: 'all', animation: 'toastIn 0.25s ease-out', fontFamily: "'DM Sans', sans-serif" }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: c.color }}>{t.title}</p>
              {t.message && <p style={{ margin: '2px 0 0', fontSize: 12, color: c.color, opacity: 0.8, lineHeight: 1.4 }}>{t.message}</p>}
            </div>
            <button onClick={() => onRemove(t.id)} style={{ flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.color, opacity: 0.6, display: 'flex', alignItems: 'center', marginTop: 1 }}><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: PaymentStatus }) {
  const cfg: Record<PaymentStatus, { bg: string; color: string; border: string }> = {
    'Paid':            { bg: '#dcfce7', color: '#166534', border: '#86efac' },
    'Partially Paid':  { bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
    'Pending':         { bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc' },
    'Overdue':         { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  };
  const c = cfg[status] ?? cfg['Pending'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      whiteSpace: 'nowrap',
    }}>
      {status === 'Overdue' && <AlertTriangle size={11} />}
      {status === 'Paid' && <CheckCircle2 size={11} />}
      {status}
    </span>
  );
}

// ─── Payment type chip ──────────────────────────────────────────────────────

function PaymentTypeChip({ type }: { type?: PaymentType }) {
  if (!type) return null;
  const cfg: Record<PaymentType, { bg: string; color: string; border: string }> = {
    'Full Payment': { bg: '#dcfce7', color: '#166534', border: '#86efac' },
    'Part Payment': { bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc' },
    'Deposit':      { bg: '#f3e8ff', color: '#6b21a8', border: '#d8b4fe' },
    'Advance':      { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  };
  const c = cfg[type] ?? cfg['Part Payment'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '1px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      whiteSpace: 'nowrap',
    }}>
      {type}
    </span>
  );
}

// ─── Invoice ETA badge ──────────────────────────────────────────────────────

type InvoiceEtaTone = 'finished-early' | 'finished-ontime' | 'finished-late' | 'left' | 'overdue';
interface InvoiceEtaInfo { label: string; tone: InvoiceEtaTone; }

function computeInvoiceEta(row: { due_date: string; status: PaymentStatus; last_payment_date?: string | null }): InvoiceEtaInfo {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(row.due_date);
  due.setHours(0, 0, 0, 0);

  if (row.status === 'Paid') {
    if (row.last_payment_date) {
      const paid = new Date(row.last_payment_date);
      paid.setHours(0, 0, 0, 0);
      const diff = Math.round((due.getTime() - paid.getTime()) / 86400000);
      if (diff > 0) return { label: `Finished +${diff}d early`, tone: 'finished-early' };
      if (diff < 0) return { label: `Finished ${Math.abs(diff)}d late`, tone: 'finished-late' };
      return { label: 'Finished on time', tone: 'finished-ontime' };
    }
    return { label: 'Finished', tone: 'finished-early' };
  }

  const diffToday = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffToday >= 0) {
    return { label: diffToday === 0 ? 'Due today' : `${diffToday}d left`, tone: 'left' };
  }
  return { label: `${Math.abs(diffToday)}d overdue`, tone: 'overdue' };
}

function InvoiceEtaBadge({ row }: { row: { due_date: string; status: PaymentStatus; last_payment_date?: string | null } }) {
  const eta = computeInvoiceEta(row);
  const cfg: Record<InvoiceEtaTone, { bg: string; color: string; border: string; icon?: React.ReactNode }> = {
    'finished-early':  { bg: '#dcfce7', color: '#166534', border: '#86efac', icon: <CheckCircle2 size={11} /> },
    'finished-ontime': { bg: '#dcfce7', color: '#166534', border: '#86efac', icon: <CheckCircle2 size={11} /> },
    'finished-late':   { bg: '#fef3c7', color: '#92400e', border: '#fde68a', icon: <CheckCircle2 size={11} /> },
    'left':            { bg: '#dcfce7', color: '#166534', border: '#86efac' },
    'overdue':         { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', icon: <AlertTriangle size={11} /> },
  };
  const c = cfg[eta.tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      whiteSpace: 'nowrap',
    }}>
      {c.icon}{eta.label}
    </span>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div style={{
      flex: '1 1 200px', minWidth: 180, background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', fontFamily: "'DM Mono', monospace" }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: '#64748b' }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── NEW: Party summary strip (customer/supplier totals + credit/due) ─────
function PartySummaryStrip({ kind, party, name }: { kind: Tab; party: PartySummary; name: string }) {
  const isCredit = party.balance < -0.001;
  const isDue = party.balance > 0.001;
  const accent = kind === 'in' ? '#16a34a' : '#dc2626';

  let balanceLabel = 'Fully Settled';
  let balanceColor = '#16a34a';
  let balanceSub = 'No amount pending either way';
  if (isDue) {
    balanceLabel = `₹${party.balance.toLocaleString('en-IN')} Due`;
    balanceColor = '#dc2626';
    balanceSub = kind === 'in' ? 'Amount still to be received' : 'Amount still to be paid';
  } else if (isCredit) {
    balanceLabel = `₹${Math.abs(party.balance).toLocaleString('en-IN')} Advance Credit`;
    balanceColor = '#7c3aed';
    balanceSub = kind === 'in'
      ? 'Paid more than invoiced — adjust against their upcoming order(s)'
      : 'Paid more than invoiced — adjust against your next order from them';
  }

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
      background: '#fff', border: `1.5px solid ${accent}33`, borderRadius: 12,
      padding: '12px 16px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
        <Users size={16} color={accent} /> {name}
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginLeft: 4 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Invoices</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{party.invoice_count}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Total Invoiced</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', fontFamily: "'DM Mono', monospace" }}>₹{party.total_invoiced.toLocaleString('en-IN')}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Total Paid</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', fontFamily: "'DM Mono', monospace" }}>₹{party.total_paid.toLocaleString('en-IN')}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 3 }}>
            {isCredit ? <TrendingUp size={11} /> : isDue ? <TrendingDown size={11} /> : null} Balance
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: balanceColor, fontFamily: "'DM Mono', monospace" }}>{balanceLabel}</div>
        </div>
      </div>
      <div style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b', maxWidth: 320 }}>{balanceSub}</div>
    </div>
  );
}

// ─── Terms display helper ──────────────────────────────────────────────────
function termsLabel(row: { payment_terms_label?: string | null; payment_terms_days: number }) {
  if (row.payment_terms_label && row.payment_terms_label.trim()) return row.payment_terms_label;
  return `${row.payment_terms_days}d`;
}

// ─── Export dropdown ─────────────────────────────────────────────────────────
interface ExportColumn { key: string; label: string }

function ExportMenu({
  getRows, getColumns, filename, accent,
}: {
  getRows: () => Record<string, any>[];
  getColumns: () => ExportColumn[];
  filename: string;
  accent: string;
}) {
  const [open, setOpen] = useState(false);

  const toCsvValue = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const downloadBlob = (content: BlobPart, mime: string, ext: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const cols = getColumns();
    const rows = getRows();
    if (rows.length === 0) return;
    const header = cols.map(c => toCsvValue(c.label)).join(',');
    const body = rows.map(r => cols.map(c => toCsvValue(r[c.key])).join(',')).join('\n');
    downloadBlob(`${header}\n${body}`, 'text/csv;charset=utf-8;', 'csv');
    setOpen(false);
  };

  const buildHtmlTable = () => {
    const cols = getColumns();
    const rows = getRows();
    const head = cols.map(c => `<th style="background:#f1f5f9;border:1px solid #cbd5e1;padding:6px 10px;text-align:left;">${c.label}</th>`).join('');
    const body = rows.map(r => `<tr>${cols.map(c => `<td style="border:1px solid #e2e8f0;padding:6px 10px;">${r[c.key] ?? ''}</td>`).join('')}</tr>`).join('');
    return `<table style="border-collapse:collapse;font-family:sans-serif;font-size:12px;width:100%;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  };

  const exportExcel = () => {
    if (getRows().length === 0) return;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body>${buildHtmlTable()}</body></html>`;
    downloadBlob(html, 'application/vnd.ms-excel', 'xls');
    setOpen(false);
  };

  const exportPrint = () => {
    if (getRows().length === 0) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>${filename}</title><style>body{font-family:sans-serif;padding:16px;}h1{font-size:16px;}</style></head><body><h1>${filename.replace(/-/g, ' ')}</h1>${buildHtmlTable()}<script>window.onload=function(){window.print();}<\/script></body></html>`);
    win.document.close();
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${accent}`, background: '#fff', color: accent, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}
      >
        <Download size={14} /> Export <ChevronDown size={13} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 11, minWidth: 170, overflow: 'hidden' }}>
            <button onClick={exportCsv} style={exportItemStyle}><FileText size={13} /> Export CSV</button>
            <button onClick={exportExcel} style={exportItemStyle}><FileSpreadsheet size={13} /> Export Excel</button>
            <button onClick={exportPrint} style={exportItemStyle}><Printer size={13} /> Print</button>
          </div>
        </>
      )}
    </div>
  );
}

const exportItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px',
  border: 'none', background: '#fff', textAlign: 'left', fontSize: 12.5, fontWeight: 600,
  color: '#374151', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
};

// ─── Payment Modal (Record new payment against an invoice) ────────────────

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  kind: 'in' | 'out';
  invoice: (SalesInvoiceRowExt | PurchaseInvoiceRowExt) | null;
  pushToast: (type: ToastType, title: string, message?: string) => void;
}

function PaymentModal({ open, onClose, onSaved, kind, invoice, pushToast }: PaymentModalProps) {
  const [amount, setAmount]           = useState('');
  const [tdsAmount, setTdsAmount]     = useState('0');
  const [paymentType, setPaymentType] = useState<PaymentType>('Part Payment');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode]               = useState('Bank Transfer');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes]             = useState('');
  const [saving, setSaving]           = useState(false);
  const [history, setHistory]         = useState<PaymentEntryExt[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!open || !invoice) return;
    setAmount(String(invoice.balance > 0 ? invoice.balance : ''));
    setTdsAmount('0');
    setPaymentType(invoice.balance > 0 && invoice.balance === invoice.invoice_amount ? 'Full Payment' : 'Part Payment');
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setMode('Bank Transfer');
    setReferenceNo('');
    setNotes('');
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id]);

  const loadHistory = async () => {
    if (!invoice) return;
    setLoadingHistory(true);
    try {
      const rows = kind === 'in'
        ? await fetchSalesInvoicePayments(invoice.id)
        : await fetchPurchaseInvoicePayments(invoice.id);
      setHistory(rows as PaymentEntryExt[]);
    } catch {
      pushToast('error', 'History Load Failed', 'Could not fetch previous payments.');
    }
    setLoadingHistory(false);
  };

  if (!open || !invoice) return null;

  const docLabel = kind === 'in' ? 'invoice' : 'purchase invoice';
  const amtNum = Number(amount) || 0;
  const tdsNum = Number(tdsAmount) || 0;
  const totalSettling = amtNum + tdsNum;

  const handleSave = async () => {
    if (totalSettling <= 0) { pushToast('error', 'Invalid Amount', 'Enter an amount or TDS amount greater than 0.'); return; }
    if (totalSettling > invoice.balance + 0.001) {
      pushToast('warning', 'Amount Exceeds This Invoice', `Balance due on this invoice is ₹${invoice.balance.toLocaleString('en-IN')}. Recording anyway will overpay this ${docLabel} — the extra will show up as Advance Credit for this party overall.`);
    }
    setSaving(true);
    try {
      if (kind === 'in') {
        await recordPaymentIn({
          sales_invoice_id: invoice.id, amount: amtNum, tds_amount: tdsNum, payment_type: paymentType,
          payment_date: paymentDate, mode, reference_no: referenceNo, notes,
        } as any);
      } else {
        await recordPaymentOut({
          purchase_invoice_id: invoice.id, amount: amtNum, tds_amount: tdsNum, payment_type: paymentType,
          payment_date: paymentDate, mode, reference_no: referenceNo, notes,
        } as any);
      }
      pushToast('success', 'Payment Recorded', `${kind === 'in' ? 'Payment In' : 'Payment Out'} of ₹${totalSettling.toLocaleString('en-IN')} saved for ${invoice.invoice_no}.`);
      onSaved();
      onClose();
    } catch (e: any) {
      pushToast('error', 'Save Failed', e?.message ?? 'Could not record payment.');
    }
    setSaving(false);
  };

  const accent = kind === 'in' ? '#16a34a' : '#dc2626';
  const label  = kind === 'in' ? 'Payment In' : 'Payment Out';
  const party  = kind === 'in'
    ? (invoice as SalesInvoiceRowExt).customer_name
    : (invoice as PurchaseInvoiceRowExt).supplier_name;

  return (
    <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={{ ...S.modalHeader, background: accent }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>
              {kind === 'in' ? <ArrowDownToLine size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> : <ArrowUpFromLine size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />}
              Record {label}
            </h2>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>{invoice.invoice_no} · {party}</span>
          </div>
          <button onClick={onClose} style={S.closeBtn}><X size={20} color="#fff" /></button>
        </div>

        <div style={S.modalBody}>
          <div style={S.invoiceSummaryBar}>
            <div style={S.invoiceSummaryItem}>
              <span style={S.invoiceSummaryLabel}>Invoice Amount</span>
              <span style={S.invoiceSummaryVal}>₹{invoice.invoice_amount.toLocaleString('en-IN')}</span>
            </div>
            <div style={S.invoiceSummaryItem}>
              <span style={S.invoiceSummaryLabel}>Already Paid</span>
              <span style={{ ...S.invoiceSummaryVal, color: '#16a34a' }}>₹{invoice.paid_amount.toLocaleString('en-IN')}</span>
            </div>
            <div style={S.invoiceSummaryItem}>
              <span style={S.invoiceSummaryLabel}>Balance Due</span>
              <span style={{ ...S.invoiceSummaryVal, color: invoice.balance > 0 ? '#dc2626' : '#16a34a' }}>₹{invoice.balance.toLocaleString('en-IN')}</span>
            </div>
            <div style={S.invoiceSummaryItem}>
              <span style={S.invoiceSummaryLabel}>Terms / Due</span>
              <span style={S.invoiceSummaryVal}>{termsLabel(invoice)} · {invoice.due_date}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
            <div>
              <label style={S.label}>Payment Type</label>
              <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} style={S.input}>
                {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Payment Date</label>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} style={S.input} />
            </div>
            <div>
              <label style={S.label}>Amount (Cash / Bank)</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} style={S.input} placeholder="0.00" />
            </div>
            <div>
              <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 4 }}>
                <PiggyBank size={11} /> TDS Amount (deducted at source)
              </label>
              <input type="number" min="0" step="0.01" value={tdsAmount} onChange={(e) => setTdsAmount(e.target.value)} style={S.input} placeholder="0.00" />
            </div>
            <div>
              <label style={S.label}>Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)} style={S.input}>
                <option>Bank Transfer</option>
                <option>Cheque</option>
                <option>Cash</option>
                <option>UPI</option>
                <option>Card</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Reference No.</label>
              <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} style={S.input} placeholder="UTR / Cheque no. (optional)" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...S.input, height: 56, resize: 'vertical' }} placeholder="Optional notes…" />
            </div>
          </div>

          {tdsNum > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }}>
              This will settle <strong>₹{totalSettling.toLocaleString('en-IN')}</strong> against the invoice
              (₹{amtNum.toLocaleString('en-IN')} cash/bank + ₹{tdsNum.toLocaleString('en-IN')} TDS credited).
            </div>
          )}

          {/* Payment history (per-invoice, quick view) */}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
              <History size={13} /> Payment History
            </div>
            {loadingHistory ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#94a3b8' }} />
              </div>
            ) : history.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '10px 0' }}>No payments recorded yet.</div>
            ) : (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                {history.map((h, i) => (
                  <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', fontSize: 12, background: i % 2 ? '#f8fafc' : '#fff', borderBottom: i < history.length - 1 ? '1px solid #f1f5f9' : 'none', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: '#374151', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {h.payment_date} · {h.mode}{h.reference_no ? ` · ${h.reference_no}` : ''}
                      <PaymentTypeChip type={h.payment_type} />
                    </span>
                    <span style={{ fontWeight: 700, color: accent, fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap' }}>
                      ₹{Number(h.amount).toLocaleString('en-IN')}
                      {Number(h.tds_amount) > 0 && (
                        <span style={{ color: '#7c3aed', fontWeight: 600 }}> +₹{Number(h.tds_amount).toLocaleString('en-IN')} TDS</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={S.modalFooter}>
          <button style={S.btnCancel} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btnSave, background: accent, boxShadow: `0 2px 6px ${accent}55` }} onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><Banknote size={15} /> Save Payment</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Payment Modal (edit an existing Payment History entry) ──────────

interface EditPaymentModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  kind: 'in' | 'out';
  payment: PaymentHistoryRow | null;
  pushToast: (type: ToastType, title: string, message?: string) => void;
}

function EditPaymentModal({ open, onClose, onSaved, kind, payment, pushToast }: EditPaymentModalProps) {
  const [amount, setAmount]           = useState('');
  const [tdsAmount, setTdsAmount]     = useState('0');
  const [paymentType, setPaymentType] = useState<PaymentType>('Part Payment');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode]               = useState('Bank Transfer');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes]             = useState('');
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    if (!open || !payment) return;
    setAmount(String(payment.amount ?? ''));
    setTdsAmount(String(payment.tds_amount ?? 0));
    setPaymentType(payment.payment_type ?? 'Part Payment');
    setPaymentDate((payment.payment_date || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
    setMode(payment.mode || 'Bank Transfer');
    setReferenceNo(payment.reference_no || '');
    setNotes(payment.notes || '');
  }, [open, payment?.id]);

  if (!open || !payment) return null;

  const amtNum = Number(amount) || 0;
  const tdsNum = Number(tdsAmount) || 0;
  const totalSettling = amtNum + tdsNum;

  const handleSave = async () => {
    if (totalSettling <= 0) { pushToast('error', 'Invalid Amount', 'Enter an amount or TDS amount greater than 0.'); return; }
    if (!paymentDate) { pushToast('error', 'Missing Date', 'Payment date is required.'); return; }

    setSaving(true);
    try {
      const fields: EditablePaymentFields = {
        amount: amtNum, tds_amount: tdsNum, payment_type: paymentType,
        payment_date: paymentDate, mode, reference_no: referenceNo, notes,
      };
      if (kind === 'in') {
        await updatePaymentIn(payment.id, fields);
      } else {
        await updatePaymentOut(payment.id, fields);
      }
      pushToast('success', 'Payment Updated', `Entry for ${payment.invoice_no} saved.`);
      onSaved();
      onClose();
    } catch (e: any) {
      pushToast('error', 'Update Failed', e?.message ?? 'Could not update this payment.');
    }
    setSaving(false);
  };

  const accent = kind === 'in' ? '#16a34a' : '#dc2626';
  const label  = kind === 'in' ? 'Payment In' : 'Payment Out';

  return (
    <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...S.modal, maxWidth: 500 }}>
        <div style={{ ...S.modalHeader, background: accent }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>
              <Pencil size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Edit {label}
            </h2>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>{payment.invoice_no} · {payment.party_name ?? '—'}</span>
          </div>
          <button onClick={onClose} style={S.closeBtn}><X size={20} color="#fff" /></button>
        </div>

        <div style={S.modalBody}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={S.label}>Payment Type</label>
              <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} style={S.input}>
                {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Payment Date</label>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} style={S.input} />
            </div>
            <div>
              <label style={S.label}>Amount (Cash / Bank)</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} style={S.input} placeholder="0.00" />
            </div>
            <div>
              <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 4 }}>
                <PiggyBank size={11} /> TDS Amount
              </label>
              <input type="number" min="0" step="0.01" value={tdsAmount} onChange={(e) => setTdsAmount(e.target.value)} style={S.input} placeholder="0.00" />
            </div>
            <div>
              <label style={S.label}>Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)} style={S.input}>
                <option>Bank Transfer</option>
                <option>Cheque</option>
                <option>Cash</option>
                <option>UPI</option>
                <option>Card</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Reference No.</label>
              <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} style={S.input} placeholder="UTR / Cheque no. (optional)" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...S.input, height: 56, resize: 'vertical' }} placeholder="Optional notes…" />
            </div>
          </div>

          {tdsNum > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }}>
              This entry will settle <strong>₹{totalSettling.toLocaleString('en-IN')}</strong>
              (₹{amtNum.toLocaleString('en-IN')} cash/bank + ₹{tdsNum.toLocaleString('en-IN')} TDS credited).
            </div>
          )}
        </div>

        <div style={S.modalFooter}>
          <button style={S.btnCancel} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btnSave, background: accent, boxShadow: `0 2px 6px ${accent}55` }} onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><Pencil size={14} /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

type Tab = 'in' | 'out';
type ViewMode = 'invoices' | 'history';

const INVOICE_COLUMNS_IN: ExportColumn[] = [
  { key: 'invoice_no', label: 'Invoice No' },
  { key: 'invoice_date', label: 'Date' },
  { key: 'customer_name', label: 'Customer' },
  { key: 'invoice_amount', label: 'Invoice Value' },
  { key: 'payment_terms_days', label: 'Terms (days)' },
  { key: 'due_date', label: 'Due Date' },
  { key: 'paid_amount', label: 'Paid' },
  { key: 'balance', label: 'Balance' },
  { key: 'status', label: 'Status' },
];

const INVOICE_COLUMNS_OUT: ExportColumn[] = [
  { key: 'invoice_no', label: 'Invoice No' },
  { key: 'invoice_date', label: 'Date' },
  { key: 'supplier_name', label: 'Supplier' },
  { key: 'invoice_amount', label: 'Invoice Value' },
  { key: 'payment_terms_days', label: 'Terms (days)' },
  { key: 'due_date', label: 'Due Date' },
  { key: 'paid_amount', label: 'Paid' },
  { key: 'balance', label: 'Balance' },
  { key: 'status', label: 'Status' },
];

function historyColumns(tab: Tab): ExportColumn[] {
  return [
    { key: 'invoice_no', label: tab === 'in' ? 'Invoice No' : 'Purchase Invoice No' },
    { key: 'party_name', label: tab === 'in' ? 'Customer' : 'Supplier' },
    { key: 'payment_date', label: 'Date' },
    { key: 'payment_type', label: 'Type' },
    { key: 'amount', label: 'Amount' },
    { key: 'tds_amount', label: 'TDS' },
    { key: 'mode', label: 'Mode' },
    { key: 'reference_no', label: 'Reference' },
    { key: 'notes', label: 'Notes' },
  ];
}

export default function AccountDetailsMaster() {
  const [tab, setTab]             = useState<Tab>('in');
  const [viewMode, setViewMode]   = useState<ViewMode>('invoices');
  const [salesRows, setSalesRows] = useState<SalesInvoiceRowExt[]>([]);
  const [purchaseRows, setPurchaseRows] = useState<PurchaseInvoiceRowExt[]>([]);
  const [historyRows, setHistoryRows] = useState<PaymentHistoryRow[]>([]);
  const [summary, setSummary]     = useState<ScopedAccountSummary | null>(null);
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(10);

  // NEW: customer/supplier dropdown filter
  const [partyOptions, setPartyOptions] = useState<PartySummary[]>([]);
  const [selectedParty, setSelectedParty] = useState('');

  const [modalOpen, setModalOpen]     = useState(false);
  const [modalInvoice, setModalInvoice] = useState<SalesInvoiceRowExt | PurchaseInvoiceRowExt | null>(null);

  // edit-payment modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<PaymentHistoryRow | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { toasts, push: pushToast, remove: removeToast } = useToast();

  const extractErrorMessage = (e: any): string => {
    return (
      e?.response?.data?.message ||
      e?.response?.data?.error ||
      e?.message ||
      'Unknown error (check server terminal for details).'
    );
  };

  const loadSummary = async () => {
    try {
      const params = tab === 'in'
        ? { customer: selectedParty || undefined }
        : { supplier: selectedParty || undefined };
      setSummary(await fetchScopedSummary(params));
    } catch (e: any) {
      pushToast('error', 'Summary Load Failed', extractErrorMessage(e));
    }
  };

  // NEW: load the customer/supplier dropdown list whenever the tab changes
  const loadPartyOptions = async () => {
    try {
      const list = tab === 'in' ? await fetchCustomerList() : await fetchSupplierList();
      setPartyOptions(list);
    } catch (e: any) {
      pushToast('error', 'Party List Load Failed', extractErrorMessage(e));
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (viewMode === 'history') {
        const res = tab === 'in'
          ? await fetchPaymentInHistory({ search, customer: selectedParty, page, limit: pageSize })
          : await fetchPaymentOutHistory({ search, supplier: selectedParty, page, limit: pageSize });
        setHistoryRows(res.data);
        setTotal(res.total);
      } else if (tab === 'in') {
        const res = await fetchSalesInvoicesScoped({ search, status: filterStatus, customer: selectedParty, page, limit: pageSize });
        setSalesRows(res.data); setTotal(res.total);
      } else {
        const res = await fetchPurchaseInvoicesScoped({ search, status: filterStatus, supplier: selectedParty, page, limit: pageSize });
        setPurchaseRows(res.data); setTotal(res.total);
      }
    } catch (e: any) {
      const what = viewMode === 'history'
        ? `${tab === 'in' ? 'Payment In' : 'Payment Out'} History`
        : `${tab === 'in' ? 'Sales' : 'Purchase'} Invoices`;
      pushToast('error', `${what} Load Failed`, extractErrorMessage(e));
    }
    setLoading(false);
  };

  useEffect(() => { loadPartyOptions(); setSelectedParty(''); }, [tab]);
  useEffect(() => { loadSummary(); }, [tab, selectedParty]);
  useEffect(() => { loadData(); }, [tab, viewMode, search, filterStatus, selectedParty, page, pageSize]);
  useEffect(() => { setPage(1); }, [tab, viewMode, search, filterStatus, selectedParty]);

  const openPayment = (row: SalesInvoiceRowExt | PurchaseInvoiceRowExt) => {
    setModalInvoice(row);
    setModalOpen(true);
  };

  const handleSaved = () => { loadData(); loadSummary(); loadPartyOptions(); };

  const openEditPayment = (row: PaymentHistoryRow) => {
    setEditingPayment(row);
    setEditModalOpen(true);
  };

  const handleDeletePayment = async (row: PaymentHistoryRow) => {
    const confirmed = window.confirm(
      `Delete this ${tab === 'in' ? 'Payment In' : 'Payment Out'} entry of ₹${Number(row.amount).toLocaleString('en-IN')} for ${row.invoice_no}? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(row.id);
    try {
      if (tab === 'in') {
        await deletePaymentInEntry(row.id);
      } else {
        await deletePaymentOutEntry(row.id);
      }
      pushToast('success', 'Payment Deleted', `Entry for ${row.invoice_no} removed.`);
      loadData();
      loadSummary();
      loadPartyOptions();
    } catch (e: any) {
      pushToast('error', 'Delete Failed', e?.message ?? 'Could not delete this payment.');
    }
    setDeletingId(null);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const goTo = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  const invoiceRows = tab === 'in' ? salesRows : purchaseRows;
  const accent = tab === 'in' ? '#16a34a' : '#dc2626';

  const currentColumns: ExportColumn[] = viewMode === 'history'
    ? historyColumns(tab)
    : (tab === 'in' ? INVOICE_COLUMNS_IN : INVOICE_COLUMNS_OUT);
  const currentExportRows: Record<string, any>[] = viewMode === 'history' ? historyRows : invoiceRows;
  const exportFilename = `${tab === 'in' ? 'payment-in' : 'payment-out'}-${viewMode === 'history' ? 'history' : 'invoices'}${selectedParty ? `-${selectedParty.replace(/\s+/g, '_')}` : ''}`;

  const colCount = currentColumns.length + 2 + (viewMode === 'invoices' ? 1 : 0);

  // NEW: the selected party's full summary object (for the strip below the toolbar)
  const activePartySummary = selectedParty
    ? partyOptions.find(p => p.name === selectedParty) ?? null
    : null;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes toastIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .ad-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }
        .ad-tabs { display:flex; gap:6px; margin-bottom:16px; flex-wrap:wrap; }
        .ad-tab { display:flex; align-items:center; gap:7px; padding:10px 18px; border-radius:10px; border:1.5px solid #e2e8f0; background:#fff; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; color:#64748b; transition:all 0.15s; }
        .ad-tab.active-in  { background:#f0fdf4; border-color:#86efac; color:#166534; }
        .ad-tab.active-out { background:#fef2f2; border-color:#fca5a5; color:#991b1b; }
        .ad-viewtoggle { display:flex; border:1.5px solid #e2e8f0; border-radius:9px; overflow:hidden; flex-shrink:0; }
        .ad-viewtoggle button { padding:8px 13px; font-size:12px; font-weight:700; border:none; cursor:pointer; font-family:'DM Sans',sans-serif; background:#fff; color:#64748b; display:flex; align-items:center; gap:5px; }
        .ad-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .ad-search-wrap { position:relative; flex:1; min-width:180px; max-width:320px; }
        .ad-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .ad-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; outline:none; }
        .ad-search:focus { border-color:${accent}; }
        .ad-filter-sel { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#374151; cursor:pointer; outline:none; max-width:220px; }
        .ad-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; }
        .ad-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; }
        .ad-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); }
        .ad-table-wrap { overflow-x:auto; scrollbar-width:thin; scrollbar-color:${accent} #f1f5f9; }
        .ad-table-wrap::-webkit-scrollbar { height: 8px; }
        .ad-table-wrap::-webkit-scrollbar-track { background: #f1f5f9; }
        .ad-table-wrap::-webkit-scrollbar-thumb { background: ${accent}; border-radius: 8px; }
        .ad-table { width:100%; border-collapse:collapse; font-size:13px; font-family:'DM Sans',sans-serif; min-width:960px; }
        .ad-table thead tr { background:${accent}; }
        .ad-table th { padding:11px 12px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:12px; }
        .ad-table th.th-r { text-align:right; }
        .ad-table th.th-c { text-align:center; }
        .ad-table tbody tr:nth-child(odd)  td { background:#fff; }
        .ad-table tbody tr:nth-child(even) td { background:#f8fafc; }
        .ad-table tbody tr:hover td { filter:brightness(0.97); }
        .ad-table td { padding:10px 12px; color:#374151; font-size:12px; white-space:nowrap; }
        .ad-table td.td-r { text-align:right; }
        .ad-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }
        .ad-pay-btn { display:inline-flex; align-items:center; gap:5px; border:none; padding:6px 12px; border-radius:7px; font-size:11px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; color:#fff; }
        .ad-icon-btn { display:inline-flex; align-items:center; justify-content:center; gap:4px; border:1px solid #e2e8f0; background:#fff; padding:6px 9px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:700; font-family:'DM Sans',sans-serif; }
        .ad-icon-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .ad-row-actions { display:flex; gap:6px; justify-content:center; }
        .ad-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; }
        .ad-pag-btns { display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
        .ad-pag-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; }
        .ad-pag-btn.active { background:${accent}; color:#fff; border-color:${accent}; font-weight:700; }
        .ad-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }
      `}</style>

      <div className="ad-wrap">

        {/* PAGE HEADER */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Account Details</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>
            Track payments received against Sales Invoices and payments made against Purchase Invoices.
          </p>
        </div>

        {/* SUMMARY CARDS (scoped to the selected customer/supplier if one is picked) */}
        {summary && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <SummaryCard label="Receivable Balance" value={`₹${summary.receivable_balance.toLocaleString('en-IN')}`} sub={`${summary.sales_invoice_count} sales invoices`} color="#16a34a" icon={<ArrowDownToLine size={18} />} />
            <SummaryCard label="Payable Balance"    value={`₹${summary.payable_balance.toLocaleString('en-IN')}`}    sub={`${summary.purchase_invoice_count} purchase invoices`} color="#dc2626" icon={<ArrowUpFromLine size={18} />} />
            <SummaryCard label="Total Payment In"   value={`₹${summary.payment_in_total.toLocaleString('en-IN')}`}   color="#0369a1" icon={<Wallet size={18} />} />
            <SummaryCard label="Total Payment Out"  value={`₹${summary.payment_out_total.toLocaleString('en-IN')}`} color="#7c3aed" icon={<Receipt size={18} />} />
          </div>
        )}

        {/* TABS */}
        <div className="ad-tabs">
          <button className={`ad-tab${tab === 'in' ? ' active-in' : ''}`} onClick={() => setTab('in')}>
            <ArrowDownToLine size={15} /> Payment In (Sales Invoices)
          </button>
          <button className={`ad-tab${tab === 'out' ? ' active-out' : ''}`} onClick={() => setTab('out')}>
            <ArrowUpFromLine size={15} /> Payment Out (Purchase Invoices)
          </button>
        </div>

        {/* TOOLBAR */}
        <div className="ad-toolbar">
          <div className="ad-viewtoggle">
            <button
              onClick={() => setViewMode('invoices')}
              style={{ background: viewMode === 'invoices' ? accent : '#fff', color: viewMode === 'invoices' ? '#fff' : '#64748b' }}
            >
              <Receipt size={12} /> Invoices
            </button>
            <button
              onClick={() => setViewMode('history')}
              style={{ background: viewMode === 'history' ? accent : '#fff', color: viewMode === 'history' ? '#fff' : '#64748b' }}
            >
              <History size={12} /> Payment History
            </button>
          </div>

          <div className="ad-search-wrap">
            <Search size={14} />
            <input
              className="ad-search"
              placeholder={
                viewMode === 'history'
                  ? 'Search invoice no, reference, mode, party…'
                  : (tab === 'in' ? 'Search invoice no, customer…' : 'Search invoice no, supplier…')
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* NEW: customer / supplier dropdown filter */}
          <select
            className="ad-filter-sel"
            value={selectedParty}
            onChange={(e) => setSelectedParty(e.target.value)}
            title={tab === 'in' ? 'Filter by customer' : 'Filter by supplier'}
          >
            <option value=''>{tab === 'in' ? 'All Customers' : 'All Suppliers'}</option>
            {partyOptions.map(p => (
              <option key={p.name} value={p.name}>{p.name} ({p.invoice_count})</option>
            ))}
          </select>

          {viewMode === 'invoices' && (
            <select className="ad-filter-sel" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value=''>All Status</option>
              <option value='Paid'>Paid</option>
              <option value='Partially Paid'>Partially Paid</option>
              <option value='Pending'>Pending</option>
              <option value='Overdue'>Overdue</option>
            </select>
          )}

          <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{total} record(s)</span>

          <ExportMenu
            getRows={() => currentExportRows}
            getColumns={() => currentColumns}
            filename={exportFilename}
            accent={accent}
          />

          <div className="ad-page-size">
            <span>Show</span>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {[5, 10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>entries</span>
          </div>
        </div>

        {/* NEW: party summary strip (shown only when a customer/supplier is selected) */}
        {activePartySummary && (
          <PartySummaryStrip kind={tab} party={activePartySummary} name={activePartySummary.name} />
        )}

        {/* TABLE */}
        <div className="ad-card">
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                {viewMode === 'history' ? (
                  <tr>
                    <th>#</th>
                    <th>{tab === 'in' ? 'Invoice No' : 'Purchase Invoice No'}</th>
                    <th>{tab === 'in' ? 'Customer' : 'Supplier'}</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th className="th-r">Amount</th>
                    <th className="th-r">TDS</th>
                    <th className="th-r">Total</th>
                    <th>Mode</th>
                    <th>Reference</th>
                    <th>Notes</th>
                    <th className="th-c">Action</th>
                  </tr>
                ) : tab === 'in' ? (
                  <tr>
                    <th>#</th>
                    <th>Invoice No</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th className="th-r">Invoice Value</th>
                    <th>Terms</th>
                    <th>Due Date</th>
                    <th>Invoice ETA</th>
                    <th className="th-r">Paid</th>
                    <th className="th-r">Balance</th>
                    <th>Status</th>
                    <th className="th-c">Action</th>
                  </tr>
                ) : (
                  <tr>
                    <th>#</th>
                    <th>Invoice No</th>
                    <th>Date</th>
                    <th>Supplier</th>
                    <th className="th-r">Invoice Value</th>
                    <th>Terms</th>
                    <th>Due Date</th>
                    <th>Invoice ETA</th>
                    <th className="th-r">Paid</th>
                    <th className="th-r">Balance</th>
                    <th>Status</th>
                    <th className="th-c">Action</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={colCount} className="ad-empty"><Loader2 size={22} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} /></td></tr>
                ) : viewMode === 'history' ? (
                  historyRows.length === 0 ? (
                    <tr><td colSpan={colCount} className="ad-empty">
                      {search || selectedParty ? 'No payments match your filters.' : `No ${tab === 'in' ? 'Payment In' : 'Payment Out'} history yet.`}
                    </td></tr>
                  ) : historyRows.map((h, i) => (
                    <tr key={h.id}>
                      <td style={{ color: '#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: accent }}>{h.invoice_no}</td>
                      <td>{h.party_name ?? '—'}</td>
                      <td>{h.payment_date}</td>
                      <td><PaymentTypeChip type={h.payment_type} /></td>
                      <td className="td-r" style={{ fontFamily: "'DM Mono',monospace" }}>₹{Number(h.amount).toLocaleString('en-IN')}</td>
                      <td className="td-r" style={{ fontFamily: "'DM Mono',monospace", color: Number(h.tds_amount) > 0 ? '#7c3aed' : '#94a3b8' }}>
                        {Number(h.tds_amount) > 0 ? `₹${Number(h.tds_amount).toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="td-r" style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: accent }}>
                        ₹{(Number(h.amount) + Number(h.tds_amount)).toLocaleString('en-IN')}
                      </td>
                      <td>{h.mode}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace" }}>{h.reference_no ?? '—'}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.notes ?? '—'}</td>
                      <td className="th-c">
                        <div className="ad-row-actions">
                          <button
                            className="ad-icon-btn"
                            style={{ color: '#0369a1', borderColor: '#93c5fd' }}
                            onClick={() => openEditPayment(h)}
                            title="Edit this payment"
                          >
                            <Pencil size={12} /> Edit
                          </button>
                          <button
                            className="ad-icon-btn"
                            style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                            onClick={() => handleDeletePayment(h)}
                            disabled={deletingId === h.id}
                            title="Delete this payment"
                          >
                            {deletingId === h.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : invoiceRows.length === 0 ? (
                  <tr><td colSpan={colCount} className="ad-empty">
                    {search || filterStatus || selectedParty ? 'No records match your filters.' : `No ${tab === 'in' ? 'sales invoices' : 'purchase invoices'} found.`}
                  </td></tr>
                ) : tab === 'in' ? (
                  (invoiceRows as SalesInvoiceRowExt[]).map((r, i) => (
                    <tr key={r.id}>
                      <td style={{ color: '#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: accent }}>{r.invoice_no}</td>
                      <td>{r.invoice_date}</td>
                      <td>{r.customer_name}</td>
                      <td className="td-r" style={{ fontFamily: "'DM Mono',monospace" }}>₹{Number(r.invoice_amount).toLocaleString('en-IN')}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b' }}>
                          <CalendarClock size={11} /> {termsLabel(r)}
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: r.status === 'Overdue' ? '#dc2626' : '#64748b' }}>
                          <Clock size={11} /> {r.due_date}
                        </span>
                      </td>
                      <td><InvoiceEtaBadge row={r} /></td>
                      <td className="td-r" style={{ fontFamily: "'DM Mono',monospace", color: '#16a34a' }}>
                        ₹{Number(r.paid_amount).toLocaleString('en-IN')}
                        {Number(r.tds_paid_amount) > 0 && (
                          <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>incl. ₹{Number(r.tds_paid_amount).toLocaleString('en-IN')} TDS</div>
                        )}
                      </td>
                      <td className="td-r" style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: r.balance > 0 ? '#dc2626' : '#16a34a' }}>₹{Number(r.balance).toLocaleString('en-IN')}</td>
                      <td><StatusChip status={r.status} /></td>
                      <td className="th-c" style={{ textAlign: 'center' }}>
                        <button
                          className="ad-pay-btn"
                          style={{ background: accent }}
                          onClick={() => openPayment(r)}
                          disabled={r.balance <= 0}
                          title={r.balance <= 0 ? 'Already fully paid' : 'Record Payment In'}
                        >
                          <ArrowDownToLine size={12} />
                          {r.balance <= 0 ? 'Paid' : 'Pay'}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  (invoiceRows as PurchaseInvoiceRowExt[]).map((r, i) => (
                    <tr key={r.id}>
                      <td style={{ color: '#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: accent }}>{r.invoice_no}</td>
                      <td>{r.invoice_date}</td>
                      <td>{r.supplier_name}</td>
                      <td className="td-r" style={{ fontFamily: "'DM Mono',monospace" }}>₹{Number(r.invoice_amount).toLocaleString('en-IN')}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b' }}>
                          <CalendarClock size={11} /> {termsLabel(r)}
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: r.status === 'Overdue' ? '#dc2626' : '#64748b' }}>
                          <Clock size={11} /> {r.due_date}
                        </span>
                      </td>
                      <td><InvoiceEtaBadge row={r} /></td>
                      <td className="td-r" style={{ fontFamily: "'DM Mono',monospace", color: '#16a34a' }}>
                        ₹{Number(r.paid_amount).toLocaleString('en-IN')}
                        {Number(r.tds_paid_amount) > 0 && (
                          <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>incl. ₹{Number(r.tds_paid_amount).toLocaleString('en-IN')} TDS</div>
                        )}
                      </td>
                      <td className="td-r" style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: r.balance > 0 ? '#dc2626' : '#16a34a' }}>₹{Number(r.balance).toLocaleString('en-IN')}</td>
                      <td><StatusChip status={r.status} /></td>
                      <td className="th-c" style={{ textAlign: 'center' }}>
                        <button
                          className="ad-pay-btn"
                          style={{ background: accent }}
                          onClick={() => openPayment(r)}
                          disabled={r.balance <= 0}
                          title={r.balance <= 0 ? 'Already fully paid' : 'Record Payment Out'}
                        >
                          <ArrowUpFromLine size={12} />
                          {r.balance <= 0 ? 'Paid' : 'Pay'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && total > 0 && (
            <div className="ad-pagination">
              <span>Page {page} of {totalPages}</span>
              <div className="ad-pag-btns">
                <button className="ad-pag-btn" onClick={() => goTo(1)} disabled={page === 1}>«</button>
                <button className="ad-pag-btn" onClick={() => goTo(page - 1)} disabled={page === 1}>‹</button>
                <button className="ad-pag-btn" onClick={() => goTo(page + 1)} disabled={page === totalPages}>›</button>
                <button className="ad-pag-btn" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <PaymentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        kind={tab}
        invoice={modalInvoice}
        pushToast={pushToast}
      />

      <EditPaymentModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSaved={handleSaved}
        kind={tab}
        payment={editingPayment}
        pushToast={pushToast}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 3000, overflowY: 'auto', padding: '24px 16px' },
  modal: { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, boxShadow: '0 8px 40px rgba(0,0,0,0.22)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 48px)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 18px', borderRadius: '14px 14px 0 0' },
  closeBtn: { background: 'none', border: 'none', padding: '0 4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.85 },
  modalBody: { padding: '16px 18px', overflowY: 'auto', flex: 1 },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: '0 0 14px 14px' },
  invoiceSummaryBar: { display: 'flex', flexWrap: 'wrap', gap: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' },
  invoiceSummaryItem: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 110, flex: '1 1 auto' },
  invoiceSummaryLabel: { fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  invoiceSummaryVal: { fontSize: 13, fontWeight: 700, color: '#1e293b', fontFamily: "'DM Mono', monospace" },
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, color: '#1e293b', outline: 'none', boxSizing: 'border-box', background: '#fff' },
  btnCancel: { padding: '9px 16px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#475569', fontFamily: "'DM Sans', sans-serif" },
  btnSave: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', border: 'none', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
};