// CustomerOrder.tsx (UnifiedOrderManagement) — FIXED + EXPORT/PRINT MENU
// ROOT CAUSE OF 400 ERROR:
//   The backend route GET /api/order-bookings requires `customer_id` (or
//   `employee_id`) as a query parameter.  The old code called
//   safeFetch('/api/order-bookings') with NO params, so the server rejected
//   every request with 400 "customer_id is required".
//
// FIX SUMMARY:
//   1. Component now accepts  { user }  prop (UserPayload from EmployeeDashboard).
//   2. A helper  apiBase()  builds the base query string:
//        /api/order-bookings?employee_id=<id>&customer_id=<id>
//      so every fetch carries the identity the backend needs.
//   3. loadOrders(), fetchOrderById(), handleCOSave(), confirmDelete() all
//      use the helper — nothing else changed.
//
// CHANGES v2:
//   • SOURCE column now shows "SR-Converted" chip (purple) when order was
//     created from a sample request (sample_request_id is set OR remarks
//     contains "From sample"), and a new teal "CO" chip for all manually
//     created orders (instead of a plain dash).
//   • Added CUSTOMER CODE column to the main table — shows the customer_id
//     value (e.g. CUS-2026-001) in a monospace badge.
//
// CHANGES v3:
//   • Certification Type is now backed by a real master table instead of
//     free text — same select-dropdown pattern already used for Agent and
//     Packing Type (master-count badge in the label, fallback manual input
//     if the master is empty/unavailable).
//   • Selecting a certification auto-fills Certificate No from that
//     certification's stored code, exactly like selecting a Fabric auto-
//     fills Quality/Construction in the Order Details modal.
//   • fetchCertifications() tries a few likely endpoint names (same
//     defensive multi-endpoint pattern as fetchHsnCodes/fetchFabrics)
//     since the exact route for this master wasn't confirmed yet — once
//     you tell me the real one, this can be trimmed to a single call.
//
// CHANGES v4:
//   • "Select Customer" is now a click-to-search dropdown (CustomerDropdown)
//     instead of a separate free-text search box + native <select> — same
//     trigger/panel/search-list pattern already used by HsnDropdown and
//     FabricDropdown. Selecting a customer still auto-fills the same
//     customer/delivery address fields as before.
//
// CHANGES v6:
//   • Transport is now backed by a master table using a NATIVE <select> —
//     same exact pattern as Agent Name / Packing Type (label + loaded-count
//     badge + <select> + green auto-fill confirmation line below), instead
//     of the earlier custom search-dropdown component. Falls back to a
//     manual text input if the master is empty/unavailable, exactly like
//     Agent/Packing Type/Certification. The old TransportDropdown
//     search-panel component and its CSS have been removed since they're
//     no longer used.
//
// CHANGES v7:
//   • Selecting a customer now AUTO-FILLS the Agent Name field.
//     The Customer interface gains optional agent_id / agent_name fields
//     (returned by /api/customers in most ERP schemas). On selection,
//     handleCustomerSelect matches the customer's agent against the loaded
//     agents master (by agent_id FK first, then agent_name string fallback)
//     and fills both agent_id and agent_name. Clearing the customer also
//     clears the agent. A subtle "Auto-filled from customer" badge appears
//     under the Agent dropdown when the value was set this way.
//
// CHANGES v8:
//   • Added a "Firm" dropdown in the Delivery Details section with two
//     options — AEF and AE. Choosing one reveals a text input bound to the
//     matching DB column (`aef` varchar(100) or `ae` varchar(150) — both
//     already exist on order_bookings and are already handled by the
//     backend's buildPayload()). Switching the dropdown clears the other
//     column so only one of aef/ae is ever populated per order.
//
// CHANGES v9:
//   • "Firm" is now a single dropdown (AEF / AE) whose selected value
//     itself is stored straight into one `firm` DB column.
//
// CHANGES v10:
//   • Added a "Firm" column to the main Customer Orders table (between
//     Transport and Exp. Delivery) showing each order's `firm` value
//     (AEF / AE) so it's visible at a glance without opening the row.
//     Also added "Firm" to the Export CSV/Excel/Print columns (it was
//     already included there in v9, left untouched) — table now mirrors
//     the export output. colSpan on the loading/error/empty table rows
//     bumped from 12 → 13 to match the new column count.
//
// CHANGES v11:
//   • Added a "Quality" column to the main Customer Orders table (between
//     Firm and Exp. Delivery) showing each order's `quality` value (the
//     fabric quality / full construction description captured in the
//     Order Details modal) in a truncated, title-tooltipped cell so long
//     descriptions don't blow out the row height.
//   • Added "Quality" to the Export CSV/Excel/Print columns so the export
//     output mirrors the table.
//   • colSpan on the loading/error/empty table rows bumped from 13 → 14
//     to match the new column count.
//
// CHANGES v12 (this pass):
//   • Added an "Order Date" range filter (From / To) to the toolbar, right
//     next to the search box. Filtering is inclusive on both ends and is
//     combined (AND) with the existing text search. A "Clear dates" (×)
//     button appears once either date is set.
//   • The same From/To range is now also applied when exporting to
//     CSV/Excel/Print, so exports always match what's currently filtered
//     on screen.
//   • Changing either date resets pagination back to page 1, same as the
//     text search already did.
//
// Export / Print menu in the page header (Export as CSV, Export as Excel,
// Print Table) — same dropdown pattern as ProductionPlanningMaster.

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  FiSearch, FiX, FiChevronDown, FiCheck, FiPlus, FiEdit2, FiTrash2,
  FiAlertTriangle, FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight,
  FiUser, FiTruck, FiFileText, FiPackage, FiRefreshCw, FiDownload, FiCalendar,
} from 'react-icons/fi';
import { MdSyncAlt } from 'react-icons/md';
import { BiSave } from 'react-icons/bi';
import { RiFileList3Line } from 'react-icons/ri';
import { HiOutlineDocumentText, HiOutlineClipboardList } from 'react-icons/hi';

// ─── USER PROP ────────────────────────────────────────────────────────────────
export interface UserPayload {
  id: number;
  employee_code: string;
  name: string;
  email: string;
  role: 'employee';
  employee_category: string;
  module_access: string[];
  stage_access: string[];
}

interface Props {
  user?: UserPayload;
}

// ─── AUTH HEADER ──────────────────────────────────────────────────────────────
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
            const t = parsed.access_token || parsed.token || parsed.accessToken ||
              parsed.id_token || parsed.idToken || parsed.jwt || parsed.bearer || null;
            if (t && typeof t === 'string' && t.length > 10) return t;
          }
        } catch { /* not JSON */ }
        if (raw.length > 10) return raw;
      } catch { /* storage blocked */ }
    }
  }
  return '';
};

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Customer {
  id: number; customer_id?: string; customer_name: string; category?: string;
  address?: string; pin_code?: string; district?: string; state?: string;
  country?: string; email?: string; gst_no?: string; contact_name?: string;
  shipping_address?: string; shipping_pin_code?: string; shipping_district?: string;
  shipping_state?: string; shipping_country?: string; shipping_gst_no?: string;
  shipping_contact_name?: string;
  // v7: agent fields for auto-fill when a customer is selected
  agent_id?: number | string;
  agent_name?: string;
  default_agent_id?: number | string;
  default_agent_name?: string;
  preferred_agent_id?: number | string;
  preferred_agent?: string;
}
interface Agent { id: number; agent_name: string; agent_code?: string; }
interface PackageType { id: number; package_name: string; package_code?: string; }
interface CertificationMaster { id: number; certification_type: string; certification_code?: string; }
interface TransportMaster { id: number; transport_name: string; transport_code?: string; }
interface HsnCode { id: number; hsn_code: string; description?: string; }
interface FabricMaster {
  id: number; sort_no: string; fabric_code?: string; quality?: string;
  construction?: string; hsn_code?: string; description?: string;
  fabric_quality?: string; construction_po?: string; fabric_description?: string;
  warp?: string; weft?: string; reed?: string; pick?: string;
  width?: string; weave?: string; design?: string;
}
// v8: which "Firm" column is currently active for an order
type FirmType = '' | 'AEF' | 'AE';

interface CustomerOrder {
  id?: number;
  sample_request_id?: number | null;
  order_code: string; order_date: string; po_no: string; po_date: string;
  customer_id?: number | string; customer_name: string; customer_address: string;
  customer_pincode: string; customer_state: string; customer_country: string;
  customer_gst_no: string; customer_contact_name: string; delivery_at: string;
  delivery_address: string; delivery_pincode: string; delivery_state: string;
  delivery_country: string; delivery_gst_no: string; delivery_contact_name: string;
  order_through: string; agent_id?: number | string; agent_name: string;
  commission: string; packing_type_id?: number | string; packing_type: string;
  confirm_mode: string; confirm_by: string; confirm_code: string; expect_delivery: string;
  pinning: string; rate_type: string; payment_terms: string; freight: string;
  transport_id?: number | string; transport: string; certification_id?: number | string; certification_type: string; certificate_no: string; remarks: string;
  order_type?: string; quality_type?: string; hsn_code?: string; sort_no?: string;
  quality?: string; delivery_instruction?: string;
  cgst_pct?: number; sgst_pct?: number; igst_pct?: number;
  basic_value?: number; cgst_value?: number; sgst_value?: number; igst_value?: number; net_value?: number;
  items?: OrderItem[] | string | null; _conversionId?: number;
  // v7: track whether the agent was auto-filled from customer selection
  _agentAutoFilled?: boolean;
  // v9: "Firm" dropdown — the selected option (AEF or AE) itself is the
  // value stored to the DB in a single `firm` column.
  firm?: FirmType;
}
interface OrderItem {
  id?: number; order_id?: number; construction_po: string; meter: number; rate: number;
  disc_type: 'None' | 'Flat' | 'Percent'; disc_pct: number; disc_value: number; total_value: number;
}
interface OrderBooking {
  order_type: 'Domestic' | 'Export'; quality_type: string; hsn_code: string; sort_no: string;
  quality: string; delivery_instruction: string;
  cgst_pct: number; sgst_pct: number; igst_pct: number; items: OrderItem[];
}
interface ConversionNotif {
  id: number; type: string; title: string; body: string; is_read: number; created_at: string;
  conversion_id?: number; sample_request_id?: number;
  meta: {
    sample_request_id?: number; request_code?: string; customer_name?: string;
    customer_id?: string; agent_name?: string; fabric_code?: string;
    fabric_quality?: string; color?: string; quantity_meters?: number;
  };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const str = (v: unknown): string => (v == null ? '' : String(v));

const toDateStr = (v?: string | null): string => {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (isNaN(d.getTime())) return v.substring(0, 10);
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
};

const fmtDate = (v?: string | null): string => {
  if (!v) return '—';
  const s = toDateStr(v);
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
};

const fmt2 = (n: number): string =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const buildConstructionString = (warp: string, weft: string, reed: string, pick: string, width: string, weave: string, design: string): string => {
  if (!warp && !weft && !reed && !pick) return '';
  const parts: string[] = [];
  if (warp || weft) parts.push(`${warp||'?'} * ${weft||'?'}`);
  if (reed || pick) parts.push(`${reed||'?'} x ${pick||'?'}`);
  if (width) parts.push(`${width}"`);
  if (weave) parts.push(weave);
  if (design) parts.push(design);
  return parts.join(' / ');
};

const toSafeDate = (v?: string | null): string | null => {
  const s = toDateStr(v);
  if (!s) return null;
  return `${s}T00:00:00+05:30`;
};

const normaliseOrder = (r: CustomerOrder): CustomerOrder => ({
  ...r,
  order_code: str(r.order_code), po_no: str(r.po_no), customer_name: str(r.customer_name),
  customer_address: str(r.customer_address), customer_pincode: str(r.customer_pincode),
  customer_state: str(r.customer_state), customer_country: str(r.customer_country),
  customer_gst_no: str(r.customer_gst_no), customer_contact_name: str(r.customer_contact_name),
  delivery_at: str(r.delivery_at), delivery_address: str(r.delivery_address),
  delivery_pincode: str(r.delivery_pincode), delivery_state: str(r.delivery_state),
  delivery_country: str(r.delivery_country), delivery_gst_no: str(r.delivery_gst_no),
  delivery_contact_name: str(r.delivery_contact_name), order_through: str(r.order_through),
  agent_name: str(r.agent_name), commission: str(r.commission), packing_type: str(r.packing_type),
  confirm_mode: str(r.confirm_mode), confirm_by: str(r.confirm_by), confirm_code: str(r.confirm_code),
  pinning: str(r.pinning), rate_type: str(r.rate_type), payment_terms: str(r.payment_terms),
  freight: str(r.freight), transport: str(r.transport), certification_type: str(r.certification_type),
  certificate_no: str(r.certificate_no), remarks: str(r.remarks),
  customer_id: r.customer_id ?? '', agent_id: r.agent_id ?? '', packing_type_id: r.packing_type_id ?? '',
  certification_id: r.certification_id ?? '', transport_id: r.transport_id ?? '',
  order_date: toDateStr(r.order_date), po_date: toDateStr(r.po_date), expect_delivery: toDateStr(r.expect_delivery),
  order_type: r.order_type || 'Domestic', quality_type: r.quality_type || 'Regular',
  hsn_code: str(r.hsn_code), sort_no: str(r.sort_no), quality: str(r.quality),
  delivery_instruction: str(r.delivery_instruction),
  cgst_pct: Number(r.cgst_pct)||0, sgst_pct: Number(r.sgst_pct)||0, igst_pct: Number(r.igst_pct)||0,
  basic_value: Number(r.basic_value)||0, cgst_value: Number(r.cgst_value)||0,
  sgst_value: Number(r.sgst_value)||0, igst_value: Number(r.igst_value)||0, net_value: Number(r.net_value)||0,
  sample_request_id: r.sample_request_id ?? null,
  items: r.items,
  // v9: hydrate the Firm dropdown straight from the `firm` column
  firm: (r.firm === 'AEF' || r.firm === 'AE') ? r.firm : '',
});

const buildOrderPayload = (
  f: CustomerOrder, ob: OrderBooking,
  basic: number, cgst: number, sgst: number, igst: number, net: number, includeIds = true,
) => {
  const base: Record<string, unknown> = {
    order_code: f.order_code||null, sample_request_id: null,
    order_date: toSafeDate(f.order_date), po_no: f.po_no||null,
    po_date: toSafeDate(f.po_date), customer_name: f.customer_name||null,
    customer_address: f.customer_address||null, customer_pincode: f.customer_pincode||null,
    customer_state: f.customer_state||null, customer_country: f.customer_country||null,
    customer_gst_no: f.customer_gst_no||null, customer_contact_name: f.customer_contact_name||null,
    delivery_at: f.delivery_at||null, delivery_address: f.delivery_address||null,
    delivery_pincode: f.delivery_pincode||null, delivery_state: f.delivery_state||null,
    delivery_country: f.delivery_country||null, delivery_gst_no: f.delivery_gst_no||null,
    delivery_contact_name: f.delivery_contact_name||null, order_through: f.order_through||null,
    agent_name: f.agent_name||null, commission: f.commission||null,
    packing_type: f.packing_type||null, confirm_mode: f.confirm_mode||null,
    confirm_by: f.confirm_by||null, confirm_code: f.confirm_code||null,
    expect_delivery: toSafeDate(f.expect_delivery), pinning: f.pinning||null,
    rate_type: f.rate_type||null, payment_terms: f.payment_terms||null,
    freight: f.freight||null, transport: f.transport||null,
    certification_type: f.certification_type||null, certificate_no: f.certificate_no||null,
    remarks: f.remarks||null, order_type: ob.order_type, quality_type: ob.quality_type,
    hsn_code: ob.hsn_code||null, sort_no: ob.sort_no||null,
    quality: ob.quality||null, delivery_instruction: ob.delivery_instruction||null,
    cgst_pct: Number(ob.cgst_pct)||0, sgst_pct: Number(ob.sgst_pct)||0, igst_pct: Number(ob.igst_pct)||0,
    basic_value: basic, cgst_value: cgst, sgst_value: sgst, igst_value: igst, net_value: net,
    // v9: Firm — the dropdown selection itself ('AEF' or 'AE') is the
    // value sent for the single `firm` column.
    firm: f.firm || null,
    items: ob.items.map(i => ({
      construction_po: i.construction_po, meter: Number(i.meter)||0, rate: Number(i.rate)||0,
      disc_type: i.disc_type, disc_pct: Number(i.disc_pct)||0,
      disc_value: Number(i.disc_value)||0, total_value: Number(i.total_value)||0,
    })),
  };
  if (includeIds) {
    if (f.customer_id)       base.customer_id       = f.customer_id;
    if (f.agent_id)          base.agent_id          = f.agent_id;
    if (f.packing_type_id)   base.packing_type_id   = f.packing_type_id;
    if (f.certification_id)  base.certification_id  = f.certification_id;
    if (f.transport_id)      base.transport_id      = f.transport_id;
  }
  return base;
};

const emptyCustomerOrder = (): CustomerOrder => ({
  order_code: '', order_date: '', po_no: '', po_date: '',
  customer_id: '', customer_name: '', customer_address: '', customer_pincode: '',
  customer_state: '', customer_country: '', customer_gst_no: '', customer_contact_name: '',
  delivery_at: '', delivery_address: '', delivery_pincode: '', delivery_state: '',
  delivery_country: '', delivery_gst_no: '', delivery_contact_name: '',
  order_through: '', agent_id: '', agent_name: '', commission: '',
  packing_type_id: '', packing_type: '', confirm_mode: '', confirm_by: '',
  confirm_code: '', expect_delivery: '', pinning: '', rate_type: '', payment_terms: '',
  freight: '', transport_id: '', transport: '', certification_id: '', certification_type: '', certificate_no: '', remarks: '',
  sample_request_id: null,
  _agentAutoFilled: false,
  // v9
  firm: '',
});

const emptyItem = (): OrderItem => ({
  construction_po: '', meter: 0, rate: 0, disc_type: 'None', disc_pct: 0, disc_value: 0, total_value: 0,
});

const emptyOrderBooking = (): OrderBooking => ({
  order_type: 'Domestic', quality_type: 'Regular', hsn_code: '', sort_no: '',
  quality: '', delivery_instruction: '', cgst_pct: 0, sgst_pct: 0, igst_pct: 5, items: [emptyItem()],
});

const parseItems = (raw?: OrderItem[] | string | null): OrderItem[] => {
  if (!raw) return [emptyItem()];
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [emptyItem()];
    return raw.map(i => ({
      construction_po: str(i.construction_po), meter: Number(i.meter)||0,
      rate: Number(i.rate)||0, disc_type: (i.disc_type as OrderItem['disc_type'])||'None',
      disc_pct: Number(i.disc_pct)||0, disc_value: Number(i.disc_value)||0,
      total_value: Number(i.total_value)||0,
    }));
  }
  if (typeof raw !== 'string') return [emptyItem()];
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'null' || trimmed === '[]') return [emptyItem()];
  try {
    const arr = JSON.parse(trimmed);
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.map(i => ({
        construction_po: str(i.construction_po), meter: Number(i.meter)||0,
        rate: Number(i.rate)||0, disc_type: (i.disc_type as OrderItem['disc_type'])||'None',
        disc_pct: Number(i.disc_pct)||0, disc_value: Number(i.disc_value)||0,
        total_value: Number(i.total_value)||0,
      }));
    }
    return [emptyItem()];
  } catch { return [emptyItem()]; }
};

// ─── SOURCE HELPER ────────────────────────────────────────────────────────────
const getOrderSource = (r: CustomerOrder): 'sr' | 'co' => {
  if (r.sample_request_id) return 'sr';
  if (str(r.remarks).toLowerCase().includes('from sample')) return 'sr';
  return 'co';
};

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

// ─── SAFE FETCH ───────────────────────────────────────────────────────────────
const safeFetch = async (url: string, options?: RequestInit): Promise<Response | null> => {
  try {
    const token = getToken();
    const merged: Record<string, string> = {
      'Content-Type': 'application/json', ...(options?.headers as Record<string, string> || {}),
    };
    if (token) merged['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers: merged });
    if (res.status === 401 || res.status === 403) { console.warn(`[safeFetch] ${res.status} for ${url}`); return null; }
    if (res.status >= 500) return null;
    return res;
  } catch (e) { console.error(`[safeFetch] Network error for ${url}:`, e); return null; }
};

// ─── CUSTOMER DROPDOWN ────────────────────────────────────────────────────────
interface CustomerDropdownProps {
  value: number | string | undefined;
  onChange: (customer: Customer | null) => void;
  customers: Customer[];
  custLoading: boolean;
}
const CustomerDropdown: React.FC<CustomerDropdownProps> = ({ value, onChange, customers, custLoading }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setSearch(''); } };
    document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler);
  }, []);
  useEffect(() => { if (open && searchRef.current) searchRef.current.focus(); }, [open]);
  const filtered = customers.filter(c =>
    c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.customer_id||'').toLowerCase().includes(search.toLowerCase()) ||
    (c.district||'').toLowerCase().includes(search.toLowerCase()) ||
    (c.state||'').toLowerCase().includes(search.toLowerCase())
  );
  const selected = customers.find(c => c.id === Number(value));
  const handleSelect = (c: Customer) => { onChange(c); setOpen(false); setSearch(''); };
  const handleClear  = () => { onChange(null); setOpen(false); setSearch(''); };
  return (
    <div className="cust-dd-wrap" ref={wrapRef}>
      <button type="button" className={`cust-dd-trigger${open?' open':''}${value?' has-value':''}`} onClick={() => setOpen(o => !o)} disabled={custLoading}>
        <span className="cust-dd-trigger-content">
          {custLoading ? <span className="cust-dd-loading"><span className="uom-spin" style={{width:12,height:12,borderWidth:1.5,marginRight:6}}/>Loading customers…</span>
            : selected ? <span className="cust-dd-selected-val">
                {selected.customer_id && <span className="cust-dd-code-badge">{selected.customer_id}</span>}
                <span className="cust-dd-name">{selected.customer_name}</span>
                {selected.district && <span className="cust-dd-district">{selected.district}</span>}
              </span>
            : <span className="cust-dd-placeholder">— Choose a customer —</span>}
        </span>
        <FiChevronDown className={`cust-dd-chevron${open?' rotated':''}`} size={14}/>
      </button>
      {open && (
        <div className="cust-dd-panel">
          <div className="cust-dd-search-wrap">
            <FiSearch className="cust-dd-search-icon" size={13}/>
            <input ref={searchRef} className="cust-dd-search" placeholder="Search customers, code, district…" value={search} onChange={e => setSearch(e.target.value)}/>
            {search && <button className="cust-dd-clear" type="button" onClick={() => setSearch('')}><FiX size={13}/></button>}
          </div>
          <div className="cust-dd-count">{filtered.length===0 ? <span style={{color:'#c2410c'}}>No customers match "{search}"</span> : <span>{filtered.length} customer{filtered.length!==1?'s':''}{search?' found':' available'}</span>}</div>
          <div className="cust-dd-list">
            {value && <div className="cust-dd-option cust-dd-clear-opt" onClick={handleClear}><span>— Clear selection —</span></div>}
            {filtered.length===0 ? <div className="cust-dd-empty"><FiSearch size={28} color="#cbd5e1"/><span>No customers found</span></div>
              : filtered.map(c => (
                <div key={c.id} className={`cust-dd-option${c.id===Number(value)?' selected':''}`} onClick={() => handleSelect(c)}>
                  <div className="cust-opt-left">
                    {c.customer_id && <span className="cust-opt-code">{c.customer_id}</span>}
                  </div>
                  <div className="cust-opt-right">
                    <span className="cust-opt-name">{c.customer_name}</span>
                    {(c.district||c.state) && <span className="cust-opt-loc">{[c.district,c.state].filter(Boolean).join(', ')}</span>}
                  </div>
                  {c.id===Number(value) && <FiCheck className="cust-opt-check" size={14}/>}
                </div>
              ))}
          </div>
        </div>
      )}
      {!open && (
        <div className="cust-dd-status">
          {custLoading ? <span style={{color:'#94a3b8'}}>Loading…</span>
            : customers.length>0 ? <span style={{color:'#94a3b8'}}><FiCheck size={11} style={{marginRight:2}}/>{customers.length} customers loaded — click to select</span>
            : <span style={{color:'#f59e0b'}}>No customers from API</span>}
        </div>
      )}
    </div>
  );
};

// ─── HSN DROPDOWN ─────────────────────────────────────────────────────────────
interface HsnDropdownProps {
  value: string; onChange: (val: string) => void;
  hsnCodes: HsnCode[]; hsnLoading: boolean; hsnError?: string;
}
const HsnDropdown: React.FC<HsnDropdownProps> = ({ value, onChange, hsnCodes, hsnLoading, hsnError }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setSearch(''); } };
    document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler);
  }, []);
  useEffect(() => { if (open && searchRef.current) searchRef.current.focus(); }, [open]);
  const filtered = hsnCodes.filter(h => h.hsn_code.toLowerCase().includes(search.toLowerCase()) || (h.description||'').toLowerCase().includes(search.toLowerCase()));
  const handleSelect = (code: string) => { onChange(code); setOpen(false); setSearch(''); };
  return (
    <div className="hsn-dd-wrap" ref={wrapRef}>
      <button type="button" className={`hsn-dd-trigger${open?' open':''}${value?' has-value':''}`} onClick={() => setOpen(o => !o)} disabled={hsnLoading}>
        <span className="hsn-dd-trigger-content">
          {hsnLoading ? <span className="hsn-dd-loading"><span className="uom-spin" style={{width:12,height:12,borderWidth:1.5,marginRight:6}}/>Loading HSN codes…</span>
            : value ? <span className="hsn-dd-selected-val"><span className="hsn-dd-code-badge">{value}</span></span>
            : <span className="hsn-dd-placeholder">— Select HSN Code —</span>}
        </span>
        <FiChevronDown className={`hsn-dd-chevron${open?' rotated':''}`} size={14}/>
      </button>
      {open && (
        <div className="hsn-dd-panel">
          <div className="hsn-dd-search-wrap">
            <FiSearch className="hsn-dd-search-icon" size={13}/>
            <input ref={searchRef} className="hsn-dd-search" placeholder="Search HSN code or description…" value={search} onChange={e => setSearch(e.target.value)}/>
            {search && <button className="hsn-dd-clear" type="button" onClick={() => setSearch('')}><FiX size={13}/></button>}
          </div>
          <div className="hsn-dd-count">{filtered.length===0 ? <span style={{color:'#c2410c'}}>No codes match "{search}"</span> : <span>{filtered.length} code{filtered.length!==1?'s':''}{search?' found':' available'}</span>}</div>
          <div className="hsn-dd-list">
            {value && <div className="hsn-dd-option hsn-dd-clear-opt" onClick={() => handleSelect('')}><span>— Clear selection —</span></div>}
            {filtered.length===0 ? <div className="hsn-dd-empty"><FiSearch size={28} color="#cbd5e1"/><span>No HSN codes found</span></div>
              : filtered.map(h => (
                <div key={h.id} className={`hsn-dd-option${h.hsn_code===value?' selected':''}`} onClick={() => handleSelect(h.hsn_code)}>
                  <span className="hsn-opt-code">{h.hsn_code}</span>
                  {h.hsn_code===value && <FiCheck className="hsn-opt-check" size={14}/>}
                </div>
              ))}
          </div>
        </div>
      )}
      {!open && (
        <div className="hsn-dd-status">
          {hsnLoading ? <span style={{color:'#94a3b8'}}>Loading…</span>
            : hsnError ? <span style={{color:'#c2410c'}}><FiAlertTriangle size={11} style={{marginRight:3}}/>{hsnError}</span>
            : hsnCodes.length>0 ? <span style={{color:'#94a3b8'}}><FiCheck size={11} style={{marginRight:2}}/>{hsnCodes.length} codes loaded — click to select</span>
            : <span style={{color:'#f59e0b'}}>No codes from API — type manually below</span>}
        </div>
      )}
      {!open && hsnCodes.length===0 && !hsnLoading && (
        <input className="ob-input" style={{marginTop:6}} placeholder="Or type HSN code manually (e.g. 58063200)" value={value} onChange={e => onChange(e.target.value)}/>
      )}
    </div>
  );
};

// ─── FABRIC DROPDOWN ──────────────────────────────────────────────────────────
interface FabricDropdownProps { value: string; onChange: (fabric: FabricMaster | null) => void; fabrics: FabricMaster[]; fabricLoading: boolean; }
const FabricDropdown: React.FC<FabricDropdownProps> = ({ value, onChange, fabrics, fabricLoading }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setSearch(''); } };
    document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler);
  }, []);
  useEffect(() => { if (open && searchRef.current) searchRef.current.focus(); }, [open]);
  const filtered = fabrics.filter(f =>
    f.sort_no.toLowerCase().includes(search.toLowerCase()) ||
    (f.fabric_code||'').toLowerCase().includes(search.toLowerCase()) ||
    (f.quality||f.fabric_quality||'').toLowerCase().includes(search.toLowerCase()) ||
    (f.description||f.fabric_description||'').toLowerCase().includes(search.toLowerCase())
  );
  const selected = fabrics.find(f => f.sort_no === value);
  const handleSelect = (fabric: FabricMaster) => { onChange(fabric); setOpen(false); setSearch(''); };
  const handleClear  = () => { onChange(null); setOpen(false); setSearch(''); };
  return (
    <div className="fab-dd-wrap" ref={wrapRef}>
      <button type="button" className={`fab-dd-trigger${open?' open':''}${value?' has-value':''}`} onClick={() => setOpen(o => !o)} disabled={fabricLoading}>
        <span className="fab-dd-trigger-content">
          {fabricLoading ? <span className="fab-dd-loading"><span className="uom-spin" style={{width:12,height:12,borderWidth:1.5,marginRight:6}}/>Loading fabrics…</span>
            : value ? <span className="fab-dd-selected-val"><span className="fab-dd-sort-badge">{value}</span>{selected?.fabric_code && <span className="fab-dd-code">{selected.fabric_code}</span>}<span className="fab-dd-desc">{(selected?.quality||selected?.fabric_quality||'').slice(0,45)}{(selected?.quality||selected?.fabric_quality||'').length>45?'…':''}</span></span>
            : <span className="fab-dd-placeholder">— Select Sort No —</span>}
        </span>
        <FiChevronDown className={`fab-dd-chevron${open?' rotated':''}`} size={14}/>
      </button>
      {open && (
        <div className="fab-dd-panel">
          <div className="fab-dd-search-wrap">
            <FiSearch className="fab-dd-search-icon" size={13}/>
            <input ref={searchRef} className="fab-dd-search" placeholder="Search sort no, fabric code, quality…" value={search} onChange={e => setSearch(e.target.value)}/>
            {search && <button className="fab-dd-clear" type="button" onClick={() => setSearch('')}><FiX size={13}/></button>}
          </div>
          <div className="fab-dd-count">{filtered.length===0 ? <span style={{color:'#c2410c'}}>No fabrics match "{search}"</span> : <span>{filtered.length} fabric{filtered.length!==1?'s':''}{search?' found':' available'}</span>}</div>
          <div className="fab-dd-list">
            {value && <div className="fab-dd-option fab-dd-clear-opt" onClick={handleClear}><span>— Clear selection —</span></div>}
            {filtered.length===0 ? <div className="fab-dd-empty"><FiSearch size={28} color="#cbd5e1"/><span>No fabrics found</span></div>
              : filtered.map(f => {
                const quality = f.quality||f.fabric_quality||'';
                const construction = f.construction||f.construction_po||'';
                return (
                  <div key={f.id} className={`fab-dd-option${f.sort_no===value?' selected':''}`} onClick={() => handleSelect(f)}>
                    <div className="fab-opt-left"><span className="fab-opt-sort">{f.sort_no}</span>{f.fabric_code && <span className="fab-opt-code">{f.fabric_code}</span>}</div>
                    <div className="fab-opt-right">{quality && <span className="fab-opt-quality">{quality.slice(0,60)}{quality.length>60?'…':''}</span>}{construction && <span className="fab-opt-construction">{construction.slice(0,50)}{construction.length>50?'…':''}</span>}</div>
                    {f.sort_no===value && <FiCheck className="fab-opt-check" size={14}/>}
                  </div>
                );
              })}
          </div>
        </div>
      )}
      {!open && (
        <div className="fab-dd-status">
          {fabricLoading ? <span style={{color:'#94a3b8'}}>Loading fabrics…</span>
            : value ? <span className="fab-status-ok"><FiCheck size={11} style={{marginRight:2}}/>Sort No {value} selected — quality & construction auto-filled</span>
            : fabrics.length>0 ? <span style={{color:'#94a3b8'}}><FiCheck size={11} style={{marginRight:2}}/>{fabrics.length} fabrics loaded — click to select</span>
            : <span style={{color:'#f59e0b'}}>No fabrics from API — enter manually</span>}
        </div>
      )}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function UnifiedOrderManagement({ user }: Props) {

  const employeeId = user?.id ?? null;

  const apiBase = useCallback((suffix = ''): string => {
    const params = new URLSearchParams();
    if (user?.id != null) params.set('employee_id', String(user.id));
    const qs = params.toString();
    return qs ? `/api/order-bookings${suffix}?${qs}` : `/api/order-bookings${suffix}`;
  }, [user?.id]);

  const [customers,     setCustomers]     = useState<Customer[]>([]);
  const [agents,        setAgents]        = useState<Agent[]>([]);
  const [packageTypes,  setPackageTypes]  = useState<PackageType[]>([]);
  const [certifications, setCertifications] = useState<CertificationMaster[]>([]);
  const [certLoading,    setCertLoading]    = useState(false);
  const [transports,     setTransports]     = useState<TransportMaster[]>([]);
  const [transportLoading, setTransportLoading] = useState(false);
  const [transportError,   setTransportError]   = useState('');
  const [hsnCodes,      setHsnCodes]      = useState<HsnCode[]>([]);
  const [fabrics,       setFabrics]       = useState<FabricMaster[]>([]);
  const [custLoading,   setCustLoading]   = useState(false);
  const [agentLoading,  setAgentLoading]  = useState(false);
  const [pkgLoading,    setPkgLoading]    = useState(false);
  const [hsnLoading,    setHsnLoading]    = useState(false);
  const [hsnError,      setHsnError]      = useState('');
  const [fabricLoading, setFabricLoading] = useState(false);
  const [orders,        setOrders]        = useState<CustomerOrder[]>([]);
  const [tableLoading,  setTableLoading]  = useState(true);
  const [tableError,    setTableError]    = useState('');
  const [search,        setSearch]        = useState('');
  // v12: Order Date range filter (From / To) — inclusive on both ends
  const [dateFrom,      setDateFrom]      = useState('');
  const [dateTo,        setDateTo]        = useState('');
  const [pageSize,      setPageSize]      = useState(10);
  const [currentPage,   setCurrentPage]   = useState(1);
  const [showCOModal,   setShowCOModal]   = useState(false);
  const [editCOId,      setEditCOId]      = useState<number | null>(null);
  const [coForm,        setCOForm]        = useState<CustomerOrder>(emptyCustomerOrder());
  const [coSaving,      setCOSaving]      = useState(false);
  const [coError,       setCOError]       = useState('');
  const [modalLoading,  setModalLoading]  = useState(false);
  const [showOBModal,   setShowOBModal]   = useState(false);
  const [obForm,        setOBForm]        = useState<OrderBooking>(emptyOrderBooking());
  const [obError,       setOBError]       = useState('');
  const [obApplied,     setObApplied]     = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState<CustomerOrder | null>(null);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteError,   setDeleteError]   = useState('');
  const [convNotifs,    setConvNotifs]    = useState<ConversionNotif[]>([]);
  const [convBellOpen,  setConvBellOpen]  = useState(false);
  const [notifAvailable, setNotifAvailable] = useState<boolean | null>(null);
  const [exportOpen,    setExportOpen]    = useState(false);
  const [exporting,     setExporting]     = useState(false);

  const convBellRef = useRef<HTMLDivElement>(null);
  const exportRef   = useRef<HTMLDivElement>(null);
  const convBellUnread = convNotifs.filter(n => !n.is_read).length;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromSR = params.get('from'); const convId = params.get('convId');
    const code = params.get('code'); const customer = params.get('customer');
    const customerId = params.get('customerId'); const agent = params.get('agent');
    const fabric = params.get('fabric'); const quality = params.get('quality');
    const color = params.get('color'); const qty = params.get('qty');
    if (fromSR && code) {
      const now = new Date();
      const today = [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
      setCOForm({ ...emptyCustomerOrder(), order_code: code, order_date: today,
        customer_name: customer ? decodeURIComponent(customer) : '',
        customer_id: customerId ? decodeURIComponent(customerId) : '',
        agent_name: agent ? decodeURIComponent(agent) : '',
        remarks: fabric
          ? `From sample request ${code}` + (quality?` · Quality: ${decodeURIComponent(quality)}`:'') + (color?` · Color: ${decodeURIComponent(color)}`:'') + (qty?` · ${decodeURIComponent(qty)}m`:'')
          : `From sample request ${code}`,
        _conversionId: convId ? Number(convId) : undefined,
      } as CustomerOrder);
      setObApplied(false); setEditCOId(null); setShowCOModal(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const obBasic = useMemo(() => obForm.items.reduce((s, i) => s+(Number(i.total_value)||0), 0), [obForm.items]);
  const obCGST  = +(obBasic*(Number(obForm.cgst_pct)||0)/100).toFixed(2);
  const obSGST  = +(obBasic*(Number(obForm.sgst_pct)||0)/100).toFixed(2);
  const obIGST  = +(obBasic*(Number(obForm.igst_pct)||0)/100).toFixed(2);
  const obNet   = +(obBasic+obCGST+obSGST+obIGST).toFixed(2);

  const pollConversionNotifs = useCallback(async () => {
    if (notifAvailable === false) return;
    try {
      const res = await safeFetch('/api/notifications?role=admin&limit=40&unread_only=0');
      if (!res) { if (notifAvailable===null) setNotifAvailable(false); return; }
      if (!res.ok) { setNotifAvailable(false); return; }
      if (notifAvailable!==true) setNotifAvailable(true);
      const data: ConversionNotif[] = await res.json();
      setConvNotifs(data.filter(n => n.type==='order_conversion').map(n => ({
        ...n, meta: typeof n.meta==='string' ? (() => { try { return JSON.parse(n.meta as any); } catch { return {}; } })() : (n.meta||{}),
      })));
    } catch { if (notifAvailable===null) setNotifAvailable(false); }
  }, [notifAvailable]);

  useEffect(() => {
    if (notifAvailable===false) return;
    pollConversionNotifs();
    const t = setInterval(() => { pollConversionNotifs(); }, 8000);
    return () => clearInterval(t);
  }, [pollConversionNotifs, notifAvailable]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (convBellRef.current && !convBellRef.current.contains(e.target as Node)) setConvBellOpen(false); };
    document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markConvNotifRead = async (notifId: number) => {
    if (notifAvailable!==true) return;
    try { await safeFetch(`/api/notifications/${notifId}/read`, {method:'PATCH'}); setConvNotifs(prev => prev.map(n => n.id===notifId ? {...n,is_read:1} : n)); } catch { }
  };
  const markAllConvNotifsRead = async () => {
    if (notifAvailable!==true) return;
    try { await safeFetch('/api/notifications/read-all', {method:'PATCH',body:JSON.stringify({role:'admin'})}); setConvNotifs(prev => prev.map(n => ({...n,is_read:1}))); } catch { }
  };
  const handleConvNotifClick = (n: ConversionNotif) => {
    markConvNotifRead(n.id); setConvBellOpen(false);
    const m = n.meta||{}; const today = new Date().toISOString().slice(0,10);
    setCOForm({ ...emptyCustomerOrder(), order_code: m.request_code||'', order_date: today,
      customer_name: m.customer_name||'', customer_id: m.customer_id||'', agent_name: m.agent_name||'',
      remarks: m.fabric_code
        ? `From sample ${m.request_code||''}` + (m.fabric_quality?` · ${m.fabric_quality}`:'') + (m.color?` · ${m.color}`:'') + (m.quantity_meters?` · ${m.quantity_meters}m`:'')
        : `From sample ${m.request_code||''}`,
      _conversionId: n.conversion_id,
    } as CustomerOrder);
    setObApplied(false); setEditCOId(null); setShowCOModal(true);
  };

  const loadOrders = useCallback(async () => {
    setTableLoading(true); setTableError('');
    try {
      const res = await safeFetch(apiBase());
      if (!res) { setTableError('Authentication failed (401).'); setTableLoading(false); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load orders');
      const raw = data.data || data;
      setOrders((Array.isArray(raw)?raw:[]).map(normaliseOrder));
    } catch (e: any) { setTableError(e.message || 'Could not load orders'); }
    finally { setTableLoading(false); }
  }, [apiBase]);

  const fetchOrderById = useCallback(async (id: number): Promise<CustomerOrder | null> => {
    try {
      const res = await safeFetch(apiBase(`/${id}`));
      if (!res || res.status===404 || !res.ok) return null;
      const data = await res.json();
      return (data.data || data) as CustomerOrder;
    } catch { return null; }
  }, [apiBase]);

  const fetchCustomers = useCallback(async (query = '') => {
    setCustLoading(true);
    try {
      const params = query ? `?search=${encodeURIComponent(query)}` : '';
      const res = await safeFetch(`/api/customers${params}`);
      if (!res) { setCustomers([]); return; }
      const data = await res.json();
      setCustomers(data.data||data||[]);
    } catch { setCustomers([]); }
    finally { setCustLoading(false); }
  }, []);

  const fetchAgents = useCallback(async () => {
    setAgentLoading(true);
    try { const res = await safeFetch('/api/agents'); if (!res) { setAgents([]); return; } const data = await res.json(); setAgents(data.data||data||[]); } catch { setAgents([]); }
    finally { setAgentLoading(false); }
  }, []);

  const fetchPackageTypes = useCallback(async () => {
    setPkgLoading(true);
    try { const res = await safeFetch('/api/packages'); if (!res) { setPackageTypes([]); return; } const data = await res.json(); setPackageTypes(data.data||data||[]); } catch { setPackageTypes([]); }
    finally { setPkgLoading(false); }
  }, []);

  const fetchCertifications = useCallback(async () => {
    setCertLoading(true);
    try {
      const ENDPOINTS = [
        '/api/certifications?limit=500',
        '/api/certification-master?limit=500',
        '/api/certificate-types?limit=500',
        '/api/certifications-master?limit=500',
      ];
      let raw: any[] = [];
      for (const ep of ENDPOINTS) {
        const res = await safeFetch(ep); if (!res||!res.ok) continue;
        let json: any; try { json = await res.json(); } catch { continue; }
        const candidate = (Array.isArray(json)?json:null)||(Array.isArray(json?.data)?json.data:null)||(Array.isArray(json?.certifications)?json.certifications:null)||(Array.isArray(json?.rows)?json.rows:null)||(Array.isArray(json?.items)?json.items:null)||null;
        if (candidate&&candidate.length>0) { raw=candidate; break; }
      }
      const parsed: CertificationMaster[] = raw
        .filter((c:any) => { const status=(c.status??c.is_active??''); if (typeof status==='string'&&status.toLowerCase()==='inactive') return false; if (status===0||status===false) return false; return true; })
        .map((c:any, idx:number) => ({
          id: c.id ?? idx,
          certification_type: str(c.certification_type||c.type_name||c.certification_name||c.name||c.title||''),
          certification_code: str(c.certification_code||c.certificate_no||c.code||c.cert_no||c.number||''),
        }))
        .filter((c: CertificationMaster) => c.certification_type.length>0);
      setCertifications(parsed);
    } catch { setCertifications([]); }
    finally { setCertLoading(false); }
  }, []);

  const fetchTransports = useCallback(async () => {
    setTransportLoading(true); setTransportError('');
    try {
      const res = await safeFetch('/api/transports?limit=500');
      if (!res || !res.ok) {
        console.warn(`[fetchTransports] /api/transports -> ${res ? res.status : 'no response (network/auth)'}`);
        setTransports([]);
        setTransportError('No transports from API — type manually below');
        return;
      }
      let json: any; try { json = await res.json(); } catch { json = null; }
      const raw: any[] = Array.isArray(json) ? json
        : Array.isArray(json?.data) ? json.data
        : Array.isArray(json?.transports) ? json.transports
        : Array.isArray(json?.rows) ? json.rows
        : [];

      if (raw.length===0) {
        console.warn('[fetchTransports] /api/transports returned no rows.', json);
        setTransportError('No transports from API — type manually below');
      }

      const parsed: TransportMaster[] = raw
        .filter((t:any) => str(t.status).toLowerCase() !== 'inactive')
        .map((t:any, idx:number) => ({
          id: t.id ?? idx,
          transport_name: str(t.transport_company||t.transport_name||t.transporter_name||t.name||''),
          transport_code: str(t.transport_code||t.code||''),
        }))
        .filter((t: TransportMaster) => t.transport_name.length>0);
      setTransports(parsed);
    } catch { setTransports([]); setTransportError('Failed to load transports'); }
    finally { setTransportLoading(false); }
  }, []);

  const fetchHsnCodes = useCallback(async () => {
    setHsnLoading(true); setHsnError('');
    try {
      const ENDPOINTS = ['/api/hsn?limit=500','/api/hsn-codes?limit=500','/api/hsn'];
      let raw: any[] = [];
      for (const ep of ENDPOINTS) {
        const res = await safeFetch(ep); if (!res||!res.ok) continue;
        let json: any; try { json = await res.json(); } catch { continue; }
        const candidate = (Array.isArray(json)?json:null)||(Array.isArray(json?.data)?json.data:null)||(Array.isArray(json?.hsn_codes)?json.hsn_codes:null)||(Array.isArray(json?.rows)?json.rows:null)||(Array.isArray(json?.items)?json.items:null)||(Array.isArray(json?.results)?json.results:null)||null;
        if (candidate&&candidate.length>0) { raw=candidate; break; }
      }
      if (raw.length===0) { setHsnError('No HSN codes from API — use manual entry'); setHsnCodes([]); return; }
      const parsed: HsnCode[] = raw
        .filter((h:any) => { const status=(h.status||h.is_active||''); if (typeof status==='string'&&status.toLowerCase()==='inactive') return false; if (status===0||status===false) return false; return true; })
        .map((h:any,idx:number) => ({ id:h.id??idx, hsn_code:str(h.hsn_code||h.code||h.hsn||h.HSN_CODE||''), description:str(h.hsn_short_desc||h.description||h.short_desc||h.name||h.desc||'') }))
        .filter((h:HsnCode) => h.hsn_code.length>0);
      setHsnCodes(parsed);
    } catch { setHsnError('Failed to load HSN codes'); setHsnCodes([]); }
    finally { setHsnLoading(false); }
  }, []);

  const fetchFabrics = useCallback(async () => {
    setFabricLoading(true);
    try {
      const ENDPOINTS = ['/api/fabric-masters?limit=500','/api/fabrics?limit=500','/api/fabric-master?limit=500','/api/fabric?limit=500'];
      let raw: any[] = [];
      for (const ep of ENDPOINTS) {
        const res = await safeFetch(ep); if (!res||!res.ok) continue;
        let json: any; try { json = await res.json(); } catch { continue; }
        const candidate = (Array.isArray(json)?json:null)||(Array.isArray(json?.data)?json.data:null)||(Array.isArray(json?.fabrics)?json.fabrics:null)||(Array.isArray(json?.rows)?json.rows:null)||null;
        if (candidate&&candidate.length>0) { raw=candidate; break; }
      }
      const parsed: FabricMaster[] = raw.map((f:any,idx:number) => {
        const warp=str(f.warp||f.warp_count||f.warpCount||f.warp_yarn||'');
        const weft=str(f.weft||f.weft_count||f.weftCount||f.weft_yarn||'');
        const reed=str(f.reed||f.reed_count||f.reedCount||f.ends_per_cm||'');
        const pick=str(f.pick||f.pick_count||f.pickCount||f.picks_per_cm||'');
        const width=str(f.width||f.fabric_width||f.fabricWidth||f.loom_width||'');
        const weave=str(f.weave||f.weave_type||f.weaveType||f.weave_design||'');
        const design=str(f.design||f.design_type||f.designType||f.pattern||'');
        const apiConstruction=str(f.construction||f.construction_po||f.constructionPo||f.construction_desc||'');
        const isJunkValue=apiConstruction!==''&&/^\d+(\.\d+)?$/.test(apiConstruction.trim());
        const resolvedConstruction=(!apiConstruction||isJunkValue)?buildConstructionString(warp,weft,reed,pick,width,weave,design):apiConstruction;
        return { id:f.id??idx, sort_no:str(f.sort_no||f.sortNo||f.sort||f.sort_number||f.code||''), fabric_code:str(f.fabric_code||f.fabricCode||f.code||''), quality:str(f.quality||f.fabric_quality||f.quality_desc||f.qualityDesc||''), construction:resolvedConstruction, construction_po:resolvedConstruction, hsn_code:str(f.hsn_code||f.hsnCode||''), description:str(f.description||f.fabric_description||''), fabric_quality:str(f.fabric_quality||f.quality||''), fabric_description:str(f.fabric_description||f.description||''), warp,weft,reed,pick,width,weave,design } as FabricMaster;
      }).filter((f:FabricMaster) => f.sort_no.length>0);
      setFabrics(parsed);
    } catch { setFabrics([]); }
    finally { setFabricLoading(false); }
  }, []);

  useEffect(() => { loadOrders(); fetchCustomers(); fetchAgents(); fetchPackageTypes(); fetchCertifications(); fetchTransports(); fetchHsnCodes(); fetchFabrics(); }, [loadOrders,fetchCustomers,fetchAgents,fetchPackageTypes,fetchCertifications,fetchTransports,fetchHsnCodes,fetchFabrics]);
  useEffect(() => { setCurrentPage(1); }, [search, dateFrom, dateTo]);

  const setCO = (key: keyof CustomerOrder) => (e: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>) => setCOForm(prev => ({...prev,[key]:e.target.value}));

  // ── v9: Firm dropdown handler ────────────────────────────────────────────
  // The selected option itself (AEF or AE) is the value stored to the
  // single `firm` DB column — there's no separate free-text entry anymore.
  const handleFirmChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCOForm(prev => ({ ...prev, firm: e.target.value as FirmType }));
  };

  // ── v7: handleCustomerSelect — auto-fills address fields AND agent name ──
  // When a customer is selected, we look up their agent from the loaded
  // agents master (by agent_id FK first, agent_name string fallback).
  // The _agentAutoFilled flag lets the UI show the "Auto-filled from
  // customer" badge. Clearing the customer also clears the agent.
  const handleCustomerSelect = (customer: Customer | null) => {
    if (!customer) {
      setCOForm(prev => ({
        ...prev,
        customer_id: '', customer_name: '', customer_address: '', customer_pincode: '',
        customer_state: '', customer_country: '', customer_gst_no: '', customer_contact_name: '',
        delivery_address: '', delivery_pincode: '', delivery_state: '', delivery_country: '',
        delivery_gst_no: '', delivery_contact_name: '',
        // Clear agent when customer is cleared
        agent_id: '', agent_name: '', _agentAutoFilled: false,
      }));
      return;
    }

    const c = customer;

    // Resolve agent_id / agent_name from customer record —
    // supports common field name variations returned by different APIs.
    const custAgentId   = c.agent_id   ?? c.default_agent_id   ?? c.preferred_agent_id   ?? null;
    const custAgentName = c.agent_name ?? c.default_agent_name ?? c.preferred_agent       ?? null;

    // Try FK match first (most reliable), then fall back to name match.
    const matchedAgent = agents.find(a =>
      (custAgentId   && a.id === Number(custAgentId)) ||
      (custAgentName && a.agent_name.toLowerCase() === str(custAgentName).toLowerCase())
    );

    const resolvedAgentId   = matchedAgent ? matchedAgent.id        : (custAgentId   ?? '');
    const resolvedAgentName = matchedAgent ? matchedAgent.agent_name : (custAgentName ? str(custAgentName) : '');
    const agentAutoFilled   = !!(resolvedAgentId || resolvedAgentName);

    setCOForm(prev => ({
      ...prev,
      customer_id:           c.id,
      customer_name:         str(c.customer_name),
      customer_address:      str(c.address),
      customer_pincode:      str(c.pin_code),
      customer_state:        str(c.state),
      customer_country:      str(c.country),
      customer_gst_no:       str(c.gst_no),
      customer_contact_name: str(c.contact_name),
      delivery_address:      str(c.shipping_address      || c.address),
      delivery_pincode:      str(c.shipping_pin_code     || c.pin_code),
      delivery_state:        str(c.shipping_state        || c.state),
      delivery_country:      str(c.shipping_country      || c.country),
      delivery_gst_no:       str(c.shipping_gst_no       || c.gst_no),
      delivery_contact_name: str(c.shipping_contact_name || c.contact_name),
      // Agent auto-fill
      agent_id:           resolvedAgentId,
      agent_name:         resolvedAgentName,
      _agentAutoFilled:   agentAutoFilled,
    }));
  };

  const handleAgentSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    if (!id) { setCOForm(prev => ({...prev, agent_id:'', agent_name:'', _agentAutoFilled:false})); return; }
    const a = agents.find(x => x.id===id);
    // Manual selection clears the auto-fill badge
    if (a) setCOForm(prev => ({...prev, agent_id:a.id, agent_name:a.agent_name, _agentAutoFilled:false}));
  };

  const handlePackageTypeSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value); if (!id) { setCOForm(prev => ({...prev,packing_type_id:'',packing_type:''})); return; }
    const p = packageTypes.find(x => x.id===id); if (p) setCOForm(prev => ({...prev,packing_type_id:p.id,packing_type:p.package_name}));
  };

  const handleCertificationSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    if (!id) { setCOForm(prev => ({...prev,certification_id:'',certification_type:'',certificate_no:''})); return; }
    const c = certifications.find(x => x.id===id);
    if (c) setCOForm(prev => ({...prev,certification_id:c.id,certification_type:c.certification_type,certificate_no:c.certification_code||prev.certificate_no}));
  };

  const handleTransportSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    if (!id) { setCOForm(prev => ({...prev,transport_id:'',transport:''})); return; }
    const t = transports.find(x => x.id===id);
    if (t) setCOForm(prev => ({...prev,transport_id:t.id,transport:t.transport_name}));
  };

  const handleFabricSelect = (fabric: FabricMaster | null) => {
    if (!fabric) { setOBForm(prev => ({...prev,sort_no:'',quality:'',items:[emptyItem()]})); return; }
    const construction = str(fabric.construction_po||fabric.construction||'');
    const newHsn = str(fabric.hsn_code||'').trim();
    setOBForm(prev => ({...prev, sort_no:fabric.sort_no, quality:construction, hsn_code:newHsn||prev.hsn_code, items:construction?[{...emptyItem(),construction_po:construction},...prev.items.slice(1)]:prev.items}));
    if (newHsn) setHsnCodes(prev => prev.find(h => h.hsn_code===newHsn) ? prev : [{id:-1,hsn_code:newHsn,description:`(from fabric ${fabric.fabric_code||fabric.sort_no})`},...prev]);
  };

  const openCOModal = async (r?: CustomerOrder) => {
    setCOError(''); setOBError('');
    if (r?.id) {
      setModalLoading(true); setShowCOModal(true); setEditCOId(r.id);
      const preSource = normaliseOrder({...r}); setCOForm(preSource);
      const fresh = await fetchOrderById(r.id);
      const source = fresh ? normaliseOrder(fresh) : preSource; setCOForm(source);
      const parsedItems = parseItems(source.items as any);
      const hasRealItems = parsedItems.length>0 && parsedItems.some(i => i.construction_po!=='');
      const hasOBData = str(source.hsn_code)!==''||str(source.sort_no)!==''||str(source.quality)!==''||Number(source.basic_value)>0||hasRealItems;
      if (hasOBData) {
        setOBForm({ order_type:(source.order_type as 'Domestic'|'Export')||'Domestic', quality_type:source.quality_type||'Regular', hsn_code:str(source.hsn_code), sort_no:str(source.sort_no), quality:str(source.quality), delivery_instruction:str(source.delivery_instruction), cgst_pct:Number(source.cgst_pct)||0, sgst_pct:Number(source.sgst_pct)||0, igst_pct:Number(source.igst_pct)||0, items:hasRealItems?parsedItems:[emptyItem()] });
        const savedHsn = str(source.hsn_code);
        if (savedHsn) setHsnCodes(prev => prev.find(h => h.hsn_code===savedHsn) ? prev : [{id:-1,hsn_code:savedHsn,description:'(saved)'},...prev]);
        setObApplied(true);
      } else { setOBForm(emptyOrderBooking()); setObApplied(false); }
      setModalLoading(false);
    } else {
      setEditCOId(null);
      if (!(coForm as any)._conversionId && !coForm.order_code) setCOForm(emptyCustomerOrder());
      setOBForm(emptyOrderBooking()); setObApplied(false); setShowCOModal(true);
    }
  };

  const closeCOModal = () => {
    setShowCOModal(false); setShowOBModal(false); setEditCOId(null);
    setCOForm(emptyCustomerOrder()); setOBForm(emptyOrderBooking()); setObApplied(false);
    setCOError(''); setOBError(''); setModalLoading(false);
  };

  const attemptSave = async (url: string, method: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const res = await safeFetch(url, {method, body:JSON.stringify(payload)});
    if (!res) throw new Error('Authentication failed (401). Please log in again.');
    const contentType = res.headers.get('content-type')||'';
    if (!contentType.includes('application/json')) throw new Error(`Server returned non-JSON response (${res.status}).`);
    const data = await res.json();
    if (!res.ok) { const err: any = new Error(data.message||data.error||(method==='PUT'?'Update failed':'Create failed')); err.status=res.status; err.data=data; throw err; }
    return data;
  };

  const handleCOSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coForm.order_code.trim()) { setCOError('Order Code is required.'); return; }
    setCOError(''); setCOSaving(true);
    const basic = obForm.items.reduce((s,i) => s+(Number(i.total_value)||0), 0);
    const cgst = +(basic*(Number(obForm.cgst_pct)||0)/100).toFixed(2);
    const sgst = +(basic*(Number(obForm.sgst_pct)||0)/100).toFixed(2);
    const igst = +(basic*(Number(obForm.igst_pct)||0)/100).toFixed(2);
    const net  = +(basic+cgst+sgst+igst).toFixed(2);
    try {
      let url    = editCOId ? apiBase(`/${editCOId}`) : apiBase();
      let method = editCOId ? 'PUT' : 'POST';
      if (!editCOId) {
        const existing = orders.find(o => o.order_code.trim().toLowerCase()===coForm.order_code.trim().toLowerCase());
        if (existing?.id) { url=apiBase(`/${existing.id}`); method='PUT'; }
      }
      const payload = buildOrderPayload(coForm,obForm,basic,cgst,sgst,igst,net,true);
      let saveResult: Record<string,unknown> = {}; let saveError: any = null;
      try { saveResult = await attemptSave(url,method,payload); } catch (err: any) { saveError=err; }
      if (saveError) {
        const isDuplicate=(saveError?.data?.message||saveError?.message||'').toLowerCase().match(/duplicate|already exists/)||saveError?.status===409;
        if (isDuplicate && !editCOId) {
          const listRes = await safeFetch(apiBase());
          if (listRes&&listRes.ok) {
            const listData=await listRes.json();
            const listRaw:CustomerOrder[]=Array.isArray(listData.data||listData)?(listData.data||listData):[];
            const found=listRaw.find(o => str(o.order_code).trim().toLowerCase()===coForm.order_code.trim().toLowerCase());
            if (found?.id) { try { saveResult=await attemptSave(apiBase(`/${found.id}`),'PUT',payload); saveError=null; } catch (retryErr:any) { saveError=retryErr; } }
          }
        }
        const errMsg=(saveError?.data?.message||saveError?.message||'').toLowerCase();
        if (saveError&&(errMsg.includes('unknown column')||errMsg.includes("doesn't exist")||errMsg.includes('field list'))) {
          const payloadNoIds=buildOrderPayload(coForm,obForm,basic,cgst,sgst,igst,net,false);
          try { saveResult=await attemptSave(url,method,payloadNoIds); saveError=null; } catch (retryErr:any) { saveError=retryErr; }
        }
        if (saveError) throw saveError;
      }
      const convId = (coForm as any)._conversionId;
      if (convId && notifAvailable===true) {
        const savedOrderId = (saveResult as any)?.id||editCOId;
        try { await safeFetch(`/api/order-conversions/${convId}`, {method:'PUT',body:JSON.stringify({status:'converted',order_id:savedOrderId||null,order_code:coForm.order_code})}); const matchingNotif=convNotifs.find(n => n.conversion_id===convId); if (matchingNotif) markConvNotifRead(matchingNotif.id); pollConversionNotifs(); } catch { }
      }
      closeCOModal(); loadOrders();
    } catch (e: any) { setCOError(e.message||'Save failed. Please try again.'); }
    finally { setCOSaving(false); }
  };

  const recalcItem = (item: OrderItem): OrderItem => {
    const basic = +(item.meter*item.rate).toFixed(2); let dv = 0;
    if (item.disc_type==='Percent') dv=+(basic*item.disc_pct/100).toFixed(2);
    else if (item.disc_type==='Flat') dv=+item.disc_value;
    return {...item,disc_value:dv,total_value:+(basic-dv).toFixed(2)};
  };
  const updateOBItem = (idx: number, patch: Partial<OrderItem>) => setOBForm(f => { const items=[...f.items]; items[idx]=recalcItem({...items[idx],...patch}); return {...f,items}; });

  const handleOBApply = () => {
    setOBError('');
    if (!obForm.hsn_code.trim()||!obForm.sort_no.trim()||!obForm.quality.trim()) { setOBError('HSN Code, Sort No & Quality are required.'); return; }
    if (obForm.items.some(i => !i.construction_po.trim())) { setOBError('All construction rows must have a description.'); return; }
    setObApplied(true); setShowOBModal(false);
  };
  const openOBModal  = () => { setOBError(''); setShowOBModal(true); };
  const closeOBModal = () => { setShowOBModal(false); setOBError(''); };

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return; setDeleting(true); setDeleteError('');
    try {
      const res = await safeFetch(apiBase(`/${deleteTarget.id}`), {method:'DELETE'});
      if (!res) throw new Error('Authentication failed (401).');
      if (!res.ok) { const d=await res.json(); throw new Error(d.message||'Delete failed'); }
      setDeleteTarget(null); loadOrders();
    } catch (e: any) { setDeleteError(e.message||'Failed to delete order'); }
    finally { setDeleting(false); }
  };

  // ── v12: Order Date range filter helper ────────────────────────────────────
  // Inclusive comparison on the 'YYYY-MM-DD' string form of order_date, so it
  // works correctly regardless of what date/time format the API returns.
  const inDateRange = (r: CustomerOrder): boolean => {
    if (!dateFrom && !dateTo) return true;
    const d = toDateStr(r.order_date);
    if (!d) return false;
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  };
  const clearDateFilter = () => { setDateFrom(''); setDateTo(''); };

  // ── Export / Print helpers ─────────────────────────────────────────────────
  const fetchAllOrdersForExport = async (): Promise<CustomerOrder[]> => {
    try {
      const qs = new URLSearchParams();
      if (user?.id != null) qs.set('employee_id', String(user.id));
      if (search.trim()) qs.set('search', search.trim());
      if (dateFrom) qs.set('date_from', dateFrom);
      if (dateTo) qs.set('date_to', dateTo);
      qs.set('limit', '10000');
      qs.set('page', '1');
      const url = `/api/order-bookings?${qs.toString()}`;
      const res = await safeFetch(url);
      if (!res) return [];
      const data = await res.json();
      const raw = data.data || data;
      // Belt-and-braces: also apply the date filter client-side in case the
      // backend doesn't support date_from/date_to yet.
      return (Array.isArray(raw) ? raw : []).map(normaliseOrder).filter(inDateRange);
    } catch {
      return [];
    }
  };

  const buildExportRows = (data: CustomerOrder[]) =>
    data.map((r, i) => {
      const custCode = (() => {
        if (!r.customer_id) return '';
        if (typeof r.customer_id === 'string' && isNaN(Number(r.customer_id))) return r.customer_id;
        const matched = customers.find(c => c.id === Number(r.customer_id));
        return matched?.customer_id ?? str(r.customer_id);
      })();
      return {
        '#':                i + 1,
        'Order Code':       r.order_code ?? '',
        'Customer Code':    custCode,
        'Order Date':       fmtDate(r.order_date),
        'PO No':            r.po_no ?? '',
        'PO Date':          fmtDate(r.po_date),
        'Customer Name':    r.customer_name ?? '',
        'Customer State':   r.customer_state ?? '',
        'Delivery At':      r.delivery_at ?? '',
        'Exp. Delivery':    fmtDate(r.expect_delivery),
        'Transport':        r.transport ?? '',
        'Firm':             r.firm || '',
        'Quality':          r.quality ?? '',
        'Order Type':       r.order_type ?? '',
        'Sort No':          r.sort_no ?? '',
        'HSN Code':         r.hsn_code ?? '',
        'Confirm By':       r.confirm_by ?? '',
        'Agent':            r.agent_name ?? '',
        'Net Value':        r.net_value != null ? Number(r.net_value).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '',
        'Source':           getOrderSource(r) === 'sr' ? 'SR-Converted' : 'CO',
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
    setExportOpen(false); setExporting(true);
    const data = await fetchAllOrdersForExport();
    if (!data.length) { setExporting(false); return; }
    const rows    = buildExportRows(data);
    const headers = Object.keys(rows[0]);
    const lines   = [
      headers.join(','),
      ...rows.map(r => headers.map(h => escapeCsv((r as any)[h])).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `customer-orders-${new Date().toISOString().slice(0,10)}.csv`);
    setExporting(false);
  };

  const handleExportExcel = async () => {
    setExportOpen(false); setExporting(true);
    const data = await fetchAllOrdersForExport();
    if (!data.length) { setExporting(false); return; }
    const rows    = buildExportRows(data);
    const headers = Object.keys(rows[0]);
    const tableHtml = `
      <table border="1">
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${(r as any)[h] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
    const htmlDoc = `<html><head><meta charset="UTF-8"></head><body>${tableHtml}</body></html>`;
    const blob = new Blob([htmlDoc], { type: 'application/vnd.ms-excel' });
    downloadBlob(blob, `customer-orders-${new Date().toISOString().slice(0,10)}.xls`);
    setExporting(false);
  };

  const handlePrintTable = async () => {
    setExportOpen(false); setExporting(true);
    const data = await fetchAllOrdersForExport();
    if (!data.length) { setExporting(false); return; }
    const rows    = buildExportRows(data);
    const headers = Object.keys(rows[0]);
    const win = window.open('', '_blank', 'width=1100,height=700');
    if (!win) { setExporting(false); return; }
    win.document.write(`
      <html>
        <head>
          <title>Customer Orders</title>
          <style>
            body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; padding: 24px; color: #1a2332; }
            h2 { margin: 0 0 4px; font-size: 18px; }
            p { margin: 0 0 16px; color: #64748b; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
            th { background: #1a56db; color: #fff; }
            tr:nth-child(even) td { background: #eff6ff; }
          </style>
        </head>
        <body>
          <h2>Customer Orders</h2>
          <p>${rows.length} record(s) · Printed on ${new Date().toLocaleString('en-IN')}</p>
          <table>
            <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${(r as any)[h] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
          <script>window.onload = function(){ window.print(); };<\/script>
        </body>
      </html>
    `);
    win.document.close();
    setExporting(false);
  };

  // ── Table filtering & pagination ──────────────────────────────────────────
  const filtered   = orders
    .filter(r => [r.order_code,r.customer_name,r.po_no,r.transport,r.customer_state,str(r.customer_id)].some(v => (v||'').toLowerCase().includes(search.toLowerCase())))
    .filter(inDateRange);
  const totalPages = Math.max(1, Math.ceil(filtered.length/pageSize));
  const paginated  = filtered.slice((currentPage-1)*pageSize, currentPage*pageSize);
  const goTo       = (p: number) => setCurrentPage(Math.min(Math.max(1,p), totalPages));
  const pageNums   = (() => { const nums:number[]=[]; const s=Math.max(1,currentPage-2); const e=Math.min(totalPages,s+4); const start=e-s<4?Math.max(1,e-4):s; for(let i=start;i<=e;i++) nums.push(i); return nums; })();
  const selectedCustomer  = customers.find(c => c.id===Number(coForm.customer_id));
  const isReadonly        = !!coForm.customer_id;
  const obEnabled         = coForm.order_code.trim().length>0;
  const isDuplicateCode   = !editCOId && coForm.order_code.trim().length>0 && orders.some(o => o.order_code.trim().toLowerCase()===coForm.order_code.trim().toLowerCase());
  const isFromConversion  = !!(coForm as any)._conversionId;
  const dateFilterActive  = !!(dateFrom || dateTo);

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .uom-root { font-family: 'Plus Jakarta Sans', sans-serif; background: #f0f4f8; min-height: 100vh; color: #1a2332; font-size: 13.5px; }
        .uom-page-header { padding: 20px 28px 0; display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .uom-page-title { font-size: 22px; font-weight: 800; color: #1a2332; letter-spacing: -0.5px; }
        .uom-page-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
        .uom-new-btn { display: flex; align-items: center; gap: 7px; background: #1a56db; color: #fff; border: none; border-radius: 10px; padding: 10px 20px; font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: inherit; transition: background 0.15s, transform 0.1s; box-shadow: 0 3px 10px rgba(26,86,219,0.3); }
        .uom-new-btn:hover { background: #1649c0; transform: translateY(-1px); }
        .uom-conv-banner { margin: 12px 28px 0; background: linear-gradient(135deg,#ede9fe,#faf5ff); border: 1.5px solid #c4b5fd; border-radius: 10px; padding: 11px 16px; font-size: 13px; color: #4c1d95; display: flex; align-items: center; gap: 10px; }
        .uom-dup-warn { background: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 7px 12px; font-size: 12px; color: #92400e; margin-top: 4px; display: flex; align-items: center; gap: 6px; font-weight: 600; }
        .uom-toolbar { padding: 16px 28px 12px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .uom-search-wrap { position: relative; flex: 1; min-width: 200px; max-width: 340px; }
        .uom-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; }
        .uom-search { width: 100%; padding: 8px 14px 8px 34px; border: 1px solid #dde3ec; border-radius: 9px; font-size: 13px; font-family: inherit; background: #fff; color: #1a2332; outline: none; transition: border 0.15s, box-shadow 0.15s; }
        .uom-search:focus { border-color: #1a56db; box-shadow: 0 0 0 3px rgba(26,86,219,0.1); }
        .uom-date-filter { display: flex; align-items: center; gap: 6px; background: #fff; border: 1px solid #dde3ec; border-radius: 9px; padding: 5px 10px; flex-wrap: wrap; }
        .uom-date-filter.active { border-color: #1a56db; box-shadow: 0 0 0 3px rgba(26,86,219,0.08); background: #f8fbff; }
        .uom-date-filter-icon { color: #94a3b8; flex-shrink: 0; display: flex; align-items: center; }
        .uom-date-filter.active .uom-date-filter-icon { color: #1a56db; }
        .uom-date-filter-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
        .uom-date-input { border: 1px solid #dde3ec; border-radius: 7px; padding: 5px 8px; font-size: 12.5px; font-family: inherit; background: #fff; color: #1a2332; outline: none; transition: border 0.15s; }
        .uom-date-input:focus { border-color: #1a56db; box-shadow: 0 0 0 2px rgba(26,86,219,0.1); }
        .uom-date-sep { color: #94a3b8; font-size: 12px; font-weight: 600; }
        .uom-date-clear { background: none; border: none; cursor: pointer; color: #94a3b8; display: flex; align-items: center; padding: 2px; border-radius: 5px; transition: background 0.12s, color 0.12s; }
        .uom-date-clear:hover { background: #fee2e2; color: #dc2626; }
        .uom-rec-count { font-size: 12.5px; color: #64748b; white-space: nowrap; }
        .uom-page-size { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #64748b; }
        .uom-page-size select { border: 1px solid #dde3ec; border-radius: 7px; padding: 6px 10px; font-size: 12.5px; font-family: inherit; background: #fff; cursor: pointer; outline: none; transition: border 0.15s; }
        .uom-page-size select:focus { border-color: #1a56db; }
        .uom-card { margin: 0 28px 28px; background: #fff; border-radius: 14px; border: 1px solid #e2e8f0; box-shadow: 0 2px 12px rgba(0,0,0,0.07); overflow: hidden; }
        .uom-table-wrap { overflow-x: auto; overflow-y: visible; scrollbar-width: thin; scrollbar-color: #c7d3e8 transparent; }
        .uom-table-wrap::-webkit-scrollbar { height: 5px; }
        .uom-table-wrap::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 0 0 14px 14px; }
        .uom-table-wrap::-webkit-scrollbar-thumb { background: #c7d3e8; border-radius: 10px; }
        .uom-table-wrap::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .uom-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 1080px; }
        .uom-table thead tr { background: linear-gradient(135deg, #1a56db 0%, #2563eb 100%); }
        .uom-table th { padding: 12px 16px; color: #fff; font-weight: 600; text-align: left; white-space: nowrap; font-size: 12px; letter-spacing: 0.03em; text-transform: uppercase; border-right: 1px solid rgba(255,255,255,0.08); }
        .uom-table th:last-child { border-right: none; }
        .uom-table th.tc { text-align: center; }
        .uom-table tbody tr:nth-child(odd)  td { background: #ffffff; }
        .uom-table tbody tr:nth-child(even) td { background: #f7f9fc; }
        .uom-table tbody tr:hover td { background: #eff6ff !important; transition: background 0.12s; }
        .uom-table td { padding: 10px 16px; color: #374151; white-space: nowrap; font-size: 13px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        .uom-table tbody tr:last-child td { border-bottom: none; }
        .uom-code { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; font-weight: 600; color: #1a56db; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 5px; padding: 2px 8px; display: inline-block; }
        .uom-cust-code-badge { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; font-weight: 600; color: #0f766e; background: #f0fdf4; border: 1px solid #86efac; border-radius: 5px; padding: 2px 7px; display: inline-block; white-space: nowrap; }
        .uom-firm-badge { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: #9a3412; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 5px; padding: 2px 8px; display: inline-block; white-space: nowrap; letter-spacing: 0.03em; }
        .uom-quality-cell { display: inline-block; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #475569; font-size: 12.5px; vertical-align: middle; }
        .uom-serial { color: #94a3b8; font-size: 12px; }
        .uom-ob-chip { display: inline-flex; align-items: center; gap: 4px; background: #f0fdf4; color: #15803d; border: 1px solid #86efac; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; white-space: nowrap; }
        .uom-src-sr-chip { display: inline-flex; align-items: center; gap: 4px; background: #ede9fe; color: #6d28d9; border: 1px solid #c4b5fd; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; white-space: nowrap; }
        .uom-src-co-chip { display: inline-flex; align-items: center; gap: 4px; background: #f0fdfa; color: #0f766e; border: 1px solid #5eead4; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; white-space: nowrap; }
        .uom-acts { display: flex; align-items: center; gap: 6px; justify-content: center; }
        .uom-edit-btn { display: inline-flex; align-items: center; gap: 5px; background: #eff6ff; color: #1a56db; border: 1px solid #bfdbfe; padding: 5px 11px; border-radius: 7px; font-size: 11.5px; font-weight: 600; cursor: pointer; transition: background 0.12s, border-color 0.12s; font-family: inherit; white-space: nowrap; }
        .uom-edit-btn:hover { background: #dbeafe; border-color: #93c5fd; }
        .uom-del-btn  { display: inline-flex; align-items: center; gap: 5px; background: #fff1f2; color: #dc2626; border: 1px solid #fca5a5; padding: 5px 11px; border-radius: 7px; font-size: 11.5px; font-weight: 600; cursor: pointer; transition: background 0.12s, border-color 0.12s; font-family: inherit; white-space: nowrap; }
        .uom-del-btn:hover  { background: #fee2e2; border-color: #f87171; }
        .uom-empty { text-align: center; padding: 52px 16px; color: #94a3b8; font-size: 13px; }
        .uom-table-err { text-align: center; padding: 32px 16px; font-size: 13px; color: #b91c1c; background: #fff1f2; }
        .uom-table-err-hint { font-size: 11.5px; color: #64748b; margin-top: 6px; }
        .uom-pag { display: flex; align-items: center; justify-content: space-between; padding: 11px 20px; border-top: 1px solid #edf0f5; background: #f8fafc; font-size: 12.5px; color: #64748b; flex-wrap: wrap; gap: 10px; }
        .uom-pag-btns { display: flex; gap: 5px; flex-wrap: wrap; align-items: center; }
        .uom-pag-btn { padding: 5px 12px; border: 1px solid #dde3ec; border-radius: 7px; background: #fff; cursor: pointer; font-size: 12.5px; font-family: inherit; color: #374151; transition: background 0.12s, border-color 0.12s, color 0.12s; min-height: 30px; display: flex; align-items: center; gap: 3px; line-height: 1; }
        .uom-pag-btn:hover:not(:disabled) { background: #eff6ff; border-color: #93c5fd; color: #1a56db; }
        .uom-pag-btn.active { background: #1a56db; color: #fff; border-color: #1a56db; font-weight: 700; box-shadow: 0 2px 6px rgba(26,86,219,0.25); }
        .uom-pag-btn:disabled { background: #f8fafc; color: #cbd5e1; border-color: #f1f5f9; cursor: not-allowed; }
        .uom-spin { display: inline-block; width: 16px; height: 16px; border: 2px solid #e2e8f0; border-top-color: #1a56db; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; margin-right: 6px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .uom-master-badge { display: inline-flex; align-items: center; gap: 4px; background: #f0fdf4; color: #15803d; border: 1px solid #86efac; border-radius: 5px; padding: 2px 7px; font-size: 11px; font-weight: 600; margin-left: 6px; vertical-align: middle; }
        .uom-master-badge.loading { background: #f8fafc; color: #94a3b8; border-color: #e2e8f0; }
        .uom-master-badge.empty { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
        .uom-modal-loading { position: absolute; inset: 0; background: rgba(255,255,255,0.85); display: flex; align-items: center; justify-content: center; z-index: 10; border-radius: 18px; flex-direction: column; gap: 10px; }
        .uom-modal-loading-text { font-size: 13px; color: #475569; font-weight: 600; }
        .uom-overlay { position: fixed; inset: 0; z-index: 900; background: rgba(10,20,40,0.5); display: flex; align-items: flex-start; justify-content: center; padding: 28px 16px; overflow-y: auto; }
        .uom-modal { width: 100%; max-width: 1140px; background: #fff; border-radius: 18px; box-shadow: 0 12px 48px rgba(0,0,0,0.22); overflow: hidden; margin: auto; animation: slideUp 0.22s ease; position: relative; }
        @keyframes slideUp { from { opacity:0; transform:translateY(28px); } to { opacity:1; transform:translateY(0); } }
        .uom-mhead { display: flex; align-items: center; justify-content: space-between; padding: 16px 26px; background: linear-gradient(135deg,#1a56db 0%,#3b5bfc 100%); }
        .uom-mhead.from-conversion { background: linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%); }
        .uom-mhead-left { display: flex; align-items: center; gap: 10px; }
        .uom-mhead-icon { width: 34px; height: 34px; background: rgba(255,255,255,0.2); border-radius: 9px; display: flex; align-items: center; justify-content: center; }
        .uom-mhead-title { color: #fff; font-weight: 700; font-size: 16px; }
        .uom-mhead-sub { color: rgba(255,255,255,0.75); font-size: 11.5px; margin-top: 1px; }
        .uom-mhead-right { display: flex; align-items: center; gap: 8px; }
        .uom-ob-trigger-btn { display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.15); color: #fff; border: 1.5px solid rgba(255,255,255,0.4); padding: 7px 14px; border-radius: 9px; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; transition: background 0.15s, opacity 0.15s; }
        .uom-ob-trigger-btn:hover:not(:disabled) { background: rgba(255,255,255,0.25); }
        .uom-ob-trigger-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .uom-ob-trigger-btn.applied { background: rgba(74,222,128,0.25); border-color: #4ade80; }
        .ob-dot { width: 7px; height: 7px; background: #4ade80; border-radius: 50%; animation: pulse 2s infinite; flex-shrink: 0; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .uom-mclose { background: rgba(255,255,255,0.15); border: none; color: #fff; width: 30px; height: 30px; border-radius: 8px; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }
        .uom-mclose:hover { background: rgba(255,255,255,0.3); }
        .uom-mbody { padding: 20px 26px; max-height: calc(100vh - 180px); overflow-y: auto; }
        .uom-cust-banner { background: linear-gradient(135deg,#eff6ff,#e0f2fe); border: 1.5px solid #93c5fd; border-radius: 12px; padding: 14px 18px; margin-bottom: 16px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .uom-cust-icon { width: 40px; height: 40px; background: #1a56db; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .uom-cust-content { flex: 1; min-width: 240px; }
        .uom-cust-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #1d4ed8; margin-bottom: 7px; }
        .uom-cust-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .uom-autofill-badge { display: inline-flex; align-items: center; gap: 5px; background: #dcfce7; color: #15803d; border: 1px solid #86efac; border-radius: 20px; padding: 3px 10px; font-size: 11.5px; font-weight: 700; }
        .uom-autofill-hint { font-size: 11px; color: #15803d; font-weight: 600; margin-top: 4px; display: flex; align-items: center; gap: 4px; }
        .uom-section { background: #f8fafc; border: 1px solid #e8edf4; border-radius: 11px; padding: 15px; margin-bottom: 14px; }
        .uom-section-title { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #64748b; margin-bottom: 12px; display: flex; align-items: center; gap: 7px; }
        .uom-section-title::after { content:''; flex:1; height:1px; background:#e2e8f0; }
        .uom-g4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; }
        .uom-panels { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-bottom: 14px; }
        .uom-panel { border: 1px solid #e2e8f0; border-radius: 11px; overflow: hidden; }
        .uom-panel-head { background: #1e3a6e; color: #fff; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; padding: 9px 14px; display: flex; align-items: center; gap: 7px; }
        .uom-panel-body { padding: 14px; background: #fff; }
        .uom-field { margin-bottom: 10px; }
        .uom-field:last-child { margin-bottom: 0; }
        .uom-label { display: block; font-size: 10.5px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
        .uom-req { color: #dc2626; }
        .uom-input, .uom-select, .uom-textarea { width: 100%; padding: 8px 12px; border: 1px solid #d1d9e6; border-radius: 8px; font-size: 13px; font-family: inherit; color: #1a2332; background: #fff; outline: none; transition: border 0.15s, box-shadow 0.15s; }
        .uom-input:focus, .uom-select:focus, .uom-textarea:focus { border-color: #1a56db; box-shadow: 0 0 0 3px rgba(26,86,219,0.1); }
        .uom-input.ro { background: #f1f5f9; color: #475569; cursor: default; border-color: #e2e8f0; }
        .uom-input.warn { border-color: #fbbf24 !important; box-shadow: 0 0 0 3px rgba(251,191,36,0.15) !important; }
        .uom-textarea { min-height: 68px; resize: vertical; }
        .uom-textarea.ro { background: #f1f5f9; color: #475569; cursor: default; border-color: #e2e8f0; }
        .uom-r2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .uom-sel-wrap .uom-select { padding-right: 30px; appearance: none; }
        .uom-sel-wrap { position: relative; }
        .uom-sel-chev { position: absolute; right: 9px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #64748b; }
        .uom-err-box { background: #fff1f2; border: 1px solid #fecaca; color: #b91c1c; padding: 9px 13px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; display: flex; align-items: center; gap: 7px; }
        .uom-ob-strip { border-radius: 11px; padding: 13px 16px; margin-bottom: 14px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .uom-ob-strip.pending { background: #fafafa; border: 1.5px dashed #cbd5e1; }
        .uom-ob-strip.applied { background: linear-gradient(135deg,#f0fdf4,#ecfdf5); border: 1.5px solid #86efac; animation: stripIn 0.3s ease; }
        @keyframes stripIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
        .uom-ob-strip-icon { width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .uom-ob-strip.applied .uom-ob-strip-icon { background: #dcfce7; color: #15803d; }
        .uom-ob-strip.pending .uom-ob-strip-icon { background: #f1f5f9; color: #64748b; }
        .uom-ob-strip-body { flex: 1; min-width: 180px; }
        .uom-ob-strip-title { font-size: 13px; font-weight: 700; }
        .uom-ob-strip.applied .uom-ob-strip-title { color: #15803d; }
        .uom-ob-strip.pending .uom-ob-strip-title { color: #475569; }
        .uom-ob-strip-meta { font-size: 11.5px; color: #64748b; margin-top: 2px; }
        .uom-ob-strip-net { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 800; color: #0f766e; margin-left: auto; }
        .uom-ob-strip-btn { padding: 7px 16px; border-radius: 8px; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; transition: background 0.15s; display: flex; align-items: center; gap: 5px; }
        .uom-ob-strip.applied .uom-ob-strip-btn { background: #dcfce7; color: #166534; border: 1.5px solid #86efac; }
        .uom-ob-strip.applied .uom-ob-strip-btn:hover { background: #bbf7d0; }
        .uom-ob-strip.pending .uom-ob-strip-btn { background: #1a56db; color: #fff; border: none; box-shadow: 0 2px 8px rgba(26,86,219,0.3); }
        .uom-ob-strip.pending .uom-ob-strip-btn:hover { background: #1649c0; }
        .uom-ob-strip.pending .uom-ob-strip-btn:disabled { background: #94a3b8; cursor: not-allowed; box-shadow: none; }
        .uom-mfoot { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 26px; border-top: 1px solid #f1f5f9; background: #f8fafc; }
        .uom-cancel-btn { padding: 9px 20px; border: 1px solid #d1d9e6; background: #fff; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; color: #475569; font-family: inherit; transition: background 0.12s; display: flex; align-items: center; gap: 6px; }
        .uom-cancel-btn:hover { background: #f1f5f9; }
        .uom-save-btn { padding: 9px 24px; border: none; background: #16a34a; color: #fff; border-radius: 9px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: 0 2px 8px rgba(22,163,74,0.3); transition: background 0.15s; display: flex; align-items: center; gap: 6px; }
        .uom-save-btn:hover:not(:disabled) { background: #15803d; }
        .uom-save-btn:disabled { background: #86efac; cursor: not-allowed; }
        .uom-export-wrap { position: relative; flex-shrink: 0; }
        .uom-export-trigger { display: flex; align-items: center; gap: 6px; background: #fff; color: #1a56db; border: 1.5px solid #bfdbfe; border-radius: 10px; padding: 9px 14px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; touch-action: manipulation; transition: border-color 0.15s, box-shadow 0.15s, background 0.15s; }
        .uom-export-trigger:hover:not(:disabled) { border-color: #1a56db; background: #eff6ff; }
        .uom-export-trigger.open { border-color: #1a56db; box-shadow: 0 0 0 3px rgba(26,86,219,0.12); }
        .uom-export-trigger:disabled { opacity: 0.6; cursor: not-allowed; }
        .uom-export-panel { position: absolute; top: calc(100% + 6px); right: 0; min-width: 210px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,0.14); z-index: 500; padding: 6px; animation: exportDdSlide 0.15s ease; }
        @keyframes exportDdSlide { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
        .uom-export-panel-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.07em; padding: 6px 10px 4px; }
        .uom-export-item { display: flex; align-items: center; gap: 9px; width: 100%; background: none; border: none; padding: 9px 10px; border-radius: 8px; font-size: 13px; font-weight: 500; color: #1a2332; cursor: pointer; font-family: inherit; text-align: left; touch-action: manipulation; }
        .uom-export-item:hover { background: #eff6ff; }
        .uom-export-item-icon { width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .uom-export-item-icon.csv   { background: #f3f0ff; color: #7c3aed; }
        .uom-export-item-icon.excel { background: #f0fdf4; color: #16a34a; }
        .uom-export-item-icon.print { background: #eff6ff; color: #1a56db; }
        .cust-dd-wrap { position: relative; flex: 1; min-width: 280px; }
        .cust-dd-trigger { width:100%; display:flex; align-items:center; justify-content:space-between; padding:0 12px; height:40px; border:1.5px solid #93c5fd; border-radius:8px; background:#fff; color:#1a2332; font-size:14px; font-family:inherit; cursor:pointer; outline:none; transition:border 0.15s,box-shadow 0.15s; text-align:left; }
        .cust-dd-trigger:hover:not(:disabled) { border-color:#1a56db; }
        .cust-dd-trigger.open { border-color:#1a56db; border-bottom-left-radius:0; border-bottom-right-radius:0; box-shadow:0 0 0 3px rgba(26,86,219,0.12); }
        .cust-dd-trigger.has-value { background:#f8fbff; }
        .cust-dd-trigger:disabled { background:#f8fafc; color:#94a3b8; cursor:not-allowed; }
        .cust-dd-trigger-content { flex:1; overflow:hidden; min-width:0; }
        .cust-dd-loading { color:#94a3b8; font-size:12.5px; display:flex; align-items:center; }
        .cust-dd-placeholder { color:#9ca3af; }
        .cust-dd-selected-val { display:flex; align-items:center; gap:8px; overflow:hidden; }
        .cust-dd-code-badge { background:#1a56db; color:#fff; border-radius:5px; padding:1px 8px; font-size:11.5px; font-weight:700; font-family:'JetBrains Mono',monospace; white-space:nowrap; flex-shrink:0; }
        .cust-dd-name { font-weight:600; color:#1a2332; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cust-dd-district { font-size:11.5px; color:#64748b; white-space:nowrap; flex-shrink:0; }
        .cust-dd-chevron { flex-shrink:0; color:#64748b; margin-left:8px; transition:transform 0.2s; }
        .cust-dd-chevron.rotated { transform:rotate(180deg); }
        .cust-dd-panel { position:absolute; top:100%; left:0; right:0; z-index:300; background:#fff; border:1.5px solid #1a56db; border-top:none; border-bottom-left-radius:8px; border-bottom-right-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.14); animation:ddSlide 0.15s ease; }
        .cust-dd-search-wrap { display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid #e8edf4; background:#f8fbff; }
        .cust-dd-search-icon { flex-shrink:0; color:#94a3b8; }
        .cust-dd-search { flex:1; border:none; outline:none; font-size:12.5px; font-family:inherit; color:#1a2332; background:transparent; }
        .cust-dd-clear { background:none; border:none; cursor:pointer; color:#94a3b8; padding:0; line-height:1; display:flex; align-items:center; }
        .cust-dd-count { padding:4px 12px; font-size:11px; color:#94a3b8; font-weight:600; border-bottom:1px solid #f1f5f9; }
        .cust-dd-list { max-height:260px; overflow-y:auto; }
        .cust-dd-option { display:flex; align-items:center; gap:10px; padding:9px 12px; cursor:pointer; border-bottom:1px solid #f8fafc; transition:background 0.1s; }
        .cust-dd-option:hover { background:#eff6ff; }
        .cust-dd-option.selected { background:#dbeafe; }
        .cust-dd-option.cust-dd-clear-opt { color:#64748b; font-size:12px; font-style:italic; border-bottom:1px solid #e8edf4; }
        .cust-opt-left { flex-shrink:0; }
        .cust-opt-code { font-family:'JetBrains Mono',monospace; font-size:11.5px; font-weight:700; color:#1a56db; background:#eff6ff; border:1px solid #bfdbfe; border-radius:4px; padding:1px 7px; white-space:nowrap; }
        .cust-dd-option.selected .cust-opt-code { background:#1a56db; color:#fff; border-color:#1a56db; }
        .cust-opt-right { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
        .cust-opt-name { font-size:13px; color:#1e293b; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cust-opt-loc { font-size:11px; color:#64748b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cust-opt-check { flex-shrink:0; color:#1a56db; }
        .cust-dd-empty { display:flex; flex-direction:column; align-items:center; gap:6px; padding:20px; color:#94a3b8; font-size:12.5px; }
        .cust-dd-status { font-size:11px; margin-top:4px; }
        .ob-overlay { position: fixed; inset: 0; z-index: 1100; background: rgba(5,15,35,0.65); display: flex; align-items: flex-start; justify-content: center; padding: 32px 16px; overflow-y: auto; }
        .ob-modal { width: 100%; max-width: 980px; background: #fff; border-radius: 18px; box-shadow: 0 16px 64px rgba(0,0,0,0.3); overflow: hidden; margin: auto; animation: slideUp 0.2s ease; border-top: 4px solid #0f766e; }
        .ob-mhead { display: flex; align-items: center; justify-content: space-between; padding: 15px 24px; background: linear-gradient(135deg,#0f766e,#0d9488); }
        .ob-mhead-left { display: flex; align-items: center; gap: 10px; }
        .ob-mhead-icon { width: 34px; height: 34px; background: rgba(255,255,255,0.2); border-radius: 9px; display: flex; align-items: center; justify-content: center; }
        .ob-mhead-title { color: #fff; font-weight: 700; font-size: 15.5px; }
        .ob-mhead-sub { color: rgba(255,255,255,0.7); font-size: 11px; margin-top: 1px; }
        .ob-linked-badge { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,255,255,0.2); color: #fff; border: 1px solid rgba(255,255,255,0.35); border-radius: 6px; padding: 3px 9px; font-size: 11.5px; font-weight: 600; font-family: 'JetBrains Mono', monospace; }
        .ob-mclose { background: rgba(255,255,255,0.15); border: none; color: #fff; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }
        .ob-mclose:hover { background: rgba(255,255,255,0.3); }
        .ob-mbody { padding: 20px 24px; }
        .ob-r3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-bottom: 14px; }
        .ob-r13 { display: grid; grid-template-columns: 1fr 2fr; gap: 14px; margin-bottom: 14px; }
        .ob-label { display: block; font-size: 10.5px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
        .ob-input, .ob-select { width: 100%; padding: 8px 12px; border: 1px solid #d1d9e6; border-radius: 8px; font-size: 13px; font-family: inherit; color: #1a2332; background: #fff; outline: none; transition: border 0.15s; }
        .ob-input:focus, .ob-select:focus { border-color: #0d9488; box-shadow: 0 0 0 3px rgba(13,148,136,0.1); }
        .ob-input.autofilled { background: #f0fdf4; border-color: #86efac; color: #166534; }
        .hsn-dd-wrap { position: relative; }
        .hsn-dd-trigger { width:100%; display:flex; align-items:center; justify-content:space-between; padding:0 12px; height:38px; border:1px solid #d1d9e6; border-radius:8px; background:#fff; color:#1a2332; font-size:13px; font-family:inherit; cursor:pointer; outline:none; transition:border 0.15s,box-shadow 0.15s; text-align:left; }
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
        .hsn-dd-panel { position:absolute; top:100%; left:0; right:0; z-index:200; background:#fff; border:1px solid #0d9488; border-top:none; border-bottom-left-radius:8px; border-bottom-right-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.12); animation:ddSlide 0.15s ease; }
        @keyframes ddSlide { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
        .hsn-dd-search-wrap { display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid #e8edf4; background:#f8fffe; }
        .hsn-dd-search-icon { flex-shrink:0; color:#94a3b8; }
        .hsn-dd-search { flex:1; border:none; outline:none; font-size:12.5px; font-family:inherit; color:#1a2332; background:transparent; }
        .hsn-dd-clear { background:none; border:none; cursor:pointer; color:#94a3b8; padding:0; line-height:1; display:flex; align-items:center; }
        .hsn-dd-count { padding:4px 12px; font-size:11px; color:#94a3b8; font-weight:600; border-bottom:1px solid #f1f5f9; background:#fafffe; }
        .hsn-dd-list { max-height:200px; overflow-y:auto; }
        .hsn-dd-option { display:flex; align-items:center; gap:10px; padding:8px 12px; cursor:pointer; border-bottom:1px solid #f8fafc; transition:background 0.1s; }
        .hsn-dd-option:hover { background:#f0fdf4; }
        .hsn-dd-option.selected { background:#ecfdf5; }
        .hsn-dd-option.hsn-dd-clear-opt { color:#64748b; font-size:12px; font-style:italic; border-bottom:1px solid #e8edf4; }
        .hsn-opt-code { font-family:'JetBrains Mono',monospace; font-size:12.5px; font-weight:700; color:#0f766e; background:#f0fdf4; border:1px solid #a7f3d0; border-radius:4px; padding:1px 6px; white-space:nowrap; flex-shrink:0; }
        .hsn-dd-option.selected .hsn-opt-code { background:#0d9488; color:#fff; border-color:#0d9488; }
        .hsn-opt-check { flex-shrink:0; color:#0d9488; margin-left:auto; }
        .hsn-dd-empty { display:flex; flex-direction:column; align-items:center; gap:6px; padding:20px; color:#94a3b8; font-size:12.5px; }
        .hsn-dd-status { font-size:11px; margin-top:4px; }
        .fab-dd-wrap { position:relative; }
        .fab-dd-trigger { width:100%; display:flex; align-items:center; justify-content:space-between; padding:0 12px; height:38px; border:1px solid #d1d9e6; border-radius:8px; background:#fff; color:#1a2332; font-size:13px; font-family:inherit; cursor:pointer; outline:none; transition:border 0.15s,box-shadow 0.15s; text-align:left; }
        .fab-dd-trigger.open { border-color:#7c3aed; border-bottom-left-radius:0; border-bottom-right-radius:0; box-shadow:0 0 0 3px rgba(124,58,237,0.12); }
        .fab-dd-trigger.has-value { border-color:#c4b5fd; background:#faf5ff; }
        .fab-dd-trigger-content { flex:1; overflow:hidden; min-width:0; }
        .fab-dd-placeholder { color:#9ca3af; }
        .fab-dd-selected-val { display:flex; align-items:center; gap:8px; overflow:hidden; }
        .fab-dd-sort-badge { background:#7c3aed; color:#fff; border-radius:5px; padding:1px 8px; font-size:12px; font-weight:700; font-family:'JetBrains Mono',monospace; white-space:nowrap; flex-shrink:0; }
        .fab-dd-code { font-size:11.5px; color:#6d28d9; font-weight:600; background:#ede9fe; border:1px solid #c4b5fd; border-radius:4px; padding:1px 6px; white-space:nowrap; flex-shrink:0; }
        .fab-dd-desc { font-size:12px; color:#64748b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .fab-dd-chevron { flex-shrink:0; color:#64748b; margin-left:8px; transition:transform 0.2s; }
        .fab-dd-chevron.rotated { transform:rotate(180deg); }
        .fab-dd-panel { position:absolute; top:100%; left:0; right:0; z-index:300; background:#fff; border:1px solid #7c3aed; border-top:none; border-bottom-left-radius:8px; border-bottom-right-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.14); animation:ddSlide 0.15s ease; }
        .fab-dd-search-wrap { display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid #e8edf4; background:#fdf8ff; }
        .fab-dd-search { flex:1; border:none; outline:none; font-size:12.5px; font-family:inherit; color:#1a2332; background:transparent; }
        .fab-dd-clear { background:none; border:none; cursor:pointer; color:#94a3b8; padding:0; line-height:1; display:flex; align-items:center; }
        .fab-dd-count { padding:4px 12px; font-size:11px; color:#94a3b8; font-weight:600; border-bottom:1px solid #f1f5f9; }
        .fab-dd-list { max-height:260px; overflow-y:auto; }
        .fab-dd-option { display:flex; align-items:flex-start; gap:10px; padding:9px 12px; cursor:pointer; border-bottom:1px solid #f8fafc; transition:background 0.1s; }
        .fab-dd-option:hover { background:#faf5ff; }
        .fab-dd-option.selected { background:#f3f0ff; }
        .fab-dd-option.fab-dd-clear-opt { color:#64748b; font-size:12px; font-style:italic; border-bottom:1px solid #e8edf4; }
        .fab-opt-left { display:flex; flex-direction:column; gap:3px; align-items:flex-start; flex-shrink:0; }
        .fab-opt-sort { font-family:'JetBrains Mono',monospace; font-size:13px; font-weight:800; color:#7c3aed; background:#ede9fe; border:1px solid #c4b5fd; border-radius:5px; padding:2px 8px; white-space:nowrap; }
        .fab-dd-option.selected .fab-opt-sort { background:#7c3aed; color:#fff; border-color:#7c3aed; }
        .fab-opt-code { font-size:10.5px; color:#64748b; font-weight:600; }
        .fab-opt-right { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
        .fab-opt-quality { font-size:12px; color:#1e293b; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .fab-opt-construction { font-size:11px; color:#64748b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .fab-opt-check { flex-shrink:0; color:#7c3aed; }
        .fab-dd-empty { display:flex; flex-direction:column; align-items:center; gap:6px; padding:20px; color:#94a3b8; font-size:12.5px; }
        .fab-dd-status { font-size:11px; margin-top:4px; }
        .fab-status-ok { color:#7c3aed; font-weight:700; }
        .ob-items-hdr { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .ob-sec-title { font-size:11px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.06em; }
        .ob-add-row-btn { display:flex; align-items:center; gap:5px; border:1px solid #99f6e4; border-radius:8px; padding:5px 12px; background:#f0fdf4; color:#0f766e; font-weight:700; font-size:12px; cursor:pointer; font-family:inherit; transition:background 0.12s; }
        .ob-add-row-btn:hover { background:#ccfbf1; }
        .ob-items-wrap { border:1px solid #e2e8f0; border-radius:10px; overflow-x:auto; margin-bottom:14px; }
        .ob-itable { width:100%; border-collapse:collapse; font-size:12px; }
        .ob-ith  { padding:8px 10px; background:#f1f5f9; color:#475569; font-weight:700; text-align:left;  border-bottom:1px solid #e2e8f0; white-space:nowrap; font-size:11.5px; }
        .ob-ithr { padding:8px 10px; background:#f1f5f9; color:#475569; font-weight:700; text-align:right; border-bottom:1px solid #e2e8f0; white-space:nowrap; font-size:11.5px; }
        .ob-itde { padding:6px 8px; background:#fff;    border-bottom:1px solid #f1f5f9; }
        .ob-itdo { padding:6px 8px; background:#f0fdfa; border-bottom:1px solid #f1f5f9; }
        .ob-ii  { width:100%; border:1px solid #d1d9e6; border-radius:5px; padding:4px 7px; font-size:12px; outline:none; color:#1a2332; background:#fff; font-family:inherit; }
        .ob-iir { width:100%; border:1px solid #d1d9e6; border-radius:5px; padding:4px 7px; font-size:12px; outline:none; color:#1a2332; background:#fff; text-align:right; font-family:inherit; }
        .ob-iid { width:100%; border:1px solid #e2e8f0; border-radius:5px; padding:4px 7px; font-size:12px; outline:none; color:#94a3b8; background:#f8fafc; text-align:right; font-family:inherit; }
        .ob-isel { width:100%; border:1px solid #d1d9e6; border-radius:5px; padding:4px 7px; font-size:12px; outline:none; background:#fff; color:#1a2332; font-family:inherit; }
        .ob-del-item { background:none; border:none; color:#f87171; cursor:pointer; padding:0; line-height:1; display:flex; align-items:center; justify-content:center; }
        .ob-bot-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:14px; }
        .ob-textarea { width:100%; border:1px solid #d1d9e6; border-radius:8px; padding:8px 12px; font-size:13px; font-family:inherit; color:#1a2332; outline:none; resize:none; height:110px; }
        .ob-gst-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; }
        .ob-gst-row { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
        .ob-gst-label { width:40px; font-size:13px; font-weight:700; color:#475569; }
        .ob-gst-input { width:68px; border:1px solid #d1d9e6; border-radius:7px; padding:5px 8px; font-size:13px; text-align:right; outline:none; background:#fff; font-family:inherit; }
        .ob-gst-amt { margin-left:auto; font-family:'JetBrains Mono',monospace; font-size:13px; color:#334155; }
        .ob-net-row { display:flex; align-items:center; justify-content:space-between; border-top:1px solid #cbd5e1; padding-top:10px; margin-top:4px; }
        .ob-net-label { font-size:14px; font-weight:700; color:#1a2332; }
        .ob-net-val { font-size:19px; font-weight:800; color:#0f766e; font-family:'JetBrains Mono',monospace; }
        .ob-err { background:#fff1f2; border:1px solid #fecaca; color:#b91c1c; padding:9px 13px; border-radius:8px; font-size:13px; margin-bottom:12px; display:flex; align-items:center; gap:7px; }
        .ob-mfoot { display:flex; justify-content:flex-end; gap:10px; padding:14px 24px; border-top:1px solid #f1f5f9; background:#f0fdf4; }
        .ob-apply-btn { padding:9px 24px; border:none; background:#0f766e; color:#fff; border-radius:9px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; box-shadow:0 2px 8px rgba(15,118,110,0.3); transition:background 0.15s; display:flex; align-items:center; gap:6px; }
        .ob-apply-btn:hover { background:#0c5f58; }
        .del-overlay { position:fixed; inset:0; z-index:1200; background:rgba(10,20,40,0.6); display:flex; align-items:center; justify-content:center; }
        .del-box { background:#fff; border-radius:16px; padding:32px 28px; max-width:400px; width:100%; margin:0 16px; text-align:center; box-shadow:0 12px 48px rgba(0,0,0,0.24); }
        .del-icon { display:flex; justify-content:center; margin-bottom:12px; color:#dc2626; }
        .del-title { font-size:17px; font-weight:700; color:#1a2332; margin-bottom:8px; }
        .del-sub { font-size:13px; color:#64748b; margin-bottom:16px; }
        .del-err { background:#fff1f2; border:1px solid #fecaca; color:#b91c1c; padding:8px 12px; border-radius:8px; font-size:12.5px; margin-bottom:16px; }
        .del-actions { display:flex; gap:10px; justify-content:center; }
        .del-cancel { padding:9px 22px; border:1px solid #d1d9e6; border-radius:9px; background:#fff; color:#475569; font-weight:600; font-size:13px; cursor:pointer; font-family:inherit; }
        .del-confirm { padding:9px 22px; border:none; border-radius:9px; background:#dc2626; color:#fff; font-weight:700; font-size:13px; cursor:pointer; font-family:inherit; display:flex; align-items:center; gap:6px; }
        .del-confirm:disabled { background:#fca5a5; cursor:not-allowed; }
        .conv-bell-panel { position:absolute; top:calc(100% + 8px); right:0; width:340px; max-height:420px; background:#fff; border-radius:14px; box-shadow:0 8px 40px rgba(0,0,0,0.18); border:1px solid #e2e8f0; z-index:2000; overflow:hidden; display:flex; flex-direction:column; }
        .conv-bell-item { padding:12px 16px; border-bottom:1px solid #f8fafc; cursor:pointer; display:flex; gap:10px; align-items:flex-start; transition: background 0.12s; }
        .conv-bell-item:hover { background:#f5f3ff; }
        .conv-bell-item.unread { background:#faf5ff; }
        @keyframes bellRing { 0%,100%{transform:rotate(0)} 20%{transform:rotate(15deg)} 40%{transform:rotate(-12deg)} 60%{transform:rotate(10deg)} 80%{transform:rotate(-8deg)} }
        .bell-ringing { animation:bellRing 0.6s ease-in-out; }
        @keyframes bellPulse { 0%{box-shadow:0 0 0 0 rgba(99,102,241,0.5)} 70%{box-shadow:0 0 0 8px rgba(99,102,241,0)} 100%{box-shadow:0 0 0 0 rgba(99,102,241,0)} }
        .bell-pulse { animation:bellPulse 1.5s ease-out infinite; }
        @media (max-width:900px) { .uom-panels{grid-template-columns:1fr;} .uom-g4{grid-template-columns:1fr 1fr;} .ob-r3{grid-template-columns:1fr 1fr;} .ob-bot-grid{grid-template-columns:1fr;} }
        @media (max-width:600px) { .uom-g4,.uom-r2{grid-template-columns:1fr;} .ob-r3,.ob-r13{grid-template-columns:1fr;} .uom-page-header,.uom-toolbar{padding:12px 16px;} .uom-card{margin:0 16px 16px;} .uom-date-filter{width:100%;justify-content:space-between;} }
      `}</style>

      <div className="uom-root">
        {isFromConversion && !showCOModal && (
          <div className="uom-conv-banner">
            <MdSyncAlt size={16}/> <strong>A sample request is ready to convert.</strong> Check the order form — it is pre-filled with the sample data.
          </div>
        )}

        <div className="uom-page-header">
          <div>
            <div className="uom-page-title">Customer Orders</div>
            <div className="uom-page-sub">Manage &amp; create customer order details</div>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            {/* CONVERSION BELL */}
            <div ref={convBellRef} style={{position:'relative'}}>
              <button
                style={{ position:'relative', width:42, height:42, borderRadius:10, border:'1.5px solid #e2e8f0', background:convBellUnread>0?'#ede9fe':'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:convBellUnread>0?'#6d28d9':'#64748b', opacity:notifAvailable===false?0.4:1 }}
                className={convBellUnread>0 && notifAvailable===true ? 'bell-pulse' : ''}
                onClick={() => notifAvailable!==false && setConvBellOpen(o => !o)}
                title={notifAvailable===false?'Notifications unavailable':convBellUnread>0?`${convBellUnread} pending conversions`:'Order conversions'}
              >
                <span className={convBellUnread>0 && notifAvailable===true ? 'bell-ringing' : ''} style={{display:'flex'}}><MdSyncAlt size={20}/></span>
                {convBellUnread>0 && notifAvailable===true && (
                  <span style={{position:'absolute',top:-4,right:-4,background:'#7c3aed',color:'#fff',borderRadius:'50%',width:18,height:18,fontSize:10,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,border:'2px solid #fff'}}>
                    {convBellUnread>9?'9+':convBellUnread}
                  </span>
                )}
              </button>
              {convBellOpen && notifAvailable===true && (
                <div className="conv-bell-panel">
                  <div style={{padding:'14px 16px 10px',borderBottom:'1px solid #f1f5f9',background:'#fafbff',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontWeight:800,fontSize:14,color:'#1e293b',display:'flex',alignItems:'center',gap:6}}><MdSyncAlt size={16} color="#7c3aed"/> Order Conversions</div>
                      {convBellUnread>0 && <div style={{fontSize:11,color:'#7c3aed',marginTop:1}}>{convBellUnread} pending</div>}
                    </div>
                    {convBellUnread>0 && <button style={{fontSize:11,color:'#7c3aed',background:'none',border:'none',cursor:'pointer',fontWeight:700}} onClick={markAllConvNotifsRead}>Mark all read</button>}
                  </div>
                  <div style={{overflowY:'auto',flex:1}}>
                    {convNotifs.length===0 ? (
                      <div style={{padding:40,textAlign:'center',color:'#94a3b8'}}><MdSyncAlt size={32} style={{marginBottom:8,opacity:0.3}}/><div style={{fontWeight:600,fontSize:13}}>No conversions yet</div></div>
                    ) : convNotifs.map(n => (
                      <div key={n.id} className={`conv-bell-item${!n.is_read?' unread':''}`} onClick={() => handleConvNotifClick(n)}>
                        <div style={{width:34,height:34,borderRadius:9,background:'#ede9fe',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'#6d28d9'}}><MdSyncAlt size={18}/></div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:12.5,color:'#1e293b',display:'flex',justifyContent:'space-between'}}>
                            <span>{n.meta?.request_code||'Sample request'}</span>
                            <span style={{fontSize:11,color:'#94a3b8',fontWeight:400,flexShrink:0,marginLeft:6}}>{new Date(n.created_at).toLocaleDateString()}</span>
                          </div>
                          <div style={{fontSize:12,color:'#64748b',marginTop:1}}>{n.meta?.customer_name}</div>
                          <div style={{fontSize:11,color:'#7c3aed',fontWeight:600,marginTop:3}}>{n.meta?.fabric_code}{n.meta?.fabric_quality?' · '+n.meta.fabric_quality:''}</div>
                          <div style={{marginTop:4}}>
                            <span style={{background:'#ede9fe',color:'#6d28d9',fontSize:10,fontWeight:700,borderRadius:4,padding:'1px 6px',display:'inline-flex',alignItems:'center',gap:3}}>Click to open order form <FiChevronRight size={10}/></span>
                          </div>
                        </div>
                        {!n.is_read && <div style={{width:8,height:8,borderRadius:'50%',background:'#7c3aed',flexShrink:0,marginTop:4}}/>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Export / Print dropdown */}
            <div className="uom-export-wrap" ref={exportRef}>
              <button
                type="button"
                className={`uom-export-trigger${exportOpen?' open':''}`}
                onClick={() => setExportOpen(o => !o)}
                disabled={exporting}
              >
                {exporting
                  ? <span className="uom-spin" style={{margin:0,width:14,height:14,borderWidth:2}}/>
                  : <FiDownload size={14}/>}
                Export
                <FiChevronDown
                  size={12}
                  style={{ transition:'transform 0.2s', transform: exportOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>
              {exportOpen && (
                <div className="uom-export-panel">
                  <div className="uom-export-panel-label">Export / Print</div>
                  <button className="uom-export-item" onClick={handleExportCSV}>
                    <span className="uom-export-item-icon csv">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    </span>
                    Export as CSV
                  </button>
                  <button className="uom-export-item" onClick={handleExportExcel}>
                    <span className="uom-export-item-icon excel">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
                    </span>
                    Export as Excel
                  </button>
                  <button className="uom-export-item" onClick={handlePrintTable}>
                    <span className="uom-export-item-icon print">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2-2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    </span>
                    Print Table
                  </button>
                </div>
              )}
            </div>

            <button className="uom-new-btn" onClick={() => openCOModal()}><FiPlus size={14} strokeWidth={3}/> New Order</button>
          </div>
        </div>

        <div className="uom-toolbar">
          <div className="uom-search-wrap">
            <FiSearch className="uom-search-icon" size={13}/>
            <input className="uom-search" placeholder="Search by order code, customer code, customer, PO no…" value={search} onChange={e => setSearch(e.target.value)}/>
          </div>

          {/* v12: Order Date range filter */}
          <div className={`uom-date-filter${dateFilterActive?' active':''}`}>
            <span className="uom-date-filter-icon"><FiCalendar size={13}/></span>
            <span className="uom-date-filter-label">Order Date</span>
            <input
              type="date"
              className="uom-date-input"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={e => setDateFrom(e.target.value)}
              title="From date"
            />
            <span className="uom-date-sep">–</span>
            <input
              type="date"
              className="uom-date-input"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={e => setDateTo(e.target.value)}
              title="To date"
            />
            {dateFilterActive && (
              <button type="button" className="uom-date-clear" onClick={clearDateFilter} title="Clear date filter">
                <FiX size={14}/>
              </button>
            )}
          </div>

          <span className="uom-rec-count">{filtered.length} record{filtered.length!==1?'s':''}</span>
          <div className="uom-page-size">
            <span>Show</span>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>entries</span>
          </div>
        </div>

        <div className="uom-card">
          <div className="uom-table-wrap">
            <table className="uom-table">
              <thead>
                <tr>
                  <th style={{width:40}}>#</th>
                  <th>Order Code</th>
                  <th>Cust. Code</th>
                  <th>Order Date</th>
                  <th>PO No</th>
                  <th>Customer Name</th>
                  <th>State</th>
                  <th>Transport</th>
                  <th>Firm</th>
                  <th>Quality</th>
                  <th>Exp. Delivery</th>
                  <th>Booking</th>
                  <th>Source</th>
                  <th className="tc" style={{width:140}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr><td colSpan={14} className="uom-empty"><span className="uom-spin"/>Loading orders…</td></tr>
                ) : tableError ? (
                  <tr>
                    <td colSpan={14} className="uom-table-err">
                      <FiAlertTriangle size={14} style={{marginRight:6,verticalAlign:'middle'}}/>{tableError}
                      <div className="uom-table-err-hint">Check the browser console. Make sure vite.config.ts has the /api proxy configured.</div>
                      <div style={{marginTop:8}}>
                        <button style={{color:'#1a56db',background:'none',border:'none',cursor:'pointer',fontWeight:600,fontSize:13,display:'inline-flex',alignItems:'center',gap:4}} onClick={loadOrders}>
                          <FiRefreshCw size={12}/> Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : paginated.length===0 ? (
                  <tr><td colSpan={14} className="uom-empty">{search||dateFilterActive ? 'No orders match your filters.' : 'No orders found. Click "New Order" to create one.'}</td></tr>
                ) : paginated.map((r, i) => {
                  const src = getOrderSource(r);
                  const custCode = (() => {
                    if (!r.customer_id) return '';
                    if (typeof r.customer_id === 'string' && isNaN(Number(r.customer_id))) return r.customer_id;
                    const matched = customers.find(c => c.id === Number(r.customer_id));
                    return matched?.customer_id ?? str(r.customer_id);
                  })();
                  return (
                    <tr key={r.id}>
                      <td><span className="uom-serial">{(currentPage-1)*pageSize+i+1}</span></td>
                      <td><span className="uom-code">{r.order_code}</span></td>
                      <td>
                        {custCode
                          ? <span className="uom-cust-code-badge">{custCode}</span>
                          : <span style={{color:'#94a3b8',fontSize:12}}>—</span>}
                      </td>
                      <td style={{fontSize:12.5}}>{fmtDate(r.order_date)}</td>
                      <td style={{fontFamily:'JetBrains Mono,monospace',fontSize:12}}>{r.po_no||'—'}</td>
                      <td style={{fontWeight:600,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis'}}>{r.customer_name||'—'}</td>
                      <td style={{fontSize:12.5}}>{r.customer_state||'—'}</td>
                      <td style={{fontSize:12.5}}>{r.transport||'—'}</td>
                      <td>
                        {r.firm
                          ? <span className="uom-firm-badge">{r.firm}</span>
                          : <span style={{color:'#94a3b8',fontSize:12}}>—</span>}
                      </td>
                      <td>
                        {r.quality
                          ? <span className="uom-quality-cell" title={r.quality}>{r.quality}</span>
                          : <span style={{color:'#94a3b8',fontSize:12}}>—</span>}
                      </td>
                      <td style={{fontSize:12.5}}>{fmtDate(r.expect_delivery)}</td>
                      <td>{r.hsn_code ? <span className="uom-ob-chip"><FiCheck size={10}/> Added</span> : <span style={{color:'#94a3b8',fontSize:12}}>—</span>}</td>
                      <td>
                        {src === 'sr'
                          ? <span className="uom-src-sr-chip"><MdSyncAlt size={11}/> SR-Converted</span>
                          : <span className="uom-src-co-chip"><HiOutlineDocumentText size={11}/> CO</span>}
                      </td>
                      <td>
                        <div className="uom-acts">
                          <button className="uom-edit-btn" onClick={() => openCOModal(r)}><FiEdit2 size={12}/> Edit</button>
                          <button className="uom-del-btn"  onClick={() => { setDeleteTarget(r); setDeleteError(''); }}><FiTrash2 size={12}/> Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!tableLoading && !tableError && filtered.length > 0 && (
            <div className="uom-pag">
              <span>Showing {Math.min((currentPage-1)*pageSize+1, filtered.length)}–{Math.min(currentPage*pageSize, filtered.length)} of {filtered.length} records</span>
              <div className="uom-pag-btns">
                <button className="uom-pag-btn" onClick={() => goTo(1)} disabled={currentPage===1} title="First"><FiChevronsLeft size={13}/></button>
                <button className="uom-pag-btn" onClick={() => goTo(currentPage-1)} disabled={currentPage===1}><FiChevronLeft size={12}/> Prev</button>
                {pageNums.map(p => <button key={p} className={`uom-pag-btn${p===currentPage?' active':''}`} onClick={() => goTo(p)}>{p}</button>)}
                <button className="uom-pag-btn" onClick={() => goTo(currentPage+1)} disabled={currentPage===totalPages}>Next <FiChevronRight size={12}/></button>
                <button className="uom-pag-btn" onClick={() => goTo(totalPages)} disabled={currentPage===totalPages} title="Last"><FiChevronsRight size={13}/></button>
              </div>
            </div>
          )}
        </div>

        {/* ══ CUSTOMER ORDER MODAL ══ */}
        {showCOModal && (
          <div className="uom-overlay" onClick={e => e.target===e.currentTarget && closeCOModal()}>
            <div className="uom-modal">
              {modalLoading && (
                <div className="uom-modal-loading">
                  <span className="uom-spin" style={{width:28,height:28,borderWidth:3}}/>
                  <span className="uom-modal-loading-text">Loading order details…</span>
                </div>
              )}
              <div className={`uom-mhead${isFromConversion?' from-conversion':''}`}>
                <div className="uom-mhead-left">
                  <div className="uom-mhead-icon">
                    {isFromConversion ? <MdSyncAlt size={18} color="#fff"/> : <HiOutlineClipboardList size={18} color="#fff"/>}
                  </div>
                  <div>
                    <div className="uom-mhead-title">{editCOId ? 'Edit Customer Order' : isFromConversion ? 'Convert Sample to Order' : 'New Customer Order'}</div>
                    <div className="uom-mhead-sub">{isFromConversion ? 'Pre-filled from sample request — review and save' : 'Enter Order Code below to unlock Order Details'}</div>
                  </div>
                </div>
                <div className="uom-mhead-right">
                  <button className={`uom-ob-trigger-btn${obApplied?' applied':''}`} type="button" onClick={openOBModal} disabled={!obEnabled||modalLoading}>
                    {obApplied ? <FiCheck size={14}/> : <span className="ob-dot"/>}
                    <FiPackage size={13}/> Order Details
                    {obApplied && <span style={{fontSize:10.5,background:'rgba(74,222,128,0.25)',borderRadius:4,padding:'1px 6px',marginLeft:2,border:'1px solid rgba(74,222,128,0.5)'}}>Added</span>}
                  </button>
                  <button className="uom-mclose" type="button" onClick={closeCOModal}><FiX size={16}/></button>
                </div>
              </div>
              {isFromConversion && (
                <div style={{background:'linear-gradient(135deg,#faf5ff,#ede9fe)',borderBottom:'1px solid #c4b5fd',padding:'10px 26px',display:'flex',alignItems:'center',gap:10,fontSize:13,color:'#4c1d95'}}>
                  <MdSyncAlt size={16}/><span>Pre-filled from a sample request conversion. Review all fields before saving.</span>
                </div>
              )}
              <form onSubmit={handleCOSave}>
                <div className="uom-mbody">
                  {/* ── Customer selector banner ── */}
                  <div className="uom-cust-banner">
                    <div className="uom-cust-icon"><FiUser size={18} color="#fff"/></div>
                    <div className="uom-cust-content">
                      <div className="uom-cust-label">
                        Select Customer
                        {custLoading && <span className="uom-master-badge loading" style={{marginLeft:6}}><span className="uom-spin" style={{width:10,height:10,borderWidth:1.5}}/>Loading…</span>}
                        {!custLoading && customers.length>0 && <span className="uom-master-badge"><FiCheck size={10}/> {customers.length} customers</span>}
                        {!custLoading && customers.length===0 && <span className="uom-master-badge empty">No customers loaded</span>}
                      </div>
                      <div className="uom-cust-row">
                        <CustomerDropdown value={coForm.customer_id} onChange={handleCustomerSelect} customers={customers} custLoading={custLoading}/>
                        {coForm.customer_id && <span className="uom-autofill-badge"><FiCheck size={11}/> Auto-filled</span>}
                      </div>
                      {selectedCustomer && <div className="uom-autofill-hint"><FiCheck size={11}/> {selectedCustomer.customer_name}{selectedCustomer.address?` · ${selectedCustomer.address}`:''}{selectedCustomer.state?`, ${selectedCustomer.state}`:''}</div>}
                      {/* v7: show agent auto-fill hint in customer banner when agent was resolved */}
                      {coForm._agentAutoFilled && coForm.agent_name && (
                        <div style={{fontSize:11,color:'#7c3aed',fontWeight:600,marginTop:4,display:'flex',alignItems:'center',gap:4}}>
                          <FiCheck size={11}/> Agent auto-filled: <strong>{coForm.agent_name}</strong>
                        </div>
                      )}
                      {coForm.customer_name && !coForm.customer_id && <div style={{fontSize:11,color:'#7c3aed',marginTop:4}}>Pre-filled: <strong>{coForm.customer_name}</strong> — select from list above to auto-fill address &amp; agent fields</div>}
                    </div>
                  </div>

                  <div className="uom-section">
                    <div className="uom-section-title"><HiOutlineDocumentText size={13}/> Order Information</div>
                    <div className="uom-g4">
                      <div className="uom-field">
                        <label className="uom-label">Order Code <span className="uom-req">*</span></label>
                        <input className={`uom-input${isDuplicateCode?' warn':''}`} value={coForm.order_code} onChange={setCO('order_code')} required placeholder="e.g. ORD-2025-001" readOnly={!!editCOId}/>
                        {isDuplicateCode && <div className="uom-dup-warn"><FiAlertTriangle size={12}/> This order code already exists — saving will update that existing order.</div>}
                      </div>
                      <div className="uom-field"><label className="uom-label">Order Date</label><input type="date" className="uom-input" value={coForm.order_date} onChange={setCO('order_date')}/></div>
                      <div className="uom-field"><label className="uom-label">PO No</label><input className="uom-input" value={coForm.po_no} onChange={setCO('po_no')}/></div>
                      <div className="uom-field"><label className="uom-label">PO Date</label><input type="date" className="uom-input" value={coForm.po_date} onChange={setCO('po_date')}/></div>
                    </div>
                  </div>

                  <div className="uom-panels">
                    {/* ── Customer Details panel ── */}
                    <div className="uom-panel">
                      <div className="uom-panel-head"><FiUser size={12}/> Customer Details</div>
                      <div className="uom-panel-body">
                        <div className="uom-field"><label className="uom-label">Customer Name</label><input className={`uom-input${isReadonly?' ro':''}`} value={coForm.customer_name} onChange={setCO('customer_name')} readOnly={isReadonly}/></div>
                        <div className="uom-field"><label className="uom-label">Address</label><textarea className={`uom-textarea${isReadonly?' ro':''}`} value={coForm.customer_address} onChange={setCO('customer_address')} readOnly={isReadonly}/></div>
                        <div className="uom-r2">
                          <div className="uom-field"><label className="uom-label">Pincode</label><input className={`uom-input${isReadonly?' ro':''}`} value={coForm.customer_pincode} onChange={setCO('customer_pincode')} readOnly={isReadonly}/></div>
                          <div className="uom-field"><label className="uom-label">State</label><input className={`uom-input${isReadonly?' ro':''}`} value={coForm.customer_state} onChange={setCO('customer_state')} readOnly={isReadonly}/></div>
                        </div>
                        <div className="uom-field"><label className="uom-label">Country</label><input className={`uom-input${isReadonly?' ro':''}`} value={coForm.customer_country} onChange={setCO('customer_country')} readOnly={isReadonly}/></div>
                        <div className="uom-field"><label className="uom-label">GST No</label><input className={`uom-input${isReadonly?' ro':''}`} value={coForm.customer_gst_no} onChange={setCO('customer_gst_no')} readOnly={isReadonly}/></div>
                        <div className="uom-field"><label className="uom-label">Contact Name</label><input className={`uom-input${isReadonly?' ro':''}`} value={coForm.customer_contact_name} onChange={setCO('customer_contact_name')} readOnly={isReadonly}/></div>
                      </div>
                    </div>

                    {/* ── Delivery Details panel ── */}
                    <div className="uom-panel">
                      <div className="uom-panel-head"><FiTruck size={12}/> Delivery Details</div>
                      <div className="uom-panel-body">
                        <div className="uom-field"><label className="uom-label">Delivery At</label><input className="uom-input" value={coForm.delivery_at} onChange={setCO('delivery_at')}/></div>
                        <div className="uom-field"><label className="uom-label">Delivery Address</label><textarea className="uom-textarea" value={coForm.delivery_address} onChange={setCO('delivery_address')}/></div>
                        <div className="uom-r2">
                          <div className="uom-field"><label className="uom-label">Pincode</label><input className="uom-input" value={coForm.delivery_pincode} onChange={setCO('delivery_pincode')}/></div>
                          <div className="uom-field"><label className="uom-label">State</label><input className="uom-input" value={coForm.delivery_state} onChange={setCO('delivery_state')}/></div>
                        </div>
                        <div className="uom-field"><label className="uom-label">Country</label><input className="uom-input" value={coForm.delivery_country} onChange={setCO('delivery_country')}/></div>
                        <div className="uom-field"><label className="uom-label">GST No</label><input className="uom-input" value={coForm.delivery_gst_no} onChange={setCO('delivery_gst_no')}/></div>
                        <div className="uom-field"><label className="uom-label">Contact Name</label><input className="uom-input" value={coForm.delivery_contact_name} onChange={setCO('delivery_contact_name')}/></div>
                        <div className="uom-field"><label className="uom-label">Expected Delivery</label><input type="date" className="uom-input" value={coForm.expect_delivery} onChange={setCO('expect_delivery')}/></div>

                        {/* Transport master-backed select */}
                        <div className="uom-field">
                          <label className="uom-label">Transport
                            {transportLoading ? <span className="uom-master-badge loading" style={{marginLeft:6}}><span className="uom-spin" style={{width:10,height:10,borderWidth:1.5}}/>Loading…</span>
                              : transports.length>0 ? <span className="uom-master-badge" style={{marginLeft:6}}><FiCheck size={10}/> {transports.length}</span>
                              : <span className="uom-master-badge empty" style={{marginLeft:6}}>None</span>}
                          </label>
                          <div className="uom-sel-wrap">
                            <select className="uom-select" value={coForm.transport_id?Number(coForm.transport_id):''} onChange={handleTransportSelect} disabled={transportLoading}>
                              <option value="">— Select Transport —</option>
                              {transports.map(t => <option key={t.id} value={t.id}>{t.transport_code?`[${t.transport_code}] `:''}{t.transport_name}</option>)}
                            </select>
                            <FiChevronDown className="uom-sel-chev" size={13}/>
                          </div>
                          {coForm.transport && <div style={{fontSize:11,color:'#15803d',fontWeight:600,marginTop:3,display:'flex',alignItems:'center',gap:3}}><FiCheck size={10}/> {coForm.transport}</div>}
                          {!transportLoading && transports.length===0 && (
                            <input className="uom-input" style={{marginTop:6}} placeholder="Or type transport manually (e.g. DTDC, FedEx, Self)" value={coForm.transport} onChange={setCO('transport')}/>
                          )}
                        </div>

                        <div className="uom-field"><label className="uom-label">Freight</label><input className="uom-input" value={coForm.freight} onChange={setCO('freight')}/></div>

                        {/* ── v9: Firm dropdown (AEF / AE) — selection IS the value ── */}
                        <div className="uom-field">
                          <label className="uom-label">Firm</label>
                          <div className="uom-sel-wrap">
                            <select className="uom-select" value={coForm.firm || ''} onChange={handleFirmChange}>
                              <option value="">— Select Firm —</option>
                              <option value="AEF">AEF</option>
                              <option value="AE">AE</option>
                            </select>
                            <FiChevronDown className="uom-sel-chev" size={13}/>
                          </div>
                          {coForm.firm && (
                            <div style={{fontSize:11,color:'#15803d',fontWeight:600,marginTop:3,display:'flex',alignItems:'center',gap:3}}>
                              <FiCheck size={10}/> {coForm.firm}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── Order Terms panel ── */}
                    <div className="uom-panel">
                      <div className="uom-panel-head"><FiFileText size={12}/> Order Terms</div>
                      <div className="uom-panel-body">
                        <div className="uom-field"><label className="uom-label">Order Through</label><input className="uom-input" value={coForm.order_through} onChange={setCO('order_through')}/></div>

                        {/* ── Agent Name (v7: may be auto-filled from customer) ── */}
                        <div className="uom-field">
                          <label className="uom-label">Agent Name
                            {agentLoading ? <span className="uom-master-badge loading" style={{marginLeft:6}}><span className="uom-spin" style={{width:10,height:10,borderWidth:1.5}}/>Loading…</span>
                              : agents.length>0 ? <span className="uom-master-badge" style={{marginLeft:6}}><FiCheck size={10}/> {agents.length} agents</span>
                              : <span className="uom-master-badge empty" style={{marginLeft:6}}>None</span>}
                          </label>
                          <div className="uom-sel-wrap">
                            <select
                              className="uom-select"
                              value={coForm.agent_id ? Number(coForm.agent_id) : ''}
                              onChange={handleAgentSelect}
                              disabled={agentLoading}
                              style={coForm._agentAutoFilled ? {borderColor:'#86efac',background:'#f0fdf4'} : {}}
                            >
                              <option value="">— Select Agent —</option>
                              {agents.map(a => <option key={a.id} value={a.id}>{a.agent_code?`[${a.agent_code}] `:''}{a.agent_name}</option>)}
                            </select>
                            <FiChevronDown className="uom-sel-chev" size={13}/>
                          </div>
                          {coForm.agent_name && (
                            <div style={{fontSize:11,color:'#15803d',fontWeight:600,marginTop:3,display:'flex',alignItems:'center',gap:3,flexWrap:'wrap'}}>
                              <FiCheck size={10}/> {coForm.agent_name}
                              {/* v7: subtle badge when auto-filled from customer */}
                              {coForm._agentAutoFilled && (
                                <span style={{background:'#dcfce7',color:'#166534',fontSize:10,borderRadius:4,padding:'1px 6px',border:'1px solid #86efac',marginLeft:2}}>
                                  Auto-filled from customer
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="uom-field"><label className="uom-label">Commission (%)</label><input type="number" step="0.01" className="uom-input" value={coForm.commission} onChange={setCO('commission')}/></div>

                        {/* Packing Type */}
                        <div className="uom-field">
                          <label className="uom-label">Packing Type
                            {pkgLoading ? <span className="uom-master-badge loading" style={{marginLeft:6}}><span className="uom-spin" style={{width:10,height:10,borderWidth:1.5}}/>Loading…</span>
                              : packageTypes.length>0 ? <span className="uom-master-badge" style={{marginLeft:6}}><FiCheck size={10}/> {packageTypes.length}</span>
                              : <span className="uom-master-badge empty" style={{marginLeft:6}}>None</span>}
                          </label>
                          <div className="uom-sel-wrap">
                            <select className="uom-select" value={coForm.packing_type_id?Number(coForm.packing_type_id):''} onChange={handlePackageTypeSelect} disabled={pkgLoading}>
                              <option value="">— Select Packing Type —</option>
                              {packageTypes.map(p => <option key={p.id} value={p.id}>{p.package_code?`[${p.package_code}] `:''}{p.package_name}</option>)}
                            </select>
                            <FiChevronDown className="uom-sel-chev" size={13}/>
                          </div>
                          {coForm.packing_type && <div style={{fontSize:11,color:'#15803d',fontWeight:600,marginTop:3,display:'flex',alignItems:'center',gap:3}}><FiCheck size={10}/> {coForm.packing_type}</div>}
                        </div>

                        <div className="uom-field"><label className="uom-label">Confirm Mode</label><input className="uom-input" value={coForm.confirm_mode} onChange={setCO('confirm_mode')}/></div>
                        <div className="uom-field"><label className="uom-label">Confirm By</label><input className="uom-input" value={coForm.confirm_by} onChange={setCO('confirm_by')}/></div>
                        <div className="uom-field"><label className="uom-label">Confirm Code</label><input className="uom-input" value={coForm.confirm_code} onChange={setCO('confirm_code')}/></div>
                        <div className="uom-field"><label className="uom-label">Pinning</label><input className="uom-input" value={coForm.pinning} onChange={setCO('pinning')}/></div>
                        <div className="uom-field"><label className="uom-label">Rate Type</label><input className="uom-input" value={coForm.rate_type} onChange={setCO('rate_type')}/></div>
                        <div className="uom-field"><label className="uom-label">Payment Terms</label><input className="uom-input" value={coForm.payment_terms} onChange={setCO('payment_terms')}/></div>

                        {/* Certification Type */}
                        <div className="uom-field">
                          <label className="uom-label">Certification Type
                            {certLoading ? <span className="uom-master-badge loading" style={{marginLeft:6}}><span className="uom-spin" style={{width:10,height:10,borderWidth:1.5}}/>Loading…</span>
                              : certifications.length>0 ? <span className="uom-master-badge" style={{marginLeft:6}}><FiCheck size={10}/> {certifications.length}</span>
                              : <span className="uom-master-badge empty" style={{marginLeft:6}}>None</span>}
                          </label>
                          <div className="uom-sel-wrap">
                            <select className="uom-select" value={coForm.certification_id?Number(coForm.certification_id):''} onChange={handleCertificationSelect} disabled={certLoading}>
                              <option value="">— Select Certification —</option>
                              {certifications.map(c => <option key={c.id} value={c.id}>{c.certification_type}{c.certification_code?` [${c.certification_code}]`:''}</option>)}
                            </select>
                            <FiChevronDown className="uom-sel-chev" size={13}/>
                          </div>
                          {!certLoading && certifications.length===0 && (
                            <input className="uom-input" style={{marginTop:6}} placeholder="Or type certification type manually" value={coForm.certification_type} onChange={setCO('certification_type')}/>
                          )}
                          {coForm.certification_id && (
                            <div style={{fontSize:11,color:'#15803d',fontWeight:600,marginTop:3,display:'flex',alignItems:'center',gap:3}}>
                              <FiCheck size={10}/> {coForm.certification_type}{coForm.certificate_no?' — Certificate No auto-filled':''}
                            </div>
                          )}
                        </div>
                        <div className="uom-field"><label className="uom-label">Certificate No</label><input className="uom-input" value={coForm.certificate_no} onChange={setCO('certificate_no')}/></div>
                        <div className="uom-field"><label className="uom-label">Remarks</label><textarea className="uom-textarea" value={coForm.remarks} onChange={setCO('remarks')}/></div>
                      </div>
                    </div>
                  </div>

                  {/* Order Details strip */}
                  <div className={`uom-ob-strip ${obApplied?'applied':'pending'}`}>
                    <div className="uom-ob-strip-icon">{obApplied ? <FiPackage size={18}/> : <RiFileList3Line size={18}/>}</div>
                    <div className="uom-ob-strip-body">
                      {obApplied ? (
                        <><div className="uom-ob-strip-title">Order Details added</div><div className="uom-ob-strip-meta">HSN: <strong>{obForm.hsn_code}</strong> · Sort: <strong>{obForm.sort_no}</strong> · {obForm.order_type} · {obForm.items.length} item{obForm.items.length!==1?'s':''}</div></>
                      ) : (
                        <><div className="uom-ob-strip-title">Order Details not added</div><div className="uom-ob-strip-meta">{obEnabled?'Click to add quality, construction & GST details':'Enter an Order Code above to unlock Order Details'}</div></>
                      )}
                    </div>
                    {obApplied && <div className="uom-ob-strip-net">₹{fmt2(obNet)}</div>}
                    <button type="button" className="uom-ob-strip-btn" onClick={openOBModal} disabled={!obEnabled||modalLoading}>
                      {obApplied ? <><FiEdit2 size={12}/> Edit Booking</> : <><FiPlus size={12}/> Add Order Details</>}
                    </button>
                  </div>

                  {coError && <div className="uom-err-box"><FiAlertTriangle size={14}/> {coError}</div>}
                </div>
                <div className="uom-mfoot">
                  <button type="button" className="uom-cancel-btn" onClick={closeCOModal}><FiX size={13}/> Cancel</button>
                  <button type="submit" className="uom-save-btn" disabled={coSaving||modalLoading}>
                    {coSaving ? <><span className="uom-spin"/>Saving…</>
                      : editCOId ? <><FiEdit2 size={13}/> Update Order{obApplied?' + Booking':''}</>
                      : isFromConversion ? <><MdSyncAlt size={14}/> Save Converted Order{obApplied?' + Booking':''}</>
                      : isDuplicateCode ? <><FiEdit2 size={13}/> Update Existing Order{obApplied?' + Booking':''}</>
                      : <><BiSave size={15}/> Save Order{obApplied?' + Booking':''}</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ══ ORDER DETAILS MODAL ══ */}
        {showOBModal && (
          <div className="ob-overlay" onClick={e => e.target===e.currentTarget && closeOBModal()}>
            <div className="ob-modal">
              <div className="ob-mhead">
                <div className="ob-mhead-left">
                  <div className="ob-mhead-icon"><FiPackage size={17} color="#fff"/></div>
                  <div>
                    <div className="ob-mhead-title">Order Details</div>
                    <div className="ob-mhead-sub">Fabric quality, construction &amp; GST · Select Sort No to auto-fill</div>
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  {coForm.order_code && <span className="ob-linked-badge"><FiFileText size={10}/> {coForm.order_code}</span>}
                  {coForm.customer_name && <span className="ob-linked-badge"><FiUser size={10}/> {coForm.customer_name}</span>}
                  <button className="ob-mclose" onClick={closeOBModal}><FiX size={16}/></button>
                </div>
              </div>
              <div className="ob-mbody">
                <div className="ob-r3">
                  <div><label className="ob-label">Order Type</label><select className="ob-select" value={obForm.order_type} onChange={e => setOBForm({...obForm,order_type:e.target.value as 'Domestic'|'Export'})}><option>Domestic</option><option>Export</option></select></div>
                  <div><label className="ob-label">Quality Type</label><select className="ob-select" value={obForm.quality_type} onChange={e => setOBForm({...obForm,quality_type:e.target.value})}>{['Regular','Premium','Economy','Special'].map(q => <option key={q}>{q}</option>)}</select></div>
                  <div><label className="ob-label">HSN Code <span style={{color:'#dc2626'}}>*</span></label><HsnDropdown value={obForm.hsn_code} onChange={val => setOBForm({...obForm,hsn_code:val})} hsnCodes={hsnCodes} hsnLoading={hsnLoading} hsnError={hsnError}/></div>
                </div>
                <div className="ob-r13">
                  <div>
                    <label className="ob-label">Sort No <span style={{color:'#dc2626'}}>*</span>
                      {fabricLoading ? <span className="uom-master-badge loading" style={{marginLeft:6}}><span className="uom-spin" style={{width:9,height:9,borderWidth:1.5}}/>Loading…</span>
                        : fabrics.length>0 ? <span className="uom-master-badge" style={{marginLeft:6,background:'#faf5ff',color:'#6d28d9',borderColor:'#c4b5fd'}}>{fabrics.length} fabrics</span>
                        : <span className="uom-master-badge empty" style={{marginLeft:6}}>No fabrics</span>}
                    </label>
                    <FabricDropdown value={obForm.sort_no} onChange={handleFabricSelect} fabrics={fabrics} fabricLoading={fabricLoading}/>
                    {!fabricLoading && fabrics.length===0 && <input className="ob-input" style={{marginTop:6}} placeholder="Enter Sort No manually" value={obForm.sort_no} onChange={e => setOBForm({...obForm,sort_no:e.target.value})}/>}
                  </div>
                  <div>
                    <label className="ob-label">Quality (Full Description) <span style={{color:'#dc2626'}}>*</span></label>
                    {obForm.sort_no && obForm.quality ? (
                      <div style={{padding:'8px 12px',background:'#f0fdf4',border:'1.5px solid #86efac',borderRadius:8,fontSize:13,color:'#166534',fontWeight:600,lineHeight:1.5,wordBreak:'break-word'}}>
                        {obForm.quality}
                      </div>
                    ) : (
                      <input className="ob-input" placeholder='e.g. 31/1 ECOVERO × 30/1 HT / 68×56 / 63"' value={obForm.quality} onChange={e => setOBForm({...obForm,quality:e.target.value})}/>
                    )}
                  </div>
                </div>
                <div className="ob-items-hdr">
                  <span className="ob-sec-title">Construction / Items</span>
                  <button className="ob-add-row-btn" type="button" onClick={() => setOBForm(f => ({...f,items:[...f.items,emptyItem()]}))}>
                    <FiPlus size={12}/> Add Row
                  </button>
                </div>
                <div className="ob-items-wrap">
                  <table className="ob-itable">
                    <thead>
                      <tr>
                        <th className="ob-ith" style={{minWidth:240}}>Construction as PO</th>
                        <th className="ob-ithr" style={{width:80}}>Meter</th>
                        <th className="ob-ithr" style={{width:80}}>Rate</th>
                        <th className="ob-ithr" style={{width:100}}>Basic Value</th>
                        <th className="ob-ith"  style={{width:90}}>Disc. Type</th>
                        <th className="ob-ithr" style={{width:70}}>Disc. %</th>
                        <th className="ob-ithr" style={{width:100}}>Disc. Value</th>
                        <th className="ob-ithr" style={{width:100}}>Total Value</th>
                        <th className="ob-ith"  style={{width:32}}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {obForm.items.map((item, idx) => {
                        const td = idx%2===0 ? 'ob-itde' : 'ob-itdo';
                        const basic = +(item.meter*item.rate).toFixed(2);
                        return (
                          <tr key={idx}>
                            <td className={td}><input className="ob-ii" type="text" placeholder='e.g. 30ECOVERO * 30HT / 68 x 56 / 63"' value={item.construction_po} onChange={e => updateOBItem(idx,{construction_po:e.target.value})}/></td>
                            <td className={td}><input className="ob-iir" type="number" min={0} value={item.meter||''} onChange={e => updateOBItem(idx,{meter:parseFloat(e.target.value)||0})}/></td>
                            <td className={td}><input className="ob-iir" type="number" min={0} step="0.01" value={item.rate||''} onChange={e => updateOBItem(idx,{rate:parseFloat(e.target.value)||0})}/></td>
                            <td className={td} style={{textAlign:'right',fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:'#334155'}}>{fmt2(basic)}</td>
                            <td className={td}><select className="ob-isel" value={item.disc_type} onChange={e => updateOBItem(idx,{disc_type:e.target.value as OrderItem['disc_type']})}><option>None</option><option>Flat</option><option>Percent</option></select></td>
                            <td className={td}><input className={item.disc_type!=='Percent'?'ob-iid':'ob-iir'} type="number" min={0} step="0.01" value={item.disc_pct||''} disabled={item.disc_type!=='Percent'} onChange={e => updateOBItem(idx,{disc_pct:parseFloat(e.target.value)||0})}/></td>
                            <td className={td}><input className={item.disc_type!=='Flat'?'ob-iid':'ob-iir'} type="number" min={0} step="0.01" value={item.disc_value||''} disabled={item.disc_type!=='Flat'} onChange={e => updateOBItem(idx,{disc_value:parseFloat(e.target.value)||0})}/></td>
                            <td className={td} style={{textAlign:'right',fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:700,color:'#0f766e'}}>{fmt2(item.total_value)}</td>
                            <td className={td} style={{textAlign:'center'}}>{obForm.items.length>1 && <button className="ob-del-item" type="button" onClick={() => setOBForm(f => ({...f,items:f.items.filter((_,i)=>i!==idx)}))}><FiX size={14}/></button>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="ob-bot-grid">
                  <div><label className="ob-label">Delivery Instruction</label><textarea className="ob-textarea" placeholder="AT SAME" value={obForm.delivery_instruction} onChange={e => setOBForm({...obForm,delivery_instruction:e.target.value})}/></div>
                  <div className="ob-gst-box">
                    {(['CGST','SGST','IGST'] as const).map(t => {
                      const key=(t.toLowerCase()+'_pct') as 'cgst_pct'|'sgst_pct'|'igst_pct';
                      const amt = t==='CGST'?obCGST:t==='SGST'?obSGST:obIGST;
                      return (
                        <div className="ob-gst-row" key={t}>
                          <span className="ob-gst-label">{t}</span>
                          <input className="ob-gst-input" type="number" min={0} max={100} step="0.01" value={obForm[key]||''} onChange={e => setOBForm({...obForm,[key]:parseFloat(e.target.value)||0})}/>
                          <span style={{fontSize:12,color:'#94a3b8'}}>%</span>
                          <span className="ob-gst-amt">₹{fmt2(amt)}</span>
                        </div>
                      );
                    })}
                    <div className="ob-net-row"><span className="ob-net-label">Net Value</span><span className="ob-net-val">₹{fmt2(obNet)}</span></div>
                  </div>
                </div>
                {obError && <div className="ob-err"><FiAlertTriangle size={14}/> {obError}</div>}
              </div>
              <div className="ob-mfoot">
                <button className="uom-cancel-btn" type="button" onClick={closeOBModal}><FiX size={13}/> Cancel</button>
                <button className="ob-apply-btn" type="button" onClick={handleOBApply}><FiCheck size={14}/> Apply to Order</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ DELETE CONFIRM ══ */}
        {deleteTarget && (
          <div className="del-overlay">
            <div className="del-box">
              <div className="del-icon"><FiTrash2 size={38}/></div>
              <p className="del-title">Delete Order?</p>
              <p className="del-sub">This will permanently delete <strong>{deleteTarget.order_code}</strong>. This cannot be undone.</p>
              {deleteError && <div className="del-err"><FiAlertTriangle size={13} style={{marginRight:4}}/>{deleteError}</div>}
              <div className="del-actions">
                <button className="del-cancel" onClick={() => { setDeleteTarget(null); setDeleteError(''); }}>Cancel</button>
                <button className="del-confirm" disabled={deleting} onClick={confirmDelete}>
                  {deleting ? <><span className="uom-spin" style={{borderTopColor:'#fff',borderColor:'rgba(255,255,255,0.3)'}}/>Deleting…</> : <><FiTrash2 size={13}/> Yes, Delete</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
