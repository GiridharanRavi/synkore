// frontend/src/pages/admin/CertificationMaster.tsx
// Certification Master — standalone page (not tab-based), same design system as CustomerMaster

import {
  useEffect, useRef, useState, useCallback,
} from 'react';
import {
  Plus, Search, X, Upload, FileText, Eye,
  Loader2, AlertCircle, CheckCircle2, Info, AlertTriangle,
  History, ChevronDown, ChevronUp,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────

interface CertAttachment {
  id?: number;
  file_name: string;
  file_path?: string;
  isNew?: boolean;
  file?: File;
}

interface CertHistory {
  id: number;
  cert_number: string;
  valid_from: string | null;
  valid_to: string | null;
  replaced_at: string;
}

interface Certification {
  id?: number;
  cert_id?: string;
  certification_name: string;
  certification_number: string;
  valid_from: string;
  valid_to: string;
  certification_body: string;
  status: string;
  attachments: CertAttachment[];
  cert_number_history?: CertHistory[];
  __deletedAttachments?: number[];
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
    success: { bg: '#f0fdf4', border: '#86efac', color: '#166534', icon: <CheckCircle2 size={16} color="#16a34a" /> },
    error:   { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', icon: <AlertCircle  size={16} color="#dc2626" /> },
    warning: { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: <AlertTriangle size={16} color="#d97706" /> },
    info:    { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af', icon: <Info          size={16} color="#2563eb" /> },
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
              {t.message && <p style={{ margin:'2px 0 0', fontSize:12, color:c.color, opacity:0.8, lineHeight:1.4 }}>{t.message}</p>}
            </div>
            <button onClick={() => onRemove(t.id)} style={{ flexShrink:0, background:'none', border:'none', padding:0, cursor:'pointer', color:c.color, opacity:0.6, display:'flex', alignItems:'center', marginTop:1 }}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Constants ───────────────────────────────────────────────

const BLANK: Certification = {
  certification_name: '', certification_number: '',
  valid_from: '', valid_to: '', certification_body: '',
  status: 'Active', attachments: [],
};

const API = '/api/certifications';
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={s.label}>{label}{required && <span style={{ color:'#ef4444' }}> *</span>}</label>
      {children}
    </div>
  );
}

function SectionHead({ title, open, onToggle, icon }: { title: string; open: boolean; onToggle: () => void; icon?: React.ReactNode }) {
  return (
    <div style={s.sectionHead} onClick={onToggle}>
      <span style={{ display:'flex', alignItems:'center', gap:8 }}>
        {icon}
        <span style={s.sectionTitle}>{title}</span>
      </span>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </div>
  );
}

// ─── Badge for status ────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const active = status === 'Active';
  return (
    <span style={{
      display:'inline-block', padding:'2px 10px', borderRadius:20,
      fontSize:11, fontWeight:700,
      background: active ? '#dcfce7' : '#fee2e2',
      color: active ? '#166534' : '#991b1b',
    }}>{status}</span>
  );
}

// ─── Validity badge ───────────────────────────────────────────

function ValidityBadge({ validTo }: { validTo: string }) {
  if (!validTo) return <span style={{ color:'#9ca3af', fontSize:12 }}>—</span>;
  const today = new Date();
  const exp   = new Date(validTo);
  const diff  = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  let color = '#166534', bg = '#dcfce7', label = 'Valid';
  if (diff < 0)  { color = '#991b1b'; bg = '#fee2e2'; label = 'Expired'; }
  else if (diff <= 30) { color = '#92400e'; bg = '#fef3c7'; label = `${diff}d left`; }
  return (
    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600, background:bg, color }}>{label}</span>
  );
}

// ─── Main Component ───────────────────────────────────────────

export default function CertificationMaster() {
  const [certs, setCerts]       = useState<Certification[]>([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [filterSt, setFilterSt] = useState('');
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<Certification>(BLANK);
  const [editId, setEditId]     = useState<number | null>(null);
  const [error, setError]       = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [sec, setSec]           = useState({ details: true, attach: true });

  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const width   = useWidth();
  const isMobile = width < 576;

  // ── Load ────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ search, page: String(page), limit: String(pageSize), ...(filterSt ? { status: filterSt } : {}) });
      const res  = await fetch(`${API}?${qs}`);
      const data = await res.json();
      setCerts(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch { pushToast('error', 'Load Failed', 'Could not fetch certifications.'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [search, filterSt, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, filterSt]);
  useEffect(() => { document.body.style.overflow = showForm ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [showForm]);

  // ── Open form ───────────────────────────────────────────────
  const openCreate = () => { setForm(BLANK); setEditId(null); setError(''); setShowHistory(false); setShowForm(true); };
  const openEdit = async (id: number) => {
    try {
      const res  = await fetch(`${API}/${id}`);
      const data = await res.json();
      setForm({ ...data, attachments: data.attachments ?? [], cert_number_history: data.cert_number_history ?? [] });
      setEditId(id); setError(''); setShowHistory(false); setShowForm(true);
    } catch { pushToast('error', 'Load Failed', 'Could not load certification.'); }
  };

  // ── Save ────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.certification_name.trim()) { setError('Certification Name is required'); return; }
    setError(''); setSaving(true);
    const fd = new FormData();
    fd.append('certification_name',   form.certification_name);
    fd.append('certification_number', form.certification_number ?? '');
    fd.append('valid_from',           form.valid_from ?? '');
    fd.append('valid_to',             form.valid_to ?? '');
    fd.append('certification_body',   form.certification_body ?? '');
    fd.append('status',               form.status);
    form.attachments.filter((a) => a.isNew && a.file).forEach((a) => fd.append('attachments', a.file!));
    fd.append('deleted_attachments', JSON.stringify(form.__deletedAttachments ?? []));
    try {
      const res = await fetch(editId ? `${API}/${editId}` : API, { method: editId ? 'PUT' : 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      pushToast('success', editId ? 'Certification Updated' : 'Certification Created', `${form.certification_name} saved successfully.`);
      setShowForm(false); load();
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
      pushToast('error', 'Save Failed', e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this certification?')) return;
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE' });
      pushToast('success', 'Deleted', 'Certification removed.');
      load();
    } catch { pushToast('error', 'Delete Failed', 'Could not delete certification.'); }
  };

  // ── Helpers ─────────────────────────────────────────────────
  const set   = (k: keyof Certification, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const inp   = (k: keyof Certification, type = 'text') => (
    <input type={type} value={String(form[k] ?? '')} onChange={(e) => set(k, e.target.value)} style={s.input} />
  );
  const toggle = (k: 'details' | 'attach') => setSec((p) => ({ ...p, [k]: !p[k] }));

  const handleFileAdd = (files: FileList | null) => {
    if (!files) return;
    setForm((p) => ({ ...p, attachments: [...p.attachments, ...Array.from(files).map((f) => ({ file_name: f.name, isNew: true, file: f }))] }));
  };

  const removeAttachment = (i: number) => {
    setForm((prev) => {
      const att = prev.attachments[i];
      const deleted = prev.__deletedAttachments ?? [];
      return { ...prev, attachments: prev.attachments.filter((_, j) => j !== i), __deletedAttachments: att.id ? [...deleted, att.id] : deleted };
    });
  };

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

  const showBody  = !isMobile;
  const showDates = width >= 640;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes toastIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .cert-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }
        .cert-page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
        .cert-page-header h1 { margin:0; font-size:20px; font-weight:700; }
        .cert-page-header p  { margin:3px 0 0; font-size:13px; color:#64748b; }
        .cert-add-btn { display:flex; align-items:center; gap:6px; background:#0d9488; color:#fff; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(13,148,136,0.3); white-space:nowrap; }
        .cert-add-btn:hover { background:#0f766e; }
        .cert-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .cert-search-wrap { position:relative; flex:1; min-width:180px; max-width:320px; }
        .cert-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .cert-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; outline:none; }
        .cert-search:focus { border-color:#0d9488; }
        .cert-filter-sel { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#374151; cursor:pointer; outline:none; }
        .cert-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; }
        .cert-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; }
        .cert-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:24px; }
        .cert-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .cert-table { width:100%; border-collapse:collapse; font-size:13px; font-family:'DM Sans',sans-serif; min-width:480px; }
        .cert-table thead tr { background:#0d9488; }
        .cert-table th { padding:11px 14px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:12px; }
        .cert-table th.th-c { text-align:center; }
        .cert-table tbody tr:nth-child(odd)  td { background:#fff; }
        .cert-table tbody tr:nth-child(even) td { background:#f8fafc; }
        .cert-table tbody tr:hover td { filter:brightness(0.97); }
        .cert-table td { padding:10px 14px; color:#374151; font-size:13px; white-space:nowrap; }
        .cert-id-chip { display:inline-block; font-family:'DM Mono',monospace; font-size:11px; font-weight:500; color:#0f766e; background:#f0fdfa; border:1px solid #99f6e4; border-radius:6px; padding:2px 7px; letter-spacing:0.03em; }
        .cert-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }
        .cert-action-group { display:flex; align-items:center; gap:5px; justify-content:center; }
        .cert-btn-edit { display:inline-flex; align-items:center; gap:3px; background:#f0fdfa; color:#0d9488; border:1px solid #99f6e4; padding:4px 9px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; }
        .cert-btn-edit:hover { background:#ccfbf1; }
        .cert-btn-del { display:inline-flex; align-items:center; gap:3px; background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; padding:4px 9px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; }
        .cert-btn-del:hover { background:#fee2e2; }
        .cert-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; font-family:'DM Sans',sans-serif; }
        .cert-pag-btns { display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
        .cert-pag-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; font-family:'DM Sans',sans-serif; color:#1e293b; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; }
        .cert-pag-btn:hover:not(:disabled) { background:#f1f5f9; }
        .cert-pag-btn.active { background:#0d9488; color:#fff; border-color:#0d9488; font-weight:700; }
        .cert-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }
        .cert-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:16px 8px; -webkit-overflow-scrolling:touch; }
        @media(min-width:576px){ .cert-modal-overlay{padding:24px 16px;} }
        .cert-modal { background:#fff; border-radius:16px; width:100%; max-width:720px; box-shadow:0 8px 40px rgba(0,0,0,0.22); display:flex; flex-direction:column; max-height:calc(100vh - 32px); }
        .cert-modal-header { display:flex; justify-content:space-between; align-items:center; padding:14px 20px; background:#0d9488; border-radius:16px 16px 0 0; flex-shrink:0; }
        .cert-modal-body { padding:16px 20px; overflow-y:auto; flex:1; -webkit-overflow-scrolling:touch; }
        .cert-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 20px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 16px 16px; }
        .cert-grid { display:grid; grid-template-columns:1fr; gap:12px; padding:12px 0; }
        @media(min-width:480px){ .cert-grid{grid-template-columns:repeat(2,1fr);gap:14px;} }
        .cert-col-full { grid-column:1/-1; }
        .cert-btn-cancel { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; font-family:'DM Sans',sans-serif; }
        .cert-btn-save { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#0d9488; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(13,148,136,0.3); }
        .cert-btn-save:disabled { opacity:0.7; cursor:not-allowed; }
        select,input,textarea { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar{width:5px;height:5px} ::-webkit-scrollbar-track{background:#f1f5f9} ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
      `}</style>

      <div className="cert-wrap">

        {/* PAGE HEADER */}
        <div className="cert-page-header">
          <div>
            <h1>Certification Master</h1>
            <p>{total} certification{total !== 1 ? 's' : ''} registered</p>
          </div>
          <button className="cert-add-btn" onClick={openCreate}>
            <Plus size={15} /> New Certification
          </button>
        </div>

        {/* TOOLBAR */}
        <div className="cert-toolbar">
          <div className="cert-search-wrap">
            <Search size={14} />
            <input className="cert-search" placeholder="Search name, number, body, ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="cert-filter-sel" value={filterSt} onChange={(e) => { setFilterSt(e.target.value); setPage(1); }}>
            <option value=''>All Status</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
          {!isMobile && <span style={{ fontSize:12, color:'#64748b' }}>{total} record(s)</span>}
          <div className="cert-page-size">
            {!isMobile && <span>Show</span>}
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>

        {/* TABLE CARD */}
        <div className="cert-card">
          <div className="cert-table-wrap">
            <table className="cert-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cert. ID</th>
                  <th>Name / Type</th>
                  {!isMobile && <th>Cert. Number</th>}
                  {showDates && <th>Valid From</th>}
                  {showDates && <th>Valid To</th>}
                  {!isMobile && <th>Body</th>}
                  <th>Validity</th>
                  <th>Status</th>
                  <th className="th-c">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="cert-empty">
                    <Loader2 size={22} style={{ animation:'spin 1s linear infinite', display:'inline-block' }} />
                  </td></tr>
                ) : certs.length === 0 ? (
                  <tr><td colSpan={10} className="cert-empty">
                    {search || filterSt ? 'No certifications match your search' : 'No certifications yet. Click "New Certification" to create one.'}
                  </td></tr>
                ) : (
                  certs.map((c, i) => (
                    <tr key={c.id}>
                      <td style={{ color:'#94a3b8' }}>{(page-1)*pageSize + i + 1}</td>
                      <td><span className="cert-id-chip">{c.cert_id ?? '—'}</span></td>
                      <td style={{ fontWeight:600, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis' }}>{c.certification_name}</td>
                      {!isMobile && <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>{c.certification_number || '—'}</td>}
                      {showDates && <td style={{ fontSize:12 }}>{c.valid_from ? new Date(c.valid_from).toLocaleDateString('en-IN') : '—'}</td>}
                      {showDates && <td style={{ fontSize:12 }}>{c.valid_to   ? new Date(c.valid_to  ).toLocaleDateString('en-IN') : '—'}</td>}
                      {!isMobile && <td style={{ fontSize:12, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis' }}>{c.certification_body || '—'}</td>}
                      <td><ValidityBadge validTo={c.valid_to} /></td>
                      <td><StatusBadge status={c.status} /></td>
                      <td>
                        <div className="cert-action-group">
                          <button className="cert-btn-edit" onClick={() => openEdit(c.id!)}>✏️{!isMobile && ' Edit'}</button>
                          <button className="cert-btn-del"  onClick={() => handleDelete(c.id!)}>🗑{!isMobile && ' Del'}</button>
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
            <div className="cert-pagination">
              <span>Page {page} of {totalPages}</span>
              <div className="cert-pag-btns">
                <button className="cert-pag-btn" onClick={() => setPage(1)} disabled={page===1}>«</button>
                <button className="cert-pag-btn" onClick={() => setPage(p=>p-1)} disabled={page===1}>‹</button>
                {pageNums.map((p) => (
                  <button key={p} className={`cert-pag-btn${p===page?' active':''}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="cert-pag-btn" onClick={() => setPage(p=>p+1)} disabled={page===totalPages}>›</button>
                <button className="cert-pag-btn" onClick={() => setPage(totalPages)} disabled={page===totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* MODAL */}
        {showForm && (
          <div className="cert-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="cert-modal">

              {/* Header */}
              <div className="cert-modal-header">
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  <h2 style={{ margin:0, fontSize:isMobile?15:18, fontWeight:700, color:'#fff' }}>
                    {editId ? '✏️ Edit Certification' : '➕ New Certification'}
                  </h2>
                  {editId && form.cert_id && (
                    <span style={{ fontSize:11, color:'#99f6e4', fontFamily:'DM Mono,monospace' }}>{form.cert_id}</span>
                  )}
                </div>
                <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={20} color="#fff" /></button>
              </div>

              {/* Inline error */}
              {error && (
                <div style={s.errorBanner}>
                  <AlertCircle size={15} style={{ flexShrink:0 }} />
                  <span>{error}</span>
                  <button onClick={() => setError('')} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', padding:0, color:'#ef4444', display:'flex', alignItems:'center' }}><X size={14} /></button>
                </div>
              )}

              {/* Body */}
              <div className="cert-modal-body">

                {/* Certification Details */}
                <SectionHead title="Certification Details" open={sec.details} onToggle={() => toggle('details')} />
                {sec.details && (
                  <div className="cert-grid">
                    <div className="cert-col-full">
                      <Field label="Certification Name / Type" required>
                        <input type="text" value={form.certification_name} onChange={(e) => set('certification_name', e.target.value)} style={s.input} placeholder="e.g. ISO 9001:2015, GOTS, OEKO-TEX…" />
                      </Field>
                    </div>
                    <Field label="Certification Number">
                      <input type="text" value={form.certification_number} onChange={(e) => set('certification_number', e.target.value)} style={s.input} placeholder="Alphanumeric (optional)" />
                    </Field>
                    <Field label="Certification Body">
                      <input type="text" value={form.certification_body} onChange={(e) => set('certification_body', e.target.value)} style={s.input} placeholder="Issuing authority" />
                    </Field>
                    <Field label="Valid From">
                      <input type="date" value={form.valid_from} onChange={(e) => set('valid_from', e.target.value)} style={s.input} />
                    </Field>
                    <Field label="Valid To">
                      <input type="date" value={form.valid_to} onChange={(e) => set('valid_to', e.target.value)} style={s.input} />
                    </Field>
                    <Field label="Status">
                      <select value={form.status} onChange={(e) => set('status', e.target.value)} style={s.input}>
                        <option>Active</option>
                        <option>Inactive</option>
                      </select>
                    </Field>
                  </div>
                )}

                {/* Cert number history (edit mode) */}
                {editId && form.cert_number_history && form.cert_number_history.length > 0 && (
                  <>
                    <div style={s.sectionHead} onClick={() => setShowHistory((h) => !h)}>
                      <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <History size={15} color="#64748b" />
                        <span style={s.sectionTitle}>Certification Number History</span>
                        <span style={{ fontSize:11, background:'#e2e8f0', padding:'1px 7px', borderRadius:20, color:'#475569' }}>{form.cert_number_history.length}</span>
                      </span>
                      {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                    {showHistory && (
                      <div style={{ ...s.subSection, marginTop:8 }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:'DM Sans,sans-serif' }}>
                          <thead>
                            <tr style={{ background:'#f8fafc' }}>
                              {['Cert Number','Valid From','Valid To','Replaced At'].map((h) => (
                                <th key={h} style={{ padding:'7px 10px', textAlign:'left', color:'#64748b', fontWeight:600, borderBottom:'1px solid #e2e8f0', fontSize:11 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {form.cert_number_history.map((h) => (
                              <tr key={h.id}>
                                <td style={{ padding:'7px 10px', fontFamily:'DM Mono,monospace', fontSize:11, borderBottom:'1px solid #f1f5f9' }}>{h.cert_number}</td>
                                <td style={{ padding:'7px 10px', borderBottom:'1px solid #f1f5f9' }}>{h.valid_from ? new Date(h.valid_from).toLocaleDateString('en-IN') : '—'}</td>
                                <td style={{ padding:'7px 10px', borderBottom:'1px solid #f1f5f9' }}>{h.valid_to   ? new Date(h.valid_to  ).toLocaleDateString('en-IN') : '—'}</td>
                                <td style={{ padding:'7px 10px', borderBottom:'1px solid #f1f5f9', color:'#94a3b8', fontSize:11 }}>{new Date(h.replaced_at).toLocaleString('en-IN')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}

                {/* Attachments */}
                <SectionHead title="Certification Copy / Attachments" open={sec.attach} onToggle={() => toggle('attach')} icon={<Upload size={14} color="#64748b" />} />
                {sec.attach && (
                  <div style={s.subSection}>
                    <div style={s.dropZone} onClick={() => fileRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); handleFileAdd(e.dataTransfer.files); }}>
                      <Upload size={22} style={{ color:'#9ca3af', marginBottom:6 }} />
                      <p style={{ margin:0, fontSize:13, color:'#6b7280' }}>Click or drag files here</p>
                      <p style={{ margin:'4px 0 0', fontSize:11, color:'#9ca3af' }}>PDF, JPG, PNG, DOCX — max 10 MB</p>
                      <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style={{ display:'none' }} onChange={(e) => handleFileAdd(e.target.files)} />
                    </div>
                    {form.attachments.map((a, i) => (
                      <div key={i} style={{ ...s.attachRow, marginTop:8 }}>
                        <FileText size={15} style={{ color:'#6b7280', flexShrink:0 }} />
                        <span style={{ flex:1, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.file_name}</span>
                        {!a.isNew && a.file_path && (
                          <a href={`/api/certifications/attachment/${a.file_path}`} target="_blank" rel="noreferrer" style={{ color:'#0d9488' }}><Eye size={14} /></a>
                        )}
                        {a.isNew && <span style={{ fontSize:10, color:'#0d9488', background:'#f0fdfa', padding:'1px 6px', borderRadius:4, fontWeight:600 }}>NEW</span>}
                        <button style={s.delRowBtn} onClick={() => removeAttachment(i)}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}

              </div>

              {/* Footer */}
              <div className="cert-modal-footer">
                <button className="cert-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="cert-btn-save" onClick={handleSave} disabled={saving}>
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

// ─── Styles ──────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  closeBtn: { background:'none', border:'none', padding:'0 4px', cursor:'pointer', display:'flex', alignItems:'center', opacity:0.85 },
  errorBanner: { display:'flex', alignItems:'center', gap:8, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, color:'#ef4444', padding:'10px 16px', margin:'12px 16px 0', fontSize:13, fontFamily:"'DM Sans',sans-serif" },
  label: { display:'block', fontSize:11, fontWeight:700, color:'#64748b', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' },
  input: { width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid #cbd5e1', fontSize:13, color:'#1e293b', outline:'none', boxSizing:'border-box', background:'#fff' },
  sectionHead: { display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 14px', cursor:'pointer', marginTop:18, userSelect:'none' },
  sectionTitle: { fontWeight:700, fontSize:13, color:'#1e293b' },
  subSection: { background:'#fafbfc', border:'1px solid #e2e8f0', borderRadius:10, padding:14, marginTop:10 },
  dropZone: { border:'2px dashed #cbd5e1', borderRadius:12, padding:'24px 16px', textAlign:'center', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center' },
  attachRow: { display:'flex', alignItems:'center', gap:10, background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 12px' },
  delRowBtn: { background:'#fff1f2', color:'#ef4444', border:'1px solid #fca5a5', width:30, height:30, borderRadius:7, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
};