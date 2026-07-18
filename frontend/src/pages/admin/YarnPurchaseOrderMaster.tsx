// frontend/src/pages/admin/YarnPurchaseOrderMaster.tsx
//
// REBUILT to match the Fabric Purchase Order module's format:
//
//   1. COMPANY (PRINT HEADER): the existing "Company Billing Address"
//      picker (company_address_id) is now presented as a logo-aware
//      CompanyDropdown — exactly like FPO's "Company (Print Header)" —
//      with a live CompanyHeaderPreview underneath. It still autofills
//      comp_address/comp_gst_no/etc. as before; it ALSO now decides which
//      company's logo/name/GSTIN prints at the top of the Yarn PO
//      letterhead. No new master table required from the frontend's point
//      of view — whichever table the backend resolves as the Company
//      Details Master (see routes/yarnPurchaseOrders.js: getCompanyMeta())
//      is what feeds lookup.companyAddresses here.
//
//   2. ROW ACTIONS: the inline Edit/Delete buttons are replaced with a
//      3-dot kebab menu (RowActionsMenu) offering Edit / Print / Delete,
//      rendered through a React Portal into document.body so it's immune
//      to any ancestor `filter`/`transform`/`overflow` — same fix FPO
//      applied for the identical failure mode.
//
//   3. PROFESSIONAL PRINT: handlePrintPO() opens the print window
//      synchronously (popup-blocker safe), shows a loading placeholder,
//      re-fetches the full PO (so printing from a list row never uses
//      stale/incomplete data), then renders a company letterhead —
//      logo/name/address/GSTIN/phone/email, Order No/Date/Due Date grid,
//      Supplier / Ship-From (Mill) boxes, a yarn item table (Count / HSN /
//      Qty / Rate / GST / Amount), amount-in-words, Sub Total/Advance/
//      Balance, an HSN-wise CGST+SGST+IGST tax summary, and a terms +
//      signatory block — in Times New Roman, matching FPO's letterhead.
//
//   4. NEW PRINT-ONLY FIELDS: Due Date, Place of Supply, Advance,
//      Description added to the Delivery & Payment section (all optional,
//      all editable) — see yarn_po_schema_updates.sql / the updated route.
//
//   5. FIX — COMPANY (PRINT HEADER) SHOWING "No companies found": the
//      real bug was server-side — the backend previously hardcoded a
//      single table name (`company_addresses`) and an unconditional
//      `status = 'Active'` filter, either of which could silently zero
//      out the companyAddresses lookup with no error to catch. The route
//      now auto-detects whichever Company Details Master table actually
//      exists (company_addresses / company_master / companies /
//      company_details) and only applies the status filter if the column
//      exists, retrying without it if it matches nothing.
//
//      On the frontend, two things were tightened up to match:
//        a) loadLookup() warns via toast if companyAddresses comes back
//           empty, instead of failing silently — message is now generic
//           (doesn't assume the table is literally named
//           "company_addresses", since the backend may resolve a
//           differently-named master).
//        b) CompanyDropdown's search filter guards against null/undefined
//           company_name and gst_no, and its empty-state copy is generic
//           for the same reason.
//
// Everything else (tabs, yarn item cards, HSN dropdown, CO/PWO linking,
// toasts, export menu, validation) is unchanged from the previous version.

import {
  useEffect, useRef, useState, useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Search, X, ChevronDown, ChevronUp, PlusCircle,
  Loader2, AlertCircle, CheckCircle2, Info, AlertTriangle,
  Download, FileText, FileSpreadsheet, Printer, Building2, MoreVertical,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SupplierOption {
  id: number; supplier_name: string; address: string; pin_code: string;
  district: string; state: string; country: string; gst_no: string;
}
interface AgentOption { id: number; agent_name: string; commission_pct?: string; }
interface YarnOption {
  id: number; yarn_code: string; short_name: string;
  hsn_code_value?: string; hsn_code_id?: number; category?: string;
  count?: string; actual_count?: string; count_type?: string;
}
interface UomOption { id: number; uom_name: string; }
interface DiscountTypeOption { id: number; discount_type_name: string; discount_pct?: string; }
interface PaymentTermOption { id: number; payment_term_name: string; payment_term_days: string; }

// The "Company (Print Header)" master. The backend resolves whichever
// real table this data comes from (see getCompanyMeta() in
// routes/yarnPurchaseOrders.js) — from the frontend's perspective it's
// just a list of these options. logo_url / phone / email / cin_no are
// used only for the printed letterhead; everything else drives the
// comp_address/comp_gst_no autofill as before.
interface CompanyAddressOption {
  id: number; company_name: string; address: string; pin_code: string;
  district: string; state: string; country: string; gst_no: string;
  logo_url?: string; phone?: string; email?: string; cin_no?: string;
}
interface CustomerOrderOption { id: number; co_no: string; customer_name: string; co_date: string; }
interface PwoOption { id: number; wo_no: string; co_no: string; co_id?: number; status: string; }
interface HsnOption { id: number; hsn_code: string; description?: string; hsn_short_desc?: string; gst_percent?: string; }

interface YarnPOItem {
  _id: string; id?: number; yarn_id: string; yarn_code?: string;
  count_for_po: string; hsn_code: string; hsn_code_id?: string; lot_no: string;
  uom_id: string; package_type: string; no_of_packages: string; weight_per_package: string;
  total_weight: string; cone_weight: string; no_of_cone_per_bag: string;
  rate: string; discount_type_id: string; discount_pct: string; total_po_value: string;
  instructions: string; gst_pct: string; sgst_pct: string; igst_pct: string; net_value: string;
}
interface CoLink {
  _id: string; id?: number; co_id: string; co_no?: string; customer_name?: string;
  pwo_ids: string[]; required_kgs: string;
}
interface YarnPO {
  id?: number; rec_no?: string; rec_date: string; supplier_id: string; order_through: string;
  agent_id: string; commission_pct: string; rate_type: string;
  sup_address: string; sup_pin_code: string; sup_district: string; sup_state: string; sup_country: string; sup_gst_no: string;
  billing_same_as_supplier: string; billing_supplier_id: string;
  bill_address: string; bill_pin_code: string; bill_district: string; bill_state: string; bill_country: string; bill_gst_no: string;
  mill_same_as_supplier: string; mill_supplier_id: string;
  mill_address: string; mill_pin_code: string; mill_district: string; mill_state: string; mill_country: string; mill_gst_no: string;
  company_address_id: string;
  comp_address: string; comp_pin_code: string; comp_district: string; comp_state: string; comp_country: string; comp_gst_no: string;
  exp_delivery: string; payment_term_id: string; transport_freight_terms: string;
  // Print-only fields
  due_date: string; place_of_supply: string; advance: string; description: string;
  items: YarnPOItem[]; co_links: CoLink[]; status: string;
}
interface LookupData {
  suppliers: SupplierOption[]; agents: AgentOption[]; yarns: YarnOption[]; uoms: UomOption[];
  discountTypes: DiscountTypeOption[]; paymentTerms: PaymentTermOption[];
  companyAddresses: CompanyAddressOption[]; customerOrders: CustomerOrderOption[];
  pwos: PwoOption[]; hsnCodes: HsnOption[];
}

const HARDCODED_UOMS: SDOption[] = [
  { value: 'kg', label: 'KG' }, { value: 'mt', label: 'MT' }, { value: 'denier', label: 'Denier' },
  { value: 'count', label: 'Count' }, { value: 'meter', label: 'Meter' }, { value: 'yard', label: 'Yard' },
  { value: 'gsm', label: 'GSM' }, { value: 'pcs', label: 'Pieces (PCS)' },
  { value: 'dozen', label: 'Dozens' }, { value: 'carton', label: 'Cartons' },
];

// ─── Toast ───────────────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string }
let _tid = 0;
function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++_tid;
    setToasts(p => [...p, { id, type, title, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4200);
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

// ─── Export dropdown ─────────────────────────────────────────────────────────
function ExportMenu({ onExportCSV, onExportExcel, onPrint, disabled }: {
  onExportCSV: () => void; onExportExcel: () => void; onPrint: () => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);
  const items = [
    { label: 'Export as CSV',   icon: <FileText size={15} color="#7c3aed" />,       action: onExportCSV },
    { label: 'Export as Excel', icon: <FileSpreadsheet size={15} color="#16a34a" />, action: onExportExcel },
    { label: 'Print Table',     icon: <Printer size={15} color="#2563eb" />,        action: onPrint },
  ];
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="ypo-export-btn" disabled={disabled} onClick={() => setOpen(o => !o)}>
        <Download size={14} /> Export
        <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div className="ypo-export-menu">
          <div className="ypo-export-menu-label">Export / Print</div>
          {items.map(it => (
            <button key={it.label} className="ypo-export-item" onClick={() => { it.action(); setOpen(false); }}>
              {it.icon}<span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── GST Badge ────────────────────────────────────────────────────────────────
function GstBadge({ pct }: { pct?: string }) {
  if (!pct && pct !== '0') return null;
  const n = parseFloat(pct);
  let bg = '#f1f5f9', color = '#475569';
  if (n === 0) { bg = '#f0fdf4'; color = '#166534'; }
  else if (n <= 5) { bg = '#eff6ff'; color = '#1d4ed8'; }
  else if (n <= 12) { bg = '#fef3c7'; color = '#b45309'; }
  else if (n <= 18) { bg = '#fff1f2'; color = '#dc2626'; }
  else { bg = '#fdf2f8'; color = '#9d174d'; }
  return (
    <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color, flexShrink: 0 }}>
      {isNaN(n) ? pct : `${n}%`}
    </span>
  );
}

// ─── HSN Dropdown (unchanged) ─────────────────────────────────────────────────
interface HsnDropdownProps { value: string; onChange: (id: string) => void; hsnCodes: HsnOption[]; placeholder?: string; portalZIndex?: number; }
function HsnDropdown({ value, onChange, hsnCodes, placeholder = 'Select HSN code…', portalZIndex = 9000 }: HsnDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
      if (wrapRef.current) {
        const rect = wrapRef.current.getBoundingClientRect();
        setDropPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width });
      }
    }
  }, [open]);

  const displayLabel = hsnCodes.find(h => String(h.id) === String(value))?.hsn_code || '';
  const filtered = hsnCodes.filter(h => {
    const q = query.toLowerCase();
    return h.hsn_code.toLowerCase().includes(q) || (h.hsn_short_desc ?? h.description ?? '').toLowerCase().includes(q);
  }).slice(0, 50);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: `1px solid ${open ? '#7c3aed' : '#cbd5e1'}`, borderRadius: 8, cursor: 'pointer', background: value ? '#f5f3ff' : '#fff', fontSize: 13, fontFamily: "'DM Sans', sans-serif", minHeight: 38, boxShadow: open ? '0 0 0 2px #ddd6fe' : 'none', transition: 'all 0.15s' }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: value ? "'DM Mono', monospace" : "'DM Sans', sans-serif", fontWeight: value ? 600 : 400, fontSize: value ? 12 : 13, color: value ? '#6d28d9' : '#9ca3af' }}>
          {displayLabel || placeholder}
        </span>
        {value
          ? <button onClick={e => { e.stopPropagation(); onChange(''); setQuery(''); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#94a3b8' }}><X size={13} /></button>
          : <ChevronDown size={13} color="#94a3b8" />}
      </div>
      {open && dropPos && (
        <div style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: Math.max(dropPos.width, 280), background: '#fff', border: '1px solid #ddd6fe', borderRadius: 10, zIndex: portalZIndex, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', maxHeight: 280, overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Search size={13} color="#94a3b8" />
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search HSN code or description…" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, fontFamily: "'DM Sans', sans-serif", color: '#1e293b', background: 'transparent' }} />
            {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={12} /></button>}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '14px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>No HSN codes found{query ? ` for "${query}"` : ''}</div>
            ) : filtered.map(h => (
              <div key={h.id} onClick={() => { onChange(String(h.id)); setOpen(false); setQuery(''); }}
                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', background: String(h.id) === String(value) ? '#f5f3ff' : '#fff' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                onMouseLeave={e => (e.currentTarget.style.background = String(h.id) === String(value) ? '#f5f3ff' : '#fff')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: '#6d28d9', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 5, padding: '1px 7px' }}>{h.hsn_code}</span>
                  {(h.hsn_short_desc || h.description) && <span style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.hsn_short_desc || h.description}</span>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '5px 12px', borderTop: '1px solid #f1f5f9', fontSize: 10, color: '#94a3b8', background: '#f8fafc', flexShrink: 0 }}>
            {filtered.length} of {hsnCodes.length} codes
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Field type badge ─────────────────────────────────────────────────────────
type FieldTypeBadge = 'lookup' | 'autofill' | 'computed' | 'selection' | 'date' | 'text' | 'number' | 'multiline';
const FT_CFG: Record<FieldTypeBadge, { label: string; bg: string; color: string }> = {
  lookup: { label: 'Lookup', bg: '#ede9fe', color: '#6d28d9' },
  autofill: { label: 'Autofill', bg: '#e0f2fe', color: '#0369a1' },
  computed: { label: 'Computed', bg: '#fef9c3', color: '#92400e' },
  selection: { label: 'Select', bg: '#f0fdf4', color: '#166534' },
  date: { label: 'Date', bg: '#fff7ed', color: '#c2410c' },
  text: { label: 'Text', bg: '#f8fafc', color: '#475569' },
  number: { label: 'Number', bg: '#fdf4ff', color: '#86198f' },
  multiline: { label: 'Textarea', bg: '#f8fafc', color: '#475569' },
};
function FTypeBadge({ type }: { type: FieldTypeBadge }) {
  const c = FT_CFG[type];
  return <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: c.bg, color: c.color, letterSpacing: '0.04em', textTransform: 'uppercase', marginLeft: 5, verticalAlign: 'middle' }}>{c.label}</span>;
}

// ─── Searchable Dropdown ───────────────────────────────────────────────────────
interface SDOption { value: string; label: string; sub?: string }
interface SDProps { value: string; onChange: (v: string) => void; options: SDOption[]; placeholder?: string; disabled?: boolean; error?: boolean; portalZIndex?: number; }
function SearchableDropdown({ value, onChange, options, placeholder = '— Select —', disabled = false, error = false, portalZIndex = 9000 }: SDProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const safeValue = value ?? '';
  const selected = options.find(o => o.value === safeValue);
  const filtered = q.trim() ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options;

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQ(''); } };
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
      <div onClick={() => { if (!disabled) setOpen(v => !v); }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px 8px 12px', border: `1.5px solid ${error ? '#fca5a5' : open ? '#2563eb' : '#cbd5e1'}`, borderRadius: 8, background: disabled ? '#f1f5f9' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, minHeight: 37, boxShadow: open ? '0 0 0 3px rgba(37,99,235,0.1)' : 'none', userSelect: 'none' }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? '#1e293b' : '#9ca3af' }}>{selected ? selected.label : placeholder}</span>
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
                style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', background: opt.value === safeValue ? '#eff6ff' : 'transparent', color: opt.value === safeValue ? '#1d4ed8' : '#374151', fontWeight: opt.value === safeValue ? 600 : 400 }}
                onMouseEnter={e => { if (opt.value !== safeValue) (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'; }}
                onMouseLeave={e => { if (opt.value !== safeValue) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
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

// ─── Company (Print Header) Dropdown — logo-aware, FPO-style ────────────
interface CompanyDropdownProps { value: string; onChange: (id: string) => void; companies: CompanyAddressOption[]; portalZIndex?: number; }
function CompanyDropdown({ value, onChange, companies, portalZIndex = 9500 }: CompanyDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
      if (wrapRef.current) {
        const rect = wrapRef.current.getBoundingClientRect();
        setDropPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width });
      }
    }
  }, [open]);

  // Guards against a null/undefined company_name or gst_no on any one row —
  // without this, `.toLowerCase()` on a null field would throw inside the
  // filter and silently blank the whole dropdown on that render.
  const q = query.toLowerCase();
  const filtered = companies.filter(c =>
    (c.company_name ?? '').toLowerCase().includes(q) ||
    (c.gst_no ?? '').toLowerCase().includes(q),
  );
  const selected = companies.find(c => String(c.id) === String(value)) ?? null;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: `1.5px solid ${open ? '#7c3aed' : '#cbd5e1'}`, borderRadius: 8, cursor: 'pointer', background: selected ? '#faf5ff' : '#fff', minHeight: 48, boxShadow: open ? '0 0 0 3px rgba(124,58,237,.1)' : 'none' }}
      >
        <span style={{ width: 30, height: 30, borderRadius: 7, background: '#f5f3ff', border: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, color: '#7c3aed' }}>
          {selected?.logo_url ? <img src={selected.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : <Building2 size={15} />}
        </span>
        <span style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
          {selected ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.company_name}</div>
              {selected.gst_no && <div style={{ fontSize: 10.5, color: '#7c3aed', fontFamily: "'DM Mono',monospace" }}>GST: {selected.gst_no}</div>}
            </>
          ) : <span style={{ fontSize: 13, color: '#9ca3af' }}>Select company for letterhead…</span>}
        </span>
        {selected
          ? <button onClick={e => { e.stopPropagation(); onChange(''); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: '#94a3b8' }}><X size={13} /></button>
          : <ChevronDown size={14} color="#94a3b8" />}
      </div>
      {open && dropPos && (
        <div style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: Math.max(dropPos.width, 300), background: '#fff', border: '1px solid #ddd6fe', borderRadius: 10, zIndex: portalZIndex, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxHeight: 300, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={13} color="#94a3b8" />
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search company name or GST…" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, background: 'transparent' }} />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {companies.length === 0 ? (
              // Generic on purpose: the backend now auto-detects the real
              // Company Details Master table name, so we don't assume it's
              // literally called "company_addresses" here.
              <div style={{ padding: 14, fontSize: 12, color: '#b45309', textAlign: 'center', lineHeight: 1.6 }}>
                No companies loaded.<br />Ask your admin to check that the Company Details Master has at least one active company, and that <code>/meta/lookup</code> is returning it.
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>No companies match "{query}"</div>
            ) : filtered.map(c => (
              <div key={c.id} onClick={() => { onChange(String(c.id)); setOpen(false); setQuery(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', background: String(c.id) === String(value) ? '#f5f3ff' : '#fff', borderBottom: '1px solid #f8fafc' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                onMouseLeave={e => (e.currentTarget.style.background = String(c.id) === String(value) ? '#f5f3ff' : '#fff')}
              >
                <span style={{ width: 26, height: 26, borderRadius: 6, background: '#f5f3ff', border: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, color: '#7c3aed' }}>
                  {c.logo_url ? <img src={c.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Building2 size={13} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b' }}>{c.company_name || '(unnamed company)'}</div>
                  <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{[c.district, c.state].filter(Boolean).join(', ')}{c.gst_no ? ` · GST ${c.gst_no}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Live preview of what prints at the top of the Yarn PO letterhead.
function CompanyHeaderPreview({ company }: { company: CompanyAddressOption | null }) {
  if (!company) return null;
  return (
    <div style={{ marginTop: 8, border: '1px solid #ddd6fe', background: '#faf5ff', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
        Header Preview <span style={{ fontWeight: 600, textTransform: 'none', color: '#8b5cf6' }}>(what prints on this PO)</span>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ width: 34, height: 34, borderRadius: 8, background: '#fff', border: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, color: '#7c3aed' }}>
          {company.logo_url ? <img src={company.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Building2 size={16} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: '#3b0764' }}>{company.company_name}</div>
          {company.address && <div style={{ fontSize: 11.5, color: '#6d28d9' }}>{[company.address, company.district, company.state, company.pin_code].filter(Boolean).join(', ')}</div>}
          {company.gst_no && <div style={{ fontSize: 11.5, color: '#6d28d9' }}>GST No: {company.gst_no}</div>}
          {(company.phone || company.email) && <div style={{ fontSize: 11.5, color: '#6d28d9' }}>{company.phone ? `Ph: ${company.phone}` : ''}{company.phone && company.email ? '  |  ' : ''}{company.email ? `Email: ${company.email}` : ''}</div>}
          {!company.logo_url && <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>⚠ No logo on file — check the Company Details Master.</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Row Actions Menu (3-dot kebab, portal-based) ────────────────────────
function RowActionsMenu({ onEdit, onPrint, onDelete }: { onEdit: () => void; onPrint: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node) || panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);

  const toggle = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const menuW = 190, menuH = 140;
      const spaceBelow = window.innerHeight - r.bottom;
      const top = spaceBelow > menuH + 8 ? r.bottom + 4 : Math.max(8, r.top - menuH - 4);
      const left = Math.min(r.right - menuW, window.innerWidth - menuW - 8);
      setPos({ top, left: Math.max(8, left) });
    }
    setOpen(o => !o);
  };

  const Item = ({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
    <button type="button" className={`ypo-row-menu-item${danger ? ' ypo-row-menu-item--danger' : ''}`} onClick={() => { setOpen(false); onClick(); }}>
      {icon}<span>{label}</span>
    </button>
  );

  const panel = open ? (
    <div ref={panelRef} className="ypo-row-menu-panel" style={{ position: 'fixed', top: pos.top, left: pos.left, width: 190, zIndex: 9999 }}>
      <Item icon={<span style={{ fontSize: 14, lineHeight: 1 }}>✏️</span>} label="Edit" onClick={onEdit} />
      <Item icon={<Printer size={14} color="#0284c7" />} label="Print" onClick={onPrint} />
      <div className="ypo-row-menu-divider" />
      <Item icon={<span style={{ fontSize: 14, lineHeight: 1 }}>🗑</span>} label="Delete" onClick={onDelete} danger />
    </div>
  ) : null;

  return (
    <>
      <button ref={triggerRef} type="button" className="ypo-row-menu-btn" onClick={toggle} title="Actions"><MoreVertical size={16} /></button>
      {panel && createPortal(panel, document.body)}
    </>
  );
}

// ─── Field + Section helpers ──────────────────────────────────────────────────
function Field({ label, required, children, error, type }: { label: string; required?: boolean; children: React.ReactNode; error?: string; type?: FieldTypeBadge }) {
  return (
    <div>
      <label style={s.label}>{label}{required && <span style={{ color: '#ef4444' }}> *</span>}{type && <FTypeBadge type={type} />}</label>
      {children}
      {error && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#dc2626', marginTop: 4 }}><AlertCircle size={11} />{error}</span>}
    </div>
  );
}
function SectionHead({ title, open, onToggle, badge }: { title: string; open: boolean; onToggle: () => void; badge?: React.ReactNode }) {
  return (
    <div style={s.sectionHead} onClick={onToggle}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={s.sectionTitle}>{title}</span>{badge}</span>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </div>
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────
const API = '/api/yarn-purchase-orders';
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];
const TAB_LABELS = ['📋 Basic Details', '🧵 Yarn Details', '🔗 Linked CO & PWO'];
const TOTAL_TABS = TAB_LABELS.length;

// Resolves a possibly-relative logo URL against the backend origin — same
// fix as the Fabric PO page (window.location.origin is the frontend dev
// server, not the API server that stores the file).
const ASSET_ORIGIN = 'http://localhost:5000';
const resolveAssetUrl = (raw?: string | null): string => {
  const url = (raw ?? '').trim();
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  try { return new URL(url.startsWith('/') ? url : `/${url}`, ASSET_ORIGIN).href; } catch { return url; }
};

// ─── Utility helpers ──────────────────────────────────────────────────────────
function safeStr(v: any): string { if (v === null || v === undefined) return ''; return String(v); }
function toDateInput(val: any): string {
  if (!val) return '';
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.includes('T')) return s.slice(0, 10);
  return '';
}
function fmtDate(raw?: string | null): string {
  const d = toDateInput(raw);
  if (!d) return '';
  const [y, m, dd] = d.split('-');
  return `${parseInt(dd, 10)}/${parseInt(m, 10)}/${y}`;
}
const fmtN = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function yarnCountLabel(y: YarnOption): string {
  if (y.actual_count) return String(y.actual_count);
  if (y.count) return String(y.count);
  return y.yarn_code || y.short_name || '—';
}

// Amount-in-words (Indian numbering) — same helper as the Fabric PO page.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const twoDigitsToWords = (n: number): string => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''));
const threeDigitsToWords = (n: number): string => (n >= 100 ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigitsToWords(n % 100) : '') : twoDigitsToWords(n));
const numberToWordsIndian = (num: number): string => {
  let n = Math.floor(Math.max(0, num));
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thou = Math.floor(n / 1000); n %= 1000;
  const rest = n;
  let words = '';
  if (crore) words += threeDigitsToWords(crore) + ' Crore ';
  if (lakh) words += threeDigitsToWords(lakh) + ' Lakh ';
  if (thou) words += threeDigitsToWords(thou) + ' Thousand ';
  if (rest) words += threeDigitsToWords(rest) + ' ';
  return words.trim();
};
const amountInWords = (amount: number): string => `${numberToWordsIndian(amount)} Rupees only`;

function sanitizeItem(it: any): YarnPOItem {
  const blank = BLANK_ITEM();
  return {
    ...blank, _id: it._id ?? blank._id, id: it.id,
    yarn_id: safeStr(it.yarn_id), yarn_code: safeStr(it.yarn_code), count_for_po: safeStr(it.count_for_po),
    hsn_code: safeStr(it.hsn_code ?? it.hsn_code_value), hsn_code_id: safeStr(it.hsn_code_id), lot_no: safeStr(it.lot_no),
    uom_id: safeStr(it.uom_id), package_type: safeStr(it.package_type), no_of_packages: safeStr(it.no_of_packages),
    weight_per_package: safeStr(it.weight_per_package), total_weight: safeStr(it.total_weight), cone_weight: safeStr(it.cone_weight),
    no_of_cone_per_bag: safeStr(it.no_of_cone_per_bag), rate: safeStr(it.rate), discount_type_id: safeStr(it.discount_type_id),
    discount_pct: safeStr(it.discount_pct), total_po_value: safeStr(it.total_po_value), instructions: safeStr(it.instructions),
    gst_pct: safeStr(it.gst_pct), sgst_pct: safeStr(it.sgst_pct), igst_pct: safeStr(it.igst_pct), net_value: safeStr(it.net_value),
  };
}
function sanitizeCoLink(l: any): CoLink {
  return { _id: l._id ?? `co-${Date.now()}-${Math.random()}`, id: l.id, co_id: safeStr(l.co_id), co_no: safeStr(l.co_no), customer_name: safeStr(l.customer_name), pwo_ids: Array.isArray(l.pwo_ids) ? l.pwo_ids.map(String) : [], required_kgs: safeStr(l.required_kgs) };
}
function sanitizeForm(data: any): YarnPO {
  return {
    id: data.id, rec_no: safeStr(data.rec_no), rec_date: toDateInput(data.rec_date),
    supplier_id: safeStr(data.supplier_id), order_through: safeStr(data.order_through) || 'Direct',
    agent_id: safeStr(data.agent_id), commission_pct: safeStr(data.commission_pct), rate_type: safeStr(data.rate_type) || 'Net rate',
    sup_address: safeStr(data.sup_address), sup_pin_code: safeStr(data.sup_pin_code), sup_district: safeStr(data.sup_district),
    sup_state: safeStr(data.sup_state), sup_country: safeStr(data.sup_country), sup_gst_no: safeStr(data.sup_gst_no),
    billing_same_as_supplier: safeStr(data.billing_same_as_supplier) || 'Yes', billing_supplier_id: safeStr(data.billing_supplier_id),
    bill_address: safeStr(data.bill_address), bill_pin_code: safeStr(data.bill_pin_code), bill_district: safeStr(data.bill_district),
    bill_state: safeStr(data.bill_state), bill_country: safeStr(data.bill_country), bill_gst_no: safeStr(data.bill_gst_no),
    mill_same_as_supplier: safeStr(data.mill_same_as_supplier) || 'Yes', mill_supplier_id: safeStr(data.mill_supplier_id),
    mill_address: safeStr(data.mill_address), mill_pin_code: safeStr(data.mill_pin_code), mill_district: safeStr(data.mill_district),
    mill_state: safeStr(data.mill_state), mill_country: safeStr(data.mill_country), mill_gst_no: safeStr(data.mill_gst_no),
    company_address_id: safeStr(data.company_address_id),
    comp_address: safeStr(data.comp_address), comp_pin_code: safeStr(data.comp_pin_code), comp_district: safeStr(data.comp_district),
    comp_state: safeStr(data.comp_state), comp_country: safeStr(data.comp_country), comp_gst_no: safeStr(data.comp_gst_no),
    exp_delivery: toDateInput(data.exp_delivery), payment_term_id: safeStr(data.payment_term_id),
    transport_freight_terms: safeStr(data.transport_freight_terms) || 'Paid', status: safeStr(data.status) || 'Draft',
    due_date: toDateInput(data.due_date) || toDateInput(data.exp_delivery), place_of_supply: safeStr(data.place_of_supply),
    advance: safeStr(data.advance) || '0', description: safeStr(data.description),
    items: (Array.isArray(data.items) ? data.items : []).map(sanitizeItem),
    co_links: (Array.isArray(data.co_links) ? data.co_links : []).map(sanitizeCoLink),
  };
}
const BLANK_ITEM = (): YarnPOItem => ({
  _id: `item-${Date.now()}-${Math.random()}`, yarn_id: '', count_for_po: '', hsn_code: '', hsn_code_id: '', lot_no: '',
  uom_id: '', package_type: '', no_of_packages: '', weight_per_package: '', total_weight: '', cone_weight: '', no_of_cone_per_bag: '',
  rate: '', discount_type_id: '', discount_pct: '', total_po_value: '', instructions: '', gst_pct: '', sgst_pct: '', igst_pct: '', net_value: '',
});
const BLANK_CO_LINK = (): CoLink => ({ _id: `co-${Date.now()}-${Math.random()}`, co_id: '', pwo_ids: [], required_kgs: '' });
const BLANK: YarnPO = {
  rec_date: new Date().toISOString().slice(0, 10), supplier_id: '', order_through: 'Direct', agent_id: '', commission_pct: '', rate_type: 'Net rate',
  sup_address: '', sup_pin_code: '', sup_district: '', sup_state: '', sup_country: '', sup_gst_no: '',
  billing_same_as_supplier: 'Yes', billing_supplier_id: '',
  bill_address: '', bill_pin_code: '', bill_district: '', bill_state: '', bill_country: '', bill_gst_no: '',
  mill_same_as_supplier: 'Yes', mill_supplier_id: '',
  mill_address: '', mill_pin_code: '', mill_district: '', mill_state: '', mill_country: '', mill_gst_no: '',
  company_address_id: '', comp_address: '', comp_pin_code: '', comp_district: '', comp_state: '', comp_country: '', comp_gst_no: '',
  exp_delivery: '', payment_term_id: '', transport_freight_terms: 'Paid',
  due_date: '', place_of_supply: '', advance: '0', description: '',
  items: [BLANK_ITEM()], co_links: [], status: 'Draft',
};

function useWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return w;
}

function computeItem(item: YarnPOItem): YarnPOItem {
  const pkgs = parseFloat(item.no_of_packages) || 0;
  const wpp = parseFloat(item.weight_per_package) || 0;
  const cw = parseFloat(item.cone_weight) || 0;
  const rate = parseFloat(item.rate) || 0;
  const disc = parseFloat(item.discount_pct) || 0;
  const gst = parseFloat(item.gst_pct) || 0;
  const sgst = parseFloat(item.sgst_pct) || 0;
  const igst = parseFloat(item.igst_pct) || 0;
  const total_weight = (pkgs * wpp).toFixed(3);
  const no_of_cone_per_bag = cw > 0 ? (wpp / cw).toFixed(2) : '';
  const rawValue = pkgs * wpp * rate;
  const total_po_value = (rawValue - rawValue * (disc / 100)).toFixed(2);
  const poVal = parseFloat(total_po_value) || 0;
  const net_value = (poVal * (1 + gst / 100 + sgst / 100 + igst / 100)).toFixed(2);
  return { ...item, total_weight, no_of_cone_per_bag, total_po_value, net_value };
}

function TabStepIndicator({ active, total, onGo }: { active: number; total: number; onGo: (i: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {Array.from({ length: total }, (_, i) => (
        <button key={i} onClick={() => onGo(i)} title={TAB_LABELS[i]}
          style={{ width: active === i ? 24 : 8, height: 8, borderRadius: 4, background: active === i ? '#7c3aed' : '#ddd6fe', border: 'none', cursor: 'pointer', padding: 0, transition: 'width .2s, background .2s' }} />
      ))}
      <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>Step {active + 1} of {total}</span>
    </div>
  );
}

// ─── Yarn Item Card (unchanged) ────────────────────────────────────────────────
function YarnItemCard({ item, idx, total, yarnOpts, hsnOptions, discOpts, onUpdate, onRemove }: {
  item: YarnPOItem; idx: number; total: number; yarnOpts: SDOption[]; hsnOptions: HsnOption[]; discOpts: SDOption[];
  onUpdate: (idx: number, updates: Partial<YarnPOItem>) => void; onRemove: (idx: number) => void;
}) {
  const inp = (field: keyof YarnPOItem) => ({
    value: item[field] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onUpdate(idx, { [field]: e.target.value }),
    style: { ...s.input, width: '100%' },
  });
  const selectedHsn = hsnOptions.find(h => String(h.id) === (item.hsn_code_id ?? ''));

  return (
    <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, marginBottom: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'linear-gradient(90deg,#f8f5ff,#f0f9ff)', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#7c3aed', color: '#fff', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{item.count_for_po || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Yarn Line {idx + 1}</span>}</span>
          {selectedHsn ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontFamily: 'DM Mono,monospace', fontSize: 11, background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>HSN: {selectedHsn.hsn_code}</span>
              <GstBadge pct={selectedHsn.gst_percent} />
            </span>
          ) : item.hsn_code ? (
            <span style={{ fontSize: 11, fontFamily: 'DM Mono,monospace', background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>HSN: {item.hsn_code}</span>
          ) : null}
        </div>
        <button onClick={() => onRemove(idx)} disabled={total === 1}
          style={{ background: total === 1 ? '#f1f5f9' : '#fff1f2', color: total === 1 ? '#94a3b8' : '#ef4444', border: `1px solid ${total === 1 ? '#e2e8f0' : '#fca5a5'}`, borderRadius: 8, width: 30, height: 30, cursor: total === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Count (Yarn)" required type="lookup">
            <SearchableDropdown value={item.yarn_id} onChange={v => onUpdate(idx, { yarn_id: v })} options={yarnOpts} placeholder="Select actual count…" portalZIndex={10000} />
          </Field>
          <Field label="Count for PO" type="text">
            <input value={item.count_for_po} onChange={e => onUpdate(idx, { count_for_po: e.target.value })} placeholder="e.g. 62 / 2 NE" style={{ ...s.input, width: '100%' }} />
          </Field>
          <Field label="HSN Code" type="lookup">
            <HsnDropdown value={item.hsn_code_id ?? ''} onChange={(id) => {
              const opt = hsnOptions.find(h => String(h.id) === id);
              onUpdate(idx, { hsn_code_id: id, hsn_code: opt?.hsn_code ?? '', ...(id && !item.gst_pct ? { gst_pct: String(parseFloat(opt?.gst_percent ?? '0') / 2), sgst_pct: String(parseFloat(opt?.gst_percent ?? '0') / 2) } : {}) });
            }} hsnCodes={hsnOptions} placeholder="Select HSN code…" portalZIndex={10000} />
            {selectedHsn?.hsn_short_desc && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{selectedHsn.hsn_short_desc}</p>}
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Lot No" type="text"><input {...inp('lot_no')} placeholder="Optional" /></Field>
          <Field label="UOM" type="selection"><SearchableDropdown value={item.uom_id} onChange={v => onUpdate(idx, { uom_id: v })} options={HARDCODED_UOMS} placeholder="Select UOM…" portalZIndex={10000} /></Field>
          <Field label="Package Type" type="selection">
            <select value={item.package_type} onChange={e => onUpdate(idx, { package_type: e.target.value })} style={s.input}>
              <option value="">— Select —</option><option>Bag</option><option>Cone</option><option>Bale</option>
            </select>
          </Field>
        </div>

        <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 3, height: 14, background: '#7c3aed', borderRadius: 2, display: 'inline-block' }} />Construction / Package Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
            <Field label="No. of Pkgs" required type="number"><input type="number" {...inp('no_of_packages')} placeholder="0" min="0" /></Field>
            <Field label="Wt/Pkg (KGS)" type="number"><input type="number" {...inp('weight_per_package')} placeholder="0.000" min="0" step="0.001" /></Field>
            <Field label="Total Wt (KGS)" type="computed">
              <div style={{ padding: '8px 12px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#92400e', fontFamily: 'DM Mono,monospace', minHeight: 37, display: 'flex', alignItems: 'center' }}>{item.total_weight || '0.000'}</div>
            </Field>
            <Field label="Cone Wt (KGS)" type="number"><input type="number" {...inp('cone_weight')} placeholder="0.000" min="0" step="0.001" /></Field>
            <Field label="Cones/Bag" type="computed">
              <div style={{ padding: '8px 12px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#92400e', fontFamily: 'DM Mono,monospace', minHeight: 37, display: 'flex', alignItems: 'center' }}>{item.no_of_cone_per_bag || '—'}</div>
            </Field>
            <Field label="Rate (₹)" type="number"><input type="number" {...inp('rate')} placeholder="0.00" min="0" step="0.01" /></Field>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
          <Field label="Discount Type" type="lookup"><SearchableDropdown value={item.discount_type_id} onChange={v => onUpdate(idx, { discount_type_id: v })} options={discOpts} placeholder="Disc. Type…" portalZIndex={10000} /></Field>
          <Field label="Disc. %" type="number"><input type="number" {...inp('discount_pct')} placeholder="0.00" min="0" max="100" step="0.01" /></Field>
          <Field label="Basic Value" type="computed">
            <div style={{ padding: '8px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#c2410c', fontFamily: 'DM Mono,monospace', minHeight: 37, display: 'flex', alignItems: 'center' }}>₹{item.total_po_value || '0.00'}</div>
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, borderTop: '1px dashed #e2e8f0', paddingTop: 12 }}>
          <div>
            <label style={{ ...s.label, marginBottom: 6 }}>Delivery Instruction <FTypeBadge type="multiline" /></label>
            <textarea value={item.instructions} onChange={e => onUpdate(idx, { instructions: e.target.value })} rows={4} placeholder="AT SAME" style={{ ...s.input, resize: 'vertical', minHeight: 90, lineHeight: 1.6 }} />
          </div>
          <div style={{ minWidth: 320, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
            {selectedHsn?.gst_percent && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, padding: '6px 10px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 11, color: '#6d28d9' }}>
                <Info size={12} /><span>HSN <strong>{selectedHsn.hsn_code}</strong> master GST rate: </span><GstBadge pct={selectedHsn.gst_percent} />
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px 12px', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ ...s.label, margin: 0 }}>CGST</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="number" value={item.gst_pct} onChange={e => onUpdate(idx, { gst_pct: e.target.value })} style={{ ...s.input, width: 70, textAlign: 'right', padding: '6px 8px' }} placeholder="0" min="0" max="100" step="0.01" />
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>%</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', textAlign: 'right', fontFamily: 'DM Mono,monospace', minWidth: 72 }}>₹{((parseFloat(item.total_po_value) || 0) * (parseFloat(item.gst_pct) || 0) / 100).toFixed(2)}</span>
              <label style={{ ...s.label, margin: 0 }}>SGST</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="number" value={item.sgst_pct} onChange={e => onUpdate(idx, { sgst_pct: e.target.value })} style={{ ...s.input, width: 70, textAlign: 'right', padding: '6px 8px' }} placeholder="0" min="0" max="100" step="0.01" />
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>%</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', textAlign: 'right', fontFamily: 'DM Mono,monospace', minWidth: 72 }}>₹{((parseFloat(item.total_po_value) || 0) * (parseFloat(item.sgst_pct) || 0) / 100).toFixed(2)}</span>
              <label style={{ ...s.label, margin: 0 }}>IGST</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="number" value={item.igst_pct} onChange={e => onUpdate(idx, { igst_pct: e.target.value })} style={{ ...s.input, width: 70, textAlign: 'right', padding: '6px 8px' }} placeholder="0" min="0" max="100" step="0.01" />
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>%</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', textAlign: 'right', fontFamily: 'DM Mono,monospace', minWidth: 72 }}>₹{((parseFloat(item.total_po_value) || 0) * (parseFloat(item.igst_pct) || 0) / 100).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1.5px solid #e2e8f0', paddingTop: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>Net Value</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#166534', fontFamily: 'DM Mono,monospace' }}>₹{item.net_value || '0.00'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function YarnPurchaseOrderMaster() {
  const [orders, setOrders] = useState<YarnPO[]>([]);
  const [lookup, setLookup] = useState<LookupData>({ suppliers: [], agents: [], yarns: [], uoms: [], discountTypes: [], paymentTerms: [], companyAddresses: [], customerOrders: [], pwos: [], hsnCodes: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterSt, setFilterSt] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<YarnPO>(BLANK);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [sec, setSec] = useState({ basic: true, billing: true, mill: true, company: true, delivery: true });
  const [deleteTarget, setDeleteTarget] = useState<YarnPO | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const width = useWidth();
  const isMobile = width < 576;

  const loadLookup = async () => {
    try {
      const res = await fetch(`${API}/meta/lookup`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const companyAddresses = (data.companyAddresses ?? []).map((c: any) => ({ ...c, logo_url: resolveAssetUrl(c.logo_url) }));
      setLookup({
        ...data,
        hsnCodes: data.hsnCodes ?? [],
        companyAddresses,
      });
      // This used to fail silently — an empty companyAddresses array (e.g.
      // because the resolved company table had no active rows, or no such
      // table could be found at all on the server) just rendered an empty,
      // unlabeled dropdown with no indication anything was wrong. Now it's
      // surfaced immediately. Message is generic — it doesn't assume any
      // particular table name, since the backend auto-detects it.
      if (companyAddresses.length === 0) {
        pushToast('warning', 'No Companies Loaded', 'The "Company (Print Header)" list is empty — ask your admin to check the Company Details Master has active rows.');
      }
    } catch { pushToast('warning', 'Lookup Failed', 'Could not load master data.'); }
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ search, page: String(page), limit: String(pageSize), ...(filterSt ? { status: filterSt } : {}) });
      const res = await fetch(`${API}?${qs}`);
      const data = await res.json();
      setOrders(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch { pushToast('error', 'Load Failed', 'Could not fetch purchase orders.'); }
    setLoading(false);
  };

  useEffect(() => { loadLookup(); }, []);
  useEffect(() => { loadOrders(); }, [search, filterSt, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, filterSt]);
  useEffect(() => { document.body.style.overflow = showForm ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [showForm]);

  const fillSupplier = (id: string, prefix: 'sup' | 'bill' | 'mill') => {
    const sup = lookup.suppliers.find(s => String(s.id) === id);
    if (!sup) return {};
    return {
      [`${prefix}_address`]: safeStr(sup.address), [`${prefix}_pin_code`]: safeStr(sup.pin_code),
      [`${prefix}_district`]: safeStr(sup.district), [`${prefix}_state`]: safeStr(sup.state),
      [`${prefix}_country`]: safeStr(sup.country), [`${prefix}_gst_no`]: safeStr(sup.gst_no),
    };
  };
  const fillCompanyAddress = (id: string) => {
    const ca = lookup.companyAddresses.find(c => String(c.id) === id);
    if (!ca) return {};
    return { comp_address: safeStr(ca.address), comp_pin_code: safeStr(ca.pin_code), comp_district: safeStr(ca.district), comp_state: safeStr(ca.state), comp_country: safeStr(ca.country), comp_gst_no: safeStr(ca.gst_no) };
  };
  const handleSupplierChange = (id: string) => {
    const fills = fillSupplier(id, 'sup');
    const billFills = form.billing_same_as_supplier === 'Yes' ? fillSupplier(id, 'bill') : {};
    const millFills = form.mill_same_as_supplier === 'Yes' ? fillSupplier(id, 'mill') : {};
    setForm(f => ({ ...f, supplier_id: id, ...fills, ...billFills, ...millFills }));
  };
  const handleBillingSameChange = (val: string) => {
    const billFills = val === 'Yes' ? fillSupplier(form.supplier_id, 'bill') as Record<string, string> : {};
    setForm(f => ({ ...f, billing_same_as_supplier: val, billing_supplier_id: val === 'Yes' ? '' : f.billing_supplier_id, ...billFills }));
  };
  const handleMillSameChange = (val: string) => {
    const millFills = val === 'Yes' ? fillSupplier(form.supplier_id, 'mill') as Record<string, string> : {};
    setForm(f => ({ ...f, mill_same_as_supplier: val, mill_supplier_id: val === 'Yes' ? '' : f.mill_supplier_id, ...millFills }));
  };
  const handleBillingSupplierChange = (id: string) => setForm(f => ({ ...f, billing_supplier_id: id, ...fillSupplier(id, 'bill') }));
  const handleMillSupplierChange = (id: string) => setForm(f => ({ ...f, mill_supplier_id: id, ...fillSupplier(id, 'mill') }));

  const updateItem = (idx: number, updates: Partial<YarnPOItem>) => {
    setForm(f => {
      const items = [...f.items];
      const merged = { ...items[idx], ...updates };
      if (updates.yarn_id !== undefined) {
        const yarn = lookup.yarns.find(y => String(y.id) === updates.yarn_id);
        if (yarn) merged.count_for_po = yarn.actual_count ? String(yarn.actual_count) : yarn.count ? String(yarn.count) : (yarn.yarn_code || yarn.short_name || '');
        else merged.count_for_po = '';
        merged.hsn_code = safeStr(yarn?.hsn_code_value);
        merged.hsn_code_id = safeStr(yarn?.hsn_code_id);
      }
      if (updates.discount_type_id !== undefined) {
        const dt = lookup.discountTypes.find(d => String(d.id) === updates.discount_type_id);
        if (dt?.discount_pct) merged.discount_pct = safeStr(dt.discount_pct);
      }
      items[idx] = computeItem(merged);
      return { ...f, items };
    });
  };
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, BLANK_ITEM()] }));
  const removeItem = (idx: number) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const addCoLink = () => setForm(f => ({ ...f, co_links: [...f.co_links, BLANK_CO_LINK()] }));
  const removeCoLink = (idx: number) => setForm(f => ({ ...f, co_links: f.co_links.filter((_, i) => i !== idx) }));
  const updateCoLink = (idx: number, updates: Partial<CoLink>) => {
    setForm(f => {
      const links = [...f.co_links];
      const merged = { ...links[idx], ...updates };
      if (updates.co_id !== undefined) {
        const co = lookup.customerOrders.find(c => String(c.id) === updates.co_id);
        merged.co_no = safeStr(co?.co_no); merged.customer_name = safeStr(co?.customer_name); merged.pwo_ids = [];
      }
      links[idx] = merged;
      return { ...f, co_links: links };
    });
  };

  const grandPoValue = form.items.reduce((sum, it) => sum + (parseFloat(it.total_po_value) || 0), 0);
  const grandNetValue = form.items.reduce((sum, it) => sum + (parseFloat(it.net_value) || 0), 0);

  const openCreate = () => {
    setForm({ ...BLANK, items: [BLANK_ITEM()], co_links: [] });
    setEditId(null); setError(''); setActiveTab(0); setShowForm(true);
  };
  const openEdit = async (id: number) => {
    try {
      const res = await fetch(`${API}/${id}`);
      const data = await res.json();
      const sanitized = sanitizeForm(data);
      if (sanitized.items.length === 0) sanitized.items = [BLANK_ITEM()];
      setForm(sanitized); setEditId(id); setError(''); setActiveTab(0); setShowForm(true);
    } catch { pushToast('error', 'Load Failed', 'Could not load purchase order.'); }
  };

  const validateTab = (tabIdx: number): string => {
    if (tabIdx === 0) {
      if (!form.supplier_id) return 'Supplier is required.';
      if (!form.rec_date) return 'Record date is required.';
    }
    if (tabIdx === 1) {
      if (form.items.length === 0) return 'Add at least one yarn item.';
      if (form.items.some(it => !it.yarn_id)) return 'All yarn lines need a Count selected.';
      if (form.items.some(it => !it.no_of_packages || parseFloat(it.no_of_packages) <= 0)) return 'All yarn lines need a valid No. of Packages.';
    }
    return '';
  };
  const handleNext = () => {
    const err = validateTab(activeTab);
    if (err) { setError(err); return; }
    setError(''); setActiveTab(t => Math.min(t + 1, TOTAL_TABS - 1));
  };

  const handleSave = async () => {
    for (let i = 0; i < TOTAL_TABS - 1; i++) {
      const err = validateTab(i);
      if (err) { setError(err); setActiveTab(i); return; }
    }
    setError(''); setSaving(true);
    try {
      const res = await fetch(editId ? `${API}/${editId}` : API, {
        method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (!res.ok) { const errorText = await res.text(); throw new Error(errorText); }
      const saved = await res.json();
      if (editId) setOrders(p => p.map(o => o.id === editId ? saved : o));
      else { setOrders(p => [saved, ...p].slice(0, pageSize)); setTotal(p => p + 1); }
      pushToast('success', editId ? 'PO Updated' : 'PO Created', `${saved.rec_no ?? 'Order'} saved successfully.`);
      setShowForm(false);
    } catch (e: any) {
      const msg = e.message ?? 'Save failed';
      setError(msg); pushToast('error', 'Save Failed', msg);
    }
    setSaving(false);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget?.id) return;
    setDeleteConfirming(true);
    try {
      const res = await fetch(`${API}/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) { const t = await res.json().catch(() => ({})); throw new Error(t.message || 'Delete failed'); }
      setOrders(p => p.filter(o => o.id !== deleteTarget.id));
      setTotal(p => Math.max(0, p - 1));
      pushToast('success', 'PO Deleted', 'Purchase order removed.');
      setDeleteTarget(null);
    } catch (e: any) { pushToast('error', 'Delete Failed', e.message ?? 'Could not delete purchase order.'); }
    setDeleteConfirming(false);
  };

  // ── Export helpers ────────────────────────────────────────────────────────
  const exportRow = (o: YarnPO) => {
    const poVal = o.items?.reduce((sum, it) => sum + (parseFloat(it.total_po_value) || 0), 0) ?? 0;
    const netVal = o.items?.reduce((sum, it) => sum + (parseFloat(it.net_value) || 0), 0) ?? 0;
    return {
      'PO No': o.rec_no ?? '', 'Date': toDateInput(o.rec_date) || '', 'Supplier': (o as any).supplier_name ?? '',
      'Order Through': o.order_through ?? '', 'Rate Type': o.rate_type ?? '', 'PO Value': poVal.toFixed(2),
      'Net Value': netVal.toFixed(2), 'Status': o.status ?? 'Draft',
    };
  };
  const downloadBlob = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const handleExportCSV = () => {
    if (orders.length === 0) { pushToast('warning', 'Nothing to Export', 'No purchase orders on this page.'); return; }
    const rows = orders.map(exportRow);
    const headers = Object.keys(rows[0]);
    const escape = (v: any) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape((r as any)[h])).join(','))].join('\n');
    downloadBlob(csv, `yarn-purchase-orders-${Date.now()}.csv`, 'text/csv;charset=utf-8;');
    pushToast('success', 'CSV Exported', `${rows.length} record(s) downloaded.`);
  };
  const handleExportExcel = () => {
    if (orders.length === 0) { pushToast('warning', 'Nothing to Export', 'No purchase orders on this page.'); return; }
    const rows = orders.map(exportRow);
    const headers = Object.keys(rows[0]);
    const head = headers.map(h => `<th style="background:#7c3aed;color:#fff;padding:6px 10px;border:1px solid #ddd;">${h}</th>`).join('');
    const body = rows.map(r => `<tr>${headers.map(h => `<td style="padding:6px 10px;border:1px solid #ddd;">${(r as any)[h]}</td>`).join('')}</tr>`).join('');
    const html = `<html><head><meta charset="UTF-8" /></head><body><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
    downloadBlob(html, `yarn-purchase-orders-${Date.now()}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
    pushToast('success', 'Excel Exported', `${rows.length} record(s) downloaded.`);
  };
  const handlePrintTable = () => {
    if (orders.length === 0) { pushToast('warning', 'Nothing to Print', 'No purchase orders on this page.'); return; }
    const rows = orders.map(exportRow);
    const headers = Object.keys(rows[0]);
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { pushToast('error', 'Print Failed', 'Popup blocked — allow popups to print.'); return; }
    const head = headers.map(h => `<th>${h}</th>`).join('');
    const body = rows.map(r => `<tr>${headers.map(h => `<td>${(r as any)[h]}</td>`).join('')}</tr>`).join('');
    win.document.write(`<html><head><title>Yarn Purchase Orders</title><style>
      body{font-family:'DM Sans',Arial,sans-serif;padding:24px;color:#1e293b}h2{margin:0 0 4px}p{margin:0 0 16px;color:#64748b;font-size:12px}
      table{width:100%;border-collapse:collapse;font-size:12px}th{background:#7c3aed;color:#fff;padding:8px 10px;text-align:left}
      td{padding:7px 10px;border-bottom:1px solid #e2e8f0}tr:nth-child(even) td{background:#faf5ff}</style></head>
      <body><h2>Yarn Purchase Orders</h2><p>Generated on ${new Date().toLocaleString()}</p>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); }, 300);
  };

  // ── professional letterhead print for a single PO ───────────────────
  const handlePrintPO = async (poInput: YarnPO) => {
    const win = window.open('', '_blank', 'width=1050,height=800');
    if (!win) { pushToast('error', 'Popup Blocked', 'Please allow popups to print this Purchase Order.'); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>Purchase Order</title></head>
      <body style="font-family:'Times New Roman',Times,serif;padding:60px;text-align:center;color:#64748b;">Loading Purchase Order…</body></html>`);
    win.document.close();

    let po = poInput;
    if (poInput.id) {
      try {
        const res = await fetch(`${API}/${poInput.id}`);
        const data = await res.json();
        po = sanitizeForm(data);
      } catch { pushToast('warning', 'Using Cached Data', 'Could not refresh — printing with data currently on screen.'); }
    }

    const company = lookup.companyAddresses.find(c => String(c.id) === String(po.company_address_id)) || null;
    const companyName = company?.company_name || po.comp_address ? (company?.company_name || 'Your Company Name') : 'Your Company Name';
    const logoMarkup = company?.logo_url
      ? `<img class="logo-img" src="${company.logo_url}" onerror="this.outerHTML='<div class=&quot;logo-img&quot; style=&quot;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:9px;&quot;>No Logo</div>'" />`
      : `<div class="logo-img" style="display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:9px;">No Logo</div>`;

    const items = po.items ?? [];
    const subTotal = items.reduce((s, it) => s + (parseFloat(it.total_po_value) || 0), 0);
    const netTotal = items.reduce((s, it) => s + (parseFloat(it.net_value) || 0), 0);
    const advance = parseFloat(po.advance) || 0;
    const balance = +(netTotal - advance).toFixed(2);

    const itemRows = items.map((it, i) => {
      const taxable = parseFloat(it.total_po_value) || 0;
      const gstAmt = (parseFloat(it.net_value) || 0) - taxable;
      const gstPct = (parseFloat(it.gst_pct) || 0) + (parseFloat(it.sgst_pct) || 0) + (parseFloat(it.igst_pct) || 0);
      return `<tr>
        <td class="c">${i + 1}</td>
        <td>${it.count_for_po || '—'}${it.lot_no ? ` <span style="color:#64748b;">(Lot ${it.lot_no})</span>` : ''}</td>
        <td>${it.hsn_code || '—'}</td>
        <td class="r">${fmtN(parseFloat(it.no_of_packages) || 0)}</td>
        <td class="r">${fmtN(parseFloat(it.total_weight) || 0)} kg</td>
        <td class="r">₹${fmtN(parseFloat(it.rate) || 0)}</td>
        <td class="r">₹${fmtN(taxable)}</td>
        <td class="r">₹${fmtN(gstAmt)}${gstPct ? ` (${gstPct}%)` : ''}</td>
        <td class="r"><strong>₹${fmtN(parseFloat(it.net_value) || 0)}</strong></td>
      </tr>`;
    }).join('');

    const hsnGroups: Record<string, { taxable: number; cgst: number; sgst: number; igst: number }> = {};
    items.forEach(it => {
      const key = it.hsn_code || '—';
      const taxable = parseFloat(it.total_po_value) || 0;
      if (!hsnGroups[key]) hsnGroups[key] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      hsnGroups[key].taxable += taxable;
      hsnGroups[key].cgst += taxable * (parseFloat(it.gst_pct) || 0) / 100;
      hsnGroups[key].sgst += taxable * (parseFloat(it.sgst_pct) || 0) / 100;
      hsnGroups[key].igst += taxable * (parseFloat(it.igst_pct) || 0) / 100;
    });
    const hsnRows = Object.entries(hsnGroups).map(([hsn, g]) => `
      <tr><td>${hsn}</td><td class="r">₹${fmtN(g.taxable)}</td>
        <td class="r">₹${fmtN(g.cgst)}</td><td class="r">₹${fmtN(g.sgst)}</td><td class="r">₹${fmtN(g.igst)}</td>
        <td class="r">₹${fmtN(g.cgst + g.sgst + g.igst)}</td></tr>`).join('');

    const supplierName = (po as any).supplier_name || lookup.suppliers.find(s => String(s.id) === po.supplier_id)?.supplier_name || '—';

    win.document.open();
    win.document.write(`<!DOCTYPE html><html><head><title>Yarn Purchase Order — ${po.rec_no}</title>
      <style>
        * { box-sizing:border-box; }
        body { font-family:'Times New Roman',Times,serif; font-size:12.5px; color:#1e293b; margin:24px; }
        .po-topbar { height:6px; background:linear-gradient(90deg,#5b21b6,#7c3aed 55%,#0f766e); border-radius:4px; margin-bottom:16px; }
        .po-title-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
        .po-title { font-size:20px; font-weight:800; letter-spacing:.02em; color:#3b0764; }
        .po-copy-tag { font-size:10.5px; font-weight:700; color:#7c3aed; border:1px solid #c4b5fd; background:#faf5ff; border-radius:20px; padding:3px 12px; text-transform:uppercase; letter-spacing:.05em; }
        table.po-outer { width:100%; table-layout:fixed; border-collapse:collapse; border:1.4px solid #334155; }
        table.po-outer td { border:1px solid #334155; padding:11px 13px; vertical-align:top; word-wrap:break-word; }
        .logo-row { display:flex; gap:14px; align-items:flex-start; }
        .logo-img { width:64px; height:64px; object-fit:contain; flex-shrink:0; border-radius:6px; border:1px solid #e2e8f0; background:#fff; padding:3px; }
        .co-name { font-size:17px; font-weight:800; margin-bottom:3px; }
        .co-line { font-size:11.5px; line-height:1.65; color:#334155; white-space:pre-line; }
        table.meta-grid { width:100%; height:100%; table-layout:fixed; border-collapse:collapse; }
        table.meta-grid td { border:1px solid #334155; padding:8px 11px; font-size:11.5px; vertical-align:middle; width:50%; color:#475569; }
        table.meta-grid .val { display:block; font-weight:700; margin-top:2px; font-size:13px; color:#1e293b; }
        .section-title { font-weight:800; font-size:10.5px; margin-bottom:5px; color:#5b21b6; text-transform:uppercase; letter-spacing:.06em; }
        table.items { width:100%; border-collapse:collapse; }
        table.items th, table.items td { border:1px solid #334155; padding:7px 9px; font-size:11.5px; }
        table.items th { background:#5b21b6; color:#fff; text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.03em; }
        table.items td.c, table.items th.c { text-align:center; }
        table.items td.r, table.items th.r { text-align:right; }
        table.items tbody tr:nth-child(even) td { background:#faf5ff; }
        table.totals-box { width:100%; border-collapse:collapse; }
        table.totals-box td { border:none; padding:4px 4px; font-size:12.5px; }
        table.totals-box .lbl { color:#475569; }
        table.totals-box .val { text-align:right; font-weight:700; }
        table.totals-box .grand td { border-top:2px solid #334155; padding-top:8px; font-size:14px; font-weight:800; color:#3b0764; }
        table.hsn-summary { width:100%; border-collapse:collapse; }
        table.hsn-summary th, table.hsn-summary td { border:1px solid #334155; padding:6px 9px; font-size:11.5px; }
        table.hsn-summary th { background:#0f766e; color:#fff; text-align:center; text-transform:uppercase; letter-spacing:.03em; font-size:10px; }
        table.hsn-summary td.r { text-align:right; }
        .sign-block { text-align:center; }
        .sign-space { height:56px; }
        .terms { font-size:11px; line-height:1.75; color:#334155; }
        .po-footer-note { text-align:center; font-size:10px; color:#94a3b8; margin-top:14px; font-style:italic; }
        @media print { body { margin:10px; } .po-topbar { -webkit-print-color-adjust:exact; print-color-adjust:exact; } table.items th, table.hsn-summary th { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
      </style></head><body>

      <div class="po-topbar"></div>
      <div class="po-title-row"><div class="po-title">Yarn Purchase Order</div><div class="po-copy-tag">Original</div></div>

      <table class="po-outer">
        <tr>
          <td style="width:56%;">
            <div class="logo-row">
              ${logoMarkup}
              <div>
                <div class="co-name">${companyName}</div>
                ${po.comp_address ? `<div class="co-line">${[po.comp_address, po.comp_district, po.comp_state, po.comp_pin_code].filter(Boolean).join(', ')}</div>` : ''}
                ${po.comp_gst_no ? `<div class="co-line">GSTIN: ${po.comp_gst_no}</div>` : ''}
                ${company?.phone ? `<div class="co-line">Phone: ${company.phone}</div>` : ''}
                ${company?.email ? `<div class="co-line">Email: ${company.email}</div>` : ''}
                ${company?.cin_no ? `<div class="co-line">CIN: ${company.cin_no}</div>` : ''}
              </div>
            </div>
          </td>
          <td style="padding:0;">
            <table class="meta-grid">
              <tr>
                <td>Order No.<span class="val">${po.rec_no || '—'}</span></td>
                <td>Date<span class="val">${fmtDate(po.rec_date) || '—'}</span></td>
              </tr>
              <tr><td colspan="2">Due Date<span class="val">${fmtDate(po.due_date || po.exp_delivery) || '—'}</span></td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="width:50%;">
            <div class="section-title">Supplier</div>
            <div class="co-line"><strong>${supplierName}</strong>${po.sup_address ? `\n${[po.sup_address, po.sup_district, po.sup_state, po.sup_pin_code].filter(Boolean).join(', ')}` : ''}${po.sup_gst_no ? `\nGSTIN: ${po.sup_gst_no}` : ''}</div>
          </td>
          <td style="width:50%;">
            <div class="section-title">Ship From (Mill)</div>
            <div class="co-line">${po.mill_address ? [po.mill_address, po.mill_district, po.mill_state, po.mill_pin_code].filter(Boolean).join(', ') : (po.mill_same_as_supplier === 'Yes' ? supplierName : '—')}</div>
          </td>
        </tr>
      </table>

      <table class="items" style="margin-top:14px;">
        <thead><tr>
          <th class="c" style="width:26px;">#</th><th>Count / Lot</th><th style="width:80px;">HSN</th>
          <th class="r" style="width:60px;">Pkgs</th><th class="r" style="width:80px;">Weight</th>
          <th class="r" style="width:80px;">Rate</th><th class="r" style="width:90px;">Taxable</th>
          <th class="r" style="width:110px;">GST</th><th class="r" style="width:110px;">Amount</th>
        </tr></thead>
        <tbody>
          ${itemRows}
          <tr>
            <td colspan="3" class="r" style="font-weight:700;">Total</td>
            <td class="r" style="font-weight:700;">${fmtN(items.reduce((s, i) => s + (parseFloat(i.no_of_packages) || 0), 0))}</td>
            <td class="r" style="font-weight:700;">${fmtN(items.reduce((s, i) => s + (parseFloat(i.total_weight) || 0), 0))} kg</td>
            <td></td>
            <td class="r" style="font-weight:700;">₹${fmtN(subTotal)}</td><td></td>
            <td class="r" style="font-weight:800;">₹${fmtN(netTotal)}</td>
          </tr>
        </tbody>
      </table>

      <table class="po-outer" style="margin-top:14px;">
        <tr>
          <td style="width:58%;">
            <div class="section-title">Order Amount in Words</div>
            <div style="font-weight:700; font-size:12.5px; margin-bottom:10px;">${amountInWords(netTotal)}</div>
            ${po.description ? `<div class="section-title">Description</div><div class="co-line" style="margin-bottom:8px;">${po.description}</div>` : ''}
            ${po.place_of_supply ? `<div class="section-title">Place of Supply</div><div class="co-line">${po.place_of_supply}</div>` : ''}
          </td>
          <td>
            <div class="section-title" style="margin-bottom:6px;">Amounts</div>
            <table class="totals-box">
              <tr><td class="lbl">Sub Total</td><td class="val">₹${fmtN(subTotal)}</td></tr>
              <tr class="grand"><td class="lbl">Total</td><td class="val">₹${fmtN(netTotal)}</td></tr>
              <tr><td class="lbl">Advance</td><td class="val">₹${fmtN(advance)}</td></tr>
              <tr><td class="lbl">Balance</td><td class="val">₹${fmtN(balance)}</td></tr>
            </table>
          </td>
        </tr>
      </table>

      <table class="hsn-summary" style="margin-top:14px;">
        <thead><tr><th>HSN</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total Tax</th></tr></thead>
        <tbody>
          ${hsnRows}
          <tr>
            <td style="font-weight:700;">Total</td>
            <td class="r" style="font-weight:700;">₹${fmtN(subTotal)}</td>
            <td class="r" style="font-weight:700;">₹${fmtN(Object.values(hsnGroups).reduce((s, g) => s + g.cgst, 0))}</td>
            <td class="r" style="font-weight:700;">₹${fmtN(Object.values(hsnGroups).reduce((s, g) => s + g.sgst, 0))}</td>
            <td class="r" style="font-weight:700;">₹${fmtN(Object.values(hsnGroups).reduce((s, g) => s + g.igst, 0))}</td>
            <td class="r" style="font-weight:700;">₹${fmtN(netTotal - subTotal)}</td>
          </tr>
        </tbody>
      </table>

      <table class="po-outer" style="margin-top:14px;">
        <tr>
          <td style="width:58%;">
            <div class="section-title">Terms and conditions</div>
            <div class="terms">
              1. Payment through Cheque/ NEFT/RTGS only.<br/>
              2. Goods once accepted cannot be returned without prior approval.<br/>
              3. Freight terms: ${po.transport_freight_terms || '—'}.<br/>
              4. All disputes subject to ${po.comp_state ? po.comp_state + ' ' : ''}Jurisdiction.
            </div>
          </td>
          <td class="sign-block">
            <div style="font-weight:700; font-size:12.5px;">For: ${companyName}</div>
            <div class="sign-space"></div>
            <div style="font-weight:700; font-size:12px;">Authorized Signatory</div>
          </td>
        </tr>
      </table>

      <div class="po-footer-note">This is a system-generated Purchase Order and does not require a physical signature to be valid.</div>
      <script>window.onload=()=>{window.print()}</script>
    </body></html>`);
    win.document.close(); win.focus();
  };

  const toggle = (k: keyof typeof sec) => setSec(p => ({ ...p, [k]: !p[k] }));
  const set = (k: keyof YarnPO, v: any) => setForm(f => ({ ...f, [k]: v === null || v === undefined ? '' : v }));

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const goTo = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  const supOpts: SDOption[] = lookup.suppliers.map(s => ({ value: String(s.id), label: s.supplier_name, sub: s.state }));
  const agentOpts: SDOption[] = lookup.agents.map(a => ({ value: String(a.id), label: a.agent_name }));
  const payOpts: SDOption[] = lookup.paymentTerms.map(p => ({ value: String(p.id), label: `${p.payment_term_name} (${p.payment_term_days} days)` }));
  const yarnOpts: SDOption[] = lookup.yarns.map(y => ({ value: String(y.id), label: yarnCountLabel(y), sub: [y.yarn_code, y.count_type, y.category].filter(Boolean).join(' · ') || y.short_name }));
  const hsnOptions: HsnOption[] = lookup.hsnCodes;
  const discOpts: SDOption[] = lookup.discountTypes.map(d => ({ value: String(d.id), label: d.discount_type_name, sub: d.discount_pct ? `Default: ${d.discount_pct}%` : undefined }));
  const coOpts: SDOption[] = lookup.customerOrders.map(c => ({ value: String(c.id), label: c.co_no, sub: c.customer_name }));
  const selectedCompany = lookup.companyAddresses.find(c => String(c.id) === form.company_address_id) ?? null;

  const isLastTab = activeTab === TOTAL_TABS - 1;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
        @keyframes ddSlide { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }

        .ypo-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }
        .ypo-page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
        .ypo-page-header h1 { margin:0; font-size:20px; font-weight:800; color:#1e293b; }
        .ypo-page-header p  { margin:3px 0 0; font-size:13px; color:#64748b; }
        .ypo-header-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .ypo-add-btn { display:flex; align-items:center; gap:6px; background:#7c3aed; color:#fff; border:none; border-radius:9px; padding:9px 18px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(124,58,237,0.35); white-space:nowrap; }
        .ypo-add-btn:hover { background:#6d28d9; }
        .ypo-export-btn { display:flex; align-items:center; gap:6px; background:#fff; color:#7c3aed; border:1.5px solid #ddd6fe; border-radius:9px; padding:9px 14px; font-size:13px; font-weight:700; cursor:pointer; white-space:nowrap; }
        .ypo-export-btn:hover { background:#faf5ff; border-color:#c4b5fd; }
        .ypo-export-btn:disabled { opacity:.5; cursor:not-allowed; }
        .ypo-export-menu { position:absolute; top:calc(100% + 6px); right:0; min-width:200px; background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,0.16); z-index:600; overflow:hidden; }
        .ypo-export-menu-label { padding:8px 14px; font-size:10px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:.06em; background:#f8fafc; border-bottom:1px solid #f1f5f9; }
        .ypo-export-item { display:flex; align-items:center; gap:10px; width:100%; padding:9px 14px; background:none; border:none; cursor:pointer; font-size:13px; color:#374151; text-align:left; }
        .ypo-export-item:hover { background:#f8fafc; }
        .ypo-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .ypo-search-wrap { position:relative; flex:1; min-width:180px; max-width:320px; }
        .ypo-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); }
        .ypo-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; outline:none; }
        .ypo-search:focus { border-color:#7c3aed; }
        .ypo-filter-sel { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13px; background:#fff; cursor:pointer; outline:none; }
        .ypo-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; }
        .ypo-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; cursor:pointer; outline:none; }
        .ypo-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:24px; }
        .ypo-table-wrap { overflow-x:auto; }
        .ypo-table { width:100%; border-collapse:collapse; font-size:13px; min-width:600px; }
        .ypo-table thead tr { background:#7c3aed; }
        .ypo-table th { padding:11px 12px; color:#fff; font-weight:700; text-align:left; font-size:12px; white-space:nowrap; }
        .ypo-table tbody tr:nth-child(odd) td { background:#fff; }
        .ypo-table tbody tr:nth-child(even) td { background:#faf5ff; }
        .ypo-table tbody tr:hover td { background:#f3f0ff; }
        .ypo-table td { padding:10px 12px; color:#374151; font-size:12px; white-space:nowrap; }
        .ypo-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }
        .ypo-chip { display:inline-block; padding:2px 9px; border-radius:20px; font-size:11px; font-weight:700; }
        .ypo-chip-draft { background:#f3f4f6; color:#374151; }
        .ypo-chip-approved { background:#dcfce7; color:#166534; }
        .ypo-chip-pendingapproval { background:#fef3c7; color:#b45309; }
        .ypo-chip-cancelled { background:#fee2e2; color:#991b1b; }
        .ypo-rec-id { font-family:'DM Mono',monospace; font-size:11px; font-weight:600; color:#6d28d9; background:#faf5ff; border:1px solid #ddd6fe; border-radius:6px; padding:2px 7px; }
        .ypo-row-menu-btn { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border:1px solid #e2e8f0; background:#fff; border-radius:7px; cursor:pointer; color:#64748b; }
        .ypo-row-menu-btn:hover { background:#faf5ff; border-color:#c4b5fd; color:#7c3aed; }
        .ypo-row-menu-panel { background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 10px 30px rgba(15,23,42,.16); overflow:hidden; animation:ddSlide .12s ease; padding:4px; }
        .ypo-row-menu-item { display:flex; align-items:center; gap:9px; width:100%; padding:9px 11px; border:none; background:transparent; border-radius:7px; cursor:pointer; font-size:12.5px; font-weight:600; color:#374151; text-align:left; }
        .ypo-row-menu-item:hover { background:#f8fafc; }
        .ypo-row-menu-item--danger { color:#dc2626; }
        .ypo-row-menu-item--danger:hover { background:#fef2f2; }
        .ypo-row-menu-divider { height:1px; background:#f1f5f9; margin:3px 4px; }
        .ypo-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-top:1px solid #f1f5f9; background:#faf5ff; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; }
        .ypo-pag-btns { display:flex; gap:4px; align-items:center; }
        .ypo-pag-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; }
        .ypo-pag-btn:hover:not(:disabled) { background:#f1f5f9; }
        .ypo-pag-btn.active { background:#7c3aed; color:#fff; border-color:#7c3aed; font-weight:700; }
        .ypo-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }
        .ypo-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.55); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:16px 8px; }
        .ypo-modal { background:#fff; border-radius:14px; width:100%; max-width:980px; box-shadow:0 8px 40px rgba(0,0,0,0.22); display:flex; flex-direction:column; max-height:calc(100vh - 32px); }
        .ypo-modal-header { display:flex; justify-content:space-between; align-items:center; padding:14px 20px; background:linear-gradient(135deg,#7c3aed,#5b21b6); border-radius:14px 14px 0 0; flex-shrink:0; }
        .ypo-modal-body { padding:0; overflow-y:auto; flex:1; }
        .ypo-modal-footer { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:12px 20px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 14px 14px; }
        .ypo-tabs { display:flex; gap:0; border-bottom:2px solid #e2e8f0; background:#fafbfc; padding:0 20px; flex-shrink:0; overflow-x:auto; }
        .ypo-tab { padding:12px 20px; font-size:13px; font-weight:600; cursor:pointer; border:none; background:none; color:#64748b; border-bottom:3px solid transparent; margin-bottom:-2px; white-space:nowrap; }
        .ypo-tab.active { color:#7c3aed; border-bottom-color:#7c3aed; }
        .ypo-tab-body { padding:16px 20px; }
        .ypo-grid { display:grid; grid-template-columns:1fr; gap:12px; }
        @media(min-width:480px) { .ypo-grid { grid-template-columns:repeat(2,1fr); gap:14px; } }
        @media(min-width:768px) { .ypo-grid { grid-template-columns:repeat(3,1fr); gap:14px 16px; } }
        .ypo-col-full { grid-column:1 / -1; }
        .ypo-btn-cancel { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; }
        .ypo-btn-next { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#7c3aed; color:#fff; border-radius:9px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(124,58,237,.3); }
        .ypo-btn-next:hover { background:#6d28d9; }
        .ypo-btn-prev { display:flex; align-items:center; gap:5px; background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:9px 16px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; }
        .ypo-btn-prev:hover { background:#e2e8f0; }
        .ypo-btn-save { display:flex; align-items:center; gap:6px; padding:9px 24px; border:none; background:#16a34a; color:#fff; border-radius:9px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(22,163,74,.3); }
        .ypo-btn-save:disabled { opacity:.7; cursor:not-allowed; }
        .ypo-btn-save:hover:not(:disabled) { background:#15803d; }
        input:focus, select:focus, textarea:focus { outline:none; border-color:#7c3aed !important; box-shadow:0 0 0 3px rgba(124,58,237,0.1) !important; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
        .ypo-grand-total { display:flex; justify-content:flex-end; gap:24px; align-items:center; padding:12px 4px; border-top:2px solid #e2e8f0; margin-top:4px; flex-wrap:wrap; }
        .ypo-grand-total-item { display:flex; flex-direction:column; align-items:flex-end; gap:2px; }
        .ypo-grand-total-item span { font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:.04em; }
        .ypo-grand-total-item strong { font-size:15px; font-weight:800; }
        .ypo-add-row-btn { display:flex; align-items:center; gap:5px; background:#faf5ff; color:#7c3aed; border:1px solid #ddd6fe; padding:7px 14px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; }
        .ypo-add-row-btn:hover { background:#ede9fe; }
        .ypo-same-bar { display:flex; align-items:center; gap:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 14px; margin-top:10px; }
        .ypo-toggle { position:relative; width:40px; height:22px; flex-shrink:0; }
        .ypo-toggle input { opacity:0; width:0; height:0; position:absolute; }
        .ypo-toggle-slider { position:absolute; cursor:pointer; inset:0; background:#cbd5e1; border-radius:22px; transition:.3s; }
        .ypo-toggle-slider::before { content:''; position:absolute; width:16px; height:16px; left:3px; top:3px; background:#fff; border-radius:50%; transition:.3s; }
        .ypo-toggle input:checked + .ypo-toggle-slider { background:#7c3aed; }
        .ypo-toggle input:checked + .ypo-toggle-slider::before { transform:translateX(18px); }
        .ypo-co-table { width:100%; border-collapse:collapse; font-size:12px; margin-top:10px; }
        .ypo-co-table th { background:#f8fafc; border:1px solid #e2e8f0; padding:8px 10px; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; }
        .ypo-co-table td { border:1px solid #e2e8f0; padding:8px; vertical-align:top; }
        .ypo-info-box { display:flex; align-items:flex-start; gap:8px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; font-size:12px; color:#1e40af; margin-top:6px; }
        .ypo-confirm-overlay { position:fixed; inset:0; z-index:3000; background:rgba(15,23,42,.55); display:flex; align-items:center; justify-content:center; padding:16px; }
        .ypo-confirm-box { background:#fff; border-radius:14px; box-shadow:0 8px 40px rgba(0,0,0,.22); padding:28px 24px; max-width:400px; width:100%; text-align:center; }
      `}</style>

      <div className="ypo-wrap">
        <div className="ypo-page-header">
          <div><h1>Yarn Purchase Order</h1><p>{total} order{total !== 1 ? 's' : ''} recorded</p></div>
          <div className="ypo-header-actions">
            <ExportMenu onExportCSV={handleExportCSV} onExportExcel={handleExportExcel} onPrint={handlePrintTable} disabled={loading || orders.length === 0} />
            <button className="ypo-add-btn" onClick={openCreate}><Plus size={15} /> New Purchase Order</button>
          </div>
        </div>

        <div className="ypo-toolbar">
          <div className="ypo-search-wrap">
            <Search size={14} color="#94a3b8" />
            <input className="ypo-search" placeholder="Search PO No, supplier…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="ypo-filter-sel" value={filterSt} onChange={e => setFilterSt(e.target.value)}>
            <option value="">All Status</option><option>Draft</option><option>Pending Approval</option><option>Approved</option><option>Cancelled</option>
          </select>
          <div className="ypo-page-size">
            {!isMobile && <span>Show</span>}
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>

        <div className="ypo-card">
          <div className="ypo-table-wrap">
            <table className="ypo-table">
              <thead>
                <tr>
                  <th>#</th><th>PO No</th><th>Date</th><th>Supplier</th>
                  {!isMobile && <th>Order Through</th>}
                  {width >= 768 && <th>Rate Type</th>}
                  <th>PO Value</th><th>Net Value</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="ypo-empty"><Loader2 size={22} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} /></td></tr>
                ) : orders.length === 0 ? (
                  <tr><td colSpan={10} className="ypo-empty">{search || filterSt ? 'No orders match your search.' : 'No purchase orders yet. Click "New Purchase Order" to create one.'}</td></tr>
                ) : orders.map((o, i) => {
                  const statusKey = (o.status ?? 'draft').toLowerCase().replace(/\s+/g, '');
                  const chipCls = `ypo-chip ypo-chip-${statusKey}`;
                  const poVal = o.items?.reduce((s, it) => s + (parseFloat(it.total_po_value) || 0), 0) ?? 0;
                  const netVal = o.items?.reduce((s, it) => s + (parseFloat(it.net_value) || 0), 0) ?? 0;
                  return (
                    <tr key={o.id}>
                      <td style={{ color: '#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                      <td><span className="ypo-rec-id">{o.rec_no ?? '—'}</span></td>
                      <td>{toDateInput(o.rec_date) || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{(o as any).supplier_name ?? '—'}</td>
                      {!isMobile && <td>{o.order_through ?? '—'}</td>}
                      {width >= 768 && <td>{o.rate_type ?? '—'}</td>}
                      <td style={{ fontWeight: 700, color: '#c2410c', fontFamily: 'DM Mono,monospace', fontSize: 11 }}>₹{poVal.toFixed(2)}</td>
                      <td style={{ fontWeight: 700, color: '#166534', fontFamily: 'DM Mono,monospace', fontSize: 11 }}>₹{netVal.toFixed(2)}</td>
                      <td><span className={chipCls}>{o.status ?? 'Draft'}</span></td>
                      <td>
                        <RowActionsMenu
                          onEdit={() => openEdit(o.id!)}
                          onPrint={() => handlePrintPO(o)}
                          onDelete={() => setDeleteTarget(o)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!loading && total > 0 && (
            <div className="ypo-pagination">
              <span>Page {page} of {totalPages} — {total} record(s)</span>
              <div className="ypo-pag-btns">
                <button className="ypo-pag-btn" onClick={() => goTo(1)} disabled={page === 1}>«</button>
                <button className="ypo-pag-btn" onClick={() => goTo(page - 1)} disabled={page === 1}>‹</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, k) => { const start = Math.max(1, Math.min(page - 2, totalPages - 4)); return start + k; }).filter(p => p >= 1 && p <= totalPages).map(p => (
                  <button key={p} className={`ypo-pag-btn${p === page ? ' active' : ''}`} onClick={() => goTo(p)}>{p}</button>
                ))}
                <button className="ypo-pag-btn" onClick={() => goTo(page + 1)} disabled={page === totalPages}>›</button>
                <button className="ypo-pag-btn" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {showForm && (
          <div className="ypo-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="ypo-modal">
              <div className="ypo-modal-header">
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff' }}>{editId ? '✏️ Edit Purchase Order' : '➕ New Yarn Purchase Order'}</h2>
                  {editId && form.rec_no && <span style={{ fontSize: 11, color: '#ddd6fe', fontFamily: 'DM Mono,monospace' }}>{form.rec_no}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {editId && (
                    <button onClick={() => handlePrintPO(form)}
                      style={{ background: 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.4)', color: '#fff', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Printer size={13} /> Print
                    </button>
                  )}
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setShowForm(false)}><X size={22} color="#fff" /></button>
                </div>
              </div>

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', padding: '10px 20px', fontSize: 13 }}>
                  <AlertCircle size={15} />{error}
                  <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><X size={14} /></button>
                </div>
              )}

              <div className="ypo-tabs">
                {TAB_LABELS.map((tab, i) => <button key={i} className={`ypo-tab${activeTab === i ? ' active' : ''}`} onClick={() => setActiveTab(i)}>{tab}</button>)}
              </div>

              <div className="ypo-modal-body">
                {activeTab === 0 && (
                  <div className="ypo-tab-body">
                    <div className="ypo-grid" style={{ marginBottom: 4 }}>
                      <Field label="Rec No" type="text"><input value={form.rec_no ?? 'Auto-generated'} disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                      <Field label="Rec Date" required type="date"><input type="date" value={toDateInput(form.rec_date)} onChange={e => set('rec_date', e.target.value)} style={s.input} /></Field>
                      <Field label="Status" type="selection">
                        <select value={form.status} onChange={e => set('status', e.target.value)} style={s.input}>
                          <option>Draft</option><option>Pending Approval</option><option>Approved</option><option>Cancelled</option>
                        </select>
                      </Field>
                    </div>

                    <SectionHead title="Supplier" open={sec.basic} onToggle={() => toggle('basic')} />
                    {sec.basic && (
                      <div style={{ marginTop: 12 }}>
                        <div className="ypo-grid">
                          <div className="ypo-col-full">
                            <Field label="Supplier Name" required type="lookup">
                              <SearchableDropdown value={form.supplier_id} onChange={handleSupplierChange} options={supOpts} placeholder="Select supplier…" portalZIndex={9500} />
                            </Field>
                          </div>
                        </div>
                        <div className="ypo-grid" style={{ marginTop: 14 }}>
                          <Field label="Order Through" type="selection">
                            <select value={form.order_through} onChange={e => set('order_through', e.target.value)} style={s.input}><option>Direct</option><option>Agent</option></select>
                          </Field>
                          <Field label="Rate Type" type="selection">
                            <select value={form.rate_type} onChange={e => set('rate_type', e.target.value)} style={s.input}><option>Net rate</option><option>Ex-mill</option></select>
                          </Field>
                        </div>
                        <div className="ypo-grid" style={{ marginTop: 14 }}>
                          <Field label="Agent" type="lookup">
                            <SearchableDropdown value={form.agent_id} onChange={v => { set('agent_id', v); const a = lookup.agents.find(ag => String(ag.id) === v); if (a?.commission_pct) set('commission_pct', safeStr(a.commission_pct)); }} options={agentOpts} placeholder="Select agent… (if applicable)" portalZIndex={9500} />
                          </Field>
                          <Field label="Commission %" type="number"><input type="number" value={form.commission_pct} onChange={e => set('commission_pct', e.target.value)} style={s.input} placeholder="0.00" step="0.01" min="0" max="100" /></Field>
                        </div>
                        {form.supplier_id && (
                          <div style={{ marginTop: 12 }}>
                            <label style={s.label}>Supplier Address <FTypeBadge type="autofill" /></label>
                            <div className="ypo-grid" style={{ marginTop: 4 }}>
                              <Field label="Address" type="autofill"><input value={form.sup_address} disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                              <Field label="District" type="autofill"><input value={form.sup_district} disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                              <Field label="State" type="autofill"><input value={form.sup_state} disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                              <Field label="Pin Code" type="autofill"><input value={form.sup_pin_code} disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                              <Field label="Country" type="autofill"><input value={form.sup_country} disabled style={{ ...s.input, ...s.inputDisabled }} /></Field>
                              <Field label="GST No" type="autofill"><input value={form.sup_gst_no} disabled style={{ ...s.input, ...s.inputDisabled, fontFamily: 'DM Mono,monospace' }} /></Field>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <SectionHead title="Supplier Billing" open={sec.billing} onToggle={() => toggle('billing')} />
                    {sec.billing && (
                      <div style={{ marginTop: 12 }}>
                        <div className="ypo-same-bar">
                          <label className="ypo-toggle"><input type="checkbox" checked={form.billing_same_as_supplier === 'Yes'} onChange={e => handleBillingSameChange(e.target.checked ? 'Yes' : 'No')} /><span className="ypo-toggle-slider" /></label>
                          <div><div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Supplier Billing Name same as Supplier Name</div><div style={{ fontSize: 11, color: '#64748b' }}>Toggle off to select a different billing entity</div></div>
                        </div>
                        {form.billing_same_as_supplier === 'No' && (
                          <div style={{ marginTop: 10 }}><Field label="Supplier Billing Name" type="lookup"><SearchableDropdown value={form.billing_supplier_id} onChange={handleBillingSupplierChange} options={supOpts} placeholder="Select supplier for billing…" portalZIndex={9500} /></Field></div>
                        )}
                      </div>
                    )}

                    <SectionHead title="Mill Details" open={sec.mill} onToggle={() => toggle('mill')} />
                    {sec.mill && (
                      <div style={{ marginTop: 12 }}>
                        <div className="ypo-same-bar">
                          <label className="ypo-toggle"><input type="checkbox" checked={form.mill_same_as_supplier === 'Yes'} onChange={e => handleMillSameChange(e.target.checked ? 'Yes' : 'No')} /><span className="ypo-toggle-slider" /></label>
                          <div><div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Is Mill Name same as Supplier Name?</div></div>
                        </div>
                        {form.mill_same_as_supplier === 'No' && (
                          <div style={{ marginTop: 10 }}><Field label="Mill Name" type="lookup"><SearchableDropdown value={form.mill_supplier_id} onChange={handleMillSupplierChange} options={supOpts} placeholder="Select mill supplier…" portalZIndex={9500} /></Field></div>
                        )}
                      </div>
                    )}

                    {/* ── Company (Print Header) — FPO-style logo picker ── */}
                    <SectionHead title="Company (Print Header)" open={sec.company} onToggle={() => toggle('company')} />
                    {sec.company && (
                      <div style={{ marginTop: 12 }}>
                        <Field label="Company (Print Header)" required type="lookup">
                          <CompanyDropdown value={form.company_address_id} onChange={v => { const fills = fillCompanyAddress(v); setForm(f => ({ ...f, company_address_id: v, ...fills })); }} companies={lookup.companyAddresses} portalZIndex={9500} />
                        </Field>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Which entity's logo, address & GSTIN prints at the top of this Yarn Purchase Order.</div>
                        <CompanyHeaderPreview company={selectedCompany} />
                      </div>
                    )}

                    <SectionHead title="Delivery & Payment" open={sec.delivery} onToggle={() => toggle('delivery')} />
                    {sec.delivery && (
                      <div className="ypo-grid" style={{ marginTop: 12 }}>
                        <Field label="Exp. Delivery" type="date"><input type="date" value={toDateInput(form.exp_delivery)} onChange={e => set('exp_delivery', e.target.value)} style={s.input} /></Field>
                        <Field label="Due Date" type="date"><input type="date" value={toDateInput(form.due_date)} onChange={e => set('due_date', e.target.value)} style={s.input} /></Field>
                        <Field label="Payment Terms" type="lookup"><SearchableDropdown value={form.payment_term_id} onChange={v => set('payment_term_id', v)} options={payOpts} placeholder="Select payment terms…" portalZIndex={9500} /></Field>
                        <Field label="Transport / Freight Terms" type="selection">
                          <select value={form.transport_freight_terms} onChange={e => set('transport_freight_terms', e.target.value)} style={s.input}><option>Paid</option><option>Ex-mill</option></select>
                        </Field>
                        <Field label="Place of Supply" type="text"><input value={form.place_of_supply} onChange={e => set('place_of_supply', e.target.value)} style={s.input} placeholder="e.g. Tamil Nadu" /></Field>
                        <Field label="Advance (₹)" type="number"><input type="number" min="0" step="0.01" value={form.advance} onChange={e => set('advance', e.target.value)} style={s.input} placeholder="0.00" /></Field>
                        <div className="ypo-col-full">
                          <Field label="Description" type="text"><input value={form.description} onChange={e => set('description', e.target.value)} style={s.input} placeholder="Printed under 'Order Amount in Words' — e.g. delivery timeline" /></Field>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 1 && (
                  <div className="ypo-tab-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>{form.items.length} yarn line{form.items.length !== 1 ? 's' : ''}</span>
                        <span style={{ fontSize: 12, color: '#64748b', marginLeft: 10 }}>— One card per Count / Lot combination</span>
                      </div>
                      <button className="ypo-add-row-btn" onClick={addItem}><PlusCircle size={14} /> Add Yarn Line</button>
                    </div>
                    {form.items.map((item, idx) => (
                      <YarnItemCard key={item._id} item={item} idx={idx} total={form.items.length} yarnOpts={yarnOpts} hsnOptions={hsnOptions} discOpts={discOpts} onUpdate={updateItem} onRemove={removeItem} />
                    ))}
                    <div className="ypo-grand-total">
                      <div className="ypo-grand-total-item"><span>Grand PO Value</span><strong style={{ color: '#c2410c' }}>₹ {grandPoValue.toFixed(2)}</strong></div>
                      <div style={{ width: 1, height: 32, background: '#e2e8f0' }} />
                      <div className="ypo-grand-total-item"><span>Grand Net Value (incl. Tax)</span><strong style={{ color: '#166534' }}>₹ {grandNetValue.toFixed(2)}</strong></div>
                    </div>
                  </div>
                )}

                {activeTab === 2 && (
                  <div className="ypo-tab-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Customer Order Linkages</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Link this PO to open Customer Orders and optionally select associated PWOs.</div>
                      </div>
                      <button className="ypo-add-row-btn" onClick={addCoLink}><PlusCircle size={14} /> Link CO</button>
                    </div>
                    {form.co_links.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8', fontSize: 13, border: '2px dashed #e2e8f0', borderRadius: 12, background: '#fafbfc' }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>🔗</div>
                        <div style={{ fontWeight: 700, color: '#64748b', marginBottom: 4 }}>No Customer Orders linked</div>
                        <div>Click <strong>"Link CO"</strong> above to associate this PO with a customer order.</div>
                      </div>
                    ) : (
                      <table className="ypo-co-table">
                        <thead><tr><th style={{ width: 36 }}>#</th><th style={{ minWidth: 220 }}>Customer Order No</th><th style={{ minWidth: 240 }}>Associated PWOs</th><th style={{ minWidth: 130 }}>Required KGS</th><th style={{ width: 40 }}></th></tr></thead>
                        <tbody>
                          {form.co_links.map((link, idx) => {
                            const linkedPwos = lookup.pwos.filter(p => (link.co_id && String(p.co_id) === link.co_id) || (link.co_no && p.co_no === link.co_no));
                            return (
                              <tr key={link._id}>
                                <td style={{ color: '#94a3b8', textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                                <td style={{ overflow: 'visible' }}>
                                  <SearchableDropdown value={link.co_id} onChange={v => updateCoLink(idx, { co_id: v })} options={coOpts} placeholder="Select customer order…" portalZIndex={10500} />
                                  {link.customer_name && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>👤 {link.customer_name}</div>}
                                </td>
                                <td>
                                  {!link.co_id ? <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>— Select Customer Order first —</span>
                                    : linkedPwos.length === 0 ? <span style={{ fontSize: 12, color: '#f59e0b' }}><AlertTriangle size={12} /> No PWOs found</span>
                                    : (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        {linkedPwos.map(pwo => (
                                          <label key={pwo.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer', padding: '4px 6px', borderRadius: 6, background: link.pwo_ids.includes(String(pwo.id)) ? '#ede9fe' : '#f8fafc', border: `1px solid ${link.pwo_ids.includes(String(pwo.id)) ? '#c4b5fd' : '#e2e8f0'}` }}>
                                            <input type="checkbox" checked={link.pwo_ids.includes(String(pwo.id))} onChange={e => { const ids = e.target.checked ? [...link.pwo_ids, String(pwo.id)] : link.pwo_ids.filter(id => id !== String(pwo.id)); updateCoLink(idx, { pwo_ids: ids }); }} />
                                            <span style={{ fontFamily: 'DM Mono,monospace', color: '#1d4ed8', fontWeight: 600 }}>{pwo.wo_no}</span>
                                          </label>
                                        ))}
                                      </div>
                                    )}
                                </td>
                                <td><input type="number" value={link.required_kgs} onChange={e => updateCoLink(idx, { required_kgs: e.target.value })} style={{ ...s.input, minWidth: 100 }} placeholder="KGS (optional)" min="0" step="0.001" /></td>
                                <td style={{ textAlign: 'center' }}>
                                  <button onClick={() => removeCoLink(idx)} style={{ background: '#fff1f2', color: '#ef4444', border: '1px solid #fca5a5', width: 28, height: 28, borderRadius: 7, cursor: 'pointer' }}><X size={13} /></button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>

              <div className="ypo-modal-footer">
                <TabStepIndicator active={activeTab} total={TOTAL_TABS} onGo={setActiveTab} />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="ypo-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                  {activeTab > 0 && <button className="ypo-btn-prev" onClick={() => { setError(''); setActiveTab(t => t - 1); }}>← Prev</button>}
                  {!isLastTab && <button className="ypo-btn-next" onClick={handleNext}>Next →</button>}
                  {isLastTab && (
                    <button className="ypo-btn-save" onClick={handleSave} disabled={saving}>
                      {saving ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : editId ? '✏️ Update PO' : '💾 Save PO'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="ypo-confirm-overlay">
            <div className="ypo-confirm-box">
              <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
              <p style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>Delete Purchase Order?</p>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 24px', lineHeight: 1.6 }}>
                This will permanently delete <strong>{deleteTarget.rec_no}</strong> and all its line items. This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => setDeleteTarget(null)} style={{ padding: '9px 22px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleDeleteConfirm} disabled={deleteConfirming} style={{ padding: '9px 22px', border: 'none', borderRadius: 8, background: deleteConfirming ? '#fca5a5' : '#dc2626', color: '#fff', fontWeight: 700, fontSize: 13, cursor: deleteConfirming ? 'not-allowed' : 'pointer' }}>
                  {deleteConfirming ? 'Deleting…' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, color: '#1e293b', outline: 'none', boxSizing: 'border-box', background: '#fff' },
  inputDisabled: { background: '#f1f5f9', color: '#6b7280', cursor: 'not-allowed', border: '1px solid #e2e8f0' },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', marginTop: 18, userSelect: 'none' },
  sectionTitle: { fontWeight: 700, fontSize: 13, color: '#1e293b' },
};