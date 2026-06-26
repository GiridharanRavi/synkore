// frontend/src/pages/admin/ColorMaster.tsx
// Color Master — Full CRUD, Responsive with Pantone support

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, X, Loader2,
  AlertCircle, CheckCircle2, Info, AlertTriangle, Palette,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ColorRecord {
  id?: number;
  rec_no?: string;
  color_name: string;
  pantone_color_name: string;
  pantone_color_number: string;
  status: string;
}

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string }

// ─── Toast Hook ───────────────────────────────────────────────────────────────

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
    success: { bg:'#f0fdf4', border:'#86efac', color:'#166534', icon:<CheckCircle2 size={16} color="#16a34a" /> },
    error:   { bg:'#fef2f2', border:'#fca5a5', color:'#991b1b', icon:<AlertCircle  size={16} color="#dc2626" /> },
    warning: { bg:'#fffbeb', border:'#fde68a', color:'#92400e', icon:<AlertTriangle size={16} color="#d97706" /> },
    info:    { bg:'#eff6ff', border:'#93c5fd', color:'#1e40af', icon:<Info          size={16} color="#2563eb" /> },
  };
  if (!toasts.length) return null;
  return (
    <div style={{ position:'fixed',top:20,right:20,zIndex:9999,display:'flex',flexDirection:'column',gap:10,maxWidth:360,width:'calc(100vw - 40px)',pointerEvents:'none' }}>
      {toasts.map((t) => {
        const c = cfg[t.type];
        return (
          <div key={t.id} style={{ display:'flex',alignItems:'flex-start',gap:10,background:c.bg,border:`1px solid ${c.border}`,borderRadius:10,padding:'12px 14px',boxShadow:'0 4px 16px rgba(0,0,0,0.12)',pointerEvents:'all',animation:'toastIn 0.25s ease-out',fontFamily:"'DM Sans',sans-serif" }}>
            <span style={{ flexShrink:0,marginTop:1 }}>{c.icon}</span>
            <div style={{ flex:1,minWidth:0 }}>
              <p style={{ margin:0,fontSize:13,fontWeight:700,color:c.color }}>{t.title}</p>
              {t.message && <p style={{ margin:'2px 0 0',fontSize:12,color:c.color,opacity:0.8,lineHeight:1.4 }}>{t.message}</p>}
            </div>
            <button onClick={() => onRemove(t.id)} style={{ flexShrink:0,background:'none',border:'none',padding:0,cursor:'pointer',color:c.color,opacity:0.6,display:'flex',alignItems:'center' }}><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BLANK: ColorRecord = { color_name:'', pantone_color_name:'', pantone_color_number:'', status:'Active' };
const API = '/api/colors';
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

function useWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return w;
}

// ─── Pantone preview swatch (approximate hex lookup for display) ──────────────
// In production you'd use a full Pantone database; this is a demo helper.
function PantoneSwatch({ name }: { name: string }) {
  if (!name) return null;
  // Simple hash → pastel color for demo
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return (
    <span
      title={name}
      style={{
        display:'inline-block', width:18, height:18,
        borderRadius:4, border:'1px solid rgba(0,0,0,0.1)',
        background:`hsl(${hue},60%,65%)`,
        verticalAlign:'middle', marginRight:6, flexShrink:0,
      }}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ColorMaster() {
  const [colors, setColors]     = useState<ColorRecord[]>([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [filterSt, setFilterSt] = useState('');
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<ColorRecord>(BLANK);
  const [editId, setEditId]     = useState<number | null>(null);
  const [error, setError]       = useState('');

  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const width    = useWidth();
  const isMobile = width < 576;

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        search, page: String(page), limit: String(pageSize),
        ...(filterSt ? { status: filterSt } : {}),
      });
      const res  = await fetch(`${API}?${qs}`);
      const data = await res.json();
      setColors(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      pushToast('error', 'Load Failed', 'Could not fetch colors.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [search, filterSt, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, filterSt]);
  useEffect(() => { document.body.style.overflow = showForm ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [showForm]);

  // ── Open form ─────────────────────────────────────────────────────────────
  const openCreate = () => { setForm(BLANK); setEditId(null); setError(''); setShowForm(true); };
  const openEdit   = (c: ColorRecord) => { setForm({ ...c }); setEditId(c.id!); setError(''); setShowForm(true); };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.color_name.trim()) { setError('Color Name is required'); return; }
    if (!form.status)            { setError('Status is required');      return; }
    setError(''); setSaving(true);
    try {
      const res = await fetch(editId ? `${API}/${editId}` : API, {
        method:  editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      pushToast('success', editId ? 'Color Updated' : 'Color Created', `"${form.color_name}" saved successfully.`);
      setShowForm(false);
      load();
    } catch (e: any) {
      const msg = e.message ?? 'Save failed';
      setError(msg);
      pushToast('error', 'Save Failed', msg);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete color "${name}"?`)) return;
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE' });
      pushToast('success', 'Color Deleted', `"${name}" removed.`);
      load();
    } catch {
      pushToast('error', 'Delete Failed', 'Could not delete color.');
    }
  };

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNums   = (() => {
    const pages: number[] = [];
    let start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  })();
  const goTo = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  const set = (k: keyof ColorRecord, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes toastIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes spin     { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .cm2-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }
        .cm2-page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
        .cm2-page-header h1 { margin:0; font-size:20px; font-weight:700; color:#1e293b; }
        .cm2-page-header p  { margin:3px 0 0; font-size:13px; color:#64748b; }
        .cm2-add-btn { display:flex; align-items:center; gap:6px; background:#db2777; color:#fff; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(219,39,119,0.3); white-space:nowrap; touch-action:manipulation; }
        .cm2-add-btn:hover { background:#be185d; }
        .cm2-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .cm2-search-wrap { position:relative; flex:1; min-width:180px; max-width:320px; }
        .cm2-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .cm2-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; outline:none; }
        .cm2-search:focus { border-color:#db2777; }
        .cm2-filter-sel { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#374151; cursor:pointer; outline:none; }
        .cm2-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; }
        .cm2-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; }
        .cm2-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:24px; }
        .cm2-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .cm2-table { width:100%; border-collapse:collapse; font-size:13px; min-width:560px; }
        .cm2-table thead tr { background:#db2777; }
        .cm2-table th { padding:11px 16px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:12px; }
        .cm2-table th.th-center { text-align:center; }
        .cm2-table tbody tr:nth-child(odd)  td { background:#fff; }
        .cm2-table tbody tr:nth-child(even) td { background:#fff5f8; }
        .cm2-table tbody tr:hover td { filter:brightness(0.97); }
        .cm2-table td { padding:11px 16px; color:#374151; font-size:13px; white-space:nowrap; }
        .cm2-rec-badge { display:inline-block; font-family:'DM Mono',monospace; font-size:11px; font-weight:500; color:#be185d; background:#fdf2f8; border:1px solid #fbcfe8; border-radius:6px; padding:2px 7px; }
        .cm2-pantone-num { font-family:'DM Mono',monospace; font-size:12px; color:#64748b; }
        .cm2-chip-active   { display:inline-block; padding:2px 9px; border-radius:20px; font-size:11px; font-weight:600; background:#dcfce7; color:#166534; }
        .cm2-chip-inactive { display:inline-block; padding:2px 9px; border-radius:20px; font-size:11px; font-weight:600; background:#fee2e2; color:#991b1b; }
        .cm2-color-name { display:flex; align-items:center; font-weight:600; }
        .cm2-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }
        .cm2-action-group { display:flex; align-items:center; gap:5px; justify-content:center; }
        .cm2-btn-edit { display:inline-flex; align-items:center; gap:3px; background:#eff6ff; color:#2563eb; border:1px solid #93c5fd; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; }
        .cm2-btn-edit:hover { background:#dbeafe; }
        .cm2-btn-del  { display:inline-flex; align-items:center; gap:3px; background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; }
        .cm2-btn-del:hover  { background:#fee2e2; }
        .cm2-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:13px; color:#64748b; flex-wrap:wrap; gap:8px; }
        .cm2-pag-btns { display:flex; gap:4px; align-items:center; }
        .cm2-pag-btn { padding:5px 12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:13px; font-family:'DM Sans',sans-serif; color:#1e293b; min-width:32px; height:32px; display:flex; align-items:center; justify-content:center; touch-action:manipulation; }
        .cm2-pag-btn:hover:not(:disabled) { background:#f1f5f9; }
        .cm2-pag-btn.active { background:#db2777; color:#fff; border-color:#db2777; font-weight:700; }
        .cm2-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }
        /* Modal */
        .cm2-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.55); display:flex; align-items:center; justify-content:center; z-index:2000; padding:16px; }
        .cm2-modal { background:#fff; border-radius:16px; width:100%; max-width:520px; box-shadow:0 8px 40px rgba(0,0,0,0.22); display:flex; flex-direction:column; }
        .cm2-modal-header { display:flex; justify-content:space-between; align-items:center; padding:16px 24px; background:#db2777; border-radius:16px 16px 0 0; flex-shrink:0; }
        .cm2-modal-body   { padding:24px; overflow-y:auto; flex:1; }
        .cm2-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:14px 24px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 16px 16px; }
        .cm2-field { margin-bottom:16px; }
        .cm2-label { display:block; font-size:11px; font-weight:700; color:#64748b; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.05em; }
        .cm2-input { width:100%; padding:9px 12px; border-radius:8px; border:1px solid #cbd5e1; font-size:13px; color:#1e293b; outline:none; font-family:'DM Sans',sans-serif; transition:border-color 0.15s; }
        .cm2-input:focus { border-color:#db2777; box-shadow:0 0 0 3px rgba(219,39,119,0.08); }
        .cm2-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        @media(max-width:400px) { .cm2-grid2 { grid-template-columns:1fr; } }
        .cm2-error-banner { display:flex; align-items:center; gap:8px; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; color:#ef4444; padding:10px 16px; margin:0 24px 0; font-size:13px; font-family:'DM Sans',sans-serif; }
        .cm2-hint { font-size:11px; color:#94a3b8; margin-top:4px; }
        .cm2-btn-cancel { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; font-family:'DM Sans',sans-serif; }
        .cm2-btn-save   { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#16a34a; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(22,163,74,0.3); }
        .cm2-btn-save:disabled { opacity:0.7; cursor:not-allowed; }
        select, input { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
      `}</style>

      <div className="cm2-wrap">

        {/* Page Header */}
        <div className="cm2-page-header">
          <div>
            <h1><Palette size={20} style={{ display:'inline',verticalAlign:'middle',marginRight:8 }} />Color Master</h1>
            <p>{total} color{total !== 1 ? 's' : ''} defined</p>
          </div>
          <button className="cm2-add-btn" onClick={openCreate}>
            <Plus size={15} /> New Color
          </button>
        </div>

        {/* Toolbar */}
        <div className="cm2-toolbar">
          <div className="cm2-search-wrap">
            <Search size={14} />
            <input
              className="cm2-search"
              placeholder="Search color name, Pantone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="cm2-filter-sel" value={filterSt} onChange={(e) => { setFilterSt(e.target.value); setPage(1); }}>
            <option value="">All Status</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
          <div className="cm2-page-size">
            {!isMobile && <span>Show</span>}
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>

        {/* Table */}
        <div className="cm2-card">
          <div className="cm2-table-wrap">
            <table className="cm2-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Rec No</th>
                  <th>Color Name</th>
                  {!isMobile && <th>Pantone Name</th>}
                  {width >= 768 && <th>Pantone No.</th>}
                  <th>Status</th>
                  <th className="th-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="cm2-empty">
                    <Loader2 size={22} style={{ animation:'spin 1s linear infinite', display:'inline-block' }} />
                  </td></tr>
                ) : colors.length === 0 ? (
                  <tr><td colSpan={7} className="cm2-empty">
                    {search || filterSt ? 'No colors match your search.' : 'No colors yet. Click "New Color" to create one.'}
                  </td></tr>
                ) : colors.map((c, i) => (
                  <tr key={c.id}>
                    <td style={{ color:'#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                    <td><span className="cm2-rec-badge">{c.rec_no ?? '—'}</span></td>
                    <td>
                      <div className="cm2-color-name">
                        <PantoneSwatch name={c.pantone_color_name || c.color_name} />
                        {c.color_name}
                      </div>
                    </td>
                    {!isMobile && <td>{c.pantone_color_name || '—'}</td>}
                    {width >= 768 && <td><span className="cm2-pantone-num">{c.pantone_color_number || '—'}</span></td>}
                    <td>
                      <span className={c.status === 'Active' ? 'cm2-chip-active' : 'cm2-chip-inactive'}>
                        {c.status}
                      </span>
                    </td>
                    <td>
                      <div className="cm2-action-group">
                        <button className="cm2-btn-edit" onClick={() => openEdit(c)}>✏️ {!isMobile && 'Edit'}</button>
                        <button className="cm2-btn-del"  onClick={() => handleDelete(c.id!, c.color_name)}>🗑 {!isMobile && 'Delete'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && total > 0 && (
            <div className="cm2-pagination">
              <span>Page {page} of {totalPages} &nbsp;·&nbsp; {total} record(s)</span>
              <div className="cm2-pag-btns">
                <button className="cm2-pag-btn" onClick={() => goTo(1)}         disabled={page === 1}>«</button>
                <button className="cm2-pag-btn" onClick={() => goTo(page - 1)}  disabled={page === 1}>‹</button>
                {pageNums.map((p) => (
                  <button key={p} className={`cm2-pag-btn${p === page ? ' active' : ''}`} onClick={() => goTo(p)}>{p}</button>
                ))}
                <button className="cm2-pag-btn" onClick={() => goTo(page + 1)}  disabled={page === totalPages}>›</button>
                <button className="cm2-pag-btn" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* Modal */}
        {showForm && (
          <div className="cm2-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="cm2-modal">
              <div className="cm2-modal-header">
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <Palette size={18} color="#fff" />
                  <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:'#fff' }}>
                    {editId ? '✏️ Edit Color' : '🎨 New Color'}
                  </h2>
                </div>
                <button style={{ background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center' }} onClick={() => setShowForm(false)}>
                  <X size={20} color="#fff" />
                </button>
              </div>

              {error && (
                <div className="cm2-error-banner" style={{ marginTop:16 }}>
                  <AlertCircle size={15} style={{ flexShrink:0 }} />
                  <span style={{ flex:1 }}>{error}</span>
                  <button onClick={() => setError('')} style={{ background:'none',border:'none',padding:0,cursor:'pointer',color:'#ef4444',display:'flex' }}><X size={14} /></button>
                </div>
              )}

              <div className="cm2-modal-body">

                {editId && (
                  <div className="cm2-field">
                    <label className="cm2-label">Rec No</label>
                    <input className="cm2-input" value={form.rec_no ?? ''} readOnly style={{ background:'#f8fafc', color:'#94a3b8', cursor:'not-allowed' }} />
                  </div>
                )}

                <div className="cm2-field">
                  <label className="cm2-label">Color Name <span style={{ color:'#ef4444' }}>*</span></label>
                  <input
                    className="cm2-input"
                    placeholder="e.g. Royal Blue, Crimson Red"
                    value={form.color_name}
                    onChange={(e) => set('color_name', e.target.value)}
                  />
                </div>

                <div className="cm2-grid2">
                  <div className="cm2-field">
                    <label className="cm2-label">Pantone Color Name</label>
                    <input
                      className="cm2-input"
                      placeholder="e.g. Reflex Blue"
                      value={form.pantone_color_name}
                      onChange={(e) => set('pantone_color_name', e.target.value)}
                    />
                    <p className="cm2-hint">Official Pantone color name</p>
                  </div>
                  <div className="cm2-field">
                    <label className="cm2-label">Pantone Color Number</label>
                    <input
                      className="cm2-input"
                      placeholder="e.g. 286 C"
                      value={form.pantone_color_number}
                      onChange={(e) => set('pantone_color_number', e.target.value)}
                    />
                    <p className="cm2-hint">Pantone reference code</p>
                  </div>
                </div>

                <div className="cm2-field">
                  <label className="cm2-label">Status <span style={{ color:'#ef4444' }}>*</span></label>
                  <select
                    className="cm2-input"
                    value={form.status}
                    onChange={(e) => set('status', e.target.value)}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                {/* Swatch preview */}
                {(form.pantone_color_name || form.color_name) && (
                  <div style={{ display:'flex', alignItems:'center', gap:10, background:'#fafafa', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 14px', marginTop:4 }}>
                    <PantoneSwatch name={form.pantone_color_name || form.color_name} />
                    <span style={{ fontSize:12, color:'#64748b' }}>Preview swatch (approximate)</span>
                  </div>
                )}

              </div>

              <div className="cm2-modal-footer">
                <button className="cm2-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="cm2-btn-save" onClick={handleSave} disabled={saving}>
                  {saving
                    ? <><Loader2 size={15} style={{ animation:'spin 1s linear infinite' }} /> Saving…</>
                    : (editId ? '✏️ Update' : '🎨 Save Color')}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}