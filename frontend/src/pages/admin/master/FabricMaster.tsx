import {
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';

import {
  Plus,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  Loader2,
  AlertCircle,
  Layers,
  Zap,
  CheckCircle2,
  Info,
  AlertTriangle,
  Paperclip,
  Trash2,
  FileText,
  Package,
  Hash,
  Ruler,
  Wind,
  Wrench,
  Check,
} from 'lucide-react';

import {
  listFabrics,
  getFabric,
  createFabric,
  updateFabric,
  deleteFabric,
  type Fabric,
  type WarpDetail,
  type WeftDetail,
} from '../../../api/services';

// ─── Yarn & HSN lookup types ───────────────────────────────────────────────────
interface YarnOption {
  id: number;
  yarn_code: string;
  short_name: string | null;
  category: string | null;
  count_value: number | null;
  actual_count: number | null;
  yarn_count: number | null;
  ply: number | null;
  yarn_type: string | null;
  count_system_name: string | null;
  color_name: string | null;
  composition: string;
}
interface HsnOption { id: number; hsn_code: string; description: string | null; }

// ─── Extended row types with index signatures ──────────────────────────────────
type WarpRow = WarpDetail & { [key: string]: unknown };
type WeftRow = WeftDetail & { [key: string]: unknown };

// ─── Toast ─────────────────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string; }
let _toastId = 0;

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++_toastId;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);
  const remove = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  return { toasts, push, remove };
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  const cfg: Record<ToastType, { bg: string; border: string; color: string; icon: React.ReactNode }> = {
    success: { bg: '#f0fdf4', border: '#86efac', color: '#166534', icon: <CheckCircle2 size={16} color="#16a34a" /> },
    error:   { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', icon: <AlertCircle  size={16} color="#dc2626" /> },
    warning: { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: <AlertTriangle size={16} color="#d97706" /> },
    info:    { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af', icon: <Info          size={16} color="#2563eb" /> },
  };
  if (toasts.length === 0) return null;
  return (
    <div style={{ position:'fixed', top:20, right:20, zIndex:9999, display:'flex', flexDirection:'column', gap:10, maxWidth:400, width:'calc(100vw - 40px)', pointerEvents:'none' }}>
      {toasts.map((t) => {
        const c = cfg[t.type];
        return (
          <div key={t.id} style={{ display:'flex', alignItems:'flex-start', gap:10, background:c.bg, border:`1px solid ${c.border}`, borderRadius:10, padding:'12px 14px', boxShadow:'0 4px 16px rgba(0,0,0,0.12)', pointerEvents:'all', animation:'toastIn 0.25s ease-out', fontFamily:"'Plus Jakarta Sans', sans-serif" }}>
            <span style={{ flexShrink:0, marginTop:1 }}>{c.icon}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontSize:13, fontWeight:700, color:c.color }}>{t.title}</p>
              {t.message && <p style={{ margin:'2px 0 0', fontSize:12, color:c.color, opacity:0.8, lineHeight:1.4, wordBreak:'break-word' }}>{t.message}</p>}
            </div>
            <button onClick={() => onRemove(t.id)} style={{ flexShrink:0, background:'none', border:'none', padding:0, cursor:'pointer', color:c.color, opacity:0.6, display:'flex', alignItems:'center', marginTop:1 }}><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

// ─── HSN Dropdown ─────────────────────────────────────────────────────────────
interface HsnDropdownProps {
  value: string;
  onChange: (val: string) => void;
  hsnCodes: HsnOption[];
  hsnLoading: boolean;
  hsnError?: string;
}

const HsnDropdown: React.FC<HsnDropdownProps> = ({ value, onChange, hsnCodes, hsnLoading, hsnError }) => {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef             = useRef<HTMLDivElement>(null);
  const searchRef           = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  const filtered = hsnCodes.filter(
    h =>
      h.hsn_code.toLowerCase().includes(search.toLowerCase()) ||
      (h.description || '').toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelect = (code: string) => {
    onChange(code);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="hsn-dd-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`hsn-dd-trigger${open ? ' open' : ''}${value ? ' has-value' : ''}`}
        onClick={() => setOpen(o => !o)}
        disabled={hsnLoading}
      >
        <span className="hsn-dd-trigger-content">
          {hsnLoading ? (
            <span className="hsn-dd-loading">
              <span className="fm-spin-sm" />Loading HSN codes…
            </span>
          ) : value ? (
            <span className="hsn-dd-selected-val">
              <span className="hsn-dd-code-badge">{value}</span>
            </span>
          ) : (
            <span className="hsn-dd-placeholder">— Select HSN Code —</span>
          )}
        </span>
        <ChevronDown size={14} className={`hsn-dd-chevron${open ? ' rotated' : ''}`} />
      </button>

      {open && (
        <div className="hsn-dd-panel">
          <div className="hsn-dd-search-wrap">
            <Search size={13} className="hsn-dd-search-icon" />
            <input
              ref={searchRef}
              className="hsn-dd-search"
              placeholder="Search HSN code or description…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="hsn-dd-clear" type="button" onClick={() => setSearch('')}>
                <X size={13} />
              </button>
            )}
          </div>

          <div className="hsn-dd-count">
            {filtered.length === 0
              ? <span style={{ color:'#c2410c' }}>No codes match "{search}"</span>
              : <span>{filtered.length} code{filtered.length !== 1 ? 's' : ''}{search ? ' found' : ' available'}</span>}
          </div>

          <div className="hsn-dd-list">
            {value && (
              <div className="hsn-dd-option hsn-dd-clear-opt" onClick={() => handleSelect('')}>
                <span>— Clear selection —</span>
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="hsn-dd-empty">
                <Search size={28} color="#cbd5e1" />
                <span>No HSN codes found</span>
              </div>
            ) : (
              filtered.map(h => (
                <div
                  key={h.id}
                  className={`hsn-dd-option${h.hsn_code === value ? ' selected' : ''}`}
                  onClick={() => handleSelect(h.hsn_code)}
                >
                  <span className="hsn-opt-code">{h.hsn_code}</span>
                  {h.description && (
                    <span className="hsn-opt-desc">{h.description}</span>
                  )}
                  {h.hsn_code === value && <Check size={14} className="hsn-opt-check" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {!open && (
        <div className="hsn-dd-status">
          {hsnLoading ? (
            <span style={{ color:'#94a3b8' }}>Loading…</span>
          ) : hsnError ? (
            <span style={{ color:'#c2410c' }}>
              <AlertTriangle size={11} style={{ marginRight:3 }} />{hsnError}
            </span>
          ) : value ? (
            <span className="hsn-status-ok">
              <Check size={11} style={{ marginRight:2 }} />HSN {value} selected
            </span>
          ) : hsnCodes.length > 0 ? (
            <span style={{ color:'#94a3b8' }}>
              <Check size={11} style={{ marginRight:2 }} />{hsnCodes.length} codes loaded — click to select
            </span>
          ) : (
            <span style={{ color:'#f59e0b' }}>No codes from API — type manually below</span>
          )}
        </div>
      )}

      {!open && hsnCodes.length === 0 && !hsnLoading && (
        <input
          className="fm-input"
          style={{ marginTop:6 }}
          placeholder="Or type HSN code manually (e.g. 58063200)"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  );
};

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Attachment { name: string; url: string; size?: number; file?: File; }
interface FabricExt extends Fabric {
  body_weave_pattern: string;
  on_pick:            string;
  wastage:            string;
  f_gsm:              string;
  // hsn_code is VARCHAR(20) — store and send as plain string
  hsn_code:           string;
  attachments:        Attachment[];
}

const BLANK: FabricExt = {
  sort_no:'', reed:'', pick:'', on_pick:'', width:'', weave:'', design:'',
  body_weave_pattern:'', onloom_reed:'', reed_space:'', total_ends:'',
  selvedge_ends:'', body_ends:'', wastage:'', construction:'',
  warp_wt_per_mtr:'', warp_wt_per_mtr_wc:'', weft_wt_per_mtr:'',
  fabric_wt_per_mtr:'', f_gsm:'', hsn_code:'', status:'Active',
  warp_details:[], weft_details:[], attachments:[],
};

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

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={s.label}>
        {label}
        {required && <span style={{ color:'#ef4444' }}> *</span>}
        {hint && (
          <span style={{ marginLeft:6, fontSize:10, fontWeight:600, padding:'1px 6px', borderRadius:20, background:'#fff', color:'#94a3b8', border:'1px solid #e2e8f0', textTransform:'uppercase', letterSpacing:'0.04em' }}>
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function SectionHead({ title, open, onToggle, badge, icon }: { title: string; open: boolean; onToggle: () => void; badge?: string; icon?: React.ReactNode }) {
  return (
    <div style={s.sectionHead} onClick={onToggle}>
      <span style={{ display:'flex', alignItems:'center', gap:8 }}>
        {icon && <span style={{ display:'flex', alignItems:'center', color:'#0d9488' }}>{icon}</span>}
        <span style={s.sectionTitle}>{title}</span>
        {badge && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#f0fdfa', color:'#0d9488', border:'1px solid #99f6e4', textTransform:'uppercase' as const, letterSpacing:'0.05em' }}>{badge}</span>}
      </span>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </div>
  );
}

function CalcBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={s.calcBadge}>
      <span style={s.calcLabel}>{label}</span>
      <span style={s.calcValue}>{value || '—'}</span>
    </div>
  );
}

function AutoField({ value, title, type = 'text' }: { value: string | number; title?: string; type?: string }) {
  return <input type={type} value={String(value ?? '')} readOnly title={title} style={{ ...s.input, ...s.readOnly }} />;
}

// ─── Calculation helpers ───────────────────────────────────────────────────────
function calcReedSpace(width: string | number): string {
  const w = parseFloat(String(width));
  return isNaN(w) || w <= 0 ? '' : String(w + 4);
}

function calcWarpRowWts(row: WarpDetail): { wt_per_mtr: string; wt_per_mtr_wc: string } {
  const ends  = parseFloat(String(row.ends));
  const cnt   = parseFloat(String(row.act_cnt));
  const crimp = parseFloat(String(row.crimp_pct));
  if (isNaN(ends) || isNaN(cnt) || cnt === 0) return { wt_per_mtr:'', wt_per_mtr_wc:'' };
  const wt   = ends / 1693 / cnt;
  const wtWC = isNaN(crimp) ? wt : wt * (1 + crimp / 100);
  return { wt_per_mtr: wt.toFixed(6), wt_per_mtr_wc: wtWC.toFixed(6) };
}

function calcWeftRowWt(row: WeftDetail, onloomReed: string | number, wastage: string | number): string {
  const pick = parseFloat(String(row.onloom_pick));
  const cnt  = parseFloat(String(row.act_cnt));
  const reed = parseFloat(String(onloomReed));
  const wast = parseFloat(String(wastage));
  const ends = parseFloat(String((row as WeftDetail & { ends?: string }).ends ?? '0')) || 0;
  if (isNaN(pick) || isNaN(cnt) || cnt === 0 || isNaN(reed) || reed === 0) return '';
  const wastageVal = isNaN(wast) ? 0 : wast;
  return (((ends / reed) + wastageVal) * (pick / 1693 / cnt)).toFixed(6);
}

function calcFGSM(fabricWt: string, widthCm: string | number): string {
  const fw = parseFloat(fabricWt);
  const w  = parseFloat(String(widthCm));
  if (isNaN(fw) || isNaN(w) || w === 0) return '';
  return (fw / (w * 0.0254)).toFixed(4);
}

function calcWarpWtPerMtr(warpDetails: WarpDetail[]) {
  const t = warpDetails.reduce((a, w) => a + (parseFloat(String(w.wt_per_mtr)) || 0), 0);
  return t > 0 ? t.toFixed(6) : '';
}

function calcWarpWtPerMtrWC(warpDetails: WarpDetail[]) {
  const t = warpDetails.reduce((a, w) => a + (parseFloat(String(w.wt_per_mtr_wc)) || 0), 0);
  return t > 0 ? t.toFixed(6) : '';
}

function calcWeftWtPerMtr(weftDetails: WeftDetail[]) {
  const t = weftDetails.reduce((a, w) => a + (parseFloat(String(w.wt_per_mtr)) || 0), 0);
  return t > 0 ? t.toFixed(6) : '';
}

function calcFabricWt(warpWtWC: string, weftWt: string): string {
  const w1 = parseFloat(warpWtWC);
  const w2 = parseFloat(weftWt);
  return isNaN(w1) || isNaN(w2) ? '' : (w1 + w2).toFixed(6);
}

// ─── Construction builder ──────────────────────────────────────────────────────
function buildConstruction(form: FabricExt): string {
  const warpParts = (form.warp_details ?? [])
    .map(w => { const label = String(w.warp_count ?? '').trim(); const cnt = String(w.act_cnt ?? '').trim(); return label || cnt; })
    .filter(Boolean);

  const weftParts = (form.weft_details ?? [])
    .map(w => { const label = String(w.weft_count ?? '').trim(); const cnt = String(w.act_cnt ?? '').trim(); return label || cnt; })
    .filter(Boolean);

  const warpStr = warpParts.join(' + ');
  const weftStr = weftParts.join(' + ');
  const reed    = String(form.reed   ?? '').trim();
  const pick    = String(form.pick   ?? '').trim();
  const width   = String(form.width  ?? '').trim();
  const weave   = String(form.weave  ?? '').trim();
  const design  = String(form.design ?? '').trim();

  const parts: string[] = [];
  if (warpStr && weftStr) parts.push(`${warpStr} * ${weftStr}`);
  else if (warpStr)       parts.push(warpStr);
  else if (weftStr)       parts.push(weftStr);

  const loomParts: string[] = [];
  if (reed) loomParts.push(reed);
  if (pick) loomParts.push(pick);
  if (loomParts.length) parts.push(loomParts.join(' * '));
  if (width)  parts.push(`${width}"`);
  if (weave)  parts.push(weave);
  if (design) parts.push(design);

  return parts.join(' / ');
}

function safeConstruction(f: FabricExt): string {
  const warpDetails = f.warp_details ?? [];
  const weftDetails = f.weft_details ?? [];
  if (warpDetails.length > 0 || weftDetails.length > 0) {
    return buildConstruction({ ...f, warp_details: warpDetails, weft_details: weftDetails });
  }
  const asStr = String(f.construction ?? '').trim();
  return asStr.length > 0 && isNaN(Number(asStr)) ? asStr : '';
}

function restoreYarnLabels(
  warpDetails: WarpDetail[],
  weftDetails: WeftDetail[],
  yarns: YarnOption[],
): { warpDetails: WarpDetail[]; weftDetails: WeftDetail[] } {
  const buildWarpLabel = (y: YarnOption): string => y.yarn_type ?? y.category ?? y.yarn_code;
  const buildWeftLabel = (y: YarnOption): string => y.yarn_type ?? y.category ?? y.yarn_code;

  const restoredWarp = warpDetails.map(row => {
    if (row.warp_count) return row;
    const yarn = yarns.find(y => String(y.id) === String(row.yarn_id));
    if (!yarn) return row;
    return { ...row, warp_count: buildWarpLabel(yarn) };
  });

  const restoredWeft = weftDetails.map(row => {
    if (row.weft_count) return row;
    const yarn = yarns.find(y => String(y.id) === String(row.yarn_id));
    if (!yarn) return row;
    return { ...row, weft_count: buildWeftLabel(yarn) };
  });

  return { warpDetails: restoredWarp, weftDetails: restoredWeft };
}

function getUniqueYarnTypes(yarns: YarnOption[]): string[] {
  const types = yarns.map(y => y.yarn_type ?? y.category ?? '').filter(Boolean);
  return Array.from(new Set(types)).sort();
}

function getYarnsByType(yarns: YarnOption[], type: string): YarnOption[] {
  return yarns.filter(y => (y.yarn_type ?? y.category ?? '') === type);
}

// ─── Payload helpers ───────────────────────────────────────────────────────────
const toInt    = (v: unknown): number | null => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return isNaN(n) ? null : Math.round(n); };
const toFloat  = (v: unknown): number | null => { if (v === '' || v === null || v === undefined) return null; const n = parseFloat(String(v)); return isNaN(n) ? null : n; };
const safeFloat= (v: unknown, fallback = 0): number => { const n = toFloat(v); return n === null ? fallback : n; };
const safeInt  = (v: unknown, fallback = 0): number => { if (v === '' || v === null || v === undefined) return fallback; const n = Number(v); return isNaN(n) ? fallback : Math.round(n); };
const safeStr  = (v: unknown): string => { if (v === null || v === undefined) return ''; return String(v).trim(); };

// ─── Warp Yarn Card ────────────────────────────────────────────────────────────
function WarpYarnCard({
  row, index, onChange, onDelete, isInvalid, yarns,
}: {
  row: WarpRow; index: number;
  onChange: (key: string, val: unknown) => void;
  onDelete: () => void;
  isInvalid: boolean;
  yarns: YarnOption[];
}) {
  const [expanded, setExpanded] = useState(true);
  const selected     = yarns.find(y => String(y.id) === String(row.yarn_id));
  const selectedType = selected ? (selected.yarn_type ?? selected.category ?? '') : '';
  const yarnTypes    = getUniqueYarnTypes(yarns);

  const buildWarpCountLabel = (y: YarnOption): string => y.yarn_type ?? y.category ?? y.yarn_code;

  const handleTypeChange = (type: string) => {
    onChange('yarn_id', ''); onChange('warp_count', '');
    onChange('act_cnt', ''); onChange('_selected_type', type);
  };

  const displayType          = selectedType || String(row['_selected_type'] ?? '');
  const displayCountOptions  = displayType ? getYarnsByType(yarns, displayType) : [];

  const handleCountChange = (yarnId: string) => {
    const y = yarns.find(yy => String(yy.id) === yarnId);
    if (y) {
      const label = buildWarpCountLabel(y);
      const cnt   = y.actual_count ?? y.yarn_count ?? y.count_value;
      onChange('yarn_id', y.id); onChange('warp_count', label); onChange('act_cnt', String(cnt ?? ''));
    } else {
      onChange('yarn_id', ''); onChange('warp_count', ''); onChange('act_cnt', '');
    }
  };

  return (
    <div className={`yarn-card${isInvalid ? ' yarn-card-invalid' : ''}`}>
      <div className="yarn-card-header">
        <div className="yarn-card-header-left">
          <div className="yarn-row-badge">W{index + 1}</div>
          {selected ? (
            <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
              <div style={{ width:28, height:28, borderRadius:6, background:'linear-gradient(135deg,#0d948822,#0d948844)', border:'1px solid #99f6e4', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Package size={13} color="#0d9488" />
              </div>
              <div style={{ minWidth:0 }}>
                <div className="yarn-code-badge">{displayType}</div>
                {selected.composition && <div style={{ fontSize:9, color:'#64748b', marginTop:1 }}>{selected.composition}</div>}
              </div>
            </div>
          ) : displayType ? (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:28, height:28, borderRadius:6, background:'#f1f5f9', border:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Package size={13} color="#94a3b8" /></div>
              <div className="yarn-code-badge" style={{ color:'#64748b', background:'#f8fafc', borderColor:'#e2e8f0' }}>{displayType}</div>
            </div>
          ) : (
            <span className="yarn-code-placeholder">No yarn selected</span>
          )}
          {row.act_cnt && <span className="yarn-count-chip"><Hash size={10} />{String(row.act_cnt)}</span>}
          {row.ends    && <span className="yarn-ends-chip"><Ruler size={10} />{String(row.ends)} ends</span>}
        </div>
        <div className="yarn-card-header-right">
          {row.wt_per_mtr    && <span className="yarn-auto-badge"><Zap size={10} />{String(row.wt_per_mtr)} g/m</span>}
          {row.wt_per_mtr_wc && <span className="yarn-auto-badge yarn-auto-badge-wc"><Zap size={10} />WC: {String(row.wt_per_mtr_wc)}</span>}
          <button className="yarn-expand-btn" onClick={() => setExpanded(e => !e)}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button className="yarn-del-btn" onClick={onDelete}><Trash2 size={13} /></button>
        </div>
      </div>

      {expanded && (
        <div className="yarn-card-body">
          <div className="yarn-field-grid">
            <div className="yarn-field yarn-field-half">
              <label className="yarn-field-label">Yarn Type <span style={{ color:'#ef4444' }}>*</span><span className="yarn-master-badge">Step 1</span></label>
              <select value={displayType} onChange={e => handleTypeChange(e.target.value)} className={`yarn-field-input${!displayType ? ' yarn-field-input-error' : ''}`}>
                <option value="">— Select type —</option>
                {yarnTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="yarn-field yarn-field-half">
              <label className="yarn-field-label">Actual Count <span style={{ color:'#ef4444' }}>*</span><span className="yarn-master-badge yarn-master-badge-count">Step 2</span></label>
              <select value={String(row.yarn_id ?? '')} onChange={e => handleCountChange(e.target.value)} disabled={!displayType} className={`yarn-field-input${displayType && !row.yarn_id ? ' yarn-field-input-error' : ''} ${!displayType ? 'yarn-field-input-disabled' : ''}`}>
                <option value="">{!displayType ? '— Select type first —' : displayCountOptions.length === 0 ? '— No counts available —' : '— Select count —'}</option>
                {displayCountOptions.map(y => { const cnt = y.actual_count ?? y.yarn_count ?? y.count_value; return <option key={y.id} value={String(y.id)}>{cnt ?? y.yarn_code}</option>; })}
              </select>
              {displayType && displayCountOptions.length > 0 && <span style={{ fontSize:10, color:'#64748b', marginTop:2 }}>{displayCountOptions.length} count{displayCountOptions.length !== 1 ? 's' : ''} for "{displayType}"</span>}
            </div>
            <div className="yarn-field"><label className="yarn-field-label">Ends</label><input type="number" className="yarn-field-input" value={String(row.ends ?? '')} onChange={e => onChange('ends', e.target.value)} placeholder="0" /></div>
            <div className="yarn-field"><label className="yarn-field-label">Crimp %</label><input type="number" className="yarn-field-input" value={String(row.crimp_pct ?? '')} onChange={e => onChange('crimp_pct', e.target.value)} placeholder="0" /></div>
          </div>
          {(row.wt_per_mtr || row.wt_per_mtr_wc) && (
            <div className="yarn-calc-strip">
              <span className="yarn-calc-label"><Zap size={11} color="#0d9488" /> Auto</span>
              <div className="yarn-calc-values">
                <span className="yarn-calc-item"><span className="yarn-calc-item-label">Wt/Mtr</span><span className="yarn-calc-item-value">{String(row.wt_per_mtr) || '—'}</span></span>
                <span className="yarn-calc-sep">|</span>
                <span className="yarn-calc-item"><span className="yarn-calc-item-label">Wt/Mtr WC</span><span className="yarn-calc-item-value">{String(row.wt_per_mtr_wc) || '—'}</span></span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Weft Yarn Card ────────────────────────────────────────────────────────────
function WeftYarnCard({
  row, index, onChange, onDelete, isInvalid, yarns,
}: {
  row: WeftRow; index: number;
  onChange: (key: string, val: unknown) => void;
  onDelete: () => void;
  isInvalid: boolean;
  yarns: YarnOption[];
}) {
  const [expanded, setExpanded] = useState(true);
  const selected     = yarns.find(y => String(y.id) === String(row.yarn_id));
  const selectedType = selected ? (selected.yarn_type ?? selected.category ?? '') : '';
  const yarnTypes    = getUniqueYarnTypes(yarns);

  const buildWeftCountLabel = (y: YarnOption): string => y.yarn_type ?? y.category ?? y.yarn_code;

  const handleTypeChange = (type: string) => {
    onChange('yarn_id', ''); onChange('weft_count', '');
    onChange('act_cnt', ''); onChange('_selected_type', type);
  };

  const displayType         = selectedType || String(row['_selected_type'] ?? '');
  const displayCountOptions = displayType ? getYarnsByType(yarns, displayType) : [];

  const handleCountChange = (yarnId: string) => {
    const y = yarns.find(yy => String(yy.id) === yarnId);
    if (y) {
      const label = buildWeftCountLabel(y);
      const cnt   = y.actual_count ?? y.yarn_count ?? y.count_value;
      onChange('yarn_id', y.id); onChange('weft_count', label); onChange('act_cnt', String(cnt ?? ''));
    } else {
      onChange('yarn_id', ''); onChange('weft_count', ''); onChange('act_cnt', '');
    }
  };

  return (
    <div className={`yarn-card yarn-card-weft${isInvalid ? ' yarn-card-invalid' : ''}`}>
      <div className="yarn-card-header">
        <div className="yarn-card-header-left">
          <div className="yarn-row-badge yarn-row-badge-weft">T{index + 1}</div>
          {selected ? (
            <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
              <div style={{ width:28, height:28, borderRadius:6, background:'linear-gradient(135deg,#7c3aed22,#7c3aed44)', border:'1px solid #c4b5fd', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Package size={13} color="#7c3aed" /></div>
              <div style={{ minWidth:0 }}>
                <div className="yarn-code-badge yarn-code-badge-weft">{displayType}</div>
                {selected.composition && <div style={{ fontSize:9, color:'#64748b', marginTop:1 }}>{selected.composition}</div>}
              </div>
            </div>
          ) : displayType ? (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:28, height:28, borderRadius:6, background:'#f3e8ff', border:'1px solid #e9d5ff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Package size={13} color="#c4b5fd" /></div>
              <div className="yarn-code-badge yarn-code-badge-weft" style={{ color:'#7c3aed', background:'#faf5ff', borderColor:'#c4b5fd' }}>{displayType}</div>
            </div>
          ) : (
            <span className="yarn-code-placeholder">No yarn selected</span>
          )}
          {row.act_cnt     && <span className="yarn-count-chip"><Hash size={10} />{String(row.act_cnt)}</span>}
          {row.onloom_pick && <span className="yarn-pick-chip"><Wind size={10} />{String(row.onloom_pick)} picks</span>}
        </div>
        <div className="yarn-card-header-right">
          {row.wt_per_mtr && <span className="yarn-auto-badge yarn-auto-badge-weft"><Zap size={10} />{String(row.wt_per_mtr)} g/m</span>}
          <button className="yarn-expand-btn" onClick={() => setExpanded(e => !e)}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button className="yarn-del-btn" onClick={onDelete}><Trash2 size={13} /></button>
        </div>
      </div>

      {expanded && (
        <div className="yarn-card-body">
          <div className="yarn-field-grid">
            <div className="yarn-field yarn-field-half">
              <label className="yarn-field-label">Yarn Type <span style={{ color:'#ef4444' }}>*</span><span className="yarn-master-badge yarn-master-badge-weft">Step 1</span></label>
              <select value={displayType} onChange={e => handleTypeChange(e.target.value)} className={`yarn-field-input${!displayType ? ' yarn-field-input-error' : ''}`}>
                <option value="">— Select type —</option>
                {yarnTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="yarn-field yarn-field-half">
              <label className="yarn-field-label">Actual Count <span style={{ color:'#ef4444' }}>*</span><span className="yarn-master-badge yarn-master-badge-count-weft">Step 2</span></label>
              <select value={String(row.yarn_id ?? '')} onChange={e => handleCountChange(e.target.value)} disabled={!displayType} className={`yarn-field-input${displayType && !row.yarn_id ? ' yarn-field-input-error' : ''} ${!displayType ? 'yarn-field-input-disabled' : ''}`}>
                <option value="">{!displayType ? '— Select type first —' : displayCountOptions.length === 0 ? '— No counts available —' : '— Select count —'}</option>
                {displayCountOptions.map(y => { const cnt = y.actual_count ?? y.yarn_count ?? y.count_value; return <option key={y.id} value={String(y.id)}>{cnt ?? y.yarn_code}</option>; })}
              </select>
              {displayType && displayCountOptions.length > 0 && <span style={{ fontSize:10, color:'#64748b', marginTop:2 }}>{displayCountOptions.length} count{displayCountOptions.length !== 1 ? 's' : ''} for "{displayType}"</span>}
            </div>
            <div className="yarn-field"><label className="yarn-field-label">Onloom Pick</label><input type="number" className="yarn-field-input" value={String(row.onloom_pick ?? '')} onChange={e => onChange('onloom_pick', e.target.value)} placeholder="0" /></div>
          </div>
          {row.wt_per_mtr && (
            <div className="yarn-calc-strip yarn-calc-strip-weft">
              <span className="yarn-calc-label"><Zap size={11} color="#7c3aed" /> Auto</span>
              <div className="yarn-calc-values">
                <span className="yarn-calc-item"><span className="yarn-calc-item-label">Wt/Mtr</span><span className="yarn-calc-item-value yarn-calc-item-value-weft">{String(row.wt_per_mtr) || '—'}</span></span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Construction Preview ──────────────────────────────────────────────────────
function ConstructionPreview({ form }: { form: FabricExt }) {
  const warpLabels = (form.warp_details ?? []).map(w => { const l = String(w.warp_count ?? '').trim(); const c = String(w.act_cnt ?? '').trim(); return l || c; }).filter(Boolean);
  const weftLabels = (form.weft_details ?? []).map(w => { const l = String(w.weft_count ?? '').trim(); const c = String(w.act_cnt ?? '').trim(); return l || c; }).filter(Boolean);
  const reed   = String(form.reed  ?? '').trim();
  const pick   = String(form.pick  ?? '').trim();
  const width  = String(form.width ?? '').trim();
  const weave  = String(form.weave ?? '').trim();
  const design = String(form.design ?? '').trim();
  const hasData = warpLabels.length || weftLabels.length || reed || pick || width;

  return (
    <div style={{ background:'linear-gradient(135deg,#f0fdfa,#eff6ff)', border:'2px solid #99f6e4', borderRadius:12, padding:'16px 18px', marginTop:12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <Wrench size={14} color="#0d9488" />
        <span style={{ fontSize:11, fontWeight:800, color:'#0d9488', textTransform:'uppercase', letterSpacing:'0.08em' }}>Construction Preview</span>
        <span style={{ fontSize:10, color:'#64748b', fontStyle:'italic' }}>auto-builds as you fill in yarn & loom details</span>
      </div>
      {!hasData ? (
        <div style={{ textAlign:'center', padding:'12px 0', fontSize:12, color:'#94a3b8', fontStyle:'italic' }}>Add warp/weft yarns and loom parameters to see construction…</div>
      ) : (
        <>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:12 }}>
            {warpLabels.length > 0 && (
              <div style={{ background:'#fff', border:'1.5px solid #99f6e4', borderRadius:8, padding:'6px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:60 }}>
                <span style={{ fontSize:9, fontWeight:700, color:'#0d9488', textTransform:'uppercase', letterSpacing:'0.06em' }}>Warp</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'#0f766e', fontSize:14 }}>{warpLabels.join(' + ')}</span>
              </div>
            )}
            {warpLabels.length > 0 && weftLabels.length > 0 && <span style={{ fontSize:18, fontWeight:300, color:'#94a3b8' }}>×</span>}
            {weftLabels.length > 0 && (
              <div style={{ background:'#fff', border:'1.5px solid #c4b5fd', borderRadius:8, padding:'6px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:60 }}>
                <span style={{ fontSize:9, fontWeight:700, color:'#7c3aed', textTransform:'uppercase', letterSpacing:'0.06em' }}>Weft</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'#6d28d9', fontSize:14 }}>{weftLabels.join(' + ')}</span>
              </div>
            )}
            {(warpLabels.length > 0 || weftLabels.length > 0) && (reed || pick || width) && <span style={{ fontSize:18, fontWeight:300, color:'#94a3b8' }}>/</span>}
            {reed && (
              <div style={{ background:'#fff', border:'1.5px solid #bfdbfe', borderRadius:8, padding:'6px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:50 }}>
                <span style={{ fontSize:9, fontWeight:700, color:'#2563eb', textTransform:'uppercase', letterSpacing:'0.06em' }}>Reed</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'#1d4ed8', fontSize:14 }}>{reed}</span>
              </div>
            )}
            {reed && pick && <span style={{ fontSize:18, fontWeight:300, color:'#94a3b8' }}>×</span>}
            {pick && (
              <div style={{ background:'#fff', border:'1.5px solid #bfdbfe', borderRadius:8, padding:'6px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:50 }}>
                <span style={{ fontSize:9, fontWeight:700, color:'#2563eb', textTransform:'uppercase', letterSpacing:'0.06em' }}>Pick</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'#1d4ed8', fontSize:14 }}>{pick}</span>
              </div>
            )}
            {width && (
              <>
                {(reed || pick) && <span style={{ fontSize:18, fontWeight:300, color:'#94a3b8' }}>/</span>}
                <div style={{ background:'#fff', border:'1.5px solid #fde68a', borderRadius:8, padding:'6px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:50 }}>
                  <span style={{ fontSize:9, fontWeight:700, color:'#b45309', textTransform:'uppercase', letterSpacing:'0.06em' }}>Width</span>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'#92400e', fontSize:14 }}>{width}"</span>
                </div>
              </>
            )}
            {weave && (
              <div style={{ background:'#fff', border:'1.5px solid #f0abfc', borderRadius:8, padding:'6px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:50 }}>
                <span style={{ fontSize:9, fontWeight:700, color:'#86198f', textTransform:'uppercase', letterSpacing:'0.06em' }}>Weave</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'#701a75', fontSize:13 }}>{weave}</span>
              </div>
            )}
            {design && (
              <div style={{ background:'#fff', border:'1.5px solid #fed7aa', borderRadius:8, padding:'6px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:50 }}>
                <span style={{ fontSize:9, fontWeight:700, color:'#c2410c', textTransform:'uppercase', letterSpacing:'0.06em' }}>Design</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'#9a3412', fontSize:13 }}>{design}</span>
              </div>
            )}
          </div>
          <div style={{ background:'#fff', border:'1.5px solid #0d9488', borderRadius:8, padding:'10px 14px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <span style={{ fontSize:10, fontWeight:700, color:'#0d9488', textTransform:'uppercase', letterSpacing:'0.07em', flexShrink:0 }}>Output</span>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:600, color:'#1e293b', flex:1, letterSpacing:'0.02em', wordBreak:'break-all' }}>{buildConstruction(form) || '—'}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function FabricMaster() {
  const [fabrics,       setFabrics]       = useState<FabricExt[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [search,        setSearch]        = useState('');
  const [filterSt,      setFilterSt]      = useState('');
  const [total,         setTotal]         = useState(0);
  const [page,          setPage]          = useState(1);
  const [pageSize,      setPageSize]      = useState(10);
  const [showForm,      setShowForm]      = useState(false);
  const [form,          setForm]          = useState<FabricExt>(BLANK);
  const [editId,        setEditId]        = useState<number | null>(null);
  const [error,         setError]         = useState('');
  const [errorDetail,   setErrorDetail]   = useState('');
  const [sec, setSec] = useState({
    basic:true, loom:true, construction:true, weight:true, warp:true, weft:true, attachments:true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [yarns,         setYarns]         = useState<YarnOption[]>([]);
  const [hsnCodes,      setHsnCodes]      = useState<HsnOption[]>([]);
  const [hsnLoading,    setHsnLoading]    = useState(false);
  const [hsnError,      setHsnError]      = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);

  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const screenWidth = useWidth();
  const isMobile    = screenWidth < 576;

  // ── Load lookup data (yarns + HSN codes) ──────────────────────────────────
  useEffect(() => {
    setLookupLoading(true);
    setHsnLoading(true);
    fetch('/api/fabrics/meta/lookup')
      .then(r => r.json())
      .then(data => {
        setYarns(data.yarns ?? []);
        const rawHsn: HsnOption[] = data.hsnCodes ?? [];
        const parsed = rawHsn
          .filter(h => {
            const status = (h as unknown as Record<string, unknown>).status ?? (h as unknown as Record<string, unknown>).is_active ?? '';
            if (typeof status === 'string' && status.toLowerCase() === 'inactive') return false;
            if (status === 0 || status === false) return false;
            return true;
          })
          .filter(h => h.hsn_code && String(h.hsn_code).length > 0);
        if (parsed.length === 0) setHsnError('No HSN codes from API — use manual entry');
        setHsnCodes(parsed);
      })
      .catch(() => {
        pushToast('warning', 'Lookup Load Warning', 'Could not load yarn/HSN master data.');
        setHsnError('Failed to load HSN codes');
      })
      .finally(() => { setLookupLoading(false); setHsnLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-calculate derived fields ─────────────────────────────────────────
  useEffect(() => {
    setForm(f => {
      const warpDetails: WarpDetail[] = (f.warp_details ?? []).map(row => {
        const { wt_per_mtr, wt_per_mtr_wc } = calcWarpRowWts(row);
        return { ...row, wt_per_mtr, wt_per_mtr_wc };
      });
      const weftDetails: WeftDetail[] = (f.weft_details ?? []).map(row => ({
        ...row, wt_per_mtr: calcWeftRowWt(row, f.onloom_reed, f.wastage),
      }));
      const reedSpace    = calcReedSpace(f.width);
      const warpWt       = calcWarpWtPerMtr(warpDetails);
      const warpWtWC     = calcWarpWtPerMtrWC(warpDetails);
      const weftWt       = calcWeftWtPerMtr(weftDetails);
      const fabricWt     = calcFabricWt(warpWtWC, weftWt);
      const fGsm         = calcFGSM(fabricWt, f.width);
      const updatedForm  = { ...f, warp_details: warpDetails, weft_details: weftDetails };
      const construction = buildConstruction(updatedForm);
      return {
        ...f,
        warp_details: warpDetails,
        weft_details: weftDetails,
        reed_space: reedSpace,
        warp_wt_per_mtr: warpWt,
        warp_wt_per_mtr_wc: warpWtWC,
        weft_wt_per_mtr: weftWt,
        fabric_wt_per_mtr: fabricWt,
        f_gsm: fGsm,
        construction,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    JSON.stringify(form.warp_details.map(w => ({ a:w.act_cnt, e:w.ends, c:w.crimp_pct, wc:w.warp_count }))),
    JSON.stringify(form.weft_details.map(w => ({ a:w.act_cnt, p:w.onloom_pick, wc:w.weft_count }))),
    form.onloom_reed, form.width, form.wastage, form.reed, form.pick, form.weave, form.design,
  ]);

  const loadFabrics = async () => {
    setLoading(true);
    try {
      const data = await listFabrics({ search, page, limit: pageSize, status: filterSt });
      const rows = (data.data ?? []) as FabricExt[];
      const detailed = await Promise.allSettled(
        rows.map(row => row.id ? getFabric(row.id) : Promise.resolve(row as unknown as Fabric))
      );
      const merged: FabricExt[] = rows.map((row, i) => {
        const result = detailed[i];
        if (result.status === 'fulfilled' && result.value) {
          const fullRow = result.value as unknown as FabricExt;
          // ── FIX: Normalise hsn_code to string when loading list ──
          const hsnRaw = fullRow.hsn_code ?? row.hsn_code;
          const hsnStr = hsnRaw !== null && hsnRaw !== undefined ? String(hsnRaw).trim() : '';
          return {
            ...row,
            ...fullRow,
            id: row.id,
            fabric_id: row.fabric_id,
            status: row.status,
            hsn_code: hsnStr,
          };
        }
        return {
          ...row,
          hsn_code: row.hsn_code !== null && row.hsn_code !== undefined
            ? String(row.hsn_code).trim() : '',
        };
      });
      setFabrics(merged);
      setTotal(data.total ?? 0);
    } catch {
      pushToast('error', 'Load Failed', 'Could not fetch fabrics.');
    }
    setLoading(false);
  };

  useEffect(() => { loadFabrics(); }, [search, filterSt, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, filterSt]);
  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showForm]);

  const openCreate = () => {
    setForm(BLANK); setEditId(null); setError(''); setErrorDetail(''); setShowForm(true);
  };

  // ── FIX: openEdit — use hsn_code string directly, restore warp/weft ──────
  const openEdit = async (id: number) => {
    try {
      const data = await getFabric(id);

    

      const rawWarp: WarpDetail[] = Array.isArray((data as unknown as FabricExt).warp_details)
        ? (data as unknown as FabricExt).warp_details
        : [];
      const rawWeft: WeftDetail[] = Array.isArray((data as unknown as FabricExt).weft_details)
        ? (data as unknown as FabricExt).weft_details
        : [];

  

      const { warpDetails, weftDetails } = restoreYarnLabels(rawWarp, rawWeft, yarns);

      const warpWithType: WarpRow[] = warpDetails.map(row => {
        const y = yarns.find(yy => String(yy.id) === String(row.yarn_id));
        return y ? { ...row, _selected_type: y.yarn_type ?? y.category ?? '' } : { ...row };
      });
      const weftWithType: WeftRow[] = weftDetails.map(row => {
        const y = yarns.find(yy => String(yy.id) === String(row.yarn_id));
        return y ? { ...row, _selected_type: y.yarn_type ?? y.category ?? '' } : { ...row };
      });

      // ── FIX: hsn_code is VARCHAR(20) — use string value directly ──
      const rawHsn  = (data as unknown as FabricExt).hsn_code;
      // Convert whatever the server sends (int or string) to a clean string
      const codeStr = rawHsn !== null && rawHsn !== undefined ? String(rawHsn).trim() : '';

     

      // If code not in dropdown yet, inject it so it shows immediately
      if (codeStr && !hsnCodes.find(h => h.hsn_code === codeStr)) {
        setHsnCodes(prev => [{ id: -1, hsn_code: codeStr, description: '(saved)' }, ...prev]);
      }

      setForm({
        ...BLANK,
        ...(data as unknown as FabricExt),
        // ── FIX: store plain string — no integer conversion ──
        hsn_code:     codeStr,
        warp_details: warpWithType as WarpDetail[],
        weft_details: weftWithType as WeftDetail[],
        attachments:  Array.isArray((data as unknown as FabricExt).attachments)
          ? (data as unknown as FabricExt).attachments
          : [],
        construction: '',
      });
      setEditId(id); setError(''); setErrorDetail(''); setShowForm(true);
    } catch (err) {
      console.error('[openEdit] error:', err);
      pushToast('error', 'Load Failed', 'Could not load fabric details.');
    }
  };

  // Re-restore yarn labels when yarns finish loading after form is open
  useEffect(() => {
    if (!showForm || yarns.length === 0) return;
    setForm(f => {
      const needsRestore = f.warp_details.some(w => !w.warp_count && w.yarn_id)
        || f.weft_details.some(w => !w.weft_count && w.yarn_id);
      if (!needsRestore) return f;
      const { warpDetails, weftDetails } = restoreYarnLabels(f.warp_details, f.weft_details, yarns);
      const warpWithType: WarpRow[] = warpDetails.map(row => {
        const r = row as WarpRow;
        if (r['_selected_type']) return r;
        const y = yarns.find(yy => String(yy.id) === String(row.yarn_id));
        return y ? { ...row, _selected_type: y.yarn_type ?? y.category ?? '' } : { ...row };
      });
      const weftWithType: WeftRow[] = weftDetails.map(row => {
        const r = row as WeftRow;
        if (r['_selected_type']) return r;
        const y = yarns.find(yy => String(yy.id) === String(row.yarn_id));
        return y ? { ...row, _selected_type: y.yarn_type ?? y.category ?? '' } : { ...row };
      });
      return { ...f, warp_details: warpWithType as WarpDetail[], weft_details: weftWithType as WeftDetail[] };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yarns, showForm]);

  // ── SAVE ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.reed.toString().trim())               { setError('Reed is required'); setErrorDetail(''); return; }
    if (!form.body_weave_pattern.toString().trim()) { setError('Body Weave Pattern is required'); setErrorDetail(''); return; }
    if (!form.wastage.toString().trim())            { setError('Wastage is required'); setErrorDetail(''); return; }
    for (const w of form.warp_details) {
      if (!w.warp_count) { setError('Warp Count is required for all warp rows'); setErrorDetail(''); return; }
      if (!w.act_cnt)    { setError('Actual Count is required for all warp rows'); setErrorDetail(''); return; }
    }
    for (const w of form.weft_details) {
      if (!w.weft_count) { setError('Weft Count is required for all weft rows'); setErrorDetail(''); return; }
      if (!w.act_cnt)    { setError('Actual Count is required for all weft rows'); setErrorDetail(''); return; }
    }

    setError(''); setErrorDetail(''); setSaving(true);

    try {
      const { warpDetails: restoredWarp, weftDetails: restoredWeft } =
        restoreYarnLabels(form.warp_details, form.weft_details, yarns);

      const formWithLabels: FabricExt = { ...form, warp_details: restoredWarp, weft_details: restoredWeft };
      const freshConstruction = buildConstruction(formWithLabels);

      // ── FIX: hsn_code is VARCHAR(20) — send the string value directly ──
      // Do NOT convert to integer ID. The DB column is now varchar(20).
      const hsnCodeValue = formWithLabels.hsn_code
        ? String(formWithLabels.hsn_code).trim()
        : null;

  

      const payload = {
        ...formWithLabels,
        construction: freshConstruction,
        attachments:  undefined,

        // ── FIX: send varchar string directly — no integer lookup ──
        hsn_code: hsnCodeValue,

        // varchar(20) columns
        reed: safeStr(formWithLabels.reed),
        pick: safeStr(formWithLabels.pick),

        // decimal columns
        on_pick:     toFloat(formWithLabels.on_pick),
        onloom_reed: toFloat(formWithLabels.onloom_reed),
        width:       toFloat(formWithLabels.width),
        wastage:     safeFloat(formWithLabels.wastage),

        // int UN NOT NULL
        total_ends:    safeInt(formWithLabels.total_ends),
        selvedge_ends: safeInt(formWithLabels.selvedge_ends),
        body_ends:     safeInt(formWithLabels.body_ends),
        reed_space:    toFloat(formWithLabels.reed_space),

        // decimal(14,6) weight columns
        warp_wt_per_mtr:    toFloat(formWithLabels.warp_wt_per_mtr),
        warp_wt_per_mtr_wc: toFloat(formWithLabels.warp_wt_per_mtr_wc),
        weft_wt_per_mtr:    toFloat(formWithLabels.weft_wt_per_mtr),
        fabric_wt_per_mtr:  toFloat(formWithLabels.fabric_wt_per_mtr),

        // decimal(10,4)
        f_gsm: toFloat(formWithLabels.f_gsm),

        sort_no:            formWithLabels.sort_no ? safeStr(formWithLabels.sort_no) : null,
        body_weave_pattern: safeStr(formWithLabels.body_weave_pattern),
        weave:              safeStr(formWithLabels.weave),
        design:             safeStr(formWithLabels.design),

        warp_details: formWithLabels.warp_details.map(row => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _selected_type, ...rest } = row as WarpRow;
          return {
            ...rest,
            yarn_id:       toInt(rest.yarn_id),
            ends:          safeInt(rest.ends),
            act_cnt:       toFloat(rest.act_cnt),
            crimp_pct:     toFloat(rest.crimp_pct),
            wt_per_mtr:    toFloat(rest.wt_per_mtr),
            wt_per_mtr_wc: toFloat(rest.wt_per_mtr_wc),
            warp_count:    safeStr(rest.warp_count),
          };
        }),

        weft_details: formWithLabels.weft_details.map(row => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _selected_type, ...rest } = row as WeftRow;
          return {
            ...rest,
            yarn_id:     toInt(rest.yarn_id),
            onloom_pick: safeInt(rest.onloom_pick),
            act_cnt:     toFloat(rest.act_cnt),
            wt_per_mtr:  toFloat(rest.wt_per_mtr),
            weft_count:  safeStr(rest.weft_count),
          };
        }),
      };

      

      if (editId) {
        await updateFabric(editId, payload as unknown as Fabric);
        pushToast('success', 'Fabric Updated', 'Fabric updated successfully.');
      } else {
        await createFabric(payload as unknown as Fabric);
        pushToast('success', 'Fabric Created', 'New fabric saved successfully.');
      }
      setShowForm(false);
      loadFabrics();
    } catch (e: unknown) {
      let msg    = 'Save failed';
      let detail = '';
      if (e && typeof e === 'object' && 'response' in e) {
        const axiosErr = e as { response: { data: { message?: string; error?: string; detail?: string; code?: string; sqlState?: string }; status: number } };
        const d = axiosErr.response?.data ?? {};
        msg = d.message ?? d.error ?? `Server error ${axiosErr.response.status}`;
        const parts: string[] = [];
        if (d.detail)   parts.push(d.detail);
        if (d.code)     parts.push(`Code: ${d.code}`);
        if (d.sqlState) parts.push(`SQL State: ${d.sqlState}`);
        detail = parts.join(' — ');
      } else if (e instanceof Error) {
        msg = e.message;
      }
      setError(msg);
      setErrorDetail(detail);
      pushToast('error', 'Save Failed', detail ? `${msg}: ${detail}` : msg);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this fabric?')) return;
    try {
      await deleteFabric(id);
      pushToast('success', 'Fabric Deleted', 'The fabric record has been removed.');
      loadFabrics();
    } catch {
      pushToast('error', 'Delete Failed', 'Could not delete fabric.');
    }
  };

  const set  = (key: keyof FabricExt, val: unknown) => setForm(f => ({ ...f, [key]: val }));
  const inp  = (key: keyof FabricExt, type = 'text', placeholder?: string) => (
    <input type={type} value={String(form[key] ?? '')} onChange={e => set(key, e.target.value)} placeholder={placeholder} style={s.input} />
  );

  const addWarp = () => setForm(f => ({ ...f, warp_details: [...f.warp_details, { yarn_id:'', warp_count:'', act_cnt:'', ends:'', wt_per_mtr:'', crimp_pct:'', wt_per_mtr_wc:'' } as WarpRow] }));
  const setWarp = (i: number, k: string, v: unknown) => setForm(f => { const a = f.warp_details.map((row, idx) => idx === i ? { ...row, [k]: v } : row); return { ...f, warp_details: a }; });
  const delWarp = (i: number) => setForm(f => ({ ...f, warp_details: f.warp_details.filter((_,j) => j!==i) }));

  const addWeft = () => setForm(f => ({ ...f, weft_details: [...f.weft_details, { yarn_id:'', weft_count:'', act_cnt:'', onloom_pick:'', wt_per_mtr:'' } as WeftRow] }));
  const setWeft = (i: number, k: string, v: unknown) => setForm(f => { const a = f.weft_details.map((row, idx) => idx === i ? { ...row, [k]: v } : row); return { ...f, weft_details: a }; });
  const delWeft = (i: number) => setForm(f => ({ ...f, weft_details: f.weft_details.filter((_,j) => j!==i) }));

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newA: Attachment[] = files.map(file => ({ name: file.name, url: URL.createObjectURL(file), size: file.size, file }));
    setForm(f => ({ ...f, attachments: [...(f.attachments ?? []), ...newA] }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const removeAttachment = (i: number) => setForm(f => ({ ...f, attachments: (f.attachments ?? []).filter((_,j) => j!==i) }));
  const toggle = (k: keyof typeof sec) => setSec(p => ({ ...p, [k]: !p[k] }));

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNums = (() => {
    const pages: number[] = [];
    let start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  })();
  const goTo      = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));
  const showContact = screenWidth >= 480;
  const showWt      = screenWidth >= 768;
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        .fm-wrap { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; color: #1e293b; }

        @keyframes toastIn     { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes spin        { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes cardSlideIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ddSlide     { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }

        .fm-spin { display:inline-block; width:16px; height:16px; border:2px solid #e2e8f0; border-top-color:#0d9488; border-radius:50%; animation:spin 0.7s linear infinite; vertical-align:middle; }
        .fm-spin-sm { display:inline-block; width:12px; height:12px; border:1.5px solid #e2e8f0; border-top-color:#0d9488; border-radius:50%; animation:spin 0.7s linear infinite; vertical-align:middle; margin-right:6px; }

        .fm-page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
        .fm-page-header h1 { margin:0; font-size:20px; font-weight:800; color:#1e293b; letter-spacing:-0.4px; }
        .fm-page-header p  { margin:3px 0 0; font-size:13px; color:#64748b; }
        .fm-add-btn { display:flex; align-items:center; gap:6px; background:#0d9488; color:#fff; border:none; border-radius:9px; padding:10px 18px; font-size:13.5px; font-weight:700; cursor:pointer; font-family:inherit; box-shadow:0 3px 10px rgba(13,148,136,0.3); white-space:nowrap; flex-shrink:0; touch-action:manipulation; transition:background 0.15s, transform 0.1s; }
        .fm-add-btn:hover { background:#0f766e; transform:translateY(-1px); }

        .fm-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .fm-search-wrap { position:relative; flex:1; min-width:180px; max-width:100%; }
        @media(min-width:768px){.fm-search-wrap{max-width:320px}}
        .fm-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .fm-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #dde3ec; border-radius:9px; font-size:13px; font-family:inherit; background:#fff; color:#1e293b; outline:none; transition:border 0.15s, box-shadow 0.15s; }
        .fm-search:focus { border-color:#0d9488; box-shadow:0 0 0 3px rgba(13,148,136,0.1); }
        .fm-filter-sel { border:1px solid #dde3ec; border-radius:8px; padding:8px 10px; font-size:13px; font-family:inherit; background:#fff; color:#374151; cursor:pointer; outline:none; max-width:150px; transition:border 0.15s; }
        .fm-filter-sel:focus { border-color:#0d9488; }
        .fm-page-size { display:flex; align-items:center; gap:6px; font-size:12.5px; color:#64748b; margin-left:auto; flex-shrink:0; }
        .fm-page-size select { border:1px solid #dde3ec; border-radius:7px; padding:6px 10px; font-size:12.5px; font-family:inherit; background:#fff; cursor:pointer; outline:none; transition:border 0.15s; }
        .fm-page-size select:focus { border-color:#0d9488; }

        .fm-card { background:#fff; border-radius:14px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.07); margin-bottom:24px; }
        .fm-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; scrollbar-width:thin; scrollbar-color:#c7d3e8 transparent; }
        .fm-table-wrap::-webkit-scrollbar { height:5px; }
        .fm-table-wrap::-webkit-scrollbar-track { background:#f1f5f9; }
        .fm-table-wrap::-webkit-scrollbar-thumb { background:#c7d3e8; border-radius:10px; }
        .fm-table-wrap::-webkit-scrollbar-thumb:hover { background:#94a3b8; }
        .fm-table { width:100%; border-collapse:collapse; font-size:13px; font-family:inherit; min-width:560px; }
        .fm-table thead tr { background:linear-gradient(135deg,#0d9488 0%,#0f766e 100%); }
        .fm-table th { padding:12px 16px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:12px; letter-spacing:0.03em; text-transform:uppercase; border-right:1px solid rgba(255,255,255,0.08); }
        .fm-table th:last-child { border-right:none; }
        .fm-table th.th-center { text-align:center; }
        .fm-table tbody tr:nth-child(odd)  td { background:#fff; }
        .fm-table tbody tr:nth-child(even) td { background:#f0fdfa; }
        .fm-table tbody tr:hover td { background:#e6faf8 !important; transition:background 0.12s; }
        .fm-table td { padding:10px 16px; color:#374151; font-size:13px; white-space:nowrap; vertical-align:middle; border-bottom:1px solid #f1f5f9; }
        .fm-table tbody tr:last-child td { border-bottom:none; }

        .fm-construction-cell { max-width:340px; }
        .fm-construction-pill { display:inline-flex; align-items:center; gap:6px; max-width:320px; background:#f0fdfa; border:1px solid #99f6e4; border-radius:6px; padding:4px 10px; cursor:default; overflow:hidden; }
        .fm-construction-pill:hover { background:#ccfbf1; border-color:#0d9488; }
        .fm-construction-text { font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:600; color:#0f766e; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; }

        .fm-fab-id { display:inline-block; font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:500; color:#0f766e; background:#f0fdfa; border:1px solid #99f6e4; border-radius:6px; padding:2px 7px; }
        .fm-chip { display:inline-block; padding:2px 9px; border-radius:20px; font-size:11px; font-weight:600; }
        .fm-chip-active   { background:#dcfce7; color:#166534; }
        .fm-chip-inactive { background:#fee2e2; color:#991b1b; }
        .fm-mono { font-family:'JetBrains Mono',monospace; font-size:11px; color:#475569; }
        .fm-hsn-chip { display:inline-flex; align-items:center; gap:3px; background:#f0fdfa; color:#0f766e; border:1px solid #a7f3d0; border-radius:5px; padding:2px 8px; font-family:'JetBrains Mono',monospace; font-size:11.5px; font-weight:700; white-space:nowrap; }

        .fm-action-group { display:flex; align-items:center; gap:5px; justify-content:center; }
        .fm-btn-edit { display:inline-flex; align-items:center; gap:3px; background:#f0fdfa; color:#0d9488; border:1px solid #99f6e4; padding:5px 11px; border-radius:7px; font-size:11.5px; font-weight:600; font-family:inherit; cursor:pointer; touch-action:manipulation; transition:background 0.12s; }
        .fm-btn-edit:hover { background:#ccfbf1; border-color:#0d9488; }
        .fm-btn-del  { display:inline-flex; align-items:center; gap:3px; background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; padding:5px 11px; border-radius:7px; font-size:11.5px; font-weight:600; font-family:inherit; cursor:pointer; touch-action:manipulation; transition:background 0.12s; }
        .fm-btn-del:hover { background:#fee2e2; }

        .fm-empty { text-align:center; padding:52px 16px; color:#94a3b8; font-size:13px; }
        .fm-pagination { display:flex; align-items:center; justify-content:space-between; padding:11px 20px; border-top:1px solid #edf0f5; background:#f8fafc; font-size:12.5px; color:#64748b; flex-wrap:wrap; gap:10px; }
        .fm-pag-btns { display:flex; gap:5px; align-items:center; flex-wrap:wrap; }
        .fm-pag-btn { padding:5px 12px; border:1px solid #dde3ec; border-radius:7px; background:#fff; cursor:pointer; font-size:12.5px; font-family:inherit; color:#374151; min-height:30px; display:flex; align-items:center; gap:3px; transition:background 0.12s, border-color 0.12s, color 0.12s; }
        .fm-pag-btn:hover:not(:disabled) { background:#f0fdfa; border-color:#0d9488; color:#0d9488; }
        .fm-pag-btn.active { background:#0d9488; color:#fff; border-color:#0d9488; font-weight:700; box-shadow:0 2px 6px rgba(13,148,136,0.25); }
        .fm-pag-btn:disabled { border-color:#f1f5f9; background:#f8fafc; color:#cbd5e1; cursor:not-allowed; }

        .fm-modal-overlay { position:fixed; inset:0; background:rgba(10,20,40,0.5); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:16px 8px; -webkit-overflow-scrolling:touch; }
        @media(min-width:576px){.fm-modal-overlay{padding:24px 16px}}
        .fm-modal { background:#fff; border-radius:18px; width:100%; max-width:1000px; box-shadow:0 12px 48px rgba(0,0,0,0.22); display:flex; flex-direction:column; max-height:calc(100vh - 32px); animation:slideUp 0.22s ease; }
        @keyframes slideUp { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        .fm-modal-header { display:flex; justify-content:space-between; align-items:center; padding:16px 24px; background:linear-gradient(135deg,#0d9488 0%,#0f766e 100%); border-radius:18px 18px 0 0; flex-shrink:0; }
        .fm-modal-body { padding:20px 24px; overflow-y:auto; flex:1; -webkit-overflow-scrolling:touch; scrollbar-width:thin; scrollbar-color:#c7d3e8 transparent; }
        .fm-modal-body::-webkit-scrollbar { width:5px; }
        .fm-modal-body::-webkit-scrollbar-thumb { background:#c7d3e8; border-radius:3px; }
        .fm-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:14px 24px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 18px 18px; }

        .fm-grid { display:grid; grid-template-columns:1fr; gap:12px; padding:12px 0; }
        @media(min-width:480px){.fm-grid{grid-template-columns:repeat(2,1fr);gap:14px}}
        @media(min-width:768px){.fm-grid{grid-template-columns:repeat(3,1fr);gap:14px 16px}}
        @media(min-width:960px){.fm-grid{grid-template-columns:repeat(4,1fr)}}

        .fm-input { width:100%; padding:8px 12px; border-radius:8px; border:1px solid #d1d9e6; font-size:13px; font-family:inherit; color:#1a2332; outline:none; background:#fff; transition:border 0.15s, box-shadow 0.15s; }
        .fm-input:focus { border-color:#0d9488; box-shadow:0 0 0 3px rgba(13,148,136,0.1); }

        .fm-calc-strip { display:flex; gap:8px; flex-wrap:wrap; background:#f0fdfa; border:1px solid #99f6e4; border-radius:10px; padding:12px 14px; margin-top:12px; }
        .fm-btn-cancel { padding:9px 18px; border:1px solid #d1d9e6; background:#fff; border-radius:9px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; font-family:inherit; transition:background 0.12s; }
        .fm-btn-cancel:hover { background:#f1f5f9; }
        .fm-btn-save { display:flex; align-items:center; gap:6px; padding:9px 22px; border:none; background:#16a34a; color:#fff; border-radius:9px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; box-shadow:0 2px 8px rgba(22,163,74,0.3); transition:background 0.15s; touch-action:manipulation; }
        .fm-btn-save:hover:not(:disabled) { background:#15803d; }
        .fm-btn-save:disabled { background:#86efac; cursor:not-allowed; }

        .fm-attach-list { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
        .fm-attach-item { display:flex; align-items:center; gap:8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; }
        .fm-attach-name { flex:1; font-size:12px; color:#1e293b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .fm-attach-size { font-size:11px; color:#94a3b8; flex-shrink:0; }
        .fm-attach-del  { background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; border-radius:6px; width:26px; height:26px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; }
        .fm-file-upload-btn { display:inline-flex; align-items:center; gap:6px; background:#f0fdfa; color:#0d9488; border:1.5px dashed #0d9488; border-radius:8px; padding:10px 18px; font-size:13px; font-weight:600; cursor:pointer; font-family:inherit; touch-action:manipulation; transition:background 0.12s; }
        .fm-file-upload-btn:hover { background:#ccfbf1; }

        .hsn-dd-wrap { position:relative; }
        .hsn-dd-trigger { width:100%; display:flex; align-items:center; justify-content:space-between; padding:0 12px; height:38px; border:1px solid #d1d9e6; border-radius:8px; background:#fff; color:#1a2332; font-size:13px; font-family:inherit; cursor:pointer; outline:none; transition:border 0.15s, box-shadow 0.15s; text-align:left; }
        .hsn-dd-trigger:hover:not(:disabled) { border-color:#0d9488; }
        .hsn-dd-trigger.open { border-color:#0d9488; border-bottom-left-radius:0; border-bottom-right-radius:0; box-shadow:0 0 0 3px rgba(13,148,136,0.12); }
        .hsn-dd-trigger.has-value { border-color:#6ee7b7; background:#f0fdf4; }
        .hsn-dd-trigger:disabled { background:#f8fafc; color:#94a3b8; cursor:not-allowed; }
        .hsn-dd-trigger-content { flex:1; overflow:hidden; }
        .hsn-dd-loading { color:#94a3b8; font-size:12.5px; display:flex; align-items:center; }
        .hsn-dd-placeholder { color:#9ca3af; }
        .hsn-dd-selected-val { display:flex; align-items:center; gap:8px; }
        .hsn-dd-code-badge { background:#0d9488; color:#fff; border-radius:5px; padding:1px 8px; font-size:12px; font-weight:700; font-family:'JetBrains Mono',monospace; white-space:nowrap; }
        .hsn-dd-chevron { flex-shrink:0; color:#64748b; margin-left:8px; transition:transform 0.2s; }
        .hsn-dd-chevron.rotated { transform:rotate(180deg); }
        .hsn-dd-panel { position:absolute; top:100%; left:0; right:0; z-index:400; background:#fff; border:1px solid #0d9488; border-top:none; border-bottom-left-radius:8px; border-bottom-right-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.12); animation:ddSlide 0.15s ease; }
        .hsn-dd-search-wrap { display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid #e8edf4; background:#f8fffe; }
        .hsn-dd-search-icon { flex-shrink:0; color:#94a3b8; }
        .hsn-dd-search { flex:1; border:none; outline:none; font-size:12.5px; font-family:inherit; color:#1a2332; background:transparent; }
        .hsn-dd-search::placeholder { color:#94a3b8; }
        .hsn-dd-clear { background:none; border:none; cursor:pointer; color:#94a3b8; padding:0; line-height:1; display:flex; align-items:center; }
        .hsn-dd-clear:hover { color:#475569; }
        .hsn-dd-count { padding:4px 12px; font-size:11px; color:#94a3b8; font-weight:600; border-bottom:1px solid #f1f5f9; background:#fafffe; }
        .hsn-dd-list { max-height:200px; overflow-y:auto; scrollbar-width:thin; scrollbar-color:#99f6e4 transparent; }
        .hsn-dd-list::-webkit-scrollbar { width:4px; }
        .hsn-dd-list::-webkit-scrollbar-thumb { background:#99f6e4; border-radius:2px; }
        .hsn-dd-option { display:flex; align-items:center; gap:10px; padding:8px 12px; cursor:pointer; border-bottom:1px solid #f8fafc; transition:background 0.1s; }
        .hsn-dd-option:last-child { border-bottom:none; }
        .hsn-dd-option:hover { background:#f0fdf4; }
        .hsn-dd-option.selected { background:#ecfdf5; }
        .hsn-dd-option.hsn-dd-clear-opt { color:#64748b; font-size:12px; font-style:italic; border-bottom:1px solid #e8edf4; }
        .hsn-dd-option.hsn-dd-clear-opt:hover { background:#f8fafc; }
        .hsn-opt-code { font-family:'JetBrains Mono',monospace; font-size:12.5px; font-weight:700; color:#0f766e; background:#f0fdf4; border:1px solid #a7f3d0; border-radius:4px; padding:1px 6px; white-space:nowrap; flex-shrink:0; }
        .hsn-dd-option.selected .hsn-opt-code { background:#0d9488; color:#fff; border-color:#0d9488; }
        .hsn-opt-desc { font-size:12px; color:#64748b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
        .hsn-opt-check { flex-shrink:0; color:#0d9488; margin-left:auto; }
        .hsn-dd-empty { display:flex; flex-direction:column; align-items:center; gap:6px; padding:20px; color:#94a3b8; font-size:12.5px; }
        .hsn-dd-status { font-size:11px; margin-top:4px; font-family:'JetBrains Mono',monospace; }
        .hsn-status-ok { color:#0f766e; font-weight:700; }

        .yarn-section-toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px; }
        .yarn-section-info { display:flex; align-items:center; gap:8px; font-size:12px; color:#64748b; }
        .yarn-section-count { display:inline-flex; align-items:center; justify-content:center; background:#0d9488; color:#fff; border-radius:20px; font-size:11px; font-weight:700; padding:2px 8px; min-width:24px; }
        .yarn-section-count-weft { background:#7c3aed; }
        .yarn-add-btn { display:flex; align-items:center; gap:6px; background:#f0fdfa; color:#0d9488; border:1.5px solid #0d9488; padding:7px 14px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; transition:background 0.15s; touch-action:manipulation; }
        .yarn-add-btn:hover { background:#ccfbf1; }
        .yarn-add-btn-weft { color:#7c3aed; border-color:#7c3aed; background:#faf5ff; }
        .yarn-add-btn-weft:hover { background:#ede9fe; }

        .yarn-cards-list { display:flex; flex-direction:column; gap:10px; }
        .yarn-card { background:#fff; border:1.5px solid #e2e8f0; border-radius:10px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.06); animation:cardSlideIn 0.2s ease-out; transition:box-shadow 0.15s,border-color 0.15s; }
        .yarn-card:hover { box-shadow:0 3px 12px rgba(0,0,0,0.1); border-color:#99f6e4; }
        .yarn-card-weft:hover { border-color:#c4b5fd; }
        .yarn-card-invalid { border-color:#fca5a5 !important; }

        .yarn-card-header { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f8fafc; border-bottom:1px solid #f1f5f9; gap:8px; flex-wrap:wrap; }
        .yarn-card-weft .yarn-card-header { background:#faf5ff; border-bottom-color:#ede9fe; }
        .yarn-card-header-left { display:flex; align-items:center; gap:8px; flex-wrap:wrap; flex:1; min-width:0; }
        .yarn-card-header-right { display:flex; align-items:center; gap:6px; flex-shrink:0; }

        .yarn-row-badge { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; background:#0d9488; color:#fff; border-radius:6px; font-size:11px; font-weight:800; font-family:'JetBrains Mono',monospace; flex-shrink:0; }
        .yarn-row-badge-weft { background:#7c3aed; }
        .yarn-code-badge { font-family:inherit; font-size:12px; font-weight:700; color:#0f766e; background:#f0fdfa; border:1px solid #99f6e4; border-radius:6px; padding:3px 9px; }
        .yarn-code-badge-weft { color:#6d28d9; background:#faf5ff; border-color:#c4b5fd; }
        .yarn-code-placeholder { font-size:12px; color:#94a3b8; font-style:italic; }

        .yarn-count-chip { display:inline-flex; align-items:center; gap:3px; background:#fff; border:1px solid #e2e8f0; border-radius:20px; padding:2px 8px; font-size:11px; color:#475569; font-weight:600; white-space:nowrap; }
        .yarn-ends-chip  { display:inline-flex; align-items:center; gap:3px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:20px; padding:2px 8px; font-size:11px; color:#1d4ed8; font-weight:600; white-space:nowrap; }
        .yarn-pick-chip  { display:inline-flex; align-items:center; gap:3px; background:#fdf4ff; border:1px solid #e9d5ff; border-radius:20px; padding:2px 8px; font-size:11px; color:#7e22ce; font-weight:600; white-space:nowrap; }

        .yarn-auto-badge      { display:inline-flex; align-items:center; gap:3px; background:#f0fdfa; border:1px solid #99f6e4; border-radius:20px; padding:2px 8px; font-size:10px; font-weight:700; color:#0f766e; font-family:'JetBrains Mono',monospace; white-space:nowrap; }
        .yarn-auto-badge-wc   { background:#eff6ff; border-color:#93c5fd; color:#1d4ed8; }
        .yarn-auto-badge-weft { background:#faf5ff; border-color:#c4b5fd; color:#6d28d9; }

        .yarn-expand-btn { background:#fff; border:1px solid #e2e8f0; border-radius:6px; width:26px; height:26px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#64748b; transition:background 0.1s; }
        .yarn-expand-btn:hover { background:#f1f5f9; }
        .yarn-del-btn { background:#fff1f2; border:1px solid #fca5a5; border-radius:6px; width:26px; height:26px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#dc2626; transition:background 0.1s; }
        .yarn-del-btn:hover { background:#fee2e2; }

        .yarn-card-body { padding:14px; background:#fff; }
        .yarn-field-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px 12px; }
        @media(max-width:479px){ .yarn-field-grid { grid-template-columns:1fr; } }
        @media(min-width:768px){ .yarn-field-grid { grid-template-columns:1fr 1fr 1fr 1fr; gap:10px 12px; } }
        .yarn-field { display:flex; flex-direction:column; gap:4px; }
        .yarn-field-half { grid-column:span 1; }
        @media(max-width:479px){.yarn-field-half{grid-column:1/-1;}}
        .yarn-field-label { font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
        .yarn-field-input { width:100%; padding:7px 10px; border:1px solid #d1d9e6; border-radius:7px; font-size:12px; font-family:inherit; color:#1e293b; background:#fff; outline:none; transition:border-color 0.15s; }
        .yarn-field-input:focus { border-color:#0d9488; box-shadow:0 0 0 2px rgba(13,148,136,0.08); }
        .yarn-field-input-error { border-color:#fca5a5; background:#fff5f5; }
        .yarn-field-input-disabled { background:#f8fafc; color:#94a3b8; cursor:not-allowed; border-color:#e2e8f0; }

        .yarn-master-badge { font-size:9px; font-weight:700; padding:1px 5px; border-radius:20px; background:#dbeafe; color:#1d4ed8; border:1px solid #bfdbfe; text-transform:uppercase; letter-spacing:0.04em; }
        .yarn-master-badge-count { background:#dcfce7; color:#166534; border-color:#86efac; }
        .yarn-master-badge-weft { background:#ede9fe; color:#6d28d9; border-color:#c4b5fd; }
        .yarn-master-badge-count-weft { background:#fce7f3; color:#9d174d; border-color:#f9a8d4; }

        .yarn-calc-strip { display:flex; align-items:center; gap:12px; background:#f0fdfa; border:1px solid #99f6e4; border-radius:8px; padding:8px 12px; margin-top:10px; flex-wrap:wrap; }
        .yarn-calc-strip-weft { background:#faf5ff; border-color:#c4b5fd; }
        .yarn-calc-label { display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#0d9488; text-transform:uppercase; letter-spacing:0.05em; flex-shrink:0; }
        .yarn-calc-strip-weft .yarn-calc-label { color:#7c3aed; }
        .yarn-calc-values { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .yarn-calc-sep { color:#cbd5e1; font-size:12px; }
        .yarn-calc-item { display:flex; align-items:center; gap:6px; }
        .yarn-calc-item-label { font-size:10px; color:#64748b; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; }
        .yarn-calc-item-value { font-family:'JetBrains Mono',monospace; font-size:12px; font-weight:700; color:#0f766e; }
        .yarn-calc-item-value-weft { color:#6d28d9; }

        .yarn-empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:28px 16px; background:#f8fafc; border:2px dashed #e2e8f0; border-radius:10px; gap:8px; color:#94a3b8; font-size:13px; text-align:center; }
        .yarn-empty-state-icon { width:40px; height:40px; background:#f1f5f9; border-radius:10px; display:flex; align-items:center; justify-content:center; color:#cbd5e1; }

        select, input, textarea { font-family:'Plus Jakarta Sans', sans-serif; }
      `}</style>

      <div className="fm-wrap">

        {/* PAGE HEADER */}
        <div className="fm-page-header">
          <div>
            <h1 style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Layers size={22} color="#0d9488" /> Fabric Master
            </h1>
            <p>{total} fabric{total !== 1 ? 's' : ''} registered</p>
          </div>
          <button className="fm-add-btn" onClick={openCreate}><Plus size={15} /> New Fabric</button>
        </div>

        {/* TOOLBAR */}
        <div className="fm-toolbar">
          <div className="fm-search-wrap" style={{ flexBasis: isMobile ? '100%' : undefined }}>
            <Search size={14} />
            <input className="fm-search" placeholder="Search sort no, construction, design…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="fm-filter-sel" value={filterSt} onChange={e => { setFilterSt(e.target.value); setPage(1); }}>
            <option value="">All Status</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
          {!isMobile && <span style={{ fontSize:12, color:'#64748b' }}>{total} record(s)</span>}
          <div className="fm-page-size">
            {!isMobile && <span>Show</span>}
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>
        {isMobile && <p style={{ fontSize:12, color:'#94a3b8', marginBottom:8 }}>{total} record(s)</p>}

        {/* TABLE */}
        <div className="fm-card">
          <div className="fm-table-wrap">
            <table className="fm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fabric ID</th>
                  <th>Sort No</th>
                  <th>Reed</th>
                  <th>Pick</th>
                  {showContact && <><th>Width</th><th>Weave Pattern</th></>}
                  {showWt && <><th>HSN Code</th><th>F.GSM</th><th>Fabric Wt/Mtr</th><th>Construction</th></>}
                  <th>Status</th>
                  <th className="th-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={13} className="fm-empty">
                    <span className="fm-spin" style={{ width:22, height:22, borderWidth:3 }} />
                  </td></tr>
                ) : fabrics.length === 0 ? (
                  <tr><td colSpan={13} className="fm-empty">
                    {search || filterSt ? 'No fabrics match your search' : 'No fabrics yet. Click "New Fabric" to create one.'}
                  </td></tr>
                ) : fabrics.map((f, i) => {
                  const constructionDisplay = safeConstruction(f);
                  // ── FIX: hsn_code is already a string — display directly ──
                  const hsnDisplay = f.hsn_code ? String(f.hsn_code).trim() : '';
                  return (
                    <tr key={f.id}>
                      <td style={{ color:'#94a3b8', fontSize:12 }}>{(page - 1) * pageSize + i + 1}</td>
                      <td><span className="fm-fab-id">{f.fabric_id ?? '—'}</span></td>
                      <td className="fm-mono">{f.sort_no || '—'}</td>
                      <td>{f.reed}</td>
                      <td>{f.pick}</td>
                      {showContact && <><td>{f.width}"</td><td>{f.body_weave_pattern}</td></>}
                      {showWt && (
                        <>
                          <td>{hsnDisplay ? <span className="fm-hsn-chip">{hsnDisplay}</span> : <span style={{ color:'#94a3b8', fontSize:11 }}>—</span>}</td>
                          <td className="fm-mono">{f.f_gsm || '—'}</td>
                          <td className="fm-mono">{f.fabric_wt_per_mtr || '—'}</td>
                          <td className="fm-construction-cell">
                            {constructionDisplay ? (
                              <span className="fm-construction-pill" title={constructionDisplay}>
                                <Wrench size={10} style={{ flexShrink:0, opacity:0.5 }} color="#0d9488" />
                                <span className="fm-construction-text">{constructionDisplay}</span>
                              </span>
                            ) : <span style={{ color:'#94a3b8', fontSize:11 }}>—</span>}
                          </td>
                        </>
                      )}
                      <td>
                        <span className={`fm-chip ${f.status === 'Active' ? 'fm-chip-active' : 'fm-chip-inactive'}`}>{f.status}</span>
                      </td>
                      <td>
                        <div className="fm-action-group">
                          <button className="fm-btn-edit" onClick={() => openEdit(f.id!)}>✏️{!isMobile && ' Edit'}</button>
                          <button className="fm-btn-del"  onClick={() => handleDelete(f.id!)}>🗑{!isMobile && ' Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!loading && total > 0 && (
            <div className="fm-pagination">
              <span>Page {page} of {totalPages} · {total} record{total !== 1 ? 's' : ''}</span>
              <div className="fm-pag-btns">
                <button className="fm-pag-btn" onClick={() => goTo(1)} disabled={page === 1}>«</button>
                <button className="fm-pag-btn" onClick={() => goTo(page - 1)} disabled={page === 1}>‹ Prev</button>
                {pageNums.map(p => <button key={p} className={`fm-pag-btn${p === page ? ' active' : ''}`} onClick={() => goTo(p)}>{p}</button>)}
                <button className="fm-pag-btn" onClick={() => goTo(page + 1)} disabled={page === totalPages}>Next ›</button>
                <button className="fm-pag-btn" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* ══ MODAL ══ */}
        {showForm && (
          <div className="fm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="fm-modal">

              <div className="fm-modal-header">
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  <h2 style={{ margin:0, fontSize: isMobile ? 15 : 17, fontWeight:800, color:'#fff', letterSpacing:'-0.3px' }}>
                    {editId ? '✏️ Edit Fabric' : '➕ New Fabric'}
                  </h2>
                  {editId && (form as FabricExt & { fabric_id?: string }).fabric_id && (
                    <span style={{ fontSize:11, color:'#99f6e4', fontFamily:"'JetBrains Mono', monospace" }}>
                      {(form as FabricExt & { fabric_id?: string }).fabric_id}
                    </span>
                  )}
                </div>
                <button style={{ background:'rgba(255,255,255,0.15)', border:'none', padding:'6px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, opacity:0.85, touchAction:'manipulation' }} onClick={() => setShowForm(false)}>
                  <X size={20} color="#fff" />
                </button>
              </div>

              {error && (
                <div style={{ display:'flex', alignItems:'flex-start', gap:8, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:0, color:'#ef4444', padding:'10px 24px', flexDirection:'column' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, width:'100%' }}>
                    <AlertCircle size={15} style={{ flexShrink:0 }} />
                    <span style={{ fontWeight:700, flex:1, fontSize:13 }}>{error}</span>
                    <button onClick={() => { setError(''); setErrorDetail(''); }} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', padding:0, color:'#ef4444', display:'flex', alignItems:'center' }}>
                      <X size={14} />
                    </button>
                  </div>
                  {errorDetail && (
                    <div style={{ background:'#fff', border:'1px solid #fca5a5', borderRadius:6, padding:'6px 10px', fontSize:11, fontFamily:"'JetBrains Mono', monospace", color:'#7f1d1d', lineHeight:1.5, wordBreak:'break-all', width:'100%' }}>
                      {errorDetail}
                    </div>
                  )}
                </div>
              )}

              <div className="fm-modal-body">

                {lookupLoading && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, background:'#eff6ff', border:'1px solid #93c5fd', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'#1e40af' }}>
                    <Loader2 size={14} style={{ animation:'spin 1s linear infinite', flexShrink:0 }} />
                    Loading Yarn Master &amp; HSN data…
                  </div>
                )}

                {/* BASIC INFORMATION */}
                <SectionHead title="Basic Information" open={sec.basic} onToggle={() => toggle('basic')} />
                {sec.basic && (
                  <div className="fm-grid">
                    <Field label="Sort No">
                      <input type="text" value={String(form.sort_no ?? '')} onChange={e => set('sort_no', e.target.value)} placeholder="e.g. 001, A-01…" style={s.input} />
                    </Field>
                    <Field label="Reed" required>{inp('reed', 'text', 'e.g. 68')}</Field>
                    <Field label="Pick" required>{inp('pick', 'text', 'e.g. 60')}</Field>
                    <Field label="On Pick">{inp('on_pick', 'number')}</Field>
                    <Field label="Width (inches)" required>{inp('width', 'number')}</Field>
                    <Field label="Body Weave Pattern" required>
                      <input type="text" value={String(form.body_weave_pattern ?? '')} onChange={e => set('body_weave_pattern', e.target.value.toUpperCase())} placeholder="e.g. PLAIN, TWILL…" style={s.input} />
                    </Field>
                    <Field label="Weave">
                      <input type="text" value={String(form.weave ?? '')} onChange={e => set('weave', e.target.value.toUpperCase())} placeholder="e.g. 1/1, 2/1…" style={s.input} />
                    </Field>
                    <Field label="Design">
                      <input type="text" value={String(form.design ?? '')} onChange={e => set('design', e.target.value)} placeholder="e.g. STRIPE, CHECK…" style={s.input} />
                    </Field>

                    {/* ── HSN Dropdown — VARCHAR(20), store & send string directly ── */}
                    <Field label="HSN Code">
                      <HsnDropdown
                        value={String(form.hsn_code ?? '')}
                        onChange={code => set('hsn_code', code)}
                        hsnCodes={hsnCodes}
                        hsnLoading={hsnLoading}
                        hsnError={hsnError}
                      />
                    </Field>

                    <Field label="Status">
                      <select value={String(form.status ?? '')} onChange={e => set('status', e.target.value)} style={s.input}>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </Field>
                  </div>
                )}

                {/* LOOM PARAMETERS */}
                <SectionHead title="Loom Parameters" open={sec.loom} onToggle={() => toggle('loom')} />
                {sec.loom && (
                  <div className="fm-grid">
                    <Field label="On Reed (Onloom Reed)">{inp('onloom_reed', 'number')}</Field>
                    <Field label="Reed Space" hint="auto"><AutoField value={form.reed_space} title="Auto: Width + 4" type="number" /></Field>
                    <Field label="Total Ends">{inp('total_ends', 'number')}</Field>
                    <Field label="Selvedge Ends">{inp('selvedge_ends', 'number')}</Field>
                    <Field label="Body Ends">{inp('body_ends', 'number')}</Field>
                    <Field label="Wastage" required>{inp('wastage', 'number')}</Field>
                  </div>
                )}

                {/* WARP DETAILS */}
                <SectionHead title="Warp Details" open={sec.warp} onToggle={() => toggle('warp')} />
                {sec.warp && (
                  <div style={s.subSection}>
                    <div className="yarn-section-toolbar">
                      <div className="yarn-section-info">
                        <span className="yarn-section-count">{form.warp_details.length}</span>
                        <span>warp yarn{form.warp_details.length !== 1 ? 's' : ''}</span>
                        {yarns.length > 0 && (
                          <span style={{ fontSize:11, color:'#0d9488', background:'#f0fdfa', border:'1px solid #99f6e4', borderRadius:20, padding:'1px 8px', fontWeight:600 }}>
                            {getUniqueYarnTypes(yarns).length} types · {yarns.length} yarns
                          </span>
                        )}
                      </div>
                      <button className="yarn-add-btn" onClick={addWarp}><PlusCircle size={14} /> Add Warp Yarn</button>
                    </div>
                    {form.warp_details.length === 0 ? (
                      <div className="yarn-empty-state">
                        <div className="yarn-empty-state-icon"><Package size={20} /></div>
                        <strong style={{ fontSize:13, color:'#475569' }}>No warp yarns yet</strong>
                        <span style={{ fontSize:12 }}>Click "Add Warp Yarn" — select type first, then count</span>
                      </div>
                    ) : (
                      <div className="yarn-cards-list">
                        {form.warp_details.map((row, i) => (
                          <WarpYarnCard key={i} row={row as WarpRow} index={i} onChange={(k, v) => setWarp(i, k, v)} onDelete={() => delWarp(i)} isInvalid={!row.warp_count || !row.act_cnt} yarns={yarns} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* WEFT DETAILS */}
                <SectionHead title="Weft Details" open={sec.weft} onToggle={() => toggle('weft')} />
                {sec.weft && (
                  <div style={s.subSection}>
                    <div className="yarn-section-toolbar">
                      <div className="yarn-section-info">
                        <span className="yarn-section-count yarn-section-count-weft">{form.weft_details.length}</span>
                        <span>weft yarn{form.weft_details.length !== 1 ? 's' : ''}</span>
                        {yarns.length > 0 && (
                          <span style={{ fontSize:11, color:'#7c3aed', background:'#faf5ff', border:'1px solid #c4b5fd', borderRadius:20, padding:'1px 8px', fontWeight:600 }}>
                            {getUniqueYarnTypes(yarns).length} types · {yarns.length} yarns
                          </span>
                        )}
                      </div>
                      <button className="yarn-add-btn yarn-add-btn-weft" onClick={addWeft}><PlusCircle size={14} /> Add Weft Yarn</button>
                    </div>
                    {form.weft_details.length === 0 ? (
                      <div className="yarn-empty-state">
                        <div className="yarn-empty-state-icon" style={{ background:'#f3e8ff', color:'#c4b5fd' }}><Package size={20} /></div>
                        <strong style={{ fontSize:13, color:'#475569' }}>No weft yarns yet</strong>
                        <span style={{ fontSize:12 }}>Click "Add Weft Yarn" — select type first, then count</span>
                      </div>
                    ) : (
                      <div className="yarn-cards-list">
                        {form.weft_details.map((row, i) => (
                          <WeftYarnCard key={i} row={row as WeftRow} index={i} onChange={(k, v) => setWeft(i, k, v)} onDelete={() => delWeft(i)} isInvalid={!row.weft_count || !row.act_cnt} yarns={yarns} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* CONSTRUCTION PREVIEW */}
                <SectionHead title="Construction" open={sec.construction} onToggle={() => toggle('construction')} badge="Auto-Built" icon={<Wrench size={14} />} />
                {sec.construction && (
                  <div style={s.subSection}><ConstructionPreview form={form} /></div>
                )}

                {/* WEIGHT SUMMARY */}
                <SectionHead title="Weight Summary" open={sec.weight} onToggle={() => toggle('weight')} badge="Auto-Calculated" />
                {sec.weight && (
                  <div className="fm-calc-strip">
                    <CalcBadge label="Warp Wt/Mtr"    value={form.warp_wt_per_mtr} />
                    <CalcBadge label="Warp Wt/Mtr WC" value={form.warp_wt_per_mtr_wc} />
                    <CalcBadge label="Weft Wt/Mtr"    value={form.weft_wt_per_mtr} />
                    <CalcBadge label="Fabric Wt/Mtr"  value={form.fabric_wt_per_mtr} />
                    <CalcBadge label="F.GSM"           value={form.f_gsm} />
                  </div>
                )}

                {/* ATTACHMENTS */}
                <SectionHead title="Attachments" open={sec.attachments} onToggle={() => toggle('attachments')} />
                {sec.attachments && (
                  <div style={s.subSection}>
                    <p style={{ fontSize:12, color:'#64748b', margin:'0 0 10px' }}>Upload fabric spec sheets, reference documents, or images.</p>
                    <label className="fm-file-upload-btn">
                      <Paperclip size={15} /> Choose Files
                      <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp" style={{ display:'none' }} onChange={handleFileAdd} />
                    </label>
                    <span style={{ marginLeft:8, fontSize:11, color:'#94a3b8' }}>PDF, DOC, XLS, Images accepted</span>
                    {(form.attachments ?? []).length > 0 && (
                      <div className="fm-attach-list">
                        {(form.attachments ?? []).map((att, i) => (
                          <div key={i} className="fm-attach-item">
                            <FileText size={16} color="#0d9488" style={{ flexShrink:0 }} />
                            <a href={att.url} target="_blank" rel="noreferrer" className="fm-attach-name" style={{ color:'#1e293b', textDecoration:'none' }} title={att.name}>{att.name}</a>
                            {att.size && <span className="fm-attach-size">{formatFileSize(att.size)}</span>}
                            <button className="fm-attach-del" onClick={() => removeAttachment(i)}><Trash2 size={12} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    {(form.attachments ?? []).length === 0 && (
                      <p style={{ fontSize:12, color:'#9ca3af', textAlign:'center', padding:'16px 0 4px' }}>No attachments yet.</p>
                    )}
                  </div>
                )}

              </div>

              <div className="fm-modal-footer">
                <button className="fm-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="fm-btn-save" onClick={handleSave} disabled={saving}>
                  {saving
                    ? <><span className="fm-spin" style={{ borderTopColor:'#fff', borderColor:'rgba(255,255,255,0.3)' }} /> Saving…</>
                    : (editId ? '✏️ Update Fabric' : '💾 Save Fabric')
                  }
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </>
  );
}

// ─── Shared styles ─────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  label:       { display:'flex', alignItems:'center', fontSize:11, fontWeight:700, color:'#64748b', marginBottom:4, textTransform:'uppercase' as const, letterSpacing:'0.05em' },
  input:       { width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid #d1d9e6', fontSize:13, color:'#1a2332', outline:'none', boxSizing:'border-box' as const, background:'#fff', fontFamily:"'Plus Jakarta Sans', sans-serif" },
  readOnly:    { background:'#f0fdfa', color:'#0f766e', fontWeight:600, fontFamily:"'JetBrains Mono', monospace", border:'1px solid #99f6e4', cursor:'default' },
  sectionHead: { display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 14px', cursor:'pointer', marginTop:18, userSelect:'none' as const, transition:'background 0.12s' },
  sectionTitle:{ fontWeight:700, fontSize:13, color:'#1e293b' },
  subSection:  { background:'#fafbfc', border:'1px solid #e2e8f0', borderRadius:10, padding:14, marginTop:10 },
  calcBadge:   { display:'flex', flexDirection:'column' as const, alignItems:'center', background:'#fff', border:'1px solid #99f6e4', borderRadius:8, padding:'8px 14px', minWidth:120 },
  calcLabel:   { fontSize:10, color:'#64748b', fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'0.05em' },
  calcValue:   { fontSize:15, fontWeight:700, color:'#0f766e', fontFamily:"'JetBrains Mono', monospace", marginTop:2 },
};