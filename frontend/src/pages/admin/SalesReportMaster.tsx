// frontend/src/pages/admin/SalesReportMaster.tsx
//
// Sales Report — a customer-statement style ledger built on top of the
// same data the Account Details page uses (Sales Invoices = Debit,
// Payments In = Credit), so the two pages can never disagree.
//
// Columns: Sales Date · Sales Invoice No · Customer Name · Bill To ·
//          Credit · Debit · Balance (running, resets per customer)
//
// Chart: a responsive "3D"-styled bar chart (monthly Debit vs Credit,
// with a cumulative Balance line), now rendered BELOW the table. Recharts
// has no native 3D chart type, so the pseudo-3D look is hand-built: each
// bar is drawn as three flat SVG shapes — a front face (rect, gradient
// fill), a tilted top face (parallelogram, lighter tint) and a tilted
// right face (parallelogram, darker tint) — which together read as an
// isometric box, plus a value label floating above the tilted top, same
// idea as the reference screenshot's glossy quarterly bars.
//
// Export menu still has CSV / Excel / Print / PDF (PDF renders the chart
// to an image via html2canvas and embeds it above the table).
//
// ─────────────────────────────────────────────────────────────────────────
// DEPENDENCIES — install if not already present:
//   npm install recharts jspdf jspdf-autotable html2canvas
//
// REQUIRES: frontend/src/api/salesReportServices.ts to exist at that path
// (adjust the import below if you placed it somewhere else).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Search, X, Loader2, AlertCircle, CheckCircle2, Info, AlertTriangle,
  Download, ChevronDown, FileText, FileSpreadsheet, Printer, FileDown,
  ArrowDownToLine, ArrowUpFromLine, Wallet, Users, Calendar,
  BarChart3,
} from 'lucide-react';

import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

import {
  fetchSalesLedger,
  fetchSalesLedgerAll,
  fetchSalesReportSummary,
  fetchSalesReportTrend,
  fetchSalesReportCustomers,
  type SalesLedgerRow,
  type SalesReportSummary,
  type SalesTrendPoint,
} from '../../api/services';

// ─── accent ─────────────────────────────────────────────────────────────
const ACCENT = '#2563eb';

// ─── Toast (same pattern used elsewhere in the admin) ──────────────────────
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
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', pointerEvents: 'all', animation: 'srToastIn 0.25s ease-out', fontFamily: "'DM Sans', sans-serif" }}>
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

// ─── Summary card ─────────────────────────────────────────────────────────
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

// ─── formatting helpers ─────────────────────────────────────────────────
const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Short "80K" style label used ON the 3D bars, matching the reference
// screenshot's compact value tags (full ₹-formatted amounts still show in
// the tooltip and the table below).
function shortMoney(n: number): string {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 100000) return `${(v / 100000).toFixed(v % 100000 === 0 ? 0 : 1)}L`;
  if (Math.abs(v) >= 1000)   return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`;
  return String(v);
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

// Kept loosely-typed on purpose: Recharts' Tooltip `formatter` /
// `labelFormatter` props are generically typed against ValueType /
// ReactNode (which can be undefined, an array, etc.), so a strictly
// `(n: number) => string` or `(ym: string) => string` signature doesn't
// structurally match and TS rejects the JSX prop. These wrappers do the
// coercion at the call site instead.
const tooltipValueFormatter = (value: any): string => inr(Number(value) || 0);
const tooltipLabelFormatter = (label: any): string => monthLabel(String(label ?? ''));

// ── Pseudo-3D bar shape ─────────────────────────────────────────────────
// Recharts has no 3D chart type, so this builds an isometric-looking box
// out of three flat SVG shapes for every bar Recharts would otherwise
// draw as a single flat <rect>:
//   • front face  — a rounded rect, vertical gradient fill (glossy look)
//   • top face    — a parallelogram tilted up-right, lighter tint
//   • right face  — a parallelogram tilted down-right, darker tint
// `depth` scales with the bar's own width so thin bars don't get an
// oversized bevel.
function barDepth(width: number) {
  return Math.max(4, Math.min(10, width * 0.35));
}

function make3DBarShape(frontFill: string, topFill: string, sideFill: string) {
  return (props: any) => {
    const { x, y, width, height } = props;
    if (!width || !height || height <= 0) return null;
    const depth = barDepth(width);

    const topPoints = [
      `${x},${y}`,
      `${x + depth},${y - depth}`,
      `${x + width + depth},${y - depth}`,
      `${x + width},${y}`,
    ].join(' ');

    const sidePoints = [
      `${x + width},${y}`,
      `${x + width + depth},${y - depth}`,
      `${x + width + depth},${y + height - depth}`,
      `${x + width},${y + height}`,
    ].join(' ');

    return (
      <g>
        <polygon points={sidePoints} fill={sideFill} />
        <polygon points={topPoints} fill={topFill} />
        <rect x={x} y={y} width={width} height={height} fill={frontFill} rx={3} ry={3} />
      </g>
    );
  };
}

// Value label rendered above the tilted top face of each 3D bar.
function render3DBarLabel(props: any) {
  const { x, y, width, value } = props;
  if (value === undefined || value === null || Number(value) === 0) return null;
  const depth = barDepth(width);
  return (
    <text
      x={x + width / 2}
      y={y - depth - 6}
      textAnchor="middle"
      fontSize={11}
      fontWeight={700}
      fill="#1e293b"
      fontFamily="'DM Sans',sans-serif"
    >
      {shortMoney(Number(value))}
    </text>
  );
}

// ─── Export dropdown (CSV / Excel / Print / PDF-with-chart) ───────────────
interface ExportColumn { key: string; label: string }

function ExportMenu({
  getAllRows, columns, filename, accent, chartRef, summary, filtersLabel,
}: {
  getAllRows: () => Promise<Record<string, any>[]>;
  columns: ExportColumn[];
  filename: string;
  accent: string;
  chartRef: React.RefObject<HTMLDivElement>;
  summary: SalesReportSummary | null;
  filtersLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'' | 'csv' | 'excel' | 'print' | 'pdf'>('');

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

  const buildHtmlTable = (rows: Record<string, any>[]) => {
    const head = columns.map(c => `<th style="background:#f1f5f9;border:1px solid #cbd5e1;padding:6px 10px;text-align:left;">${c.label}</th>`).join('');
    const body = rows.map(r => `<tr>${columns.map(c => `<td style="border:1px solid #e2e8f0;padding:6px 10px;">${r[c.key] ?? ''}</td>`).join('')}</tr>`).join('');
    return `<table style="border-collapse:collapse;font-family:sans-serif;font-size:12px;width:100%;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  };

  const exportCsv = async () => {
    setBusy('csv');
    try {
      const rows = await getAllRows();
      if (rows.length === 0) return;
      const header = columns.map(c => toCsvValue(c.label)).join(',');
      const body = rows.map(r => columns.map(c => toCsvValue(r[c.key])).join(',')).join('\n');
      downloadBlob(`${header}\n${body}`, 'text/csv;charset=utf-8;', 'csv');
    } finally { setBusy(''); setOpen(false); }
  };

  const exportExcel = async () => {
    setBusy('excel');
    try {
      const rows = await getAllRows();
      if (rows.length === 0) return;
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body>${buildHtmlTable(rows)}</body></html>`;
      downloadBlob(html, 'application/vnd.ms-excel', 'xls');
    } finally { setBusy(''); setOpen(false); }
  };

  const exportPrint = async () => {
    setBusy('print');
    try {
      const rows = await getAllRows();
      if (rows.length === 0) return;
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(`<html><head><title>${filename}</title><style>body{font-family:sans-serif;padding:16px;}h1{font-size:16px;}</style></head><body><h1>${filename.replace(/-/g, ' ')}</h1><p>${filtersLabel}</p>${buildHtmlTable(rows)}<script>window.onload=function(){window.print();}<\/script></body></html>`);
      win.document.close();
    } finally { setBusy(''); setOpen(false); }
  };

  // PDF export — captures the on-screen chart as an image (via
  // html2canvas), then builds a PDF with a title/summary block, the chart
  // image, and the full data table (via jspdf-autotable).
  const exportPdf = async () => {
    setBusy('pdf');
    try {
      const rows = await getAllRows();
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 32;

      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text('Sales Report', margin, 40);
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(filtersLabel || 'All customers · All dates', margin, 58);
      doc.text(new Date().toLocaleString('en-IN'), pageWidth - margin, 40, { align: 'right' });

      if (summary) {
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        const line = `Total Debit: ${inr(summary.total_debit)}    Total Credit: ${inr(summary.total_credit)}    Net Balance: ${inr(summary.net_balance)}    Invoices: ${summary.invoice_count}    Customers: ${summary.customer_count}`;
        doc.text(line, margin, 76);
      }

      let cursorY = 92;

      // Table first (this export keeps the data as the primary content;
      // the chart image is appended below it so long tables aren't
      // pushed off multiple pages before the reader sees any numbers).
      autoTable(doc, {
        startY: cursorY,
        head: [columns.map(c => c.label)],
        body: rows.map(r => columns.map(c => {
          const v = r[c.key];
          if (c.key === 'credit' || c.key === 'debit' || c.key === 'balance') return inr(Number(v) || 0);
          return v ?? '';
        })),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: margin, right: margin },
      });

      // @ts-ignore — jspdf-autotable augments the doc instance with lastAutoTable at runtime
      cursorY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 24 : cursorY + 24;

      if (chartRef.current) {
        try {
          const canvas = await html2canvas(chartRef.current, { scale: 2, backgroundColor: '#ffffff' });
          const imgData = canvas.toDataURL('image/png');
          const imgWidth = pageWidth - margin * 2;
          const imgHeight = (canvas.height / canvas.width) * imgWidth;

          if (cursorY + imgHeight > doc.internal.pageSize.getHeight() - margin) {
            doc.addPage();
            cursorY = margin;
          }
          doc.addImage(imgData, 'PNG', margin, cursorY, imgWidth, imgHeight);
        } catch {
          // if chart capture fails for any reason, the PDF still has the table
        }
      }

      doc.save(`${filename}.pdf`);
    } finally { setBusy(''); setOpen(false); }
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
          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 11, minWidth: 190, overflow: 'hidden' }}>
            <button onClick={exportCsv} disabled={!!busy} style={exportItemStyle}>{busy === 'csv' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={13} />} Export CSV</button>
            <button onClick={exportExcel} disabled={!!busy} style={exportItemStyle}>{busy === 'excel' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <FileSpreadsheet size={13} />} Export Excel</button>
            <button onClick={exportPrint} disabled={!!busy} style={exportItemStyle}>{busy === 'print' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Printer size={13} />} Print</button>
            <button onClick={exportPdf} disabled={!!busy} style={{ ...exportItemStyle, borderTop: '1px solid #f1f5f9' }}>{busy === 'pdf' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <FileDown size={13} />} Export PDF (with chart)</button>
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

// ─── Main component ─────────────────────────────────────────────────────
const LEDGER_COLUMNS: ExportColumn[] = [
  { key: 'sales_date', label: 'Sales Date' },
  { key: 'invoice_no', label: 'Sales Invoice No' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'bill_to', label: 'Bill To' },
  { key: 'credit', label: 'Credit' },
  { key: 'debit', label: 'Debit' },
  { key: 'balance', label: 'Balance' },
];

// 3D bar shapes for the two series — a mid-tone front face, a lighter top
// bevel and a darker side bevel, matching the reference screenshot's
// glossy-box look. Built once at module scope (they're pure functions of
// color, not of component state).
const debitBarShape  = make3DBarShape('url(#debitFrontGradient)', '#fca5a5', '#7f1d1d');
const creditBarShape = make3DBarShape('url(#creditFrontGradient)', '#86efac', '#14532d');

export default function SalesReportMaster() {
  const [rows, setRows]         = useState<SalesLedgerRow[]>([]);
  const [summary, setSummary]   = useState<SalesReportSummary | null>(null);
  const [trend, setTrend]       = useState<SalesTrendPoint[]>([]);
  const [loading, setLoading]   = useState(false);
  const [chartLoading, setChartLoading] = useState(false);

  const [search, setSearch]     = useState('');
  const [customer, setCustomer] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate]     = useState('');
  const [customerOptions, setCustomerOptions] = useState<string[]>([]);

  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const chartRef = useRef<HTMLDivElement>(null);

  const { toasts, push: pushToast, remove: removeToast } = useToast();

  const filters = { search, customer, from: fromDate, to: toDate };

  const loadCustomers = async () => {
    try { setCustomerOptions(await fetchSalesReportCustomers()); }
    catch (e: any) { pushToast('error', 'Customer List Failed', e?.message); }
  };

  const loadSummary = async () => {
    try { setSummary(await fetchSalesReportSummary(filters)); }
    catch (e: any) { pushToast('error', 'Summary Load Failed', e?.message); }
  };

  const loadTrend = async () => {
    setChartLoading(true);
    try { setTrend(await fetchSalesReportTrend({ customer, from: fromDate, to: toDate })); }
    catch (e: any) { pushToast('error', 'Chart Load Failed', e?.message); }
    setChartLoading(false);
  };

  const loadLedger = async () => {
    setLoading(true);
    try {
      const res = await fetchSalesLedger({ ...filters, page, limit: pageSize });
      setRows(res.data); setTotal(res.total);
    } catch (e: any) {
      pushToast('error', 'Load Failed', e?.message);
    }
    setLoading(false);
  };

  useEffect(() => { loadCustomers(); }, []);
  useEffect(() => { loadSummary(); loadTrend(); }, [customer, fromDate, toDate]);
  useEffect(() => { loadLedger(); }, [search, customer, fromDate, toDate, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, customer, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const goTo = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  const filtersLabel = [
    customer ? `Customer: ${customer}` : 'All customers',
    (fromDate || toDate) ? `${fromDate || '…'} to ${toDate || '…'}` : 'All dates',
    search ? `Search: "${search}"` : '',
  ].filter(Boolean).join(' · ');

  const getAllRowsForExport = async () => {
    const res = await fetchSalesLedgerAll(filters);
    return res.data;
  };

  const exportFilename = `sales-report${customer ? `-${customer.replace(/\s+/g, '_')}` : ''}`;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes srToastIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .sr-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }
        .sr-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .sr-search-wrap { position:relative; flex:1; min-width:180px; max-width:300px; }
        .sr-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .sr-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; outline:none; }
        .sr-search:focus { border-color:${ACCENT}; }
        .sr-filter-sel, .sr-date { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#374151; cursor:pointer; outline:none; }
        .sr-filter-sel { max-width:220px; }
        .sr-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; }
        .sr-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; }
        .sr-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); }
        .sr-chart-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; padding:16px; margin-top:18px; box-shadow:0 1px 6px rgba(0,0,0,0.07); }
        .sr-table-wrap { overflow-x:auto; scrollbar-width:thin; scrollbar-color:${ACCENT} #f1f5f9; }
        .sr-table-wrap::-webkit-scrollbar { height: 8px; }
        .sr-table-wrap::-webkit-scrollbar-track { background: #f1f5f9; }
        .sr-table-wrap::-webkit-scrollbar-thumb { background: ${ACCENT}; border-radius: 8px; }
        .sr-table { width:100%; border-collapse:collapse; font-size:13px; font-family:'DM Sans',sans-serif; min-width:820px; }
        .sr-table thead tr { background:${ACCENT}; }
        .sr-table th { padding:11px 12px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:12px; }
        .sr-table th.th-r { text-align:right; }
        .sr-table tbody tr:nth-child(odd)  td { background:#fff; }
        .sr-table tbody tr:nth-child(even) td { background:#f8fafc; }
        .sr-table tbody tr:hover td { filter:brightness(0.97); }
        .sr-table td { padding:10px 12px; color:#374151; font-size:12px; white-space:nowrap; }
        .sr-table td.td-r { text-align:right; }
        .sr-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }
        .sr-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; }
        .sr-pag-btns { display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
        .sr-pag-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; }
        .sr-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }
      `}</style>

      <div className="sr-wrap">

        {/* PAGE HEADER */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Sales Report</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>
            Customer-wise ledger of Sales Invoices (Debit) and Payments Received (Credit), with a running balance.
          </p>
        </div>

        {/* SUMMARY CARDS */}
        {summary && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <SummaryCard label="Total Debit"  value={inr(summary.total_debit)}  sub={`${summary.invoice_count} invoices`} color="#dc2626" icon={<ArrowUpFromLine size={18} />} />
            <SummaryCard label="Total Credit" value={inr(summary.total_credit)} sub="Payments received" color="#16a34a" icon={<ArrowDownToLine size={18} />} />
            <SummaryCard label="Net Balance"  value={inr(summary.net_balance)}  sub="Debit − Credit" color={ACCENT} icon={<Wallet size={18} />} />
            <SummaryCard label="Customers"    value={String(summary.customer_count)} color="#7c3aed" icon={<Users size={18} />} />
          </div>
        )}

        {/* TOOLBAR */}
        <div className="sr-toolbar">
          <div className="sr-search-wrap">
            <Search size={14} />
            <input className="sr-search" placeholder="Search invoice no, customer, bill to…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <select className="sr-filter-sel" value={customer} onChange={(e) => setCustomer(e.target.value)} title="Filter by customer">
            <option value=''>All Customers</option>
            {customerOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
            <Calendar size={13} />
            <input type="date" className="sr-date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <span>to</span>
            <input type="date" className="sr-date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </span>

          <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{total} record(s)</span>

          <ExportMenu
            getAllRows={getAllRowsForExport}
            columns={LEDGER_COLUMNS}
            filename={exportFilename}
            accent={ACCENT}
            chartRef={chartRef}
            summary={summary}
            filtersLabel={filtersLabel}
          />

          <div className="sr-page-size">
            <span>Show</span>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>entries</span>
          </div>
        </div>

        {/* TABLE */}
        <div className="sr-card">
          <div className="sr-table-wrap">
            <table className="sr-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Sales Date</th>
                  <th>Sales Invoice No</th>
                  <th>Customer Name</th>
                  <th>Bill To</th>
                  <th className="th-r">Credit</th>
                  <th className="th-r">Debit</th>
                  <th className="th-r">Balance</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="sr-empty"><Loader2 size={22} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} /></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="sr-empty">
                    {search || customer || fromDate || toDate ? 'No records match your filters.' : 'No sales ledger data yet.'}
                  </td></tr>
                ) : rows.map((r, i) => (
                  <tr key={`${r.invoice_no}-${r.sales_date}-${i}`}>
                    <td style={{ color: '#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                    <td>{r.sales_date}</td>
                    <td style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: ACCENT }}>{r.invoice_no}</td>
                    <td>{r.customer_name}</td>
                    <td>{r.bill_to}</td>
                    <td className="td-r" style={{ fontFamily: "'DM Mono',monospace", color: r.credit > 0 ? '#16a34a' : '#cbd5e1' }}>
                      {r.credit > 0 ? inr(r.credit) : '—'}
                    </td>
                    <td className="td-r" style={{ fontFamily: "'DM Mono',monospace", color: r.debit > 0 ? '#dc2626' : '#cbd5e1' }}>
                      {r.debit > 0 ? inr(r.debit) : '—'}
                    </td>
                    <td className="td-r" style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: r.balance > 0 ? '#dc2626' : r.balance < 0 ? '#7c3aed' : '#16a34a' }}>
                      {inr(r.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && total > 0 && (
            <div className="sr-pagination">
              <span>Page {page} of {totalPages}</span>
              <div className="sr-pag-btns">
                <button className="sr-pag-btn" onClick={() => goTo(1)} disabled={page === 1}>«</button>
                <button className="sr-pag-btn" onClick={() => goTo(page - 1)} disabled={page === 1}>‹</button>
                <button className="sr-pag-btn" onClick={() => goTo(page + 1)} disabled={page === totalPages}>›</button>
                <button className="sr-pag-btn" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* TREND CHART — now BELOW the table. Responsive, pseudo-3D bars
            for monthly Debit vs Credit, with a cumulative Balance line. */}
        <div className="sr-chart-card" ref={chartRef}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <BarChart3 size={16} color={ACCENT} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Monthly Debit vs Credit, with Cumulative Balance</span>
          </div>
          {chartLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#94a3b8' }} />
            </div>
          ) : trend.length === 0 ? (
            <div className="sr-empty">No data for the selected filters yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={trend} margin={{ top: 36, right: 16, left: 0, bottom: 0 }} barGap={6} barCategoryGap="28%">
                <defs>
                  <linearGradient id="debitFrontGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f87171" />
                    <stop offset="100%" stopColor="#b91c1c" />
                  </linearGradient>
                  <linearGradient id="creditFrontGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4ade80" />
                    <stop offset="100%" stopColor="#15803d" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `₹${(Number(v) / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `₹${(Number(v) / 1000).toFixed(0)}k`} />
                <Tooltip formatter={tooltipValueFormatter} labelFormatter={tooltipLabelFormatter} contentStyle={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
                <Bar yAxisId="left" dataKey="debit" name="Debit" fill="#dc2626" shape={debitBarShape} isAnimationActive={false}>
                  <LabelList dataKey="debit" content={render3DBarLabel} />
                </Bar>
                <Bar yAxisId="left" dataKey="credit" name="Credit" fill="#16a34a" shape={creditBarShape} isAnimationActive={false}>
                  <LabelList dataKey="credit" content={render3DBarLabel} />
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="balance" name="Cumulative Balance" stroke={ACCENT} strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  );
}