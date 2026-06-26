import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp,
  Info, Loader2, Plus, Search, Trash2, X, Check,
  Download, FileText, FileSpreadsheet, Printer,
} from 'lucide-react';

// ─── Auth Helper ─────────────────────────────────────────────────────────────

const getToken = (): string => {
  const KEYS = ['token','auth_token','access_token','authToken','accessToken','jwt','JWT','bearer_token','id_token'];
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of KEYS) {
      try {
        const raw = storage.getItem(key);
        if (!raw) continue;
        try {
          const p = JSON.parse(raw);
          if (p && typeof p === 'object') {
            const t = p.access_token || p.token || p.accessToken || p.jwt || null;
            if (t && typeof t === 'string' && t.length > 10) return t;
          }
        } catch { /* not JSON */ }
        if (raw.length > 10) return raw;
      } catch { /* blocked */ }
    }
  }
  return '';
};

const authFetch = async (url: string, options?: RequestInit): Promise<Response | null> => {
  try {
    const token = getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 || res.status === 403) { console.warn(`[authFetch] ${res.status} for ${url}`); return null; }
    return res;
  } catch (e) { console.error(`[authFetch] Error for ${url}:`, e); return null; }
};

// ─── Timezone-safe date helpers ───────────────────────────────────────────────
// MySQL2 returns DATE columns as JS Date objects → JSON.stringify → UTC ISO string
// e.g. "2026-06-11T18:30:00.000Z" (IST midnight). slice(0,10) gives "2026-06-11" (wrong).
// Use local getters to get the correct calendar date.

const toDateStr = (raw?: string | null): string => {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  if (s.includes('T') || s.endsWith('Z')) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return s.slice(0, 10);
};

const fmtDate = (raw?: string | null): string => {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  if (s.includes('T') || s.endsWith('Z')) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }
  const parts = s.slice(0, 10).split('-');
  if (parts.length === 3) {
    const [yyyy, mm, dd] = parts;
    return `${parseInt(dd, 10)}/${parseInt(mm, 10)}/${yyyy}`;
  }
  return s;
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface WarpRow {
  _key: string;
  warp_type: string;
  beam_number: string;
  warp_count: string;
  actual_count: string;
  warp_ends: string;
  reed: string;
  reed_space: string;
  warp_wt_per_mtr: string;
  crimp_pct: string;
  warp_mtr: string;
  warp_req: string;
}

interface WeftRow {
  _key: string;
  weft_count: string;
  actual_count: string;
  onloom_pick: string;
  weft_wt_per_mtr: string;
  weft_req: string;
}

interface WO {
  id?: number;
  wo_no?: string;
  wo_date: string;
  wo_type: string;
  order_plan_no: string;
  co_no: string;
  co_sort_no: string;
  co_cons: string;
  roll_length: string;
  confirmed_by: string;
  co_comp_date: string;
  total_planned_meters: string;
  previous_wo_meters: string;
  loom_width: string;
  production_type: string;
  production_location: string;
  rate_type: string;
  pick_rate: string;
  per_mtr_rate: string;
  no_of_fabric_per_loom: string;
  pwo_meter: string;
  no_of_looms: string;
  spl_instruction: string;
  status: string;
  warp_details: WarpRow[];
  weft_details: WeftRow[];
}

interface PlanOption {
  plan_no: string;
  co_no: string;
  co_sort_no: string;
  co_cons: string;
  roll_length: string;
  confirmed_by: string;
  co_comp_date: string;
  total_planned_meters: string;
  previous_wo_meters: string;
  loom_width: string;
  customer_name?: string;
}

interface LocationOption {
  id: number;
  name: string;
  type?: string;
}

interface YarnOption {
  id: number;
  yarn_count: string;
  actual_count?: string;
  description?: string;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type TT = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: TT; title: string; message?: string }
let _tid = 0;

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: TT, title: string, message?: string) => {
    const id = ++_tid;
    setToasts(p => [...p, { id, type, title, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500);
  }, []);
  const remove = useCallback((id: number) => setToasts(p => p.filter(t => t.id !== id)), []);
  return { toasts, push, remove };
}

const TOAST_CFG: Record<TT, { bg: string; border: string; color: string; icon: React.ReactNode }> = {
  success: { bg:'#f0fdf4', border:'#86efac', color:'#166534', icon:<CheckCircle2 size={16} color="#16a34a"/> },
  error:   { bg:'#fef2f2', border:'#fca5a5', color:'#991b1b', icon:<AlertCircle  size={16} color="#dc2626"/> },
  warning: { bg:'#fffbeb', border:'#fde68a', color:'#92400e', icon:<AlertTriangle size={16} color="#d97706"/> },
  info:    { bg:'#eff6ff', border:'#93c5fd', color:'#1e40af', icon:<Info         size={16} color="#2563eb"/> },
};

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position:'fixed', top:20, right:20, zIndex:9999, display:'flex', flexDirection:'column', gap:10, maxWidth:360, width:'calc(100vw - 40px)', pointerEvents:'none' }}>
      {toasts.map(t => {
        const c = TOAST_CFG[t.type];
        return (
          <div key={t.id} style={{ display:'flex', alignItems:'flex-start', gap:10, background:c.bg, border:`1px solid ${c.border}`, borderRadius:10, padding:'12px 14px', boxShadow:'0 4px 16px rgba(0,0,0,0.12)', pointerEvents:'all', animation:'toastIn 0.25s ease-out', fontFamily:"'DM Sans',sans-serif" }}>
            <span style={{ flexShrink:0, marginTop:1 }}>{c.icon}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontSize:13, fontWeight:700, color:c.color }}>{t.title}</p>
              {t.message && <p style={{ margin:'2px 0 0', fontSize:12, color:c.color, opacity:0.8, lineHeight:1.4 }}>{t.message}</p>}
            </div>
            <button onClick={() => onRemove(t.id)} style={{ flexShrink:0, background:'none', border:'none', padding:0, cursor:'pointer', color:c.color, opacity:0.6, display:'flex', alignItems:'center' }}><X size={14}/></button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Searchable Dropdown ──────────────────────────────────────────────────────

interface SearchDropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string; sublabel?: string }[];
  loading?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

function SearchDropdown({ value, onChange, options, loading, placeholder, disabled }: SearchDropdownProps) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    (o.sublabel || '').toLowerCase().includes(search.toLowerCase())
  );
  const selected = options.find(o => o.value === value);

  return (
    <div ref={wrapRef} style={{ position:'relative' }}>
      <button
        type="button"
        onClick={() => !loading && !disabled && setOpen(o => !o)}
        style={{ ...s.input, display:'flex', alignItems:'center', justifyContent:'space-between', cursor: disabled ? 'not-allowed' : 'pointer', background: disabled ? '#f8fafc' : (value ? '#f0fdf4' : '#fff'), borderColor: open ? '#7c3aed' : (value ? '#c4b5fd' : '#cbd5e1'), height:38, padding:'0 10px 0 12px' }}
      >
        <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:13, color: value ? '#1e293b' : '#9ca3af', textAlign:'left' }}>
          {loading ? 'Loading…' : (selected ? selected.label : (placeholder || '— Select —'))}
        </span>
        <span style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
          {value && !disabled && (
            <span onClick={e => { e.stopPropagation(); onChange(''); }} style={{ cursor:'pointer', color:'#94a3b8', display:'flex' }}><X size={12}/></span>
          )}
          <ChevronDown size={13} style={{ color:'#64748b', transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.15s' }}/>
        </span>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:400, background:'#fff', border:'1px solid #7c3aed', borderTop:'none', borderBottomLeftRadius:8, borderBottomRightRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,0.14)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 10px', borderBottom:'1px solid #e8edf4', background:'#faf5ff' }}>
            <Search size={12} style={{ color:'#94a3b8', flexShrink:0 }}/>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ flex:1, border:'none', outline:'none', fontSize:12.5, fontFamily:"'DM Sans',sans-serif", background:'transparent', color:'#1e293b' }}/>
            {search && <button type="button" onClick={() => setSearch('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:0, display:'flex' }}><X size={12}/></button>}
          </div>
          <div style={{ maxHeight:200, overflowY:'auto' }}>
            {value && <div onClick={() => { onChange(''); setOpen(false); setSearch(''); }} style={{ padding:'8px 12px', fontSize:12, color:'#64748b', fontStyle:'italic', cursor:'pointer', borderBottom:'1px solid #f1f5f9' }}>— Clear —</div>}
            {filtered.length === 0
              ? <div style={{ padding:'16px', textAlign:'center', color:'#94a3b8', fontSize:12 }}>No results</div>
              : filtered.map(o => (
                <div key={o.value} onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid #f8fafc', background: o.value === value ? '#f5f3ff' : undefined, fontSize:13 }}>
                  <span>
                    <span style={{ fontWeight:600, color:'#1e293b' }}>{o.label}</span>
                    {o.sublabel && <span style={{ fontSize:11, color:'#64748b', marginLeft:6 }}>{o.sublabel}</span>}
                  </span>
                  {o.value === value && <Check size={13} style={{ color:'#7c3aed', flexShrink:0 }}/>}
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API            = '/api/work-orders';
const PAGE_SIZE_OPTS = [5, 10, 25, 50];

const BLANK_WARP = (): WarpRow => ({
  _key: Math.random().toString(36).slice(2),
  warp_type:'', beam_number:'Beam 1', warp_count:'', actual_count:'',
  warp_ends:'', reed:'', reed_space:'', warp_wt_per_mtr:'',
  crimp_pct:'0', warp_mtr:'', warp_req:'',
});

const BLANK_WEFT = (): WeftRow => ({
  _key: Math.random().toString(36).slice(2),
  weft_count:'', actual_count:'', onloom_pick:'', weft_wt_per_mtr:'', weft_req:'',
});

const BLANK: WO = {
  wo_date: new Date().toISOString().slice(0,10),
  wo_type:'Bulk',
  order_plan_no:'', co_no:'', co_sort_no:'', co_cons:'', roll_length:'',
  confirmed_by:'', co_comp_date:'', total_planned_meters:'', previous_wo_meters:'0', loom_width:'',
  production_type:'In-house', production_location:'',
  rate_type:'Per Mtr', pick_rate:'', per_mtr_rate:'',
  no_of_fabric_per_loom:'1',
  pwo_meter:'', no_of_looms:'',
  spl_instruction:'',
  status:'Draft',
  warp_details:[BLANK_WARP()],
  weft_details:[BLANK_WEFT()],
};

const STATUS_STYLE: Record<string, { bg:string; color:string }> = {
  'Draft':            { bg:'#f1f5f9', color:'#475569' },
  'Pending Approval': { bg:'#fef9c3', color:'#854d0e' },
  'Approved':         { bg:'#dcfce7', color:'#166534' },
  'In Production':    { bg:'#dbeafe', color:'#1d4ed8' },
  'Completed':        { bg:'#f0fdf4', color:'#15803d' },
  'Cancelled':        { bg:'#fee2e2', color:'#991b1b' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return w;
}

function Field({ label, required, span, hint, children }: { label: string; required?: boolean; span?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div style={ span ? { gridColumn:'1/-1' } : {} }>
      <label style={s.label}>{label}{required && <span style={{ color:'#ef4444' }}> *</span>}</label>
      {children}
      {hint && <p style={{ margin:'3px 0 0', fontSize:11, color:'#94a3b8' }}>{hint}</p>}
    </div>
  );
}

function SectionHead({ title, open, onToggle, accent, badge }: { title:string; open:boolean; onToggle:()=>void; accent?:string; badge?: React.ReactNode }) {
  return (
    <div style={{ ...s.sectionHead, borderLeft:`4px solid ${accent||'#7c3aed'}` }} onClick={onToggle}>
      <span style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={s.sectionTitle}>{title}</span>
        {badge}
      </span>
      {open ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
    </div>
  );
}

function DisplayField({ label, value, mono }: { label:string; value?:string|null; mono?:boolean }) {
  return (
    <div>
      <label style={s.label}>{label}</label>
      <div style={{ ...s.input, background:'#f8fafc', color: value ? '#374151' : '#9ca3af', cursor:'default', display:'flex', alignItems:'center', minHeight:38, fontFamily: mono ? "'DM Mono',monospace" : undefined, fontSize: mono ? 12 : 13 }}>
        {value || '—'}
      </div>
    </div>
  );
}

function GCell({ value, onChange, type='text', readOnly, placeholder }: { value:string; onChange?:(v:string)=>void; type?:string; readOnly?:boolean; placeholder?:string }) {
  return (
    <input type={type} value={value} readOnly={readOnly} placeholder={placeholder} onChange={e => onChange?.(e.target.value)}
      style={{ ...s.gridCell, background:readOnly?'#f8fafc':'#fff', color:readOnly?'#64748b':'#1e293b', cursor:readOnly?'default':'text' }}/>
  );
}

// ─── Computed helpers ─────────────────────────────────────────────────────────

const computeWarpMtr      = (pwo:string, crimp:string)     => { const m=parseFloat(pwo), c=parseFloat(crimp)||0; if(!m) return ''; return (m+(m*c)/100).toFixed(2); };
const computeWarpReq      = (wm:string,  wwt:string)       => { const m=parseFloat(wm), w=parseFloat(wwt); if(!m||!w) return ''; return (m*w).toFixed(4); };
const computeWeftWtPerMtr = (pick:string)                  => { const o=parseFloat(pick); if(!o) return ''; return (o*0.0012).toFixed(4); };
const computeWeftReq      = (pwo:string, wwt:string)       => { const m=parseFloat(pwo), w=parseFloat(wwt); if(!m||!w) return ''; return (m*w).toFixed(4); };
const computePerMtrRate   = (pick:string, onloom:string)   => { const p=parseFloat(pick), o=parseFloat(onloom); if(!p||!o) return ''; return (p*o).toFixed(4); };

// ─── Sanitize WO from API ─────────────────────────────────────────────────────

const sanitizeWO = (data: any): WO => ({
  ...BLANK,
  ...data,
  wo_date:               toDateStr(data.wo_date) || new Date().toISOString().slice(0,10),
  wo_type:               data.wo_type               ?? 'Bulk',
  order_plan_no:         data.order_plan_no          ?? '',
  co_no:                 data.co_no                  ?? '',
  co_sort_no:            data.co_sort_no             ?? '',
  co_cons:               data.co_cons                ?? '',
  roll_length:           data.roll_length            ?? '',
  confirmed_by:          data.confirmed_by           ?? '',
  co_comp_date:          toDateStr(data.co_comp_date),
  total_planned_meters:  data.total_planned_meters   ?? '',
  previous_wo_meters:    data.previous_wo_meters     ?? '0',
  loom_width:            data.loom_width             ?? '',
  production_type:       data.production_type        ?? 'In-house',
  production_location:   data.production_location    ?? '',
  rate_type:             data.rate_type              ?? 'Per Mtr',
  pick_rate:             data.pick_rate              != null ? String(data.pick_rate)              : '',
  per_mtr_rate:          data.per_mtr_rate           != null ? String(data.per_mtr_rate)           : '',
  no_of_fabric_per_loom: data.no_of_fabric_per_loom  ?? '1',
  pwo_meter:             data.pwo_meter              != null ? String(data.pwo_meter)              : '',
  no_of_looms:           data.no_of_looms            != null ? String(data.no_of_looms)            : '',
  spl_instruction:       data.spl_instruction        ?? '',
  status:                data.status                 ?? 'Draft',
  warp_details: (data.warp_details ?? []).map((r:any) => ({
    _key:            String(r.id ?? Math.random()),
    warp_type:       r.warp_type       ?? '',
    beam_number:     r.beam_number     ?? 'Beam 1',
    warp_count:      r.warp_count      ?? '',
    actual_count:    r.actual_count    ?? '',
    warp_ends:       r.warp_ends       != null ? String(r.warp_ends)       : '',
    reed:            r.reed            ?? '',
    reed_space:      r.reed_space      ?? '',
    warp_wt_per_mtr: r.warp_wt_per_mtr != null ? String(r.warp_wt_per_mtr) : '',
    crimp_pct:       r.crimp_pct       != null ? String(r.crimp_pct)       : '0',
    warp_mtr:        r.warp_mtr        != null ? String(r.warp_mtr)        : '',
    warp_req:        r.warp_req        != null ? String(r.warp_req)        : '',
  })),
  weft_details: (data.weft_details ?? []).map((r:any) => ({
    _key:            String(r.id ?? Math.random()),
    weft_count:      r.weft_count      ?? '',
    actual_count:    r.actual_count    ?? '',
    onloom_pick:     r.onloom_pick     != null ? String(r.onloom_pick)     : '',
    weft_wt_per_mtr: r.weft_wt_per_mtr != null ? String(r.weft_wt_per_mtr) : '',
    weft_req:        r.weft_req        != null ? String(r.weft_req)        : '',
  })),
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkOrderMaster() {
  const [wos, setWos]               = useState<WO[]>([]);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState('');
  const [filterSt, setFilterSt]     = useState('');
  const [filterType, setFilterType] = useState('');
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(10);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState<WO>(BLANK);
  const [editId, setEditId]         = useState<number | null>(null);
  const [error, setError]           = useState('');

  // sections — all collapsible, warp/weft included
  const [sec, setSec] = useState({
    basic: true, order: true, production: true, rate: true,
    instructions: false, warp: true, weft: true,
  });

  // ── NEW: Export / Print menu state ─────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting]   = useState(false);

  const [planOptions, setPlanOptions]           = useState<PlanOption[]>([]);
  const [loadingPlans, setLoadingPlans]         = useState(false);
  const [locationOptions, setLocationOptions]   = useState<LocationOption[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [yarnOptions, setYarnOptions]           = useState<YarnOption[]>([]);
  const [loadingYarn, setLoadingYarn]           = useState(false);
  const [pickRateLoading, setPickRateLoading]   = useState(false);
  const [pickRateWarning, setPickRateWarning]   = useState('');

  const { toasts, push: toast, remove: removeToast } = useToast();
  const exportRef = useRef<HTMLDivElement>(null);   // NEW
  const width    = useWidth();
  const isMobile = width < 576;

  // ── Load WO list ──────────────────────────────────────────────
  const loadWOs = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        search, page:String(page), limit:String(pageSize),
        ...(filterSt   ? { status:filterSt }     : {}),
        ...(filterType ? { wo_type:filterType }   : {}),
      });
      const res = await authFetch(`${API}?${qs}`);
      if (!res) { toast('error','Unauthorized','Session expired.'); setLoading(false); return; }
      const data = await res.json();
      setWos(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch { toast('error','Load Failed','Could not fetch work orders.'); }
    setLoading(false);
  };

  useEffect(() => { loadWOs(); }, [search, filterSt, filterType, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, filterSt, filterType]);
  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showForm]);

  // ── NEW: close Export/Print menu on outside click ─────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Fetch Order Plans ──────────────────────────────────────────
  const fetchPlanOptions = async () => {
    setLoadingPlans(true);
    setPlanOptions([]);
    try {
      const res = await authFetch('/api/production-plans?limit=500');
      if (!res) { setLoadingPlans(false); return; }
      const data = await res.json();
      const raw: any[] = data.data || data || [];
      const mapped: PlanOption[] = raw.map((p:any) => ({
        plan_no:              String(p.rec_no || p.order_plan_no || p.id || ''),
        co_no:                String(p.order_no || p.co_no || ''),
        co_sort_no:           String(p.order_sort_no || p.co_sort_no || ''),
        co_cons:              String(p.constn_for_production || p.co_cons || ''),
        roll_length:          String(p.roll_length || ''),
        confirmed_by:         String(p.confirmed_by || ''),
        co_comp_date:         toDateStr(p.co_comp_date || p.order_date),
        total_planned_meters: p.order_quantity != null ? String(p.order_quantity) : '',
        previous_wo_meters:   p.previous_wo_meters != null ? String(p.previous_wo_meters) : '0',
        loom_width:           String(p.loom_width || ''),
        customer_name:        String(p.customer_name || ''),
      })).filter(p => p.plan_no.length > 0);
      setPlanOptions(mapped);
    } catch { toast('error','Load Failed','Could not load order plans.'); }
    setLoadingPlans(false);
  };

  // ── Fetch Locations ────────────────────────────────────────────
  const fetchLocations = async (prodType: string) => {
    setLoadingLocations(true);
    setLocationOptions([]);
    try {
      const url = prodType === 'In-house' ? '/api/locations?type=inhouse' : '/api/vendors?limit=500';
      const res = await authFetch(url);
      if (!res || res.status === 404) { setLoadingLocations(false); return; }
      if (!res.ok) { setLoadingLocations(false); return; }
      const data = await res.json();
      const raw: any[] = data.data || data || [];
      setLocationOptions(
        raw.map((l:any) => ({
          id:   l.id ?? 0,
          name: String(l.name || l.vendor_name || l.location_name || '').trim(),
          type: String(l.type || ''),
        })).filter(l => l.name.length > 0)
      );
    } catch { /* silent fallback */ }
    setLoadingLocations(false);
  };

  // ── Fetch Yarn Master ──────────────────────────────────────────
  const fetchYarnOptions = async () => {
    if (yarnOptions.length > 0) return;
    setLoadingYarn(true);
    try {
      const res = await authFetch('/api/yarns?limit=1000&status=Active');
      if (!res || res.status === 404) { setLoadingYarn(false); return; }
      if (!res.ok) { setLoadingYarn(false); return; }
      const data = await res.json();
      const raw: any[] = data.data || data || [];
      setYarnOptions(
        raw.map((y:any) => {
          const countLabel = [
            y.count_value ? String(y.count_value) : '',
            y.count_system_name ? `(${y.count_system_name})` : '',
          ].filter(Boolean).join(' ');
          const displayLabel = y.short_name
            ? `${y.short_name}${countLabel ? ' — ' + countLabel : ''}`
            : (countLabel || y.yarn_code || '');
          return {
            id:           y.id ?? 0,
            yarn_count:   y.yarn_code || '',
            actual_count: y.actual_count != null ? String(y.actual_count) : (y.count_value != null ? String(y.count_value) : ''),
            description:  displayLabel,
          };
        }).filter(y => y.yarn_count.length > 0)
      );
    } catch { /* silent */ }
    setLoadingYarn(false);
  };

  // ── Fetch Pick Rate ────────────────────────────────────────────
  const fetchPickRate = async (sortNo: string) => {
    if (!sortNo) return;
    setPickRateLoading(true);
    setPickRateWarning('');
    try {
      const res = await authFetch(`/api/vendor-pick-rate-master?sort_no=${encodeURIComponent(sortNo)}`);
      if (!res) { setPickRateLoading(false); return; }
      const data = await res.json();
      const record = Array.isArray(data) ? data[0] : data;
      if (record && (record.pick_rate || record.rate)) {
        const rate = String(record.pick_rate || record.rate);
        setForm(f => {
          const pmr = computePerMtrRate(rate, f.weft_details[0]?.onloom_pick || '');
          return { ...f, pick_rate: rate, per_mtr_rate: pmr };
        });
      } else {
        setPickRateWarning(`No pick rate found for Sort No "${sortNo}". Please enter manually.`);
        setForm(f => ({ ...f, pick_rate: '', per_mtr_rate: '' }));
      }
    } catch { setPickRateWarning('Could not fetch pick rate — please enter manually.'); }
    setPickRateLoading(false);
  };

  // ── Select Order Plan ──────────────────────────────────────────
  const selectOrderPlan = (planNo: string) => {
    if (!planNo) {
      setForm(prev => ({
        ...prev,
        order_plan_no:'', co_no:'', co_sort_no:'', co_cons:'',
        roll_length:'', confirmed_by:'', co_comp_date:'',
        total_planned_meters:'', previous_wo_meters:'0', loom_width:'',
        pick_rate:'', per_mtr_rate:'',
      }));
      setPickRateWarning('');
      return;
    }
    const plan = planOptions.find(p => p.plan_no === planNo);
    if (!plan) { setForm(prev => ({ ...prev, order_plan_no: planNo })); return; }
    setForm(prev => ({
      ...prev,
      order_plan_no:        plan.plan_no,
      co_no:                plan.co_no,
      co_sort_no:           plan.co_sort_no,
      co_cons:              plan.co_cons,
      roll_length:          plan.roll_length,
      confirmed_by:         plan.confirmed_by,
      co_comp_date:         plan.co_comp_date,
      total_planned_meters: plan.total_planned_meters,
      previous_wo_meters:   plan.previous_wo_meters,
      loom_width:           plan.loom_width,
    }));
    if (plan.co_sort_no) fetchPickRate(plan.co_sort_no);
  };

  // ── Production Type change ─────────────────────────────────────
  const handleProductionTypeChange = (newType: string) => {
    setForm(prev => ({
      ...prev, production_type: newType, production_location: '',
      rate_type: newType === 'In-house' ? prev.rate_type : 'Per Mtr',
    }));
    fetchLocations(newType);
  };

  // ── WO Type change ─────────────────────────────────────────────
  const handleWOTypeChange = (newType: string) => {
    setForm(prev => ({ ...prev, wo_type: newType, rate_type: newType === 'Sample' ? 'Fixed' : 'Per Mtr' }));
  };

  // ── Open form ──────────────────────────────────────────────────
  const openCreate = () => {
    setForm(BLANK); setEditId(null); setError(''); setPickRateWarning('');
    fetchPlanOptions(); fetchLocations('In-house'); fetchYarnOptions();
    setShowForm(true);
  };

  const openEdit = async (id: number) => {
    try {
      const res = await authFetch(`${API}/${id}`);
      if (!res) { toast('error','Unauthorized','Session expired.'); return; }
      const data = await res.json();
      const wo = sanitizeWO(data);
      setForm(wo); setEditId(id); setError(''); setPickRateWarning('');
      fetchPlanOptions();
      fetchLocations(wo.production_type || 'In-house');
      fetchYarnOptions();
      setShowForm(true);
    } catch { toast('error','Load Failed','Could not load work order.'); }
  };

  // ── Unplanned meters ───────────────────────────────────────────
  const unplannedMeters = Math.max(
    (parseFloat(form.total_planned_meters) || 0) - (parseFloat(form.previous_wo_meters) || 0),
    0
  );

  // ── Save ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.wo_date)                    { setError('WO Date is required'); return; }
    if (!form.production_type)            { setError('Production Type is required'); return; }
    if (!form.production_location.trim()) { setError('Production Location is required'); return; }
    if (!form.pwo_meter)                  { setError('PWO Meter is required'); return; }
    if (!form.pick_rate)                  { setError('Pick Rate is required'); return; }
    if (form.production_type === 'In-house' && !form.no_of_looms) {
      setError('No of Looms is required for In-house production'); return;
    }
    const pwoNum = parseFloat(form.pwo_meter) || 0;
    if (pwoNum > unplannedMeters && unplannedMeters > 0) {
      setError(`PWO Meter (${pwoNum}) exceeds unplanned meters (${unplannedMeters.toFixed(2)})`); return;
    }
    setError(''); setSaving(true);
    const payload = {
      ...form,
      warp_details: form.warp_details.map(({ _key, ...r }) => r),
      weft_details: form.weft_details.map(({ _key, ...r }) => r),
    };
    try {
      const res = await authFetch(editId ? `${API}/${editId}` : API, {
        method: editId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      if (!res) { const m='Authentication failed.'; setError(m); toast('error','Unauthorized',m); setSaving(false); return; }
      if (!res.ok) throw new Error(await res.text());
      toast('success', editId ? 'Work Order Updated' : 'Work Order Created');
      setShowForm(false); loadWOs();
    } catch (e: any) {
      const msg = e.message ?? 'Save failed';
      setError(msg); toast('error','Save Failed',msg);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this work order?')) return;
    try {
      const res = await authFetch(`${API}/${id}`, { method:'DELETE' });
      if (!res) { toast('error','Unauthorized','Session expired.'); return; }
      toast('success','Deleted','Work order removed.');
      loadWOs();
    } catch { toast('error','Delete Failed'); }
  };

  // ── NEW: Export / Print helpers ────────────────────────────────────────────
  // Pulls ALL records matching the current search/filters (not just the visible
  // page) so exports stay complete regardless of the page-size setting.
  const fetchAllWOsForExport = async (): Promise<any[]> => {
    try {
      const qs = new URLSearchParams({
        search, page: '1', limit: '10000',
        ...(filterSt   ? { status: filterSt }   : {}),
        ...(filterType ? { wo_type: filterType } : {}),
      });
      const res = await authFetch(`${API}?${qs}`);
      if (!res) { toast('error', 'Unauthorized', 'Session expired. Please log in again.'); return []; }
      const data = await res.json();
      return data.data ?? [];
    } catch {
      toast('error', 'Export Failed', 'Could not fetch work orders to export.');
      return [];
    }
  };

  const buildExportRows = (data: any[]) => data.map((wo: any, i: number) => ({
    '#':              i + 1,
    'WO No':          wo.wo_no ?? '',
    'WO Date':        fmtDate(wo.wo_date),
    'Type':           wo.wo_type ?? '',
    'CO No':          wo.co_no ?? '',
    'Plan No':        wo.order_plan_no ?? '',
    'Prod. Type':     wo.production_type ?? '',
    'Prod. Location': wo.production_location ?? '',
    'PWO Mtrs':       wo.pwo_meter ?? '',
    'Status':         wo.status ?? '',
  }));

  const escapeCsv = (val: any): string => {
    const s = String(val ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = async () => {
    setExportOpen(false);
    setExporting(true);
    const data = await fetchAllWOsForExport();
    if (!data.length) {
      toast('warning', 'Nothing to Export', 'No work orders match the current filters.');
      setExporting(false); return;
    }
    const rows    = buildExportRows(data);
    const headers = Object.keys(rows[0]);
    const lines   = [
      headers.join(','),
      ...rows.map(r => headers.map(h => escapeCsv((r as any)[h])).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `work-orders-${new Date().toISOString().slice(0, 10)}.csv`);
    toast('success', 'Exported', `${rows.length} work order(s) exported as CSV.`);
    setExporting(false);
  };

  const handleExportExcel = async () => {
    setExportOpen(false);
    setExporting(true);
    const data = await fetchAllWOsForExport();
    if (!data.length) {
      toast('warning', 'Nothing to Export', 'No work orders match the current filters.');
      setExporting(false); return;
    }
    const rows    = buildExportRows(data);
    const headers = Object.keys(rows[0]);
    // Simple HTML-table-as-.xls trick — opens correctly in Excel, no extra
    // library/dependency required.
    const tableHtml = `
      <table border="1">
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${(r as any)[h] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
    const htmlDoc = `<html><head><meta charset="UTF-8"></head><body>${tableHtml}</body></html>`;
    const blob = new Blob([htmlDoc], { type: 'application/vnd.ms-excel' });
    downloadBlob(blob, `work-orders-${new Date().toISOString().slice(0, 10)}.xls`);
    toast('success', 'Exported', `${rows.length} work order(s) exported as Excel.`);
    setExporting(false);
  };

  const handlePrintTable = async () => {
    setExportOpen(false);
    setExporting(true);
    const data = await fetchAllWOsForExport();
    if (!data.length) {
      toast('warning', 'Nothing to Print', 'No work orders match the current filters.');
      setExporting(false); return;
    }
    const rows    = buildExportRows(data);
    const headers = Object.keys(rows[0]);
    const win = window.open('', '_blank', 'width=1000,height=700');
    if (!win) {
      toast('error', 'Print Failed', 'Could not open print window. Please allow popups for this site.');
      setExporting(false); return;
    }
    win.document.write(`
      <html>
        <head>
          <title>Work Orders</title>
          <style>
            body { font-family: 'DM Sans', Arial, sans-serif; padding: 24px; color:#1e293b; }
            h2 { margin: 0 0 4px; }
            p { margin: 0 0 16px; color:#64748b; font-size:12px; }
            table { width:100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
            th { background:#7c3aed; color:#fff; }
            tr:nth-child(even) td { background:#faf5ff; }
          </style>
        </head>
        <body>
          <h2>Work Orders</h2>
          <p>${rows.length} record(s) · Printed on ${new Date().toLocaleString('en-IN')}</p>
          <table>
            <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${(r as any)[h] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
          <script>window.onload = function(){ window.print(); };</script>
        </body>
      </html>
    `);
    win.document.close();
    setExporting(false);
  };

  // ── Form helpers ───────────────────────────────────────────────
  const set = (key: keyof WO, val: any) => setForm(f => ({ ...f, [key]: val }));
  const toggle = (k: keyof typeof sec) => setSec(p => ({ ...p, [k]: !p[k] }));

  // ── Warp grid ──────────────────────────────────────────────────
  const setWarpRow = (key: string, field: keyof WarpRow, val: string) => {
    setForm(f => ({
      ...f,
      warp_details: f.warp_details.map(r => {
        if (r._key !== key) return r;
        const upd = { ...r, [field]: val };
        upd.warp_mtr = computeWarpMtr(f.pwo_meter, upd.crimp_pct);
        upd.warp_req = computeWarpReq(upd.warp_mtr, upd.warp_wt_per_mtr);
        return upd;
      }),
    }));
  };
  const addWarpRow    = () => setForm(f => ({ ...f, warp_details:[...f.warp_details, BLANK_WARP()] }));
  const removeWarpRow = (key: string) => setForm(f => ({ ...f, warp_details: f.warp_details.filter(r => r._key !== key) }));

  // ── Weft grid ──────────────────────────────────────────────────
  const setWeftRow = (key: string, field: keyof WeftRow, val: string) => {
    setForm(f => {
      const newWefts = f.weft_details.map(r => {
        if (r._key !== key) return r;
        const upd = { ...r, [field]: val };
        upd.weft_wt_per_mtr = computeWeftWtPerMtr(upd.onloom_pick);
        upd.weft_req        = computeWeftReq(f.pwo_meter, upd.weft_wt_per_mtr);
        return upd;
      });
      const pmr = computePerMtrRate(f.pick_rate, newWefts[0]?.onloom_pick || '');
      return { ...f, weft_details: newWefts, per_mtr_rate: pmr };
    });
  };
  const addWeftRow    = () => setForm(f => ({ ...f, weft_details:[...f.weft_details, BLANK_WEFT()] }));
  const removeWeftRow = (key: string) => setForm(f => ({ ...f, weft_details: f.weft_details.filter(r => r._key !== key) }));

  // ── Re-compute when pwo_meter changes ─────────────────────────
  useEffect(() => {
    setForm(f => ({
      ...f,
      warp_details: f.warp_details.map(r => {
        const wm = computeWarpMtr(f.pwo_meter, r.crimp_pct);
        return { ...r, warp_mtr: wm, warp_req: computeWarpReq(wm, r.warp_wt_per_mtr) };
      }),
      weft_details: f.weft_details.map(r => {
        const wwm = computeWeftWtPerMtr(r.onloom_pick);
        return { ...r, weft_wt_per_mtr: wwm, weft_req: computeWeftReq(f.pwo_meter, wwm) };
      }),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.pwo_meter]);

  // ── Re-compute per_mtr_rate when pick_rate changes ─────────────
  useEffect(() => {
    const firstOnloom = form.weft_details[0]?.onloom_pick || '';
    setForm(f => ({ ...f, per_mtr_rate: computePerMtrRate(f.pick_rate, firstOnloom) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.pick_rate]);

  // ── Pagination ─────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNums   = (() => {
    const pg: number[] = [];
    let start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pg.push(i);
    return pg;
  })();
  const goTo = (p: number) => setPage(Math.min(Math.max(1,p), totalPages));

  const isOutsourced = form.production_type === 'Outsourced';

  const locationDropdownOptions = locationOptions.map(l => ({ value: l.name, label: l.name }));
  const planDropdownOptions     = planOptions.map(p => ({
    value: p.plan_no, label: p.plan_no,
    sublabel: [p.customer_name, p.co_sort_no].filter(Boolean).join(' · '),
  }));
  const yarnDropdownOptions = yarnOptions.map(y => ({
    value: y.yarn_count, label: y.yarn_count, sublabel: y.description,
  }));

  // ── count badges for section headers ──────────────────────────
  const warpBadge = (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, background:'#ede9fe', border:'1px solid #c4b5fd', borderRadius:20, padding:'1px 9px', fontSize:11, fontWeight:600, color:'#6d28d9' }}>
      {form.warp_details.length} row{form.warp_details.length !== 1 ? 's' : ''}
    </span>
  );
  const weftBadge = (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, background:'#ede9fe', border:'1px solid #c4b5fd', borderRadius:20, padding:'1px 9px', fontSize:11, fontWeight:600, color:'#6d28d9' }}>
      {form.weft_details.length} row{form.weft_details.length !== 1 ? 's' : ''}
    </span>
  );

  // ─────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing:border-box; }
        @keyframes toastIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes spin     { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes ddSlide  { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
        .wom-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }
        .wom-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:24px; }
        .wom-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .wom-table { width:100%; border-collapse:collapse; font-size:13px; min-width:620px; }
        .wom-table thead tr { background:#7c3aed; }
        .wom-table th { padding:11px 12px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:12px; }
        .wom-table tbody tr:nth-child(odd)  td { background:#fff; }
        .wom-table tbody tr:nth-child(even) td { background:#faf5ff; }
        .wom-table tbody tr:hover td { filter:brightness(0.97); }
        .wom-table td { padding:10px 12px; color:#374151; font-size:12px; white-space:nowrap; }
        .wom-wo-id { display:inline-block; font-family:'DM Mono',monospace; font-size:11px; font-weight:500; color:#6d28d9; background:#f5f3ff; border:1px solid #ddd6fe; border-radius:6px; padding:2px 7px; }
        .wom-grid { display:grid; grid-template-columns:1fr; gap:12px; padding:14px 0 4px; }
        @media(min-width:480px){ .wom-grid { grid-template-columns:repeat(2,1fr); gap:14px; } }
        @media(min-width:768px){ .wom-grid { grid-template-columns:repeat(3,1fr); gap:14px 16px; } }
        .wom-col-full { grid-column:1/-1; }
        .wom-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.55); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:12px 6px; -webkit-overflow-scrolling:touch; }
        @media(min-width:576px){ .wom-modal-overlay { padding:20px 12px; } }
        .wom-modal { background:#fff; border-radius:14px; width:100%; max-width:1020px; box-shadow:0 8px 40px rgba(0,0,0,0.22); display:flex; flex-direction:column; max-height:calc(100vh - 24px); }
        .wom-modal-header { display:flex; justify-content:space-between; align-items:center; padding:14px 18px; background:#7c3aed; border-radius:14px 14px 0 0; flex-shrink:0; }
        .wom-modal-body { padding:16px 18px; overflow-y:auto; flex:1; -webkit-overflow-scrolling:touch; }
        .wom-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 18px; border-top:1px solid #f1f5f9; background:#f8fafc; border-radius:0 0 14px 14px; flex-shrink:0; }
        /* Warp/Weft grid tables */
        .wom-grid-table-wrap { overflow-x:auto; border-radius:10px; border:1px solid #e2e8f0; margin-top:10px; }
        .wom-grid-table { width:100%; border-collapse:collapse; font-size:12px; min-width:760px; }
        .wom-grid-table th { padding:9px 10px; background:#7c3aed; color:#fff; font-size:11px; text-align:left; white-space:nowrap; font-weight:600; letter-spacing:0.03em; }
        .wom-grid-table th.computed { background:#5b21b6; }
        .wom-grid-table td { padding:4px 4px; border-bottom:1px solid #f1f5f9; vertical-align:middle; }
        .wom-grid-table tbody tr:hover td { background:#faf5ff; }
        .wom-grid-table tbody tr:last-child td { border-bottom:none; }
        .wom-add-row-btn { display:inline-flex; align-items:center; gap:5px; background:#f5f3ff; color:#7c3aed; border:1px dashed #c4b5fd; border-radius:7px; padding:6px 14px; font-size:12px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; margin-top:10px; touch-action:manipulation; }
        .wom-add-row-btn:hover { background:#ede9fe; }
        .wom-del-row { background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; width:26px; height:26px; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .wom-del-row:hover { background:#fee2e2; }
        .wom-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; }
        .wom-pag-btns { display:flex; gap:4px; flex-wrap:wrap; }
        .wom-pag-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; font-family:'DM Sans',sans-serif; color:#1e293b; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; }
        .wom-pag-btn:hover:not(:disabled){ background:#f1f5f9; }
        .wom-pag-btn.active { background:#7c3aed; color:#fff; border-color:#7c3aed; font-weight:700; }
        .wom-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }
        .wom-action-group { display:flex; align-items:center; gap:5px; justify-content:center; }
        .wom-btn-edit { display:inline-flex; align-items:center; gap:3px; background:#f5f3ff; color:#7c3aed; border:1px solid #c4b5fd; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; }
        .wom-btn-edit:hover { background:#ede9fe; }
        .wom-btn-del { display:inline-flex; align-items:center; gap:3px; background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; }
        .wom-btn-del:hover { background:#fee2e2; }
        .wom-empty { text-align:center; padding:40px; color:#94a3b8; font-size:13px; }
        .wom-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .wom-search-wrap { position:relative; flex:1; min-width:180px; }
        .wom-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .wom-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; outline:none; }
        .wom-search:focus { border-color:#7c3aed; }
        .wom-filter-sel { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#374151; cursor:pointer; outline:none; }
        .wom-header-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end; }
        .wom-add-btn { display:flex; align-items:center; gap:6px; background:#7c3aed; color:#fff; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(124,58,237,0.3); white-space:nowrap; }
        .wom-add-btn:hover { background:#6d28d9; }
        .wom-export-wrap { position:relative; flex-shrink:0; }
        .wom-export-trigger { display:flex; align-items:center; gap:6px; background:#fff; color:#7c3aed; border:1px solid #cbd5e1; border-radius:8px; padding:9px 14px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; white-space:nowrap; transition:border-color 0.15s, box-shadow 0.15s, background 0.15s; }
        .wom-export-trigger:hover:not(:disabled) { border-color:#7c3aed; background:#faf5ff; }
        .wom-export-trigger.open { border-color:#7c3aed; box-shadow:0 0 0 3px rgba(124,58,237,0.12); }
        .wom-export-trigger:disabled { opacity:0.6; cursor:not-allowed; }
        .wom-export-panel { position:absolute; top:calc(100% + 6px); right:0; min-width:200px; background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.14); z-index:300; padding:6px; animation:ddSlide 0.15s ease; }
        .wom-export-panel-label { font-size:10.5px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.06em; padding:6px 10px 4px; }
        .wom-export-item { display:flex; align-items:center; gap:9px; width:100%; background:none; border:none; padding:9px 10px; border-radius:7px; font-size:13px; font-weight:500; color:#1e293b; cursor:pointer; font-family:'DM Sans',sans-serif; text-align:left; }
        .wom-export-item:hover { background:#faf5ff; }
        .wom-btn-cancel { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; font-family:'DM Sans',sans-serif; }
        .wom-btn-save { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#16a34a; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .wom-btn-save:disabled { opacity:0.7; cursor:not-allowed; }
        .wom-info-box { display:flex; align-items:flex-start; gap:10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; margin-top:10px; }
        .wom-warn-box { display:flex; align-items:flex-start; gap:10px; background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:10px 14px; margin-bottom:8px; font-size:12px; color:#92400e; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
        select, input, textarea { font-family:'DM Sans',sans-serif; }
      `}</style>

      <div className="wom-wrap">

        {/* PAGE HEADER */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16, flexWrap:'wrap', gap:10 }}>
          <div>
            <h1 style={{ margin:0, fontSize:isMobile?18:22, fontWeight:700, color:'#1e293b' }}>Work Order Master</h1>
            <p style={{ margin:'3px 0 0', fontSize:13, color:'#64748b' }}>{total} work order{total !== 1 ? 's' : ''}</p>
          </div>

          <div className="wom-header-actions">
            {/* ── NEW: Export / Print dropdown ── */}
            <div className="wom-export-wrap" ref={exportRef}>
              <button
                type="button"
                className={`wom-export-trigger${exportOpen ? ' open' : ''}`}
                onClick={() => setExportOpen(o => !o)}
                disabled={exporting}
              >
                {exporting
                  ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Download size={14} />}
                Export
                <ChevronDown
                  size={13}
                  style={{ transition: 'transform 0.2s', transform: exportOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>

              {exportOpen && (
                <div className="wom-export-panel">
                  <div className="wom-export-panel-label">Export / Print</div>
                  <button className="wom-export-item" onClick={handleExportCSV}>
                    <FileText size={15} color="#7c3aed" />
                    <span>Export as CSV</span>
                  </button>
                  <button className="wom-export-item" onClick={handleExportExcel}>
                    <FileSpreadsheet size={15} color="#16a34a" />
                    <span>Export as Excel</span>
                  </button>
                  <button className="wom-export-item" onClick={handlePrintTable}>
                    <Printer size={15} color="#2563eb" />
                    <span>Print Table</span>
                  </button>
                </div>
              )}
            </div>

            <button className="wom-add-btn" onClick={openCreate}><Plus size={15}/> New Work Order</button>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="wom-toolbar">
          <div className="wom-search-wrap" style={{ flexBasis:isMobile?'100%':undefined }}>
            <Search size={14}/>
            <input className="wom-search" placeholder="Search WO No, CO No, Plan No…" value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <select className="wom-filter-sel" value={filterSt} onChange={e => setFilterSt(e.target.value)}>
            <option value=''>All Status</option>
            {['Draft','Pending Approval','Approved','In Production','Completed','Cancelled'].map(v => <option key={v}>{v}</option>)}
          </select>
          <select className="wom-filter-sel" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value=''>All Types</option>
            <option>Sample</option>
            <option>Bulk</option>
          </select>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'#64748b', marginLeft:'auto' }}>
            {!isMobile && <span>Show</span>}
            <select style={{ border:'1px solid #cbd5e1', borderRadius:6, padding:'5px 8px', fontSize:13, fontFamily:"'DM Sans',sans-serif", background:'#fff', cursor:'pointer', outline:'none' }}
              value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>

        {/* TABLE */}
        <div className="wom-card">
          <div className="wom-table-wrap">
            <table className="wom-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>WO No</th>
                  <th>WO Date</th>
                  <th>Type</th>
                  {!isMobile && <th>CO No</th>}
                  {width >= 768 && <th>Plan No</th>}
                  <th>Prod. Type</th>
                  {width >= 640 && <th>PWO Mtrs</th>}
                  <th>Status</th>
                  <th style={{ textAlign:'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="wom-empty"><Loader2 size={22} style={{ animation:'spin 1s linear infinite', display:'inline-block' }}/></td></tr>
                ) : wos.length === 0 ? (
                  <tr><td colSpan={10} className="wom-empty">
                    {search||filterSt||filterType ? 'No work orders match your filters.' : 'No work orders yet. Click "New Work Order" to create one.'}
                  </td></tr>
                ) : wos.map((wo, i) => {
                  const st = STATUS_STYLE[wo.status] ?? STATUS_STYLE['Draft'];
                  return (
                    <tr key={wo.id}>
                      <td style={{ color:'#94a3b8' }}>{(page-1)*pageSize+i+1}</td>
                      <td><span className="wom-wo-id">{wo.wo_no ?? '—'}</span></td>
                      <td style={{ fontSize:12 }}>{fmtDate(wo.wo_date) || '—'}</td>
                      <td>
                        <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600, background:wo.wo_type==='Sample'?'#fef3c7':'#dbeafe', color:wo.wo_type==='Sample'?'#92400e':'#1d4ed8' }}>{wo.wo_type}</span>
                      </td>
                      {!isMobile && <td style={{ fontFamily:"'DM Mono',monospace", fontSize:12 }}>{wo.co_no||'—'}</td>}
                      {width >= 768 && <td style={{ fontFamily:"'DM Mono',monospace", fontSize:12 }}>{wo.order_plan_no||'—'}</td>}
                      <td style={{ fontSize:12 }}>{wo.production_type||'—'}</td>
                      {width >= 640 && <td style={{ fontFamily:"'DM Mono',monospace", fontSize:12 }}>{wo.pwo_meter?Number(wo.pwo_meter).toLocaleString('en-IN'):'—'}</td>}
                      <td><span style={{ display:'inline-block', padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:600, background:st.bg, color:st.color }}>{wo.status}</span></td>
                      <td>
                        <div className="wom-action-group">
                          <button className="wom-btn-edit" onClick={() => openEdit(wo.id!)}>✏️{!isMobile&&' Edit'}</button>
                          <button className="wom-btn-del"  onClick={() => handleDelete(wo.id!)}>🗑{!isMobile&&' Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!loading && total > 0 && (
            <div className="wom-pagination">
              <span>Page {page} of {totalPages} &nbsp;·&nbsp; {total} record(s)</span>
              <div className="wom-pag-btns">
                <button className="wom-pag-btn" onClick={() => goTo(1)} disabled={page===1}>«</button>
                <button className="wom-pag-btn" onClick={() => goTo(page-1)} disabled={page===1}>‹</button>
                {pageNums.map(p => <button key={p} className={`wom-pag-btn${p===page?' active':''}`} onClick={() => goTo(p)}>{p}</button>)}
                <button className="wom-pag-btn" onClick={() => goTo(page+1)} disabled={page===totalPages}>›</button>
                <button className="wom-pag-btn" onClick={() => goTo(totalPages)} disabled={page===totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* ── MODAL ── */}
        {showForm && (
          <div className="wom-modal-overlay" onClick={e => { if(e.target===e.currentTarget) setShowForm(false); }}>
            <div className="wom-modal">

              {/* Header */}
              <div className="wom-modal-header">
                <div>
                  <h2 style={{ margin:0, fontSize:isMobile?15:17, fontWeight:700, color:'#fff' }}>
                    {editId ? '✏️ Edit Work Order' : '➕ New Work Order'}
                  </h2>
                  {editId && form.wo_no && <span style={{ fontSize:11, color:'#ddd6fe', fontFamily:'DM Mono,monospace' }}>{form.wo_no}</span>}
                </div>
                <button style={{ background:'none', border:'none', padding:'0 4px', cursor:'pointer', display:'flex', alignItems:'center' }} onClick={() => setShowForm(false)}>
                  <X size={20} color="#fff"/>
                </button>
              </div>

              {/* Error Banner */}
              {error && (
                <div style={{ display:'flex', alignItems:'center', gap:8, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, color:'#ef4444', padding:'10px 16px', margin:'12px 18px 0', fontSize:13 }}>
                  <AlertCircle size={15} style={{ flexShrink:0 }}/><span>{error}</span>
                  <button onClick={() => setError('')} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', padding:0, color:'#ef4444', display:'flex' }}><X size={14}/></button>
                </div>
              )}

              {/* Modal Body — all sections scrollable */}
              <div className="wom-modal-body">

                {/* ── SECTION 1: Work Order Info ── */}
                <SectionHead title="Work Order Info" open={sec.basic} onToggle={() => toggle('basic')} accent="#7c3aed"/>
                {sec.basic && (
                  <div className="wom-grid">
                    <Field label="WO No">
                      <div style={{ ...s.input, background:'#f8fafc', color:'#64748b', display:'flex', alignItems:'center', minHeight:38, fontFamily:"'DM Mono',monospace", fontSize:12 }}>
                        {editId ? (form.wo_no || '—') : <span style={{ color:'#94a3b8', fontStyle:'italic', fontFamily:"'DM Sans',sans-serif", fontSize:13 }}>Auto-generated on save</span>}
                      </div>
                    </Field>
                    <Field label="WO Date" required>
                      <input type="date" value={form.wo_date} onChange={e => set('wo_date', e.target.value)} style={s.input}/>
                    </Field>
                    <Field label="WO Type" required hint="≤1000 m = Sample; >1000 m = Bulk">
                      <select value={form.wo_type} onChange={e => handleWOTypeChange(e.target.value)} style={s.input}>
                        <option>Bulk</option>
                        <option>Sample</option>
                      </select>
                    </Field>
                    <Field label="Status">
                      <select value={form.status} onChange={e => set('status', e.target.value)} style={s.input}>
                        {['Draft','Pending Approval','Approved','In Production','Completed','Cancelled'].map(v => <option key={v}>{v}</option>)}
                      </select>
                    </Field>
                  </div>
                )}

                {/* ── SECTION 2: Order Plan Linkage ── */}
                <SectionHead title="Order Plan Linkage" open={sec.order} onToggle={() => toggle('order')} accent="#0ea5e9"/>
                {sec.order && (
                  <div className="wom-grid">
                    <Field label="Order Plan No" required>
                      <SearchDropdown
                        value={form.order_plan_no}
                        onChange={selectOrderPlan}
                        options={planDropdownOptions}
                        loading={loadingPlans}
                        placeholder="— Select Order Plan —"
                      />
                    </Field>

                    <DisplayField label="CO No"       value={form.co_no}      mono />
                    <DisplayField label="CO Sort No"  value={form.co_sort_no} mono />

                    <div className="wom-col-full">
                      <DisplayField label="CO Construction" value={form.co_cons}/>
                    </div>

                    <DisplayField label="Confirmed By"       value={form.confirmed_by}/>
                    <DisplayField label="CO Comp. Date"      value={fmtDate(form.co_comp_date) || undefined}/>
                    <DisplayField label="Total Planned Mtrs" value={form.total_planned_meters ? Number(form.total_planned_meters).toLocaleString('en-IN') : undefined}/>
                    <DisplayField label="Previous WO Mtrs"   value={form.previous_wo_meters ? Number(form.previous_wo_meters).toLocaleString('en-IN') : undefined}/>

                    <Field label="Loom Width">
                      <input value={form.loom_width} onChange={e => set('loom_width', e.target.value)} style={s.input} placeholder="e.g. 60 inch"/>
                    </Field>

                    {/* Unplanned meters */}
                    <div>
                      <label style={s.label}>Unplanned Meters</label>
                      <div style={{ ...s.input, background: unplannedMeters > 0 ? '#f0fdf4' : '#fef2f2', color: unplannedMeters > 0 ? '#166534' : '#dc2626', fontFamily:"'DM Mono',monospace", fontSize:13, fontWeight:700, display:'flex', alignItems:'center', minHeight:38 }}>
                        {form.total_planned_meters ? unplannedMeters.toLocaleString('en-IN', { maximumFractionDigits:2 }) : '—'}
                      </div>
                    </div>

                    <Field label="PWO Meter" required hint={unplannedMeters > 0 ? `Max: ${unplannedMeters.toLocaleString('en-IN', { maximumFractionDigits:2 })} m` : undefined}>
                      <input type="number" min="0" step="0.01" value={form.pwo_meter}
                        onChange={e => set('pwo_meter', e.target.value)} style={s.input} placeholder="Planned WO quantity"/>
                    </Field>

                    <Field label="No of Looms" required={form.production_type === 'In-house'}>
                      <input type="number" min="1" step="1" value={form.no_of_looms}
                        onChange={e => set('no_of_looms', e.target.value)} style={s.input}/>
                    </Field>
                  </div>
                )}

                {/* ── SECTION 3: Production Details ── */}
                <SectionHead title="Production Details" open={sec.production} onToggle={() => toggle('production')} accent="#10b981"/>
                {sec.production && (
                  <div className="wom-grid">
                    <Field label="Production Type" required>
                      <select value={form.production_type} onChange={e => handleProductionTypeChange(e.target.value)} style={s.input}>
                        <option>In-house</option>
                        <option>Outsourced</option>
                      </select>
                    </Field>

                    <Field label="Production Location" required hint={isOutsourced ? 'Select from Vendor Master' : 'VP Tex Group & Locations'}>
                      {loadingLocations ? (
                        <div style={{ ...s.input, display:'flex', alignItems:'center', gap:6, color:'#94a3b8', minHeight:38 }}>
                          <Loader2 size={13} style={{ animation:'spin 1s linear infinite' }}/> Loading locations…
                        </div>
                      ) : locationDropdownOptions.length > 0 ? (
                        <SearchDropdown
                          value={form.production_location}
                          onChange={v => set('production_location', v)}
                          options={locationDropdownOptions}
                          placeholder={isOutsourced ? '— Select Vendor —' : '— Select Location —'}
                        />
                      ) : (
                        <input value={form.production_location} onChange={e => set('production_location', e.target.value)} style={s.input}
                          placeholder={isOutsourced ? 'Vendor name' : 'Production unit / location'}/>
                      )}
                    </Field>

                    <Field label="No. of Fabric per Loom">
                      <select value={form.no_of_fabric_per_loom} onChange={e => set('no_of_fabric_per_loom', e.target.value)} style={s.input}>
                        {['1','2','3','4'].map(v => <option key={v}>{v}</option>)}
                      </select>
                    </Field>
                  </div>
                )}

                {/* ── SECTION 4: Rate Details ── */}
                <SectionHead title="Rate Details" open={sec.rate} onToggle={() => toggle('rate')} accent="#f59e0b"/>
                {sec.rate && (
                  <>
                    {pickRateWarning && (
                      <div className="wom-warn-box">
                        <AlertTriangle size={14} style={{ color:'#d97706', flexShrink:0, marginTop:1 }}/>
                        <span>{pickRateWarning}</span>
                      </div>
                    )}
                    <div className="wom-grid">
                      <Field label="Rate Type" hint={form.wo_type === 'Sample' ? 'Fixed rate for samples' : 'Per Mtr or Per Kg for bulk'}>
                        <select value={form.rate_type} onChange={e => set('rate_type', e.target.value)} style={s.input}>
                          {form.wo_type === 'Sample'
                            ? <option>Fixed</option>
                            : <><option>Per Mtr</option><option>Per Kg</option><option>Fixed</option></>
                          }
                        </select>
                      </Field>

                      <Field label="Pick Rate" required hint="Auto-fetched from Vendor Pick Rate Master · editable">
                        <div style={{ position:'relative' }}>
                          <input type="number" min="0" step="0.0001" value={form.pick_rate}
                            onChange={e => set('pick_rate', e.target.value)}
                            style={{ ...s.input, paddingRight: pickRateLoading ? 36 : undefined }}
                            placeholder="e.g. 0.0850"/>
                          {pickRateLoading && (
                            <Loader2 size={13} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', animation:'spin 1s linear infinite', color:'#94a3b8' }}/>
                          )}
                        </div>
                      </Field>

                      <div>
                        <label style={s.label}>Per Mtr Rate <span style={{ fontStyle:'italic', color:'#94a3b8', fontWeight:400, textTransform:'none', letterSpacing:0 }}>(Pick Rate × Onloom Pick)</span></label>
                        <div style={{ ...s.input, background:'#f0fdf4', color: form.per_mtr_rate ? '#166534' : '#9ca3af', fontFamily:"'DM Mono',monospace", fontSize:13, fontWeight:700, display:'flex', alignItems:'center', minHeight:38 }}>
                          {form.per_mtr_rate ? `₹ ${form.per_mtr_rate}` : '—'}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ── SECTION 5: Special Instruction ── */}
                <SectionHead title="Special Instruction" open={sec.instructions} onToggle={() => toggle('instructions')} accent="#6366f1"/>
                {sec.instructions && (
                  <div style={{ paddingTop:12 }}>
                    <Field label="Special Instruction">
                      <textarea value={form.spl_instruction} onChange={e => set('spl_instruction', e.target.value)}
                        style={{ ...s.input, height:80, resize:'vertical' }} placeholder="Any special instructions for this work order…"/>
                    </Field>
                  </div>
                )}

                {/* ── SECTION 6: Warp Details ── */}
                <SectionHead title="🧵 Warp Details" open={sec.warp} onToggle={() => toggle('warp')} accent="#7c3aed" badge={warpBadge}/>
                {sec.warp && (
                  <div>
                  
                    <div className="wom-grid-table-wrap">
                      <table className="wom-grid-table">
                        <thead>
                          <tr>
                            <th style={{ minWidth:120 }}>Warp Type</th>
                            <th style={{ minWidth:92 }}>Beam No.</th>
                            <th style={{ minWidth:130 }}>Warp Count</th>
                            <th style={{ minWidth:130 }}>Actual Count</th>
                            <th style={{ minWidth:72 }}>Warp Ends</th>
                            <th style={{ minWidth:72 }}>Reed</th>
                            <th style={{ minWidth:90 }}>Reed Space</th>
                            <th style={{ minWidth:95 }}>Warp Wt/Mtr</th>
                            <th style={{ minWidth:72 }}>Crimp %</th>
                            <th className="computed" style={{ minWidth:90 }}>Warp Mtr ⚙</th>
                            <th className="computed" style={{ minWidth:90 }}>Warp Req ⚙</th>
                            <th style={{ width:34 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.warp_details.map(r => (
                            <tr key={r._key}>
                              <td><GCell value={r.warp_type} onChange={v => setWarpRow(r._key,'warp_type',v)} placeholder="From Fabric Master"/></td>
                              <td>
                                <select value={r.beam_number} onChange={e => setWarpRow(r._key,'beam_number',e.target.value)} style={{ ...s.gridCell, minWidth:85 }}>
                                  {['Beam 1','Beam 2','Beam 3'].map(b => <option key={b}>{b}</option>)}
                                </select>
                              </td>
                              <td style={{ minWidth:130 }}>
                                {yarnDropdownOptions.length > 0 ? (
                                  <SearchDropdown
                                    value={r.warp_count}
                                    onChange={v => {
                                      const yarn = yarnOptions.find(y => y.yarn_count === v);
                                      setWarpRow(r._key,'warp_count',v);
                                      if (yarn?.actual_count) setWarpRow(r._key,'actual_count',yarn.actual_count);
                                    }}
                                    options={yarnDropdownOptions}
                                    loading={loadingYarn}
                                    placeholder="Yarn Master"
                                  />
                                ) : (
                                  <GCell value={r.warp_count} onChange={v => setWarpRow(r._key,'warp_count',v)} placeholder="Yarn Master"/>
                                )}
                              </td>
                              <td><GCell value={r.actual_count} onChange={v => setWarpRow(r._key,'actual_count',v)} placeholder="auto"/></td>
                              <td><GCell value={r.warp_ends} onChange={v => setWarpRow(r._key,'warp_ends',v)} type="number" placeholder="0"/></td>
                              <td><GCell value={r.reed} onChange={v => setWarpRow(r._key,'reed',v)} placeholder="—"/></td>
                              <td><GCell value={r.reed_space} onChange={v => setWarpRow(r._key,'reed_space',v)} placeholder="—"/></td>
                              <td><GCell value={r.warp_wt_per_mtr} onChange={v => setWarpRow(r._key,'warp_wt_per_mtr',v)} type="number" placeholder="0.0000"/></td>
                              <td><GCell value={r.crimp_pct} onChange={v => setWarpRow(r._key,'crimp_pct',v)} type="number" placeholder="0"/></td>
                              <td><GCell value={r.warp_mtr} readOnly placeholder="auto"/></td>
                              <td><GCell value={r.warp_req} readOnly placeholder="auto"/></td>
                              <td>
                                <button className="wom-del-row" onClick={() => removeWarpRow(r._key)} title="Remove row"><Trash2 size={12}/></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button className="wom-add-row-btn" onClick={addWarpRow}><Plus size={13}/> Add Warp Row</button>
                  </div>
                )}

                {/* ── SECTION 7: Weft Details ── */}
                <SectionHead title="🪢 Weft Details" open={sec.weft} onToggle={() => toggle('weft')} accent="#7c3aed" badge={weftBadge}/>
                {sec.weft && (
                  <div>
                   
                    <div className="wom-grid-table-wrap">
                      <table className="wom-grid-table">
                        <thead>
                          <tr>
                            <th style={{ minWidth:150 }}>Weft Count</th>
                            <th style={{ minWidth:150 }}>Actual Count</th>
                            <th style={{ minWidth:110 }}>Onloom Pick</th>
                            <th className="computed" style={{ minWidth:120 }}>Weft Wt/Mtr ⚙</th>
                            <th className="computed" style={{ minWidth:120 }}>Weft Req ⚙</th>
                            <th style={{ width:34 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.weft_details.map(r => (
                            <tr key={r._key}>
                              <td style={{ minWidth:150 }}>
                                {yarnDropdownOptions.length > 0 ? (
                                  <SearchDropdown
                                    value={r.weft_count}
                                    onChange={v => {
                                      const yarn = yarnOptions.find(y => y.yarn_count === v);
                                      setWeftRow(r._key,'weft_count',v);
                                      if (yarn?.actual_count) setWeftRow(r._key,'actual_count',yarn.actual_count);
                                    }}
                                    options={yarnDropdownOptions}
                                    loading={loadingYarn}
                                    placeholder="Yarn Master"
                                  />
                                ) : (
                                  <GCell value={r.weft_count} onChange={v => setWeftRow(r._key,'weft_count',v)} placeholder="Yarn Master"/>
                                )}
                              </td>
                              <td><GCell value={r.actual_count} onChange={v => setWeftRow(r._key,'actual_count',v)} placeholder="auto"/></td>
                              <td><GCell value={r.onloom_pick} onChange={v => setWeftRow(r._key,'onloom_pick',v)} type="number" placeholder="Picks/inch"/></td>
                              <td><GCell value={r.weft_wt_per_mtr} readOnly placeholder="auto"/></td>
                              <td><GCell value={r.weft_req} readOnly placeholder="auto"/></td>
                              <td>
                                <button className="wom-del-row" onClick={() => removeWeftRow(r._key)} title="Remove row"><Trash2 size={12}/></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button className="wom-add-row-btn" onClick={addWeftRow}><Plus size={13}/> Add Weft Row</button>
                  </div>
                )}

              </div>{/* end modal body */}

              {/* Modal Footer */}
              <div className="wom-modal-footer">
                <button className="wom-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="wom-btn-save" onClick={handleSave} disabled={saving}>
                  {saving
                    ? <><Loader2 size={15} style={{ animation:'spin 1s linear infinite' }}/> Saving…</>
                    : (editId ? '✏️ Update' : '💾 Save WO')}
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  label:       { display:'block', fontSize:11, fontWeight:700, color:'#64748b', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' },
  input:       { width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid #cbd5e1', fontSize:13, color:'#1e293b', outline:'none', boxSizing:'border-box', background:'#fff', fontFamily:"'DM Sans',sans-serif", transition:'border-color 0.15s' },
  sectionHead: { display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 14px', cursor:'pointer', marginTop:18, userSelect:'none' },
  sectionTitle:{ fontWeight:700, fontSize:13, color:'#1e293b' },
  gridCell:    { width:'100%', padding:'5px 8px', borderRadius:6, border:'1px solid #e2e8f0', fontSize:12, color:'#1e293b', outline:'none', fontFamily:"'DM Sans',sans-serif", minWidth:75, boxSizing:'border-box' as const },
};