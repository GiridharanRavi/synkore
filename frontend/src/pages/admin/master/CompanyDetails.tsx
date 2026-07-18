// frontend/src/pages/admin/CompanyDetails.tsx
// Company Details Master — Full CRUD (list + modal), same pattern as
// VendorMaster.tsx. Feeds the COMPANY_INFO header block used by
// FabricPackingList.tsx / FabricInvoice.tsx print layouts (matched via
// the "Firm" field — AE / AEF).

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';

import {
  Plus,
  Search,
  X,
  Upload,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  Building,
  Download,
  Printer,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Company {
  id?: number;
  company_code?: string;
  firm:          '' | 'AEF' | 'AE';
  company_name:  string;
  logo_path?:    string | null;
  logoFile?:     File | null;
  removeLogo?:   boolean;
  address:       string;
  works_address: string;
  regd_office:   string;
  pin_code:      string;
  district:      string;
  state:         string;
  country:       string;
  gst_no:        string;
  pan_no:        string;
  cin_no:        string;
  policy_no:     string;
  email:         string;
  website:       string;
  contact_name:  string;
  contact_no:    string;
  bank_name:     string;
  branch_name:   string;
  ac_no:         string;
  ifsc_code:     string;
  certifications: string; // comma-separated
  status:        string;
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
function isValidContact(contact: string): boolean {
  if (!contact) return true;
  return /^\d{10,13}$/.test(contact.replace(/[\s\-\+]/g, ''));
}

interface FieldErrors {
  company_name?: string;
  email?:        string;
  contact_no?:   string;
  gst_no?:       string;
}

// ─── Toast ───────────────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string }
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
    <div style={{ position:'fixed', top:20, right:20, zIndex:9999, display:'flex', flexDirection:'column', gap:10, maxWidth:360, width:'calc(100vw - 40px)', pointerEvents:'none' }}>
      {toasts.map((t) => {
        const c = cfg[t.type];
        return (
          <div key={t.id} style={{ display:'flex', alignItems:'flex-start', gap:10, background:c.bg, border:`1px solid ${c.border}`, borderRadius:10, padding:'12px 14px', boxShadow:'0 4px 16px rgba(0,0,0,0.12)', pointerEvents:'all', animation:'toastIn 0.25s ease-out', fontFamily:"'DM Sans', sans-serif" }}>
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

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span style={{ display:'flex', alignItems:'flex-start', gap:4, fontSize:11, color:'#dc2626', marginTop:4, lineHeight:1.4 }}>
      <AlertCircle size={11} style={{ flexShrink:0, marginTop:1 }} />
      <span>{msg}</span>
    </span>
  );
}

function Field({ label, required, children, error, highlight }: {
  label: string; required?: boolean; children: React.ReactNode; error?: string; highlight?: boolean;
}) {
  return (
    <div>
      <label style={s.label}>{label}{required && <span style={{ color:'#ef4444' }}> *</span>}</label>
      {children}
      <FieldError msg={error} />
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

// ─── Export Menu ─────────────────────────────────────────────────────────────

function ExportMenu({ onExportCSV, onExportExcel, onPrint }: {
  onExportCSV: () => void; onExportExcel: () => void; onPrint: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);
  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button className="cd-export-btn" onClick={() => setOpen((o) => !o)}>
        <Download size={14} /> Export {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <div className="cd-export-dropdown">
          <p className="cd-export-label">EXPORT / PRINT</p>
          <button className="cd-export-item" onClick={() => { onExportCSV(); setOpen(false); }}>
            <span className="cd-export-icon cd-export-icon-csv"><FileText size={14} /></span> Export as CSV
          </button>
          <button className="cd-export-item" onClick={() => { onExportExcel(); setOpen(false); }}>
            <span className="cd-export-icon cd-export-icon-excel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
            </span> Export as Excel
          </button>
          <div className="cd-export-divider" />
          <button className="cd-export-item" onClick={() => { onPrint(); setOpen(false); }}>
            <span className="cd-export-icon cd-export-icon-print"><Printer size={14} /></span> Print Table
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Export helpers ───────────────────────────────────────────────────────────

const CSV_COLUMNS: { key: keyof Company; label: string }[] = [
  { key: 'company_code', label: 'Company Code' },
  { key: 'company_name', label: 'Company Name' },
  { key: 'firm',         label: 'Firm' },
  { key: 'gst_no',       label: 'GST No' },
  { key: 'contact_no',   label: 'Contact No' },
  { key: 'email',        label: 'E-Mail' },
  { key: 'state',        label: 'State' },
  { key: 'status',       label: 'Status' },
];

function toCSV(rows: Company[]): string {
  const header = CSV_COLUMNS.map((c) => `"${c.label}"`).join(',');
  const lines  = rows.map((r) => CSV_COLUMNS.map((c) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(','));
  return [header, ...lines].join('\r\n');
}
function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── States list (kept short — company profiles are few) ─────────────────────
const STATE_LIST = [
  'Tamil Nadu','Andhra Pradesh','Karnataka','Kerala','Maharashtra','Gujarat',
  'Rajasthan','Uttar Pradesh','West Bengal','Telangana','Delhi','Punjab',
  'Haryana','Bihar','Madhya Pradesh','Odisha','Assam','Jharkhand',
  'Himachal Pradesh','Uttarakhand','Chhattisgarh','Goa','Puducherry',
].sort();
const DEFAULT_STATE = 'Tamil Nadu';

// ─── sanitize ───────────────────────────────────────────────────────────────

function sanitizeCompany(data: any): Company {
  const safe = (v: any) => (v == null ? '' : String(v));
  return {
    ...BLANK, ...data,
    firm: (data.firm === 'AEF' || data.firm === 'AE') ? data.firm : '',
    company_name: safe(data.company_name),
    address: safe(data.address), works_address: safe(data.works_address), regd_office: safe(data.regd_office),
    pin_code: safe(data.pin_code), district: safe(data.district),
    state: safe(data.state) || DEFAULT_STATE, country: safe(data.country) || 'India',
    gst_no: safe(data.gst_no), pan_no: safe(data.pan_no), cin_no: safe(data.cin_no), policy_no: safe(data.policy_no),
    email: safe(data.email), website: safe(data.website),
    contact_name: safe(data.contact_name), contact_no: safe(data.contact_no),
    bank_name: safe(data.bank_name), branch_name: safe(data.branch_name),
    ac_no: safe(data.ac_no), ifsc_code: safe(data.ifsc_code),
    certifications: safe(data.certifications),
    status: safe(data.status) || 'Active',
    logo_path: data.logo_path ?? null, logoFile: null, removeLogo: false,
  };
}

const BLANK: Company = {
  firm:'', company_name:'', address:'', works_address:'', regd_office:'',
  pin_code:'', district:'', state: DEFAULT_STATE, country:'India',
  gst_no:'', pan_no:'', cin_no:'', policy_no:'',
  email:'', website:'', contact_name:'', contact_no:'',
  bank_name:'', branch_name:'', ac_no:'', ifsc_code:'',
  certifications:'', status:'Active', logo_path:null, logoFile:null, removeLogo:false,
};

const API = '/api/company-details';
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

export default function CompanyDetails() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [filterSt, setFilterSt] = useState('');
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<Company>(BLANK);
  const [editId, setEditId]     = useState<number | null>(null);
  const [error, setError]       = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sec, setSec] = useState({ main:true, bank:true, extra:false });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const logoRef  = useRef<HTMLInputElement>(null);
  const width    = useWidth();
  const isMobile = width < 576;

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const qs  = new URLSearchParams({ search, page: String(page), limit: String(pageSize), ...(filterSt ? { status: filterSt } : {}) });
      const res = await fetch(`${API}?${qs}`);
      const data = await res.json();
      setCompanies(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch { pushToast('error','Load Failed','Could not fetch company details.'); }
    setLoading(false);
  };

  useEffect(() => { loadCompanies(); }, [search, filterSt, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, filterSt]);
  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showForm]);

  // ── Export handlers ───────────────────────────────────────
  const handleExportCSV = () => {
    downloadBlob(toCSV(companies), 'company-details.csv', 'text/csv;charset=utf-8;');
    pushToast('success','CSV Exported',`${companies.length} record(s) downloaded.`);
  };
  const handleExportExcel = () => {
    const tsv = [
      CSV_COLUMNS.map((c) => c.label).join('\t'),
      ...companies.map((r) => CSV_COLUMNS.map((c) => String(r[c.key] ?? '')).join('\t')),
    ].join('\r\n');
    downloadBlob(tsv, 'company-details.xls', 'application/vnd.ms-excel;charset=utf-8;');
    pushToast('success','Excel Exported',`${companies.length} record(s) downloaded.`);
  };
  const handlePrint = () => {
    const rows = companies.map((r) => `<tr>${CSV_COLUMNS.map((c) => `<td>${String(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('');
    const html = `
      <html><head><title>Company Details</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; }
        h2   { margin-bottom: 8px; color: #1e293b; }
        table { border-collapse: collapse; width: 100%; }
        th { background: #0f766e; color: #fff; padding: 7px 10px; text-align: left; font-size: 11px; }
        td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
        tr:nth-child(even) td { background: #f8fafc; }
        @media print { @page { margin: 15mm; } }
      </style></head>
      <body>
        <h2>🏢 Company Details Master</h2>
        <p style="font-size:11px;color:#64748b;margin-bottom:12px;">Exported on ${new Date().toLocaleString()} — ${companies.length} record(s)</p>
        <table><thead><tr>${CSV_COLUMNS.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
      </body></html>`;
    const w = window.open('','_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  // ── Open form ─────────────────────────────────────────────
  const openCreate = () => {
    setForm(sanitizeCompany(BLANK));
    setLogoPreview(null);
    setEditId(null); setError(''); setFieldErrors({}); setShowForm(true);
  };

  const openEdit = async (id: number) => {
    try {
      const res  = await fetch(`${API}/${id}`);
      const data = await res.json();
      const sanitized = sanitizeCompany(data);
      setForm(sanitized);
      setLogoPreview(sanitized.logo_path ? `${API}/logo/${sanitized.logo_path}` : null);
      setEditId(id); setError(''); setFieldErrors({}); setShowForm(true);
    } catch { pushToast('error','Load Failed','Could not load company details.'); }
  };

  // ── Validation ────────────────────────────────────────────
  const validateField = (key: keyof FieldErrors, value: string) => {
    let msg = '';
    switch (key) {
      case 'email':
        if (value && !isValidEmail(value)) msg = 'Enter a valid email (e.g. info@company.com).';
        break;
      case 'contact_no':
        if (value && !isValidContact(value)) msg = 'Contact number must be 10–13 digits.';
        break;
      case 'gst_no':
        if (value && value.length !== 15) msg = `GST No must be exactly 15 characters (${value.length}/15).`;
        break;
    }
    setFieldErrors((prev) => ({ ...prev, [key]: msg || undefined }));
  };

  const validateAll = (): boolean => {
    const errors: FieldErrors = {};
    if (!form.company_name.trim()) errors.company_name = 'Company Name is required.';
    if (form.email && !isValidEmail(form.email)) errors.email = 'Enter a valid email address.';
    if (form.contact_no && !isValidContact(form.contact_no)) errors.contact_no = 'Contact number must be 10–13 digits.';
    if (form.gst_no && form.gst_no.length !== 15) errors.gst_no = `GST No must be exactly 15 characters (${form.gst_no.length}/15).`;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Save ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validateAll()) { setError('Please fix the highlighted errors before saving.'); return; }
    setError(''); setSaving(true);
    const fd = new FormData();
    const scalars: (keyof Company)[] = [
      'firm','company_name','address','works_address','regd_office',
      'pin_code','district','state','country',
      'gst_no','pan_no','cin_no','policy_no',
      'email','website','contact_name','contact_no',
      'bank_name','branch_name','ac_no','ifsc_code',
      'certifications','status',
    ];
    scalars.forEach((k) => fd.append(k as string, String(form[k] ?? '')));
    if (form.logoFile) fd.append('logo', form.logoFile);
    if (form.removeLogo) fd.append('remove_logo', '1');
    if (form.logo_path) fd.append('existing_logo_path', form.logo_path);

    try {
      const res = await fetch(editId ? `${API}/${editId}` : API, { method: editId ? 'PUT' : 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json())?.message || 'Save failed');
      pushToast('success', editId ? 'Company Updated' : 'Company Created', `${form.company_name} saved successfully.`);
      setShowForm(false); loadCompanies();
    } catch (e: any) {
      const msg = e.message ?? 'Save failed';
      setError(msg); pushToast('error','Save Failed', msg);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this company profile?')) return;
    try {
      await fetch(`${API}/${id}`, { method:'DELETE' });
      pushToast('success','Company Deleted','The company record has been removed.');
      loadCompanies();
    } catch { pushToast('error','Delete Failed','Could not delete company.'); }
  };

  // ── Form helpers ──────────────────────────────────────────
  const setF = (key: keyof Company, val: any) => setForm((f) => ({ ...f, [key]: val }));
  const inp = (key: keyof Company, placeholder = '') => (
    <input type="text" value={form[key] == null ? '' : String(form[key])}
      onChange={(e) => setF(key, e.target.value)} placeholder={placeholder} style={s.input} />
  );
  const handleLogoSelect = (files: FileList | null) => {
    if (!files || !files[0]) return;
    const file = files[0];
    setForm((p) => ({ ...p, logoFile: file, removeLogo: false }));
    setLogoPreview(URL.createObjectURL(file));
  };
  const clearLogo = () => {
    setForm((p) => ({ ...p, logoFile: null, removeLogo: true, logo_path: null }));
    setLogoPreview(null);
  };
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
  const goTo = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  const showEmail = !isMobile;
  const showState = !isMobile;
  const showGst   = width >= 768;
  const showFirm  = width >= 480;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes toastIn    { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
        @keyframes spin       { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        @keyframes dropdownIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }

        .cd-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }

        .cd-page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
        .cd-page-header h1 { margin:0; font-size:20px; font-weight:700; color:#1e293b; }
        .cd-page-header p  { margin:3px 0 0; font-size:13px; color:#64748b; }
        @media(min-width:576px){ .cd-page-header h1 { font-size:22px; } }

        .cd-header-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }

        .cd-add-btn { display:flex; align-items:center; gap:6px; background:#0f766e; color:#fff; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(15,118,110,0.3); white-space:nowrap; flex-shrink:0; }
        .cd-add-btn:hover { background:#0d6460; }

        .cd-export-btn { display:flex; align-items:center; gap:6px; background:#fff; color:#0f766e; border:1.5px solid #0f766e; border-radius:8px; padding:8px 14px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; white-space:nowrap; flex-shrink:0; transition:background 0.15s, box-shadow 0.15s; }
        .cd-export-btn:hover { background:#f0fdfa; box-shadow:0 2px 6px rgba(15,118,110,0.18); }

        .cd-export-dropdown { position:absolute; top:calc(100% + 6px); right:0; min-width:190px; background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.12); padding:6px 0; z-index:3000; animation:dropdownIn 0.18s ease-out; font-family:'DM Sans',sans-serif; }
        .cd-export-label { padding:6px 14px 4px; margin:0; font-size:10px; font-weight:700; color:#94a3b8; letter-spacing:0.07em; text-transform:uppercase; }
        .cd-export-item { display:flex; align-items:center; gap:10px; width:100%; padding:9px 14px; background:none; border:none; cursor:pointer; font-size:13px; font-weight:500; color:#1e293b; font-family:'DM Sans',sans-serif; text-align:left; transition:background 0.12s; }
        .cd-export-item:hover { background:#f8fafc; }
        .cd-export-divider { height:1px; background:#f1f5f9; margin:4px 0; }
        .cd-export-icon { width:26px; height:26px; border-radius:6px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .cd-export-icon-csv   { background:#fef3c7; color:#92400e; }
        .cd-export-icon-excel { background:#dcfce7; color:#16a34a; }
        .cd-export-icon-print { background:#f0fdfa; color:#0f766e; }

        .cd-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .cd-search-wrap { position:relative; flex:1; min-width:180px; max-width:100%; }
        @media(min-width:768px){ .cd-search-wrap { max-width:320px; } }
        .cd-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .cd-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; outline:none; }
        .cd-search:focus { border-color:#0f766e; }
        .cd-filter-sel { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#374151; cursor:pointer; outline:none; max-width:150px; }
        .cd-filters-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .cd-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; flex-shrink:0; }
        .cd-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; }
        .cd-rec-count { font-size:12px; color:#64748b; white-space:nowrap; }

        .cd-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:24px; }
        .cd-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .cd-table { width:100%; border-collapse:collapse; font-size:13px; font-family:'DM Sans',sans-serif; min-width:480px; }
        .cd-table thead tr { background:#0f766e; }
        .cd-table th { padding:11px 12px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:12px; }
        @media(min-width:768px){ .cd-table th { font-size:13px; padding:12px 16px; } }
        .cd-table th.th-center { text-align:center; }
        .cd-table tbody tr:nth-child(odd)  td { background:#fff; }
        .cd-table tbody tr:nth-child(even) td { background:#f8fafc; }
        .cd-table tbody tr:hover td { filter:brightness(0.97); }
        .cd-table td { padding:10px 12px; color:#374151; font-size:12px; white-space:nowrap; }
        @media(min-width:768px){ .cd-table td { font-size:13px; padding:11px 16px; } }

        .cd-code { display:inline-block; font-family:'DM Mono',monospace; font-size:11px; font-weight:500; color:#0f766e; background:#f0fdfa; border:1px solid #99f6e4; border-radius:6px; padding:2px 7px; letter-spacing:0.03em; }
        .cd-firm-badge { display:inline-block; font-family:'DM Mono',monospace; font-size:11px; font-weight:700; color:#9a3412; background:#fff7ed; border:1px solid #fed7aa; border-radius:6px; padding:2px 8px; }
        .cd-chip { display:inline-block; padding:2px 9px; border-radius:20px; font-size:11px; font-weight:600; }
        .cd-chip-active   { background:#dcfce7; color:#166534; }
        .cd-chip-inactive { background:#fee2e2; color:#991b1b; }

        .cd-name { font-weight:600; max-width:180px; overflow:hidden; text-overflow:ellipsis; }
        .cd-action-group { display:flex; align-items:center; gap:5px; justify-content:center; }
        .cd-btn-edit { display:inline-flex; align-items:center; gap:3px; background:#f0fdfa; color:#0f766e; border:1px solid #99f6e4; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; }
        .cd-btn-edit:hover { background:#ccfbf1; }
        .cd-btn-del  { display:inline-flex; align-items:center; gap:3px; background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; }
        .cd-btn-del:hover { background:#fee2e2; }
        .cd-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }

        .cd-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; font-family:'DM Sans',sans-serif; }
        @media(min-width:576px){ .cd-pagination { padding:10px 16px; font-size:13px; } }
        .cd-pag-btns { display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
        .cd-pag-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; font-family:'DM Sans',sans-serif; color:#1e293b; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; }
        @media(min-width:576px){ .cd-pag-btn { padding:5px 12px; height:32px; font-size:13px; } }
        .cd-pag-btn:hover:not(:disabled) { background:#f1f5f9; }
        .cd-pag-btn.active { background:#0f766e; color:#fff; border-color:#0f766e; font-weight:700; }
        .cd-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }

        .cd-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:16px 8px; -webkit-overflow-scrolling:touch; }
        @media(min-width:576px){ .cd-modal-overlay { padding:24px 16px; } }
        @media(min-width:992px){ .cd-modal-overlay { padding:32px 24px; } }
        .cd-modal { background:#fff; border-radius:14px; width:100%; max-width:860px; box-shadow:0 8px 40px rgba(0,0,0,0.22); display:flex; flex-direction:column; max-height:calc(100vh - 32px); }
        @media(min-width:576px){ .cd-modal { border-radius:16px; max-height:calc(100vh - 48px); } }
        .cd-modal-header { display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:#0f766e; border-radius:14px 14px 0 0; flex-shrink:0; }
        @media(min-width:576px){ .cd-modal-header { padding:16px 24px; border-radius:16px 16px 0 0; } }
        .cd-modal-body { padding:16px; overflow-y:auto; flex:1; -webkit-overflow-scrolling:touch; }
        @media(min-width:576px){ .cd-modal-body { padding:20px 24px; } }
        .cd-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 14px 14px; }
        @media(min-width:576px){ .cd-modal-footer { padding:14px 24px; border-radius:0 0 16px 16px; } }

        .cd-grid { display:grid; grid-template-columns:1fr; gap:12px; padding:12px 0; }
        @media(min-width:480px){ .cd-grid { grid-template-columns:repeat(2,1fr); gap:14px; } }
        @media(min-width:768px){ .cd-grid { grid-template-columns:repeat(2,1fr); gap:14px 20px; } }
        .cd-col-full { grid-column:1 / -1; }

        .cd-btn-cancel { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; font-family:'DM Sans',sans-serif; }
        .cd-btn-save { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#16a34a; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(22,163,74,0.3); }
        .cd-btn-save:disabled { opacity:0.7; cursor:not-allowed; }

        .cd-hint-pill { display:inline-flex; align-items:center; gap:4px; font-size:10px; color:#64748b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:20px; padding:2px 8px; margin-top:4px; }

        input:focus, select:focus, textarea:focus { outline:none; border-color:#0f766e !important; box-shadow:0 0 0 3px rgba(15,118,110,0.1) !important; }
        select, input, textarea { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
      `}</style>

      <div className="cd-wrap">

        {/* ── PAGE HEADER ── */}
        <div className="cd-page-header">
          <div>
            <h1 style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Building size={20} style={{ color:'#0f766e' }} />
              Company Details Master
            </h1>
            <p>{total} compan{total !== 1 ? 'ies' : 'y'} registered</p>
          </div>
          <div className="cd-header-actions">
            <ExportMenu onExportCSV={handleExportCSV} onExportExcel={handleExportExcel} onPrint={handlePrint} />
            <button className="cd-add-btn" onClick={openCreate}><Plus size={15} /> New Company</button>
          </div>
        </div>

        {/* ── TOOLBAR ── */}
        <div className="cd-toolbar">
          <div className="cd-search-wrap" style={{ flexBasis: isMobile ? '100%' : undefined }}>
            <Search size={14} />
            <input className="cd-search" placeholder="Search company, email, GST, code…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="cd-filters-row">
            <select className="cd-filter-sel" value={filterSt} onChange={(e) => { setFilterSt(e.target.value); setPage(1); }}>
              <option value=''>All Status</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
            {!isMobile && <span className="cd-rec-count">{total} record(s)</span>}
          </div>
          <div className="cd-page-size">
            {!isMobile && <span>Show</span>}
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>

        {isMobile && <p style={{ fontSize:12, color:'#94a3b8', marginBottom:8 }}>{total} record(s)</p>}

        {/* ── TABLE ── */}
        <div className="cd-card">
          <div className="cd-table-wrap">
            <table className="cd-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Company Code</th>
                  <th>Company Name</th>
                  {showFirm  && <th>Firm</th>}
                  {showGst   && <th>GST No</th>}
                  {showEmail && <th>E-Mail</th>}
                  {showState && <th>State</th>}
                  <th>Status</th>
                  <th className="th-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="cd-empty"><Loader2 size={22} style={{ animation:'spin 1s linear infinite' }} /></td></tr>
                ) : companies.length === 0 ? (
                  <tr><td colSpan={9} className="cd-empty">
                    {search || filterSt ? 'No companies match your search' : 'No companies yet. Click "New Company" to create one.'}
                  </td></tr>
                ) : companies.map((c, i) => (
                  <tr key={c.id}>
                    <td style={{ color:'#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                    <td><span className="cd-code">{c.company_code ?? '—'}</span></td>
                    <td className="cd-name">{c.company_name}</td>
                    {showFirm  && <td>{c.firm ? <span className="cd-firm-badge">{c.firm}</span> : '—'}</td>}
                    {showGst   && <td style={{ fontFamily:'DM Mono,monospace', fontSize:11 }}>{c.gst_no || '—'}</td>}
                    {showEmail && <td>{c.email || '—'}</td>}
                    {showState && <td>{c.state || '—'}</td>}
                    <td><span className={`cd-chip ${c.status === 'Active' ? 'cd-chip-active' : 'cd-chip-inactive'}`}>{c.status}</span></td>
                    <td>
                      <div className="cd-action-group">
                        <button className="cd-btn-edit" onClick={() => openEdit(c.id!)}>✏️ {!isMobile && 'Edit'}</button>
                        <button className="cd-btn-del"  onClick={() => handleDelete(c.id!)}>🗑 {!isMobile && 'Delete'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && total > 0 && (
            <div className="cd-pagination">
              <span>Page {page} of {totalPages}</span>
              <div className="cd-pag-btns">
                <button className="cd-pag-btn" onClick={() => goTo(1)}        disabled={page === 1}>«</button>
                <button className="cd-pag-btn" onClick={() => goTo(page - 1)} disabled={page === 1}>‹</button>
                {pageNums.map((p) => <button key={p} className={`cd-pag-btn${p === page ? ' active' : ''}`} onClick={() => goTo(p)}>{p}</button>)}
                <button className="cd-pag-btn" onClick={() => goTo(page + 1)} disabled={page === totalPages}>›</button>
                <button className="cd-pag-btn" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* ── MODAL ── */}
        {showForm && (
          <div className="cd-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="cd-modal">

              <div className="cd-modal-header">
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  <h2 style={{ margin:0, fontSize:isMobile ? 15 : 18, fontWeight:700, color:'#fff' }}>
                    {editId ? '✏️ Edit Company' : '➕ New Company'}
                  </h2>
                  {editId && form.company_code && (
                    <span style={{ fontSize:11, color:'#99f6e4', fontFamily:'DM Mono,monospace' }}>{form.company_code}</span>
                  )}
                </div>
                <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={20} color="#fff" /></button>
              </div>

              {error && (
                <div style={s.errorBanner}>
                  <AlertCircle size={15} style={{ flexShrink:0 }} />
                  <span>{error}</span>
                  <button onClick={() => setError('')} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', padding:0, color:'#ef4444', display:'flex', alignItems:'center', flexShrink:0 }}>
                    <X size={14} />
                  </button>
                </div>
              )}

              <div className="cd-modal-body">

                <SectionHead title="Company Details" open={sec.main} onToggle={() => toggle('main')} />
                {sec.main && (
                  <div className="cd-grid">

                    {/* Logo uploader */}
                    <div className="cd-col-full" style={{ display:'flex', alignItems:'center', gap:14 }}>
                      <div
                        onClick={() => logoRef.current?.click()}
                        style={{
                          width:72, height:72, borderRadius:10, border:'1.5px dashed #99f6e4',
                          background: logoPreview ? '#fff' : '#f0fdfa',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          overflow:'hidden', cursor:'pointer', flexShrink:0,
                        }}
                      >
                        {logoPreview
                          ? <img src={logoPreview} alt="logo" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                          : <ImageIcon size={24} color="#5eead4" />}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        <div style={{ display:'flex', gap:8 }}>
                          <button type="button" className="cd-btn-edit" onClick={() => logoRef.current?.click()}>
                            <Upload size={12} /> {logoPreview ? 'Replace Logo' : 'Upload Logo'}
                          </button>
                          {logoPreview && <button type="button" className="cd-btn-del" onClick={clearLogo}><X size={12} /> Remove</button>}
                        </div>
                        <span style={{ fontSize:11, color:'#94a3b8' }}>JPG, PNG, SVG or WEBP — max 5 MB</span>
                      </div>
                      <input ref={logoRef} type="file" accept=".jpg,.jpeg,.png,.svg,.webp" style={{ display:'none' }} onChange={(e) => handleLogoSelect(e.target.files)} />
                    </div>

                    <div className="cd-col-full">
                      <Field label="Company Name" required error={fieldErrors.company_name}>
                        <input type="text" value={form.company_name}
                          onChange={(e) => { setF('company_name', e.target.value); if (e.target.value.trim()) setFieldErrors((p) => ({ ...p, company_name:undefined })); }}
                          style={{ ...s.input, background:'#dcfce7', ...(fieldErrors.company_name ? s.inputError : {}) }} />
                      </Field>
                    </div>

                    <Field label="Address">
                      <textarea value={form.address} onChange={(e) => setF('address', e.target.value)}
                        rows={3} placeholder="Shed no, Street, Area" style={{ ...s.input, resize:'vertical', minHeight:70 }} />
                    </Field>

                    <div className="cd-grid" style={{ padding:0, gap:14 }}>
                      <Field label="GST No" error={fieldErrors.gst_no}>
                        <input type="text" value={form.gst_no}
                          onChange={(e) => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,15); setF('gst_no', v); validateField('gst_no', v); }}
                          maxLength={15} style={{ ...s.input, fontFamily:'DM Mono,monospace', ...(fieldErrors.gst_no ? s.inputError : {}) }} />
                      </Field>
                      <Field label="PAN No">
                        <input type="text" value={form.pan_no}
                          onChange={(e) => setF('pan_no', e.target.value.toUpperCase().slice(0,10))}
                          maxLength={10} style={{ ...s.input, fontFamily:'DM Mono,monospace' }} />
                      </Field>
                    </div>

                    <Field label="Pin Code">
                      <input value={form.pin_code} onChange={(e) => setF('pin_code', e.target.value.replace(/\D/g,'').slice(0,6))} maxLength={6} style={s.input} />
                    </Field>
                    <Field label="CIN No">{inp('cin_no')}</Field>

                    <Field label="District">{inp('district')}</Field>
                    <Field label="Policy No">{inp('policy_no')}</Field>

                    <Field label="State">
                      <select value={form.state} onChange={(e) => setF('state', e.target.value)} style={{ ...s.input, cursor:'pointer' }}>
                        {STATE_LIST.map((st) => <option key={st} value={st}>{st}</option>)}
                      </select>
                    </Field>
                    <Field label="E-Mail ID" error={fieldErrors.email}>
                      <input type="email" value={form.email}
                        onChange={(e) => { setF('email', e.target.value); validateField('email', e.target.value); }}
                        placeholder="info@company.com" style={{ ...s.input, ...(fieldErrors.email ? s.inputError : {}) }} />
                    </Field>

                    <Field label="Country">{inp('country')}</Field>
                    <Field label="Website">{inp('website', 'www.company.in')}</Field>

                    <Field label="Contact Name">{inp('contact_name')}</Field>
                    <Field label="Contact No" error={fieldErrors.contact_no}>
                      <input type="tel" value={form.contact_no}
                        onChange={(e) => { const v = e.target.value.replace(/[^\d\s\+\-]/g,'').slice(0,15); setF('contact_no', v); validateField('contact_no', v); }}
                        maxLength={15} style={{ ...s.input, ...(fieldErrors.contact_no ? s.inputError : {}) }} />
                    </Field>

                  </div>
                )}

                <SectionHead title="Bank Details" open={sec.bank} onToggle={() => toggle('bank')} />
                {sec.bank && (
                  <div className="cd-grid">
                    <Field label="Bank Name">{inp('bank_name')}</Field>
                    <Field label="Branch Name">{inp('branch_name')}</Field>
                    <Field label="Ac No">{inp('ac_no')}</Field>
                    <Field label="IFSC Code">
                      <input type="text" value={form.ifsc_code} onChange={(e) => setF('ifsc_code', e.target.value.toUpperCase().slice(0,11))}
                        maxLength={11} style={{ ...s.input, fontFamily:'DM Mono,monospace' }} />
                    </Field>
                  </div>
                )}

                <SectionHead title="Additional / Print Header Details" open={sec.extra} onToggle={() => toggle('extra')} />
                {sec.extra && (
                  <div className="cd-grid">
                    <Field label="Firm (links to AE / AEF invoices)">
                      <select value={form.firm} onChange={(e) => setF('firm', e.target.value as Company['firm'])} style={{ ...s.input, cursor:'pointer' }}>
                        <option value="">— Select Firm —</option>
                        <option value="AEF">AEF</option>
                        <option value="AE">AE</option>
                      </select>
                    </Field>
                    <Field label="Status">
                      <select value={form.status} onChange={(e) => setF('status', e.target.value)} style={{ ...s.input, cursor:'pointer' }}>
                        <option>Active</option>
                        <option>Inactive</option>
                      </select>
                    </Field>
                    <div className="cd-col-full">
                      <Field label="Works Address (printed on Packing List / Invoice header)">
                        <textarea value={form.works_address} onChange={(e) => setF('works_address', e.target.value)} rows={2} style={{ ...s.input, resize:'vertical', minHeight:52 }} />
                      </Field>
                    </div>
                   
                    <div className="cd-col-full">
                      <Field label="Certifications (comma-separated)">
                        <input value={form.certifications} onChange={(e) => setF('certifications', e.target.value)}
                          placeholder="FSC, GOTS, ORGANIC BLENDED, OEKO-TEX STANDARD 100, BCI" style={s.input} />
                      </Field>
                      <span className="cd-hint-pill">Shown as badges on the invoice footer</span>
                    </div>
                  </div>
                )}

              </div>

              <div className="cd-modal-footer">
                <button className="cd-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="cd-btn-save" onClick={handleSave} disabled={saving}>
                  {saving ? <><Loader2 size={15} style={{ animation:'spin 1s linear infinite' }} /> Saving…</> : (editId ? '✏️ Update' : '💾 Save Company')}
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
  closeBtn: { background:'none', border:'none', padding:'0 4px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity:0.85 },
  errorBanner: { display:'flex', alignItems:'center', gap:8, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, color:'#ef4444', padding:'10px 16px', margin:'12px 16px 0', fontSize:13, fontFamily:"'DM Sans', sans-serif" },
  label: { display:'block', fontSize:11, fontWeight:700, color:'#64748b', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' },
  input: { width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid #cbd5e1', fontSize:13, color:'#1e293b', outline:'none', boxSizing:'border-box', transition:'border-color 0.15s', background:'#fff' },
  inputError: { border:'1.5px solid #fca5a5', background:'#fff5f5', boxShadow:'0 0 0 3px rgba(239,68,68,0.08)' },
  sectionHead: { display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 14px', cursor:'pointer', marginTop:18, userSelect:'none' },
  sectionTitle: { fontWeight:700, fontSize:13, color:'#1e293b' },
};