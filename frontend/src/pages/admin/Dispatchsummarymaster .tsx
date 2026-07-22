// frontend/src/pages/admin/DispatchSummaryMaster.tsx
//
// Dispatch Summary — logistics tracking for outbound shipments. Unlike
// Sales Report / Purchase Report (derived, read-only ledgers), this page
// owns its own data: Record / Edit / Delete a dispatch, same interaction
// pattern as Account Details' Payment modal, wrapped in the same
// summary-cards + table + chart + export skeleton as the two report pages
// so the whole admin suite feels consistent.
//
// Columns: Dispatch Date · Dispatch No · Invoice No · Customer · Ship To ·
//          Product Type · Qty · Transporter / Vehicle·LR · Status ·
//          Expected/Actual Delivery (→ Delay badge) · Action
//
// Charts: a status-breakdown donut (Pending/Dispatched/In Transit/
// Delivered/Returned) plus a monthly dispatch-count trend line — a
// debit/credit bar chart wouldn't mean anything here since there's no
// ledger balance, so this page intentionally uses different chart types
// than Sales/Purchase Report while keeping the same card+chart layout.
//
// Export menu: CSV / Excel / Print / PDF (PDF renders both charts to an
// image via html2canvas and embeds them above the table, same technique
// as Sales/Purchase Report's PDF export).
//
// ─────────────────────────────────────────────────────────────────────────
// DEPENDENCIES — install if not already present:
//   npm install recharts jspdf jspdf-autotable html2canvas
//
// REQUIRES: frontend/src/api/dispatchServices.ts to exist at that path.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Search, X, Loader2, AlertCircle, CheckCircle2, Info, AlertTriangle,
  Download, ChevronDown, FileText, FileSpreadsheet, Printer, FileDown,
  Truck, PackageCheck, PackageX, Clock, Calendar, Plus, Pencil, Trash2,
  PieChart as PieChartIcon, TrendingUp, Phone,
} from 'lucide-react';

import {
  ResponsiveContainer, PieChart, Pie, Cell, Legend as RLegend, Tooltip as RTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

import {
  fetchDispatches, fetchDispatchesAll, fetchDispatchSummary, fetchDispatchStatusBreakdown,
  fetchDispatchTrend, fetchDispatchCustomers, fetchDispatchTransporters, fetchDispatchInvoiceOptions,
  createDispatch, updateDispatch, deleteDispatch,
  type DispatchRow, type DispatchSummary, type DispatchStatusBreakdown, type DispatchTrendPoint,
  type DispatchStatus, type FreightPaidBy, type ProductType, type InvoiceOption, type DispatchFormFields,
} from '../../api/services';

// ─── accent ─────────────────────────────────────────────────────────────
const ACCENT = '#0369a1';
const STATUS_ORDER: DispatchStatus[] = ['Pending', 'Dispatched', 'In Transit', 'Delivered', 'Returned'];
const STATUS_COLORS: Record<DispatchStatus, string> = {
  'Pending': '#94a3b8',
  'Dispatched': '#f59e0b',
  'In Transit': '#0ea5e9',
  'Delivered': '#16a34a',
  'Returned': '#dc2626',
};

// ─── Toast ─────────────────────────────────────────────────────────────
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
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', pointerEvents: 'all', animation: 'dsToastIn 0.25s ease-out', fontFamily: "'DM Sans', sans-serif" }}>
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

// ─── Summary card ─────────────────────────────────────────────────────
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

// ─── Status chip ──────────────────────────────────────────────────────
function StatusChip({ status }: { status: DispatchStatus }) {
  const cfg: Record<DispatchStatus, { bg: string; color: string; border: string }> = {
    'Pending':     { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
    'Dispatched':  { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
    'In Transit':  { bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc' },
    'Delivered':   { bg: '#dcfce7', color: '#166534', border: '#86efac' },
    'Returned':    { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  };
  const c = cfg[status] ?? cfg['Pending'];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>
      {status}
    </span>
  );
}

// ─── Delay badge ──────────────────────────────────────────────────────
function DelayBadge({ delay }: { delay: DispatchRow['delay'] }) {
  if (!delay) return <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>;
  const cfg: Record<string, { bg: string; color: string; border: string; icon?: React.ReactNode }> = {
    early:    { bg: '#dcfce7', color: '#166534', border: '#86efac', icon: <CheckCircle2 size={11} /> },
    ontime:   { bg: '#dcfce7', color: '#166534', border: '#86efac', icon: <CheckCircle2 size={11} /> },
    late:     { bg: '#fef3c7', color: '#92400e', border: '#fde68a', icon: <AlertTriangle size={11} /> },
    ontrack:  { bg: '#dcfce7', color: '#166534', border: '#86efac' },
    overdue:  { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', icon: <AlertTriangle size={11} /> },
    returned: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  };
  const c = cfg[delay.tone] ?? cfg.ontrack;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>
      {c.icon}{delay.label}
    </span>
  );
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// ─── Export dropdown ────────────────────────────────────────────────
interface ExportColumn { key: string; label: string }

function ExportMenu({
  getAllRows, columns, filename, accent, chartRef, summary, filtersLabel,
}: {
  getAllRows: () => Promise<Record<string, any>[]>;
  columns: ExportColumn[];
  filename: string;
  accent: string;
  chartRef: React.RefObject<HTMLDivElement>;
  summary: DispatchSummary | null;
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

  const exportPdf = async () => {
    setBusy('pdf');
    try {
      const rows = await getAllRows();
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 32;

      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text('Dispatch Summary', margin, 40);
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(filtersLabel || 'All customers · All dates', margin, 58);
      doc.text(new Date().toLocaleString('en-IN'), pageWidth - margin, 40, { align: 'right' });

      if (summary) {
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        const line = `Total Dispatches: ${summary.total_dispatches}    In Transit: ${summary.in_transit_count}    Delayed: ${summary.delayed_count}    Delivered This Month: ${summary.delivered_this_month}`;
        doc.text(line, margin, 76);
      }

      let cursorY = 92;

      autoTable(doc, {
        startY: cursorY,
        head: [columns.map(c => c.label)],
        body: rows.map(r => columns.map(c => r[c.key] ?? '')),
        styles: { fontSize: 7.5, cellPadding: 3.5 },
        headStyles: { fillColor: [3, 105, 161], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [240, 249, 255] },
        margin: { left: margin, right: margin },
      });

      // @ts-ignore
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
        } catch { /* PDF still has the table if chart capture fails */ }
      }

      doc.save(`${filename}.pdf`);
    } finally { setBusy(''); setOpen(false); }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${accent}`, background: '#fff', color: accent, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
        <Download size={14} /> Export <ChevronDown size={13} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 11, minWidth: 190, overflow: 'hidden' }}>
            <button onClick={exportCsv} disabled={!!busy} style={exportItemStyle}>{busy === 'csv' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={13} />} Export CSV</button>
            <button onClick={exportExcel} disabled={!!busy} style={exportItemStyle}>{busy === 'excel' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <FileSpreadsheet size={13} />} Export Excel</button>
            <button onClick={exportPrint} disabled={!!busy} style={exportItemStyle}>{busy === 'print' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Printer size={13} />} Print</button>
            <button onClick={exportPdf} disabled={!!busy} style={{ ...exportItemStyle, borderTop: '1px solid #f1f5f9' }}>{busy === 'pdf' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <FileDown size={13} />} Export PDF (with charts)</button>
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

// ─── Record / Edit Dispatch Modal ──────────────────────────────────────
interface DispatchModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: DispatchRow | null;
  pushToast: (type: ToastType, title: string, message?: string) => void;
}

function DispatchModal({ open, onClose, onSaved, editing, pushToast }: DispatchModalProps) {
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceOptions, setInvoiceOptions] = useState<InvoiceOption[]>([]);
  const [saving, setSaving] = useState(false);

  const blank: DispatchFormFields = {
    dispatch_no: '', dispatch_date: new Date().toISOString().slice(0, 10),
    sales_invoice_id: null, invoice_no_snapshot: '', customer_name: '', ship_to: '',
    product_type: 'Fabric', qty_dispatched: 0, qty_unit: 'Meters', no_of_packages: null,
    transporter_name: '', vehicle_no: '', lr_no: '', driver_name: '', driver_phone: '',
    freight_charges: 0, freight_paid_by: 'Consignor',
    status: 'Pending', expected_delivery_date: '', actual_delivery_date: '',
    remarks: '', dispatched_by: '',
  };
  const [form, setForm] = useState<DispatchFormFields>(blank);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        dispatch_no: editing.dispatch_no,
        dispatch_date: editing.dispatch_date || new Date().toISOString().slice(0, 10),
        sales_invoice_id: null,
        invoice_no_snapshot: editing.invoice_no || '',
        customer_name: editing.customer_name,
        ship_to: editing.ship_to || '',
        product_type: editing.product_type,
        qty_dispatched: editing.qty_dispatched,
        qty_unit: editing.qty_unit,
        no_of_packages: editing.no_of_packages,
        transporter_name: editing.transporter_name || '',
        vehicle_no: editing.vehicle_no || '',
        lr_no: editing.lr_no || '',
        driver_name: editing.driver_name || '',
        driver_phone: editing.driver_phone || '',
        freight_charges: editing.freight_charges,
        freight_paid_by: editing.freight_paid_by,
        status: editing.status,
        expected_delivery_date: editing.expected_delivery_date || '',
        actual_delivery_date: editing.actual_delivery_date || '',
        remarks: editing.remarks || '',
        dispatched_by: editing.dispatched_by || '',
      });
    } else {
      setForm(blank);
    }
    setInvoiceSearch('');
    loadInvoiceOptions('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const loadInvoiceOptions = async (q: string) => {
    try { setInvoiceOptions(await fetchDispatchInvoiceOptions(q)); }
    catch { /* non-fatal — picker just stays empty */ }
  };

  if (!open) return null;

  // NOTE: InvoiceOption (api/services.ts) should expose these optional
  // fields from the sales-invoice/shipment record so this picker can
  // auto-fill the dispatch form:
  //   ship_to_address, total_qty, qty_unit, no_of_packages,
  //   transporter_name, vehicle_no, lr_no
  // We read them defensively via `any` so this component still compiles
  // even before that type is widened — any field the backend doesn't
  // send simply falls back to the current form value / is hidden in the list.
  const getExtra = (inv: InvoiceOption) => inv as InvoiceOption & {
    ship_to_address?: string | null;
    total_qty?: number | string | null;
    qty_unit?: string | null;
    no_of_packages?: number | string | null;
    transporter_name?: string | null;
    vehicle_no?: string | null;
    lr_no?: string | null;
  };

  const pickInvoice = (inv: InvoiceOption) => {
    const extra = getExtra(inv);

    setForm(f => ({
      ...f,
      sales_invoice_id: inv.id,
      invoice_no_snapshot: inv.invoice_no,
      // 1. Customer Name
      customer_name: inv.customer_name,
      // 2. Ship To — full address, falling back to bill-to / customer name
      ship_to: extra.ship_to_address || inv.bill_to || inv.customer_name,
      // 3. Quantity Dispatched
      qty_dispatched: extra.total_qty !== null && extra.total_qty !== undefined && extra.total_qty !== ''
        ? Number(extra.total_qty)
        : f.qty_dispatched,
      qty_unit: extra.qty_unit || f.qty_unit,
      // 4. No. of Packages
      no_of_packages: extra.no_of_packages !== null && extra.no_of_packages !== undefined && extra.no_of_packages !== ''
        ? Number(extra.no_of_packages)
        : f.no_of_packages,
      // 5. Transporter Name
      transporter_name: extra.transporter_name || f.transporter_name,
      // 6. Vehicle No.
      vehicle_no: extra.vehicle_no || f.vehicle_no,
      // 7. LR No. / Tracking No.
      lr_no: extra.lr_no || f.lr_no,
    }));

    pushToast('info', 'Invoice Linked', `Auto-filled shipment details from ${inv.invoice_no}. Review before saving.`);
  };

  const set = <K extends keyof DispatchFormFields>(k: K, v: DispatchFormFields[K]) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.customer_name.trim()) { pushToast('error', 'Customer Required', 'Pick an invoice or type a customer name.'); return; }
    if (!form.dispatch_date) { pushToast('error', 'Dispatch Date Required'); return; }

    setSaving(true);
    try {
      if (editing) {
        await updateDispatch(editing.id, form);
        pushToast('success', 'Dispatch Updated', `${editing.dispatch_no} saved.`);
      } else {
        const res = await createDispatch(form);
        pushToast('success', 'Dispatch Recorded', `${res.dispatch_no} created.`);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      pushToast('error', 'Save Failed', e?.message ?? 'Could not save this dispatch.');
    }
    setSaving(false);
  };

  return (
    <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={{ ...S.modalHeader, background: ACCENT }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>
              <Truck size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              {editing ? `Edit Dispatch ${editing.dispatch_no}` : 'Record Dispatch'}
            </h2>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>
              {editing ? editing.customer_name : 'Link an invoice, or type shipment details directly'}
            </span>
          </div>
          <button onClick={onClose} style={S.closeBtn}><X size={20} color="#fff" /></button>
        </div>

        <div style={S.modalBody}>
          {!editing && (
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>Link to Sales Invoice (optional)</label>
              <input
                style={S.input}
                placeholder="Search invoice no or customer…"
                value={invoiceSearch}
                onChange={(e) => { setInvoiceSearch(e.target.value); loadInvoiceOptions(e.target.value); }}
              />
              <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: '#94a3b8' }}>
                Picking an invoice auto-fills Customer, Ship To, Qty, Packages, Transporter, Vehicle No. and LR No. — you can still edit any field.
              </span>
              {invoiceOptions.length > 0 && (
                <div style={{ marginTop: 6, border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 260, overflowY: 'auto' }}>
                  {invoiceOptions.map(inv => {
                    const extra = getExtra(inv);
                    const shipTo = extra.ship_to_address || inv.bill_to;
                    const qtyLabel = extra.total_qty != null && extra.total_qty !== ''
                      ? `${Number(extra.total_qty).toLocaleString('en-IN')} ${extra.qty_unit || ''}`.trim()
                      : null;
                    const vehicleLabel = [extra.transporter_name, extra.vehicle_no].filter(Boolean).join(' · ');
                    const selected = form.sales_invoice_id === inv.id;
                    return (
                      <button
                        key={inv.id}
                        onClick={() => pickInvoice(inv)}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
                          width: '100%', padding: '10px 12px',
                          border: 'none', borderBottom: '1px solid #f1f5f9', background: selected ? '#eff6ff' : '#fff',
                          cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", textAlign: 'left',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 12.5 }}>
                            <strong style={{ color: ACCENT, fontFamily: "'DM Mono',monospace" }}>{inv.invoice_no}</strong>
                            <span style={{ color: '#94a3b8' }}> · </span>
                            <span style={{ color: '#1e293b', fontWeight: 600 }}>{inv.customer_name}</span>
                          </span>
                          {shipTo && (
                            <span style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {shipTo}
                            </span>
                          )}
                          {(qtyLabel || vehicleLabel) && (
                            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>
                              {[qtyLabel, vehicleLabel].filter(Boolean).join('  ·  ')}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                          {inv.invoice_amount != null && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', fontFamily: "'DM Mono',monospace" }}>{inr(inv.invoice_amount)}</span>
                          )}
                          {selected && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: ACCENT }}>
                              <CheckCircle2 size={11} /> Linked
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px 16px' }}>
            <div>
              <label style={S.label}>Dispatch No {!editing && '(auto if left blank)'}</label>
              <input style={S.input} value={form.dispatch_no} onChange={(e) => set('dispatch_no', e.target.value)} placeholder="DC001/26-27" disabled={!!editing} />
            </div>
            <div>
              <label style={S.label}>Dispatch Date</label>
              <input type="date" style={S.input} value={form.dispatch_date} onChange={(e) => set('dispatch_date', e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Customer Name</label>
              <input style={S.input} value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} placeholder="Customer name" />
            </div>
            <div>
              <label style={S.label}>Ship To</label>
              <input style={S.input} value={form.ship_to} onChange={(e) => set('ship_to', e.target.value)} placeholder="Delivery destination" />
            </div>

            <div>
              <label style={S.label}>Product Type</label>
              <select style={S.input} value={form.product_type} onChange={(e) => set('product_type', e.target.value as ProductType)}>
                <option value="Fabric">Fabric</option>
                <option value="Yarn">Yarn</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Status</label>
              <select style={S.input} value={form.status} onChange={(e) => set('status', e.target.value as DispatchStatus)}>
                {STATUS_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label style={S.label}>Quantity Dispatched</label>
              <input type="number" min="0" step="0.01" style={S.input} value={form.qty_dispatched} onChange={(e) => set('qty_dispatched', Number(e.target.value))} />
            </div>
            <div>
              <label style={S.label}>Unit</label>
              <select style={S.input} value={form.qty_unit} onChange={(e) => set('qty_unit', e.target.value)}>
                <option>Meters</option>
                <option>Kg</option>
                <option>Rolls</option>
                <option>Bales</option>
                <option>Pieces</option>
              </select>
            </div>

            <div>
              <label style={S.label}>No. of Packages</label>
              <input type="number" min="0" style={S.input} value={form.no_of_packages ?? ''} onChange={(e) => set('no_of_packages', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div>
              <label style={S.label}>Dispatched By</label>
              <input style={S.input} value={form.dispatched_by} onChange={(e) => set('dispatched_by', e.target.value)} placeholder="Staff name" />
            </div>

            <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #e2e8f0', margin: '4px 0' }} />

            <div>
              <label style={S.label}>Transporter Name</label>
              <input style={S.input} value={form.transporter_name} onChange={(e) => set('transporter_name', e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Vehicle No.</label>
              <input style={S.input} value={form.vehicle_no} onChange={(e) => set('vehicle_no', e.target.value)} />
            </div>
            <div>
              <label style={S.label}>LR No. / Tracking No.</label>
              <input style={S.input} value={form.lr_no} onChange={(e) => set('lr_no', e.target.value)} />
            </div>
            <div>
              <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> Driver Name / Phone</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={S.input} value={form.driver_name} onChange={(e) => set('driver_name', e.target.value)} placeholder="Name" />
                <input style={S.input} value={form.driver_phone} onChange={(e) => set('driver_phone', e.target.value)} placeholder="Phone" />
              </div>
            </div>

            <div>
              <label style={S.label}>Freight Charges</label>
              <input type="number" min="0" step="0.01" style={S.input} value={form.freight_charges} onChange={(e) => set('freight_charges', Number(e.target.value))} />
            </div>
            <div>
              <label style={S.label}>Freight Paid By</label>
              <select style={S.input} value={form.freight_paid_by} onChange={(e) => set('freight_paid_by', e.target.value as FreightPaidBy)}>
                <option>Consignor</option>
                <option>Consignee</option>
                <option>To Pay</option>
              </select>
            </div>

            <div>
              <label style={S.label}>Expected Delivery Date</label>
              <input type="date" style={S.input} value={form.expected_delivery_date ?? ''} onChange={(e) => set('expected_delivery_date', e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Actual Delivery Date</label>
              <input type="date" style={S.input} value={form.actual_delivery_date ?? ''} onChange={(e) => set('actual_delivery_date', e.target.value)} />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Remarks</label>
              <textarea style={{ ...S.input, height: 56, resize: 'vertical' }} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} placeholder="Optional notes…" />
            </div>
          </div>
        </div>

        <div style={S.modalFooter}>
          <button style={S.btnCancel} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btnSave, background: ACCENT, boxShadow: `0 2px 6px ${ACCENT}55` }} onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><Truck size={15} /> {editing ? 'Save Changes' : 'Record Dispatch'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────
const DISPATCH_COLUMNS: ExportColumn[] = [
  { key: 'dispatch_date', label: 'Dispatch Date' },
  { key: 'dispatch_no', label: 'Dispatch No' },
  { key: 'invoice_no', label: 'Invoice No' },
  { key: 'customer_name', label: 'Customer' },
  { key: 'ship_to', label: 'Ship To' },
  { key: 'product_type', label: 'Type' },
  { key: 'qty_dispatched', label: 'Qty' },
  { key: 'qty_unit', label: 'Unit' },
  { key: 'transporter_name', label: 'Transporter' },
  { key: 'vehicle_no', label: 'Vehicle No' },
  { key: 'lr_no', label: 'LR No' },
  { key: 'status', label: 'Status' },
  { key: 'expected_delivery_date', label: 'Expected Delivery' },
  { key: 'actual_delivery_date', label: 'Actual Delivery' },
];

export default function DispatchSummaryMaster() {
  const [rows, setRows]       = useState<DispatchRow[]>([]);
  const [summary, setSummary] = useState<DispatchSummary | null>(null);
  const [breakdown, setBreakdown] = useState<DispatchStatusBreakdown[]>([]);
  const [trend, setTrend]     = useState<DispatchTrendPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);

  const [search, setSearch]           = useState('');
  const [customer, setCustomer]       = useState('');
  const [status, setStatus]           = useState('');
  const [transporter, setTransporter] = useState('');
  const [fromDate, setFromDate]       = useState('');
  const [toDate, setToDate]           = useState('');
  const [customerOptions, setCustomerOptions] = useState<string[]>([]);
  const [transporterOptions, setTransporterOptions] = useState<string[]>([]);

  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<DispatchRow | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const chartRef = useRef<HTMLDivElement>(null);

  const { toasts, push: pushToast, remove: removeToast } = useToast();

  const filters = { search, customer, status, transporter, from: fromDate, to: toDate };

  const loadFilterOptions = async () => {
    try {
      const [c, t] = await Promise.all([fetchDispatchCustomers(), fetchDispatchTransporters()]);
      setCustomerOptions(c); setTransporterOptions(t);
    } catch (e: any) { pushToast('error', 'Filter Options Failed', e?.message); }
  };

  const loadSummary = async () => {
    try { setSummary(await fetchDispatchSummary({ customer, from: fromDate, to: toDate })); }
    catch (e: any) { pushToast('error', 'Summary Load Failed', e?.message); }
  };

  const loadCharts = async () => {
    setChartLoading(true);
    try {
      const [b, t] = await Promise.all([
        fetchDispatchStatusBreakdown({ customer, from: fromDate, to: toDate }),
        fetchDispatchTrend({ customer, from: fromDate, to: toDate }),
      ]);
      setBreakdown(b); setTrend(t);
    } catch (e: any) { pushToast('error', 'Chart Load Failed', e?.message); }
    setChartLoading(false);
  };

  const loadRows = async () => {
    setLoading(true);
    try {
      const res = await fetchDispatches({ ...filters, page, limit: pageSize });
      setRows(res.data); setTotal(res.total);
    } catch (e: any) { pushToast('error', 'Load Failed', e?.message); }
    setLoading(false);
  };

  useEffect(() => { loadFilterOptions(); }, []);
  useEffect(() => { loadSummary(); loadCharts(); }, [customer, fromDate, toDate]);
  useEffect(() => { loadRows(); }, [search, customer, status, transporter, fromDate, toDate, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, customer, status, transporter, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const goTo = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  const filtersLabel = [
    customer ? `Customer: ${customer}` : 'All customers',
    status ? `Status: ${status}` : '',
    transporter ? `Transporter: ${transporter}` : '',
    (fromDate || toDate) ? `${fromDate || '…'} to ${toDate || '…'}` : 'All dates',
    search ? `Search: "${search}"` : '',
  ].filter(Boolean).join(' · ');

  const getAllRowsForExport = async () => (await fetchDispatchesAll(filters)).data as any;

  const exportFilename = `dispatch-summary${customer ? `-${customer.replace(/\s+/g, '_')}` : ''}`;

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (row: DispatchRow) => { setEditing(row); setModalOpen(true); };
  const handleSaved = () => { loadRows(); loadSummary(); loadCharts(); loadFilterOptions(); };

  const handleDelete = async (row: DispatchRow) => {
    const confirmed = window.confirm(`Delete dispatch ${row.dispatch_no} for ${row.customer_name}? This cannot be undone.`);
    if (!confirmed) return;
    setDeletingId(row.id);
    try {
      await deleteDispatch(row.id);
      pushToast('success', 'Dispatch Deleted', `${row.dispatch_no} removed.`);
      loadRows(); loadSummary(); loadCharts();
    } catch (e: any) {
      pushToast('error', 'Delete Failed', e?.message ?? 'Could not delete this dispatch.');
    }
    setDeletingId(null);
  };

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes dsToastIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .ds-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }
        .ds-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .ds-search-wrap { position:relative; flex:1; min-width:180px; max-width:280px; }
        .ds-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .ds-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; outline:none; }
        .ds-search:focus { border-color:${ACCENT}; }
        .ds-filter-sel, .ds-date { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#374151; cursor:pointer; outline:none; }
        .ds-filter-sel { max-width:180px; }
        .ds-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; }
        .ds-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; }
        .ds-add-btn { display:flex; align-items:center; gap:6px; padding:8px 14px; border-radius:8px; border:none; background:${ACCENT}; color:#fff; font-weight:700; font-size:13px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .ds-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); }
        .ds-chart-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; padding:16px; box-shadow:0 1px 6px rgba(0,0,0,0.07); }
        .ds-table-wrap { overflow-x:auto; scrollbar-width:thin; scrollbar-color:${ACCENT} #f1f5f9; }
        .ds-table-wrap::-webkit-scrollbar { height: 8px; }
        .ds-table-wrap::-webkit-scrollbar-track { background: #f1f5f9; }
        .ds-table-wrap::-webkit-scrollbar-thumb { background: ${ACCENT}; border-radius: 8px; }
        .ds-table { width:100%; border-collapse:collapse; font-size:13px; font-family:'DM Sans',sans-serif; min-width:1080px; }
        .ds-table thead tr { background:${ACCENT}; }
        .ds-table th { padding:11px 12px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:12px; }
        .ds-table th.th-r { text-align:right; }
        .ds-table th.th-c { text-align:center; }
        .ds-table tbody tr:nth-child(odd)  td { background:#fff; }
        .ds-table tbody tr:nth-child(even) td { background:#f8fafc; }
        .ds-table tbody tr:hover td { filter:brightness(0.97); }
        .ds-table td { padding:10px 12px; color:#374151; font-size:12px; white-space:nowrap; }
        .ds-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }
        .ds-row-actions { display:flex; gap:6px; justify-content:center; }
        .ds-icon-btn { display:inline-flex; align-items:center; justify-content:center; gap:4px; border:1px solid #e2e8f0; background:#fff; padding:6px 9px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:700; font-family:'DM Sans',sans-serif; }
        .ds-icon-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .ds-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; }
        .ds-pag-btns { display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
        .ds-pag-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; }
        .ds-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }
      `}</style>

      <div className="ds-wrap">

        {/* PAGE HEADER */}
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Dispatch Summary</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>
              Logistics tracking for outbound shipments — transporter, vehicle, LR no. and delivery status per dispatch.
            </p>
          </div>
          <button className="ds-add-btn" onClick={openCreate}><Plus size={15} /> Record Dispatch</button>
        </div>

        {/* SUMMARY CARDS */}
        {summary && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <SummaryCard label="Total Dispatches" value={String(summary.total_dispatches)} color={ACCENT} icon={<Truck size={18} />} />
            <SummaryCard label="In Transit"       value={String(summary.in_transit_count)} sub="Needs attention" color="#0ea5e9" icon={<Clock size={18} />} />
            <SummaryCard label="Delayed"          value={String(summary.delayed_count)} sub="Past expected delivery" color="#dc2626" icon={<PackageX size={18} />} />
            <SummaryCard label="Delivered This Month" value={String(summary.delivered_this_month)} color="#16a34a" icon={<PackageCheck size={18} />} />
          </div>
        )}

        {/* TOOLBAR */}
        <div className="ds-toolbar">
          <div className="ds-search-wrap">
            <Search size={14} />
            <input className="ds-search" placeholder="Search DC no, invoice, vehicle, LR…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <select className="ds-filter-sel" value={customer} onChange={(e) => setCustomer(e.target.value)} title="Filter by customer">
            <option value=''>All Customers</option>
            {customerOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select className="ds-filter-sel" value={status} onChange={(e) => setStatus(e.target.value)} title="Filter by status">
            <option value=''>All Status</option>
            {STATUS_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select className="ds-filter-sel" value={transporter} onChange={(e) => setTransporter(e.target.value)} title="Filter by transporter">
            <option value=''>All Transporters</option>
            {transporterOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
            <Calendar size={13} />
            <input type="date" className="ds-date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <span>to</span>
            <input type="date" className="ds-date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </span>

          <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{total} record(s)</span>

          <ExportMenu
            getAllRows={getAllRowsForExport}
            columns={DISPATCH_COLUMNS}
            filename={exportFilename}
            accent={ACCENT}
            chartRef={chartRef}
            summary={summary}
            filtersLabel={filtersLabel}
          />

          <div className="ds-page-size">
            <span>Show</span>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>entries</span>
          </div>
        </div>

        {/* TABLE */}
        <div className="ds-card" style={{ marginBottom: 18 }}>
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Dispatch Date</th>
                  <th>Dispatch No</th>
                  <th>Invoice No</th>
                  <th>Customer</th>
                  <th>Ship To</th>
                  <th>Type</th>
                  <th className="th-r">Qty</th>
                  <th>Transporter / Vehicle · LR</th>
                  <th>Status</th>
                  <th>Delivery</th>
                  <th className="th-c">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={12} className="ds-empty"><Loader2 size={22} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} /></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={12} className="ds-empty">
                    {search || customer || status || transporter || fromDate || toDate ? 'No dispatches match your filters.' : 'No dispatches recorded yet — click "Record Dispatch" to add one.'}
                  </td></tr>
                ) : rows.map((r, i) => (
                  <tr key={r.id}>
                    <td style={{ color: '#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                    <td>{r.dispatch_date}</td>
                    <td style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: ACCENT }}>{r.dispatch_no}</td>
                    <td style={{ fontFamily: "'DM Mono',monospace" }}>{r.invoice_no || '—'}</td>
                    <td>{r.customer_name}</td>
                    <td>{r.ship_to}</td>
                    <td>{r.product_type}</td>
                    <td className="th-r" style={{ textAlign: 'right', fontFamily: "'DM Mono',monospace" }}>{r.qty_dispatched.toLocaleString('en-IN')} {r.qty_unit}</td>
                    <td>
                      <div style={{ fontSize: 12 }}>{r.transporter_name || '—'}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: "'DM Mono',monospace" }}>{[r.vehicle_no, r.lr_no].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                    <td><StatusChip status={r.status} /></td>
                    <td><DelayBadge delay={r.delay} /></td>
                    <td className="th-c">
                      <div className="ds-row-actions">
                        <button className="ds-icon-btn" style={{ color: '#0369a1', borderColor: '#93c5fd' }} onClick={() => openEdit(r)} title="Edit dispatch">
                          <Pencil size={12} /> Edit
                        </button>
                        <button className="ds-icon-btn" style={{ color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => handleDelete(r)} disabled={deletingId === r.id} title="Delete dispatch">
                          {deletingId === r.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && total > 0 && (
            <div className="ds-pagination">
              <span>Page {page} of {totalPages}</span>
              <div className="ds-pag-btns">
                <button className="ds-pag-btn" onClick={() => goTo(1)} disabled={page === 1}>«</button>
                <button className="ds-pag-btn" onClick={() => goTo(page - 1)} disabled={page === 1}>‹</button>
                <button className="ds-pag-btn" onClick={() => goTo(page + 1)} disabled={page === totalPages}>›</button>
                <button className="ds-pag-btn" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* CHARTS — status breakdown donut + monthly trend, side by side
            (stacks on narrow screens). Ref'd as a pair for the PDF export. */}
        <div ref={chartRef} style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(320px, 1.4fr)', gap: 16 }}>
          <div className="ds-chart-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <PieChartIcon size={16} color={ACCENT} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Status Breakdown</span>
            </div>
            {chartLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#94a3b8' }} />
              </div>
            ) : breakdown.every(b => b.count === 0) ? (
              <div className="ds-empty">No data for the selected filters yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={breakdown} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {breakdown.map((b) => <Cell key={b.status} fill={STATUS_COLORS[b.status]} />)}
                  </Pie>
                  <RTooltip formatter={(v: any, n: any) => [`${v} dispatch(es)`, n]} contentStyle={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, borderRadius: 8 }} />
                  <RLegend wrapperStyle={{ fontSize: 11, fontFamily: "'DM Sans',sans-serif" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="ds-chart-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <TrendingUp size={16} color={ACCENT} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Monthly Dispatch Volume</span>
            </div>
            {chartLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#94a3b8' }} />
              </div>
            ) : trend.length === 0 ? (
              <div className="ds-empty">No data for the selected filters yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
                  <Line type="monotone" dataKey="dispatch_count" name="Dispatches" stroke={ACCENT} strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="delivered_count" name="Delivered" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <DispatchModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={handleSaved} editing={editing} pushToast={pushToast} />
    </>
  );
}

// ─── Styles (modal) ───────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 3000, overflowY: 'auto', padding: '24px 16px' },
  modal: { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 920, boxShadow: '0 8px 40px rgba(0,0,0,0.22)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 48px)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 18px', borderRadius: '14px 14px 0 0' },
  closeBtn: { background: 'none', border: 'none', padding: '0 4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.85 },
  modalBody: { padding: '18px 22px', overflowY: 'auto', flex: 1 },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: '0 0 14px 14px' },
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, color: '#1e293b', outline: 'none', boxSizing: 'border-box', background: '#fff' },
  btnCancel: { padding: '9px 16px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#475569', fontFamily: "'DM Sans', sans-serif" },
  btnSave: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', border: 'none', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
};