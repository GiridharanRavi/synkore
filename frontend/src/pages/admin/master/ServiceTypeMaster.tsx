// frontend/src/pages/admin/ServiceTypeMaster.tsx
// Service Type Master — Full CRUD with rec_no auto-generation (SVC-YYYY-NNN)
// Matches ProcessingTypesMaster.tsx format exactly

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, X, Loader2, AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceType {
  id?:          number;
  rec_no?:      string;
  service_type: string;
  description:  string;
  status:       string;
  created_at?:  string;
  updated_at?:  string;
}

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const API = '/api/service-types';
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

export const SERVICE_TYPE_OPTIONS = [
  'Yarn',
  'Warper/Sizer',
  'Weaver',
  'Knitter',
  'Cut Butta',
  'Yarn Rewinding',
  'Processing',
  'Doubling',
  'Inspection',
] as const;

const BLANK: ServiceType = { service_type: '', description: '', status: 'Active' };

// ─── Toast ────────────────────────────────────────────────────────────────────

let _tid = 0;
function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++_tid;
    setToasts((p) => [...p, { id, type, title, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
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
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', pointerEvents: 'all', animation: 'toastIn 0.25s ease-out', fontFamily: "'DM Sans', sans-serif" }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: c.color }}>{t.title}</p>
              {t.message && <p style={{ margin: '2px 0 0', fontSize: 12, color: c.color, opacity: 0.8, lineHeight: 1.4 }}>{t.message}</p>}
            </div>
            <button onClick={() => onRemove(t.id)} style={{ flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.color, opacity: 0.6, display: 'flex', alignItems: 'center', marginTop: 1 }}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Responsive hook ──────────────────────────────────────────────────────────

function useWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return w;
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={s.label}>
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ServiceTypeMaster() {
  const [rows, setRows]         = useState<ServiceType[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [filterSt, setFilterSt] = useState('');
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<ServiceType>(BLANK);
  const [editId, setEditId]     = useState<number | null>(null);
  const [error, setError]       = useState('');
  // Whether user chose "Custom" from the preset dropdown
  const [isCustomName, setIsCustomName] = useState(false);

  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const width    = useWidth();
  const isMobile = width < 576;

  // ── Load ────────────────────────────────────────────────────────────────────

  const loadRows = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        search, page: String(page), limit: String(pageSize),
        ...(filterSt ? { status: filterSt } : {}),
      });
      const res  = await fetch(`${API}?${qs}`);
      const data = await res.json();
      setRows(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      pushToast('error', 'Load Failed', 'Could not fetch service types. Please try again.');
    }
    setLoading(false);
  };

  useEffect(() => { loadRows(); }, [search, filterSt, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, filterSt]);
  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showForm]);

  // ── Open form ──────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(BLANK); setEditId(null); setError('');
    setIsCustomName(false); setShowForm(true);
  };

  const openEdit = async (id: number) => {
    try {
      const res  = await fetch(`${API}/${id}`);
      const data = await res.json();
      setForm({ ...data });
      // If the stored name doesn't match any preset, it's custom
      const isPreset = (SERVICE_TYPE_OPTIONS as readonly string[]).includes(data.service_type);
      setIsCustomName(!isPreset);
      setEditId(id); setError(''); setShowForm(true);
    } catch {
      pushToast('error', 'Load Failed', 'Could not load service type details.');
    }
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.service_type.trim()) { setError('Service Type is required'); return; }
    setError(''); setSaving(true);
    try {
      const res = await fetch(editId ? `${API}/${editId}` : API, {
        method:  editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          service_type: form.service_type.trim(),
          description:  form.description.trim(),
          status:       form.status,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message ?? 'Save failed');
      }
      pushToast(
        'success',
        editId ? 'Service Type Updated' : 'Service Type Created',
        `"${form.service_type}" has been ${editId ? 'updated' : 'saved'} successfully.`,
      );
      setShowForm(false);
      loadRows();
    } catch (e: any) {
      const msg = e.message ?? 'Save failed';
      setError(msg);
      pushToast('error', 'Save Failed', msg);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      pushToast('success', 'Type Deleted', `"${name}" has been removed.`);
      loadRows();
    } catch {
      pushToast('error', 'Delete Failed', 'Could not delete service type. Please try again.');
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const set = (key: keyof ServiceType, val: any) => setForm((f) => ({ ...f, [key]: val }));

  // Handle preset dropdown selection
  const handleNameSelect = (val: string) => {
    if (val === '__custom__') {
      setIsCustomName(true);
      set('service_type', '');
    } else {
      setIsCustomName(false);
      set('service_type', val);
    }
  };

  // Pagination
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNums   = (() => {
    const pages: number[] = [];
    let start = Math.max(1, page - 2);
    const end  = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  })();
  const goTo = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  // Derive current selected preset value
  const presetValue = isCustomName
    ? '__custom__'
    : ((SERVICE_TYPE_OPTIONS as readonly string[]).includes(form.service_type) ? form.service_type : '');

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes toastIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
        @keyframes spin     { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }

        .stm-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }

        .stm-page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
        .stm-page-header h1 { margin:0; font-size:20px; font-weight:700; color:#1e293b; }
        .stm-page-header p  { margin:3px 0 0; font-size:13px; color:#64748b; }
        @media(min-width:576px){ .stm-page-header h1 { font-size:22px; } }

        .stm-add-btn { display:flex; align-items:center; gap:6px; background:#2563eb; color:#fff; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(37,99,235,0.3); white-space:nowrap; flex-shrink:0; touch-action:manipulation; }
        .stm-add-btn:hover { background:#1d4ed8; }

        .stm-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .stm-search-wrap { position:relative; flex:1; min-width:180px; max-width:100%; }
        @media(min-width:768px){ .stm-search-wrap { max-width:320px; } }
        .stm-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .stm-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; outline:none; }
        .stm-search:focus { border-color:#2563eb; }

        .stm-filter-sel { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#374151; cursor:pointer; outline:none; max-width:150px; }
        .stm-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; flex-shrink:0; }
        .stm-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; }

        .stm-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:24px; }
        .stm-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }

        .stm-table { width:100%; border-collapse:collapse; font-size:13px; font-family:'DM Sans',sans-serif; min-width:480px; }
        .stm-table thead tr { background:#2563eb; }
        .stm-table th { padding:11px 12px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:12px; }
        @media(min-width:768px){ .stm-table th { font-size:13px; padding:12px 16px; } }
        .stm-table th.th-center { text-align:center; }

        .stm-table tbody tr:nth-child(odd)  td { background:#fff; }
        .stm-table tbody tr:nth-child(even) td { background:#f8fafc; }
        .stm-table tbody tr:hover td { filter:brightness(0.97); }
        .stm-table td { padding:10px 12px; color:#374151; font-size:12px; white-space:nowrap; }
        @media(min-width:768px){ .stm-table td { font-size:13px; padding:11px 16px; } }

        .stm-rec-id { display:inline-block; font-family:'DM Mono',monospace; font-size:11px; font-weight:500; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:2px 7px; letter-spacing:0.03em; }

        .stm-chip { display:inline-block; padding:2px 9px; border-radius:20px; font-size:11px; font-weight:600; }
        .stm-chip-active   { background:#dcfce7; color:#166534; }
        .stm-chip-inactive { background:#fee2e2; color:#991b1b; }

        .stm-svc-badge { display:inline-block; background:#ede9fe; color:#6d28d9; border:1px solid #c4b5fd; border-radius:6px; padding:3px 10px; font-size:11px; font-weight:600; max-width:200px; overflow:hidden; text-overflow:ellipsis; }

        .stm-desc { max-width:220px; overflow:hidden; text-overflow:ellipsis; color:#64748b; }

        .stm-action-group { display:flex; align-items:center; gap:5px; justify-content:center; }
        .stm-btn-edit { display:inline-flex; align-items:center; gap:3px; background:#eff6ff; color:#2563eb; border:1px solid #93c5fd; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; touch-action:manipulation; }
        .stm-btn-edit:hover { background:#dbeafe; }
        .stm-btn-del  { display:inline-flex; align-items:center; gap:3px; background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; touch-action:manipulation; }
        .stm-btn-del:hover  { background:#fee2e2; }

        .stm-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }

        .stm-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; font-family:'DM Sans',sans-serif; }
        @media(min-width:576px){ .stm-pagination { padding:10px 16px; font-size:13px; } }
        .stm-pag-btns { display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
        .stm-pag-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; font-family:'DM Sans',sans-serif; color:#1e293b; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; touch-action:manipulation; }
        .stm-pag-btn:hover:not(:disabled) { background:#f1f5f9; }
        .stm-pag-btn.active { background:#2563eb; color:#fff; border-color:#2563eb; font-weight:700; }
        .stm-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }

        .stm-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:16px 8px; -webkit-overflow-scrolling:touch; }
        @media(min-width:576px){ .stm-modal-overlay { padding:24px 16px; } }

        .stm-modal { background:#fff; border-radius:14px; width:100%; max-width:600px; box-shadow:0 8px 40px rgba(0,0,0,0.22); display:flex; flex-direction:column; max-height:calc(100vh - 32px); }
        @media(min-width:576px){ .stm-modal { border-radius:16px; max-height:calc(100vh - 48px); } }

        .stm-modal-header { display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:#2563eb; border-radius:14px 14px 0 0; flex-shrink:0; }
        @media(min-width:576px){ .stm-modal-header { padding:16px 24px; border-radius:16px 16px 0 0; } }

        .stm-modal-body { padding:16px; overflow-y:auto; flex:1; -webkit-overflow-scrolling:touch; }
        @media(min-width:576px){ .stm-modal-body { padding:20px 24px; } }

        .stm-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 14px 14px; }
        @media(min-width:576px){ .stm-modal-footer { padding:14px 24px; border-radius:0 0 16px 16px; } }

        .stm-grid { display:grid; grid-template-columns:1fr; gap:14px; padding:12px 0; }
        @media(min-width:480px){ .stm-grid { grid-template-columns:repeat(2,1fr); } }

        .stm-col-full { grid-column:1/-1; }

        .stm-preset-hint { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
        .stm-preset-pill { background:#f5f3ff; border:1px solid #c4b5fd; color:#6d28d9; font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px; }

        .stm-btn-cancel { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; font-family:'DM Sans',sans-serif; touch-action:manipulation; }
        .stm-btn-save { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#16a34a; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(22,163,74,0.3); touch-action:manipulation; }
        .stm-btn-save:disabled { opacity:0.7; cursor:not-allowed; }

        select,input,textarea { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
      `}</style>

      <div className="stm-wrap">

        {/* ── PAGE HEADER ── */}
        <div className="stm-page-header">
          <div>
            <h1>Service Type Master</h1>
            <p>{total} service type{total !== 1 ? 's' : ''} registered</p>
          </div>
          <button className="stm-add-btn" onClick={openCreate}>
            <Plus size={15} /> New Service Type
          </button>
        </div>

        {/* ── TOOLBAR ── */}
        <div className="stm-toolbar">
          <div className="stm-search-wrap" style={{ flexBasis: isMobile ? '100%' : undefined }}>
            <Search size={14} />
            <input
              className="stm-search"
              placeholder="Search service type or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="stm-filter-sel" value={filterSt} onChange={(e) => { setFilterSt(e.target.value); setPage(1); }}>
            <option value=''>All Status</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
          {!isMobile && <span style={{ fontSize: 12, color: '#64748b' }}>{total} record(s)</span>}
          <div className="stm-page-size">
            {!isMobile && <span>Show</span>}
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>

        {isMobile && <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{total} record(s)</p>}

        {/* ── TABLE CARD ── */}
        <div className="stm-card">
          <div className="stm-table-wrap">
            <table className="stm-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }}>#</th>
                  <th style={{ width: 110 }}>Rec No</th>
                  <th>Service Type</th>
                  {!isMobile && <th>Description</th>}
                  <th style={{ width: 100 }}>Status</th>
                  <th className="th-center" style={{ width: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="stm-empty">
                    <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
                  </td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="stm-empty">
                    {search || filterSt
                      ? 'No types match your search.'
                      : 'No service types yet. Click "New Service Type" to add one.'}
                  </td></tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={r.id}>
                      <td style={{ color: '#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                      <td><span className="stm-rec-id">{r.rec_no ?? '—'}</span></td>
                      <td><span className="stm-svc-badge">{r.service_type}</span></td>
                      {!isMobile && <td className="stm-desc">{r.description || '—'}</td>}
                      <td>
                        <span className={`stm-chip ${r.status === 'Active' ? 'stm-chip-active' : 'stm-chip-inactive'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        <div className="stm-action-group">
                          <button className="stm-btn-edit" onClick={() => openEdit(r.id!)}>✏️ {!isMobile && 'Edit'}</button>
                          <button className="stm-btn-del"  onClick={() => handleDelete(r.id!, r.service_type)}>🗑 {!isMobile && 'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── PAGINATION ── */}
          {!loading && total > 0 && (
            <div className="stm-pagination">
              <span>Page {page} of {totalPages}</span>
              <div className="stm-pag-btns">
                <button className="stm-pag-btn" onClick={() => goTo(1)}         disabled={page === 1}>«</button>
                <button className="stm-pag-btn" onClick={() => goTo(page - 1)}  disabled={page === 1}>‹</button>
                {pageNums.map((p) => (
                  <button key={p} className={`stm-pag-btn${p === page ? ' active' : ''}`} onClick={() => goTo(p)}>{p}</button>
                ))}
                <button className="stm-pag-btn" onClick={() => goTo(page + 1)}  disabled={page === totalPages}>›</button>
                <button className="stm-pag-btn" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* ── MODAL ── */}
        {showForm && (
          <div className="stm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="stm-modal">

              {/* Header */}
              <div className="stm-modal-header">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <h2 style={{ margin: 0, fontSize: isMobile ? 15 : 18, fontWeight: 700, color: '#fff' }}>
                    {editId ? '✏️ Edit Service Type' : '➕ New Service Type'}
                  </h2>
                  {editId && form.rec_no && (
                    <span style={{ fontSize: 11, color: '#bfdbfe', fontFamily: 'DM Mono, monospace' }}>
                      Rec No: {form.rec_no}
                    </span>
                  )}
                </div>
                <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={20} color="#fff" /></button>
              </div>

              {/* Inline Error Banner */}
              {error && (
                <div style={s.errorBanner}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                  <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#ef4444', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Body */}
              <div className="stm-modal-body">
                <div className="stm-grid">

                  {/* Rec No — read-only auto */}
                  <Field label="Rec No">
                    <input
                      type="text"
                      value={editId ? (form.rec_no ?? '') : 'Auto-generated'}
                      readOnly
                      style={{ ...s.input, background: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed' }}
                    />
                  </Field>

                  {/* Status */}
                  <Field label="Status">
                    <select value={form.status} onChange={(e) => set('status', e.target.value)} style={s.input}>
                      <option>Active</option>
                      <option>Inactive</option>
                    </select>
                  </Field>

                  {/* Service Type — full width, preset dropdown + optional custom */}
                  <div className="stm-col-full">
                    <Field label="Service Type" required>
                      <select
                        value={presetValue}
                        onChange={(e) => handleNameSelect(e.target.value)}
                        style={s.input}
                      >
                        <option value=''>— Select Service Type —</option>
                        {SERVICE_TYPE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                        <option value='__custom__'>Custom (enter manually)…</option>
                      </select>
                    </Field>

                    {/* Custom name input — shown only when "Custom" is selected */}
                    {isCustomName && (
                      <div style={{ marginTop: 8 }}>
                        <input
                          type="text"
                          placeholder="Enter custom service type name"
                          value={form.service_type}
                          onChange={(e) => set('service_type', e.target.value)}
                          style={s.input}
                          autoFocus
                        />
                      </div>
                    )}

                    {/* Preset pills hint */}
                    {!isCustomName && (
                      <div style={{ marginTop: 10 }}>
                        <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Standard options:
                        </p>
                        <div className="stm-preset-hint">
                          {SERVICE_TYPE_OPTIONS.map((opt, i) => (
                            <span
                              key={opt}
                              className="stm-preset-pill"
                              style={{ cursor: 'pointer' }}
                              onClick={() => handleNameSelect(opt)}
                            >
                              {i + 1}. {opt}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Description — full width */}
                  <div className="stm-col-full">
                    <Field label="Description">
                      <textarea
                        value={form.description}
                        onChange={(e) => set('description', e.target.value)}
                        placeholder="Optional — describe the service type, scope, or usage context."
                        style={{ ...s.input, height: 88, resize: 'vertical' }}
                      />
                    </Field>
                  </div>

                </div>
              </div>

              {/* Footer */}
              <div className="stm-modal-footer">
                <button className="stm-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="stm-btn-save" onClick={handleSave} disabled={saving}>
                  {saving
                    ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                    : (editId ? '✏️ Update' : '💾 Save Type')}
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
  closeBtn: {
    background: 'none', border: 'none', padding: '0 4px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.85,
    touchAction: 'manipulation',
  },
  errorBanner: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
    color: '#ef4444', padding: '10px 16px', margin: '12px 16px 0', fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
  },
  label: {
    display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b',
    marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  input: {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid #cbd5e1', fontSize: 13, color: '#1e293b',
    outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
    background: '#fff',
  },
};