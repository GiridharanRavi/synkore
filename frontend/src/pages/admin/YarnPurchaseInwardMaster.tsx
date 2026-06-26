// @ts-nocheck
/**
 * YarnPurchaseInwardMaster.jsx
 *
 * Full Yarn Purchase Inward master page:
 *   TAB 1 – Basic Details  (Inward No, Date, PO lookup, autofill supplier/billing/mill/transport)
 *   TAB 2 – Inward Details (Invoice, Count, HSN, Received Kgs, Packing, Pricing, Tax per line)
 *   TAB 3 – Weigh Bridge   (Load/Empty/Net Wt, Difference, Remarks) — auto-disabled for
 *           Inward Types listed in WEIGHBRIDGE_DISABLED_TYPES below
 *   TAB 4 – Inspection     (Status DRAFT/APPROVED, Inspection Yes/No, Approved/Rejected Qty)
 *
 * ADDED: Export CSV, Export Excel, and Print buttons next to "New Inward Entry"
 *
 * API base: /api/yarn-purchase-inward
 */

import React, { Fragment, useEffect, useRef, useState, useCallback } from 'react';
import {
  Plus, Search, X, ChevronDown, ChevronUp, PlusCircle,
  Loader2, AlertCircle, CheckCircle2, Info, AlertTriangle, Scale,
  Download, Printer, FileSpreadsheet, FileText,
} from 'lucide-react';

// ─── Styles object ────────────────────────────────────────────────────────────
const s = {
  label:         { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' },
  input:         { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, color: '#1e293b', outline: 'none', boxSizing: 'border-box', background: '#fff' },
  inputDisabled: { background: '#f1f5f9', color: '#6b7280', cursor: 'not-allowed', border: '1px solid #e2e8f0' },
  computed:      { padding: '8px 12px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#92400e', fontFamily: 'DM Mono,monospace', minHeight: 37, display: 'flex', alignItems: 'center' },
  sectionHead:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', marginTop: 18, userSelect: 'none' },
  sectionTitle:  { fontWeight: 700, fontSize: 13, color: '#1e293b' },
};

// ─── Field type badge ─────────────────────────────────────────────────────────
const FT_CFG = {
  lookup:    { label: 'Lookup',   bg: '#ede9fe', color: '#6d28d9' },
  autofill:  { label: 'Autofill', bg: '#e0f2fe', color: '#0369a1' },
  computed:  { label: 'Computed', bg: '#fef9c3', color: '#92400e' },
  selection: { label: 'Select',   bg: '#f0fdf4', color: '#166534' },
  date:      { label: 'Date',     bg: '#fff7ed', color: '#c2410c' },
  text:      { label: 'Text',     bg: '#f8fafc', color: '#475569' },
  number:    { label: 'Number',   bg: '#fdf4ff', color: '#86198f' },
  multiline: { label: 'Textarea', bg: '#f8fafc', color: '#475569' },
};

function FTypeBadge({ type }) {
  const c = FT_CFG[type];
  if (!c) return null;
  return (
    <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: c.bg, color: c.color, letterSpacing: '0.04em', textTransform: 'uppercase', marginLeft: 5, verticalAlign: 'middle' }}>{c.label}</span>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let _tid = 0;
function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((type, title, message) => {
    const id = ++_tid;
    setToasts(p => [...p, { id, type, title, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4200);
  }, []);
  const remove = useCallback((id) => setToasts(p => p.filter(t => t.id !== id)), []);
  return { toasts, push, remove };
}

function ToastContainer({ toasts, onRemove }) {
  const cfg = {
    success: { bg: '#f0fdf4', border: '#86efac', color: '#166534', icon: <CheckCircle2 size={16} color="#16a34a" /> },
    error:   { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', icon: <AlertCircle  size={16} color="#dc2626" /> },
    warning: { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: <AlertTriangle size={16} color="#d97706" /> },
    info:    { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af', icon: <Info          size={16} color="#2563eb" /> },
  };
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360, pointerEvents: 'none' }}>
      {toasts.map(t => {
        const c = cfg[t.type];
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', pointerEvents: 'all', fontFamily: "'DM Sans',sans-serif" }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: c.color }}>{t.title}</p>
              {t.message && <p style={{ margin: '2px 0 0', fontSize: 12, color: c.color, opacity: 0.8 }}>{t.message}</p>}
            </div>
            <button onClick={() => onRemove(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.color, opacity: 0.6 }}><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Searchable Dropdown ──────────────────────────────────────────────────────
function SearchableDropdown({ value, onChange, options, placeholder = '— Select —', disabled = false, error = false, portalZIndex = 9000 }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);
  const [dropPos, setDropPos] = useState(null);
  const safeValue = value ?? '';
  const selected = options.find(o => o.value === safeValue);
  const filtered = q.trim() ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options;

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        setDropPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width });
      }
    }
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => { if (!disabled) setOpen(v => !v); }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px 8px 12px', border: `1.5px solid ${error ? '#fca5a5' : open ? '#0f766e' : '#cbd5e1'}`, borderRadius: 8, background: disabled ? '#f1f5f9' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, minHeight: 37, boxShadow: open ? '0 0 0 3px rgba(15,118,110,0.1)' : 'none', userSelect: 'none' }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? '#1e293b' : '#9ca3af' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 6 }}>
          {selected && !disabled && (
            <span onClick={e => { e.stopPropagation(); onChange(''); setQ(''); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: '#e2e8f0', cursor: 'pointer' }}>
              <X size={10} color="#64748b" />
            </span>
          )}
          <ChevronDown size={15} color="#94a3b8" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </span>
      </div>
      {open && !disabled && dropPos && (
        <div style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: portalZIndex, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
            <Search size={13} color="#94a3b8" />
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, background: 'transparent', fontFamily: "'DM Sans',sans-serif" }} />
            {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={12} /></button>}
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>No results</div>
            ) : filtered.map(opt => (
              <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); setQ(''); }}
                style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', background: opt.value === safeValue ? '#f0fdfa' : 'transparent', color: opt.value === safeValue ? '#0f766e' : '#374151', fontWeight: opt.value === safeValue ? 600 : 400 }}
                onMouseEnter={e => { if (opt.value !== safeValue) e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={e => { if (opt.value !== safeValue) e.currentTarget.style.background = 'transparent'; }}
              >
                <div>{opt.label}</div>
                {opt.sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{opt.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, required, children, error, type }) {
  return (
    <div>
      <label style={s.label}>
        {label}
        {required && <span style={{ color: '#ef4444' }}> *</span>}
        {type && <FTypeBadge type={type} />}
      </label>
      {children}
      {error && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#dc2626', marginTop: 4 }}><AlertCircle size={11} />{error}</span>}
    </div>
  );
}

function SectionHead({ title, open, onToggle, badge }) {
  return (
    <div style={s.sectionHead} onClick={onToggle}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={s.sectionTitle}>{title}</span>{badge}
      </span>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
const API = '/api/yarn-purchase-inward';
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];
const TAB_LABELS = ['📋 Basic Details', '📦 Inward Details', '⚖️ Weigh Bridge', '🔍 Inspection'];
const TOTAL_TABS = TAB_LABELS.length;

const WEIGHBRIDGE_DISABLED_TYPES = ['Factory Location'];

// ─── Utility ──────────────────────────────────────────────────────────────────
function safeStr(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}
function toDateInput(val) {
  if (!val) return '';
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.includes('T')) return s.slice(0, 10);
  return '';
}

// ─── Export helpers ───────────────────────────────────────────────────────────
const EXPORT_COLUMNS = [
  { key: 'inward_no',           label: 'Inward No' },
  { key: 'inward_date',         label: 'Inward Date' },
  { key: 'po_no',               label: 'PO No' },
  { key: 'supplier_name',       label: 'Supplier' },
  { key: 'inward_type',         label: 'Inward Type' },
  { key: 'net_value',           label: 'Net Value (₹)' },
  { key: 't_value',             label: 'Total Value (₹)' },
  { key: 'inspection_completed',label: 'Inspection' },
  { key: 'inward_status',       label: 'Status' },
];

function exportCSV(data) {
  const header = EXPORT_COLUMNS.map(c => c.label).join(',');
  const rows = data.map(row =>
    EXPORT_COLUMNS.map(c => {
      const val = String(row[c.key] ?? '').replace(/"/g, '""');
      return `"${val}"`;
    }).join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yarn_purchase_inward_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportExcel(data) {
  // Build a simple HTML table that Excel can open
  const cols = EXPORT_COLUMNS;
  const headerRow = cols.map(c => `<th style="background:#0f766e;color:#fff;padding:8px 10px;font-weight:bold;">${c.label}</th>`).join('');
  const bodyRows = data.map((row, i) =>
    `<tr style="background:${i % 2 === 0 ? '#fff' : '#f0fdfa'}">` +
    cols.map(c => `<td style="padding:7px 10px;border:1px solid #e2e8f0;">${row[c.key] ?? ''}</td>`).join('') +
    '</tr>'
  ).join('');

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="UTF-8"/></head>
    <body>
      <table border="1" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;">
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </body>
    </html>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yarn_purchase_inward_${new Date().toISOString().slice(0, 10)}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

function printTable(data) {
  const cols = EXPORT_COLUMNS;
  const headerRow = cols.map(c => `<th>${c.label}</th>`).join('');
  const bodyRows = data.map((row, i) =>
    `<tr class="${i % 2 === 0 ? '' : 'alt'}">` +
    cols.map(c => `<td>${row[c.key] ?? '—'}</td>`).join('') +
    '</tr>'
  ).join('');

  const win = window.open('', '_blank', 'width=1100,height=700');
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Yarn Purchase Inward — Print</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 0; padding: 20px; }
        h2 { font-size: 16px; color: #134e4a; margin-bottom: 4px; }
        p  { font-size: 11px; color: #64748b; margin: 0 0 14px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #0f766e; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
        td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
        tr.alt td { background: #f0fdfa; }
        @media print { body { padding: 10px; } }
      </style>
    </head>
    <body>
      <h2> Yarn Purchase Inward</h2>
      <p>Printed on ${new Date().toLocaleString()} — ${data.length} record(s)</p>
      <table>
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
  `);
  win.document.close();
}

// ─── Export Dropdown Button ───────────────────────────────────────────────────
function ExportMenu({ onCSV, onExcel, onPrint }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="ypi-export-btn"
        title="Export / Print"
      >
        <Download size={14} />
        Export
        <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', marginLeft: 2 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', zIndex: 9100,
          minWidth: 180, overflow: 'hidden',
        }}>
          <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
            Export / Print
          </div>
          {[
            { icon: <FileText size={14} color="#0369a1" />, label: 'Export as CSV', action: () => { onCSV(); setOpen(false); }, color: '#0369a1' },
            { icon: <FileSpreadsheet size={14} color="#166534" />, label: 'Export as Excel', action: () => { onExcel(); setOpen(false); }, color: '#166534' },
            { icon: <Printer size={14} color="#6d28d9" />, label: 'Print Table', action: () => { onPrint(); setOpen(false); }, color: '#6d28d9' },
          ].map(item => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 14px', border: 'none',
                background: 'transparent', cursor: 'pointer',
                fontSize: 13, color: '#374151', fontFamily: "'DM Sans',sans-serif",
                textAlign: 'left', fontWeight: 500,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = item.color; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#374151'; }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Compute single inward item ───────────────────────────────────────────────
function computeItem(it) {
  const kgs   = parseFloat(it.received_kgs)  || 0;
  const rate  = parseFloat(it.rate)           || 0;
  const disc  = parseFloat(it.discount_pct)   || 0;
  const cgst  = parseFloat(it.cgst_pct)       || 0;
  const sgst  = parseFloat(it.sgst_pct)       || 0;
  const igst  = parseFloat(it.igst_pct)       || 0;

  const gross          = kgs * rate;
  const discount_value = (gross * disc / 100).toFixed(4);
  const basic_value    = (gross - parseFloat(discount_value)).toFixed(4);
  const bv             = parseFloat(basic_value);
  const net_value      = (bv + bv * cgst / 100 + bv * sgst / 100 + bv * igst / 100).toFixed(4);

  return { ...it, discount_value, basic_value, net_value };
}

// ─── Compute weigh-bridge ─────────────────────────────────────────────────────
function computeWB(wb, totalReceivedKgs) {
  const load  = parseFloat(wb.load_wt)  || 0;
  const empty = parseFloat(wb.empty_wt) || 0;
  const net_wt     = (load - empty).toFixed(4);
  const yarn_total = parseFloat(totalReceivedKgs) || parseFloat(wb.yarn_inward_total_wt) || 0;
  const difference = (parseFloat(net_wt) - yarn_total).toFixed(4);
  return { ...wb, net_wt, yarn_inward_total_wt: yarn_total.toFixed(4), difference };
}

// ─── Blank constructors ───────────────────────────────────────────────────────
const BLANK_ITEM = () => ({
  _id: `item-${Date.now()}-${Math.random()}`,
  invoice_no: '', invoice_date: '',
  po_item_id: '', yarn_id: '', count_desc: '', hsn_code: '', lot_no: '', po_kgs: '',
  received_kgs: '',
  packing_type: 'Cone', weight_per_package: '', no_of_cones: '', cone_weight: '', unit: 'KGS',
  rate: '', discount_type: '', discount_pct: '', discount_value: '',
  spl_instructions: '',
  cgst_pct: '', sgst_pct: '', igst_pct: '',
  basic_value: '', net_value: '',
});

const BLANK_WB = () => ({
  load_wt_no: '', load_wt: '', empty_wt_no: '', empty_wt: '',
  net_wt: '', yarn_inward_total_wt: '', difference: '',
  remarks: '', no_of_packages: '', yarn_wt: '', total_yarn_wt: '',
});

const BLANK_FORM = () => ({
  inward_date: new Date().toISOString().slice(0, 10),
  po_id: '',
  inward_status: 'DRAFT',
  supplier_id: '', sup_address: '', sup_pin_code: '', sup_district: '', sup_state: '', sup_country: '', sup_gst_no: '',
  billing_supplier_name: '', bill_address: '', bill_pin_code: '', bill_district: '', bill_state: '', bill_country: '', bill_gst_no: '',
  mill_name: '', mill_address: '', mill_pin_code: '', mill_district: '', mill_state: '', mill_country: '', mill_gst_no: '',
  trans_type: '', transport: '', transporter_name: '', vehicle_no: '', transport_ref_no: '',
  freight_charges: '', loading_charges: '', unloading_charges: '', other_transport_charges: '', total_transport_expenses: '',
  inward_type: 'In-house', inward_location_id: '', inward_location_name: '',
  net_value: '', t_cgst_value: '', t_sgst_value: '', t_igst_value: '', t_value: '',
  inspection_completed: 'No', approved_qty: '', rejected_qty: '',
  items: [BLANK_ITEM()],
  weighbridge: BLANK_WB(),
});

// ─── Sanitize loaded data ─────────────────────────────────────────────────────
function sanitizeForm(data) {
  const items = (Array.isArray(data.items) ? data.items : []).map(it => ({
    ...BLANK_ITEM(),
    ...it,
    _id: it._id ?? `item-${it.id ?? Date.now()}-${Math.random()}`,
    invoice_date: toDateInput(it.invoice_date),
  }));
  return {
    ...BLANK_FORM(),
    ...data,
    inward_date: toDateInput(data.inward_date),
    items: items.length ? items : [BLANK_ITEM()],
    weighbridge: data.weighbridge ? { ...BLANK_WB(), ...data.weighbridge } : BLANK_WB(),
  };
}

// ─── Inward Item Card (TAB 2) ─────────────────────────────────────────────────
function InwardItemCard({ item, idx, total, poItemsForPO, onUpdate, onRemove }) {
  const inp = (field) => ({
    value: safeStr(item[field]),
    onChange: (e) => onUpdate(idx, { [field]: e.target.value }),
    style: { ...s.input, width: '100%' },
  });

  return (
    <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, marginBottom: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'linear-gradient(90deg,#f0fdfa,#f0f9ff)', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#0f766e', color: '#fff', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{idx + 1}</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
            {item.count_desc || item.invoice_no || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Line {idx + 1}</span>}
          </span>
          {item.hsn_code && (
            <span style={{ fontSize: 11, fontFamily: 'DM Mono,monospace', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>HSN: {item.hsn_code}</span>
          )}
        </div>
        <button
          onClick={() => onRemove(idx)}
          disabled={total === 1}
          style={{ background: total === 1 ? '#f1f5f9' : '#fff1f2', color: total === 1 ? '#94a3b8' : '#ef4444', border: `1px solid ${total === 1 ? '#e2e8f0' : '#fca5a5'}`, borderRadius: 8, width: 30, height: 30, cursor: total === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={14} />
        </button>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Invoice No" type="text"><input {...inp('invoice_no')} placeholder="Supplier invoice no." /></Field>
          <Field label="Invoice Date" type="date"><input type="date" {...inp('invoice_date')} /></Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12 }}>
          <Field label="Count / Yarn Description" type="autofill">
            {poItemsForPO.length > 0 ? (
              <SearchableDropdown
                value={safeStr(item.po_item_id)}
                onChange={v => onUpdate(idx, { po_item_id: v }, 'yarn')}
                options={poItemsForPO.map(p => ({ value: String(p.po_item_id), label: p.count_desc || p.yarn_code || `PO Line ${p.po_item_id}`, sub: `PO Kgs: ${p.po_kgs}${p.hsn_code ? ` · HSN: ${p.hsn_code}` : ''}` }))}
                placeholder="Select from PO lines…"
                portalZIndex={10000}
              />
            ) : (
              <input value={safeStr(item.count_desc)} onChange={e => onUpdate(idx, { count_desc: e.target.value })} style={{ ...s.input }} placeholder="Auto from PO line" />
            )}
          </Field>
          <Field label="HSN Code" type="autofill">
            <input value={safeStr(item.hsn_code)} disabled style={{ ...s.input, ...s.inputDisabled, fontFamily: 'DM Mono,monospace', fontSize: 12 }} />
          </Field>
          <Field label="Lot No" type="autofill">
            <input value={safeStr(item.lot_no)} onChange={e => onUpdate(idx, { lot_no: e.target.value })} style={{ ...s.input }} placeholder="Editable" />
          </Field>
          <Field label="PO Kgs" type="autofill">
            <input value={safeStr(item.po_kgs)} disabled style={{ ...s.input, ...s.inputDisabled }} />
          </Field>
        </div>

        <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 3, height: 14, background: '#0f766e', borderRadius: 2, display: 'inline-block' }} />
            Received Quantity &amp; Packing
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
            <Field label="Received KGS" required type="number">
              <input type="number" {...inp('received_kgs')} placeholder="0.000" min="0" step="0.001" />
            </Field>
            <Field label="Packing Type" type="autofill">
              <input value={safeStr(item.packing_type)} onChange={e => onUpdate(idx, { packing_type: e.target.value })} style={s.input} placeholder="Cone" />
            </Field>
            <Field label="Wt / Package" type="autofill">
              <input type="number" {...inp('weight_per_package')} placeholder="0.000" step="0.001" />
            </Field>
            <Field label="No. of Cones" type="autofill">
              <input value={safeStr(item.no_of_cones)} disabled style={{ ...s.input, ...s.inputDisabled }} />
            </Field>
            <Field label="Cone Weight" type="autofill">
              <input value={safeStr(item.cone_weight)} disabled style={{ ...s.input, ...s.inputDisabled }} />
            </Field>
            <Field label="Unit" type="autofill">
              <input value={safeStr(item.unit) || 'KGS'} disabled style={{ ...s.input, ...s.inputDisabled }} />
            </Field>
          </div>
        </div>

        <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 3, height: 14, background: '#0f766e', borderRadius: 2, display: 'inline-block' }} />
            Pricing &amp; Tax
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Field label="Rate (₹)" type="autofill">
              <input type="number" {...inp('rate')} placeholder="Autofill from PO" step="0.01" />
            </Field>
            <Field label="Discount Type" type="autofill">
              <input value={safeStr(item.discount_type)} disabled style={{ ...s.input, ...s.inputDisabled }} />
            </Field>
            <Field label="Discount %" type="autofill">
              <input type="number" {...inp('discount_pct')} placeholder="0.00" step="0.01" />
            </Field>
            <Field label="Discount Value" type="computed">
              <div style={s.computed}>₹{safeStr(item.discount_value) || '0.0000'}</div>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16 }}>
            <div>
              <label style={{ ...s.label, marginBottom: 6 }}>Special Instructions <FTypeBadge type="multiline" /></label>
              <textarea
                value={safeStr(item.spl_instructions)}
                onChange={e => onUpdate(idx, { spl_instructions: e.target.value })}
                rows={3}
                placeholder="AT SAME"
                style={{ ...s.input, resize: 'vertical', minHeight: 80, lineHeight: 1.6 }}
              />
            </div>
            <div style={{ minWidth: 320, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px 12px', alignItems: 'center', marginBottom: 10 }}>
                {[
                  { label: 'CGST', field: 'cgst_pct' },
                  { label: 'SGST', field: 'sgst_pct' },
                  { label: 'IGST', field: 'igst_pct' },
                ].map(({ label, field }) => (
                  <React.Fragment key={field}>
                    <label style={{ ...s.label, margin: 0 }}>{label}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="number"
                        value={safeStr(item[field])}
                        onChange={e => onUpdate(idx, { [field]: e.target.value })}
                        style={{ ...s.input, width: 70, textAlign: 'right', padding: '6px 8px' }}
                        placeholder="0"
                        min="0"
                        max="100"
                        step="0.01"
                      />
                      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>%</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textAlign: 'right', fontFamily: 'DM Mono,monospace', minWidth: 72 }}>
                      ₹{((parseFloat(item.basic_value) || 0) * (parseFloat(item[field]) || 0) / 100).toFixed(2)}
                    </span>
                  </React.Fragment>
                ))}
              </div>
              <div style={{ borderTop: '1.5px solid #e2e8f0', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>Net Value</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#0f766e', fontFamily: 'DM Mono,monospace' }}>
                  ₹{safeStr(item.net_value) || '0.0000'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Step Indicator ───────────────────────────────────────────────────────
function TabStepIndicator({ active, total, onGo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {Array.from({ length: total }, (_, i) => (
        <button key={i} onClick={() => onGo(i)} title={TAB_LABELS[i]}
          style={{ width: active === i ? 24 : 8, height: 8, borderRadius: 4, background: active === i ? '#0f766e' : '#99f6e4', border: 'none', cursor: 'pointer', padding: 0, transition: 'width .2s, background .2s' }}
        />
      ))}
      <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>Step {active + 1} of {total}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function YarnPurchaseInwardMaster() {
  const [inwards, setInwards]   = useState([]);
  const [lookup, setLookup]     = useState({ purchaseOrders: [], poItems: [], inwardLocations: [] });
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [filterSt, setFilterSt] = useState('');
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(BLANK_FORM());
  const [editId, setEditId]     = useState(null);
  const [error, setError]       = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [sec, setSec]           = useState({ supplier: true, billing: true, mill: true, transport: true });
  const { toasts, push: pushToast, remove: removeToast } = useToast();

  const loadLookup = async () => {
    try {
      const res  = await fetch(`${API}/meta/lookup`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLookup(data);
    } catch { pushToast('warning', 'Lookup Failed', 'Could not load master data.'); }
  };

  const loadInwards = async () => {
    setLoading(true);
    try {
      const qs  = new URLSearchParams({ search, page: String(page), limit: String(pageSize), ...(filterSt ? { status: filterSt } : {}) });
      const res = await fetch(`${API}?${qs}`);
      const data = await res.json();
      setInwards(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch { pushToast('error', 'Load Failed', 'Could not fetch inwards.'); }
    setLoading(false);
  };

  useEffect(() => { loadLookup(); }, []);
  useEffect(() => { loadInwards(); }, [search, filterSt, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, filterSt]);
  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showForm]);

  const fillFromPO = (poId) => {
    const po = lookup.purchaseOrders.find(p => String(p.id) === poId);
    if (!po) return;
    setForm(f => ({
      ...f,
      po_id:    poId,
      supplier_id:   safeStr(po.supplier_id),
      sup_address:   safeStr(po.address),
      sup_pin_code:  safeStr(po.pin_code),
      sup_district:  safeStr(po.district),
      sup_state:     safeStr(po.state),
      sup_country:   safeStr(po.country),
      sup_gst_no:    safeStr(po.gst_no),
      billing_supplier_name: safeStr(po.billing_supplier_name),
      bill_address:  safeStr(po.bill_address),
      bill_pin_code: safeStr(po.bill_pin_code),
      bill_district: safeStr(po.bill_district),
      bill_state:    safeStr(po.bill_state),
      bill_country:  safeStr(po.bill_country),
      bill_gst_no:   safeStr(po.bill_gst_no),
      mill_name:     safeStr(po.mill_supplier_name),
      mill_address:  safeStr(po.mill_address),
      mill_pin_code: safeStr(po.mill_pin_code),
      mill_district: safeStr(po.mill_district),
      mill_state:    safeStr(po.mill_state),
      mill_country:  safeStr(po.mill_country),
      mill_gst_no:   safeStr(po.mill_gst_no),
    }));
  };

  const poItemsForPO = lookup.poItems.filter(p => String(p.po_id) === safeStr(form.po_id));

  const updateItem = (idx, updates, trigger) => {
    setForm(f => {
      const items  = [...f.items];
      let merged   = { ...items[idx], ...updates };
      if (trigger === 'yarn' && updates.po_item_id) {
        const poLine = poItemsForPO.find(p => String(p.po_item_id) === updates.po_item_id);
        if (poLine) {
          merged = {
            ...merged,
            po_item_id:        safeStr(poLine.po_item_id),
            yarn_id:           safeStr(poLine.yarn_id),
            count_desc:        safeStr(poLine.count_desc || poLine.yarn_code),
            hsn_code:          safeStr(poLine.hsn_code),
            lot_no:            safeStr(poLine.lot_no),
            po_kgs:            safeStr(poLine.po_kgs),
            packing_type:      safeStr(poLine.packing_type),
            weight_per_package:safeStr(poLine.weight_per_package),
            cone_weight:       safeStr(poLine.cone_weight),
            no_of_cones:       safeStr(poLine.no_of_cones),
            rate:              safeStr(poLine.rate),
            discount_type:     safeStr(poLine.discount_type),
            discount_pct:      safeStr(poLine.discount_pct),
            cgst_pct:          safeStr(poLine.cgst_pct),
            sgst_pct:          safeStr(poLine.sgst_pct),
            igst_pct:          safeStr(poLine.igst_pct),
          };
        }
      }
      items[idx] = computeItem(merged);
      return { ...f, items };
    });
  };

  const addItem    = () => setForm(f => ({ ...f, items: [...f.items, BLANK_ITEM()] }));
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const updateWB = (updates) => {
    setForm(f => {
      const totalKgs = f.items.reduce((s, it) => s + (parseFloat(it.received_kgs) || 0), 0);
      const wb = computeWB({ ...f.weighbridge, ...updates }, totalKgs);
      return { ...f, weighbridge: wb };
    });
  };

  const grandNetValue = form.items.reduce((s, it) => s + (parseFloat(it.net_value) || 0), 0);
  const grandBasic    = form.items.reduce((s, it) => s + (parseFloat(it.basic_value) || 0), 0);
  const totalRecvKgs  = form.items.reduce((s, it) => s + (parseFloat(it.received_kgs) || 0), 0);

  const totalTransportExpense =
    (parseFloat(form.freight_charges) || 0) +
    (parseFloat(form.loading_charges) || 0) +
    (parseFloat(form.unloading_charges) || 0) +
    (parseFloat(form.other_transport_charges) || 0);

  const t_cgst = form.items.reduce((s, it) => s + (parseFloat(it.basic_value) || 0) * (parseFloat(it.cgst_pct) || 0) / 100, 0);
  const t_sgst = form.items.reduce((s, it) => s + (parseFloat(it.basic_value) || 0) * (parseFloat(it.sgst_pct) || 0) / 100, 0);
  const t_igst = form.items.reduce((s, it) => s + (parseFloat(it.basic_value) || 0) * (parseFloat(it.igst_pct) || 0) / 100, 0);

  const weighbridgeApplicable = !WEIGHBRIDGE_DISABLED_TYPES.includes(form.inward_type);

  const openCreate = () => {
    setForm(BLANK_FORM());
    setEditId(null); setError(''); setActiveTab(0); setShowForm(true);
  };

  const openEdit = async (id) => {
    try {
      const res  = await fetch(`${API}/${id}`);
      const data = await res.json();
      setForm(sanitizeForm(data));
      setEditId(id); setError(''); setActiveTab(0); setShowForm(true);
    } catch { pushToast('error', 'Load Failed', 'Could not load inward.'); }
  };

  const validateTab = (tabIdx) => {
    if (tabIdx === 0) {
      if (!form.po_id)       return 'PO No is required.';
      if (!form.inward_date) return 'Inward date is required.';
      if (!form.inward_type) return 'Inward type is required.';
    }
    if (tabIdx === 1) {
      if (!form.items.length)                     return 'Add at least one inward line.';
      if (form.items.some(it => !it.received_kgs || parseFloat(it.received_kgs) <= 0))
        return 'All lines need a valid Received KGS.';
    }
    return '';
  };

  const handleNext = () => {
    const err = validateTab(activeTab);
    if (err) { setError(err); return; }
    setError('');
    setActiveTab(t => Math.min(t + 1, TOTAL_TABS - 1));
  };

  const handleSave = async () => {
    for (let i = 0; i < TOTAL_TABS - 1; i++) {
      const err = validateTab(i);
      if (err) { setError(err); setActiveTab(i); return; }
    }
    setError('');
    setSaving(true);
    const payload = {
      ...form,
      net_value:    grandBasic.toFixed(4),
      t_cgst_value: t_cgst.toFixed(4),
      t_sgst_value: t_sgst.toFixed(4),
      t_igst_value: t_igst.toFixed(4),
      t_value:      grandNetValue.toFixed(4),
      total_transport_expenses: totalTransportExpense.toFixed(2),
      weighbridge:  weighbridgeApplicable ? computeWB(form.weighbridge, totalRecvKgs) : null,
    };
    try {
      const res = await fetch(editId ? `${API}/${editId}` : API, {
        method:  editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      const saved = await res.json();
      if (editId) {
        setInwards(p => p.map(o => o.id === editId ? saved : o));
      } else {
        setInwards(p => [saved, ...p].slice(0, pageSize));
        setTotal(p => p + 1);
      }
      pushToast('success', editId ? 'Inward Updated' : 'Inward Created', `${saved.inward_no ?? 'Record'} saved successfully.`);
      setShowForm(false);
    } catch (e) {
      const msg = e.message ?? 'Save failed';
      setError(msg);
      pushToast('error', 'Save Failed', msg);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this inward record?')) return;
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE' });
      setInwards(p => p.filter(o => o.id !== id));
      setTotal(p => Math.max(0, p - 1));
      pushToast('success', 'Inward Deleted');
    } catch { pushToast('error', 'Delete Failed'); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v ?? '' }));
  const toggle = (k) => setSec(p => ({ ...p, [k]: !p[k] }));

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const goTo = (p) => setPage(Math.min(Math.max(1, p), totalPages));

  const poOpts       = lookup.purchaseOrders.map(p => ({ value: String(p.id), label: p.po_no, sub: p.supplier_name }));
  const locationOpts = lookup.inwardLocations.map(l => ({ value: String(l.id), label: l.name, sub: l.type }));
  const isLastTab    = activeTab === TOTAL_TABS - 1;

  const inwardStatusChip = (status) => {
    if (!status) return null;
    const cfg = {
      'DRAFT':    { bg: '#f3f4f6', color: '#374151' },
      'APPROVED': { bg: '#dcfce7', color: '#166534' },
    };
    const c = cfg[status] ?? cfg['DRAFT'];
    return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color }}>{status}</span>;
  };

  const inspChip = (v) => (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: v === 'Yes' ? '#dcfce7' : '#fef3c7', color: v === 'Yes' ? '#166534' : '#92400e' }}>{v === 'Yes' ? '✓ Done' : 'Pending'}</span>
  );

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }

        .ypi-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }
        .ypi-page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
        .ypi-page-header h1 { margin:0; font-size:20px; font-weight:800; color:#134e4a; }
        .ypi-page-header p  { margin:3px 0 0; font-size:13px; color:#64748b; }

        /* ── Header action group ── */
        .ypi-header-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

        /* ── New Inward button ── */
        .ypi-add-btn { display:flex; align-items:center; gap:6px; background:#0f766e; color:#fff; border:none; border-radius:9px; padding:9px 18px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 8px rgba(15,118,110,0.35); white-space:nowrap; }
        .ypi-add-btn:hover { background:#0d9488; }

        /* ── Export dropdown trigger ── */
        .ypi-export-btn { display:flex; align-items:center; gap:6px; background:#fff; color:#374151; border:1.5px solid #cbd5e1; border-radius:9px; padding:8px 14px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; white-space:nowrap; transition:border-color .15s, background .15s; }
        .ypi-export-btn:hover { border-color:#0f766e; color:#0f766e; background:#f0fdfa; }

        /* ── Print standalone button ── */
        .ypi-print-btn { display:flex; align-items:center; gap:6px; background:#fff; color:#6d28d9; border:1.5px solid #ddd6fe; border-radius:9px; padding:8px 14px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; white-space:nowrap; transition:border-color .15s, background .15s; }
        .ypi-print-btn:hover { border-color:#6d28d9; background:#faf5ff; }

        .ypi-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .ypi-search-wrap { position:relative; flex:1; min-width:180px; max-width:320px; }
        .ypi-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); }
        .ypi-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; outline:none; }
        .ypi-search:focus { border-color:#0f766e; }
        .ypi-filter-sel { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; }
        .ypi-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; }
        .ypi-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; cursor:pointer; outline:none; }

        .ypi-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:24px; }
        .ypi-table-wrap { overflow-x:auto; }
        .ypi-table { width:100%; border-collapse:collapse; font-size:13px; min-width:700px; }
        .ypi-table thead tr { background:#0f766e; }
        .ypi-table th { padding:11px 12px; color:#fff; font-weight:700; text-align:left; font-size:12px; white-space:nowrap; }
        .ypi-table tbody tr:nth-child(odd) td { background:#fff; }
        .ypi-table tbody tr:nth-child(even) td { background:#f0fdfa; }
        .ypi-table tbody tr:hover td { filter:brightness(0.97); }
        .ypi-table td { padding:10px 12px; color:#374151; font-size:12px; white-space:nowrap; }
        .ypi-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }
        .ypi-rec-id { font-family:'DM Mono',monospace; font-size:11px; font-weight:600; color:#0f766e; background:#f0fdfa; border:1px solid #99f6e4; border-radius:6px; padding:2px 7px; }

        .ypi-action-group { display:flex; align-items:center; gap:5px; }
        .ypi-btn-edit { display:inline-flex; align-items:center; gap:3px; background:#f0fdfa; color:#0f766e; border:1px solid #99f6e4; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; }
        .ypi-btn-edit:hover { background:#ccfbf1; }
        .ypi-btn-del  { display:inline-flex; align-items:center; gap:3px; background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; }
        .ypi-btn-del:hover { background:#fee2e2; }

        .ypi-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-top:1px solid #f1f5f9; background:#f0fdfa; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; }
        .ypi-pag-btns { display:flex; gap:4px; align-items:center; }
        .ypi-pag-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; }
        .ypi-pag-btn:hover:not(:disabled) { background:#f1f5f9; }
        .ypi-pag-btn.active { background:#0f766e; color:#fff; border-color:#0f766e; font-weight:700; }
        .ypi-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }

        .ypi-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.55); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:16px 8px; }
        .ypi-modal { background:#fff; border-radius:14px; width:100%; max-width:980px; box-shadow:0 8px 40px rgba(0,0,0,0.22); display:flex; flex-direction:column; max-height:calc(100vh - 32px); }
        .ypi-modal-header { display:flex; justify-content:space-between; align-items:center; padding:14px 20px; background:linear-gradient(135deg,#0f766e,#065f46); border-radius:14px 14px 0 0; flex-shrink:0; }
        .ypi-modal-body { padding:0; overflow-y:auto; flex:1; }
        .ypi-modal-footer { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:12px 20px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 14px 14px; }

        .ypi-tabs { display:flex; gap:0; border-bottom:2px solid #e2e8f0; background:#fafbfc; padding:0 20px; flex-shrink:0; overflow-x:auto; }
        .ypi-tab { padding:12px 20px; font-size:13px; font-weight:600; cursor:pointer; border:none; background:none; color:#64748b; border-bottom:3px solid transparent; margin-bottom:-2px; white-space:nowrap; font-family:'DM Sans',sans-serif; transition:color .15s; }
        .ypi-tab.active { color:#0f766e; border-bottom-color:#0f766e; }
        .ypi-tab:hover:not(.active) { color:#475569; }
        .ypi-tab-body { padding:16px 20px; }

        .ypi-grid { display:grid; grid-template-columns:1fr; gap:12px; }
        @media(min-width:480px) { .ypi-grid { grid-template-columns:repeat(2,1fr); gap:14px; } }
        @media(min-width:768px) { .ypi-grid { grid-template-columns:repeat(3,1fr); gap:14px 16px; } }
        .ypi-col-full { grid-column:1 / -1; }

        .ypi-btn-cancel { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; font-family:'DM Sans',sans-serif; }
        .ypi-btn-next   { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#0f766e; color:#fff; border-radius:9px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(15,118,110,.3); }
        .ypi-btn-next:hover { background:#0d9488; }
        .ypi-btn-prev   { display:flex; align-items:center; gap:5px; background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:9px 16px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .ypi-btn-prev:hover { background:#e2e8f0; }
        .ypi-btn-save   { display:flex; align-items:center; gap:6px; padding:9px 24px; border:none; background:#16a34a; color:#fff; border-radius:9px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(22,163,74,.3); }
        .ypi-btn-save:disabled { opacity:.7; cursor:not-allowed; }
        .ypi-btn-save:hover:not(:disabled) { background:#15803d; }

        input:focus, select:focus, textarea:focus { outline:none; border-color:#0f766e !important; box-shadow:0 0 0 3px rgba(15,118,110,0.1) !important; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }

        .ypi-grand-total { display:flex; justify-content:flex-end; gap:20px; align-items:center; padding:12px 4px; border-top:2px solid #e2e8f0; margin-top:4px; flex-wrap:wrap; }
        .ypi-grand-total-item { display:flex; flex-direction:column; align-items:flex-end; gap:2px; }
        .ypi-grand-total-item span  { font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:.04em; }
        .ypi-grand-total-item strong { font-size:15px; font-weight:800; }

        .ypi-add-row-btn { display:flex; align-items:center; gap:5px; background:#f0fdfa; color:#0f766e; border:1px solid #99f6e4; padding:7px 14px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .ypi-add-row-btn:hover { background:#ccfbf1; }

        .ypi-wb-card { background:#f0fdfa; border:1.5px solid #99f6e4; border-radius:12px; padding:16px; }
        .ypi-wb-diff-pos { color:#dc2626; font-weight:800; font-family:'DM Mono',monospace; }
        .ypi-wb-diff-zero { color:#166534; font-weight:800; font-family:'DM Mono',monospace; }

        .ypi-status-toggle { display:flex; gap:10px; }
        .ypi-status-btn { flex:1; padding:14px; border-radius:12px; border:2px solid #e2e8f0; cursor:pointer; font-size:13px; font-weight:700; font-family:'DM Sans',sans-serif; transition:all .2s; }
        .ypi-status-btn.active-draft     { background:#f3f4f6; border-color:#6b7280; color:#374151; }
        .ypi-status-btn.active-approved  { background:#dcfce7; border-color:#16a34a; color:#166534; }
        .ypi-status-btn:not(.active-draft):not(.active-approved):hover { filter:brightness(0.96); }

        .ypi-same-bar { display:flex; align-items:center; gap:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 14px; margin-top:10px; }
        .ypi-toggle { position:relative; width:40px; height:22px; flex-shrink:0; }
        .ypi-toggle input { opacity:0; width:0; height:0; position:absolute; }
        .ypi-toggle-slider { position:absolute; cursor:pointer; inset:0; background:#cbd5e1; border-radius:22px; transition:.3s; }
        .ypi-toggle-slider::before { content:''; position:absolute; width:16px; height:16px; left:3px; top:3px; background:#fff; border-radius:50%; transition:.3s; }
        .ypi-toggle input:checked + .ypi-toggle-slider { background:#0f766e; }
        .ypi-toggle input:checked + .ypi-toggle-slider::before { transform:translateX(18px); }

        /* ── Divider between export and new button ── */
        .ypi-btn-divider { width:1px; height:32px; background:#e2e8f0; }
      `}</style>

      <div className="ypi-wrap">

        {/* PAGE HEADER */}
        <div className="ypi-page-header">
          <div>
            <h1> Yarn Purchase Inward</h1>
            <p>{total} inward record{total !== 1 ? 's' : ''}</p>
          </div>

          {/* ── Action buttons ── */}
          <div className="ypi-header-actions">
            {/* Export dropdown */}
            <ExportMenu
              onCSV={() => {
                if (inwards.length === 0) { pushToast('warning', 'No Data', 'Nothing to export.'); return; }
                exportCSV(inwards);
                pushToast('success', 'CSV Exported', `${inwards.length} record(s) downloaded.`);
              }}
              onExcel={() => {
                if (inwards.length === 0) { pushToast('warning', 'No Data', 'Nothing to export.'); return; }
                exportExcel(inwards);
                pushToast('success', 'Excel Exported', `${inwards.length} record(s) downloaded.`);
              }}
              onPrint={() => {
                if (inwards.length === 0) { pushToast('warning', 'No Data', 'Nothing to print.'); return; }
                printTable(inwards);
              }}
            />

            <div className="ypi-btn-divider" />

            {/* New Inward Entry */}
            <button className="ypi-add-btn" onClick={openCreate}>
              <Plus size={15} /> New Inward Entry
            </button>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="ypi-toolbar">
          <div className="ypi-search-wrap">
            <Search size={14} color="#94a3b8" />
            <input className="ypi-search" placeholder="Search Inward No, PO No, supplier…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="ypi-filter-sel" value={filterSt} onChange={e => setFilterSt(e.target.value)}>
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="APPROVED">Approved</option>
          </select>
          <div className="ypi-page-size">
            <span>Show</span>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>entries</span>
          </div>
        </div>

        {/* TABLE */}
        <div className="ypi-card">
          <div className="ypi-table-wrap">
            <table className="ypi-table">
              <thead>
                <tr>
                  <th>#</th><th>Inward No</th><th>Inward Date</th><th>PO No</th>
                  <th>Supplier</th><th>Inward Type</th>
                  <th>Net Value</th><th>T. Value</th>
                  <th>Inspection</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="ypi-empty">
                    <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
                  </td></tr>
                ) : inwards.length === 0 ? (
                  <tr><td colSpan={11} className="ypi-empty">
                    {search || filterSt ? 'No inwards match your filter.' : 'No inward records yet. Click "New Inward Entry" to create one.'}
                  </td></tr>
                ) : inwards.map((o, i) => (
                  <tr key={o.id}>
                    <td style={{ color: '#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                    <td><span className="ypi-rec-id">{o.inward_no ?? '—'}</span></td>
                    <td>{toDateInput(o.inward_date) || '—'}</td>
                    <td style={{ fontFamily: 'DM Mono,monospace', fontSize: 11, color: '#6d28d9' }}>{o.po_no ?? '—'}</td>
                    <td style={{ fontWeight: 600 }}>{o.supplier_name ?? '—'}</td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, background: o.inward_type === 'In-house' ? '#ede9fe' : '#fef3c7', color: o.inward_type === 'In-house' ? '#6d28d9' : '#92400e', padding: '2px 8px', borderRadius: 20 }}>{o.inward_type ?? '—'}</span></td>
                    <td style={{ fontFamily: 'DM Mono,monospace', fontSize: 11, color: '#0f766e', fontWeight: 700 }}>₹{parseFloat(o.net_value || 0).toFixed(2)}</td>
                    <td style={{ fontFamily: 'DM Mono,monospace', fontSize: 11, color: '#166534', fontWeight: 700 }}>₹{parseFloat(o.t_value || 0).toFixed(2)}</td>
                    <td>{inspChip(o.inspection_completed)}</td>
                    <td>{inwardStatusChip(o.inward_status)}</td>
                    <td>
                      <div className="ypi-action-group">
                        <button className="ypi-btn-edit" onClick={() => openEdit(o.id)}>✏️ Edit</button>
                        <button className="ypi-btn-del"  onClick={() => handleDelete(o.id)}>🗑 Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && total > 0 && (
            <div className="ypi-pagination">
              <span>Page {page} of {totalPages} — {total} record(s)</span>
              <div className="ypi-pag-btns">
                <button className="ypi-pag-btn" onClick={() => goTo(1)} disabled={page === 1}>«</button>
                <button className="ypi-pag-btn" onClick={() => goTo(page - 1)} disabled={page === 1}>‹</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, k) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  return start + k;
                }).filter(p => p >= 1 && p <= totalPages).map(p => (
                  <button key={p} className={`ypi-pag-btn${p === page ? ' active' : ''}`} onClick={() => goTo(p)}>{p}</button>
                ))}
                <button className="ypi-pag-btn" onClick={() => goTo(page + 1)} disabled={page === totalPages}>›</button>
                <button className="ypi-pag-btn" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* ════════════════════════ MODAL ════════════════════════ */}
        {showForm && (
          <div className="ypi-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="ypi-modal">

              <div className="ypi-modal-header">
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff' }}>
                    {editId ? '✏️ Edit Inward Entry' : '➕ New Yarn Purchase Inward'}
                  </h2>
                  {editId && form.inward_no && (
                    <span style={{ fontSize: 11, color: '#99f6e4', fontFamily: 'DM Mono,monospace' }}>{form.inward_no}</span>
                  )}
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowForm(false)}>
                  <X size={22} color="#fff" />
                </button>
              </div>

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', padding: '10px 20px', fontSize: 13 }}>
                  <AlertCircle size={15} />{error}
                  <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><X size={14} /></button>
                </div>
              )}

              <div className="ypi-tabs">
                {TAB_LABELS.map((tab, i) => (
                  <button key={i} className={`ypi-tab${activeTab === i ? ' active' : ''}`} onClick={() => setActiveTab(i)}>
                    {tab}
                    {i === 2 && !weighbridgeApplicable && (
                      <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: '#fee2e2', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        N/A
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="ypi-modal-body">

                {/* ═══ TAB 1: BASIC DETAILS ═══ */}
                {activeTab === 0 && (
                  <div className="ypi-tab-body">
                    <div className="ypi-grid" style={{ marginBottom: 4 }}>
                      <Field label="Inward No" type="text">
                        <input value={form.inward_no ?? 'Auto-generated'} disabled style={{ ...s.input, ...s.inputDisabled }} />
                      </Field>
                      <Field label="Inward Date" required type="date">
                        <input type="date" value={toDateInput(form.inward_date)} onChange={e => set('inward_date', e.target.value)} style={s.input} />
                      </Field>
                      <Field label="PO No" required type="lookup">
                        <SearchableDropdown
                          value={safeStr(form.po_id)}
                          onChange={v => fillFromPO(v)}
                          options={poOpts}
                          placeholder="Select Purchase Order…"
                          portalZIndex={9500}
                        />
                      </Field>
                    </div>

                    <div className="ypi-grid" style={{ marginBottom: 4, marginTop: 10 }}>
                      <Field label="Inward Type" required type="selection">
                        <select value={form.inward_type} onChange={e => set('inward_type', e.target.value)} style={s.input}>
                          <option>In-house</option>
                          <option>Factory Location</option>
                        </select>
                      </Field>
                      <Field label="Inward Location" type="lookup">
                        <SearchableDropdown
                          value={safeStr(form.inward_location_id)}
                          onChange={v => {
                            const loc = lookup.inwardLocations.find(l => String(l.id) === v);
                            setForm(f => ({ ...f, inward_location_id: v, inward_location_name: loc?.name ?? '' }));
                          }}
                          options={locationOpts}
                          placeholder="Select location…"
                          portalZIndex={9500}
                        />
                      </Field>
                    </div>

                    {!weighbridgeApplicable && (
                      <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#991b1b', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Scale size={13} />
                        Weigh Bridge tab is disabled for Inward Type <strong>"{form.inward_type}"</strong>.
                      </div>
                    )}

                    <SectionHead title="Supplier Details" open={sec.supplier} onToggle={() => toggle('supplier')} />
                    {sec.supplier && form.po_id && (
                      <div className="ypi-grid" style={{ marginTop: 12 }}>
                        <Field label="Supplier" type="autofill"><input value={safeStr(lookup.purchaseOrders.find(p => String(p.id) === form.po_id)?.supplier_name)} disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        <Field label="Address"  type="autofill"><input value={safeStr(form.sup_address)}  disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        <Field label="Pin Code" type="autofill"><input value={safeStr(form.sup_pin_code)} disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        <Field label="District" type="autofill"><input value={safeStr(form.sup_district)} disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        <Field label="State"    type="autofill"><input value={safeStr(form.sup_state)}    disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        <Field label="Country"  type="autofill"><input value={safeStr(form.sup_country)}  disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        <div className="ypi-col-full">
                          <Field label="GST No" type="autofill"><input value={safeStr(form.sup_gst_no)} disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        </div>
                      </div>
                    )}
                    {sec.supplier && !form.po_id && (
                      <div style={{ padding: '14px', background: '#f8fafc', border: '1px dashed #e2e8f0', borderRadius: 8, marginTop: 10, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                        Select a PO No above to auto-fill supplier details.
                      </div>
                    )}

                    <SectionHead title="Supplier Billing" open={sec.billing} onToggle={() => toggle('billing')} />
                    {sec.billing && (
                      <div className="ypi-grid" style={{ marginTop: 12 }}>
                        <div className="ypi-col-full">
                          <Field label="Supplier Billing Name" type="autofill"><input value={safeStr(form.billing_supplier_name)} disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        </div>
                        <Field label="Address"  type="autofill"><input value={safeStr(form.bill_address)}  disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        <Field label="Pin Code" type="autofill"><input value={safeStr(form.bill_pin_code)} disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        <Field label="District" type="autofill"><input value={safeStr(form.bill_district)} disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        <Field label="State"    type="autofill"><input value={safeStr(form.bill_state)}    disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        <Field label="Country"  type="autofill"><input value={safeStr(form.bill_country)}  disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        <Field label="GST No"   type="autofill"><input value={safeStr(form.bill_gst_no)}   disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                      </div>
                    )}

                    <SectionHead title="Mill Details" open={sec.mill} onToggle={() => toggle('mill')} />
                    {sec.mill && (
                      <div className="ypi-grid" style={{ marginTop: 12 }}>
                        <div className="ypi-col-full">
                          <Field label="Mill Name" type="autofill"><input value={safeStr(form.mill_name)} disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        </div>
                        <Field label="Address"  type="autofill"><input value={safeStr(form.mill_address)}  disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        <Field label="Pin Code" type="autofill"><input value={safeStr(form.mill_pin_code)} disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        <Field label="District" type="autofill"><input value={safeStr(form.mill_district)} disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        <Field label="State"    type="autofill"><input value={safeStr(form.mill_state)}    disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        <Field label="Country"  type="autofill"><input value={safeStr(form.mill_country)}  disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                        <Field label="GST No"   type="autofill"><input value={safeStr(form.mill_gst_no)}   disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                      </div>
                    )}

                    <SectionHead title="Transport Details" open={sec.transport} onToggle={() => toggle('transport')} />
                    {sec.transport && (
                      <div className="ypi-grid" style={{ marginTop: 12 }}>
                        <Field label="Trans. Type" type="selection">
                          <select value={safeStr(form.trans_type)} onChange={e => set('trans_type', e.target.value)} style={s.input}>
                            <option value="">— Select —</option>
                            <option>Road</option>
                            <option>Rail</option>
                            <option>Air</option>
                            <option>Courier</option>
                            <option>Own Vehicle</option>
                          </select>
                        </Field>
                        <Field label="Transport" type="text">
                          <input value={safeStr(form.transport)} onChange={e => set('transport', e.target.value)} style={s.input} placeholder="Transporter / logistics provider" />
                        </Field>
                        <Field label="Transporter Name" type="autofill">
                          <input value={safeStr(form.transporter_name)} onChange={e => set('transporter_name', e.target.value)} style={s.input} placeholder="Name of transporter" />
                        </Field>
                        <Field label="Vehicle No" type="text">
                          <input value={safeStr(form.vehicle_no)} onChange={e => set('vehicle_no', e.target.value)} style={s.input} placeholder="TN 00 AB 0000" />
                        </Field>
                        <Field label="Transport Ref No (LR)" type="text">
                          <input value={safeStr(form.transport_ref_no)} onChange={e => set('transport_ref_no', e.target.value)} style={s.input} placeholder="LR / Receipt No" />
                        </Field>
                        <Field label="Freight Charges (₹)" type="text">
                          <input value={safeStr(form.freight_charges)} onChange={e => set('freight_charges', e.target.value)} style={s.input} placeholder="0.00" inputMode="decimal" />
                        </Field>
                        <Field label="Loading Charges (₹)" type="text">
                          <input value={safeStr(form.loading_charges)} onChange={e => set('loading_charges', e.target.value)} style={s.input} placeholder="0.00" inputMode="decimal" />
                        </Field>
                        <Field label="Unloading Charges (₹)" type="text">
                          <input value={safeStr(form.unloading_charges)} onChange={e => set('unloading_charges', e.target.value)} style={s.input} placeholder="0.00" inputMode="decimal" />
                        </Field>
                        <Field label="Other Transport Charges (₹)" type="text">
                          <input value={safeStr(form.other_transport_charges)} onChange={e => set('other_transport_charges', e.target.value)} style={s.input} placeholder="0.00" inputMode="decimal" />
                        </Field>
                        <Field label="Total Transport Expenses" type="computed">
                          <div style={s.computed}>₹{totalTransportExpense.toFixed(2)}</div>
                        </Field>
                      </div>
                    )}
                  </div>
                )}

                {/* ═══ TAB 2: INWARD DETAILS ═══ */}
                {activeTab === 1 && (
                  <div className="ypi-tab-body">
                    <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#0f766e' }}>
                      <strong>ℹ️ Note:</strong> For 1 PO, there can be one or more material Inwards. Each inward line can have a different Invoice No but refers to the same PO. Weigh Bridge details are captured in Tab 3.
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                        {form.items.length} line{form.items.length !== 1 ? 's' : ''}
                        <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>— Total Received: <strong style={{ color: '#0f766e' }}>{totalRecvKgs.toFixed(3)} KGS</strong></span>
                      </span>
                      <button className="ypi-add-row-btn" onClick={addItem}><PlusCircle size={14} /> Add Line</button>
                    </div>

                    {form.items.map((item, idx) => (
                      <InwardItemCard
                        key={item._id} item={item} idx={idx} total={form.items.length}
                        poItemsForPO={poItemsForPO}
                        onUpdate={updateItem} onRemove={removeItem}
                      />
                    ))}

                    <div className="ypi-grand-total">
                      <div className="ypi-grand-total-item">
                        <span>Total Received KGS</span>
                        <strong style={{ color: '#0f766e' }}>{totalRecvKgs.toFixed(3)} KGS</strong>
                      </div>
                      <div style={{ width: 1, height: 32, background: '#e2e8f0' }} />
                      <div className="ypi-grand-total-item">
                        <span>Net Value (Basic)</span>
                        <strong style={{ color: '#c2410c' }}>₹ {grandBasic.toFixed(2)}</strong>
                      </div>
                      <div style={{ width: 1, height: 32, background: '#e2e8f0' }} />
                      <div className="ypi-grand-total-item">
                        <span>T. CGST</span>
                        <strong style={{ color: '#374151' }}>₹ {t_cgst.toFixed(2)}</strong>
                      </div>
                      <div className="ypi-grand-total-item">
                        <span>T. SGST</span>
                        <strong style={{ color: '#374151' }}>₹ {t_sgst.toFixed(2)}</strong>
                      </div>
                      <div className="ypi-grand-total-item">
                        <span>T. IGST</span>
                        <strong style={{ color: '#374151' }}>₹ {t_igst.toFixed(2)}</strong>
                      </div>
                      <div style={{ width: 1, height: 32, background: '#e2e8f0' }} />
                      <div className="ypi-grand-total-item">
                        <span>Grand Total Value</span>
                        <strong style={{ color: '#166534', fontSize: 17 }}>₹ {grandNetValue.toFixed(2)}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ TAB 3: WEIGH BRIDGE ═══ */}
                {activeTab === 2 && (
                  <div className="ypi-tab-body">
                    {!weighbridgeApplicable && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#991b1b', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                        <div>
                          <strong>Weigh Bridge not applicable for Inward Type: {form.inward_type}.</strong>
                          <div style={{ marginTop: 2, fontWeight: 400 }}>
                            This section is disabled and won't be saved with this inward record.
                            Change Inward Type on the Basic Details tab if weigh bridge data needs to be captured.
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="ypi-wb-card" style={!weighbridgeApplicable ? { opacity: 0.55 } : undefined}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <Scale size={18} color="#0f766e" />
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#134e4a' }}>Weigh Bridge Details</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
                        <Field label="Load Wt No" type="text">
                          <input value={safeStr(form.weighbridge?.load_wt_no)} onChange={e => updateWB({ load_wt_no: e.target.value })} disabled={!weighbridgeApplicable} style={{ ...s.input, ...(!weighbridgeApplicable ? s.inputDisabled : {}) }} placeholder="Reference no." />
                        </Field>
                        <Field label="Load Weight (KGS)" type="number">
                          <input type="number" value={safeStr(form.weighbridge?.load_wt)} onChange={e => updateWB({ load_wt: e.target.value })} disabled={!weighbridgeApplicable} style={{ ...s.input, ...(!weighbridgeApplicable ? s.inputDisabled : {}) }} placeholder="0.0000" min="0" step="0.0001" />
                        </Field>
                        <div />
                        <Field label="Empty Wt No" type="text">
                          <input value={safeStr(form.weighbridge?.empty_wt_no)} onChange={e => updateWB({ empty_wt_no: e.target.value })} disabled={!weighbridgeApplicable} style={{ ...s.input, ...(!weighbridgeApplicable ? s.inputDisabled : {}) }} placeholder="Reference no." />
                        </Field>
                        <Field label="Empty Weight (KGS)" type="number">
                          <input type="number" value={safeStr(form.weighbridge?.empty_wt)} onChange={e => updateWB({ empty_wt: e.target.value })} disabled={!weighbridgeApplicable} style={{ ...s.input, ...(!weighbridgeApplicable ? s.inputDisabled : {}) }} placeholder="0.0000" min="0" step="0.0001" />
                        </Field>
                        <Field label="Net Weight (KGS)" type="computed">
                          <div style={s.computed}>{safeStr(form.weighbridge?.net_wt) || '0.0000'} KGS</div>
                        </Field>
                      </div>

                      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
                        <Field label="Yarn Inward Total Wt" type="computed">
                          <div style={{ ...s.computed, background: '#e0f2fe', borderColor: '#bae6fd', color: '#0369a1' }}>
                            {safeStr(form.weighbridge?.yarn_inward_total_wt) || totalRecvKgs.toFixed(4)} KGS
                          </div>
                        </Field>
                        <Field label="Difference (Net − Inward Total)" type="computed">
                          <div style={{ ...s.computed, background: parseFloat(form.weighbridge?.difference || '0') === 0 ? '#dcfce7' : '#fef2f2', borderColor: parseFloat(form.weighbridge?.difference || '0') === 0 ? '#86efac' : '#fca5a5', color: parseFloat(form.weighbridge?.difference || '0') === 0 ? '#166534' : '#dc2626' }}>
                            {safeStr(form.weighbridge?.difference) || '0.0000'} KGS
                          </div>
                        </Field>
                        <Field label="No. of Packages" type="number">
                          <input type="number" value={safeStr(form.weighbridge?.no_of_packages)} onChange={e => updateWB({ no_of_packages: e.target.value })} disabled={!weighbridgeApplicable} style={{ ...s.input, ...(!weighbridgeApplicable ? s.inputDisabled : {}) }} placeholder="0" min="0" />
                        </Field>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                        <Field label="Yarn Wt" type="number">
                          <input type="number" value={safeStr(form.weighbridge?.yarn_wt)} onChange={e => updateWB({ yarn_wt: e.target.value })} disabled={!weighbridgeApplicable} style={{ ...s.input, ...(!weighbridgeApplicable ? s.inputDisabled : {}) }} placeholder="0.0000" min="0" step="0.0001" />
                        </Field>
                        <Field label="Total Yarn Wt" type="number">
                          <input type="number" value={safeStr(form.weighbridge?.total_yarn_wt)} onChange={e => updateWB({ total_yarn_wt: e.target.value })} disabled={!weighbridgeApplicable} style={{ ...s.input, ...(!weighbridgeApplicable ? s.inputDisabled : {}) }} placeholder="0.0000" min="0" step="0.0001" />
                        </Field>
                      </div>

                      <Field label="Remarks" type="multiline">
                        <textarea value={safeStr(form.weighbridge?.remarks)} onChange={e => updateWB({ remarks: e.target.value })} disabled={!weighbridgeApplicable} rows={3} placeholder="Reason for any weight difference…" style={{ ...s.input, ...(!weighbridgeApplicable ? s.inputDisabled : {}), resize: 'vertical', minHeight: 80 }} />
                      </Field>
                    </div>
                  </div>
                )}

                {/* ═══ TAB 4: INSPECTION STATUS ═══ */}
                {activeTab === 3 && (
                  <div className="ypi-tab-body">
                    <div style={{ marginBottom: 24 }}>
                      <label style={{ ...s.label, marginBottom: 10 }}>Purchase Inward Status <FTypeBadge type="selection" /></label>
                      <div className="ypi-status-toggle">
                        {['DRAFT', 'APPROVED'].map(st => (
                          <button
                            key={st}
                            onClick={() => set('inward_status', st)}
                            className={`ypi-status-btn${form.inward_status === st ? ` active-${st.toLowerCase()}` : ''}`}
                            style={{
                              background: form.inward_status === st ? (st === 'APPROVED' ? '#dcfce7' : '#f3f4f6') : '#fff',
                              borderColor: form.inward_status === st ? (st === 'APPROVED' ? '#16a34a' : '#6b7280') : '#e2e8f0',
                              color: form.inward_status === st ? (st === 'APPROVED' ? '#166534' : '#374151') : '#94a3b8',
                            }}
                          >
                            <div style={{ fontSize: 18, marginBottom: 4 }}>{st === 'APPROVED' ? '✅' : '📝'}</div>
                            <div>{st}</div>
                            <div style={{ fontSize: 11, fontWeight: 400, marginTop: 4, color: 'inherit', opacity: 0.8 }}>
                              {st === 'DRAFT' ? 'Entry in progress — not yet approved' : 'Inspection complete — yarn taken into inventory'}
                            </div>
                          </button>
                        ))}
                      </div>
                      {form.inward_status === 'DRAFT' && (
                        <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e', display: 'flex', gap: 8, alignItems: 'center' }}>
                          <AlertTriangle size={13} />
                          Received quantity will remain in <strong>WIP / Inspection Status</strong> until approved.
                        </div>
                      )}
                    </div>

                    <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
                      <label style={{ ...s.label, marginBottom: 12, fontSize: 12 }}>Inspection Completed? <FTypeBadge type="selection" /></label>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                        {['Yes', 'No'].map(v => (
                          <button
                            key={v}
                            onClick={() => set('inspection_completed', v)}
                            style={{
                              flex: 1, padding: '12px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                              border: `2px solid ${form.inspection_completed === v ? (v === 'Yes' ? '#16a34a' : '#94a3b8') : '#e2e8f0'}`,
                              background: form.inspection_completed === v ? (v === 'Yes' ? '#dcfce7' : '#f3f4f6') : '#fff',
                              color: form.inspection_completed === v ? (v === 'Yes' ? '#166534' : '#374151') : '#94a3b8',
                              cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                            }}
                          >
                            {v === 'Yes' ? '✅ Yes — Inspection Done' : '⏳ No — Pending Inspection'}
                          </button>
                        ))}
                      </div>

                      {form.inspection_completed === 'Yes' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                          <Field label="Approved Qty (KGS)" required type="number">
                            <input type="number" value={safeStr(form.approved_qty)} onChange={e => set('approved_qty', e.target.value)} style={s.input} placeholder="0.000" min="0" step="0.001" />
                          </Field>
                          <Field label="Rejected Qty (KGS)" type="number">
                            <input type="number" value={safeStr(form.rejected_qty)} onChange={e => set('rejected_qty', e.target.value)} style={s.input} placeholder="0.000" min="0" step="0.001" />
                          </Field>
                          {(form.approved_qty || form.rejected_qty) && (
                            <div style={{ gridColumn: '1/-1', padding: '10px 14px', background: '#dcfce7', borderRadius: 8, fontSize: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                              <span>✅ Approved: <strong>{parseFloat(form.approved_qty || 0).toFixed(3)} KGS</strong></span>
                              <span>❌ Rejected: <strong>{parseFloat(form.rejected_qty || 0).toFixed(3)} KGS</strong></span>
                              <span>📦 Total Received: <strong>{totalRecvKgs.toFixed(3)} KGS</strong></span>
                              {(parseFloat(form.approved_qty || 0) + parseFloat(form.rejected_qty || 0)) > 0 && (
                                <span>⚖️ Balance: <strong style={{ color: '#dc2626' }}>
                                  {(totalRecvKgs - parseFloat(form.approved_qty || 0) - parseFloat(form.rejected_qty || 0)).toFixed(3)} KGS
                                </strong></span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4', borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                        📋 Review Summary
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                        {[
                          { label: 'Inward No',          value: form.inward_no ?? 'Auto' },
                          { label: 'PO No',              value: lookup.purchaseOrders.find(p => String(p.id) === form.po_id)?.po_no ?? '—' },
                          { label: 'Inward Date',        value: toDateInput(form.inward_date) || '—' },
                          { label: 'Inward Type',        value: form.inward_type },
                          { label: 'Inward Lines',       value: `${form.items.length}` },
                          { label: 'Total Recv KGS',     value: `${totalRecvKgs.toFixed(3)} KGS` },
                          { label: 'Net Value',          value: `₹ ${grandBasic.toFixed(2)}` },
                          { label: 'Total Incl. Tax',    value: `₹ ${grandNetValue.toFixed(2)}` },
                          { label: 'Transport Expenses', value: `₹ ${totalTransportExpense.toFixed(2)}` },
                          { label: 'Weigh Bridge',       value: weighbridgeApplicable ? 'Applicable' : 'Not Applicable' },
                          { label: 'Status',             value: form.inward_status },
                          { label: 'Inspection',         value: form.inspection_completed === 'Yes' ? 'Done' : 'Pending' },
                        ].map(row => (
                          <div key={row.label} style={{ background: '#fff', border: '1px solid #ccfbf1', borderRadius: 8, padding: '8px 12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{row.label}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginTop: 2 }}>{row.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

              </div>{/* end modal-body */}

              {/* Modal Footer */}
              <div className="ypi-modal-footer">
                <TabStepIndicator active={activeTab} total={TOTAL_TABS} onGo={setActiveTab} />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="ypi-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                  {activeTab > 0 && (
                    <button className="ypi-btn-prev" onClick={() => { setError(''); setActiveTab(t => t - 1); }}>← Prev</button>
                  )}
                  {!isLastTab && (
                    <button className="ypi-btn-next" onClick={handleNext}>Next →</button>
                  )}
                  {isLastTab && (
                    <button className="ypi-btn-save" onClick={handleSave} disabled={saving}>
                      {saving
                        ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                        : editId ? '✏️ Update Inward' : '💾 Save Inward'
                      }
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </>
  );
}