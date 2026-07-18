// OrderStatusMaster.tsx  — UPDATED
// New features:
//   • When an order is selected in the modal:
//       – Combined "Delivery Address" auto-filled from
//         delivery_at + delivery_address + state + country + pincode + GST No
//       – "Expected Completion Date" auto-filled from expect_delivery
//   • Delivery Timeline Analysis table (below the delivery schedule in the modal):
//       – Each delivery row compared against expected completion date
//       – Delayed deliveries: RED, shows negative day count (e.g. −5 days late)
//       – On-time / early deliveries: GREEN
//       – NEW: dedicated "Actual Completion vs Expected" summary row that jumps
//        straight to the true completion date (last delivery once fully
//        delivered, else latest delivery so far) and shows the day delay in
//        RED with a minus sign, or GREEN if on-time/early
//   • Main list table: new "Expected" column + per-row delay badge next to status
//       – Delivery Dates column now lists each date on its OWN row/line
//        instead of being comma-joined into one string
//   • Main list table now also shows "Order Date" and "Delivery Address"
//        columns (fetched/enriched from the linked order, same source used
//        by the modal), so users don't have to open a record to see them.
//   • CHANGES v2 (this pass):
//       – Added a "Construction" column to the main list table (between
//        Order Date and Expected Delivery) showing each record's `quality`
//        value — the fabric quality / full construction description
//        sourced from the linked order — in a truncated, title-tooltipped
//        cell so long descriptions don't blow out the row height. This was
//        already being fetched (enrichWithDeliveryDates / openModal) and
//        already exported in CSV/Excel/Print, but was missing from the
//        on-screen table itself.
//       – colSpan on the loading/error/empty table rows bumped from 15 → 16
//        to match the new column count.
//   • CHANGES v3 (this pass):
//       – Added an Order Date "From → To" range filter to the toolbar so
//        users can narrow the main list down to orders placed within a
//        specific window, alongside the existing Status / Firm filters.

import React, {
  useEffect, useState, useMemo, useCallback, useRef,
} from 'react';
import {
  FiSearch, FiX, FiChevronDown, FiCheck, FiPlus, FiEdit2, FiTrash2,
  FiAlertTriangle, FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight,
  FiRefreshCw, FiDownload, FiTruck, FiActivity, FiCalendar, FiPackage,
  FiXCircle, FiBriefcase, FiMapPin, FiClock, FiFlag,
} from 'react-icons/fi';
import { BiSave } from 'react-icons/bi';

// ─── USER PROP ────────────────────────────────────────────────────────────────
export interface UserPayload {
  id: number;
  employee_code: string;
  name: string;
  email: string;
  role: 'employee' | 'admin';
  employee_category: string;
  module_access: string[];
  stage_access: string[];
}

interface Props { user?: UserPayload; }

// ─── TYPES ────────────────────────────────────────────────────────────────────
type StatusType = 'Pending' | 'In Process' | 'Part Delivery' | 'Completed' | 'Cancel';

interface DeliveryLine {
  id?:             number;
  delivery_date:   string;
  delivered_meter: number;
  notes:           string;
}

interface OrderStatusRecord {
  id?:                      number;
  order_booking_id?:        number | string;
  order_code:               string;
  customer_id?:             number | string;
  customer_name?:           string;
  firm_name?:               string;
  order_date?:              string;
  po_no?:                   string;
  transport?:               string;
  agent_name?:              string;
  total_meter:              number;
  delivered_meter?:         number;
  pending_meter?:           number;
  status?:                  StatusType;
  is_cancelled?:            0 | 1;
  remarks?:                 string;
  deliveries?:              DeliveryLine[];
  delivery_count?:          number;
  last_delivery_date?:      string | null;
  delivery_dates?:          string[] | null;
  // ── NEW: from linked order ───────────────────────────────────────────────
  expect_delivery?:         string;      // ISO yyyy-mm-dd — expected completion date
  combined_delivery_address?: string;    // combined display string (NOT saved to DB)
  // ── NEW: construction / quality (full description) text, sourced from the
  //         linked order's `quality` column ──────────────────────────────
  quality?:                  string;
  // ── NEW: raw delivery/address fields (source for combined_delivery_address,
  //         also enriched onto list rows so the main table can show them) ──
  delivery_at?:              string;
  delivery_address?:         string;
  delivery_state?:           string;
  delivery_country?:         string;
  delivery_pincode?:         string;
  delivery_gst_no?:          string;
}

interface CustomerOrderRef {
  id: number;
  order_code: string;
  customer_name: string;
  firm?: string;
  firm_name?: string;
  order_date?: string;
  sort_no?: string;
  basic_value?: number;
  net_value?: number;
  items?: Array<{ meter: number }> | string;
  // ── NEW: delivery & schedule fields ──────────────────────────────────────
  expect_delivery?:     string;
  delivery_at?:         string;
  delivery_address?:    string;
  delivery_state?:      string;
  delivery_country?:    string;
  delivery_pincode?:    string;
  delivery_gst_no?:     string;
  // ── NEW: construction / quality (full description) ──────────────────────
  quality?:              string;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const str = (v: unknown): string => (v == null ? '' : String(v));

const getOrderFirm = (o?: CustomerOrderRef | null): string =>
  (o?.firm_name && o.firm_name.trim()) || (o?.firm && o.firm.trim()) || '';

const fmtDate = (v?: string | null): string => {
  if (!v) return '—';
  const s = v.includes('T') ? v.slice(0, 10) : v;
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
};

const toISODate = (v: string): string => {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const s = v.includes('T') ? v.slice(0, 10) : v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const today = (): string => new Date().toISOString().slice(0, 10);

const fmt2 = (n: number): string =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Days variance: +ve = late (delivery AFTER expected), −ve = early */
const calcDaysVariance = (deliveryDate: string, expectedDate: string): number | null => {
  if (!deliveryDate || !expectedDate) return null;
  const d = new Date(deliveryDate);
  const e = new Date(expectedDate);
  if (isNaN(d.getTime()) || isNaN(e.getTime())) return null;
  return Math.round((d.getTime() - e.getTime()) / (1000 * 60 * 60 * 24));
};

/** Plain-text countdown (Order Date → Expected Completion Date), used for exports.
 *  Mirrors the badge logic in renderCountdownBadge but returns a string instead of JSX. */
const countdownText = (r: {
  expect_delivery?: string;
  status?: StatusType;
  last_delivery_date?: string | null;
}): string => {
  if (!r.expect_delivery) return '';
  if (r.status === 'Cancel') return 'N/A';
  if (r.status === 'Completed') {
    const actualDate = r.last_delivery_date || null;
    const diff = actualDate ? calcDaysVariance(actualDate, r.expect_delivery) : null;
    if (diff === null) return 'Completed';
    if (diff > 0) return `Finished -${diff}d late`;
    if (diff === 0) return 'Finished on time';
    return `Finished +${Math.abs(diff)}d early`;
  }
  const diffToday = calcDaysVariance(today(), r.expect_delivery);
  if (diffToday === null) return '';
  const daysLeft = -diffToday;
  if (daysLeft > 0) return `${daysLeft}d left`;
  if (daysLeft === 0) return 'Due today';
  return `${Math.abs(daysLeft)}d overdue`;
};

/** Build a single-field delivery address string from order fields */
const buildDeliveryAddress = (ref: {
  delivery_at?: string;
  delivery_address?: string;
  delivery_state?: string;
  delivery_country?: string;
  delivery_pincode?: string;
  delivery_gst_no?: string;
}): string => {
  const lines: string[] = [];
  if (ref.delivery_at?.trim())      lines.push(ref.delivery_at.trim());
  if (ref.delivery_address?.trim()) lines.push(ref.delivery_address.trim());
  const stateCountry = [ref.delivery_state, ref.delivery_country].filter(Boolean).join(', ');
  if (stateCountry)                 lines.push(stateCountry);
  if (ref.delivery_pincode?.trim()) lines.push(`PIN: ${ref.delivery_pincode.trim()}`);
  if (ref.delivery_gst_no?.trim())  lines.push(`GST: ${ref.delivery_gst_no.trim()}`);
  return lines.join('\n');
};

function calcStatus(total: number, delivered: number, cancelled: boolean): StatusType {
  if (cancelled) return 'Cancel';
  if (total <= 0) return 'Pending';
  if (delivered >= total) return 'Completed';
  if (delivered > 0) return 'Part Delivery';
  return 'Pending';
}

function extractTotalMeter(order: CustomerOrderRef): number {
  if (!order.items) return 0;
  let items: Array<{ meter: number }> = [];
  if (typeof order.items === 'string') {
    try { items = JSON.parse(order.items); } catch { return 0; }
  } else {
    items = order.items;
  }
  return items.reduce((s, i) => s + (Number(i.meter) || 0), 0);
}

const STATUS_COLORS: Record<StatusType, { bg: string; color: string; border: string }> = {
  'Pending':       { bg: '#fefce8', color: '#a16207', border: '#fde047' },
  'In Process':    { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  'Part Delivery': { bg: '#fff7ed', color: '#c2410c', border: '#fb923c' },
  'Completed':     { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  'Cancel':        { bg: '#fff1f2', color: '#be123c', border: '#fca5a5' },
};

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

// ─── TOKEN ────────────────────────────────────────────────────────────────────
const getToken = (): string => {
  const KEYS = ['token','auth_token','access_token','authToken','accessToken','jwt','JWT'];
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of KEYS) {
      try {
        const raw = storage.getItem(key);
        if (!raw) continue;
        try {
          const p = JSON.parse(raw);
          const t = p?.access_token || p?.token || p?.accessToken;
          if (t && t.length > 10) return t;
        } catch { /**/ }
        if (raw.length > 10) return raw;
      } catch { /**/ }
    }
  }
  return '';
};

// ─── SAFE FETCH ───────────────────────────────────────────────────────────────
const safeFetch = async (url: string, options?: RequestInit): Promise<Response | null> => {
  try {
    const token = getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 || res.status === 403) return null;
    if (res.status >= 500) {
      try { const e = await res.clone().json(); console.error(`[safeFetch] ${res.status}`, e); }
      catch { console.error(`[safeFetch] ${res.status}`, await res.clone().text()); }
      return null;
    }
    return res;
  } catch (e) { console.error('[safeFetch]', e); return null; }
};

// ─── EMPTY HELPERS ────────────────────────────────────────────────────────────
const emptyForm = (): OrderStatusRecord => ({
  order_code: '', firm_name: '', total_meter: 0, is_cancelled: 0, remarks: '',
  deliveries: [], expect_delivery: '', combined_delivery_address: '', quality: '',
});

const emptyLine = (): DeliveryLine => ({ delivery_date: today(), delivered_meter: 0, notes: '' });

// ─── DELIVERY ENRICHMENT ──────────────────────────────────────────────────────
// Fetches per-record detail (delivery dates, order date, expected delivery date
// and delivery address fields) so the main list table can render them without
// requiring the user to open the edit modal.
async function enrichWithDeliveryDates(list: OrderStatusRecord[]): Promise<OrderStatusRecord[]> {
  return Promise.all(list.map(async (r) => {
    if (!r.id) return r;
    // Already enriched (has delivery_dates array populated by a prior pass) — skip re-fetch.
    if (Array.isArray(r.delivery_dates) && r.combined_delivery_address !== undefined) return r;
    try {
      const res = await safeFetch(`/api/order-status/${r.id}`);
      if (!res || !res.ok) return r;
      const data = await res.json();
      const rec  = data.data || data;
      const deliveries: DeliveryLine[] = Array.isArray(rec.deliveries) ? rec.deliveries : [];
      const dates = deliveries.map(d => toISODate(d.delivery_date)).filter(Boolean).sort();
      const addressSource = {
        delivery_at:      rec.delivery_at,
        delivery_address: rec.delivery_address,
        delivery_state:   rec.delivery_state,
        delivery_country: rec.delivery_country,
        delivery_pincode: rec.delivery_pincode,
        delivery_gst_no:  rec.delivery_gst_no,
      };
      return {
        ...r,
        delivery_count:     deliveries.length,
        last_delivery_date: dates.length ? dates[dates.length - 1] : null,
        delivery_dates:     dates,
        expect_delivery:    rec.expect_delivery ? toISODate(rec.expect_delivery) : r.expect_delivery,
        // ── NEW: order date + delivery address, sourced the same way the modal does ──
        order_date:         rec.order_date ? toISODate(rec.order_date) : r.order_date,
        quality:            rec.quality != null ? rec.quality : r.quality,
        ...addressSource,
        combined_delivery_address: buildDeliveryAddress(addressSource),
      };
    } catch { return r; }
  }));
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function OrderStatusMaster({ user }: Props) {

  const [records,      setRecords]      = useState<OrderStatusRecord[]>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [tableError,   setTableError]   = useState('');
  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState<StatusType | ''>('');
  const [filterFirm,   setFilterFirm]   = useState('');
  // ── NEW: Order Date range filter (start date → end date) ─────────────────
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo,   setFilterDateTo]   = useState('');
  const [pageSize,     setPageSize]     = useState(10);
  const [currentPage,  setCurrentPage]  = useState(1);

  const [orderRefs,    setOrderRefs]    = useState<CustomerOrderRef[]>([]);
  const [orderSearch,  setOrderSearch]  = useState('');
  const [ordersLoading,setOrdersLoading]= useState(false);

  const [showModal,    setShowModal]    = useState(false);
  const [editId,       setEditId]       = useState<number | null>(null);
  const [form,         setForm]         = useState<OrderStatusRecord>(emptyForm());
  const [saving,       setSaving]       = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [formError,    setFormError]    = useState('');

  const [deleteTarget, setDeleteTarget] = useState<OrderStatusRecord | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [deleteError,  setDeleteError]  = useState('');

  const [exportOpen,   setExportOpen]   = useState(false);
  const [exporting,    setExporting]    = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ─── Derived ────────────────────────────────────────────────────────────
  const deliveredTotal = useMemo(() =>
    (form.deliveries || []).reduce((s, d) => s + (Number(d.delivered_meter) || 0), 0),
    [form.deliveries]
  );
  const pendingTotal  = Math.max(0, (form.total_meter || 0) - deliveredTotal);
  // Over-delivery: delivered meters exceed the order's total meter.
  const excessTotal   = Math.max(0, deliveredTotal - (form.total_meter || 0));
  const previewStatus = calcStatus(form.total_meter || 0, deliveredTotal, form.is_cancelled === 1);

  // ─── Load records ────────────────────────────────────────────────────────
  const loadRecords = useCallback(async () => {
    setTableLoading(true); setTableError('');
    try {
      const qs = new URLSearchParams();
      if (user?.id)    qs.set('employee_id', String(user.id));
      if (search)      qs.set('search',      search);
      if (filterStatus)qs.set('status',      filterStatus);
      qs.set('limit', '500');
      const res = await safeFetch(`/api/order-status?${qs}`);
      if (!res) { setTableError('Authentication failed (401).'); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load records');
      const base = Array.isArray(data.data || data) ? (data.data || data) : [];
      const enriched = await enrichWithDeliveryDates(base);
      setRecords(enriched);
    } catch (e: any) { setTableError(e.message || 'Could not load records'); }
    finally { setTableLoading(false); }
  }, [user?.id, search, filterStatus]);

  // ─── Load order refs ─────────────────────────────────────────────────────
  const loadOrderRefs = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const qs = new URLSearchParams();
      if (user?.id) qs.set('employee_id', String(user.id));
      if (orderSearch) qs.set('search', orderSearch);
      qs.set('limit', '200');
      const res = await safeFetch(`/api/order-bookings?${qs}`);
      if (!res) return;
      const data = await res.json();
      const raw  = data.data || data;
      setOrderRefs(Array.isArray(raw) ? raw : []);
    } catch { setOrderRefs([]); }
    finally { setOrdersLoading(false); }
  }, [user?.id, orderSearch]);

  useEffect(() => { loadRecords(); }, [loadRecords]);
  useEffect(() => { loadOrderRefs(); }, [loadOrderRefs]);
  useEffect(() => { setCurrentPage(1); }, [search, filterStatus, filterFirm, filterDateFrom, filterDateTo]);

  // ─── Open modal ──────────────────────────────────────────────────────────
  const openModal = async (r?: OrderStatusRecord) => {
    setFormError(''); setOrderSearch('');
    if (r?.id) {
      setModalLoading(true); setShowModal(true); setEditId(r.id);
      try {
        const res = await safeFetch(`/api/order-status/${r.id}`);
        if (!res || !res.ok) { setForm(r); } else {
          const data = await res.json();
          const rec  = data.data || data;
          setForm({
            ...rec,
            deliveries: (rec.deliveries || []).map((d: DeliveryLine) => ({
              ...d,
              delivery_date:   toISODate(d.delivery_date),
              delivered_meter: Number(d.delivered_meter) || 0,
              notes:           str(d.notes),
            })),
            expect_delivery: rec.expect_delivery ? toISODate(rec.expect_delivery) : '',
            order_date:      rec.order_date ? toISODate(rec.order_date) : '',
            // ── Construction / quality (full description), sourced from the
            //    linked order's `quality` column ──────────────────────────
            quality:         rec.quality != null ? rec.quality : '',
            // Rebuild combined address from the joined order fields returned by backend
            combined_delivery_address: buildDeliveryAddress({
              delivery_at:      rec.delivery_at,
              delivery_address: rec.delivery_address,
              delivery_state:   rec.delivery_state,
              delivery_country: rec.delivery_country,
              delivery_pincode: rec.delivery_pincode,
              delivery_gst_no:  rec.delivery_gst_no,
            }),
          });
        }
      } catch { setForm(r); }
      finally { setModalLoading(false); }
    } else {
      setEditId(null);
      setForm(emptyForm());
      setShowModal(true);
    }
  };

  const closeModal = () => {
    setShowModal(false); setEditId(null); setForm(emptyForm());
    setFormError(''); setModalLoading(false); setOrderSearch('');
  };

  // ─── Order picker ────────────────────────────────────────────────────────
  const handleOrderSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    if (!id) {
      setForm(prev => ({
        ...prev,
        order_booking_id: '', order_code: '', customer_name: '',
        firm_name: '', total_meter: 0, deliveries: [],
        expect_delivery: '', combined_delivery_address: '', order_date: '',
        quality: '',
      }));
      return;
    }
    const ref = orderRefs.find(o => o.id === id);
    if (!ref) return;
    const meters = extractTotalMeter(ref);
    setForm(prev => ({
      ...prev,
      order_booking_id:          ref.id,
      order_code:                ref.order_code,
      customer_name:             ref.customer_name,
      firm_name:                 getOrderFirm(ref),
      total_meter:               meters || prev.total_meter,
      deliveries:                prev.deliveries && prev.deliveries.length > 0 ? prev.deliveries : [emptyLine()],
      expect_delivery:           ref.expect_delivery ? toISODate(ref.expect_delivery) : '',
      combined_delivery_address: buildDeliveryAddress(ref),
      order_date:                ref.order_date ? toISODate(ref.order_date) : '',
      quality:                   ref.quality != null ? ref.quality : '',
    }));
  };

  // ─── Delivery lines ──────────────────────────────────────────────────────
  const updateLine = (idx: number, patch: Partial<DeliveryLine>) =>
    setForm(prev => {
      const d = [...(prev.deliveries || [])];
      d[idx] = { ...d[idx], ...patch };
      return { ...prev, deliveries: d };
    });

  const addLine = () =>
    setForm(prev => ({ ...prev, deliveries: [...(prev.deliveries || []), emptyLine()] }));

  const removeLine = (idx: number) =>
    setForm(prev => ({ ...prev, deliveries: (prev.deliveries || []).filter((_, i) => i !== idx) }));

  // ─── Save ────────────────────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.order_code.trim()) { setFormError('Order Code is required.'); return; }
    if (!form.total_meter || form.total_meter <= 0) { setFormError('Total Meter must be greater than 0.'); return; }
    const hasEmptyDate = (form.deliveries || []).some(d => !d.delivery_date);
    if (hasEmptyDate) { setFormError('All delivery lines must have a date.'); return; }

    setFormError(''); setSaving(true);
    const payload = {
  order_booking_id: form.order_booking_id || null,
  order_code:       form.order_code,
  customer_id:      form.customer_id || null,
  firm_name:        form.firm_name || null,
  total_meter:      Number(form.total_meter),
  is_cancelled:     form.is_cancelled ? 1 : 0,
  remarks:          form.remarks || null,
  // ── NEW: snapshot these into order_status_master so Construction /
  //         delivery schedule survive reload and don't depend on a live
  //         JOIN to order_bookings ─────────────────────────────────────
  quality:            form.quality || null,
  order_date:         form.order_date || null,
  expect_delivery:    form.expect_delivery || null,
  delivery_at:        form.delivery_at || null,
  delivery_address:   form.delivery_address || null,
  delivery_state:     form.delivery_state || null,
  delivery_country:   form.delivery_country || null,
  delivery_pincode:   form.delivery_pincode || null,
  delivery_gst_no:    form.delivery_gst_no || null,
  deliveries:       (form.deliveries || []).map(d => ({
    id:              d.id,
    delivery_date:   d.delivery_date,
    delivered_meter: Number(d.delivered_meter) || 0,
    notes:           d.notes || '',
  })),
};

    try {
      const url    = editId ? `/api/order-status/${editId}` : '/api/order-status';
      const method = editId ? 'PUT' : 'POST';
      const res = await safeFetch(url, { method, body: JSON.stringify(payload) });
      if (!res) throw new Error('Authentication failed.');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Save failed');
      closeModal(); loadRecords();
    } catch (e: any) { setFormError(e.message || 'Save failed.'); }
    finally { setSaving(false); }
  };

  // ─── Delete ──────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true); setDeleteError('');
    try {
      const res = await safeFetch(`/api/order-status/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res) throw new Error('Authentication failed.');
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Delete failed'); }
      setDeleteTarget(null); loadRecords();
    } catch (e: any) { setDeleteError(e.message || 'Delete failed'); }
    finally { setDeleting(false); }
  };

  // ─── Export helpers ──────────────────────────────────────────────────────
  const fetchAllForExport = async (): Promise<OrderStatusRecord[]> => {
    const qs = new URLSearchParams();
    if (user?.id)    qs.set('employee_id', String(user.id));
    if (search)      qs.set('search',      search);
    if (filterStatus)qs.set('status',      filterStatus);
    qs.set('limit', '10000');
    const res = await safeFetch(`/api/order-status?${qs}`);
    if (!res) return [];
    const data = await res.json();
    const base = Array.isArray(data.data || data) ? (data.data || data) : [];
    return enrichWithDeliveryDates(base);
  };

  const buildRows = (data: OrderStatusRecord[]) =>
    data.map((r, i) => {
      return {
        '#':                  i + 1,
        'Order Code':         r.order_code,
        'Customer':           r.customer_name || '',
        'Firm':               r.firm_name || '',
        'PO No':              r.po_no || '',
        'Order Date':         r.order_date ? fmtDate(r.order_date) : '',
        'Construction':       r.quality || '',
        'Expected Delivery':  r.expect_delivery ? fmtDate(r.expect_delivery) : '',
        'Countdown':          countdownText(r),
        'Delivery Address':   r.combined_delivery_address ? r.combined_delivery_address.replace(/\n/g, ', ') : '',
        'Total Meter':        Number(r.total_meter || 0).toFixed(2),
        'Delivered Meter':    Number(r.delivered_meter || 0).toFixed(2),
        'Pending Meter':      Number(r.pending_meter || 0).toFixed(2),
        'Delivery Dates':     (r.delivery_dates && r.delivery_dates.length)
                                 ? r.delivery_dates.map(fmtDate).join(', ')
                                 : (r.last_delivery_date ? fmtDate(r.last_delivery_date) : ''),
        'Status':             r.status || '',
        'Transport':          r.transport || '',
        'Remarks':            r.remarks || '',
      };
    });

  const esc = (v: any): string => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const dl = (blob: Blob, name: string) => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
  };

  const handleExportCSV = async () => {
    setExportOpen(false); setExporting(true);
    const rows = buildRows(await fetchAllForExport());
    if (!rows.length) { setExporting(false); return; }
    const h = Object.keys(rows[0]);
    dl(new Blob([[h, ...rows.map(r => h.map(k => esc((r as any)[k])).join(','))].join('\n')], { type: 'text/csv;charset=utf-8;' }),
      `order-status-${today()}.csv`);
    setExporting(false);
  };

  const handleExportExcel = async () => {
    setExportOpen(false); setExporting(true);
    const rows = buildRows(await fetchAllForExport());
    if (!rows.length) { setExporting(false); return; }
    const h = Object.keys(rows[0]);
    dl(new Blob([`<html><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${h.map(k => `<td>${(r as any)[k]??''}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`], { type: 'application/vnd.ms-excel' }),
      `order-status-${today()}.xls`);
    setExporting(false);
  };

  const handlePrint = async () => {
    setExportOpen(false); setExporting(true);
    const rows = buildRows(await fetchAllForExport());
    if (!rows.length) { setExporting(false); return; }
    const h   = Object.keys(rows[0]);
    const win = window.open('', '_blank', 'width=1200,height=700');
    if (!win) { setExporting(false); return; }
    win.document.write(`<html><head><title>Order Status</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#1a2332}h2{margin:0 0 4px;font-size:18px}p{margin:0 0 16px;color:#64748b;font-size:12px}table{width:100%;border-collapse:collapse;font-size:11.5px}th,td{border:1px solid #cbd5e1;padding:6px 10px;text-align:left}th{background:#1a56db;color:#fff}tr:nth-child(even) td{background:#eff6ff}</style></head><body><h2>Order Status Report</h2><p>${rows.length} records · ${new Date().toLocaleString('en-IN')}</p><table><thead><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${h.map(k=>`<td>${(r as any)[k]??''}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=function(){window.print();}<\/script></body></html>`);
    win.document.close(); setExporting(false);
  };

  // ─── Unique firm list (derived from loaded records) for the Firm filter ──
  const uniqueFirms = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => { if (r.firm_name && r.firm_name.trim()) set.add(r.firm_name.trim()); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [records]);

  // ─── Pagination ──────────────────────────────────────────────────────────
  const filtered   = records.filter(r => {
    const orderDateISO = r.order_date ? toISODate(r.order_date) : '';
    // ── NEW: Order Date range filter — a row only matches when it has an
    //    order date AND that date falls within the selected [from, to]
    //    window (an unset bound on either side is treated as "no limit"). ──
    const inDateRange =
      (!filterDateFrom || (orderDateISO !== '' && orderDateISO >= filterDateFrom)) &&
      (!filterDateTo   || (orderDateISO !== '' && orderDateISO <= filterDateTo));
    return [r.order_code, r.customer_name, r.firm_name, r.po_no, r.status, r.transport].some(v =>
      (v || '').toLowerCase().includes(search.toLowerCase())
    ) && (!filterStatus || r.status === filterStatus)
      && (!filterFirm || r.firm_name === filterFirm)
      && inDateRange;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const goTo       = (p: number) => setCurrentPage(Math.min(Math.max(1, p), totalPages));
  const pageNums   = (() => {
    const s = Math.max(1, currentPage - 2); const e = Math.min(totalPages, s + 4);
    const start = e - s < 4 ? Math.max(1, e - 4) : s;
    return Array.from({ length: e - start + 1 }, (_, i) => start + i);
  })();

  const filteredOrderRefs = orderRefs.filter(o =>
    o.order_code.toLowerCase().includes(orderSearch.toLowerCase()) ||
    (o.customer_name || '').toLowerCase().includes(orderSearch.toLowerCase()) ||
    getOrderFirm(o).toLowerCase().includes(orderSearch.toLowerCase())
  );

  // ─── Countdown badge helper (Order Date → Expected Completion Date) ─────
  // Shows how many days remain until the expected completion date (or how
  // many days overdue it is), same logic used in the modal's Countdown row.
  const renderCountdownBadge = (r: OrderStatusRecord) => {
    if (!r.expect_delivery) return <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>;
    if (r.status === 'Cancel') {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1',
          borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
        }}>
          — N/A
        </span>
      );
    }
    if (r.status === 'Completed') {
      const actualDate = r.last_delivery_date || null;
      const diff = actualDate ? calcDaysVariance(actualDate, r.expect_delivery) : null;
      if (diff === null) {
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac',
            borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            ✓ Completed
          </span>
        );
      }
      if (diff > 0) return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: '#fff1f2', color: '#dc2626', border: '1px solid #fca5a5',
          borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
        }}>
          Finished −{diff}d late
        </span>
      );
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac',
          borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
        }}>
          {diff === 0 ? '✓ Finished on time' : `✓ Finished +${Math.abs(diff)}d early`}
        </span>
      );
    }
    // Pending / In Process / Part Delivery — count down from today to expected completion
    const diffToday = calcDaysVariance(today(), r.expect_delivery);
    if (diffToday === null) return <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>;
    const daysLeft = -diffToday;
    if (daysLeft > 0) return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac',
        borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
      }}>
        {daysLeft}d left
      </span>
    );
    if (daysLeft === 0) return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: '#fefce8', color: '#a16207', border: '1px solid #fde047',
        borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
      }}>
        ⚡ Due today
      </span>
    );
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: '#fff1f2', color: '#dc2626', border: '1px solid #fca5a5',
        borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
      }}>
        ⚠ {Math.abs(daysLeft)}d overdue
      </span>
    );
  };

  // ─── Delay badge helper for main table ──────────────────────────────────
  const renderDelayBadge = (r: OrderStatusRecord) => {
    if (!r.expect_delivery || r.status === 'Cancel') return null;
    const compareDate = r.last_delivery_date || (r.status === 'Completed' ? r.last_delivery_date : null);
    if (!compareDate && r.status !== 'Completed') {
      // Order not yet delivered — compare today vs expected
      const todayISO = today();
      const diff = calcDaysVariance(todayISO, r.expect_delivery);
      if (diff === null || diff <= 0) return null; // not yet overdue
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          background: '#fff1f2', color: '#dc2626', border: '1px solid #fca5a5',
          borderRadius: 20, padding: '1px 7px', fontSize: 10.5, fontWeight: 700,
          marginTop: 3, whiteSpace: 'nowrap',
        }}>
          ⚠ {diff}d overdue
        </span>
      );
    }
    if (!compareDate) return null;
    const diff = calcDaysVariance(compareDate, r.expect_delivery);
    if (diff === null) return null;
    if (diff > 0) return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        background: '#fff1f2', color: '#dc2626', border: '1px solid #fca5a5',
        borderRadius: 20, padding: '1px 7px', fontSize: 10.5, fontWeight: 700,
        marginTop: 3, whiteSpace: 'nowrap',
      }}>
        −{diff}d late
      </span>
    );
    return null;
  };

  // ─── Delivery Timeline Analysis (modal) ──────────────────────────────────
  const renderTimelineTable = () => {
    const deliveries = form.deliveries || [];
    if (!deliveries.length) return null;
    const hasExpected = !!form.expect_delivery;

    // ── Actual completion vs expected: jumps straight to the real
    //    completion date instead of any single delivery line.
    //    - If the order is fully delivered (delivered >= total): use the
    //      LAST delivery date as the "actual completion date".
    //    - Otherwise: use the latest delivery so far, labelled as
    //      "in-progress" rather than "completed".
    const withDates      = deliveries.filter(d => !!d.delivery_date);
    const sortedDates     = withDates.map(d => d.delivery_date).slice().sort();
    const latestDate      = sortedDates.length ? sortedDates[sortedDates.length - 1] : null;
    const isFullyDelivered = (form.total_meter || 0) > 0 && deliveredTotal >= (form.total_meter || 0);
    const completionDiff  = (hasExpected && latestDate) ? calcDaysVariance(latestDate, form.expect_delivery!) : null;

    if (!hasExpected) return null;

    return (
      <div className="osm-del-wrap" style={{ marginBottom: 14 }}>
        <table className="osm-del-table">
          <thead>
            <tr>
              <th className="osm-dth">Delivery Line</th>
              <th className="osm-dth">Date</th>
              <th className="osm-dthr">Meter</th>
              <th className="osm-dth">Variance vs Expected</th>
            </tr>
          </thead>
          <tbody>
            {withDates.map((d, idx) => {
              const diff = calcDaysVariance(d.delivery_date, form.expect_delivery!);
              const td = idx % 2 === 0 ? 'osm-dtde' : 'osm-dtdo';
              return (
                <tr key={idx}>
                  <td className={td}>#{idx + 1}</td>
                  <td className={td}>{fmtDate(d.delivery_date)}</td>
                  <td className={td} style={{ textAlign: 'right', fontFamily: "'JetBrains Mono',monospace" }}>{fmt2(d.delivered_meter)} m</td>
                  <td className={td}>
                    {diff === null ? '—' : diff > 0 ? (
                      <span style={{ color: '#dc2626', fontWeight: 700 }}>−{diff}d late</span>
                    ) : diff === 0 ? (
                      <span style={{ color: '#15803d', fontWeight: 700 }}>On time</span>
                    ) : (
                      <span style={{ color: '#15803d', fontWeight: 700 }}>+{Math.abs(diff)}d early</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {latestDate && (
              <tr className="osm-del-total-row">
                <td colSpan={3} style={{ padding: '8px 10px', fontWeight: 700, fontSize: 12, color: '#475569' }}>
                  {isFullyDelivered ? 'Actual Completion vs Expected' : 'Latest Progress vs Expected'}
                </td>
                <td style={{ padding: '8px 10px' }}>
                  {completionDiff === null ? '—' : completionDiff > 0 ? (
                    <span style={{ color: '#dc2626', fontWeight: 800 }}>−{completionDiff}d late</span>
                  ) : completionDiff === 0 ? (
                    <span style={{ color: '#15803d', fontWeight: 800 }}>On time</span>
                  ) : (
                    <span style={{ color: '#15803d', fontWeight: 800 }}>+{Math.abs(completionDiff)}d early</span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        .osm-root{font-family:'Plus Jakarta Sans',sans-serif;background:#f0f4f8;min-height:100vh;color:#1a2332;font-size:13.5px}
        /* PAGE HEADER */
        .osm-page-header{padding:20px 28px 0;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px}
        .osm-page-title{font-size:22px;font-weight:800;color:#1a2332;letter-spacing:-.5px}
        .osm-page-sub{font-size:12px;color:#64748b;margin-top:2px}
        .osm-new-btn{display:flex;align-items:center;gap:7px;background:#1a56db;color:#fff;border:none;border-radius:10px;padding:10px 20px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;transition:background .15s,transform .1s;box-shadow:0 3px 10px rgba(26,86,219,.3)}
        .osm-new-btn:hover{background:#1649c0;transform:translateY(-1px)}
        /* TOOLBAR */
        .osm-toolbar{padding:16px 28px 12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .osm-search-wrap{position:relative;flex:1;min-width:200px;max-width:300px}
        .osm-search-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:#94a3b8;pointer-events:none}
        .osm-search{width:100%;padding:8px 14px 8px 34px;border:1px solid #dde3ec;border-radius:9px;font-size:13px;font-family:inherit;background:#fff;color:#1a2332;outline:none;transition:border .15s,box-shadow .15s}
        .osm-search:focus{border-color:#1a56db;box-shadow:0 0 0 3px rgba(26,86,219,.1)}
        .osm-filter-sel{border:1px solid #dde3ec;border-radius:9px;padding:8px 12px;font-size:13px;font-family:inherit;background:#fff;color:#1a2332;outline:none;cursor:pointer;transition:border .15s}
        .osm-filter-sel:focus{border-color:#1a56db}
        .osm-rec-count{font-size:12.5px;color:#64748b;white-space:nowrap}
        .osm-page-size{margin-left:auto;display:flex;align-items:center;gap:8px;font-size:12.5px;color:#64748b}
        .osm-page-size select{border:1px solid #dde3ec;border-radius:7px;padding:6px 10px;font-size:12.5px;font-family:inherit;background:#fff;cursor:pointer;outline:none}
        .osm-page-size select:focus{border-color:#1a56db}
        /* NEW: Order Date range filter group */
        .osm-daterange{display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #dde3ec;border-radius:9px;padding:4px 6px}
        .osm-daterange-label{font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding-left:4px;white-space:nowrap}
        .osm-daterange input[type="date"]{border:none;border-radius:6px;padding:5px 6px;font-size:12.5px;font-family:inherit;background:#f8fafc;color:#1a2332;outline:none;cursor:pointer}
        .osm-daterange input[type="date"]:focus{background:#eff6ff}
        .osm-daterange-sep{font-size:11.5px;color:#94a3b8}
        .osm-daterange-clear{background:none;border:none;color:#1a56db;font-size:11.5px;font-weight:700;cursor:pointer;padding:3px 6px;font-family:inherit;white-space:nowrap}
        .osm-daterange-clear:hover{text-decoration:underline}
        /* CARD / TABLE */
        .osm-card{margin:0 28px 28px;background:#fff;border-radius:14px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,.07);overflow:hidden}
        .osm-table-wrap{overflow-x:auto;scrollbar-width:thin;scrollbar-color:#c7d3e8 transparent}
        .osm-table{width:100%;border-collapse:collapse;font-size:13px;min-width:1780px}
        .osm-table thead tr{background:linear-gradient(135deg,#1a56db 0%,#2563eb 100%)}
        .osm-table th{padding:12px 16px;color:#fff;font-weight:600;text-align:left;white-space:nowrap;font-size:12px;letter-spacing:.03em;text-transform:uppercase;border-right:1px solid rgba(255,255,255,.08)}
        .osm-table th:last-child{border-right:none}
        .osm-table th.tc{text-align:center}
        .osm-table tbody tr:nth-child(odd)  td{background:#fff}
        .osm-table tbody tr:nth-child(even) td{background:#f7f9fc}
        .osm-table tbody tr:hover td{background:#eff6ff!important;transition:background .12s}
        .osm-table td{padding:10px 16px;color:#374151;white-space:nowrap;font-size:13px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
        .osm-table tbody tr:last-child td{border-bottom:none}
        .osm-code{font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:600;color:#1a56db;background:#eff6ff;border:1px solid #bfdbfe;border-radius:5px;padding:2px 8px;display:inline-block}
        .osm-firm-badge{font-size:11.5px;font-weight:700;color:#7c3aed;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:5px;padding:2px 8px;display:inline-block}
        .osm-serial{color:#94a3b8;font-size:12px}
        .osm-acts{display:flex;align-items:center;gap:6px;justify-content:center}
        .osm-edit-btn{display:inline-flex;align-items:center;gap:5px;background:#eff6ff;color:#1a56db;border:1px solid #bfdbfe;padding:5px 11px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;transition:background .12s;font-family:inherit;white-space:nowrap}
        .osm-edit-btn:hover{background:#dbeafe;border-color:#93c5fd}
        .osm-del-btn{display:inline-flex;align-items:center;gap:5px;background:#fff1f2;color:#dc2626;border:1px solid #fca5a5;padding:5px 11px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;transition:background .12s;font-family:inherit;white-space:nowrap}
        .osm-del-btn:hover{background:#fee2e2;border-color:#f87171}
        .osm-empty{text-align:center;padding:52px 16px;color:#94a3b8;font-size:13px}
        /* STATUS BADGE */
        .osm-status-badge{display:inline-flex;align-items:center;gap:5px;border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:700;white-space:nowrap;border-width:1px;border-style:solid}
        /* STATUS CELL with delay */
        .osm-status-cell{display:flex;flex-direction:column;align-items:flex-start;gap:2px}
        /* EXPECTED DATE CELL */
        .osm-exp-date{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:#7c3aed;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:5px;padding:2px 7px;white-space:nowrap}
        /* ORDER DATE CELL */
        .osm-order-date{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:#0f766e;background:#f0fdfa;border:1px solid #99f6e4;border-radius:5px;padding:2px 7px;white-space:nowrap}
        /* DELIVERY ADDRESS CELL — truncated with tooltip showing full text */
        .osm-addr-cell{max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#374151;cursor:default}
        /* CONSTRUCTION / QUALITY CELL — truncated with tooltip showing full text */
        .osm-quality-cell{display:inline-block;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:12px;vertical-align:middle;cursor:default}
        /* PROGRESS BAR */
        .osm-progress-wrap{min-width:120px}
        .osm-progress-bg{height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden;margin-bottom:3px}
        .osm-progress-fill{height:100%;border-radius:99px;transition:width .3s}
        .osm-progress-label{font-size:10.5px;color:#64748b;white-space:nowrap}
        /* DELIVERY DATES CELL — compact: latest date + term-count badge, full history on hover */
        .osm-deldates{display:flex;align-items:center;gap:6px;white-space:nowrap;max-width:220px;cursor:default}
        .osm-deldates-latest{display:inline-flex;align-items:center;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:#0f766e;background:#f0fdfa;border:1px solid #99f6e4;border-radius:5px;padding:2px 7px;white-space:nowrap}
        .osm-deldates-badge{font-size:10.5px;font-weight:700;color:#64748b;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:20px;padding:2px 8px;white-space:nowrap;flex-shrink:0}
        /* PAGINATION */
        .osm-pag{display:flex;align-items:center;justify-content:space-between;padding:11px 20px;border-top:1px solid #edf0f5;background:#f8fafc;font-size:12.5px;color:#64748b;flex-wrap:wrap;gap:10px}
        .osm-pag-btns{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
        .osm-pag-btn{padding:5px 12px;border:1px solid #dde3ec;border-radius:7px;background:#fff;cursor:pointer;font-size:12.5px;font-family:inherit;color:#374151;transition:background .12s;min-height:30px;display:flex;align-items:center;gap:3px}
        .osm-pag-btn:hover:not(:disabled){background:#eff6ff;border-color:#93c5fd;color:#1a56db}
        .osm-pag-btn.active{background:#1a56db;color:#fff;border-color:#1a56db;font-weight:700}
        .osm-pag-btn:disabled{background:#f8fafc;color:#cbd5e1;cursor:not-allowed}
        /* SPINNER */
        .osm-spin{display:inline-block;width:16px;height:16px;border:2px solid #e2e8f0;border-top-color:#1a56db;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:6px}
        @keyframes spin{to{transform:rotate(360deg)}}
        /* EXPORT DROPDOWN */
        .osm-export-wrap{position:relative;flex-shrink:0}
        .osm-export-trigger{display:flex;align-items:center;gap:6px;background:#fff;color:#1a56db;border:1.5px solid #bfdbfe;border-radius:10px;padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;transition:border-color .15s,box-shadow .15s,background .15s}
        .osm-export-trigger:hover:not(:disabled){border-color:#1a56db;background:#eff6ff}
        .osm-export-trigger.open{border-color:#1a56db;box-shadow:0 0 0 3px rgba(26,86,219,.12)}
        .osm-export-trigger:disabled{opacity:.6;cursor:not-allowed}
        .osm-export-panel{position:absolute;top:calc(100% + 6px);right:0;min-width:210px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.14);z-index:500;padding:6px;animation:ddSlide .15s ease}
        @keyframes ddSlide{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        .osm-export-label{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;padding:6px 10px 4px}
        .osm-export-item{display:flex;align-items:center;gap:9px;width:100%;background:none;border:none;padding:9px 10px;border-radius:8px;font-size:13px;font-weight:500;color:#1a2332;cursor:pointer;font-family:inherit;text-align:left}
        .osm-export-item:hover{background:#eff6ff}
        .osm-export-item-icon{width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .osm-export-item-icon.csv{background:#f3f0ff;color:#7c3aed}
        .osm-export-item-icon.excel{background:#f0fdf4;color:#16a34a}
        .osm-export-item-icon.print{background:#eff6ff;color:#1a56db}
        /* MODAL */
        .osm-overlay{position:fixed;inset:0;z-index:900;background:rgba(10,20,40,.5);display:flex;align-items:flex-start;justify-content:center;padding:28px 16px;overflow-y:auto}
        .osm-modal{width:100%;max-width:820px;background:#fff;border-radius:18px;box-shadow:0 12px 48px rgba(0,0,0,.22);overflow:hidden;margin:auto;animation:slideUp .22s ease;position:relative}
        @keyframes slideUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
        .osm-mhead{display:flex;align-items:center;justify-content:space-between;padding:16px 26px;background:linear-gradient(135deg,#1a56db 0%,#3b5bfc 100%)}
        .osm-mhead-left{display:flex;align-items:center;gap:10px}
        .osm-mhead-icon{width:34px;height:34px;background:rgba(255,255,255,.2);border-radius:9px;display:flex;align-items:center;justify-content:center}
        .osm-mhead-title{color:#fff;font-weight:700;font-size:16px}
        .osm-mhead-sub{color:rgba(255,255,255,.75);font-size:11.5px;margin-top:1px}
        .osm-mclose{background:rgba(255,255,255,.15);border:none;color:#fff;width:30px;height:30px;border-radius:8px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s}
        .osm-mclose:hover{background:rgba(255,255,255,.3)}
        .osm-modal-loading{position:absolute;inset:0;background:rgba(255,255,255,.85);display:flex;align-items:center;justify-content:center;z-index:10;border-radius:18px;flex-direction:column;gap:10px}
        .osm-mbody{padding:20px 26px;max-height:calc(100vh - 180px);overflow-y:auto}
        /* FORM FIELDS */
        .osm-field{margin-bottom:12px}
        .osm-field:last-child{margin-bottom:0}
        .osm-label{display:block;font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
        .osm-req{color:#dc2626}
        .osm-input,.osm-select,.osm-textarea{width:100%;padding:8px 12px;border:1px solid #d1d9e6;border-radius:8px;font-size:13px;font-family:inherit;color:#1a2332;background:#fff;outline:none;transition:border .15s,box-shadow .15s}
        .osm-input:focus,.osm-select:focus,.osm-textarea:focus{border-color:#1a56db;box-shadow:0 0 0 3px rgba(26,86,219,.1)}
        .osm-input[readonly]{background:#f8fafc;color:#475569;cursor:not-allowed}
        .osm-textarea{min-height:64px;resize:vertical}
        .osm-textarea[readonly]{background:#f8fafc;color:#374151;cursor:not-allowed;min-height:100px;line-height:1.6}
        .osm-r2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .osm-r3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
        .osm-section{background:#f8fafc;border:1px solid #e8edf4;border-radius:11px;padding:15px;margin-bottom:14px}
        .osm-section-title{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b;margin-bottom:12px;display:flex;align-items:center;gap:7px}
        .osm-section-title::after{content:'';flex:1;height:1px;background:#e2e8f0}
        /* DELIVERY INFO SECTION */
        .osm-delivinfo-section{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:11px;padding:15px;margin-bottom:14px}
        .osm-delivinfo-title{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7c3aed;margin-bottom:12px;display:flex;align-items:center;gap:7px}
        .osm-delivinfo-title::after{content:'';flex:1;height:1px;background:#ddd6fe}
        /* STATUS PREVIEW STRIP */
        .osm-preview-strip{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:10px;margin-bottom:14px;border:1.5px solid #e2e8f0;background:#f8fafc;flex-wrap:wrap}
        .osm-meter-summary{display:flex;gap:16px;flex-wrap:wrap}
        .osm-meter-item{text-align:center}
        .osm-meter-val{font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:800;line-height:1}
        .osm-meter-lbl{font-size:10px;color:#94a3b8;margin-top:2px;text-transform:uppercase;letter-spacing:.05em}
        .osm-divider{width:1px;background:#e2e8f0;align-self:stretch}
        /* DELIVERY TABLE */
        .osm-del-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        .osm-del-sec-title{font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;display:flex;align-items:center}
        .osm-add-row-btn{display:flex;align-items:center;gap:5px;border:1px solid #99f6e4;border-radius:8px;padding:5px 12px;background:#f0fdf4;color:#0f766e;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;transition:background .12s}
        .osm-add-row-btn:hover{background:#ccfbf1}
        .osm-del-wrap{border:1px solid #e2e8f0;border-radius:10px;overflow-x:auto;margin-bottom:14px}
        .osm-del-table{width:100%;border-collapse:collapse;font-size:12.5px}
        .osm-dth{padding:9px 10px;background:#f1f5f9;color:#475569;font-weight:700;text-align:left;border-bottom:1px solid #e2e8f0;white-space:nowrap;font-size:11.5px}
        .osm-dthr{padding:9px 10px;background:#f1f5f9;color:#475569;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;white-space:nowrap;font-size:11.5px}
        .osm-dtde{padding:6px 8px;background:#fff;border-bottom:1px solid #f1f5f9}
        .osm-dtdo{padding:6px 8px;background:#f0fdfa;border-bottom:1px solid #f1f5f9}
        .osm-di{width:100%;border:1px solid #d1d9e6;border-radius:5px;padding:4px 7px;font-size:12px;outline:none;color:#1a2332;background:#fff;font-family:inherit}
        .osm-dir{width:100%;border:1px solid #d1d9e6;border-radius:5px;padding:4px 7px;font-size:12px;outline:none;color:#1a2332;background:#fff;text-align:right;font-family:inherit}
        .osm-del-row-btn{background:none;border:none;color:#f87171;cursor:pointer;padding:0;display:flex;align-items:center}
        .osm-del-total-row{background:#f8fafc!important;font-weight:700}
        /* CANCEL TOGGLE */
        .osm-cancel-toggle{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff1f2;border:1.5px solid #fca5a5;border-radius:10px;cursor:pointer;user-select:none;transition:background .15s}
        .osm-cancel-toggle.on{background:#fee2e2;border-color:#f87171}
        .osm-cancel-chk{width:18px;height:18px;border-radius:4px;border:2px solid #f87171;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s}
        .osm-cancel-toggle.on .osm-cancel-chk{background:#dc2626;border-color:#dc2626}
        /* ERR BOX */
        .osm-err-box{background:#fff1f2;border:1px solid #fecaca;color:#b91c1c;padding:9px 13px;border-radius:8px;font-size:13px;margin-bottom:12px;display:flex;align-items:center;gap:7px}
        /* MODAL FOOTER */
        .osm-mfoot{display:flex;justify-content:flex-end;gap:10px;padding:14px 26px;border-top:1px solid #f1f5f9;background:#f8fafc}
        .osm-cancel-btn{padding:9px 20px;border:1px solid #d1d9e6;background:#fff;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;color:#475569;font-family:inherit;transition:background .12s;display:flex;align-items:center;gap:6px}
        .osm-cancel-btn:hover{background:#f1f5f9}
        .osm-save-btn{padding:9px 24px;border:none;background:#16a34a;color:#fff;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 2px 8px rgba(22,163,74,.3);transition:background .15s;display:flex;align-items:center;gap:6px}
        .osm-save-btn:hover:not(:disabled){background:#15803d}
        .osm-save-btn:disabled{background:#86efac;cursor:not-allowed}
        /* DELETE CONFIRM */
        .del-overlay{position:fixed;inset:0;z-index:1200;background:rgba(10,20,40,.6);display:flex;align-items:center;justify-content:center}
        .del-box{background:#fff;border-radius:16px;padding:32px 28px;max-width:400px;width:100%;margin:0 16px;text-align:center;box-shadow:0 12px 48px rgba(0,0,0,.24)}
        .del-icon{display:flex;justify-content:center;margin-bottom:12px;color:#dc2626}
        .del-title{font-size:17px;font-weight:700;color:#1a2332;margin-bottom:8px}
        .del-sub{font-size:13px;color:#64748b;margin-bottom:16px}
        .del-err{background:#fff1f2;border:1px solid #fecaca;color:#b91c1c;padding:8px 12px;border-radius:8px;font-size:12.5px;margin-bottom:16px}
        .del-actions{display:flex;gap:10px;justify-content:center}
        .del-cancel{padding:9px 22px;border:1px solid #d1d9e6;border-radius:9px;background:#fff;color:#475569;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit}
        .del-confirm{padding:9px 22px;border:none;border-radius:9px;background:#dc2626;color:#fff;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px}
        .del-confirm:disabled{background:#fca5a5;cursor:not-allowed}
        @media (max-width:640px){.osm-page-header,.osm-toolbar{padding:12px 16px}.osm-card{margin:0 16px 16px}.osm-r2,.osm-r3{grid-template-columns:1fr}}
      `}</style>

      <div className="osm-root">
        {/* ── PAGE HEADER ──────────────────────────────────────────────── */}
        <div className="osm-page-header">
          <div>
            <div className="osm-page-title">
              <FiActivity size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Order Status
            </div>
            <div className="osm-page-sub">Track delivery milestones &amp; order fulfilment progress</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="osm-export-wrap" ref={exportRef}>
              <button
                type="button"
                className={`osm-export-trigger${exportOpen ? ' open' : ''}`}
                onClick={() => setExportOpen(o => !o)}
                disabled={exporting}
              >
                {exporting
                  ? <span className="osm-spin" style={{ margin: 0, width: 14, height: 14, borderWidth: 2 }} />
                  : <FiDownload size={14} />}
                Export
                <FiChevronDown size={12} style={{ transition: 'transform .2s', transform: exportOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              {exportOpen && (
                <div className="osm-export-panel">
                  <div className="osm-export-label">Export / Print</div>
                  <button className="osm-export-item" onClick={handleExportCSV}>
                    <span className="osm-export-item-icon csv">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </span>
                    Export as CSV
                  </button>
                  <button className="osm-export-item" onClick={handleExportExcel}>
                    <span className="osm-export-item-icon excel">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
                    </span>
                    Export as Excel
                  </button>
                  <button className="osm-export-item" onClick={handlePrint}>
                    <span className="osm-export-item-icon print">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    </span>
                    Print Table
                  </button>
                </div>
              )}
            </div>
            <button className="osm-new-btn" onClick={() => openModal()}>
              <FiPlus size={14} strokeWidth={3} /> New Order Status
            </button>
          </div>
        </div>

        {/* ── TOOLBAR ────────────────────────────────────────────────────── */}
        <div className="osm-toolbar">
          <div className="osm-search-wrap">
            <FiSearch className="osm-search-icon" size={13} />
            <input
              className="osm-search"
              placeholder="Search by order code, customer, firm…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="osm-filter-sel"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as StatusType | '')}
          >
            <option value="">All Statuses</option>
            {(['Pending','In Process','Part Delivery','Completed','Cancel'] as StatusType[]).map(s =>
              <option key={s} value={s}>{s}</option>
            )}
          </select>
          <select
            className="osm-filter-sel"
            value={filterFirm}
            onChange={e => setFilterFirm(e.target.value)}
          >
            <option value="">All Firms</option>
            {uniqueFirms.map(f =>
              <option key={f} value={f}>{f}</option>
            )}
          </select>
          {/* ── NEW: Order Date range filter (start date → end date) ── */}
          <div className="osm-daterange">
            <span className="osm-daterange-label"><FiCalendar size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />Order Date</span>
            <input
              type="date"
              value={filterDateFrom}
              max={filterDateTo || undefined}
              onChange={e => setFilterDateFrom(e.target.value)}
              title="From order date"
            />
            <span className="osm-daterange-sep">to</span>
            <input
              type="date"
              value={filterDateTo}
              min={filterDateFrom || undefined}
              onChange={e => setFilterDateTo(e.target.value)}
              title="To order date"
            />
            {(filterDateFrom || filterDateTo) && (
              <button
                type="button"
                className="osm-daterange-clear"
                onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }}
              >
                Clear
              </button>
            )}
          </div>
          <span className="osm-rec-count">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
          <div className="osm-page-size">
            <span>Show</span>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>entries</span>
          </div>
        </div>

        {/* ── TABLE ──────────────────────────────────────────────────────── */}
        <div className="osm-card">
          <div className="osm-table-wrap">
            <table className="osm-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Order Code</th>
                  <th>Order Date</th>
                  <th>Customer</th>
                  <th>Firm</th>
                  <th>PO No</th>
                  <th>Construction</th>
                  <th>Expected Delivery</th>
                  <th>Delivery ETA</th>
                  <th>Total Meter</th>
                  <th>Progress</th>
                  <th>Pending</th>
                  <th>Status</th>
                  <th>Delivery Dates</th>
                   <th>Delivery Address</th>
                  <th className="tc" style={{ width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr><td colSpan={16} className="osm-empty"><span className="osm-spin" />Loading…</td></tr>
                ) : tableError ? (
                  <tr>
                    <td colSpan={16} style={{ textAlign: 'center', padding: '32px 16px', color: '#b91c1c', background: '#fff1f2' }}>
                      <FiAlertTriangle size={14} style={{ marginRight: 6 }} />{tableError}
                      <div style={{ marginTop: 8 }}>
                        <button style={{ color: '#1a56db', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={loadRecords}>
                          <FiRefreshCw size={12} /> Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr><td colSpan={16} className="osm-empty">{search || filterStatus || filterFirm || filterDateFrom || filterDateTo ? 'No records match your filter.' : 'No order statuses yet. Click "New Order Status" to create one.'}</td></tr>
                ) : paginated.map((r, i) => {
                  const total     = Number(r.total_meter || 0);
                  const delivered = Number(r.delivered_meter || 0);
                  const pct       = total > 0 ? Math.min(100, (delivered / total) * 100) : 0;
                  const sc        = STATUS_COLORS[r.status as StatusType] || STATUS_COLORS['Pending'];
                  const fillColor = r.status === 'Completed' ? '#16a34a' : r.status === 'Cancel' ? '#dc2626' : r.status === 'Part Delivery' ? '#ea580c' : '#1a56db';
                  const delCount  = r.delivery_count ?? (r.delivery_dates ? r.delivery_dates.length : 0);
                  const addrLines = r.combined_delivery_address ? r.combined_delivery_address.split('\n') : [];
                  return (
                    <tr key={r.id}>
                      <td><span className="osm-serial">{(currentPage - 1) * pageSize + i + 1}</span></td>
                      
                      <td><span className="osm-code">{r.order_code}</span></td>
                        {/* ── NEW: Order Date ── */}
                      <td>
                        {r.order_date
                          ? <span className="osm-order-date"><FiCalendar size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />{fmtDate(r.order_date)}</span>
                          : <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      <td style={{ fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customer_name || '—'}</td>
                      
                      <td>
                        {r.firm_name
                          ? <span className="osm-firm-badge">{r.firm_name}</span>
                          : <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      <td style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12 }}>{r.po_no || '—'}</td>
                    
                      {/* ── NEW: Construction / Quality (full description), sourced from linked order ── */}
                      <td style={{ whiteSpace: 'normal' }}>
                        {r.quality
                          ? <span className="osm-quality-cell" title={r.quality}>{r.quality}</span>
                          : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                      </td>
                      {/* ── Expected Delivery Date ── */}
                      <td>
                        {r.expect_delivery
                          ? <span className="osm-exp-date"><FiCalendar size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />{fmtDate(r.expect_delivery)}</span>
                          : <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      {/* ── NEW: Countdown (Order Date → Expected Completion) ── */}
                      <td>{renderCountdownBadge(r)}</td>
                     
                      <td style={{ fontFamily: 'JetBrains Mono,monospace', fontWeight: 700 }}>{fmt2(total)} m</td>
                      <td>
                        <div className="osm-progress-wrap">
                          <div className="osm-progress-bg">
                            <div className="osm-progress-fill" style={{ width: `${pct}%`, background: fillColor }} />
                          </div>
                          <div className="osm-progress-label">{fmt2(delivered)} / {fmt2(total)} m ({pct.toFixed(0)}%)</div>
                        </div>
                      </td>
                      <td>
                        {delivered > total ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: '#fff1f2', color: '#dc2626', border: '1px solid #fca5a5',
                            borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                          }} title={`Delivered ${fmt2(delivered)} m against an order total of ${fmt2(total)} m`}>
                            ⚠ +{fmt2(delivered - total)}m over
                          </span>
                        ) : (
                          <span style={{ fontFamily: 'JetBrains Mono,monospace', color: '#c2410c', fontWeight: 700 }}>{fmt2(Math.max(0, total - delivered))} m</span>
                        )}
                      </td>
                      {/* ── Status + delay badge ── */}
                      <td>
                        <div className="osm-status-cell">
                          <span className="osm-status-badge" style={{ background: sc.bg, color: sc.color, borderColor: sc.border }}>
                            {r.status === 'Completed' && <FiCheck size={11} />}
                            {r.status === 'Cancel'    && <FiXCircle size={11} />}
                            {r.status === 'Part Delivery' && <FiTruck size={11} />}
                            {r.status}
                          </span>
                          {renderDelayBadge(r)}
                        </div>
                      </td>
                      {/* ── Delivery Dates: compact — latest date + term-count badge, full
                           chronological history available via hover tooltip. Keeps every
                           row a uniform height instead of growing with delivery count. ── */}
                      <td>
                        {r.delivery_dates && r.delivery_dates.length > 0 ? (
                          <div
                            className="osm-deldates"
                            title={r.delivery_dates.map((dt, di) => `${di + 1}. ${fmtDate(dt)}`).join('\n')}
                          >
                            <span className="osm-deldates-latest">
                              <FiCalendar size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                              {fmtDate(r.delivery_dates[r.delivery_dates.length - 1])}
                            </span>
                            {delCount > 1 && (
                              <span className="osm-deldates-badge">{delCount} terms</span>
                            )}
                          </div>
                        ) : r.last_delivery_date ? (
                          // Fallback: dates array wasn't populated but we do have a last
                          // delivery date on record — show it instead of a bare count,
                          // so the table matches what the export already displays.
                          <div className="osm-deldates">
                            <span className="osm-deldates-latest">
                              <FiCalendar size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                              {fmtDate(r.last_delivery_date)}
                            </span>
                            {delCount > 1 && (
                              <span className="osm-deldates-badge">{delCount} terms</span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>
                            {delCount > 0 ? `${delCount} term${delCount !== 1 ? 's' : ''}` : '—'}
                          </span>
                        )}
                      </td>
                       {/* ── NEW: Delivery Address (truncated, full text on hover) ── */}
                      <td style={{ whiteSpace: 'normal' }}>
                        {addrLines.length > 0 ? (
                          <div className="osm-addr-cell" title={addrLines.join(', ')}>
                            <FiMapPin size={10} style={{ marginRight: 4, verticalAlign: 'middle', color: '#94a3b8', flexShrink: 0 }} />
                            {addrLines[0]}
                            {addrLines.length > 1 && (
                              <span style={{ color: '#94a3b8', fontSize: 10.5 }}> +{addrLines.length - 1} more</span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div className="osm-acts">
                          <button className="osm-edit-btn" onClick={() => openModal(r)}><FiEdit2 size={12} /> Edit</button>
                          <button className="osm-del-btn"  onClick={() => { setDeleteTarget(r); setDeleteError(''); }}><FiTrash2 size={12} /> Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!tableLoading && !tableError && filtered.length > 0 && (
            <div className="osm-pag">
              <span>Showing {Math.min((currentPage - 1) * pageSize + 1, filtered.length)}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} records</span>
              <div className="osm-pag-btns">
                <button className="osm-pag-btn" onClick={() => goTo(1)} disabled={currentPage === 1}><FiChevronsLeft size={13} /></button>
                <button className="osm-pag-btn" onClick={() => goTo(currentPage - 1)} disabled={currentPage === 1}><FiChevronLeft size={12} /> Prev</button>
                {pageNums.map(p => <button key={p} className={`osm-pag-btn${p === currentPage ? ' active' : ''}`} onClick={() => goTo(p)}>{p}</button>)}
                <button className="osm-pag-btn" onClick={() => goTo(currentPage + 1)} disabled={currentPage === totalPages}>Next <FiChevronRight size={12} /></button>
                <button className="osm-pag-btn" onClick={() => goTo(totalPages)} disabled={currentPage === totalPages}><FiChevronsRight size={13} /></button>
              </div>
            </div>
          )}
        </div>

        {/* ══ MODAL ══════════════════════════════════════════════════════════ */}
        {showModal && (
          <div className="osm-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
            <div className="osm-modal">
              {modalLoading && (
                <div className="osm-modal-loading">
                  <span className="osm-spin" style={{ width: 28, height: 28, borderWidth: 3 }} />
                  <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Loading…</span>
                </div>
              )}
              <div className="osm-mhead">
                <div className="osm-mhead-left">
                  <div className="osm-mhead-icon"><FiActivity size={18} color="#fff" /></div>
                  <div>
                    <div className="osm-mhead-title">{editId ? 'Edit Order Status' : 'New Order Status'}</div>
                    <div className="osm-mhead-sub">Set delivery schedule · Status auto-calculated from meters</div>
                  </div>
                </div>
                <button className="osm-mclose" onClick={closeModal}><FiX size={16} /></button>
              </div>

              <form onSubmit={handleSave}>
                <div className="osm-mbody">

                  {/* ── Order picker ────────────────────────────────── */}
                  <div className="osm-section">
                    <div className="osm-section-title"><FiPackage size={12} /> Link to Customer Order</div>
                    <div className="osm-r2">
                      <div className="osm-field">
                        <label className="osm-label">Search Orders</label>
                        <input
                          className="osm-input"
                          placeholder="Search order code, customer or firm…"
                          value={orderSearch}
                          onChange={e => setOrderSearch(e.target.value)}
                        />
                      </div>
                      <div className="osm-field">
                        <label className="osm-label">
                          Select Order
                          {ordersLoading && <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>Loading…</span>}
                        </label>
                        <select
                          className="osm-select"
                          value={form.order_booking_id ? Number(form.order_booking_id) : ''}
                          onChange={handleOrderSelect}
                          disabled={ordersLoading}
                        >
                          <option value="">— Choose an order —</option>
                          {filteredOrderRefs.map(o => (
                            <option key={o.id} value={o.id}>
                              [{o.order_code}] {o.customer_name}{getOrderFirm(o) ? ` · ${getOrderFirm(o)}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {form.order_code && (
                      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <FiCheck size={12} />
                        <strong>{form.order_code}</strong>
                        {form.customer_name && <> · {form.customer_name}</>}
                        {form.firm_name && (
                          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: 20, padding: '2px 10px', fontWeight: 700, fontSize: 11.5 }}>
                            <FiBriefcase size={11} /> {form.firm_name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── NEW: Delivery Info (auto-filled from order) — TABLE format ── */}
                  {(form.combined_delivery_address || form.expect_delivery || form.order_date || form.quality) && (() => {
                    const diff      = form.expect_delivery ? calcDaysVariance(today(), form.expect_delivery) : null;
                    const daysLeft  = diff === null ? null : -diff; // positive = days remaining
                    return (
                      <div className="osm-delivinfo-section">
                        <div className="osm-delivinfo-title"><FiMapPin size={12} /> Delivery &amp; Schedule Info</div>
                        <div className="osm-del-wrap" style={{ marginBottom: 0 }}>
                          <table className="osm-del-table">
                            <tbody>
                              <tr>
                                <th className="osm-dth" style={{ width: 170, verticalAlign: 'top' }}>
                                  Order Date <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none' }}>(from order)</span>
                                </th>
                                <td className="osm-dtde" style={{ fontFamily: 'JetBrains Mono,monospace', fontWeight: 700, fontSize: 13, color: '#1a2332' }}>
                                  {form.order_date
                                    ? fmtDate(form.order_date)
                                    : <span style={{ color: '#94a3b8', fontWeight: 400, fontFamily: 'inherit', fontSize: 13 }}>Not specified on this order</span>}
                                </td>
                              </tr>
                              <tr>
                                <th className="osm-dth" style={{ width: 170, verticalAlign: 'top' }}>
                                  Construction <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none' }}>(quality, from order)</span>
                                </th>
                                <td className="osm-dtde" style={{ fontSize: 13, color: '#1a2332', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
                                  {form.quality && form.quality.trim()
                                    ? form.quality
                                    : <span style={{ color: '#94a3b8' }}>Not specified on this order</span>}
                                </td>
                              </tr>
                              <tr>
                                <th className="osm-dth" style={{ verticalAlign: 'top' }}>
                                  Expected Completion Date <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none' }}>(from order)</span>
                                </th>
                                <td className="osm-dtde" style={{ fontFamily: 'JetBrains Mono,monospace', fontWeight: 800, fontSize: 14, color: '#7c3aed' }}>
                                  {form.expect_delivery
                                    ? fmtDate(form.expect_delivery)
                                    : <span style={{ color: '#94a3b8', fontWeight: 400, fontFamily: 'inherit', fontSize: 13 }}>Not specified on this order</span>}
                                </td>
                              </tr>
                              <tr>
                                <th className="osm-dth" style={{ width: 170, verticalAlign: 'top' }}>
                                  Delivery Address <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none' }}>(from order)</span>
                                </th>
                                <td className="osm-dtde" style={{ whiteSpace: 'pre-line', lineHeight: 1.6, color: '#374151' }}>
                                  {form.combined_delivery_address
                                    ? form.combined_delivery_address
                                    : <span style={{ color: '#94a3b8' }}>No delivery address on this order</span>}
                                </td>
                              </tr>
                              {form.expect_delivery && daysLeft !== null && (
                                <tr>
                                  <th className="osm-dth" style={{ verticalAlign: 'top' }}>Countdown</th>
                                  <td className="osm-dtde">
                                    {daysLeft > 0 ? (
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                        background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac',
                                        borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700,
                                      }}>
                                        {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining until expected delivery
                                      </span>
                                    ) : daysLeft === 0 ? (
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                        background: '#fefce8', color: '#a16207', border: '1px solid #fde047',
                                        borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700,
                                      }}>
                                        ⚡ Expected delivery is today
                                      </span>
                                    ) : (
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                        background: '#fff1f2', color: '#dc2626', border: '1px solid #fca5a5',
                                        borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700,
                                      }}>
                                        −{Math.abs(daysLeft)} day{Math.abs(daysLeft) !== 1 ? 's' : ''} past expected date
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Order Code + Firm + Total Meter ─────────────── */}
                  <div className="osm-section">
                    <div className="osm-section-title"><FiCalendar size={12} /> Order Details</div>
                    <div className="osm-r2">
                      <div className="osm-field">
                        <label className="osm-label">Order Code <span className="osm-req">*</span></label>
                        <input
                          className="osm-input"
                          value={form.order_code}
                          onChange={e => setForm(p => ({ ...p, order_code: e.target.value }))}
                          placeholder="e.g. ORD-2025-001"
                          required
                        />
                      </div>
                      <div className="osm-field">
                        <label className="osm-label">
                          Firm <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none' }}>(auto-filled from order)</span>
                        </label>
                        <input
                          className="osm-input"
                          value={form.firm_name || ''}
                          onChange={e => setForm(p => ({ ...p, firm_name: e.target.value }))}
                          placeholder="Select an order above to auto-fill, or type manually"
                        />
                      </div>
                    </div>
                    <div className="osm-r2">
                      <div className="osm-field">
                        <label className="osm-label">Total Order Meter <span className="osm-req">*</span></label>
                        <input
                          className="osm-input"
                          type="number"
                          min={1}
                          step="0.001"
                          value={form.total_meter || ''}
                          onChange={e => setForm(p => ({ ...p, total_meter: parseFloat(e.target.value) || 0 }))}
                          placeholder="e.g. 1500"
                          required
                        />
                      </div>
                      <div className="osm-field">
                        <label className="osm-label">Customer</label>
                        <input
                          className="osm-input"
                          value={form.customer_name || ''}
                          readOnly
                          placeholder="Auto-filled from order"
                        />
                      </div>
                    </div>
                    <div className="osm-field">
                      <label className="osm-label">Remarks</label>
                      <textarea
                        className="osm-textarea"
                        value={form.remarks || ''}
                        onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))}
                        placeholder="Any notes about this order status…"
                      />
                    </div>
                  </div>

                  {/* ── Status preview ───────────────────────────────── */}
                  {form.total_meter > 0 && (() => {
                    const sc  = STATUS_COLORS[previewStatus];
                    const pct = Math.min(100, form.total_meter > 0 ? (deliveredTotal / form.total_meter) * 100 : 0);
                    return (
                      <div className="osm-preview-strip">
                        <div className="osm-meter-summary">
                          <div className="osm-meter-item">
                            <div className="osm-meter-val" style={{ color: '#1a2332' }}>{fmt2(form.total_meter)}</div>
                            <div className="osm-meter-lbl">Total (m)</div>
                          </div>
                          <div className="osm-divider" />
                          <div className="osm-meter-item">
                            <div className="osm-meter-val" style={{ color: '#16a34a' }}>{fmt2(deliveredTotal)}</div>
                            <div className="osm-meter-lbl">Delivered</div>
                          </div>
                          <div className="osm-divider" />
                          <div className="osm-meter-item">
                            <div className="osm-meter-val" style={{ color: '#c2410c' }}>{fmt2(pendingTotal)}</div>
                            <div className="osm-meter-lbl">Pending</div>
                          </div>
                          <div className="osm-divider" />
                          <div className="osm-meter-item">
                            <div className="osm-meter-val" style={{ color: '#64748b' }}>{pct.toFixed(0)}%</div>
                            <div className="osm-meter-lbl">Done</div>
                          </div>
                          {excessTotal > 0 && (
                            <>
                              <div className="osm-divider" />
                              <div className="osm-meter-item">
                                <div className="osm-meter-val" style={{ color: '#dc2626' }}>+{fmt2(excessTotal)}</div>
                                <div className="osm-meter-lbl">Extra</div>
                              </div>
                            </>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 120 }}>
                          <div style={{ height: 8, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden', marginBottom: 4 }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: previewStatus === 'Completed' ? '#16a34a' : previewStatus === 'Cancel' ? '#dc2626' : '#1a56db', borderRadius: 99, transition: 'width .3s' }} />
                          </div>
                        </div>
                        <span className="osm-status-badge" style={{ background: sc.bg, color: sc.color, borderColor: sc.border, fontSize: 12, padding: '4px 12px' }}>
                          Auto Status: <strong style={{ marginLeft: 4 }}>{previewStatus}</strong>
                        </span>
                        {excessTotal > 0 && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            background: '#fff1f2', color: '#dc2626', border: '1px solid #fca5a5',
                            borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                          }}>
                            <FiAlertTriangle size={12} /> {fmt2(excessTotal)} m delivered over order total
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── Delivery schedule ────────────────────────────── */}
                  <div className="osm-del-hdr">
                    <span className="osm-del-sec-title">
                      <FiTruck size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                      Delivery Schedule
                    </span>
                    <button type="button" className="osm-add-row-btn" onClick={addLine}>
                      <FiPlus size={12} /> Add Delivery
                    </button>
                  </div>
                  <div className="osm-del-wrap">
                    <table className="osm-del-table">
                      <thead>
                        <tr>
                          <th className="osm-dth" style={{ width: 32 }}>#</th>
                          <th className="osm-dth" style={{ minWidth: 150 }}>Delivery Date <span style={{ color: '#dc2626' }}>*</span></th>
                          <th className="osm-dthr" style={{ width: 130 }}>Delivered Meter</th>
                          <th className="osm-dth">Notes</th>
                          <th className="osm-dth" style={{ width: 32 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(form.deliveries || []).length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 12.5 }}>
                              No delivery lines. Click "Add Delivery" to split the order.
                            </td>
                          </tr>
                        ) : (form.deliveries || []).map((d, idx) => {
                          const td = idx % 2 === 0 ? 'osm-dtde' : 'osm-dtdo';
                          return (
                            <tr key={idx}>
                              <td className={td} style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>{idx + 1}</td>
                              <td className={td}>
                                <input
                                  className="osm-di"
                                  type="date"
                                  value={d.delivery_date}
                                  onChange={e => updateLine(idx, { delivery_date: e.target.value })}
                                  required
                                />
                              </td>
                              <td className={td}>
                                <input
                                  className="osm-dir"
                                  type="number"
                                  min={0}
                                  step="0.001"
                                  placeholder="0.000"
                                  value={d.delivered_meter || ''}
                                  onChange={e => updateLine(idx, { delivered_meter: parseFloat(e.target.value) || 0 })}
                                />
                              </td>
                              <td className={td}>
                                <input
                                  className="osm-di"
                                  type="text"
                                  placeholder="Optional note…"
                                  value={d.notes || ''}
                                  onChange={e => updateLine(idx, { notes: e.target.value })}
                                />
                              </td>
                              <td className={td} style={{ textAlign: 'center' }}>
                                <button type="button" className="osm-del-row-btn" onClick={() => removeLine(idx)}>
                                  <FiX size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {(form.deliveries || []).length > 0 && (
                          <tr className="osm-del-total-row">
                            <td colSpan={2} style={{ padding: '8px 10px', fontSize: 12, color: '#475569', fontWeight: 700, background: '#f8fafc' }}>
                              Total Delivered
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono,monospace', fontWeight: 800, fontSize: 13, color: excessTotal > 0 ? '#dc2626' : '#0f766e', background: '#f8fafc' }}>
                              {fmt2(deliveredTotal)} m
                            </td>
                            <td colSpan={2} style={{ background: '#f8fafc' }}>
                              {excessTotal > 0 && (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  background: '#fff1f2', color: '#dc2626', border: '1px solid #fca5a5',
                                  borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                                }}>
                                  ⚠ +{fmt2(excessTotal)} m over order total ({fmt2(form.total_meter || 0)} m)
                                </span>
                              )}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* ── Delivery Timeline Analysis ─────────────── */}
                  {(form.deliveries || []).length > 0 && renderTimelineTable()}

                  {/* ── Cancel toggle ────────────────────────────────── */}
                  <div
                    className={`osm-cancel-toggle${form.is_cancelled ? ' on' : ''}`}
                    onClick={() => setForm(p => ({ ...p, is_cancelled: p.is_cancelled ? 0 : 1 }))}
                    style={{ marginBottom: 14 }}
                  >
                    <div className="osm-cancel-chk">
                      {form.is_cancelled ? <FiX size={12} color="#fff" /> : null}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: form.is_cancelled ? '#be123c' : '#64748b' }}>
                        Mark as Cancelled
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                        Status will be forced to "Cancel" regardless of delivered meters
                      </div>
                    </div>
                    {form.is_cancelled ? (
                      <span style={{ marginLeft: 'auto', background: '#fee2e2', color: '#be123c', border: '1px solid #fca5a5', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                        Cancelled
                      </span>
                    ) : null}
                  </div>

                  {formError && (
                    <div className="osm-err-box"><FiAlertTriangle size={14} /> {formError}</div>
                  )}
                </div>

                <div className="osm-mfoot">
                  <button type="button" className="osm-cancel-btn" onClick={closeModal}><FiX size={13} /> Cancel</button>
                  <button type="submit" className="osm-save-btn" disabled={saving || modalLoading}>
                    {saving
                      ? <><span className="osm-spin" />Saving…</>
                      : editId
                      ? <><FiEdit2 size={13} /> Update Status</>
                      : <><BiSave size={15} /> Save Status</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ══ DELETE CONFIRM ══════════════════════════════════════════════════ */}
        {deleteTarget && (
          <div className="del-overlay">
            <div className="del-box">
              <div className="del-icon"><FiTrash2 size={38} /></div>
              <p className="del-title">Delete Order Status?</p>
              <p className="del-sub">
                This will permanently delete the status record for <strong>{deleteTarget.order_code}</strong> and all its delivery lines.
              </p>
              {deleteError && <div className="del-err"><FiAlertTriangle size={13} style={{ marginRight: 4 }} />{deleteError}</div>}
              <div className="del-actions">
                <button className="del-cancel" onClick={() => { setDeleteTarget(null); setDeleteError(''); }}>Cancel</button>
                <button className="del-confirm" disabled={deleting} onClick={confirmDelete}>
                  {deleting
                    ? <><span className="osm-spin" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,.3)' }} />Deleting…</>
                    : <><FiTrash2 size={13} /> Yes, Delete</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}