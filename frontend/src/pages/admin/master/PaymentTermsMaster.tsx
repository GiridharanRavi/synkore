// frontend/src/pages/admin/PaymentTermsMaster.tsx
// Payment Terms Master — Full CRUD, Responsive

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, X,
  Loader2, AlertCircle, CheckCircle2, Info, AlertTriangle,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PaymentTerm {
  id?: number;
  rec_no?: string;
  payment_term_name: string;
  payment_term_days: string;
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

// ─── Toast UI ─────────────────────────────────────────────────────────────────

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  const cfg: Record<ToastType, { bg: string; border: string; color: string; icon: React.ReactNode }> = {
    success: { bg: '#f0fdf4', border: '#86efac', color: '#166534', icon: <CheckCircle2 size={16} color="#16a34a" /> },
    error:   { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', icon: <AlertCircle  size={16} color="#dc2626" /> },
    warning: { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: <AlertTriangle size={16} color="#d97706" /> },
    info:    { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af', icon: <Info          size={16} color="#2563eb" /> },
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

const DAYS_OPTIONS = ['7', '15', '30', '60', '90'];
const BLANK: PaymentTerm = { payment_term_name: '', payment_term_days: '' };
const API = '/api/payment-terms';
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PaymentTermsMaster() {
  const [terms, setTerms]       = useState<PaymentTerm[]>([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<PaymentTerm>(BLANK);
  const [editId, setEditId]     = useState<number | null>(null);
  const [error, setError]       = useState('');

  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const width    = useWidth();
  const isMobile = width < 576;

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ search, page: String(page), limit: String(pageSize) });
      const res  = await fetch(`${API}?${qs}`);
      const data = await res.json();
      setTerms(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      pushToast('error', 'Load Failed', 'Could not fetch payment terms.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [search, page, pageSize]);
  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { document.body.style.overflow = showForm ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [showForm]);

  // ── Open form ─────────────────────────────────────────────────────────────
  const openCreate = () => { setForm(BLANK); setEditId(null); setError(''); setShowForm(true); };
  const openEdit   = (t: PaymentTerm) => { setForm({ ...t }); setEditId(t.id!); setError(''); setShowForm(true); };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.payment_term_name.trim()) { setError('Payment Term Name is required'); return; }
    if (!form.payment_term_days)        { setError('Payment Term Days is required');  return; }
    setError(''); setSaving(true);
    try {
      const res = await fetch(editId ? `${API}/${editId}` : API, {
        method:  editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      pushToast('success', editId ? 'Term Updated' : 'Term Created', `"${form.payment_term_name}" saved successfully.`);
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
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE' });
      pushToast('success', 'Term Deleted', `"${name}" has been removed.`);
      load();
    } catch {
      pushToast('error', 'Delete Failed', 'Could not delete payment term.');
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

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes toastIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes spin     { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .pt-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }
        .pt-page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
        .pt-page-header h1 { margin:0; font-size:20px; font-weight:700; color:#1e293b; }
        .pt-page-header p  { margin:3px 0 0; font-size:13px; color:#64748b; }
        .pt-add-btn { display:flex; align-items:center; gap:6px; background:#7c3aed; color:#fff; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(124,58,237,0.3); white-space:nowrap; touch-action:manipulation; }
        .pt-add-btn:hover { background:#6d28d9; }
        .pt-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .pt-search-wrap { position:relative; flex:1; min-width:180px; max-width:320px; }
        .pt-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .pt-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; outline:none; }
        .pt-search:focus { border-color:#7c3aed; }
        .pt-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; }
        .pt-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; }
        .pt-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:24px; }
        .pt-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .pt-table { width:100%; border-collapse:collapse; font-size:13px; min-width:400px; }
        .pt-table thead tr { background:#7c3aed; }
        .pt-table th { padding:11px 16px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:12px; }
        .pt-table th.th-center { text-align:center; }
        .pt-table tbody tr:nth-child(odd)  td { background:#fff; }
        .pt-table tbody tr:nth-child(even) td { background:#faf8ff; }
        .pt-table tbody tr:hover td { filter:brightness(0.97); }
        .pt-table td { padding:11px 16px; color:#374151; font-size:13px; white-space:nowrap; }
        .pt-rec-badge { display:inline-block; font-family:'DM Mono',monospace; font-size:11px; font-weight:500; color:#6d28d9; background:#f5f3ff; border:1px solid #ddd6fe; border-radius:6px; padding:2px 7px; }
        .pt-days-chip { display:inline-block; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:700; background:#fef3c7; color:#b45309; }
        .pt-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }
        .pt-action-group { display:flex; align-items:center; gap:5px; justify-content:center; }
        .pt-btn-edit { display:inline-flex; align-items:center; gap:3px; background:#eff6ff; color:#2563eb; border:1px solid #93c5fd; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; }
        .pt-btn-edit:hover { background:#dbeafe; }
        .pt-btn-del  { display:inline-flex; align-items:center; gap:3px; background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; }
        .pt-btn-del:hover { background:#fee2e2; }
        .pt-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:13px; color:#64748b; flex-wrap:wrap; gap:8px; }
        .pt-pag-btns { display:flex; gap:4px; align-items:center; }
        .pt-pag-btn { padding:5px 12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:13px; font-family:'DM Sans',sans-serif; color:#1e293b; min-width:32px; height:32px; display:flex; align-items:center; justify-content:center; touch-action:manipulation; }
        .pt-pag-btn:hover:not(:disabled) { background:#f1f5f9; }
        .pt-pag-btn.active { background:#7c3aed; color:#fff; border-color:#7c3aed; font-weight:700; }
        .pt-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }
        /* Modal */
        .pt-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.55); display:flex; align-items:center; justify-content:center; z-index:2000; padding:16px; }
        .pt-modal { background:#fff; border-radius:16px; width:100%; max-width:480px; box-shadow:0 8px 40px rgba(0,0,0,0.22); display:flex; flex-direction:column; }
        .pt-modal-header { display:flex; justify-content:space-between; align-items:center; padding:16px 24px; background:#7c3aed; border-radius:16px 16px 0 0; flex-shrink:0; }
        .pt-modal-body   { padding:24px; overflow-y:auto; flex:1; }
        .pt-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:14px 24px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 16px 16px; }
        .pt-field { margin-bottom:16px; }
        .pt-label { display:block; font-size:11px; font-weight:700; color:#64748b; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.05em; }
        .pt-input { width:100%; padding:9px 12px; border-radius:8px; border:1px solid #cbd5e1; font-size:13px; color:#1e293b; outline:none; font-family:'DM Sans',sans-serif; transition:border-color 0.15s; }
        .pt-input:focus { border-color:#7c3aed; box-shadow:0 0 0 3px rgba(124,58,237,0.08); }
        .pt-error-banner { display:flex; align-items:center; gap:8px; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; color:#ef4444; padding:10px 16px; margin:0 24px 16px; font-size:13px; font-family:'DM Sans',sans-serif; }
        .pt-btn-cancel { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; font-family:'DM Sans',sans-serif; }
        .pt-btn-save   { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#16a34a; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(22,163,74,0.3); }
        .pt-btn-save:disabled { opacity:0.7; cursor:not-allowed; }
        select, input { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
      `}</style>

      <div className="pt-wrap">

        {/* Page Header */}
        <div className="pt-page-header">
          <div>
            <h1>💳 Payment Terms Master</h1>
            <p>{total} term{total !== 1 ? 's' : ''} configured</p>
          </div>
          <button className="pt-add-btn" onClick={openCreate}>
            <Plus size={15} /> New Payment Term
          </button>
        </div>

        {/* Toolbar */}
        <div className="pt-toolbar">
          <div className="pt-search-wrap">
            <Search size={14} />
            <input
              className="pt-search"
              placeholder="Search term name or days…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="pt-page-size">
            {!isMobile && <span>Show</span>}
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>

        {/* Table Card */}
        <div className="pt-card">
          <div className="pt-table-wrap">
            <table className="pt-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Rec No</th>
                  <th>Payment Term Name</th>
                  <th>Days</th>
                  <th className="th-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="pt-empty">
                    <Loader2 size={22} style={{ animation:'spin 1s linear infinite', display:'inline-block' }} />
                  </td></tr>
                ) : terms.length === 0 ? (
                  <tr><td colSpan={5} className="pt-empty">
                    {search ? 'No terms match your search.' : 'No payment terms yet. Click "New Payment Term" to create one.'}
                  </td></tr>
                ) : terms.map((t, i) => (
                  <tr key={t.id}>
                    <td style={{ color:'#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                    <td><span className="pt-rec-badge">{t.rec_no ?? '—'}</span></td>
                    <td style={{ fontWeight:600 }}>{t.payment_term_name}</td>
                    <td><span className="pt-days-chip">Net {t.payment_term_days} days</span></td>
                    <td>
                      <div className="pt-action-group">
                        <button className="pt-btn-edit" onClick={() => openEdit(t)}>✏️ {!isMobile && 'Edit'}</button>
                        <button className="pt-btn-del"  onClick={() => handleDelete(t.id!, t.payment_term_name)}>🗑 {!isMobile && 'Delete'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && total > 0 && (
            <div className="pt-pagination">
              <span>Page {page} of {totalPages} &nbsp;·&nbsp; {total} record(s)</span>
              <div className="pt-pag-btns">
                <button className="pt-pag-btn" onClick={() => goTo(1)}         disabled={page === 1}>«</button>
                <button className="pt-pag-btn" onClick={() => goTo(page - 1)}  disabled={page === 1}>‹</button>
                {pageNums.map((p) => (
                  <button key={p} className={`pt-pag-btn${p === page ? ' active' : ''}`} onClick={() => goTo(p)}>{p}</button>
                ))}
                <button className="pt-pag-btn" onClick={() => goTo(page + 1)}  disabled={page === totalPages}>›</button>
                <button className="pt-pag-btn" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* Modal */}
        {showForm && (
          <div className="pt-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="pt-modal">
              <div className="pt-modal-header">
                <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:'#fff' }}>
                  {editId ? '✏️ Edit Payment Term' : '➕ New Payment Term'}
                </h2>
                <button style={{ background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center' }} onClick={() => setShowForm(false)}>
                  <X size={20} color="#fff" />
                </button>
              </div>

              {error && (
                <div className="pt-error-banner" style={{ marginTop:16 }}>
                  <AlertCircle size={15} style={{ flexShrink:0 }} />
                  <span style={{ flex:1 }}>{error}</span>
                  <button onClick={() => setError('')} style={{ background:'none',border:'none',padding:0,cursor:'pointer',color:'#ef4444',display:'flex' }}><X size={14} /></button>
                </div>
              )}

              <div className="pt-modal-body">

                {/* Rec No — read only if editing */}
                {editId && (
                  <div className="pt-field">
                    <label className="pt-label">Rec No</label>
                    <input className="pt-input" value={form.rec_no ?? ''} readOnly style={{ background:'#f8fafc', color:'#94a3b8', cursor:'not-allowed' }} />
                  </div>
                )}

                <div className="pt-field">
                  <label className="pt-label">Payment Term Name <span style={{ color:'#ef4444' }}>*</span></label>
                  <input
                    className="pt-input"
                    placeholder="e.g. Net 30, Advance, COD"
                    value={form.payment_term_name}
                    onChange={(e) => setForm((f) => ({ ...f, payment_term_name: e.target.value }))}
                  />
                </div>

                <div className="pt-field">
                  <label className="pt-label">Payment Term Days <span style={{ color:'#ef4444' }}>*</span></label>
                  <select
                    className="pt-input"
                    value={form.payment_term_days}
                    onChange={(e) => setForm((f) => ({ ...f, payment_term_days: e.target.value }))}
                  >
                    <option value="">— Select Days —</option>
                    {DAYS_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
                  </select>
                </div>

              </div>

              <div className="pt-modal-footer">
                <button className="pt-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="pt-btn-save" onClick={handleSave} disabled={saving}>
                  {saving
                    ? <><Loader2 size={15} style={{ animation:'spin 1s linear infinite' }} /> Saving…</>
                    : (editId ? '✏️ Update' : '💾 Save')}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}