// frontend/src/pages/admin/YarnMaster.tsx
// Yarn Master — Fully Responsive, matches CustomerMaster format exactly
// Tabs: Yarn Master | Yarn Type Master | Count System Master
//
// FIX: certifications now load correctly from `certification` (singular) table
// FIX: `uom` field added — was present in DB schema but never read/written anywhere
// FIX: hsn_code_id now stored as integer (not string) — uses searchable HsnDropdown
//      matching YarnPurchaseOrder's dropdown style (purple theme)
// FIX: handleDelete in YarnMaster now checks res.ok and surfaces the real error message
// FIX: SimpleMaster delete now uses its own api/load instead of YarnMaster's globals

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Plus, Search, X, ChevronDown, ChevronUp,
  CheckSquare, Square, PlusCircle, Loader2,
  AlertCircle, CheckCircle2, Info, AlertTriangle, Trash2,
  Award,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────

interface FiberRow {
  brand_name:        string;
  fiber_name:        string;
  fiber_percentage:  string;
  certification_ids: number[];
}

interface Yarn {
  id?:                              number;
  yarn_code?:                       string;
  category:                         string;
  uom:                              string;
  yarn_type_id:                     string;
  count_system_id:                  string;
  color_id:                         string;
  hsn_code_id:                      string;
  count_value:                      string;
  ply:                              string;
  number_of_filament:               string;
  twist_unit:                       string;
  twist_value:                      string;
  twist_direction:                  string;
  formula:                          string;
  actual_count:                     string;
  yarn_count:                       string;
  short_name:                       string;
  status:                           string;
  fibers:                           FiberRow[];
  primary_fiber_certification_ids:  number[];
  // joined
  yarn_type?:         string;
  count_system_name?: string;
  color_name?:        string;
  hex_code?:          string | null;
}

interface YarnType  { id?: number; yarn_type: string; status: string }
interface CountSys  { id?: number; cs_name: string; formula: string; status: string }

interface CertificationMaster {
  id:                  number;
  cert_id:             string;
  certification_name:  string;
  certification_body?: string | null;
  valid_from?:         string | null;
  valid_to?:           string | null;
  status:              string;
}

interface HsnOption {
  id:          number;
  hsn_code:    string;
  description?: string | null;
}

interface Lookup {
  yarnTypes:      { id: number; yarn_type: string }[];
  countSystems:   { id: number; cs_name: string; formula: string }[];
  fibers:         { id: number; fiber_name: string }[];
  brands:         { id: number; brand_name: string }[];
  certifications: CertificationMaster[];
  colors:         { id: number; color_name: string; hex_code: string | null }[];
  hsnCodes:       HsnOption[];
}

// ─── Toast ───────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string }
let _tid = 0;

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++_tid;
    setToasts((p) => [...p, { id, type, title, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4500);
  }, []);
  const remove = useCallback((id: number) => setToasts((p) => p.filter((t) => t.id !== id)), []);
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
      {toasts.map((t) => {
        const c = cfg[t.type];
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', pointerEvents: 'all', animation: 'toastIn 0.25s ease-out', fontFamily: "'DM Sans',sans-serif" }}>
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

// ─── HSN Searchable Dropdown ──────────────────────────────────────────────────

interface HsnDropdownProps {
  value:        string;
  onChange:     (id: string) => void;
  hsnCodes:     HsnOption[];
  placeholder?: string;
  portalZIndex?: number;
}

function HsnDropdown({
  value,
  onChange,
  hsnCodes,
  placeholder = 'Select HSN code…',
  portalZIndex = 9500,
}: HsnDropdownProps) {
  const [open,    setOpen]    = useState(false);
  const [query,   setQuery]   = useState('');
  const wrapRef               = useRef<HTMLDivElement>(null);
  const inputRef              = useRef<HTMLInputElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery('');
      }
    };
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

  const selectedHsn = hsnCodes.find(h => String(h.id) === String(value));
  const filtered    = hsnCodes.filter(h => {
    const q = query.toLowerCase();
    return h.hsn_code.toLowerCase().includes(q) || (h.description ?? '').toLowerCase().includes(q);
  }).slice(0, 60);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 12px',
          border: `1px solid ${open ? '#7c3aed' : '#cbd5e1'}`,
          borderRadius: 8, cursor: 'pointer',
          background: value ? '#f5f3ff' : '#fff',
          fontSize: 13, fontFamily: "'DM Sans', sans-serif",
          minHeight: 38,
          boxShadow: open ? '0 0 0 3px rgba(124,58,237,0.12)' : 'none',
          transition: 'all 0.15s',
        }}
      >
        {selectedHsn && (
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: '#6d28d9', background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 5, padding: '1px 7px', flexShrink: 0 }}>
            {selectedHsn.hsn_code}
          </span>
        )}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: value ? '#374151' : '#9ca3af', fontSize: 13 }}>
          {selectedHsn
            ? (selectedHsn.description ? (selectedHsn.description.length > 40 ? selectedHsn.description.substring(0, 40) + '…' : selectedHsn.description) : '')
            : placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {value && (
            <button onClick={e => { e.stopPropagation(); onChange(''); setQuery(''); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#94a3b8' }}>
              <X size={13} />
            </button>
          )}
          <ChevronDown size={13} color="#94a3b8" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </span>
      </div>

      {open && dropPos && (
        <div style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: Math.max(dropPos.width, 300), background: '#fff', border: '1px solid #ddd6fe', borderRadius: 10, zIndex: portalZIndex, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', maxHeight: 300, overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Search size={13} color="#94a3b8" />
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search HSN code or description…" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, fontFamily: "'DM Sans', sans-serif", color: '#1e293b', background: 'transparent' }} />
            {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={12} /></button>}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div onClick={() => { onChange(''); setOpen(false); setQuery(''); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', background: !value ? '#f5f3ff' : '#fff', fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }} onMouseEnter={e => { if (value) (e.currentTarget as HTMLDivElement).style.background = '#f5f3ff'; }} onMouseLeave={e => { if (value) (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}>
              — None —
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                No HSN codes found{query ? ` for "${query}"` : ''}
                {hsnCodes.length === 0 && <div style={{ marginTop: 6, fontSize: 11, color: '#c4b5fd' }}>Add HSN codes via the HSN Master screen.</div>}
              </div>
            ) : filtered.map(h => {
              const isSelected = String(h.id) === String(value);
              return (
                <div key={h.id} onClick={() => { onChange(String(h.id)); setOpen(false); setQuery(''); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', background: isSelected ? '#f5f3ff' : '#fff', transition: 'background 0.1s' }} onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#f5f3ff'; }} onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: '#6d28d9', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 5, padding: '1px 7px', flexShrink: 0 }}>{h.hsn_code}</span>
                    {h.description && <span style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.description}</span>}
                    {isSelected && <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 10, color: '#7c3aed', fontWeight: 700 }}>✓</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '5px 12px', borderTop: '1px solid #f1f5f9', fontSize: 10, color: '#94a3b8', background: '#f8fafc', flexShrink: 0 }}>
            {hsnCodes.length === 0 ? 'No HSN codes loaded — add via HSN Master' : `${filtered.length} of ${hsnCodes.length} codes`}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Constants ───────────────────────────────────────────────

const BLANK_FIBER: FiberRow = { brand_name: '', fiber_name: '', fiber_percentage: '', certification_ids: [] };

const BLANK_YARN: Yarn = {
  category: '', uom: '', yarn_type_id: '', count_system_id: '', color_id: '', hsn_code_id: '',
  count_value: '', ply: '1', number_of_filament: '',
  twist_unit: '', twist_value: '', twist_direction: '',
  formula: '', actual_count: '', yarn_count: '',
  short_name: '', status: 'Active',
  fibers: [{ ...BLANK_FIBER }],
  primary_fiber_certification_ids: [],
};

const BLANK_YT: YarnType = { yarn_type: '', status: 'Active' };
const BLANK_CS: CountSys = { cs_name: '', formula: '', status: 'Active' };
const PAGE_OPTS = [5, 10, 25, 50];
const API_YARNS = '/api/yarns';
const API_YT    = '/api/yarn-types';
const API_CS    = '/api/count-systems';
const UOM_OPTS  = ['Kg', 'Cone', 'Box', 'Bag', 'Meter', 'Yards', 'Pcs', 'Ltr'];

// ─── Hooks ───────────────────────────────────────────────────

function useWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return w;
}

// ─── Shared UI ───────────────────────────────────────────────

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label style={s.label}>
        {label}
        {required && <span style={{ color: '#ef4444' }}> *</span>}
        {hint && <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 4 }}>({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function SectionHead({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <div style={s.sectionHead} onClick={onToggle}>
      <span style={s.sectionTitle}>{title}</span>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </div>
  );
}

function fiberTotal(fibers: FiberRow[]) {
  return fibers.reduce((sum, f) => sum + (parseFloat(f.fiber_percentage) || 0), 0);
}

function FiberTotalBadge({ fibers }: { fibers: FiberRow[] }) {
  const total = fiberTotal(fibers);
  const ok    = Math.abs(total - 100) < 0.01;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px',
      borderRadius: 20, fontSize: 12, fontWeight: 700,
      background: ok ? '#dcfce7' : total > 100 ? '#fef2f2' : '#fff7ed',
      color:      ok ? '#166534' : total > 100 ? '#991b1b' : '#c2410c',
      border: `1px solid ${ok ? '#86efac' : total > 100 ? '#fca5a5' : '#fed7aa'}`,
    }}>
      Fiber Total: {total.toFixed(1)}% {ok ? '✓' : total > 100 ? '↑ Over' : '↓ Under'}
    </span>
  );
}

// ─── Primary Fiber Certification Chip Selector ───────────────

interface CertChipSelectorProps {
  certifications: CertificationMaster[];
  selectedIds:    number[];
  onToggle:       (id: number) => void;
  emptyLabel?:    string;
}

function CertChipSelector({ certifications, selectedIds, onToggle, emptyLabel }: CertChipSelectorProps) {
  if (!certifications.length) {
    return (
      <div style={s.certEmptyState}>
        <Award size={13} style={{ opacity: 0.4 }} />
        <span>{emptyLabel ?? 'No certifications available — add them in Certification Master.'}</span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 0' }}>
      {certifications.map((cert) => {
        const active = selectedIds.includes(cert.id);
        return (
          <span
            key={cert.id}
            className="cert-chip"
            onClick={() => onToggle(cert.id)}
            title={cert.certification_body ? `Body: ${cert.certification_body}` : cert.cert_id}
            style={{
              background:  active ? '#dbeafe' : '#f8fafc',
              color:       active ? '#1d4ed8' : '#64748b',
              borderColor: active ? '#93c5fd' : '#e2e8f0',
              fontSize: 12,
              padding: '4px 10px',
            }}
          >
            {active ? <CheckSquare size={12} /> : <Square size={12} />}
            {cert.certification_name}
          </span>
        );
      })}
    </div>
  );
}

// ─── Generic Simple Master (Yarn Type & Count System) ────────
// ★ FIX: handleDelete now uses the prop `api` and local `load()` — not YarnMaster globals

interface SimpleMasterProps<T extends { id?: number; status: string }> {
  title:     string;
  api:       string;
  blankRow:  T;
  columns:   { key: keyof T; label: string; required?: boolean; textarea?: boolean }[];
  pushToast: (type: ToastType, title: string, msg?: string) => void;
}

function SimpleMaster<T extends { id?: number; status: string }>({
  title, api, blankRow, columns, pushToast,
}: SimpleMasterProps<T>) {
  const [rows,     setRows]     = useState<T[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState<T>(blankRow);
  const [editId,   setEditId]   = useState<number | null>(null);
  const [error,    setError]    = useState('');
  const isMobile = useWidth() < 576;

  const load = async () => {
    setLoading(true);
    try {
      const qs  = new URLSearchParams({ search, page: String(page), limit: String(pageSize) });
      const res = await fetch(`${api}?${qs}`);
      const data = await res.json();
      setRows(data.data ?? []); setTotal(data.total ?? 0);
    } catch { pushToast('error', 'Load Failed', 'Could not fetch records.'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [search, page, pageSize]);

  const openCreate = () => { setForm(blankRow); setEditId(null); setError(''); setShowForm(true); };
  const openEdit   = (row: T) => { setForm({ ...row }); setEditId(row.id!); setError(''); setShowForm(true); };

  const handleSave = async () => {
    const firstReq = columns.find((c) => c.required);
    if (firstReq && !String((form as any)[firstReq.key]).trim()) {
      setError(`${firstReq.label} is required`); return;
    }
    setSaving(true); setError('');
    try {
      const res = await fetch(editId ? `${api}/${editId}` : api, {
        method:  editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Save failed');
      pushToast('success', editId ? `${title} Updated` : `${title} Created`, 'Record saved successfully.');
      setShowForm(false); load();
    } catch (e: any) { setError(e.message); pushToast('error', 'Save Failed', e.message); }
    setSaving(false);
  };

  // ★ FIX: use `api` prop (not API_YARNS) and local `load()` (not loadYarns)
  const handleDelete = async (id: number) => {
    if (!confirm(`Delete this ${title} record?`)) return;
    try {
      const res = await fetch(`${api}/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? `Server error ${res.status}`);
      }
      pushToast('success', 'Deleted', 'Record removed.');
      load();
    } catch (e: any) {
      pushToast('error', 'Delete Failed', e.message);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{title}</h2>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>{total} record{total !== 1 ? 's' : ''}</p>
        </div>
        <button className="cm-add-btn" onClick={openCreate}><Plus size={15} /> New Record</button>
      </div>

      <div className="cm-toolbar">
        <div className="cm-search-wrap">
          <Search size={14} />
          <input className="cm-search" placeholder={`Search ${title}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="cm-page-size">
          {!isMobile && <span>Show</span>}
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {PAGE_OPTS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {!isMobile && <span>entries</span>}
        </div>
      </div>

      <div className="cm-card">
        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th>#</th>
                {columns.map((c) => <th key={String(c.key)}>{c.label}</th>)}
                <th>Status</th>
                <th className="th-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columns.length + 3} className="cm-empty">
                  <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={columns.length + 3} className="cm-empty">No records found.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ color: '#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                  {columns.map((c) => <td key={String(c.key)}>{String((r as any)[c.key] ?? '—')}</td>)}
                  <td><span className={`cm-chip ${r.status === 'Active' ? 'cm-chip-active' : 'cm-chip-inactive'}`}>{r.status}</span></td>
                  <td>
                    <div className="cm-action-group">
                      <button className="cm-btn-edit" onClick={() => openEdit(r)}>✏️ {!isMobile && 'Edit'}</button>
                      <button className="cm-btn-del"  onClick={() => handleDelete(r.id!)}>🗑 {!isMobile && 'Delete'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && total > 0 && (
          <div className="cm-pagination">
            <span>Page {page} of {totalPages}</span>
            <div className="cm-pag-btns">
              <button className="cm-pag-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
              <button className="cm-pag-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
              <button className="cm-pag-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
              <button className="cm-pag-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="cm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="cm-modal" style={{ maxWidth: 520 }}>
            <div className="cm-modal-header">
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>
                {editId ? `✏️ Edit ${title}` : `➕ New ${title}`}
              </h2>
              <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={20} color="#fff" /></button>
            </div>
            {error && (
              <div style={s.errorBanner}>
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{error}</span>
                <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#ef4444', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
              </div>
            )}
            <div className="cm-modal-body">
              <div className="cm-grid" style={{ paddingTop: 0 }}>
                {columns.map((c) => (
                  <Field key={String(c.key)} label={c.label} required={c.required}>
                    {c.textarea
                      ? <textarea value={String((form as any)[c.key] ?? '')} onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))} style={{ ...s.input, height: 80, resize: 'vertical' }} />
                      : <input value={String((form as any)[c.key] ?? '')} onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))} style={s.input} />
                    }
                  </Field>
                ))}
                <Field label="Status">
                  <select value={(form as any).status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={s.input}>
                    <option>Active</option><option>Inactive</option>
                  </select>
                </Field>
              </div>
            </div>
            <div className="cm-modal-footer">
              <button className="cm-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="cm-btn-save" onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : (editId ? '✏️ Update' : '💾 Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main: YarnMaster ────────────────────────────────────────

export default function YarnMaster() {
  const [tab, setTab] = useState<'yarn' | 'yarntype' | 'countsystem'>('yarn');

  const [yarns,     setYarns]     = useState<Yarn[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [pageSize,  setPageSize]  = useState(10);
  const [search,    setSearch]    = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterSt,  setFilterSt]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState<Yarn>(BLANK_YARN);
  const [editId,   setEditId]   = useState<number | null>(null);
  const [error,    setError]    = useState('');
  const [lookup,   setLookup]   = useState<Lookup>({
    yarnTypes: [], countSystems: [], fibers: [],
    brands: [], certifications: [], colors: [], hsnCodes: [],
  });

  const [sec, setSec] = useState({ basic: true, fiber: true, count: true, twist: false });

  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const width    = useWidth();
  const isMobile = width < 576;

  // ── Load ─────────────────────────────────────────────────

  const loadYarns = useCallback(async () => {
    setLoading(true);
    try {
      const qs  = new URLSearchParams({
        search, page: String(page), limit: String(pageSize),
        ...(filterCat ? { category: filterCat } : {}),
        ...(filterSt  ? { status: filterSt }    : {}),
      });
      const res  = await fetch(`${API_YARNS}?${qs}`);
      const data = await res.json();
      setYarns(data.data ?? []); setTotal(data.total ?? 0);
    } catch { pushToast('error', 'Load Failed', 'Could not fetch yarns.'); }
    setLoading(false);
  }, [search, page, pageSize, filterCat, filterSt]);

  const loadLookup = async () => {
    try {
      const res = await fetch(`${API_YARNS}/meta/lookup`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const rawCerts: any[] = Array.isArray(data.certifications) ? data.certifications : [];
      const normalisedCerts: CertificationMaster[] = rawCerts.map((c) => ({
        id:                  Number(c.id),
        cert_id:             String(c.cert_id ?? c.id ?? ''),
        certification_name:  String(c.certification_name ?? c.name ?? ''),
        certification_body:  c.certification_body ?? null,
        valid_from:          c.valid_from ?? null,
        valid_to:            c.valid_to ?? null,
        status:              String(c.status ?? 'Active'),
      }));

      const rawHsn: any[] = Array.isArray(data.hsnCodes) ? data.hsnCodes : [];
      const normalisedHsn: HsnOption[] = rawHsn.map((h) => ({
        id:          Number(h.id),
        hsn_code:    String(h.hsn_code ?? ''),
        description: h.description ?? h.hsn_short_desc ?? null,
      }));

      setLookup({
        yarnTypes:      Array.isArray(data.yarnTypes)    ? data.yarnTypes    : [],
        countSystems:   Array.isArray(data.countSystems) ? data.countSystems : [],
        fibers:         Array.isArray(data.fibers)        ? data.fibers       : [],
        brands:         Array.isArray(data.brands)        ? data.brands       : [],
        certifications: normalisedCerts,
        colors:         Array.isArray(data.colors)        ? data.colors       : [],
        hsnCodes:       normalisedHsn,
      });

      if (normalisedHsn.length === 0) {
        console.warn('[YarnMaster] No HSN codes returned — check hsn_master table has Active records.');
      } else {
        console.log(`[YarnMaster] Loaded ${normalisedHsn.length} HSN codes.`);
      }
      if (normalisedCerts.length === 0) {
        console.warn('[YarnMaster] No certifications returned — check the `certification` table has Active records.');
      }

    } catch (err) {
      pushToast('error', 'Lookup Failed', 'Could not load dropdown data.');
      console.error('[YarnMaster] loadLookup error:', err);
    }
  };

  useEffect(() => { loadLookup(); }, []);
  useEffect(() => { if (tab === 'yarn') loadYarns(); }, [search, filterCat, filterSt, page, pageSize, tab]);
  useEffect(() => { setPage(1); }, [search, filterCat, filterSt]);
  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showForm]);

  // ── Form open ─────────────────────────────────────────────

  const openCreate = () => { setForm(BLANK_YARN); setEditId(null); setError(''); setShowForm(true); };

  const openEdit = async (id: number) => {
    try {
      const res  = await fetch(`${API_YARNS}/${id}`);
      const data = await res.json();
      const fibers: FiberRow[] = (data.fibers ?? []).map((f: any) => ({
        brand_name:        String(f.brand_name ?? f.brand_id ?? ''),
        fiber_name:        String(f.fiber_name ?? f.fiber_id ?? ''),
        fiber_percentage:  String(f.fiber_percentage ?? ''),
        certification_ids: (f.certification_ids ?? []).map(Number),
      }));
      setForm({
        ...data,
        uom:                             String(data.uom ?? ''),
        yarn_type_id:                    String(data.yarn_type_id ?? ''),
        count_system_id:                 String(data.count_system_id ?? ''),
        color_id:                        String(data.color_id ?? ''),
        hsn_code_id:                     data.hsn_code_id != null ? String(data.hsn_code_id) : '',
        count_value:                     String(data.count_value ?? ''),
        ply:                             String(data.ply ?? '1'),
        number_of_filament:              String(data.number_of_filament ?? ''),
        twist_value:                     String(data.twist_value ?? ''),
        actual_count:                    String(data.actual_count ?? ''),
        yarn_count:                      String(data.yarn_count ?? ''),
        formula:                         String(data.formula ?? ''),
        twist_unit:                      String(data.twist_unit ?? ''),
        twist_direction:                 String(data.twist_direction ?? ''),
        fibers: fibers.length ? fibers : [{ ...BLANK_FIBER }],
        primary_fiber_certification_ids: Array.isArray(data.primary_fiber_certification_ids)
          ? data.primary_fiber_certification_ids.map(Number)
          : [],
      });
      setEditId(id); setError(''); setShowForm(true);
    } catch { pushToast('error', 'Load Failed', 'Could not load yarn details.'); }
  };

  // ── Save ─────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.category)        { setError('Category is required');      return; }
    if (!form.yarn_type_id)    { setError('Yarn Type is required');     return; }
    if (!form.count_system_id) { setError('Count System is required');  return; }
    if (!form.count_value)     { setError('Count Value is required');   return; }
    if (!form.ply)             { setError('Ply is required');           return; }

    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        count_value:        parseFloat(form.count_value) || 0,
        ply:                parseInt(form.ply) || 1,
        number_of_filament: form.number_of_filament ? parseInt(form.number_of_filament) : null,
        twist_value:        form.twist_value  ? parseFloat(form.twist_value)  : null,
        actual_count:       form.actual_count ? parseFloat(form.actual_count) : null,
        yarn_count:         form.yarn_count   ? parseFloat(form.yarn_count)   : null,
        uom:                form.uom || null,
        hsn_code_id:        form.hsn_code_id ? parseInt(form.hsn_code_id, 10) : null,
        fibers: form.fibers.map((f) => ({
          brand_name:        f.brand_name,
          fiber_name:        f.fiber_name,
          fiber_percentage:  parseFloat(f.fiber_percentage) || 0,
          certification_ids: f.certification_ids,
        })),
        primary_fiber_certification_ids: form.primary_fiber_certification_ids,
      };

      console.log('[YarnMaster] Saving payload.hsn_code_id =', payload.hsn_code_id, '(type:', typeof payload.hsn_code_id, ')');

      const res = await fetch(editId ? `${API_YARNS}/${editId}` : API_YARNS, {
        method:  editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Save failed');
      }
      pushToast('success', editId ? 'Yarn Updated' : 'Yarn Created', 'Record saved successfully.');
      setShowForm(false); loadYarns();
    } catch (e: any) { setError(e.message); pushToast('error', 'Save Failed', e.message); }
    setSaving(false);
  };

  // ── Delete ────────────────────────────────────────────────
  // ★ FIX: checks res.ok and surfaces the real backend error message

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this yarn and all its fiber data?')) return;
    try {
      const res = await fetch(`${API_YARNS}/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.detail ?? body.error ?? `Server error ${res.status}`);
      }
      pushToast('success', 'Yarn Deleted', 'Yarn and all fiber data removed.');
      loadYarns();
    } catch (e: any) {
      pushToast('error', 'Delete Failed', e.message);
    }
  };

  // ── Fiber helpers ────────────────────────────────────────

  const setFiber = (i: number, k: keyof FiberRow, v: any) =>
    setForm((f) => { const a = [...f.fibers]; (a[i] as any)[k] = v; return { ...f, fibers: a }; });
  const addFiber = () => setForm((f) => ({ ...f, fibers: [...f.fibers, { ...BLANK_FIBER }] }));
  const delFiber = (i: number) => setForm((f) => ({ ...f, fibers: f.fibers.filter((_, j) => j !== i) }));

  const toggleCert = (fi: number, certId: number) => {
    const row = form.fibers[fi];
    const ids = row.certification_ids.includes(certId)
      ? row.certification_ids.filter((c) => c !== certId)
      : [...row.certification_ids, certId];
    setFiber(fi, 'certification_ids', ids);
  };

  const togglePrimaryCert = (certId: number) => {
    setForm((f) => {
      const ids = f.primary_fiber_certification_ids.includes(certId)
        ? f.primary_fiber_certification_ids.filter((c) => c !== certId)
        : [...f.primary_fiber_certification_ids, certId];
      return { ...f, primary_fiber_certification_ids: ids };
    });
  };

  // ── Form field shortcuts ──────────────────────────────────

  const set = (k: keyof Yarn, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const inp = (k: keyof Yarn, type = 'text') => (
    <input type={type} value={String(form[k] ?? '')} onChange={(e) => set(k, e.target.value)} style={s.input} />
  );
  const sel = (k: keyof Yarn, opts: string[]) => (
    <select value={String(form[k] ?? '')} onChange={(e) => set(k, e.target.value)} style={s.input}>
      <option value=''>— Select —</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  const toggle = (k: keyof typeof sec) => setSec((p) => ({ ...p, [k]: !p[k] }));

  // ── Pagination ────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNums = (() => {
    const pages: number[] = [];
    let start = Math.max(1, page - 2);
    const end  = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  })();

  const showCount  = width >= 480;
  const showPly    = width >= 576;
  const showUom    = width >= 640;
  const showCS     = width >= 768;
  const showShort  = width >= 900;
  const showColor  = width >= 1024;

  const selectedHsnOption = lookup.hsnCodes.find(h => String(h.id) === String(form.hsn_code_id));

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes toastIn { from { opacity:0; transform:translateX(20px) } to { opacity:1; transform:translateX(0) } }
        @keyframes spin     { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }

        .cm-wrap  { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }
        .cm-add-btn {
          display:flex; align-items:center; gap:6px;
          background:#2563eb; color:#fff; border:none; border-radius:8px;
          padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer;
          font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(37,99,235,.3);
          white-space:nowrap; flex-shrink:0; touch-action:manipulation;
        }
        .cm-add-btn:hover { background:#1d4ed8; }

        .cm-tabs { display:flex; gap:0; margin-bottom:20px; border-bottom:2px solid #e2e8f0; flex-wrap:wrap; }
        .cm-tab  {
          padding:10px 18px; font-size:13px; font-weight:600; cursor:pointer;
          border:none; background:none; font-family:'DM Sans',sans-serif;
          color:#64748b; border-bottom:3px solid transparent; margin-bottom:-2px; transition:all .15s;
        }
        .cm-tab.active { color:#2563eb; border-bottom-color:#2563eb; }
        .cm-tab:hover:not(.active) { color:#1e293b; }

        .cm-page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
        .cm-page-header h1 { margin:0; font-size:20px; font-weight:700; color:#1e293b; }
        .cm-page-header p  { margin:3px 0 0; font-size:13px; color:#64748b; }

        .cm-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .cm-search-wrap { position:relative; flex:1; min-width:180px; max-width:320px; }
        .cm-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .cm-search {
          width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px;
          font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; outline:none;
        }
        .cm-search:focus { border-color:#2563eb; }
        .cm-filter-sel {
          border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13px;
          font-family:'DM Sans',sans-serif; background:#fff; color:#374151; cursor:pointer; outline:none; max-width:160px;
        }
        .cm-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; flex-shrink:0; }
        .cm-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; }

        .cm-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,.07); margin-bottom:24px; }
        .cm-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .cm-table { width:100%; border-collapse:collapse; font-size:13px; font-family:'DM Sans',sans-serif; min-width:480px; }
        .cm-table thead tr { background:#2563eb; }
        .cm-table th { padding:11px 12px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:12px; }
        @media(min-width:768px){ .cm-table th { font-size:13px; padding:12px 16px; } }
        .cm-table th.th-center { text-align:center; }
        .cm-table tbody tr:nth-child(odd)  td { background:#fff; }
        .cm-table tbody tr:nth-child(even) td { background:#f8fafc; }
        .cm-table tbody tr:hover td { filter:brightness(.97); }
        .cm-table td { padding:10px 12px; color:#374151; font-size:12px; white-space:nowrap; }
        @media(min-width:768px){ .cm-table td { font-size:13px; padding:11px 16px; } }

        .cm-yarn-code {
          display:inline-block; font-family:'DM Mono',monospace; font-size:11px; font-weight:500;
          color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe;
          border-radius:6px; padding:2px 7px; letter-spacing:.03em;
        }
        .cm-chip { display:inline-block; padding:2px 9px; border-radius:20px; font-size:11px; font-weight:600; }
        .cm-chip-filament { background:#e0f2fe; color:#0369a1; }
        .cm-chip-spun     { background:#fef3c7; color:#b45309; }
        .cm-chip-wetspun  { background:#f3e8ff; color:#7c3aed; }
        .cm-chip-active   { background:#dcfce7; color:#166534; }
        .cm-chip-inactive { background:#fee2e2; color:#991b1b; }

        .cm-color-dot { width:12px; height:12px; border-radius:50%; display:inline-block; border:1px solid rgba(0,0,0,0.15); vertical-align:middle; margin-right:5px; }

        .cm-action-group { display:flex; align-items:center; gap:5px; justify-content:center; }
        .cm-btn-edit { display:inline-flex; align-items:center; gap:3px; background:#eff6ff; color:#2563eb; border:1px solid #93c5fd; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; touch-action:manipulation; }
        .cm-btn-edit:hover { background:#dbeafe; }
        .cm-btn-del  { display:inline-flex; align-items:center; gap:3px; background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; touch-action:manipulation; }
        .cm-btn-del:hover { background:#fee2e2; }
        .cm-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }

        .cm-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; font-family:'DM Sans',sans-serif; }
        .cm-pag-btns  { display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
        .cm-pag-btn   { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; font-family:'DM Sans',sans-serif; color:#1e293b; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; touch-action:manipulation; }
        .cm-pag-btn:hover:not(:disabled) { background:#f1f5f9; }
        .cm-pag-btn.active { background:#2563eb; color:#fff; border-color:#2563eb; font-weight:700; }
        .cm-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }

        .cm-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,.5); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:16px 8px; -webkit-overflow-scrolling:touch; }
        @media(min-width:576px){ .cm-modal-overlay { padding:24px 16px; } }
        .cm-modal { background:#fff; border-radius:14px; width:100%; max-width:960px; box-shadow:0 8px 40px rgba(0,0,0,.22); display:flex; flex-direction:column; max-height:calc(100vh - 32px); }
        .cm-modal-header { display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:#2563eb; border-radius:14px 14px 0 0; flex-shrink:0; }
        @media(min-width:576px){ .cm-modal-header { padding:16px 24px; } }
        .cm-modal-body   { padding:16px; overflow-y:auto; flex:1; -webkit-overflow-scrolling:touch; }
        @media(min-width:576px){ .cm-modal-body { padding:20px 24px; } }
        .cm-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 14px 14px; }

        .cm-grid { display:grid; grid-template-columns:1fr; gap:12px; padding:12px 0; }
        @media(min-width:480px){ .cm-grid { grid-template-columns:repeat(2,1fr); gap:14px; } }
        @media(min-width:768px){ .cm-grid { grid-template-columns:repeat(3,1fr); gap:14px 16px; } }
        .cm-col-full  { grid-column:1/-1; }
        .cm-col-span2 { grid-column:span 2; }

        .cm-btn-cancel { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; font-family:'DM Sans',sans-serif; }
        .cm-btn-save   { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#16a34a; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(22,163,74,.3); }
        .cm-btn-save:disabled { opacity:.7; cursor:not-allowed; }

        .cm-fiber-wrap  { overflow-x:auto; margin-top:10px; border-radius:10px; border:1px solid #e2e8f0; }
        .cm-fiber-table { width:100%; border-collapse:collapse; font-size:12px; min-width:660px; }
        .cm-fiber-table thead tr { background:#1e293b; }
        .cm-fiber-table th { padding:10px 12px; font-weight:700; font-size:11px; text-align:left; color:#94a3b8; text-transform:uppercase; letter-spacing:.06em; white-space:nowrap; }
        .cm-fiber-table th.required-col::after { content:' *'; color:#ef4444; }
        .cm-fiber-table tbody tr { border-bottom:1px solid #f1f5f9; transition:background .1s; }
        .cm-fiber-table tbody tr:last-child { border-bottom:none; }
        .cm-fiber-table tbody tr:hover { background:#f8fafc; }
        .cm-fiber-table td { padding:8px 10px; vertical-align:middle; }

        .fiber-text-input {
          width:100%; padding:7px 10px; border:1px solid #cbd5e1; border-radius:7px;
          font-size:12px; font-family:'DM Sans',sans-serif; color:#1e293b;
          background:#fff; outline:none; transition:border-color .15s, box-shadow .15s;
        }
        .fiber-text-input:focus { border-color:#2563eb; box-shadow:0 0 0 3px rgba(37,99,235,.1); }
        .fiber-text-input::placeholder { color:#94a3b8; }
        .fiber-text-input[type="number"] { font-family:'DM Mono',monospace; }

        .cert-chip {
          display:inline-flex; align-items:center; gap:4px;
          padding:3px 8px; border-radius:20px; font-size:11px; font-weight:600;
          cursor:pointer; user-select:none; transition:all .12s; border:1px solid;
        }
        .cert-chip:hover { filter:brightness(.94); transform:translateY(-1px); }

        .formula-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; font-family:'DM Mono',monospace; font-size:12px; color:#475569; min-height:36px; display:flex; align-items:center; }
        .hsn-selected-hint { margin-top:5px; display:flex; align-items:center; gap:6px; font-size:11px; color:#6d28d9; }

        select, input, textarea { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
      `}</style>

      <div className="cm-wrap">

        <div className="cm-tabs">
          {([
            ['yarn',        '🧵 Yarn Master'],
            ['yarntype',    '📋 Yarn Types'],
            ['countsystem', '📐 Count Systems'],
          ] as [string, string][]).map(([k, l]) => (
            <button key={k} className={`cm-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k as any)}>{l}</button>
          ))}
        </div>

        {tab === 'yarntype' && (
          <SimpleMaster<YarnType>
            title="Yarn Type Master"
            api={API_YT}
            blankRow={BLANK_YT}
            columns={[{ key: 'yarn_type', label: 'Yarn Type', required: true }]}
            pushToast={pushToast}
          />
        )}

        {tab === 'countsystem' && (
          <SimpleMaster<CountSys>
            title="Count System Master"
            api={API_CS}
            blankRow={BLANK_CS}
            columns={[
              { key: 'cs_name', label: 'CS Name',  required: true },
              { key: 'formula', label: 'Formula',   textarea: true },
            ]}
            pushToast={pushToast}
          />
        )}

        {tab === 'yarn' && (
          <>
            <div className="cm-page-header">
              <div>
                <h1>Yarn Master</h1>
                <p>{total} yarn{total !== 1 ? 's' : ''} registered</p>
              </div>
              <button className="cm-add-btn" onClick={openCreate}><Plus size={15} /> New Yarn</button>
            </div>

            <div className="cm-toolbar">
              <div className="cm-search-wrap" style={{ flexBasis: isMobile ? '100%' : undefined }}>
                <Search size={14} />
                <input className="cm-search" placeholder="Search code, short name, type…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="cm-filter-sel" value={filterCat} onChange={(e) => { setFilterCat(e.target.value); setPage(1); }}>
                  <option value=''>All Categories</option>
                  <option>Filament</option>
                  <option>Spun</option>
                  <option>Wet spun</option>
                </select>
                <select className="cm-filter-sel" value={filterSt} onChange={(e) => { setFilterSt(e.target.value); setPage(1); }}>
                  <option value=''>All Status</option>
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </div>
              <div className="cm-page-size">
                {!isMobile && <span>Show</span>}
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  {PAGE_OPTS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                {!isMobile && <span>entries</span>}
              </div>
            </div>

            <div className="cm-card">
              <div className="cm-table-wrap">
                <table className="cm-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Yarn Code</th>
                      <th>Category</th>
                      <th>Yarn Type</th>
                      {showCount && <th>Count</th>}
                      {showPly   && <th>Ply</th>}
                      {showUom   && <th>UOM</th>}
                      {showCS    && <th>Count System</th>}
                      {showShort && <th>Short Name</th>}
                      {showColor && <th>Color</th>}
                      <th>Status</th>
                      <th className="th-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={12} className="cm-empty">
                        <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
                      </td></tr>
                    ) : yarns.length === 0 ? (
                      <tr><td colSpan={12} className="cm-empty">
                        {search || filterCat || filterSt
                          ? 'No yarns match your search'
                          : 'No yarns yet. Click "New Yarn" to create one.'}
                      </td></tr>
                    ) : yarns.map((y, i) => (
                      <tr key={y.id}>
                        <td style={{ color: '#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                        <td><span className="cm-yarn-code">{y.yarn_code ?? '—'}</span></td>
                        <td>
                          <span className={`cm-chip cm-chip-${y.category === 'Filament' ? 'filament' : y.category === 'Spun' ? 'spun' : 'wetspun'}`}>
                            {y.category}
                          </span>
                        </td>
                        <td>{y.yarn_type || '—'}</td>
                        {showCount && <td style={{ fontFamily: 'DM Mono, monospace' }}>{y.count_value ?? '—'}</td>}
                        {showPly   && <td>{y.ply ?? '—'}</td>}
                        {showUom   && <td>{y.uom || '—'}</td>}
                        {showCS    && <td>{y.count_system_name || '—'}</td>}
                        {showShort && <td>{y.short_name || '—'}</td>}
                        {showColor && (
                          <td>
                            {y.color_name
                              ? <><span className="cm-color-dot" style={{ background: y.hex_code ?? '#e2e8f0' }} />{y.color_name}</>
                              : '—'}
                          </td>
                        )}
                        <td>
                          <span className={`cm-chip ${y.status === 'Active' ? 'cm-chip-active' : 'cm-chip-inactive'}`}>{y.status}</span>
                        </td>
                        <td>
                          <div className="cm-action-group">
                            <button className="cm-btn-edit" onClick={() => openEdit(y.id!)}>✏️ {!isMobile && 'Edit'}</button>
                            <button className="cm-btn-del"  onClick={() => handleDelete(y.id!)}>🗑 {!isMobile && 'Delete'}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!loading && total > 0 && (
                <div className="cm-pagination">
                  <span>Page {page} of {totalPages}</span>
                  <div className="cm-pag-btns">
                    <button className="cm-pag-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                    <button className="cm-pag-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
                    {pageNums.map((p) => (
                      <button key={p} className={`cm-pag-btn${p === page ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                    ))}
                    <button className="cm-pag-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
                    <button className="cm-pag-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
                  </div>
                </div>
              )}
            </div>

            {/* ── FORM MODAL ── */}
            {showForm && (
              <div className="cm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
                <div className="cm-modal">

                  <div className="cm-modal-header">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <h2 style={{ margin: 0, fontSize: isMobile ? 15 : 18, fontWeight: 700, color: '#fff' }}>
                        {editId ? '✏️ Edit Yarn' : '➕ New Yarn'}
                      </h2>
                      {editId && form.yarn_code && (
                        <span style={{ fontSize: 11, color: '#bfdbfe', fontFamily: 'DM Mono, monospace' }}>{form.yarn_code}</span>
                      )}
                    </div>
                    <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={20} color="#fff" /></button>
                  </div>

                  {error && (
                    <div style={s.errorBanner}>
                      <AlertCircle size={15} style={{ flexShrink: 0 }} />
                      <span>{error}</span>
                      <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#ef4444', display: 'flex', alignItems: 'center' }}>
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  <div className="cm-modal-body">

                    {/* Section 1: Basic Info */}
                    <SectionHead title="Basic Information" open={sec.basic} onToggle={() => toggle('basic')} />
                    {sec.basic && (
                      <div className="cm-grid">
                        <Field label="Category" required>
                          {sel('category', ['Filament', 'Spun', 'Wet spun'])}
                        </Field>
                        <Field label="Yarn Type" required>
                          <select value={form.yarn_type_id} onChange={(e) => set('yarn_type_id', e.target.value)} style={s.input}>
                            <option value=''>— Select Yarn Type —</option>
                            {lookup.yarnTypes.map((t) => <option key={t.id} value={String(t.id)}>{t.yarn_type}</option>)}
                          </select>
                        </Field>
                        <Field label="Short Name">{inp('short_name')}</Field>
                        <Field label="UOM" hint="unit of measure">{sel('uom', UOM_OPTS)}</Field>
                        <Field label="Color">
                          <select value={form.color_id} onChange={(e) => set('color_id', e.target.value)} style={s.input}>
                            <option value=''>— None —</option>
                            {lookup.colors.map((c) => <option key={c.id} value={String(c.id)}>{c.color_name}</option>)}
                          </select>
                        </Field>
                        <Field label="HSN Code">
                          <HsnDropdown
                            value={form.hsn_code_id}
                            onChange={(id) => set('hsn_code_id', id)}
                            hsnCodes={lookup.hsnCodes}
                            placeholder={lookup.hsnCodes.length === 0 ? 'No HSN codes — add via HSN Master' : 'Select HSN code…'}
                            portalZIndex={9500}
                          />
                          {selectedHsnOption?.description && (
                            <div className="hsn-selected-hint">
                              <span style={{ fontFamily: 'DM Mono,monospace', fontSize: 10, fontWeight: 700, background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd', borderRadius: 4, padding: '1px 5px' }}>
                                {selectedHsnOption.hsn_code}
                              </span>
                              <span style={{ color: '#64748b', fontSize: 11 }}>{selectedHsnOption.description}</span>
                            </div>
                          )}
                          {lookup.hsnCodes.length === 0 && (
                            <div style={{ marginTop: 4, fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <AlertTriangle size={11} />
                              <span>No HSN codes found. Add them via the HSN Master screen first.</span>
                            </div>
                          )}
                        </Field>
                        <Field label="Status">{sel('status', ['Active', 'Inactive'])}</Field>
                      </div>
                    )}

                    {/* Section 2: Fiber Composition */}
                    <SectionHead title="Fiber Composition" open={sec.fiber} onToggle={() => toggle('fiber')} />
                    {sec.fiber && (
                      <div style={s.subSection}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                          <FiberTotalBadge fibers={form.fibers} />
                          <button style={s.addRowBtn} onClick={addFiber}><PlusCircle size={14} /> Add Fiber</button>
                        </div>
                        <div className="cm-fiber-wrap">
                          <table className="cm-fiber-table">
                            <thead>
                              <tr>
                                <th style={{ width: 32, textAlign: 'center' }}>#</th>
                                <th style={{ minWidth: 140 }}>Brand</th>
                                <th style={{ minWidth: 150 }} className="required-col">Fiber</th>
                                <th style={{ width: 90 }}  className="required-col">Fiber %</th>
                                <th style={{ minWidth: 240 }}>Certifications (applicable to this fiber)</th>
                                <th style={{ width: 36 }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {form.fibers.map((f, i) => (
                                <tr key={i}>
                                  <td style={{ color: '#94a3b8', textAlign: 'center', fontSize: 11 }}>{i + 1}</td>
                                  <td><input type="text" className="fiber-text-input" value={f.brand_name} onChange={(e) => setFiber(i, 'brand_name', e.target.value)} placeholder="e.g. Lenzing" /></td>
                                  <td><input type="text" className="fiber-text-input" value={f.fiber_name} onChange={(e) => setFiber(i, 'fiber_name', e.target.value)} placeholder="e.g. Cotton" /></td>
                                  <td><input type="number" className="fiber-text-input" min="0" max="100" step="0.1" value={f.fiber_percentage} onChange={(e) => setFiber(i, 'fiber_percentage', e.target.value)} placeholder="0" /></td>
                                  <td>
                                    <CertChipSelector certifications={lookup.certifications} selectedIds={f.certification_ids} onToggle={(certId) => toggleCert(i, certId)} emptyLabel="—" />
                                  </td>
                                  <td>
                                    <button style={s.delRowBtn} onClick={() => delFiber(i)} disabled={form.fibers.length <= 1} title="Remove fiber">
                                      <Trash2 size={12} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Primary Fiber Certifications */}
                        <div style={{ marginTop: 16, background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Award size={14} color="#2563eb" style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>Primary Fiber Certifications</span>
                              <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>(Optional) — applicable to the primary / dominant fiber</span>
                            </div>
                            {form.primary_fiber_certification_ids.length > 0 && (
                              <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                                {form.primary_fiber_certification_ids.length} selected
                              </span>
                            )}
                          </div>
                          <div style={{ borderTop: '1px solid #dbeafe', marginBottom: 10 }} />
                          <CertChipSelector certifications={lookup.certifications} selectedIds={form.primary_fiber_certification_ids} onToggle={togglePrimaryCert} emptyLabel="No certifications found — add them in Certification Master first." />
                          {form.primary_fiber_certification_ids.length > 0 && (
                            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed #bfdbfe', fontSize: 11, color: '#3b82f6', lineHeight: 1.5 }}>
                              <strong style={{ color: '#1d4ed8' }}>Selected: </strong>
                              {form.primary_fiber_certification_ids.map((id) => lookup.certifications.find((c) => c.id === id)?.certification_name ?? `#${id}`).join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Section 3: Count & Ply */}
                    <SectionHead title="Count & Ply" open={sec.count} onToggle={() => toggle('count')} />
                    {sec.count && (
                      <div className="cm-grid">
                        <Field label="Count System" required>
                          <select value={form.count_system_id} onChange={(e) => { const cs = lookup.countSystems.find((c) => String(c.id) === e.target.value); set('count_system_id', e.target.value); set('formula', cs?.formula ?? ''); }} style={s.input}>
                            <option value=''>— Select Count System —</option>
                            {lookup.countSystems.map((c) => <option key={c.id} value={String(c.id)}>{c.cs_name}</option>)}
                          </select>
                        </Field>
                        <Field label="Count Value" required>{inp('count_value', 'number')}</Field>
                        <Field label="Ply" required>{inp('ply', 'number')}</Field>
                        <Field label="No. of Filaments">{inp('number_of_filament', 'number')}</Field>
                        <Field label="Actual Count">{inp('actual_count', 'number')}</Field>
                        <Field label="Yarn Count (Derived)">{inp('yarn_count', 'number')}</Field>
                        {form.formula && (
                          <div className="cm-col-full">
                            <Field label="Formula (auto-filled from Count System)">
                              <div className="formula-box">{form.formula}</div>
                            </Field>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Section 4: Twist */}
                    <SectionHead title="Twist (Optional)" open={sec.twist} onToggle={() => toggle('twist')} />
                    {sec.twist && (
                      <div className="cm-grid">
                        <Field label="Twist Unit">{sel('twist_unit', ['tpi', 'tpm'])}</Field>
                        <Field label="Twist Value">{inp('twist_value', 'number')}</Field>
                        <Field label="Twist Direction">{sel('twist_direction', ['S', 'Z'])}</Field>
                      </div>
                    )}

                  </div>

                  <div className="cm-modal-footer">
                    <button className="cm-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                    <button className="cm-btn-save" onClick={handleSave} disabled={saving}>
                      {saving
                        ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                        : (editId ? '✏️ Update' : '💾 Save Yarn')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  closeBtn: {
    background: 'none', border: 'none', padding: '0 4px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.85,
    touchAction: 'manipulation',
  },
  errorBanner: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
    color: '#ef4444', padding: '10px 16px', margin: '12px 16px 0',
    fontSize: 13, fontFamily: "'DM Sans',sans-serif",
  },
  label: {
    display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b',
    marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  input: {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid #cbd5e1', fontSize: 13, color: '#1e293b',
    outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s',
    background: '#fff',
  },
  sectionHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
    padding: '10px 14px', cursor: 'pointer', marginTop: 18, userSelect: 'none',
  },
  sectionTitle: { fontWeight: 700, fontSize: 13, color: '#1e293b' },
  subSection: {
    background: '#fafbfc', border: '1px solid #e2e8f0',
    borderRadius: 10, padding: 14, marginTop: 10,
  },
  addRowBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', touchAction: 'manipulation',
    whiteSpace: 'nowrap', flexShrink: 0,
  },
  delRowBtn: {
    background: '#fff1f2', color: '#ef4444', border: '1px solid #fca5a5',
    width: 30, height: 30, borderRadius: 7, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, touchAction: 'manipulation',
  },
  certEmptyState: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 11, color: '#94a3b8', fontStyle: 'italic', padding: '4px 0',
  },
};