// frontend/src/pages/admin/ProductionPlanningMaster.tsx
// On order select: order_date, sort_no, customer_name, confirmed_by, order_quantity
// are all fetched live from GET /api/production-plans/order/:orderNo (order_bookings table).
// order_bookings.confirm_by is aliased → confirmed_by in the API response.
// When opening an existing plan for edit, confirmed_by is re-fetched the same way.
//
// NEW: "Delivery Address" is also auto-fetched from the SAME endpoint
// (GET /api/production-plans/order/:orderNo) whenever an Order No is
// selected — same trigger as Order Date / Order Sort No / Confirmed By.
// The backend returns it as one pre-formatted multi-line text block
// (co.delivery_address), so it's rendered read-only, exactly like the other
// order-derived fields. It is saved onto the plan as-is.
//
// FIX: All dates now use fmtDate() which parses YYYY-MM-DD strings directly
// (splitting on '-') to avoid UTC→local timezone shift that caused dates to
// display one day behind (e.g. 12/6/2026 showing as 11/6/2026 in IST).
//
// Export / Print menu in the page header (Export as CSV, Export as Excel,
// Print Table) — same dropdown pattern as the Yarn Purchase Order list page.
// Pulls ALL records matching the current search/filter (limit=10000), not just
// the visible page, so exports are complete even with small page sizes.
//
// NEW: "By Production" section now has a searchable Vendor dropdown, linked
// to vendor_master via GET /api/production-plans/vendors/search?q=.
// NEW: "By Purchase" section now has a searchable Supplier dropdown, linked
// to supplier_master via GET /api/production-plans/suppliers/search?q=.

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';

import {
  Plus, Search, X, ChevronDown, ChevronUp,
  Loader2, AlertCircle, CheckCircle2, Info,
  AlertTriangle, Trash2, PlusCircle, Check,
  Download, FileText, FileSpreadsheet, Printer,
  Factory, Truck, MapPin,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderLink {
  id?: number;
  linking_date: string;
  co_no: string;
  co_date: string;
  customer_name: string;
  co_sort_no: string;
  co_quantity: string;
  plan_quantity_allocated: string;
  _isNew?: boolean;
}

interface ProductionPlan {
  id?: number;
  rec_no?: string;
  rec_date?: string;
  order_type: string;
  order_no: string;
  order_date: string;
  order_sort_no: string;
  customer_name?: string;
  confirmed_by: string;
  delivery_address: string;   // ← NEW: auto-filled from order_bookings on order select
  constn_for_production: string;
  order_quantity: string;
  allocated_qty: string;
  stock_special_instruction: string;
  production_qty: string;
  inhouse_prod_qty: string;
  vendor_prod_qty: string;
  prod_special_instruction: string;
  vendor_id: string;          // ← NEW: vendor_master.id (stored as string in form state)
  vendor_name: string;        // ← NEW: display name, saved alongside vendor_id
  purchase_qty: string;
  purchase_special_instruction: string;
  supplier_id: string;        // ← NEW: supplier_master.id (stored as string in form state)
  supplier_name: string;      // ← NEW: display name, saved alongside supplier_id
  total_planned_qty?: number;
  balance_qty?: number;
  stock_total_qty?: number;
  stock_reserved_qty?: number;
  stock_available_qty?: number;
  stock_balance_qty?: number;
  order_links: OrderLink[];
}

interface OrderOption {
  order_no: string;
  order_date: string;
  sort_no?: string;
  quantity: number;
  customer_name?: string;
  construction?: string;
  confirmed_by?: string;
}

// ── NEW: generic option shape for Vendor / Supplier dropdowns ────────────────
interface NameOption {
  id: string;
  name: string;
  code?: string;
  location?: string;
}

// ─── Timezone-safe Date Formatter ─────────────────────────────────────────────
// WHY DATES SHIFT:
// MySQL2/Node returns DATE columns as JS Date objects. JSON.stringify converts
// them to UTC ISO strings: "2026-06-11T18:30:00.000Z" (IST midnight = UTC 18:30
// the previous day). So .slice(0,10) gives "2026-06-11" — already wrong by the
// time fmtDate or any state setter sees it.
//
// SOLUTION — two helpers:
//  toDateStr(raw) : normalise any date value → plain "YYYY-MM-DD" for state storage.
//                   Uses local getters (getFullYear/Month/Date) to undo UTC shift.
//  fmtDate(raw)   : format any date value → "D/M/YYYY" for display.
//                   Also uses local getters for ISO strings.

const toDateStr = (raw?: string | null): string => {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  // ISO with time: "2026-06-11T18:30:00.000Z" — use local getters
  if (s.includes('T') || s.endsWith('Z')) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  // Already plain YYYY-MM-DD — safe to slice
  return s.slice(0, 10);
};

const fmtDate = (raw?: string | null): string => {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  // ISO with time: use local getters to get the correct calendar date
  if (s.includes('T') || s.endsWith('Z')) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }
  // Plain "YYYY-MM-DD" — split directly, never pass to new Date()
  const parts = s.slice(0, 10).split('-');
  if (parts.length === 3) {
    const [yyyy, mm, dd] = parts;
    return `${parseInt(dd, 10)}/${parseInt(mm, 10)}/${yyyy}`;
  }
  return s;
};

// ─── Auth Token Helper ────────────────────────────────────────────────────────

const getToken = (): string => {
  const COMMON_KEYS = [
    'token', 'auth_token', 'access_token', 'authToken', 'accessToken',
    'jwt', 'JWT', 'bearer_token', 'bearerToken', 'user_token',
    'id_token', 'idToken', 'Authorization',
  ];
  const storages = [localStorage, sessionStorage];
  for (const storage of storages) {
    for (const key of COMMON_KEYS) {
      try {
        const raw = storage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            const t =
              parsed.access_token || parsed.token || parsed.accessToken ||
              parsed.id_token || parsed.idToken || parsed.jwt || parsed.bearer || null;
            if (t && typeof t === 'string' && t.length > 10) return t;
          }
        } catch { /* not JSON */ }
        if (raw.length > 10) return raw;
      } catch { /* storage blocked */ }
    }
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (key.includes('auth-token') || key.includes('supabase')) {
        const raw = localStorage.getItem(key) || '';
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.access_token) return parsed.access_token;
          if (parsed?.token) return parsed.token;
        } catch { if (raw.length > 10) return raw; }
      }
      if (key.includes('firebase') || key.includes('CognitoIdentityServiceProvider')) {
        const val = localStorage.getItem(key) || '';
        if (val.startsWith('eyJ') && val.length > 20) return val;
      }
    }
  } catch { /* ignore */ }
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
    if (res.status === 401 || res.status === 403) {
      console.warn(`[authFetch] ${res.status} Unauthorized for ${url}`);
      return null;
    }
    return res;
  } catch (e) {
    console.error(`[authFetch] Network error for ${url}:`, e);
    return null;
  }
};

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string }
let _toastId = 0;

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++_toastId;
    setToasts(p => [...p, { id, type, title, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);
  const remove = useCallback((id: number) => setToasts(p => p.filter(t => t.id !== id)), []);
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
      {toasts.map(t => {
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

// ─── Order No Searchable Dropdown ─────────────────────────────────────────────

interface OrderNoDropdownProps {
  value: string;
  onChange: (orderNo: string) => void;
  options: OrderOption[];
  loading: boolean;
  orderType: string;
}

function OrderNoDropdown({ value, onChange, options, loading, orderType }: OrderNoDropdownProps) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef             = useRef<HTMLDivElement>(null);
  const searchRef           = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { if (open && searchRef.current) searchRef.current.focus(); }, [open]);
  useEffect(() => { setSearch(''); }, [options]);

  const filtered = options.filter(o =>
    o.order_no.toLowerCase().includes(search.toLowerCase()) ||
    (o.customer_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (o.sort_no || '').toLowerCase().includes(search.toLowerCase()) ||
    (o.construction || '').toLowerCase().includes(search.toLowerCase())
  );

  const selected = options.find(o => o.order_no === value);

  const handleSelect = (orderNo: string) => { onChange(orderNo); setOpen(false); setSearch(''); };
  const handleClear  = (e: React.MouseEvent) => {
    e.stopPropagation(); onChange(''); setOpen(false); setSearch('');
  };

  return (
    <div className="ond-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`ond-trigger${open ? ' open' : ''}${value ? ' has-value' : ''}`}
        onClick={() => !loading && setOpen(o => !o)}
        disabled={loading}
      >
        <span className="ond-trigger-content">
          {loading ? (
            <span className="ond-loading">
              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', marginRight: 6 }} />
              Loading orders…
            </span>
          ) : value && selected ? (
            <span className="ond-selected-val">
              <span className="ond-order-badge">{selected.order_no}</span>
              {selected.customer_name && <span className="ond-customer-name">{selected.customer_name}</span>}
              {selected.quantity > 0 && (
                <span className="ond-qty-badge">{Number(selected.quantity).toLocaleString('en-IN')} m</span>
              )}
            </span>
          ) : value ? (
            <span className="ond-selected-val"><span className="ond-order-badge">{value}</span></span>
          ) : (
            <span className="ond-placeholder">— Select {orderType} No —</span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {value && !loading && (
            <span onClick={handleClear} style={{ display: 'flex', alignItems: 'center', padding: '0 2px', cursor: 'pointer', color: '#94a3b8' }} title="Clear selection">
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} style={{ color: '#64748b', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
        </span>
      </button>

      {open && (
        <div className="ond-panel">
          <div className="ond-search-wrap">
            <Search size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input
              ref={searchRef} className="ond-search"
              placeholder="Search order no, customer, construction…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex', alignItems: 'center' }}>
                <X size={13} />
              </button>
            )}
          </div>

          <div className="ond-count">
            {filtered.length === 0
              ? <span style={{ color: '#c2410c' }}>No orders match "{search}"</span>
              : <span>{filtered.length} order{filtered.length !== 1 ? 's' : ''}{search ? ' found' : ' available'}</span>}
          </div>

          <div className="ond-list">
            {value && (
              <div className="ond-option ond-clear-opt" onClick={() => handleSelect('')}>— Clear selection —</div>
            )}
            {filtered.length === 0 ? (
              <div className="ond-empty">
                <Search size={28} color="#cbd5e1" />
                <span>No orders found</span>
                {options.length === 0 && !loading && (
                  <span style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>No {orderType}s loaded from server</span>
                )}
              </div>
            ) : (
              filtered.map(o => (
                <div key={o.order_no} className={`ond-option${o.order_no === value ? ' selected' : ''}`} onClick={() => handleSelect(o.order_no)}>
                  <div className="ond-opt-left">
                    <span className="ond-opt-order-no">{o.order_no}</span>
                    {/* ── FIX: use fmtDate() instead of new Date().toLocaleDateString() ── */}
                    {o.order_date && <span className="ond-opt-date">{fmtDate(o.order_date)}</span>}
                  </div>
                  <div className="ond-opt-right">
                    {o.customer_name && <span className="ond-opt-customer">{o.customer_name}</span>}
                    <span className="ond-opt-meta">
                      {o.sort_no && <span>Sort: {o.sort_no}</span>}
                      {o.confirmed_by && (
                        <span style={{ color: '#0f766e', fontWeight: 600 }}>{o.confirmed_by}</span>
                      )}
                      {o.construction && (
                        <span style={{ color: '#7c3aed', fontStyle: 'italic', fontSize: 10.5 }} title="Construction as PO">
                          {o.construction.length > 32 ? o.construction.slice(0, 32) + '…' : o.construction}
                        </span>
                      )}
                      {o.quantity > 0 && (
                        <span style={{ fontFamily: 'DM Mono, monospace', color: '#0f766e', fontWeight: 700 }}>
                          {Number(o.quantity).toLocaleString('en-IN')} m
                        </span>
                      )}
                    </span>
                  </div>
                  {o.order_no === value && <Check size={14} style={{ color: '#0f766e', flexShrink: 0, marginLeft: 4 }} />}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {!open && (
        <div className="ond-status">
          {loading ? (
            <span style={{ color: '#94a3b8' }}>Loading orders…</span>
          ) : value && selected ? (
            <span className="ond-status-ok">
              <Check size={11} style={{ marginRight: 2 }} />
              {selected.order_no} selected
              {selected.customer_name ? ` · ${selected.customer_name}` : ''}
              {selected.confirmed_by ? ` · Confirmed by: ${selected.confirmed_by}` : ''}
            </span>
          ) : options.length > 0 ? (
            <span style={{ color: '#94a3b8' }}>
              <Check size={11} style={{ marginRight: 2 }} />
              {options.length} {orderType}s loaded — click to select
            </span>
          ) : (
            <span style={{ color: '#f59e0b' }}>No {orderType}s found from server</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── NEW: Generic Name Dropdown (used for Vendor + Supplier) ─────────────────
// Same searchable/clearable UX as OrderNoDropdown, but for the simpler
// { id, name, code?, location? } shape returned by vendors/suppliers search.

interface NameDropdownProps {
  value: string;              // selected id (as string) — '' = none selected
  displayName: string;        // the name to show for the selected id (from form state)
  onChange: (id: string, name: string) => void;
  options: NameOption[];
  loading: boolean;
  placeholder: string;        // e.g. "Select Vendor"
  searchPlaceholder: string;  // e.g. "Search vendor name or code…"
  emptyLabel: string;         // e.g. "vendors"
  icon: React.ReactNode;
  accentColor: string;
}

function NameDropdown({
  value, displayName, onChange, options, loading,
  placeholder, searchPlaceholder, emptyLabel, icon, accentColor,
}: NameDropdownProps) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef             = useRef<HTMLDivElement>(null);
  const searchRef           = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { if (open && searchRef.current) searchRef.current.focus(); }, [open]);

  const filtered = options.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    (o.code || '').toLowerCase().includes(search.toLowerCase()) ||
    (o.location || '').toLowerCase().includes(search.toLowerCase())
  );

  const selected = options.find(o => o.id === value);
  const shownName = selected?.name || displayName;

  const handleSelect = (opt: NameOption) => { onChange(opt.id, opt.name); setOpen(false); setSearch(''); };
  const handleClear  = (e: React.MouseEvent) => {
    e.stopPropagation(); onChange('', ''); setOpen(false); setSearch('');
  };

  return (
    <div className="ond-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`ond-trigger${open ? ' open' : ''}${value ? ' has-value' : ''}`}
        onClick={() => !loading && setOpen(o => !o)}
        disabled={loading}
      >
        <span className="ond-trigger-content">
          {loading ? (
            <span className="ond-loading">
              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', marginRight: 6 }} />
              Loading {emptyLabel}…
            </span>
          ) : value && shownName ? (
            <span className="ond-selected-val">
              <span className="ond-order-badge" style={{ background: accentColor }}>{shownName}</span>
              {selected?.code && <span className="ond-customer-name">{selected.code}</span>}
            </span>
          ) : (
            <span className="ond-placeholder">— {placeholder} —</span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {value && !loading && (
            <span onClick={handleClear} style={{ display: 'flex', alignItems: 'center', padding: '0 2px', cursor: 'pointer', color: '#94a3b8' }} title="Clear selection">
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} style={{ color: '#64748b', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
        </span>
      </button>

      {open && (
        <div className="ond-panel">
          <div className="ond-search-wrap">
            <Search size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input
              ref={searchRef} className="ond-search"
              placeholder={searchPlaceholder}
              value={search} onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex', alignItems: 'center' }}>
                <X size={13} />
              </button>
            )}
          </div>

          <div className="ond-count">
            {filtered.length === 0
              ? <span style={{ color: '#c2410c' }}>No {emptyLabel} match "{search}"</span>
              : <span>{filtered.length} {emptyLabel}{search ? ' found' : ' available'}</span>}
          </div>

          <div className="ond-list">
            {value && (
              <div className="ond-option ond-clear-opt" onClick={handleClear}>— Clear selection —</div>
            )}
            {filtered.length === 0 ? (
              <div className="ond-empty">
                <Search size={28} color="#cbd5e1" />
                <span>No {emptyLabel} found</span>
                {options.length === 0 && !loading && (
                  <span style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>No {emptyLabel} loaded from server</span>
                )}
              </div>
            ) : (
              filtered.map(o => (
                <div key={o.id} className={`ond-option${o.id === value ? ' selected' : ''}`} onClick={() => handleSelect(o)}>
                  <div className="ond-opt-left" style={{ minWidth: 60 }}>
                    {icon}
                  </div>
                  <div className="ond-opt-right">
                    <span className="ond-opt-customer">{o.name}</span>
                    <span className="ond-opt-meta">
                      {o.code && <span>Code: {o.code}</span>}
                      {o.location && <span>{o.location}</span>}
                    </span>
                  </div>
                  {o.id === value && <Check size={14} style={{ color: accentColor, flexShrink: 0, marginLeft: 4 }} />}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {!open && (
        <div className="ond-status">
          {loading ? (
            <span style={{ color: '#94a3b8' }}>Loading {emptyLabel}…</span>
          ) : value && shownName ? (
            <span className="ond-status-ok" style={{ color: accentColor }}>
              <Check size={11} style={{ marginRight: 2 }} />
              {shownName} selected
            </span>
          ) : options.length > 0 ? (
            <span style={{ color: '#94a3b8' }}>
              <Check size={11} style={{ marginRight: 2 }} />
              {options.length} {emptyLabel} loaded — click to select
            </span>
          ) : (
            <span style={{ color: '#f59e0b' }}>No {emptyLabel} found from server</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BLANK: ProductionPlan = {
  order_type: 'Customer Order',
  order_no: '', order_date: '', order_sort_no: '',
  customer_name: '',
  confirmed_by: '',
  delivery_address: '',   // ← NEW
  constn_for_production: '', order_quantity: '',
  allocated_qty: '', stock_special_instruction: '',
  production_qty: '', inhouse_prod_qty: '', vendor_prod_qty: '', prod_special_instruction: '',
  vendor_id: '', vendor_name: '',
  purchase_qty: '', purchase_special_instruction: '',
  supplier_id: '', supplier_name: '',
  order_links: [],
};

const BLANK_LINK = (): OrderLink => ({
  linking_date: new Date().toISOString().slice(0, 10),
  co_no: '', co_date: '', customer_name: '', co_sort_no: '',
  co_quantity: '', plan_quantity_allocated: '', _isNew: true,
});

const API            = '/api/production-plans';
const PAGE_SIZE_OPTS = [5, 10, 25, 50];

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

const sanitizePlan = (data: any): ProductionPlan => ({
  ...BLANK,
  ...data,
  order_type:                   data.order_type                   ?? 'Customer Order',
  order_no:                     data.order_no                     ?? '',
  order_date:                   toDateStr(data.order_date),   // fix UTC shift
  rec_date:                     toDateStr(data.rec_date),     // fix UTC shift
  order_sort_no:                data.order_sort_no                ?? '',
  customer_name:                data.customer_name                ?? '',
  confirmed_by:                 data.confirmed_by                 ?? '',
  delivery_address:             data.delivery_address             ?? '',   // ← NEW
  constn_for_production:        data.constn_for_production        ?? '',
  order_quantity:               data.order_quantity  != null ? String(data.order_quantity)  : '',
  allocated_qty:                data.allocated_qty   != null ? String(data.allocated_qty)   : '',
  production_qty:               data.production_qty  != null ? String(data.production_qty)  : '',
  inhouse_prod_qty:             data.inhouse_prod_qty != null ? String(data.inhouse_prod_qty) : '',
  vendor_prod_qty:              data.vendor_prod_qty  != null ? String(data.vendor_prod_qty)  : '',
  vendor_id:                    data.vendor_id   != null ? String(data.vendor_id)   : '',
  vendor_name:                  data.vendor_name ?? '',
  purchase_qty:                 data.purchase_qty     != null ? String(data.purchase_qty)     : '',
  supplier_id:                  data.supplier_id   != null ? String(data.supplier_id)   : '',
  supplier_name:                data.supplier_name ?? '',
  stock_special_instruction:    data.stock_special_instruction    ?? '',
  prod_special_instruction:     data.prod_special_instruction     ?? '',
  purchase_special_instruction: data.purchase_special_instruction ?? '',
  order_links: (data.order_links ?? []).map((lnk: any) => ({
    ...lnk,
    linking_date:            toDateStr(lnk.linking_date) || new Date().toISOString().slice(0, 10),
    co_no:                   lnk.co_no                   ?? '',
    co_date:                 toDateStr(lnk.co_date),       // fix UTC shift
    customer_name:           lnk.customer_name           ?? '',
    co_sort_no:              lnk.co_sort_no              ?? '',
    co_quantity:             lnk.co_quantity  != null ? String(lnk.co_quantity)             : '',
    plan_quantity_allocated: lnk.plan_quantity_allocated != null ? String(lnk.plan_quantity_allocated) : '',
  })),
});

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={s.label}>{label}{required && <span style={{ color: '#ef4444' }}> *</span>}</label>
      {children}
      {hint && <p style={{ margin: '3px 0 0', fontSize: 11, color: '#94a3b8' }}>{hint}</p>}
    </div>
  );
}

function SectionHead({ title, open, onToggle, accent }: { title: string; open: boolean; onToggle: () => void; accent?: string }) {
  return (
    <div style={{ ...s.sectionHead, borderLeft: `4px solid ${accent ?? '#7c3aed'}` }} onClick={onToggle}>
      <span style={s.sectionTitle}>{title}</span>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </div>
  );
}

function DisplayField({
  label, value, accent, loading,
}: {
  label: string;
  value?: string | number | null;
  accent?: boolean;
  loading?: boolean;
}) {
  return (
    <div>
      <label style={s.label}>{label}</label>
      <div style={{
        ...s.input,
        background: loading ? '#f8fafc' : (accent && value ? '#f0fdf4' : '#f8fafc'),
        color:      loading ? '#94a3b8' : (accent && value ? '#166534' : '#475569'),
        fontWeight: loading ? 400 : (accent && value ? 700 : 400),
        cursor: 'not-allowed',
        display: 'flex',
        alignItems: 'center',
        minHeight: 38,
        gap: 6,
        opacity: loading ? 0.75 : 1,
        transition: 'opacity 0.2s',
      }}>
        {loading ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94a3b8', fontSize: 12 }}>
            <Loader2 size={11} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
            Fetching…
          </span>
        ) : (value ?? <span style={{ color: '#cbd5e1' }}>—</span>)}
      </div>
    </div>
  );
}

// ── NEW: multi-line read-only display, used for Delivery Address ─────────────
function AddressDisplayField({
  label, value, loading, hint,
}: {
  label: string;
  value?: string | null;
  loading?: boolean;
  hint?: string;
}) {
  const hasValue = !!(value && value.trim());
  return (
    <div>
      <label style={s.label}>
        {label} <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#94a3b8' }}>(from order)</span>
      </label>
      <div style={{
        ...s.input,
        minHeight: 92,
        background: loading ? '#f8fafc' : (hasValue ? '#f0fdf4' : '#f8fafc'),
        color:      loading ? '#94a3b8' : (hasValue ? '#166534' : '#9ca3af'),
        fontWeight: hasValue && !loading ? 600 : 400,
        cursor: 'not-allowed',
        display: 'flex',
        alignItems: loading || !hasValue ? 'center' : 'flex-start',
        gap: 6,
        whiteSpace: 'pre-line',
        lineHeight: 1.6,
        opacity: loading ? 0.75 : 1,
        transition: 'opacity 0.2s',
      }}>
        {loading ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94a3b8', fontSize: 12 }}>
            <Loader2 size={11} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
            Fetching…
          </span>
        ) : hasValue ? (
          <span style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <MapPin size={14} style={{ color: '#0f766e', flexShrink: 0, marginTop: 2 }} />
            <span>{value}</span>
          </span>
        ) : (
          <span style={{ color: '#cbd5e1' }}>— auto-filled from order —</span>
        )}
      </div>
      {hint && <p style={{ margin: '3px 0 0', fontSize: 11, color: '#94a3b8' }}>{hint}</p>}
    </div>
  );
}

function ComputedBadge({ label, value, color }: { label: string; value?: number | null; color: string }) {
  return (
    <div style={{ background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 10, padding: '10px 14px', textAlign: 'center', minWidth: 110 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color, fontFamily: "'DM Mono', monospace" }}>
        {value != null ? value.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—'}
      </div>
    </div>
  );
}

const parseOrderItems = (raw: any): Array<{ construction_po: string; meter: number }> => {
  let arr: any[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string') {
    const t = raw.trim();
    if (t && t !== 'null' && t !== '[]') {
      try { arr = JSON.parse(t); } catch { arr = []; }
    }
  }
  return arr
    .filter((i: any) => i && typeof i === 'object')
    .map((i: any) => ({
      construction_po: String(i.construction_po || i.constructionPo || i.construction || '').trim(),
      meter: Number(i.meter || i.meters || i.quantity || 0),
    }));
};

// ── NEW: normalise vendor/supplier search API rows into NameOption[] ─────────
const mapNameOptions = (raw: any[], nameKey: string, codeKey: string): NameOption[] =>
  (raw || [])
    .map((o: any) => ({
      id:       String(o.id ?? ''),
      name:     String(o[nameKey] ?? '').trim(),
      code:     o[codeKey] ? String(o[codeKey]) : undefined,
      location: o.location ? String(o.location) : undefined,
    }))
    .filter(o => o.id && o.name);

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ProductionPlanningMaster() {
  const [plans, setPlans]           = useState<ProductionPlan[]>([]);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState('');
  const [filterType, setFilterType] = useState('');
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(10);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState<ProductionPlan>(BLANK);
  const [editId, setEditId]         = useState<number | null>(null);
  const [error, setError]           = useState('');
  const [deletedLinkIds, setDeletedLinkIds] = useState<number[]>([]);

  const [allOrderOptions, setAllOrderOptions]   = useState<OrderOption[]>([]);
  const [loadingOrderOpts, setLoadingOrderOpts] = useState(false);

  const [coOptions, setCoOptions]     = useState<OrderOption[]>([]);
  const [coSearchIdx, setCoSearchIdx] = useState<number | null>(null);
  const [coSearchQ, setCoSearchQ]     = useState('');
  const [showCoDD, setShowCoDD]       = useState(false);
  const [loadingCo, setLoadingCo]     = useState(false);

  const [loadingOrderDetail, setLoadingOrderDetail] = useState(false);
  const [loadingConfirmedBy, setLoadingConfirmedBy] = useState(false);

  // ── NEW: Vendor (By Production) + Supplier (By Purchase) dropdown state ───
  const [vendorOptions, setVendorOptions]     = useState<NameOption[]>([]);
  const [loadingVendors, setLoadingVendors]   = useState(false);
  const [supplierOptions, setSupplierOptions] = useState<NameOption[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  // ── Export / Print menu state ─────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting]   = useState(false);

  const [sec, setSec] = useState({ header: true, planning: true, stock: true, prod: true, purchase: true, linking: false });

  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const coDDRef   = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const width     = useWidth();
  const isMobile  = width < 576;

  // ── Load list ──────────────────────────────────────────────────────────────
  const loadPlans = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        search, page: String(page), limit: String(pageSize),
        ...(filterType ? { order_type: filterType } : {}),
      });
      const res = await authFetch(`${API}?${qs}`);
      if (!res) { pushToast('error', 'Unauthorized', 'Session expired. Please log in again.'); setLoading(false); return; }
      const data = await res.json();
      setPlans(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch { pushToast('error', 'Load Failed', 'Could not fetch production plans.'); }
    setLoading(false);
  };

  useEffect(() => { loadPlans(); }, [search, filterType, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, filterType]);
  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showForm]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (coDDRef.current && !coDDRef.current.contains(e.target as Node)) setShowCoDD(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── close Export/Print menu on outside click ──────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Fetch order options (dropdown list) ───────────────────────────────────
  const fetchOrderOptions = async (type: string) => {
    setLoadingOrderOpts(true);
    setAllOrderOptions([]);
    try {
      const res = await authFetch(`/api/order-bookings?limit=500`);
      if (!res) {
        pushToast('error', 'Unauthorized', 'Could not load orders — please log in again.');
        setLoadingOrderOpts(false);
        return;
      }
      const data = await res.json();
      const raw: any[] = data.data || data || [];

      const mapped: OrderOption[] = raw
        .filter((o: any) => {
          if (type === 'Customer Order') return !!o.customer_name;
          if (type === 'Open Order')     return !o.customer_name;
          return true;
        })
        .map((o: any) => {
          const items = parseOrderItems(o.items);
          const constructionFromItems = items.find((i: any) => i.construction_po)?.construction_po || '';
          const constructionFallback  = String(
            o.constn_as_po || o.constn_for_production ||
            o.construction || o.fabric_construction   || ''
          ).trim();
          const construction = constructionFromItems || constructionFallback;

          const directQty = Number(
            o.order_quantity ?? o.total_meters ?? o.meter ?? o.meters ?? 0
          );
          const itemsQty  = items.reduce((sum: number, i: any) => sum + i.meter, 0);
          const quantity  = directQty > 0 ? directQty : itemsQty;

          const confirmedBy = String(
            o.confirm_by || o.confirmed_by || o.confirmedBy || o.confirmBy || ''
          ).trim();

          return {
            order_no:      String(o.order_code || o.order_no || ''),
            // toDateStr handles ISO "2026-06-11T18:30:00.000Z" → "2026-06-12" correctly
            order_date:    toDateStr(o.order_date),
            sort_no:       String(o.sort_no || ''),
            quantity,
            customer_name: String(o.customer_name || ''),
            construction,
            confirmed_by:  confirmedBy || undefined,
          };
        })
        .filter((o: OrderOption) => o.order_no.length > 0);

      console.log('[fetchOrderOptions] sample:', mapped.slice(0, 3));
      setAllOrderOptions(mapped);
    } catch {
      pushToast('error', 'Load Failed', 'Could not fetch order list.');
    }
    setLoadingOrderOpts(false);
  };

  // ── NEW: Fetch vendor options for "By Production" dropdown ───────────────
  const fetchVendorOptions = async () => {
    setLoadingVendors(true);
    try {
      const res = await authFetch(`${API}/vendors/search?q=`);
      if (!res) { setLoadingVendors(false); return; }
      const data = await res.json();
      setVendorOptions(mapNameOptions(data ?? [], 'vendor_name', 'vendor_code'));
    } catch {
      pushToast('error', 'Load Failed', 'Could not fetch vendor list.');
    }
    setLoadingVendors(false);
  };

  // ── NEW: Fetch supplier options for "By Purchase" dropdown ───────────────
  const fetchSupplierOptions = async () => {
    setLoadingSuppliers(true);
    try {
      const res = await authFetch(`${API}/suppliers/search?q=`);
      if (!res) { setLoadingSuppliers(false); return; }
      const data = await res.json();
      setSupplierOptions(mapNameOptions(data ?? [], 'supplier_name', 'supplier_code'));
    } catch {
      pushToast('error', 'Load Failed', 'Could not fetch supplier list.');
    }
    setLoadingSuppliers(false);
  };

  // ── fetchOrderDetail ───────────────────────────────────────────────────────
  // NEW: also picks up `delivery_address` (pre-formatted text block) from the
  // same order-detail response and writes it onto the form, same as the
  // other order-derived fields.
  const fetchOrderDetail = async (orderNo: string) => {
    if (!orderNo) return;
    setLoadingOrderDetail(true);
    try {
      const res = await authFetch(`${API}/order/${encodeURIComponent(orderNo)}`);
      if (!res) { setLoadingOrderDetail(false); return; }
      if (!res.ok) { setLoadingOrderDetail(false); return; }
      const co = await res.json();
      if (!co) { setLoadingOrderDetail(false); return; }

      console.log('[fetchOrderDetail] Response for', orderNo, '→', {
        order_date:       co.order_date,
        order_sort_no:    co.order_sort_no,
        customer_name:    co.customer_name,
        confirmed_by:     co.confirmed_by,
        order_quantity:   co.order_quantity,
        constn_as_po:     co.constn_as_po,
        delivery_address: co.delivery_address,
      });

      setForm(f => ({
        ...f,
        // toDateStr handles ISO "2026-06-11T18:30:00.000Z" → "2026-06-12" via local getters
        order_date: co.order_date ? toDateStr(co.order_date) : f.order_date,
        order_sort_no:  co.order_sort_no  != null ? String(co.order_sort_no)  : f.order_sort_no,
        customer_name:  co.customer_name  != null ? String(co.customer_name)  : f.customer_name,
        confirmed_by:   co.confirmed_by   != null ? String(co.confirmed_by)   : f.confirmed_by,
        // ← NEW: delivery_address comes back as a ready-to-display multi-line block
        delivery_address: co.delivery_address != null ? String(co.delivery_address) : f.delivery_address,
        order_quantity: (() => {
          const qty = co.order_quantity ?? co.total_meters ?? co.meter ?? co.meters;
          return qty != null && Number(qty) > 0 ? String(qty) : f.order_quantity;
        })(),
        constn_for_production: co.constn_as_po || co.constn_for_production || f.constn_for_production,
      }));
    } catch (err) {
      console.error('[fetchOrderDetail] Unexpected error for', orderNo, ':', err);
    } finally {
      setLoadingOrderDetail(false);
    }
  };

  // ── fetchConfirmedBy ──────────────────────────────────────────────────────
  const fetchConfirmedBy = async (orderNo: string) => {
    if (!orderNo) return;
    setLoadingConfirmedBy(true);
    try {
      const res = await authFetch(`${API}/order/${encodeURIComponent(orderNo)}`);
      if (!res) return;
      if (!res.ok) return;
      const co = await res.json();
      if (!co) return;
      setForm(f => ({
        ...f,
        confirmed_by: co.confirmed_by != null ? String(co.confirmed_by) : f.confirmed_by,
      }));
    } catch (err) {
      console.error('[fetchConfirmedBy] Unexpected error for', orderNo, ':', err);
    } finally {
      setLoadingConfirmedBy(false);
    }
  };

  // ── Select order no — autofill all fields ─────────────────────────────────
  // NEW: delivery_address is cleared immediately on selection (it isn't part
  // of the lightweight order-list options), then filled in a moment later by
  // fetchOrderDetail() below — same pattern as order_date/confirmed_by.
  const selectOrderNo = (orderNo: string) => {
    if (!orderNo) {
      setForm(prev => ({
        ...prev,
        order_no: '', order_date: '', order_sort_no: '',
        order_quantity: '', constn_for_production: '',
        customer_name: '', confirmed_by: '', delivery_address: '',
      }));
      return;
    }

    const found = allOrderOptions.find(o => o.order_no === orderNo);
    setForm(prev => ({
      ...prev,
      order_no:              orderNo,
      // Store raw YYYY-MM-DD string from the found option
      order_date:            found?.order_date                                    ?? prev.order_date,
      order_sort_no:         found?.sort_no                                       ?? prev.order_sort_no,
      order_quantity:        found && found.quantity > 0 ? String(found.quantity) : prev.order_quantity,
      constn_for_production: found?.construction || found?.sort_no               || prev.constn_for_production,
      customer_name:         found?.customer_name                                ?? prev.customer_name,
      confirmed_by:          found?.confirmed_by                                 ?? prev.confirmed_by,
      delivery_address:      '',   // ← NEW: cleared until fetchOrderDetail resolves
    }));

    fetchOrderDetail(orderNo);
  };

  // ── CO search for order linking ────────────────────────────────────────────
  const searchCO = async (q: string, idx: number) => {
    setCoSearchQ(q); setCoSearchIdx(idx);
    if (!q.trim()) { setCoOptions([]); return; }
    setLoadingCo(true);
    try {
      const res = await authFetch(`${API}/co/search?q=${encodeURIComponent(q)}`);
      if (!res) { setLoadingCo(false); return; }
      const data = await res.json();
      setCoOptions(data ?? []);
      setShowCoDD(true);
    } catch { /* ignore */ }
    setLoadingCo(false);
  };

  const selectCO = (opt: OrderOption, idx: number) => {
    setShowCoDD(false); setCoSearchQ(''); setCoSearchIdx(null);
    setForm(prev => {
      const links = [...prev.order_links];
      links[idx] = {
        ...links[idx],
        co_no:                   opt.order_no,
        co_date:                 opt.order_date ?? '',
        customer_name:           opt.customer_name ?? '',
        co_sort_no:              opt.sort_no ?? '',
        co_quantity:             String(opt.quantity ?? ''),
        plan_quantity_allocated: String(opt.quantity ?? ''),
      };
      return { ...prev, order_links: links };
    });
  };

  // ── NEW: select vendor for "By Production" ────────────────────────────────
  const selectVendor = (id: string, name: string) => {
    setForm(prev => ({ ...prev, vendor_id: id, vendor_name: name }));
  };

  // ── NEW: select supplier for "By Purchase" ────────────────────────────────
  const selectSupplier = (id: string, name: string) => {
    setForm(prev => ({ ...prev, supplier_id: id, supplier_name: name }));
  };

  // ── Open form ──────────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm(BLANK); setEditId(null); setError('');
    setDeletedLinkIds([]);
    fetchOrderOptions('Customer Order');
    fetchVendorOptions();     // ← NEW
    fetchSupplierOptions();  // ← NEW
    setShowForm(true);
  };

  const openEdit = async (id: number) => {
    try {
      const res = await authFetch(`${API}/${id}`);
      if (!res) { pushToast('error', 'Unauthorized', 'Session expired. Please log in again.'); return; }
      const data = await res.json();
      setForm(sanitizePlan(data));
      setEditId(id); setError(''); setDeletedLinkIds([]);
      fetchOrderOptions(data.order_type ?? 'Customer Order');
      fetchVendorOptions();     // ← NEW
      fetchSupplierOptions();  // ← NEW
      if (data.order_no) fetchConfirmedBy(data.order_no);
      setShowForm(true);
    } catch { pushToast('error', 'Load Failed', 'Could not load plan details.'); }
  };

  // ── Computed values ────────────────────────────────────────────────────────
  const allocQty   = Number(form.allocated_qty)   || 0;
  const prodQty    = Number(form.production_qty)   || 0;
  const purQty     = Number(form.purchase_qty)     || 0;
  const orderQty   = Number(form.order_quantity)   || 0;
  const totalPlan  = allocQty + prodQty + purQty;
  const balanceQty = Math.max(orderQty - totalPlan, 0);

  const stockTotal = form.stock_total_qty    ?? 0;
  const stockRes   = form.stock_reserved_qty ?? 0;
  const stockAvail = stockTotal - stockRes;
  const stockBal   = Math.max(stockAvail - allocQty, 0);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.order_type.trim()) { setError('Order Type is required'); return; }
    if (!form.order_no.trim())   { setError('Order No is required');   return; }
    setError(''); setSaving(true);
    const body = {
      order_type:                   form.order_type,
      order_no:                     form.order_no,
      order_date:                   form.order_date,
      order_sort_no:                form.order_sort_no,
      customer_name:                form.customer_name ?? '',
      confirmed_by:                 form.confirmed_by ?? '',
      delivery_address:             form.delivery_address ?? '',   // ← NEW
      constn_for_production:        form.constn_for_production,
      order_quantity:               form.order_quantity,
      allocated_qty:                form.allocated_qty,
      stock_special_instruction:    form.stock_special_instruction,
      production_qty:               form.production_qty,
      inhouse_prod_qty:             form.inhouse_prod_qty,
      vendor_prod_qty:              form.vendor_prod_qty,
      prod_special_instruction:     form.prod_special_instruction,
      vendor_id:                    form.vendor_id || null,        // ← NEW
      vendor_name:                  form.vendor_name ?? '',        // ← NEW
      purchase_qty:                 form.purchase_qty,
      purchase_special_instruction: form.purchase_special_instruction,
      supplier_id:                  form.supplier_id || null,      // ← NEW
      supplier_name:                form.supplier_name ?? '',      // ← NEW
      order_links:                  JSON.stringify(form.order_links),
      deleted_link_ids:             JSON.stringify(deletedLinkIds),
    };
    try {
      const url    = editId ? `${API}/${editId}` : API;
      const method = editId ? 'PUT' : 'POST';
      const res    = await authFetch(url, { method, body: JSON.stringify(body) });
      if (!res) {
        const msg = 'Authentication failed. Please log in again.';
        setError(msg); pushToast('error', 'Unauthorized', msg);
        setSaving(false); return;
      }
      if (!res.ok) throw new Error(await res.text());
      pushToast('success', editId ? 'Plan Updated' : 'Plan Created', `Production plan has been ${editId ? 'updated' : 'saved'} successfully.`);
      setShowForm(false); loadPlans();
    } catch (e: any) {
      const msg = e.message ?? 'Save failed';
      setError(msg); pushToast('error', 'Save Failed', msg);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this production plan?')) return;
    try {
      const res = await authFetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res) { pushToast('error', 'Unauthorized', 'Session expired. Please log in again.'); return; }
      pushToast('success', 'Plan Deleted', 'The production plan has been removed.');
      loadPlans();
    } catch { pushToast('error', 'Delete Failed', 'Could not delete plan.'); }
  };

  // ── Export / Print helpers ─────────────────────────────────────────────────
  // Pulls ALL records matching the current search/filter (not just the visible
  // page) so exports stay complete regardless of the page-size setting.
  const fetchAllPlansForExport = async (): Promise<any[]> => {
    try {
      const qs = new URLSearchParams({
        search, page: '1', limit: '10000',
        ...(filterType ? { order_type: filterType } : {}),
      });
      const res = await authFetch(`${API}?${qs}`);
      if (!res) { pushToast('error', 'Unauthorized', 'Session expired. Please log in again.'); return []; }
      const data = await res.json();
      return data.data ?? [];
    } catch {
      pushToast('error', 'Export Failed', 'Could not fetch plans to export.');
      return [];
    }
  };

  const buildExportRows = (data: any[]) => data.map((p: any, i: number) => {
    const tpl = (Number(p.allocated_qty) || 0) + (Number(p.production_qty) || 0) + (Number(p.purchase_qty) || 0);
    const bal = Math.max((Number(p.order_quantity) || 0) - tpl, 0);
    return {
      '#':              i + 1,
      'Rec No':         p.rec_no ?? '',
      'Rec Date':       fmtDate(p.rec_date),
      'Type':           p.order_type === 'Open Order' ? 'Open' : 'CO',
      'Order No':       p.order_no ?? '',
      'Customer':       p.customer_name ?? '',
      'Confirmed By':   p.confirmed_by ?? '',
      'Delivery Address': (p.delivery_address ?? '').replace(/\n/g, ' | '),  // ← NEW (flattened for CSV/Excel row)
      'Construction':   p.constn_for_production ?? '',
      'Order Qty':      p.order_quantity ?? '',
      'Vendor':         p.vendor_name ?? '',       // ← NEW
      'Supplier':       p.supplier_name ?? '',     // ← NEW
      'Total Planned':  tpl || '',
      'Balance':        bal,
    };
  });

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
    const data = await fetchAllPlansForExport();
    if (!data.length) {
      pushToast('warning', 'Nothing to Export', 'No production plans match the current filters.');
      setExporting(false); return;
    }
    const rows    = buildExportRows(data);
    const headers = Object.keys(rows[0]);
    const lines   = [
      headers.join(','),
      ...rows.map(r => headers.map(h => escapeCsv((r as any)[h])).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `production-plans-${new Date().toISOString().slice(0, 10)}.csv`);
    pushToast('success', 'Exported', `${rows.length} plan(s) exported as CSV.`);
    setExporting(false);
  };

  const handleExportExcel = async () => {
    setExportOpen(false);
    setExporting(true);
    const data = await fetchAllPlansForExport();
    if (!data.length) {
      pushToast('warning', 'Nothing to Export', 'No production plans match the current filters.');
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
    downloadBlob(blob, `production-plans-${new Date().toISOString().slice(0, 10)}.xls`);
    pushToast('success', 'Exported', `${rows.length} plan(s) exported as Excel.`);
    setExporting(false);
  };

  const handlePrintTable = async () => {
    setExportOpen(false);
    setExporting(true);
    const data = await fetchAllPlansForExport();
    if (!data.length) {
      pushToast('warning', 'Nothing to Print', 'No production plans match the current filters.');
      setExporting(false); return;
    }
    const rows    = buildExportRows(data);
    const headers = Object.keys(rows[0]);
    const win = window.open('', '_blank', 'width=1000,height=700');
    if (!win) {
      pushToast('error', 'Print Failed', 'Could not open print window. Please allow popups for this site.');
      setExporting(false); return;
    }
    win.document.write(`
      <html>
        <head>
          <title>Production Plans</title>
          <style>
            body { font-family: 'DM Sans', Arial, sans-serif; padding: 24px; color:#1e293b; }
            h2 { margin: 0 0 4px; }
            p { margin: 0 0 16px; color:#64748b; font-size:12px; }
            table { width:100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
            th { background:#0f766e; color:#fff; }
            tr:nth-child(even) td { background:#f0fdfa; }
          </style>
        </head>
        <body>
          <h2>Production Plans</h2>
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

  // ── Form helpers ───────────────────────────────────────────────────────────
  const set = (key: keyof ProductionPlan, val: any) => setForm(f => ({ ...f, [key]: val }));

  const addLink    = () => setForm(prev => ({ ...prev, order_links: [...prev.order_links, BLANK_LINK()] }));
  const removeLink = (i: number) => {
    setForm(prev => {
      const lnk = prev.order_links[i];
      if (lnk.id) setDeletedLinkIds(d => [...d, lnk.id!]);
      return { ...prev, order_links: prev.order_links.filter((_, j) => j !== i) };
    });
  };
  const setLink = (i: number, key: keyof OrderLink, val: string) => {
    setForm(prev => {
      const links = [...prev.order_links];
      links[i] = { ...links[i], [key]: val };
      return { ...prev, order_links: links };
    });
  };

  const toggle = (k: keyof typeof sec) => setSec(p => ({ ...p, [k]: !p[k] }));

  // ── Pagination ─────────────────────────────────────────────────────────────
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

  const isOpenOrder = form.order_type === 'Open Order';
  const anyDetailLoading = loadingOrderDetail || loadingConfirmedBy;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes toastIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes ddSlide { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }

        .pp-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }
        .pp-page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
        .pp-page-header h1 { margin:0; font-size:20px; font-weight:700; color:#1e293b; }
        .pp-page-header p  { margin:3px 0 0; font-size:13px; color:#64748b; }
        @media(min-width:576px){ .pp-page-header h1 { font-size:22px; } }
        .pp-header-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end; }
        .pp-add-btn { display:flex; align-items:center; gap:6px; background:#0f766e; color:#fff; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(15,118,110,0.3); white-space:nowrap; flex-shrink:0; touch-action:manipulation; }
        .pp-add-btn:hover { background:#0d6b63; }
        .pp-export-wrap { position:relative; flex-shrink:0; }
        .pp-export-trigger { display:flex; align-items:center; gap:6px; background:#fff; color:#0f766e; border:1px solid #cbd5e1; border-radius:8px; padding:9px 14px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; white-space:nowrap; touch-action:manipulation; transition:border-color 0.15s, box-shadow 0.15s, background 0.15s; }
        .pp-export-trigger:hover:not(:disabled) { border-color:#0f766e; background:#f0fdfa; }
        .pp-export-trigger.open { border-color:#0f766e; box-shadow:0 0 0 3px rgba(15,118,110,0.12); }
        .pp-export-trigger:disabled { opacity:0.6; cursor:not-allowed; }
        .pp-export-panel { position:absolute; top:calc(100% + 6px); right:0; min-width:200px; background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.14); z-index:300; padding:6px; animation:ddSlide 0.15s ease; }
        .pp-export-panel-label { font-size:10.5px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.06em; padding:6px 10px 4px; }
        .pp-export-item { display:flex; align-items:center; gap:9px; width:100%; background:none; border:none; padding:9px 10px; border-radius:7px; font-size:13px; font-weight:500; color:#1e293b; cursor:pointer; font-family:'DM Sans',sans-serif; text-align:left; touch-action:manipulation; }
        .pp-export-item:hover { background:#f0fdfa; }
        .pp-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .pp-search-wrap { position:relative; flex:1; min-width:180px; max-width:100%; }
        @media(min-width:768px){ .pp-search-wrap { max-width:340px; } }
        .pp-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .pp-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; outline:none; }
        .pp-search:focus { border-color:#0f766e; }
        .pp-filter-sel { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#374151; cursor:pointer; outline:none; }
        .pp-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; flex-shrink:0; }
        .pp-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; }
        .pp-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:24px; }
        .pp-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .pp-table { width:100%; border-collapse:collapse; font-size:13px; font-family:'DM Sans',sans-serif; min-width:560px; }
        .pp-table thead tr { background:#0f766e; }
        .pp-table th { padding:11px 12px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:12px; }
        @media(min-width:768px){ .pp-table th { font-size:13px; padding:12px 16px; } }
        .pp-table th.th-c { text-align:center; }
        .pp-table tbody tr:nth-child(odd)  td { background:#fff; }
        .pp-table tbody tr:nth-child(even) td { background:#f0fdfa; }
        .pp-table tbody tr:hover td { filter:brightness(0.97); }
        .pp-table td { padding:10px 12px; color:#374151; font-size:12px; white-space:nowrap; }
        @media(min-width:768px){ .pp-table td { font-size:13px; padding:11px 16px; } }
        .pp-rec-id { display:inline-block; font-family:'DM Mono',monospace; font-size:11px; font-weight:500; color:#0f766e; background:#f0fdfa; border:1px solid #99f6e4; border-radius:6px; padding:2px 7px; letter-spacing:0.03em; }
        .pp-chip { display:inline-block; padding:2px 9px; border-radius:20px; font-size:11px; font-weight:600; }
        .pp-chip-co   { background:#dbeafe; color:#1e40af; }
        .pp-chip-open { background:#fef9c3; color:#854d0e; }
        .pp-action-group { display:flex; align-items:center; gap:5px; justify-content:center; }
        .pp-btn-edit { display:inline-flex; align-items:center; gap:3px; background:#f0fdfa; color:#0f766e; border:1px solid #99f6e4; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; touch-action:manipulation; }
        .pp-btn-edit:hover { background:#ccfbf1; }
        .pp-btn-del  { display:inline-flex; align-items:center; gap:3px; background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; touch-action:manipulation; }
        .pp-btn-del:hover { background:#fee2e2; }
        .pp-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }
        .pp-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; font-family:'DM Sans',sans-serif; }
        @media(min-width:576px){ .pp-pagination { padding:10px 16px; font-size:13px; } }
        .pp-pag-btns { display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
        .pp-pag-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; font-family:'DM Sans',sans-serif; color:#1e293b; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; touch-action:manipulation; }
        .pp-pag-btn:hover:not(:disabled){ background:#f1f5f9; }
        .pp-pag-btn.active { background:#0f766e; color:#fff; border-color:#0f766e; font-weight:700; }
        .pp-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }
        .pp-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.55); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:16px 8px; -webkit-overflow-scrolling:touch; }
        @media(min-width:576px){ .pp-modal-overlay { padding:24px 16px; } }
        .pp-modal { background:#fff; border-radius:14px; width:100%; max-width:960px; box-shadow:0 8px 40px rgba(0,0,0,0.22); display:flex; flex-direction:column; max-height:calc(100vh - 32px); }
        @media(min-width:576px){ .pp-modal { border-radius:16px; max-height:calc(100vh - 48px); } }
        .pp-modal-header { display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:#0f766e; border-radius:14px 14px 0 0; flex-shrink:0; }
        @media(min-width:576px){ .pp-modal-header { padding:16px 24px; border-radius:16px 16px 0 0; } }
        .pp-modal-body { padding:16px; overflow-y:auto; flex:1; -webkit-overflow-scrolling:touch; }
        @media(min-width:576px){ .pp-modal-body { padding:20px 24px; } }
        .pp-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 14px 14px; }
        @media(min-width:576px){ .pp-modal-footer { padding:14px 24px; border-radius:0 0 16px 16px; } }
        .pp-grid { display:grid; grid-template-columns:1fr; gap:12px; padding:12px 0; }
        @media(min-width:480px){ .pp-grid { grid-template-columns:repeat(2,1fr); gap:14px; } }
        @media(min-width:768px){ .pp-grid { grid-template-columns:repeat(3,1fr); gap:14px 16px; } }
        .pp-grid-2 { display:grid; grid-template-columns:1fr; gap:12px; padding:12px 0; }
        @media(min-width:480px){ .pp-grid-2 { grid-template-columns:repeat(2,1fr); gap:14px; } }
        .pp-col-full { grid-column:1/-1; }
        .pp-btn-cancel { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; font-family:'DM Sans',sans-serif; touch-action:manipulation; }
        .pp-btn-save { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#0f766e; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(15,118,110,0.3); touch-action:manipulation; }
        .pp-btn-save:disabled { opacity:0.7; cursor:not-allowed; }
        .pp-plan-sub { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-top:8px; }
        .pp-stock-row { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:14px; }
        .pp-add-link-btn { display:flex; align-items:center; gap:6px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:8px; padding:7px 14px; font-size:12px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; margin-top:14px; touch-action:manipulation; }
        .pp-add-link-btn:hover { background:#dbeafe; }
        .pp-dropdown { position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #cbd5e1; border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.14); z-index:200; max-height:200px; overflow-y:auto; }
        .pp-dd-item { padding:10px 14px; cursor:pointer; font-size:13px; border-bottom:1px solid #f1f5f9; }
        .pp-dd-item:hover { background:#f0fdfa; }
        .pp-dd-item:last-child { border-bottom:none; }

        .pp-fetch-banner { grid-column:1/-1; display:flex; align-items:center; gap:7px; font-size:12px; color:#0f766e; background:#f0fdf4; border:1px solid #99f6e4; border-radius:8px; padding:6px 12px; margin-top:-4px; }
        .pp-confirmed-wrap { position:relative; }

        /* Order No Dropdown (also used by Vendor / Supplier NameDropdown) */
        .ond-wrap { position:relative; }
        .ond-trigger { width:100%; display:flex; align-items:center; justify-content:space-between; padding:0 10px 0 12px; height:40px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#1e293b; font-size:13px; font-family:'DM Sans',sans-serif; cursor:pointer; outline:none; text-align:left; transition:border-color 0.15s, box-shadow 0.15s; }
        .ond-trigger:hover:not(:disabled) { border-color:#0f766e; }
        .ond-trigger.open { border-color:#0f766e; border-bottom-left-radius:0; border-bottom-right-radius:0; box-shadow:0 0 0 3px rgba(15,118,110,0.12); }
        .ond-trigger.has-value { border-color:#6ee7b7; background:#f0fdf4; }
        .ond-trigger:disabled { background:#f8fafc; color:#94a3b8; cursor:not-allowed; }
        .ond-trigger-content { flex:1; overflow:hidden; min-width:0; }
        .ond-loading { color:#94a3b8; font-size:12.5px; display:flex; align-items:center; }
        .ond-placeholder { color:#9ca3af; }
        .ond-selected-val { display:flex; align-items:center; gap:8px; overflow:hidden; }
        .ond-order-badge { background:#0f766e; color:#fff; border-radius:5px; padding:1px 8px; font-size:12px; font-weight:700; font-family:'DM Mono',monospace; white-space:nowrap; flex-shrink:0; }
        .ond-customer-name { font-size:12px; color:#374151; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .ond-qty-badge { font-size:11px; font-family:'DM Mono',monospace; font-weight:700; color:#0f766e; background:#f0fdfa; border:1px solid #99f6e4; border-radius:4px; padding:1px 6px; white-space:nowrap; flex-shrink:0; }
        .ond-panel { position:absolute; top:100%; left:0; right:0; z-index:300; background:#fff; border:1px solid #0f766e; border-top:none; border-bottom-left-radius:8px; border-bottom-right-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.14); animation:ddSlide 0.15s ease; }
        .ond-search-wrap { display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid #e8edf4; background:#f8fffe; }
        .ond-search { flex:1; border:none; outline:none; font-size:12.5px; font-family:'DM Sans',sans-serif; color:#1e293b; background:transparent; }
        .ond-search::placeholder { color:#94a3b8; }
        .ond-count { padding:4px 12px; font-size:11px; color:#94a3b8; font-weight:600; border-bottom:1px solid #f1f5f9; background:#f8fffe; }
        .ond-list { max-height:220px; overflow-y:auto; }
        .ond-list::-webkit-scrollbar { width:4px; }
        .ond-list::-webkit-scrollbar-thumb { background:#6ee7b7; border-radius:2px; }
        .ond-option { display:flex; align-items:flex-start; gap:10px; padding:9px 12px; cursor:pointer; border-bottom:1px solid #f8fafc; transition:background 0.1s; }
        .ond-option:last-child { border-bottom:none; }
        .ond-option:hover { background:#f0fdfa; }
        .ond-option.selected { background:#ecfdf5; }
        .ond-option.ond-clear-opt { color:#64748b; font-size:12px; font-style:italic; border-bottom:1px solid #e8edf4; }
        .ond-option.ond-clear-opt:hover { background:#f8fafc; }
        .ond-opt-left { display:flex; flex-direction:column; gap:3px; align-items:flex-start; flex-shrink:0; min-width:90px; }
        .ond-opt-order-no { font-family:'DM Mono',monospace; font-size:13px; font-weight:800; color:#0f766e; background:#f0fdfa; border:1px solid #6ee7b7; border-radius:5px; padding:2px 8px; white-space:nowrap; }
        .ond-option.selected .ond-opt-order-no { background:#0f766e; color:#fff; border-color:#0f766e; }
        .ond-opt-date { font-size:10.5px; color:#94a3b8; }
        .ond-opt-right { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
        .ond-opt-customer { font-size:12.5px; color:#1e293b; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .ond-opt-meta { display:flex; gap:10px; align-items:center; font-size:11px; color:#64748b; flex-wrap:wrap; }
        .ond-empty { display:flex; flex-direction:column; align-items:center; gap:6px; padding:20px; color:#94a3b8; font-size:12.5px; }
        .ond-status { font-size:11px; margin-top:4px; font-family:'DM Mono',monospace; }
        .ond-status-ok { color:#0f766e; font-weight:700; display:flex; align-items:center; }

        /* CO Linking */
        .co-table-wrap { overflow-x:auto; border-radius:10px; border:1px solid #e2e8f0; margin-top:10px; }
        .co-table { width:100%; border-collapse:collapse; font-size:12px; font-family:'DM Sans',sans-serif; min-width:700px; }
        .co-table thead tr { background:#0f766e; }
        .co-table th { padding:10px 12px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:11px; letter-spacing:0.04em; text-transform:uppercase; }
        .co-table th.th-r { text-align:right; }
        .co-table th.th-c { text-align:center; }
        .co-table tbody tr:nth-child(odd)  td { background:#fff; }
        .co-table tbody tr:nth-child(even) td { background:#f0fdfa; }
        .co-table td { padding:8px 10px; vertical-align:middle; }
        .co-table td.td-r { text-align:right; }
        .co-table td.td-c { text-align:center; }
        .co-input { width:100%; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; font-family:'DM Sans',sans-serif; color:#1e293b; outline:none; background:#fff; min-width:80px; }
        .co-input:focus { border-color:#0f766e; }
        .co-display { font-size:12px; color:#475569; font-family:'DM Sans',sans-serif; padding:2px 0; }
        .co-no-wrap { position:relative; }

        select, input, textarea { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
      `}</style>

      <div className="pp-wrap">

        {/* PAGE HEADER */}
        <div className="pp-page-header">
          <div>
            <h1>Production Planning</h1>
            <p>{total} plan{total !== 1 ? 's' : ''} created</p>
          </div>

          <div className="pp-header-actions">
            {/* Export / Print dropdown */}
            <div className="pp-export-wrap" ref={exportRef}>
              <button
                type="button"
                className={`pp-export-trigger${exportOpen ? ' open' : ''}`}
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
                <div className="pp-export-panel">
                  <div className="pp-export-panel-label">Export / Print</div>
                  <button className="pp-export-item" onClick={handleExportCSV}>
                    <FileText size={15} color="#7c3aed" />
                    <span>Export as CSV</span>
                  </button>
                  <button className="pp-export-item" onClick={handleExportExcel}>
                    <FileSpreadsheet size={15} color="#16a34a" />
                    <span>Export as Excel</span>
                  </button>
                  <button className="pp-export-item" onClick={handlePrintTable}>
                    <Printer size={15} color="#2563eb" />
                    <span>Print Table</span>
                  </button>
                </div>
              )}
            </div>

            <button className="pp-add-btn" onClick={openCreate}><Plus size={15} /> New Plan</button>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="pp-toolbar">
          <div className="pp-search-wrap" style={{ flexBasis: isMobile ? '100%' : undefined }}>
            <Search size={14} />
            <input className="pp-search" placeholder="Search Rec No, Order No, Construction…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="pp-filter-sel" value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}>
              <option value=''>All Types</option>
              <option>Customer Order</option>
              <option>Open Order</option>
            </select>
            {!isMobile && <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{total} record(s)</span>}
          </div>
          <div className="pp-page-size">
            {!isMobile && <span>Show</span>}
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>

        {isMobile && <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{total} record(s)</p>}

        {/* TABLE */}
        <div className="pp-card">
          <div className="pp-table-wrap">
            <table className="pp-table">
              <thead>
                <tr>
                  <th>#</th><th>Rec No</th><th>Rec Date</th><th>Type</th><th>Order No</th>
                  {!isMobile && <th>Customer</th>}
                  {width >= 640 && <th>Confirmed By</th>}
                  {!isMobile && <th>Construction</th>}
                  {width >= 768 && <th>Order Qty</th>}
                  {width >= 768 && <th>Total Planned</th>}
                  {width >= 768 && <th>Balance</th>}
                  <th className="th-c">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={12} className="pp-empty"><Loader2 size={22} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} /></td></tr>
                ) : plans.length === 0 ? (
                  <tr><td colSpan={12} className="pp-empty">{search || filterType ? 'No plans match your search.' : 'No plans yet. Click "New Plan" to create one.'}</td></tr>
                ) : plans.map((p, i) => {
                  const tpl = (Number(p.allocated_qty)||0) + (Number(p.production_qty)||0) + (Number(p.purchase_qty)||0);
                  const bal = Math.max((Number(p.order_quantity)||0) - tpl, 0);
                  return (
                    <tr key={p.id}>
                      <td style={{ color: '#94a3b8' }}>{(page-1)*pageSize+i+1}</td>
                      <td><span className="pp-rec-id">{p.rec_no ?? '—'}</span></td>
                      {/* ── FIX: fmtDate() for list table dates too ── */}
                      <td>{fmtDate(p.rec_date) || '—'}</td>
                      <td><span className={`pp-chip ${p.order_type==='Open Order'?'pp-chip-open':'pp-chip-co'}`}>{p.order_type==='Open Order'?'Open':'CO'}</span></td>
                      <td style={{ fontFamily:"'DM Mono',monospace", fontSize:12 }}>{p.order_no}</td>
                      {!isMobile && <td style={{ maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', color:p.customer_name?'#1e293b':'#cbd5e1' }}>{p.customer_name||'—'}</td>}
                      {width >= 640 && (
                        <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {(p as any).confirmed_by
                            ? <span style={{ fontSize: 11, color: '#0f766e', fontWeight: 600 }}>{(p as any).confirmed_by}</span>
                            : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                      )}
                      {!isMobile && <td style={{ maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', fontSize:11, color:'#475569' }} title={p.constn_for_production||''}>{p.constn_for_production||'—'}</td>}
                      {width>=768 && <td style={{ textAlign:'right', fontFamily:"'DM Mono',monospace" }}>{p.order_quantity?Number(p.order_quantity).toLocaleString('en-IN'):'—'}</td>}
                      {width>=768 && <td style={{ textAlign:'right', fontFamily:"'DM Mono',monospace", color:'#0f766e', fontWeight:700 }}>{tpl>0?tpl.toLocaleString('en-IN'):'—'}</td>}
                      {width>=768 && <td style={{ textAlign:'right', fontFamily:"'DM Mono',monospace", color:bal>0?'#dc2626':'#16a34a', fontWeight:600 }}>{bal.toLocaleString('en-IN')}</td>}
                      <td>
                        <div className="pp-action-group">
                          <button className="pp-btn-edit" onClick={() => openEdit(p.id!)}>✏️ {!isMobile && 'Edit'}</button>
                          <button className="pp-btn-del"  onClick={() => handleDelete(p.id!)}>🗑 {!isMobile && 'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!loading && total > 0 && (
            <div className="pp-pagination">
              <span>Page {page} of {totalPages}</span>
              <div className="pp-pag-btns">
                <button className="pp-pag-btn" onClick={() => goTo(1)} disabled={page===1}>«</button>
                <button className="pp-pag-btn" onClick={() => goTo(page-1)} disabled={page===1}>‹</button>
                {pageNums.map(p => <button key={p} className={`pp-pag-btn${p===page?' active':''}`} onClick={() => goTo(p)}>{p}</button>)}
                <button className="pp-pag-btn" onClick={() => goTo(page+1)} disabled={page===totalPages}>›</button>
                <button className="pp-pag-btn" onClick={() => goTo(totalPages)} disabled={page===totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* MODAL */}
        {showForm && (
          <div className="pp-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="pp-modal">

              <div className="pp-modal-header">
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  <h2 style={{ margin:0, fontSize:isMobile?15:18, fontWeight:700, color:'#fff' }}>
                    {editId ? '✏️ Edit Production Plan' : '➕ New Production Plan'}
                  </h2>
                  {editId && form.rec_no && (
                    <span style={{ fontSize:11, color:'#99f6e4', fontFamily:'DM Mono,monospace' }}>
                      {form.rec_no} · {fmtDate(form.rec_date)}
                    </span>
                  )}
                </div>
                <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={20} color="#fff" /></button>
              </div>

              {error && (
                <div style={s.errorBanner}>
                  <AlertCircle size={15} style={{ flexShrink:0 }} />
                  <span>{error}</span>
                  <button onClick={() => setError('')} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', padding:0, color:'#ef4444', display:'flex', alignItems:'center', flexShrink:0 }}><X size={14} /></button>
                </div>
              )}

              <div className="pp-modal-body">

                {/* ── SECTION: Plan Header ── */}
                <SectionHead title="Plan Header" open={sec.header} onToggle={() => toggle('header')} accent="#0f766e" />
                {sec.header && (
                  <div className="pp-grid">
                    <DisplayField label="Rec No"   value={editId ? form.rec_no : 'Auto-generated'} />
                    {/* ── FIX: fmtDate() for Rec Date display ── */}
                    <DisplayField label="Rec Date" value={editId ? fmtDate(form.rec_date) : fmtDate(new Date().toISOString().slice(0,10))} />

                    <Field label="Order Type" required>
                      <select
                        value={form.order_type}
                        onChange={e => {
                          const newType = e.target.value;
                          setForm(prev => ({
                            ...prev, order_type: newType,
                            order_no: '', order_date: '', order_sort_no: '',
                            order_quantity: '', constn_for_production: '',
                            customer_name: '', confirmed_by: '', delivery_address: '',
                          }));
                          setSec(prev => ({ ...prev, linking: newType === 'Open Order' }));
                          fetchOrderOptions(newType);
                        }}
                        style={s.input}
                      >
                        <option>Customer Order</option>
                        <option>Open Order</option>
                      </select>
                    </Field>

                    <Field label="Order No" required>
                      <OrderNoDropdown
                        value={form.order_no}
                        onChange={selectOrderNo}
                        options={allOrderOptions}
                        loading={loadingOrderOpts}
                        orderType={form.order_type}
                      />
                    </Field>

                    {loadingOrderDetail && form.order_no && (
                      <div className="pp-fetch-banner">
                        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                        Fetching order details from order bookings…
                      </div>
                    )}

                    {/* ── FIX: fmtDate() for Order Date display ── */}
                    <DisplayField
                      label="Order Date"
                      value={fmtDate(form.order_date) || undefined}
                      loading={loadingOrderDetail}
                    />
                    <DisplayField
                      label="Order Sort No"
                      value={form.order_sort_no}
                      loading={loadingOrderDetail}
                    />

                    {!isOpenOrder
                      ? <DisplayField
                          label="Customer Name"
                          value={form.customer_name || undefined}
                          loading={loadingOrderDetail}
                        />
                      : <div />}

                    <div className="pp-confirmed-wrap">
                      <label style={s.label}>
                        Confirmed By
                        {anyDetailLoading && (
                          <Loader2
                            size={11}
                            style={{
                              animation: 'spin 1s linear infinite',
                              color: '#0f766e',
                              display: 'inline-block',
                              verticalAlign: 'middle',
                              marginLeft: 6,
                            }}
                          />
                        )}
                      </label>
                      <div style={{
                        ...s.input,
                        background: anyDetailLoading ? '#f8fafc' : (form.confirmed_by ? '#f0fdf4' : '#f8fafc'),
                        color:      anyDetailLoading ? '#94a3b8' : (form.confirmed_by ? '#166534' : '#9ca3af'),
                        fontWeight: form.confirmed_by && !anyDetailLoading ? 600 : 400,
                        cursor: 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        minHeight: 38,
                        gap: 6,
                        opacity: anyDetailLoading ? 0.75 : 1,
                        transition: 'opacity 0.2s',
                      }}>
                        {anyDetailLoading ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94a3b8', fontSize: 12 }}>
                            <Loader2 size={11} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
                            Fetching…
                          </span>
                        ) : form.confirmed_by ? (
                          <>
                            <Check size={13} style={{ color: '#0f766e', flexShrink: 0 }} />
                            {form.confirmed_by}
                          </>
                        ) : (
                          <span style={{ color: '#cbd5e1' }}>— auto-filled on order select —</span>
                        )}
                      </div>
                      <p style={{ margin: '3px 0 0', fontSize: 11, color: '#94a3b8' }}>
                        Auto-fetched from Order Bookings (confirm_by) · read-only
                      </p>
                    </div>

                    <DisplayField
                      label="Order Quantity (m)"
                      value={form.order_quantity
                        ? Number(form.order_quantity).toLocaleString('en-IN', { maximumFractionDigits: 3 })
                        : undefined}
                      loading={loadingOrderDetail}
                    />

                    {/* ── NEW: Delivery Address — auto-filled from the selected Order, full width ── */}
                    <div className="pp-col-full">
                      <AddressDisplayField
                        label="Delivery Address"
                        value={form.delivery_address}
                        loading={loadingOrderDetail}
                        hint="Auto-fetched from Order Bookings when Order No is selected · read-only"
                      />
                    </div>

                    <div style={{ gridColumn: 'span 2' }}>
                      <Field label="Construction for Production" hint="Auto-filled from Construction as PO (Order Details) — edit if needed.">
                        <input
                          value={form.constn_for_production}
                          onChange={e => set('constn_for_production', e.target.value)}
                          style={s.input}
                          placeholder="e.g. 30ECOVERO * 30HT / 68 x 56 / 63&quot; / 1/1 / cotton"
                        />
                      </Field>
                    </div>

                    <div className="pp-col-full">
                      <div className="pp-stock-row">
                        <ComputedBadge label="Total Planned" value={totalPlan}        color="#0f766e" />
                        <ComputedBadge label="Balance Qty"   value={balanceQty}       color={balanceQty > 0 ? '#dc2626' : '#16a34a'} />
                        <ComputedBadge label="Order Qty"     value={orderQty || null} color="#334155" />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── SECTION: Planning Details ── */}
                <SectionHead title="Planning Details" open={sec.planning} onToggle={() => toggle('planning')} accent="#0369a1" />
                {sec.planning && (
                  <>
                    <SectionHead title="From Stock" open={sec.stock} onToggle={() => toggle('stock')} accent="#6d28d9" />
                    {sec.stock && (
                      <div className="pp-plan-sub">
                        <div className="pp-stock-row">
                          <ComputedBadge label="Total Stock"      value={stockTotal} color="#334155" />
                          <ComputedBadge label="Reserved"         value={stockRes}   color="#b45309" />
                          <ComputedBadge label="Available"        value={stockAvail} color="#0369a1" />
                          <ComputedBadge label="After Allocation" value={stockBal}   color={stockBal>=0?'#0f766e':'#dc2626'} />
                        </div>
                        <div className="pp-grid-2">
                          <Field label="Allocation for Customer" hint={`≤ Available Qty (${stockAvail.toLocaleString('en-IN')}) & ≤ Order Qty`}>
                            <input type="number" min="0" step="0.001" value={form.allocated_qty} onChange={e => set('allocated_qty', e.target.value)} style={s.input} placeholder="0.000" />
                          </Field>
                          <div className="pp-col-full">
                            <Field label="Special Instruction">
                              <textarea value={form.stock_special_instruction} onChange={e => set('stock_special_instruction', e.target.value)} style={{ ...s.input, height:64, resize:'vertical' }} placeholder="Notes for stock-based planning…" />
                            </Field>
                          </div>
                        </div>
                      </div>
                    )}

                    <SectionHead title="By Production" open={sec.prod} onToggle={() => toggle('prod')} accent="#7c3aed" />
                    {sec.prod && (
                      <div className="pp-plan-sub" style={{ marginTop:8 }}>
                        <p style={{ margin:'0 0 10px', fontSize:12, color:'#64748b' }}>
                          Production Qty ≤ (Order Qty − Allocated Qty) = <strong>{Math.max(orderQty-allocQty,0).toLocaleString('en-IN',{maximumFractionDigits:3})}</strong>
                        </p>
                        <div className="pp-grid">
                          <Field label="Total Production Qty" hint="In-house + Vendor">
                            <input type="number" min="0" step="0.001" value={form.production_qty} onChange={e => set('production_qty', e.target.value)} style={s.input} placeholder="0.000" />
                          </Field>
                          <Field label="In-house Prod. Qty">
                            <input type="number" min="0" step="0.001" value={form.inhouse_prod_qty} onChange={e => set('inhouse_prod_qty', e.target.value)} style={s.input} placeholder="0.000" />
                          </Field>
                          <Field label="Vendor Prod. Qty">
                            <input type="number" min="0" step="0.001" value={form.vendor_prod_qty} onChange={e => set('vendor_prod_qty', e.target.value)} style={s.input} placeholder="0.000" />
                          </Field>

                          {/* ── NEW: Vendor Name dropdown, linked to vendor_master ── */}
                          <Field label="Vendor Name" hint="Linked to Vendor Master">
                            <NameDropdown
                              value={form.vendor_id}
                              displayName={form.vendor_name}
                              onChange={selectVendor}
                              options={vendorOptions}
                              loading={loadingVendors}
                              placeholder="Select Vendor"
                              searchPlaceholder="Search vendor name or code…"
                              emptyLabel="vendors"
                              icon={<Factory size={16} style={{ color: '#7c3aed' }} />}
                              accentColor="#7c3aed"
                            />
                          </Field>

                          <div className="pp-col-full">
                            <Field label="Special Instruction">
                              <textarea value={form.prod_special_instruction} onChange={e => set('prod_special_instruction', e.target.value)} style={{ ...s.input, height:64, resize:'vertical' }} placeholder="Notes for production planning…" />
                            </Field>
                          </div>
                        </div>
                      </div>
                    )}

                    <SectionHead title="By Purchase" open={sec.purchase} onToggle={() => toggle('purchase')} accent="#0369a1" />
                    {sec.purchase && (
                      <div className="pp-plan-sub" style={{ marginTop:8 }}>
                        <p style={{ margin:'0 0 10px', fontSize:12, color:'#64748b' }}>
                          Purchase Qty ≤ (Order Qty − Allocated Qty) = <strong>{Math.max(orderQty-allocQty,0).toLocaleString('en-IN',{maximumFractionDigits:3})}</strong>
                        </p>
                        <div className="pp-grid-2">
                          <Field label="Purchase Quantity">
                            <input type="number" min="0" step="0.001" value={form.purchase_qty} onChange={e => set('purchase_qty', e.target.value)} style={s.input} placeholder="0.000" />
                          </Field>

                          {/* ── NEW: Supplier Name dropdown, linked to supplier_master ── */}
                          <Field label="Supplier Name" hint="Linked to Supplier Master">
                            <NameDropdown
                              value={form.supplier_id}
                              displayName={form.supplier_name}
                              onChange={selectSupplier}
                              options={supplierOptions}
                              loading={loadingSuppliers}
                              placeholder="Select Supplier"
                              searchPlaceholder="Search supplier name or code…"
                              emptyLabel="suppliers"
                              icon={<Truck size={16} style={{ color: '#0369a1' }} />}
                              accentColor="#0369a1"
                            />
                          </Field>

                          <div className="pp-col-full">
                            <Field label="Special Instruction">
                              <textarea value={form.purchase_special_instruction} onChange={e => set('purchase_special_instruction', e.target.value)} style={{ ...s.input, height:64, resize:'vertical' }} placeholder="Notes for purchase planning…" />
                            </Field>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── SECTION: Customer Order Linking ── */}
                <SectionHead
                  title={`Customer Order Linking${!isOpenOrder?' (Open Orders only)':''}`}
                  open={sec.linking} onToggle={() => toggle('linking')} accent="#0369a1"
                />
                {sec.linking && (
                  <div style={{ marginTop:8 }}>
                    {!isOpenOrder ? (
                      <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#92400e' }}>
                        ⚠️ Order linking applies only to <strong>Open Orders</strong>. Switch Order Type to enable this section.
                      </div>
                    ) : (
                      <>
                        <p style={{ margin:'0 0 4px', fontSize:12, color:'#64748b', lineHeight:1.6 }}>
                          Link one or more Customer Orders to this Open Order plan.
                        </p>
                        <div className="co-table-wrap">
                          <table className="co-table">
                            <thead>
                              <tr>
                                <th style={{ width:36 }}>#</th>
                                <th style={{ minWidth:110 }}>Linking Date</th>
                                <th style={{ minWidth:160 }}>CO No.</th>
                                <th style={{ minWidth:100 }}>CO Date</th>
                                <th style={{ minWidth:150 }}>Customer / Company</th>
                                <th style={{ minWidth:120 }}>CO Sort No.</th>
                                <th className="th-r" style={{ minWidth:100 }}>CO Quantity</th>
                                <th className="th-r" style={{ minWidth:130 }}>Plan Qty Allocated</th>
                                <th className="th-c" style={{ width:46 }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {form.order_links.length === 0 ? (
                                <tr><td colSpan={9} style={{ textAlign:'center', padding:'20px', color:'#94a3b8', fontSize:12 }}>No CO links added. Click "Add CO Link" below.</td></tr>
                              ) : form.order_links.map((lnk, i) => (
                                <tr key={i}>
                                  <td style={{ color:'#94a3b8', fontSize:11, textAlign:'center', fontWeight:600 }}>{i+1}</td>
                                  <td><input type="date" value={lnk.linking_date} onChange={e => setLink(i,'linking_date',e.target.value)} className="co-input" /></td>
                                  <td>
                                    <div className="co-no-wrap" ref={coSearchIdx===i?coDDRef:undefined}>
                                      <input
                                        value={coSearchIdx===i?coSearchQ:lnk.co_no}
                                        onChange={e => { setCoSearchIdx(i); setCoSearchQ(e.target.value); searchCO(e.target.value,i); }}
                                        onFocus={() => { if(lnk.co_no){ setCoSearchIdx(i); setCoSearchQ(lnk.co_no); } }}
                                        onBlur={() => { setTimeout(() => { if(coSearchIdx===i) setCoSearchIdx(null); },200); }}
                                        placeholder="Search CO No…" className="co-input"
                                        style={{ paddingRight: loadingCo&&coSearchIdx===i?28:undefined }}
                                      />
                                      {loadingCo&&coSearchIdx===i && <Loader2 size={12} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', animation:'spin 1s linear infinite', color:'#94a3b8' }} />}
                                      {showCoDD&&coSearchIdx===i&&coOptions.length>0 && (
                                        <div className="pp-dropdown" style={{ minWidth:260 }}>
                                          {coOptions.map(o => (
                                            <div key={o.order_no} className="pp-dd-item" onMouseDown={() => selectCO(o,i)}>
                                              <strong>{o.order_no}</strong>
                                              {o.customer_name&&<span style={{ color:'#64748b' }}> · {o.customer_name}</span>}
                                              <span style={{ float:'right', fontSize:11, color:'#94a3b8', fontFamily:'DM Mono,monospace' }}>{Number(o.quantity).toLocaleString('en-IN')} m</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  {/* ── FIX: fmtDate() for CO date display ── */}
                                  <td><span className="co-display">{fmtDate(lnk.co_date) || <span style={{ color:'#cbd5e1' }}>—</span>}</span></td>
                                  <td><span className="co-display">{lnk.customer_name||<span style={{ color:'#cbd5e1' }}>—</span>}</span></td>
                                  <td><span className="co-display" style={{ fontFamily:'DM Mono,monospace', fontSize:11 }}>{lnk.co_sort_no||<span style={{ color:'#cbd5e1' }}>—</span>}</span></td>
                                  <td className="td-r"><span className="co-display" style={{ fontFamily:'DM Mono,monospace' }}>{lnk.co_quantity?Number(lnk.co_quantity).toLocaleString('en-IN',{maximumFractionDigits:3}):<span style={{ color:'#cbd5e1' }}>—</span>}</span></td>
                                  <td className="td-r"><input type="number" min="0" step="0.001" value={lnk.plan_quantity_allocated} onChange={e => setLink(i,'plan_quantity_allocated',e.target.value)} className="co-input" style={{ textAlign:'right', minWidth:100 }} placeholder="0.000" /></td>
                                  <td className="td-c"><button style={s.delLinkBtn} onClick={() => removeLink(i)} title="Remove link"><Trash2 size={13} /></button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <button className="pp-add-link-btn" onClick={addLink}><PlusCircle size={14} /> Add CO Link</button>
                      </>
                    )}
                  </div>
                )}

              </div>

              <div className="pp-modal-footer">
                <button className="pp-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="pp-btn-save" onClick={handleSave} disabled={saving}>
                  {saving
                    ? <><Loader2 size={15} style={{ animation:'spin 1s linear infinite' }} /> Saving…</>
                    : (editId ? '✏️ Update Plan' : '💾 Save Plan')}
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
  closeBtn:    { background:'none', border:'none', padding:'0 4px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity:0.85, touchAction:'manipulation' },
  errorBanner: { display:'flex', alignItems:'center', gap:8, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, color:'#ef4444', padding:'10px 16px', margin:'12px 16px 0', fontSize:13, fontFamily:"'DM Sans', sans-serif" },
  label:       { display:'block', fontSize:11, fontWeight:700, color:'#64748b', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' },
  input:       { width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid #cbd5e1', fontSize:13, color:'#1e293b', outline:'none', boxSizing:'border-box', transition:'border-color 0.15s', background:'#fff' },
  sectionHead: { display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 14px', cursor:'pointer', marginTop:18, userSelect:'none' },
  sectionTitle:{ fontWeight:700, fontSize:13, color:'#1e293b' },
  delLinkBtn:  { background:'#fff1f2', color:'#dc2626', border:'1px solid #fca5a5', width:28, height:28, borderRadius:7, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
};