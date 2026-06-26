// frontend/src/pages/admin/HsnMaster.tsx
// HSN Master — standalone page, consistent with CustomerMaster/CertificationMaster design system

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, X, Loader2,
  AlertCircle, CheckCircle2, Info, AlertTriangle,
  ChevronDown, ChevronUp,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────

interface HsnCode {
  id?: number;
  hsn_id?: string;
  hsn_code: string;
  hsn_short_desc: string;
  hsn_long_desc: string;
  gst_percent: string;
  status: string;
}

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string }

// ─── Toast ───────────────────────────────────────────────────

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
    success: { bg:'#f0fdf4', border:'#86efac', color:'#166534', icon:<CheckCircle2 size={16} color="#16a34a"/> },
    error:   { bg:'#fef2f2', border:'#fca5a5', color:'#991b1b', icon:<AlertCircle  size={16} color="#dc2626"/> },
    warning: { bg:'#fffbeb', border:'#fde68a', color:'#92400e', icon:<AlertTriangle size={16} color="#d97706"/> },
    info:    { bg:'#eff6ff', border:'#93c5fd', color:'#1e40af', icon:<Info          size={16} color="#2563eb"/> },
  };
  if (!toasts.length) return null;
  return (
    <div style={{ position:'fixed', top:20, right:20, zIndex:9999, display:'flex', flexDirection:'column', gap:10, maxWidth:360, width:'calc(100vw - 40px)', pointerEvents:'none' }}>
      {toasts.map((t) => {
        const c = cfg[t.type];
        return (
          <div key={t.id} style={{ display:'flex', alignItems:'flex-start', gap:10, background:c.bg, border:`1px solid ${c.border}`, borderRadius:10, padding:'12px 14px', boxShadow:'0 4px 16px rgba(0,0,0,0.12)', pointerEvents:'all', animation:'toastIn 0.25s ease-out', fontFamily:"'DM Sans',sans-serif" }}>
            <span style={{ flexShrink:0, marginTop:1 }}>{c.icon}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontSize:13, fontWeight:700, color:c.color }}>{t.title}</p>
              {t.message && <p style={{ margin:'2px 0 0', fontSize:12, color:c.color, opacity:0.8 }}>{t.message}</p>}
            </div>
            <button onClick={() => onRemove(t.id)} style={{ background:'none', border:'none', padding:0, cursor:'pointer', color:c.color, opacity:0.6, display:'flex', alignItems:'center', flexShrink:0 }}><X size={14}/></button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Constants ───────────────────────────────────────────────

const BLANK: HsnCode = {
  hsn_code: '', hsn_short_desc: '', hsn_long_desc: '', gst_percent: '0', status: 'Active',
};

const API  = '/api/hsn';
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

const GST_RATES = ['0', '0.1', '0.25', '1', '1.5', '3', '5', '7.5', '12', '18', '28'];

function useWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return w;
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={s.label}>{label}{required && <span style={{ color:'#ef4444' }}> *</span>}</label>
      {children}
      {hint && <p style={{ margin:'4px 0 0', fontSize:11, color:'#94a3b8', lineHeight:1.4 }}>{hint}</p>}
    </div>
  );
}

// ─── GST badge ───────────────────────────────────────────────

function GstBadge({ pct }: { pct: string }) {
  const n = parseFloat(pct);
  let bg = '#f1f5f9', color = '#475569';
  if (n === 0)       { bg = '#f0fdf4'; color = '#166534'; }
  else if (n <= 5)   { bg = '#eff6ff'; color = '#1d4ed8'; }
  else if (n <= 12)  { bg = '#fef3c7'; color = '#b45309'; }
  else if (n <= 18)  { bg = '#fff1f2'; color = '#dc2626'; }
  else               { bg = '#fdf2f8'; color = '#9d174d'; }
  return (
    <span style={{ display:'inline-block', padding:'2px 9px', borderRadius:20, fontSize:12, fontWeight:700, background:bg, color }}>
      {n}%
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────

export default function HsnMaster() {
  const [rows, setRows]         = useState<HsnCode[]>([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [filterSt, setFilterSt] = useState('');
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<HsnCode>(BLANK);
  const [editId, setEditId]     = useState<number | null>(null);
  const [error, setError]       = useState('');
  const [showDesc, setShowDesc] = useState(true);

  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const width    = useWidth();
  const isMobile = width < 576;

  // ── Load ────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ search, page: String(page), limit: String(pageSize), ...(filterSt ? { status: filterSt } : {}) });
      const res  = await fetch(`${API}?${qs}`);
      const data = await res.json();
      setRows(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch { pushToast('error', 'Load Failed', 'Could not fetch HSN codes.'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [search, filterSt, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, filterSt]);
  useEffect(() => { document.body.style.overflow = showForm ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [showForm]);

  // ── Open form ───────────────────────────────────────────────
  const openCreate = () => { setForm(BLANK); setEditId(null); setError(''); setShowForm(true); };
  const openEdit = async (id: number) => {
    try {
      const res  = await fetch(`${API}/${id}`);
      const data = await res.json();
      setForm({ ...data, gst_percent: String(data.gst_percent ?? '0') });
      setEditId(id); setError(''); setShowForm(true);
    } catch { pushToast('error', 'Load Failed', 'Could not load HSN code.'); }
  };

  // ── Validate HSN code ────────────────────────────────────────
  const validateHsn = (code: string): string | null => {
    if (!code.trim()) return 'HSN code is required';
    if (!/^\d+$/.test(code)) return 'HSN code must contain digits only';
    if (code.length < 4 || code.length > 8) return 'HSN code must be 4 to 8 digits';
    return null;
  };

  // ── Save ────────────────────────────────────────────────────
  const handleSave = async () => {
    const hsnErr = validateHsn(form.hsn_code);
    if (hsnErr) { setError(hsnErr); return; }
    if (!form.hsn_short_desc.trim()) { setError('Short description is required'); return; }
    setError(''); setSaving(true);
    try {
      const body = { ...form, gst_percent: parseFloat(form.gst_percent) || 0 };
      const res = await fetch(editId ? `${API}/${editId}` : API, {
        method:  editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? 'Save failed');
      }
      pushToast('success', editId ? 'HSN Updated' : 'HSN Created', `HSN ${form.hsn_code} saved successfully.`);
      setShowForm(false); load();
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
      pushToast('error', 'Save Failed', e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this HSN code?')) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      pushToast('success', 'Deleted', 'HSN code removed.');
      load();
    } catch { pushToast('error', 'Delete Failed', 'Could not delete HSN code.'); }
  };

  const set = (k: keyof HsnCode, v: any) => setForm((f) => ({ ...f, [k]: v }));

  // ── HSN code input with live digit count ────────────────────
  const hsnLen = form.hsn_code.replace(/\D/g, '').length;
  const hsnOk  = hsnLen >= 4 && hsnLen <= 8;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNums = (() => {
    const pages: number[] = [];
    let start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  })();

  const showShort   = !isMobile;
  const showGstCol  = width >= 480;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes toastIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .hsn-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }
        .hsn-page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
        .hsn-page-header h1 { margin:0; font-size:20px; font-weight:700; }
        .hsn-page-header p  { margin:3px 0 0; font-size:13px; color:#64748b; }
        .hsn-add-btn { display:flex; align-items:center; gap:6px; background:#7c3aed; color:#fff; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(124,58,237,0.3); white-space:nowrap; }
        .hsn-add-btn:hover { background:#6d28d9; }
        .hsn-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .hsn-search-wrap { position:relative; flex:1; min-width:180px; max-width:340px; }
        .hsn-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .hsn-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; outline:none; }
        .hsn-search:focus { border-color:#7c3aed; }
        .hsn-filter-sel { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#374151; cursor:pointer; outline:none; }
        .hsn-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; }
        .hsn-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; }
        .hsn-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:24px; }
        .hsn-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .hsn-table { width:100%; border-collapse:collapse; font-size:13px; font-family:'DM Sans',sans-serif; min-width:400px; }
        .hsn-table thead tr { background:#7c3aed; }
        .hsn-table th { padding:11px 14px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:12px; }
        .hsn-table th.th-c { text-align:center; }
        .hsn-table tbody tr:nth-child(odd)  td { background:#fff; }
        .hsn-table tbody tr:nth-child(even) td { background:#faf9ff; }
        .hsn-table tbody tr:hover td { filter:brightness(0.97); }
        .hsn-table td { padding:10px 14px; color:#374151; font-size:13px; white-space:nowrap; }
        .hsn-id-chip { display:inline-block; font-family:'DM Mono',monospace; font-size:11px; font-weight:500; color:#6d28d9; background:#f5f3ff; border:1px solid #ddd6fe; border-radius:6px; padding:2px 7px; letter-spacing:0.03em; }
        .hsn-code-chip { display:inline-block; font-family:'DM Mono',monospace; font-size:13px; font-weight:700; color:#1e293b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:3px 10px; letter-spacing:0.08em; }
        .hsn-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }
        .hsn-action-group { display:flex; align-items:center; gap:5px; justify-content:center; }
        .hsn-btn-edit { display:inline-flex; align-items:center; gap:3px; background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe; padding:4px 9px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; }
        .hsn-btn-edit:hover { background:#ede9fe; }
        .hsn-btn-del { display:inline-flex; align-items:center; gap:3px; background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; padding:4px 9px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; }
        .hsn-btn-del:hover { background:#fee2e2; }
        .hsn-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; font-family:'DM Sans',sans-serif; }
        .hsn-pag-btns { display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
        .hsn-pag-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; font-family:'DM Sans',sans-serif; color:#1e293b; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; }
        .hsn-pag-btn:hover:not(:disabled) { background:#f1f5f9; }
        .hsn-pag-btn.active { background:#7c3aed; color:#fff; border-color:#7c3aed; font-weight:700; }
        .hsn-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }
        .hsn-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:16px 8px; -webkit-overflow-scrolling:touch; }
        @media(min-width:576px){ .hsn-modal-overlay{padding:24px 16px;} }
        .hsn-modal { background:#fff; border-radius:16px; width:100%; max-width:640px; box-shadow:0 8px 40px rgba(0,0,0,0.22); display:flex; flex-direction:column; max-height:calc(100vh - 32px); }
        .hsn-modal-header { display:flex; justify-content:space-between; align-items:center; padding:14px 20px; background:#7c3aed; border-radius:16px 16px 0 0; flex-shrink:0; }
        .hsn-modal-body { padding:16px 20px; overflow-y:auto; flex:1; -webkit-overflow-scrolling:touch; }
        .hsn-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 20px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 16px 16px; }
        .hsn-grid { display:grid; grid-template-columns:1fr; gap:14px; padding:14px 0; }
        @media(min-width:480px){ .hsn-grid{grid-template-columns:repeat(2,1fr);} }
        .hsn-col-full { grid-column:1/-1; }
        .hsn-btn-cancel { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; font-family:'DM Sans',sans-serif; }
        .hsn-btn-save { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#7c3aed; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(124,58,237,0.3); }
        .hsn-btn-save:disabled { opacity:0.7; cursor:not-allowed; }
        .hsn-char-count { font-size:11px; font-weight:700; padding:2px 7px; border-radius:12px; margin-left:auto; }
        select,input,textarea { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar{width:5px;height:5px} ::-webkit-scrollbar-track{background:#f1f5f9} ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
      `}</style>

      <div className="hsn-wrap">

        {/* PAGE HEADER */}
        <div className="hsn-page-header">
          <div>
            <h1>HSN Master</h1>
            <p>{total} HSN code{total !== 1 ? 's' : ''} configured</p>
          </div>
          <button className="hsn-add-btn" onClick={openCreate}>
            <Plus size={15} /> New HSN Code
          </button>
        </div>

        {/* TOOLBAR */}
        <div className="hsn-toolbar">
          <div className="hsn-search-wrap">
            <Search size={14} />
            <input className="hsn-search" placeholder="Search HSN code, description, ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="hsn-filter-sel" value={filterSt} onChange={(e) => { setFilterSt(e.target.value); setPage(1); }}>
            <option value=''>All Status</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
          {!isMobile && <span style={{ fontSize:12, color:'#64748b' }}>{total} record(s)</span>}
          <div className="hsn-page-size">
            {!isMobile && <span>Show</span>}
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>

        {/* TABLE CARD */}
        <div className="hsn-card">
          <div className="hsn-table-wrap">
            <table className="hsn-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Rec. ID</th>
                  <th>HSN Code</th>
                  {showShort && <th>Short Description</th>}
                  {showGstCol && <th>GST %</th>}
                  <th>Status</th>
                  <th className="th-c">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="hsn-empty">
                    <Loader2 size={22} style={{ animation:'spin 1s linear infinite', display:'inline-block' }} />
                  </td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} className="hsn-empty">
                    {search || filterSt ? 'No HSN codes match your search' : 'No HSN codes yet. Click "New HSN Code" to create one.'}
                  </td></tr>
                ) : (
                  rows.map((c, i) => (
                    <tr key={c.id}>
                      <td style={{ color:'#94a3b8' }}>{(page-1)*pageSize + i + 1}</td>
                      <td><span className="hsn-id-chip">{c.hsn_id ?? '—'}</span></td>
                      <td><span className="hsn-code-chip">{c.hsn_code}</span></td>
                      {showShort && <td style={{ maxWidth:220, overflow:'hidden', textOverflow:'ellipsis' }}>{c.hsn_short_desc}</td>}
                      {showGstCol && <td><GstBadge pct={String(c.gst_percent)} /></td>}
                      <td>
                        <span style={{ display:'inline-block', padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:700, background: c.status==='Active'?'#dcfce7':'#fee2e2', color: c.status==='Active'?'#166534':'#991b1b' }}>
                          {c.status}
                        </span>
                      </td>
                      <td>
                        <div className="hsn-action-group">
                          <button className="hsn-btn-edit" onClick={() => openEdit(c.id!)}>✏️{!isMobile && ' Edit'}</button>
                          <button className="hsn-btn-del"  onClick={() => handleDelete(c.id!)}>🗑{!isMobile && ' Del'}</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION */}
          {!loading && total > 0 && (
            <div className="hsn-pagination">
              <span>Page {page} of {totalPages}</span>
              <div className="hsn-pag-btns">
                <button className="hsn-pag-btn" onClick={() => setPage(1)} disabled={page===1}>«</button>
                <button className="hsn-pag-btn" onClick={() => setPage(p=>p-1)} disabled={page===1}>‹</button>
                {pageNums.map((p) => (
                  <button key={p} className={`hsn-pag-btn${p===page?' active':''}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="hsn-pag-btn" onClick={() => setPage(p=>p+1)} disabled={page===totalPages}>›</button>
                <button className="hsn-pag-btn" onClick={() => setPage(totalPages)} disabled={page===totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* MODAL */}
        {showForm && (
          <div className="hsn-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="hsn-modal">

              {/* Header */}
              <div className="hsn-modal-header">
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  <h2 style={{ margin:0, fontSize:isMobile?15:18, fontWeight:700, color:'#fff' }}>
                    {editId ? '✏️ Edit HSN Code' : '➕ New HSN Code'}
                  </h2>
                  {editId && form.hsn_id && (
                    <span style={{ fontSize:11, color:'#ddd6fe', fontFamily:'DM Mono,monospace' }}>{form.hsn_id}</span>
                  )}
                </div>
                <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={20} color="#fff" /></button>
              </div>

              {/* Inline error */}
              {error && (
                <div style={s.errorBanner}>
                  <AlertCircle size={15} style={{ flexShrink:0 }} />
                  <span>{error}</span>
                  <button onClick={() => setError('')} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', padding:0, color:'#ef4444', display:'flex', alignItems:'center' }}><X size={14}/></button>
                </div>
              )}

              {/* Body */}
              <div className="hsn-modal-body">

                {/* Section: HSN Details */}
                <div style={s.sectionHead} onClick={() => setShowDesc((p) => !p)}>
                  <span style={s.sectionTitle}>HSN Code Details</span>
                  {showDesc ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>

                {showDesc && (
                  <div className="hsn-grid">
                    {/* HSN Code with live digit counter */}
                    <div>
                      <label style={s.label}>HSN Code <span style={{ color:'#ef4444' }}>*</span></label>
                      <div style={{ position:'relative' }}>
                        <input
                          type="text"
                          maxLength={8}
                          value={form.hsn_code}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '').slice(0, 8);
                            set('hsn_code', v);
                          }}
                          style={{ ...s.input, paddingRight:52, fontFamily:'DM Mono,monospace', fontWeight:700, fontSize:15, letterSpacing:'0.1em' }}
                          placeholder="e.g. 5208"
                        />
                        <span className="hsn-char-count" style={{
                          position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                          background: hsnOk ? '#dcfce7' : (hsnLen === 0 ? '#f1f5f9' : '#fee2e2'),
                          color: hsnOk ? '#166534' : (hsnLen === 0 ? '#94a3b8' : '#dc2626'),
                        }}>{hsnLen}/8</span>
                      </div>
                      <p style={{ margin:'4px 0 0', fontSize:11, color:'#94a3b8' }}>4 to 8 numeric digits only (e.g. 5208, 52081100)</p>
                    </div>

                    {/* GST % */}
                    <Field label="GST %" required>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        <select value={form.gst_percent} onChange={(e) => set('gst_percent', e.target.value)} style={{ ...s.input, flex:2, minWidth:100 }}>
                          {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                        </select>
                        {/* Show badge preview */}
                        <div style={{ display:'flex', alignItems:'center' }}>
                          <GstBadge pct={form.gst_percent} />
                        </div>
                      </div>
                      <p style={{ margin:'4px 0 0', fontSize:11, color:'#94a3b8' }}>Standard GST slab rate</p>
                    </Field>

                    {/* Short Description */}
                    <div className="hsn-col-full">
                      <Field label="Short Description" required>
                        <input
                          type="text"
                          value={form.hsn_short_desc}
                          onChange={(e) => set('hsn_short_desc', e.target.value)}
                          style={s.input}
                          placeholder="Brief product/service description"
                        />
                      </Field>
                    </div>

                    {/* Long Description */}
                    <div className="hsn-col-full">
                      <Field label="Long Description">
                        <textarea
                          value={form.hsn_long_desc}
                          onChange={(e) => set('hsn_long_desc', e.target.value)}
                          style={{ ...s.input, height:90, resize:'vertical' }}
                          placeholder="Detailed description of goods/services covered under this HSN code…"
                        />
                      </Field>
                    </div>

                    {/* Status */}
                    <Field label="Status">
                      <select value={form.status} onChange={(e) => set('status', e.target.value)} style={s.input}>
                        <option>Active</option>
                        <option>Inactive</option>
                      </select>
                    </Field>

                  </div>
                )}

                {/* Info box */}
                <div style={{ display:'flex', gap:10, alignItems:'flex-start', background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:10, padding:'12px 14px', marginTop:16 }}>
                  <Info size={15} style={{ color:'#7c3aed', flexShrink:0, marginTop:1 }} />
                  <div style={{ fontSize:12, color:'#4c1d95', lineHeight:1.6 }}>
                    <strong>Usage note:</strong> HSN codes are referenced in invoices and tax calculations. Ensure GST % matches the current tax schedule. A 4-digit HSN covers broad categories; 6-digit and 8-digit codes are sub-classifications required for GST filing depending on turnover threshold.
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div className="hsn-modal-footer">
                <button className="hsn-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="hsn-btn-save" onClick={handleSave} disabled={saving}>
                  {saving
                    ? <><Loader2 size={15} style={{ animation:'spin 1s linear infinite' }} /> Saving…</>
                    : (editId ? '✏️ Update' : '💾 Save HSN Code')}
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  closeBtn: { background:'none', border:'none', padding:'0 4px', cursor:'pointer', display:'flex', alignItems:'center', opacity:0.85 },
  errorBanner: { display:'flex', alignItems:'center', gap:8, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, color:'#ef4444', padding:'10px 16px', margin:'12px 16px 0', fontSize:13, fontFamily:"'DM Sans',sans-serif" },
  label: { display:'block', fontSize:11, fontWeight:700, color:'#64748b', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' },
  input: { width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid #cbd5e1', fontSize:13, color:'#1e293b', outline:'none', boxSizing:'border-box', background:'#fff' },
  sectionHead: { display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 14px', cursor:'pointer', marginTop:14, userSelect:'none' },
  sectionTitle: { fontWeight:700, fontSize:13, color:'#1e293b' },
  subSection: { background:'#fafbfc', border:'1px solid #e2e8f0', borderRadius:10, padding:14, marginTop:10 },
  delRowBtn: { background:'#fff1f2', color:'#ef4444', border:'1px solid #fca5a5', width:30, height:30, borderRadius:7, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
};