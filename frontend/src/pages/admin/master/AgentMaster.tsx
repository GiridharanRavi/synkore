// frontend/src/pages/admin/AgentMaster.tsx
// Agent Master — Fully Responsive, styled exactly like CustomerMaster
// Validation UI:
//   - Email: inline ✓/✗ icon inside input + two-line error below with FieldError
//   - Contact No: FieldError below with AlertCircle icon + hint pill when valid
//   - GST (15), PAN (10), TAN (10): counter INSIDE input right + hint pill badge + inputSuccess/inputError borders

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
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
  Eye,
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  Mail,
  Download,
  FileSpreadsheet,
  Printer,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Attachment { id?: number; file_name: string; file_path?: string; isNew?: boolean; file?: File }

interface Agent {
  id?: number;
  agent_code?: string;
  type: string;
  agent_name: string;
  address: string;
  pin_code: string;
  district: string;
  state: string;
  country: string;
  gst_no: string;
  pan_no: string;
  tan_no: string;
  msme: string;
  msme_sector: string;
  msme_type: string;
  msme_reg_no: string;
  email: string;
  contact_name: string;
  designation: string;
  contact_no: string;
  contact_email: string;
  commission_pct: string;
  status: string;
  attachments: Attachment[];
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  if (!email) return true;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return re.test(email.trim());
}

function isValidContact(contact: string): boolean {
  if (!contact) return true;
  const digits = contact.replace(/[\s\-\+]/g, '');
  return /^\d{10,13}$/.test(digits);
}

function isValidGST(gst: string): boolean {
  if (!gst) return true;
  return /^[A-Z0-9]{15}$/i.test(gst.trim());
}

function isValidPAN(pan: string): boolean {
  if (!pan) return true;
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(pan.trim());
}

function isValidTAN(tan: string): boolean {
  if (!tan) return true;
  return /^[A-Z]{4}[0-9]{5}[A-Z]$/i.test(tan.trim());
}

// ─── Field error map type ─────────────────────────────────────────────────────

interface FieldErrors {
  agent_name?: string;
  email?: string;
  contact_email?: string;
  contact_no?: string;
  gst_no?: string;
  pan_no?: string;
  tan_no?: string;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string }
let _toastId = 0;

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++_toastId;
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
            <button onClick={() => onRemove(t.id)} style={{ flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.color, opacity: 0.6, display: 'flex', alignItems: 'center', marginTop: 1 }}><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

// ─── FieldError ───────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#dc2626', marginTop: 4, lineHeight: 1.4 }}>
      <AlertCircle size={11} style={{ flexShrink: 0 }} />
      {msg}
    </span>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, required, children, error }: { label: string; required?: boolean; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label style={s.label}>{label}{required && <span style={{ color: '#ef4444' }}> *</span>}</label>
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

// ─── Export Dropdown ─────────────────────────────────────────────────────────

function ExportDropdown({ agents, allAgents, onExportAll }: {
  agents: Agent[];
  allAgents: () => Promise<Agent[]>;
  onExportAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const exportCSV = async () => {
    setOpen(false);
    const data = await allAgents();
    const headers = ['Agent ID', 'Name', 'Type', 'Email', 'Contact No', 'State', 'District', 'GST No', 'PAN No', 'TAN No', 'Commission %', 'Status'];
    const rows = data.map((a) => [
      a.agent_code ?? '',
      a.agent_name,
      a.type,
      a.email,
      a.contact_no,
      a.state,
      a.district,
      a.gst_no,
      a.pan_no,
      a.tan_no,
      a.commission_pct,
      a.status,
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`));

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `agents_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportExcel = async () => {
    setOpen(false);
    const data = await allAgents();
    // Build a simple HTML table that Excel can open
    const headers = ['Agent ID', 'Name', 'Type', 'Email', 'Contact No', 'State', 'District', 'GST No', 'PAN No', 'TAN No', 'Commission %', 'Status'];
    const ths = headers.map((h) => `<th>${h}</th>`).join('');
    const trs = data.map((a) => {
      const cells = [
        a.agent_code ?? '', a.agent_name, a.type, a.email, a.contact_no,
        a.state, a.district, a.gst_no, a.pan_no, a.tan_no, a.commission_pct, a.status,
      ].map((v) => `<td>${String(v ?? '')}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/><style>th{background:#7c3aed;color:#fff;font-weight:bold;}td,th{border:1px solid #ccc;padding:6px 10px;font-size:12px;}</style></head>
<body><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `agents_${new Date().toISOString().slice(0, 10)}.xls`;
    a.click(); URL.revokeObjectURL(url);
  };

  const printTable = async () => {
    setOpen(false);
    const data = await allAgents();
    const headers = ['Agent ID', 'Name', 'Type', 'Email', 'Contact No', 'State', 'Comm %', 'Status'];
    const ths = headers.map((h) => `<th>${h}</th>`).join('');
    const trs = data.map((a, i) => {
      const bg = i % 2 === 0 ? '#fff' : '#faf5ff';
      const cells = [
        a.agent_code ?? '', a.agent_name, a.type, a.email,
        a.contact_no, a.state,
        a.commission_pct ? `${a.commission_pct}%` : '—', a.status,
      ].map((v) => `<td>${String(v ?? '')}</td>`).join('');
      return `<tr style="background:${bg}">${cells}</tr>`;
    }).join('');

    const win = window.open('', '_blank', 'width=1000,height=700');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Agent Master</title>
<style>
  body { font-family: 'DM Sans', Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 0; padding: 20px; }
  h2 { margin: 0 0 4px; font-size: 18px; color: #7c3aed; }
  p { margin: 0 0 16px; font-size: 12px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #7c3aed; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; }
  td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
  @media print { body { padding: 10px; } }
</style></head>
<body>
<h2>Agent Master</h2>
<p>Exported on ${new Date().toLocaleString()} &nbsp;|&nbsp; Total: ${data.length} agents</p>
<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`);
    win.document.close();
  };

  const items: { label: string; icon: React.ReactNode; color: string; action: () => void }[] = [
    { label: 'Export as CSV',   icon: <FileText       size={14} />, color: '#7c3aed', action: exportCSV   },
    { label: 'Export as Excel', icon: <FileSpreadsheet size={14} />, color: '#16a34a', action: exportExcel },
    { label: 'Print Table',     icon: <Printer        size={14} />, color: '#2563eb', action: printTable  },
  ];

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        className="am-export-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Download size={14} />
        Export
        <ChevronDown size={13} style={{ marginLeft: 2, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>

      {open && (
        <div className="am-export-menu" role="menu">
          <p className="am-export-menu-title">EXPORT / PRINT</p>
          {items.map((item) => (
            <button
              key={item.label}
              className="am-export-item"
              onClick={item.action}
              role="menuitem"
            >
              <span style={{ color: item.color, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal',
  'A&N Islands', 'Chandigarh', 'D&N Haveli', 'Daman & Diu', 'Delhi', 'Jammu & Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

const TAMIL_NADU_DISTRICTS = [
  'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri', 'Dindigul',
  'Erode', 'Kallakurichi', 'Kancheepuram', 'Kanyakumari', 'Karur', 'Krishnagiri', 'Madurai',
  'Mayiladuthurai', 'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur', 'Pudukkottai',
  'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi', 'Thanjavur', 'Theni',
  'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli', 'Tirupathur', 'Tiruppur', 'Tiruvallur',
  'Tiruvannamalai', 'Tiruvarur', 'Vellore', 'Viluppuram', 'Virudhunagar',
];

const getDistricts = (state: string) => state === 'Tamil Nadu' ? TAMIL_NADU_DISTRICTS : [];

const BLANK: Agent = {
  type: 'Individual', agent_name: '',
  address: '', pin_code: '', district: '', state: '', country: 'India',
  gst_no: '', pan_no: '', tan_no: '',
  msme: 'No', msme_sector: '', msme_type: '', msme_reg_no: '',
  email: '', contact_name: '', designation: '', contact_no: '', contact_email: '',
  commission_pct: '', status: 'Active', attachments: [],
};

const API = '/api/agents';
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return w;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AgentMaster() {
  const [agents, setAgents]     = useState<Agent[]>([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [filterSt, setFilterSt] = useState('');
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<Agent>(BLANK);
  const [editId, setEditId]     = useState<number | null>(null);
  const [error, setError]       = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sec, setSec] = useState({ basic: true, address: true, contact: true, tax: true, msme: false, attach: false });

  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const width   = useWidth();
  const isMobile = width < 576;

  // ── Live field validation ──────────────────────────────────────────────────

  const validateField = (key: keyof FieldErrors, value: string) => {
    let msg = '';
    switch (key) {
      case 'email':
      case 'contact_email':
        if (value && !isValidEmail(value))
          msg = 'Enter a valid email (e.g. user@example.com). Format like "@domain.com" or "user.domain" is not valid.';
        break;
      case 'contact_no':
        if (value && !isValidContact(value))
          msg = 'Contact number must be 10–13 digits (digits only, + or spaces allowed).';
        break;
      case 'gst_no':
        if (value && value.length !== 15)
          msg = `GST No must be exactly 15 characters (${value.length}/15).`;
        break;
      case 'pan_no':
        if (value && !isValidPAN(value))
          msg = `PAN must be 10 characters in format AAAAA9999A (${value.length}/10).`;
        break;
      case 'tan_no':
        if (value && !isValidTAN(value))
          msg = `TAN must be 10 characters in format AAAA99999A (${value.length}/10).`;
        break;
    }
    setFieldErrors((prev) => ({ ...prev, [key]: msg || undefined }));
  };

  // ── Validate all before save ───────────────────────────────────────────────

  const validateAll = (): boolean => {
    const errors: FieldErrors = {};

    if (!form.agent_name.trim()) errors.agent_name = 'Agent Name is required.';

    if (form.email && !isValidEmail(form.email))
      errors.email = 'Enter a valid email address (e.g. user@example.com).';

    if (form.contact_email && !isValidEmail(form.contact_email))
      errors.contact_email = 'Enter a valid email address (e.g. user@example.com).';

    if (form.contact_no && !isValidContact(form.contact_no))
      errors.contact_no = 'Contact number must be 10–13 digits.';

    if (form.gst_no && form.gst_no.length !== 15)
      errors.gst_no = `GST No must be exactly 15 characters (${form.gst_no.length}/15).`;

    if (form.pan_no && !isValidPAN(form.pan_no))
      errors.pan_no = `PAN No must be 10 characters in format AAAAA9999A (${form.pan_no.length}/10).`;

    if (form.tan_no && !isValidTAN(form.tan_no))
      errors.tan_no = `TAN No must be 10 characters in format AAAA99999A (${form.tan_no.length}/10).`;

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadAgents = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ search, page: String(page), limit: String(pageSize), ...(filterSt ? { status: filterSt } : {}) });
      const res  = await fetch(`${API}?${qs}`);
      const data = await res.json();
      setAgents(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch { pushToast('error', 'Load Failed', 'Could not fetch agents.'); }
    setLoading(false);
  };

  // Fetch ALL agents (no pagination) for export
  const fetchAllAgents = async (): Promise<Agent[]> => {
    try {
      const qs = new URLSearchParams({ search, limit: '99999', ...(filterSt ? { status: filterSt } : {}) });
      const res  = await fetch(`${API}?${qs}`);
      const data = await res.json();
      return data.data ?? [];
    } catch {
      pushToast('error', 'Export Failed', 'Could not fetch all agents for export.');
      return [];
    }
  };

  useEffect(() => { loadAgents(); }, [search, filterSt, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, filterSt]);
  useEffect(() => { document.body.style.overflow = showForm ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [showForm]);

  // ── Open form ─────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(BLANK); setEditId(null); setError(''); setFieldErrors({}); setShowForm(true);
  };
  const openEdit = async (id: number) => {
    try {
      const res  = await fetch(`${API}/${id}`);
      const data = await res.json();
      setForm({ ...data, attachments: data.attachments ?? [] });
      setEditId(id); setError(''); setFieldErrors({}); setShowForm(true);
    } catch { pushToast('error', 'Load Failed', 'Could not load agent details.'); }
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!validateAll()) {
      setError('Please fix the highlighted errors before saving.');
      const hasContactErr = !!(fieldErrors.email || fieldErrors.contact_email || fieldErrors.contact_no);
      const hasTaxErr     = !!(fieldErrors.gst_no || fieldErrors.pan_no || fieldErrors.tan_no);
      if (hasContactErr) setSec((p) => ({ ...p, contact: true }));
      if (hasTaxErr)     setSec((p) => ({ ...p, tax: true }));
      return;
    }

    setError(''); setSaving(true);
    const fd = new FormData();
    const scalar: (keyof Agent)[] = [
      'type', 'agent_name', 'address', 'pin_code', 'district', 'state', 'country',
      'gst_no', 'pan_no', 'tan_no', 'msme', 'msme_sector', 'msme_type', 'msme_reg_no',
      'email', 'contact_name', 'designation', 'contact_no', 'contact_email', 'commission_pct', 'status',
    ];
    scalar.forEach((k) => fd.append(k, String(form[k] ?? '')));
    form.attachments.filter((a) => a.isNew && a.file).forEach((a) => fd.append('attachments', a.file!));
    fd.append('deleted_attachments', JSON.stringify((form as any).__deletedAttachments ?? []));
    try {
      const res = await fetch(editId ? `${API}/${editId}` : API, { method: editId ? 'PUT' : 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      pushToast('success', editId ? 'Agent Updated' : 'Agent Created', `${form.agent_name} saved successfully.`);
      setShowForm(false); loadAgents();
    } catch (e: any) {
      const msg = e.message ?? 'Save failed';
      setError(msg); pushToast('error', 'Save Failed', msg);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this agent?')) return;
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE' });
      pushToast('success', 'Agent Deleted', 'The agent record has been removed.');
      loadAgents();
    } catch { pushToast('error', 'Delete Failed', 'Could not delete agent.'); }
  };

  // ── Form helpers ──────────────────────────────────────────────────────────

  const set = (key: keyof Agent, val: any) => setForm((f) => ({ ...f, [key]: val }));

  const inp = (key: keyof Agent, type = 'text') => (
    <input type={type} value={String(form[key] ?? '')} onChange={(e) => set(key, e.target.value)} style={s.input} />
  );
  const sel = (key: keyof Agent, opts: string[]) => (
    <select value={String(form[key] ?? '')} onChange={(e) => set(key, e.target.value)} style={s.input}>
      <option value=''>— Select —</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  const handleFileAdd = (files: FileList | null) => {
    if (!files) return;
    setForm((prev) => ({ ...prev, attachments: [...prev.attachments, ...Array.from(files).map((f) => ({ file_name: f.name, isNew: true, file: f }))] }));
  };
  const removeAttachment = (i: number) => {
    setForm((prev) => {
      const att = prev.attachments[i];
      const deleted = (prev as any).__deletedAttachments ?? [];
      return { ...prev, attachments: prev.attachments.filter((_, j) => j !== i), __deletedAttachments: att.id ? [...deleted, att.id] : deleted };
    });
  };

  const toggle = (k: keyof typeof sec) => setSec((p) => ({ ...p, [k]: !p[k] }));

  // ── Pagination ────────────────────────────────────────────────────────────

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

  const showContact = width >= 480;
  const showEmail   = !isMobile;
  const showState   = !isMobile;
  const showType    = width >= 768;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes toastIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes menuIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }

        .am-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }

        .am-page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
        .am-page-header h1 { margin:0; font-size:20px; font-weight:700; color:#1e293b; }
        .am-page-header p  { margin:3px 0 0; font-size:13px; color:#64748b; }
        @media(min-width:576px){ .am-page-header h1 { font-size:22px; } }

        /* Header right-side action group */
        .am-header-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }

        .am-add-btn { display:flex; align-items:center; gap:6px; background:#7c3aed; color:#fff; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(124,58,237,0.3); white-space:nowrap; touch-action:manipulation; }
        .am-add-btn:hover { background:#6d28d9; }

        /* Export button */
        .am-export-btn {
          display:flex; align-items:center; gap:6px;
          background:#fff; color:#374151;
          border:1.5px solid #cbd5e1; border-radius:8px;
          padding:8px 14px; font-size:13px; font-weight:600;
          cursor:pointer; font-family:'DM Sans',sans-serif;
          white-space:nowrap; touch-action:manipulation;
          box-shadow:0 1px 3px rgba(0,0,0,0.06);
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .am-export-btn:hover { border-color:#7c3aed; color:#7c3aed; box-shadow:0 2px 6px rgba(124,58,237,0.12); }

        /* Export dropdown menu */
        .am-export-menu {
          position:absolute; top:calc(100% + 6px); right:0;
          background:#fff; border:1px solid #e2e8f0;
          border-radius:12px; padding:8px;
          min-width:190px; z-index:3000;
          box-shadow:0 8px 28px rgba(0,0,0,0.13);
          animation:menuIn 0.18s ease-out;
        }
        .am-export-menu-title {
          font-size:10px; font-weight:700; color:#94a3b8;
          letter-spacing:0.08em; text-transform:uppercase;
          padding:4px 8px 6px; margin:0;
        }
        .am-export-item {
          display:flex; align-items:center; gap:10px;
          width:100%; padding:9px 10px; border:none; background:none;
          border-radius:8px; cursor:pointer; font-size:13px; font-weight:500;
          color:#374151; font-family:'DM Sans',sans-serif;
          text-align:left; transition:background 0.12s;
          touch-action:manipulation;
        }
        .am-export-item:hover { background:#f5f3ff; color:#7c3aed; }

        .am-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .am-search-wrap { position:relative; flex:1; min-width:180px; max-width:100%; }
        @media(min-width:768px){ .am-search-wrap { max-width:320px; } }
        .am-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .am-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; outline:none; }
        .am-search:focus { border-color:#7c3aed; }
        .am-filter-sel { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#374151; cursor:pointer; outline:none; max-width:150px; }
        .am-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; flex-shrink:0; }
        .am-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; }

        .am-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:24px; }
        .am-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .am-table { width:100%; border-collapse:collapse; font-size:13px; font-family:'DM Sans',sans-serif; min-width:480px; }
        .am-table thead tr { background:#7c3aed; }
        .am-table th { padding:11px 12px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:12px; }
        @media(min-width:768px){ .am-table th { font-size:13px; padding:12px 16px; } }
        .am-table th.th-center { text-align:center; }
        .am-table tbody tr:nth-child(odd) td  { background:#fff; }
        .am-table tbody tr:nth-child(even) td { background:#faf5ff; }
        .am-table tbody tr:hover td { filter:brightness(0.97); }
        .am-table td { padding:10px 12px; color:#374151; font-size:12px; white-space:nowrap; }
        @media(min-width:768px){ .am-table td { font-size:13px; padding:11px 16px; } }

        .am-agt-id { display:inline-block; font-family:'DM Mono',monospace; font-size:11px; font-weight:500; color:#6d28d9; background:#f5f3ff; border:1px solid #ddd6fe; border-radius:6px; padding:2px 7px; letter-spacing:0.03em; }
        .am-chip { display:inline-block; padding:2px 9px; border-radius:20px; font-size:11px; font-weight:600; }
        .am-chip-active   { background:#dcfce7; color:#166534; }
        .am-chip-inactive { background:#fee2e2; color:#991b1b; }
        .am-name { font-weight:600; max-width:160px; overflow:hidden; text-overflow:ellipsis; }
        .am-action-group { display:flex; align-items:center; gap:5px; justify-content:center; }
        .am-btn-edit { display:inline-flex; align-items:center; gap:3px; background:#f5f3ff; color:#7c3aed; border:1px solid #c4b5fd; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; touch-action:manipulation; }
        .am-btn-edit:hover { background:#ede9fe; }
        .am-btn-del  { display:inline-flex; align-items:center; gap:3px; background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; touch-action:manipulation; }
        .am-btn-del:hover { background:#fee2e2; }
        .am-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }

        .am-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; font-family:'DM Sans',sans-serif; }
        @media(min-width:576px){ .am-pagination { padding:10px 16px; font-size:13px; } }
        .am-pag-btns { display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
        .am-pag-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; font-family:'DM Sans',sans-serif; color:#1e293b; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; touch-action:manipulation; }
        .am-pag-btn:hover:not(:disabled){ background:#f1f5f9; }
        .am-pag-btn.active { background:#7c3aed; color:#fff; border-color:#7c3aed; font-weight:700; }
        .am-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }

        .am-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:16px 8px; -webkit-overflow-scrolling:touch; }
        @media(min-width:576px){ .am-modal-overlay { padding:24px 16px; } }
        .am-modal { background:#fff; border-radius:14px; width:100%; max-width:860px; box-shadow:0 8px 40px rgba(0,0,0,0.22); display:flex; flex-direction:column; max-height:calc(100vh - 32px); }
        @media(min-width:576px){ .am-modal { border-radius:16px; max-height:calc(100vh - 48px); } }
        .am-modal-header { display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:#7c3aed; border-radius:14px 14px 0 0; flex-shrink:0; }
        @media(min-width:576px){ .am-modal-header { padding:16px 24px; border-radius:16px 16px 0 0; } }
        .am-modal-body { padding:16px; overflow-y:auto; flex:1; -webkit-overflow-scrolling:touch; }
        @media(min-width:576px){ .am-modal-body { padding:20px 24px; } }
        .am-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 14px 14px; }
        @media(min-width:576px){ .am-modal-footer { padding:14px 24px; border-radius:0 0 16px 16px; } }

        .am-grid { display:grid; grid-template-columns:1fr; gap:12px; padding:12px 0; }
        @media(min-width:480px){ .am-grid { grid-template-columns:repeat(2,1fr); gap:14px; } }
        @media(min-width:768px){ .am-grid { grid-template-columns:repeat(3,1fr); gap:14px 16px; } }
        .am-col-full { grid-column:1/-1; }

        .am-btn-cancel { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; font-family:'DM Sans',sans-serif; touch-action:manipulation; }
        .am-btn-save { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#16a34a; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(22,163,74,0.3); touch-action:manipulation; }
        .am-btn-save:disabled { opacity:0.7; cursor:not-allowed; }

        /* hint pill */
        .am-hint-pill { display:inline-flex; align-items:center; gap:4px; font-size:10px; color:#64748b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:20px; padding:2px 8px; margin-top:4px; }

        /* focus ring */
        input:focus, select:focus, textarea:focus { outline:none; border-color:#7c3aed !important; box-shadow:0 0 0 3px rgba(124,58,237,0.1) !important; }

        select, input, textarea { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
      `}</style>

      <div className="am-wrap">

        {/* PAGE HEADER */}
        <div className="am-page-header">
          <div>
            <h1>Agent Master</h1>
            <p>{total} agent{total !== 1 ? 's' : ''} registered</p>
          </div>

          {/* Action buttons */}
          <div className="am-header-actions">
            <ExportDropdown
              agents={agents}
              allAgents={fetchAllAgents}
              onExportAll={() => {}}
            />
            <button className="am-add-btn" onClick={openCreate}><Plus size={15} /> New Agent</button>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="am-toolbar">
          <div className="am-search-wrap" style={{ flexBasis: isMobile ? '100%' : undefined }}>
            <Search size={14} />
            <input className="am-search" placeholder="Search name, email, phone, AGT-ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="am-filter-sel" value={filterSt} onChange={(e) => { setFilterSt(e.target.value); setPage(1); }}>
              <option value=''>All Status</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
            {!isMobile && <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{total} record(s)</span>}
          </div>
          <div className="am-page-size">
            {!isMobile && <span>Show</span>}
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>

        {isMobile && <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{total} record(s)</p>}

        {/* TABLE */}
        <div className="am-card">
          <div className="am-table-wrap">
            <table className="am-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Agent ID</th>
                  <th>Name</th>
                  {showType    && <th>Type</th>}
                  {showContact && <th>Contact</th>}
                  {showEmail   && <th>Email</th>}
                  {showState   && <th>State</th>}
                  <th>Comm %</th>
                  <th>Status</th>
                  <th className="th-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="am-empty"><Loader2 size={22} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} /></td></tr>
                ) : agents.length === 0 ? (
                  <tr><td colSpan={10} className="am-empty">{search || filterSt ? 'No agents match your search' : 'No agents yet. Click "New Agent" to create one.'}</td></tr>
                ) : (
                  agents.map((a, i) => (
                    <tr key={a.id}>
                      <td style={{ color: '#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                      <td><span className="am-agt-id">{a.agent_code ?? '—'}</span></td>
                      <td className="am-name">{a.agent_name}</td>
                      {showType    && <td>{a.type || '—'}</td>}
                      {showContact && <td>{a.contact_no || '—'}</td>}
                      {showEmail   && <td>{a.email || '—'}</td>}
                      {showState   && <td>{a.state || '—'}</td>}
                      <td>{a.commission_pct ? `${a.commission_pct}%` : '—'}</td>
                      <td><span className={`am-chip ${a.status === 'Active' ? 'am-chip-active' : 'am-chip-inactive'}`}>{a.status}</span></td>
                      <td>
                        <div className="am-action-group">
                          <button className="am-btn-edit" onClick={() => openEdit(a.id!)}>✏️ {!isMobile && 'Edit'}</button>
                          <button className="am-btn-del"  onClick={() => handleDelete(a.id!)}>🗑 {!isMobile && 'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && total > 0 && (
            <div className="am-pagination">
              <span>Page {page} of {totalPages}</span>
              <div className="am-pag-btns">
                <button className="am-pag-btn" onClick={() => goTo(1)} disabled={page === 1}>«</button>
                <button className="am-pag-btn" onClick={() => goTo(page - 1)} disabled={page === 1}>‹</button>
                {pageNums.map((p) => <button key={p} className={`am-pag-btn${p === page ? ' active' : ''}`} onClick={() => goTo(p)}>{p}</button>)}
                <button className="am-pag-btn" onClick={() => goTo(page + 1)} disabled={page === totalPages}>›</button>
                <button className="am-pag-btn" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* MODAL */}
        {showForm && (
          <div className="am-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="am-modal">

              {/* Header */}
              <div className="am-modal-header">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <h2 style={{ margin: 0, fontSize: isMobile ? 15 : 18, fontWeight: 700, color: '#fff' }}>
                    {editId ? '✏️ Edit Agent' : '➕ New Agent'}
                  </h2>
                  {editId && form.agent_code && (
                    <span style={{ fontSize: 11, color: '#ddd6fe', fontFamily: 'DM Mono,monospace' }}>{form.agent_code}</span>
                  )}
                </div>
                <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={20} color="#fff" /></button>
              </div>

              {/* Error banner */}
              {error && (
                <div style={s.errorBanner}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                  <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#ef4444', display: 'flex', alignItems: 'center', flexShrink: 0 }}><X size={14} /></button>
                </div>
              )}

              {/* Body */}
              <div className="am-modal-body">

                {/* ── Basic Info ── */}
                <SectionHead title="Basic Information" open={sec.basic} onToggle={() => toggle('basic')} />
                {sec.basic && (
                  <div className="am-grid">
                    <Field label="Type">{sel('type', ['Individual', 'Sole Proprietary', 'Partnership', 'LLP', 'Private Limited', 'Limited'])}</Field>
                    <div className="am-col-full">
                      <Field label="Agent Name" required error={fieldErrors.agent_name}>
                        <input
                          type="text"
                          value={form.agent_name}
                          onChange={(e) => {
                            set('agent_name', e.target.value);
                            if (e.target.value.trim()) setFieldErrors((p) => ({ ...p, agent_name: undefined }));
                          }}
                          style={{ ...s.input, ...(fieldErrors.agent_name ? s.inputError : {}) }}
                        />
                      </Field>
                    </div>
                    <Field label="Commission %">
                      <input type="number" min="0" max="100" step="0.01" value={form.commission_pct}
                        onChange={(e) => set('commission_pct', e.target.value)} style={s.input} placeholder="e.g. 5.00" />
                    </Field>
                    <Field label="Status">{sel('status', ['Active', 'Inactive'])}</Field>
                  </div>
                )}

                {/* ── Address ── */}
                <SectionHead title="Address Details" open={sec.address} onToggle={() => toggle('address')} />
                {sec.address && (
                  <div className="am-grid">
                    <div className="am-col-full">
                      <Field label="Address">
                        <textarea value={form.address} onChange={(e) => set('address', e.target.value)}
                          style={{ ...s.input, height: 72, resize: 'vertical' }} />
                      </Field>
                    </div>
                    <Field label="Pin Code">{inp('pin_code')}</Field>
                    <Field label="State">
                      <select value={form.state} onChange={(e) => { set('state', e.target.value); set('district', ''); }} style={s.input}>
                        <option value=''>— Select State —</option>
                        {INDIAN_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
                      </select>
                    </Field>
                    <Field label="District">
                      <select value={form.district} onChange={(e) => set('district', e.target.value)} style={s.input}
                        disabled={getDistricts(form.state).length === 0}>
                        <option value=''>{getDistricts(form.state).length === 0 ? '— Select State first —' : '— Select District —'}</option>
                        {getDistricts(form.state).map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </Field>
                    <Field label="Country">{inp('country')}</Field>
                  </div>
                )}

                {/* ── Contact ── */}
                <SectionHead title="Contact Details" open={sec.contact} onToggle={() => toggle('contact')} />
                {sec.contact && (
                  <div className="am-grid">

                    {/* E-Mail — inline ✓/✗ icon + FieldError + hint pill */}
                    <Field label="E-MAIL" error={fieldErrors.email}>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => { set('email', e.target.value); validateField('email', e.target.value); }}
                          onBlur={(e) => validateField('email', e.target.value)}
                          placeholder="user@example.com"
                          style={{
                            ...s.input,
                            paddingRight: 36,
                            ...(fieldErrors.email ? s.inputError
                              : form.email && isValidEmail(form.email) ? s.inputSuccess : {}),
                          }}
                        />
                        {form.email && (
                          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                            {isValidEmail(form.email)
                              ? <CheckCircle2 size={14} color="#16a34a" />
                              : <AlertCircle  size={14} color="#dc2626" />}
                          </span>
                        )}
                      </div>
                      {!fieldErrors.email && (
                        <span className="am-hint-pill"><Mail size={9} /> Must include @ and domain (e.g. user@gmail.com)</span>
                      )}
                    </Field>

                    <Field label="Contact Name">{inp('contact_name')}</Field>
                    <Field label="Designation">{inp('designation')}</Field>

                    {/* Contact No — FieldError below + hint pill */}
                    <Field label="CONTACT NO" required error={fieldErrors.contact_no}>
                      <input
                        type="tel"
                        value={form.contact_no}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^\d\s\+\-]/g, '').slice(0, 15);
                          set('contact_no', v);
                          validateField('contact_no', v);
                        }}
                        onBlur={(e) => validateField('contact_no', e.target.value)}
                        placeholder="e.g. 9876543210"
                        maxLength={15}
                        style={{
                          ...s.input,
                          ...(fieldErrors.contact_no ? s.inputError : {}),
                        }}
                      />
                      {!fieldErrors.contact_no && (
                        <span className="am-hint-pill">10–13 digits required</span>
                      )}
                    </Field>

                    {/* Contact E-Mail — same as E-Mail field */}
                    <Field label="CONTACT E-MAIL" error={fieldErrors.contact_email}>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="email"
                          value={form.contact_email}
                          onChange={(e) => { set('contact_email', e.target.value); validateField('contact_email', e.target.value); }}
                          onBlur={(e) => validateField('contact_email', e.target.value)}
                          placeholder="user@example.com"
                          style={{
                            ...s.input,
                            paddingRight: 36,
                            ...(fieldErrors.contact_email ? s.inputError
                              : form.contact_email && isValidEmail(form.contact_email) ? s.inputSuccess : {}),
                          }}
                        />
                        {form.contact_email && (
                          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                            {isValidEmail(form.contact_email)
                              ? <CheckCircle2 size={14} color="#16a34a" />
                              : <AlertCircle  size={14} color="#dc2626" />}
                          </span>
                        )}
                      </div>
                      {!fieldErrors.contact_email && (
                        <span className="am-hint-pill"><Mail size={9} /> Must include @ and domain (e.g. user@gmail.com)</span>
                      )}
                    </Field>

                  </div>
                )}

                {/* ── Tax & Compliance ── */}
                <SectionHead title="Tax & Compliance" open={sec.tax} onToggle={() => toggle('tax')} />
                {sec.tax && (
                  <div className="am-grid">

                    {/* GST No — counter inside input + hint pill */}
                    <Field label="GST NO" error={fieldErrors.gst_no}>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          value={form.gst_no}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
                            set('gst_no', val);
                            validateField('gst_no', val);
                          }}
                          onBlur={(e) => validateField('gst_no', e.target.value)}
                          placeholder="15-character GST number"
                          maxLength={15}
                          style={{
                            ...s.input,
                            fontFamily: 'DM Mono, monospace',
                            letterSpacing: '0.05em',
                            paddingRight: 56,
                            ...(fieldErrors.gst_no ? s.inputError
                              : form.gst_no && isValidGST(form.gst_no) ? s.inputSuccess : {}),
                          }}
                        />
                        <span style={{
                          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontSize: 10, fontWeight: 700,
                          color: form.gst_no.length === 15 ? '#16a34a' : form.gst_no.length > 0 ? '#d97706' : '#94a3b8',
                          pointerEvents: 'none',
                        }}>
                          {form.gst_no.length}/15
                          {form.gst_no.length === 15 && <CheckCircle2 size={12} color="#16a34a" />}
                        </span>
                      </div>
                      {!fieldErrors.gst_no && (
                        <span className="am-hint-pill">Exactly 15 alphanumeric characters</span>
                      )}
                    </Field>

                    {/* PAN No — counter inside input + hint pill */}
                    <Field label="PAN NO" error={fieldErrors.pan_no}>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          value={form.pan_no}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
                            set('pan_no', val);
                            validateField('pan_no', val);
                          }}
                          onBlur={(e) => validateField('pan_no', e.target.value)}
                          placeholder="AAAAA9999A"
                          maxLength={10}
                          style={{
                            ...s.input,
                            fontFamily: 'DM Mono, monospace',
                            letterSpacing: '0.05em',
                            paddingRight: 56,
                            ...(fieldErrors.pan_no ? s.inputError
                              : form.pan_no && isValidPAN(form.pan_no) ? s.inputSuccess : {}),
                          }}
                        />
                        <span style={{
                          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontSize: 10, fontWeight: 700,
                          color: form.pan_no.length === 10 && isValidPAN(form.pan_no) ? '#16a34a' : form.pan_no.length > 0 ? '#d97706' : '#94a3b8',
                          pointerEvents: 'none',
                        }}>
                          {form.pan_no.length}/10
                          {form.pan_no.length === 10 && isValidPAN(form.pan_no) && <CheckCircle2 size={12} color="#16a34a" />}
                        </span>
                      </div>
                      {!fieldErrors.pan_no && (
                        <span className="am-hint-pill">10 chars: 5 letters + 4 digits + 1 letter</span>
                      )}
                    </Field>

                    {/* TAN No — counter inside input + hint pill */}
                    <Field label="TAN NO" error={fieldErrors.tan_no}>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          value={form.tan_no}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
                            set('tan_no', val);
                            validateField('tan_no', val);
                          }}
                          onBlur={(e) => validateField('tan_no', e.target.value)}
                          placeholder="AAAA99999A"
                          maxLength={10}
                          style={{
                            ...s.input,
                            fontFamily: 'DM Mono, monospace',
                            letterSpacing: '0.05em',
                            paddingRight: 56,
                            ...(fieldErrors.tan_no ? s.inputError
                              : form.tan_no && isValidTAN(form.tan_no) ? s.inputSuccess : {}),
                          }}
                        />
                        <span style={{
                          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontSize: 10, fontWeight: 700,
                          color: form.tan_no.length === 10 && isValidTAN(form.tan_no) ? '#16a34a' : form.tan_no.length > 0 ? '#d97706' : '#94a3b8',
                          pointerEvents: 'none',
                        }}>
                          {form.tan_no.length}/10
                          {form.tan_no.length === 10 && isValidTAN(form.tan_no) && <CheckCircle2 size={12} color="#16a34a" />}
                        </span>
                      </div>
                      {!fieldErrors.tan_no && (
                        <span className="am-hint-pill">10 chars: 4 letters + 5 digits + 1 letter</span>
                      )}
                    </Field>

                  </div>
                )}

                {/* ── MSME ── */}
                <SectionHead title="MSME Details" open={sec.msme} onToggle={() => toggle('msme')} />
                {sec.msme && (
                  <div className="am-grid">
                    <Field label="MSME Registered">{sel('msme', ['Yes', 'No'])}</Field>
                    {form.msme === 'Yes' && (
                      <>
                        <Field label="MSME Sector">{sel('msme_sector', ['Manufacturing', 'Service', 'Trading'])}</Field>
                        <Field label="MSME Type">{sel('msme_type', ['Micro', 'Small', 'Medium'])}</Field>
                        <div className="am-col-full">
                          <Field label="MSME Reg. No">{inp('msme_reg_no')}</Field>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ── Attachments ── */}
                <SectionHead title="Attachments" open={sec.attach} onToggle={() => toggle('attach')} />
                {sec.attach && (
                  <div style={s.subSection}>
                    <div style={s.dropZone}
                      onClick={() => fileRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); handleFileAdd(e.dataTransfer.files); }}>
                      <Upload size={22} style={{ color: '#9ca3af', marginBottom: 6 }} />
                      <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>Click or drag files here</p>
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af' }}>PDF, JPG, PNG, DOCX — max 10 MB</p>
                      <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        style={{ display: 'none' }} onChange={(e) => handleFileAdd(e.target.files)} />
                    </div>
                    {form.attachments.map((a, i) => (
                      <div key={i} style={{ ...s.attachRow, marginTop: 8 }}>
                        <FileText size={15} style={{ color: '#6b7280', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.file_name}</span>
                        {!a.isNew && a.file_path && (
                          <a href={`/api/agents/attachment/${a.file_path}`} target="_blank" rel="noreferrer" style={{ color: '#7c3aed' }}><Eye size={14} /></a>
                        )}
                        <button style={s.delRowBtn} onClick={() => removeAttachment(i)}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}

              </div>

              {/* Footer */}
              <div className="am-modal-footer">
                <button className="am-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="am-btn-save" onClick={handleSave} disabled={saving}>
                  {saving
                    ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                    : (editId ? '✏️ Update' : '💾 Save Agent')}
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
    display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.85, touchAction: 'manipulation',
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
  inputError: {
    border: '1.5px solid #fca5a5',
    background: '#fff5f5',
    boxShadow: '0 0 0 3px rgba(239,68,68,0.08)',
  },
  inputSuccess: {
    border: '1.5px solid #86efac',
    background: '#f0fdf4',
  },
  sectionHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#f8fafc', border: '1px solid #e2e8f0',
    borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
    marginTop: 18, userSelect: 'none',
  },
  sectionTitle: { fontWeight: 700, fontSize: 13, color: '#1e293b' },
  subSection: {
    background: '#fafbfc', border: '1px solid #e2e8f0',
    borderRadius: 10, padding: 14, marginTop: 10,
  },
  dropZone: {
    border: '2px dashed #cbd5e1', borderRadius: 12,
    padding: '24px 16px', textAlign: 'center', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  attachRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px',
  },
  delRowBtn: {
    background: '#fff1f2', color: '#ef4444', border: '1px solid #fca5a5',
    width: 30, height: 30, borderRadius: 7, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, touchAction: 'manipulation',
  },
};