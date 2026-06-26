// OrderStatusMaster.tsx
// Order Status tracking page — matches the CustomerOrder (UnifiedOrderManagement) UI style.
//
// FEATURES:
//   • List all order statuses with search, pagination, page-size selector
//   • Status badge auto-colours: Pending/In Process/Part Delivery/Completed/Cancel
//   • Meter progress bar (delivered vs total)
//   • Create / Edit modal with:
//       – Order Code picker (loads from existing order_bookings)
//       – Total meter input
//       – Delivery schedule: split deliveries with date + meter + notes
//       – Cancel toggle
//       – Remarks
//       – Auto status calculation (client-side preview)
//   • Delete confirmation modal
//   • Export: CSV, Excel (.xls), Print — same dropdown pattern as CustomerOrder

import React, {
  useEffect, useState, useMemo, useCallback, useRef,
} from 'react';
import {
  FiSearch, FiX, FiChevronDown, FiCheck, FiPlus, FiEdit2, FiTrash2,
  FiAlertTriangle, FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight,
  FiRefreshCw, FiDownload, FiTruck, FiActivity, FiCalendar, FiPackage,
  FiXCircle,
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
  id?:              number;
  order_booking_id?: number | string;
  order_code:       string;
  customer_id?:     number | string;
  customer_name?:   string;
  order_date?:      string;
  po_no?:           string;
  transport?:       string;
  agent_name?:      string;
  total_meter:      number;
  delivered_meter?: number;
  pending_meter?:   number;
  status?:          StatusType;
  is_cancelled?:    0 | 1;
  remarks?:         string;
  deliveries?:      DeliveryLine[];
}

interface CustomerOrderRef {
  id: number;
  order_code: string;
  customer_name: string;
  order_date?: string;
  sort_no?: string;
  basic_value?: number;
  net_value?: number;
  items?: Array<{ meter: number }> | string;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const str = (v: unknown): string => (v == null ? '' : String(v));

const fmtDate = (v?: string | null): string => {
  if (!v) return '—';
  const s = v.includes('T') ? v.slice(0, 10) : v;
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
};

const toISODate = (v: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const today = (): string => new Date().toISOString().slice(0, 10);

const fmt2 = (n: number): string =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Calculates status from totals — mirrors backend logic
function calcStatus(total: number, delivered: number, cancelled: boolean): StatusType {
  if (cancelled) return 'Cancel';
  if (total <= 0) return 'Pending';
  if (delivered >= total) return 'Completed';
  if (delivered > 0) return 'Part Delivery';
  return 'Pending';
}

// Get total meters from a CustomerOrderRef's items
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
      try {
        const errBody = await res.clone().json();
        console.error(`[safeFetch] ${res.status} error from ${url}:`, errBody);
      } catch {
        const text = await res.clone().text();
        console.error(`[safeFetch] ${res.status} error from ${url} (non-JSON body):`, text);
      }
      return null;
    }
    return res;
  } catch (e) { console.error('[safeFetch]', e); return null; }
};

// ─── EMPTY HELPERS ────────────────────────────────────────────────────────────
const emptyForm = (): OrderStatusRecord => ({
  order_code: '', total_meter: 0, is_cancelled: 0, remarks: '', deliveries: [],
});

const emptyLine = (): DeliveryLine => ({ delivery_date: today(), delivered_meter: 0, notes: '' });

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function OrderStatusMaster({ user }: Props) {

  // ── Master list ────────────────────────────────────────────────────────────
  const [records,      setRecords]      = useState<OrderStatusRecord[]>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [tableError,   setTableError]   = useState('');
  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState<StatusType | ''>('');
  const [pageSize,     setPageSize]     = useState(10);
  const [currentPage,  setCurrentPage]  = useState(1);

  // ── Order refs (to pick from existing orders) ──────────────────────────────
  const [orderRefs,    setOrderRefs]    = useState<CustomerOrderRef[]>([]);
  const [orderSearch,  setOrderSearch]  = useState('');
  const [ordersLoading,setOrdersLoading]= useState(false);

  // ── Modal ─────────────────────────────────────────────────────────────────
  const [showModal,    setShowModal]    = useState(false);
  const [editId,       setEditId]       = useState<number | null>(null);
  const [form,         setForm]         = useState<OrderStatusRecord>(emptyForm());
  const [saving,       setSaving]       = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [formError,    setFormError]    = useState('');

  // ── Delete ────────────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<OrderStatusRecord | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [deleteError,  setDeleteError]  = useState('');

  // ── Export ────────────────────────────────────────────────────────────────
  const [exportOpen,   setExportOpen]   = useState(false);
  const [exporting,    setExporting]    = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // ── Close export on outside click ─────────────────────────────────────────
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
  const pendingTotal   = Math.max(0, (form.total_meter || 0) - deliveredTotal);
  const previewStatus  = calcStatus(form.total_meter || 0, deliveredTotal, form.is_cancelled === 1);

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
      setRecords(Array.isArray(data.data || data) ? (data.data || data) : []);
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
  useEffect(() => { setCurrentPage(1); }, [search, filterStatus]);

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
    if (!id) { setForm(prev => ({ ...prev, order_booking_id: '', order_code: '', customer_name: '', total_meter: 0, deliveries: [] })); return; }
    const ref = orderRefs.find(o => o.id === id);
    if (!ref) return;
    const meters = extractTotalMeter(ref);
    setForm(prev => ({
      ...prev,
      order_booking_id: ref.id,
      order_code:       ref.order_code,
      customer_name:    ref.customer_name,
      total_meter:      meters || prev.total_meter,
      deliveries:       prev.deliveries && prev.deliveries.length > 0 ? prev.deliveries : [emptyLine()],
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
      total_meter:      Number(form.total_meter),
      is_cancelled:     form.is_cancelled ? 1 : 0,
      remarks:          form.remarks || null,
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
    return Array.isArray(data.data || data) ? (data.data || data) : [];
  };

  const buildRows = (data: OrderStatusRecord[]) =>
    data.map((r, i) => ({
      '#':                i + 1,
      'Order Code':       r.order_code,
      'Customer':         r.customer_name || '',
      'PO No':            r.po_no || '',
      'Total Meter':      Number(r.total_meter || 0).toFixed(2),
      'Delivered Meter':  Number(r.delivered_meter || 0).toFixed(2),
      'Pending Meter':    Number(r.pending_meter || 0).toFixed(2),
      'Status':           r.status || '',
      'Transport':        r.transport || '',
      'Remarks':          r.remarks || '',
    }));

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
    const win = window.open('', '_blank', 'width=1100,height=700');
    if (!win) { setExporting(false); return; }
    win.document.write(`<html><head><title>Order Status</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#1a2332}h2{margin:0 0 4px;font-size:18px}p{margin:0 0 16px;color:#64748b;font-size:12px}table{width:100%;border-collapse:collapse;font-size:11.5px}th,td{border:1px solid #cbd5e1;padding:6px 10px;text-align:left}th{background:#1a56db;color:#fff}tr:nth-child(even) td{background:#eff6ff}</style></head><body><h2>Order Status Report</h2><p>${rows.length} records · ${new Date().toLocaleString('en-IN')}</p><table><thead><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${h.map(k=>`<td>${(r as any)[k]??''}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=function(){window.print();}<\/script></body></html>`);
    win.document.close(); setExporting(false);
  };

  // ─── Pagination ──────────────────────────────────────────────────────────
  const filtered   = records.filter(r =>
    [r.order_code, r.customer_name, r.po_no, r.status, r.transport].some(v =>
      (v || '').toLowerCase().includes(search.toLowerCase())
    ) && (!filterStatus || r.status === filterStatus)
  );
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
    (o.customer_name || '').toLowerCase().includes(orderSearch.toLowerCase())
  );

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
        /* CARD / TABLE */
        .osm-card{margin:0 28px 28px;background:#fff;border-radius:14px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,.07);overflow:hidden}
        .osm-table-wrap{overflow-x:auto;scrollbar-width:thin;scrollbar-color:#c7d3e8 transparent}
        .osm-table{width:100%;border-collapse:collapse;font-size:13px;min-width:900px}
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
        .osm-serial{color:#94a3b8;font-size:12px}
        .osm-acts{display:flex;align-items:center;gap:6px;justify-content:center}
        .osm-edit-btn{display:inline-flex;align-items:center;gap:5px;background:#eff6ff;color:#1a56db;border:1px solid #bfdbfe;padding:5px 11px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;transition:background .12s;font-family:inherit;white-space:nowrap}
        .osm-edit-btn:hover{background:#dbeafe;border-color:#93c5fd}
        .osm-del-btn{display:inline-flex;align-items:center;gap:5px;background:#fff1f2;color:#dc2626;border:1px solid #fca5a5;padding:5px 11px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;transition:background .12s;font-family:inherit;white-space:nowrap}
        .osm-del-btn:hover{background:#fee2e2;border-color:#f87171}
        .osm-empty{text-align:center;padding:52px 16px;color:#94a3b8;font-size:13px}
        .osm-table-err{text-align:center;padding:32px 16px;font-size:13px;color:#b91c1c;background:#fff1f2}
        /* STATUS BADGE */
        .osm-status-badge{display:inline-flex;align-items:center;gap:5px;border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:700;white-space:nowrap;border-width:1px;border-style:solid}
        /* PROGRESS BAR */
        .osm-progress-wrap{min-width:120px}
        .osm-progress-bg{height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden;margin-bottom:3px}
        .osm-progress-fill{height:100%;border-radius:99px;transition:width .3s}
        .osm-progress-label{font-size:10.5px;color:#64748b;white-space:nowrap}
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
        .osm-modal{width:100%;max-width:780px;background:#fff;border-radius:18px;box-shadow:0 12px 48px rgba(0,0,0,.22);overflow:hidden;margin:auto;animation:slideUp .22s ease;position:relative}
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
        .osm-textarea{min-height:64px;resize:vertical}
        .osm-r2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .osm-r3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
        .osm-section{background:#f8fafc;border:1px solid #e8edf4;border-radius:11px;padding:15px;margin-bottom:14px}
        .osm-section-title{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b;margin-bottom:12px;display:flex;align-items:center;gap:7px}
        .osm-section-title::after{content:'';flex:1;height:1px;background:#e2e8f0}
        /* STATUS PREVIEW STRIP */
        .osm-preview-strip{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:10px;margin-bottom:14px;border:1.5px solid #e2e8f0;background:#f8fafc;flex-wrap:wrap}
        .osm-meter-summary{display:flex;gap:16px;flex-wrap:wrap}
        .osm-meter-item{text-align:center}
        .osm-meter-val{font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:800;line-height:1}
        .osm-meter-lbl{font-size:10px;color:#94a3b8;margin-top:2px;text-transform:uppercase;letter-spacing:.05em}
        .osm-divider{width:1px;background:#e2e8f0;align-self:stretch}
        /* DELIVERY TABLE */
        .osm-del-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        .osm-del-sec-title{font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em}
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
            {/* Export dropdown */}
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
              placeholder="Search by order code, customer…"
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
                  <th>Customer</th>
                  <th>PO No</th>
                  <th>Total Meter</th>
                  <th>Progress</th>
                  <th>Pending</th>
                  <th>Status</th>
                  <th>Deliveries</th>
                  <th className="tc" style={{ width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr><td colSpan={10} className="osm-empty"><span className="osm-spin" />Loading…</td></tr>
                ) : tableError ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '32px 16px', color: '#b91c1c', background: '#fff1f2' }}>
                      <FiAlertTriangle size={14} style={{ marginRight: 6 }} />{tableError}
                      <div style={{ marginTop: 8 }}>
                        <button style={{ color: '#1a56db', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={loadRecords}>
                          <FiRefreshCw size={12} /> Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr><td colSpan={10} className="osm-empty">{search || filterStatus ? 'No records match your filter.' : 'No order statuses yet. Click "New Order Status" to create one.'}</td></tr>
                ) : paginated.map((r, i) => {
                  const total     = Number(r.total_meter || 0);
                  const delivered = Number(r.delivered_meter || 0);
                  const pct       = total > 0 ? Math.min(100, (delivered / total) * 100) : 0;
                  const sc        = STATUS_COLORS[r.status as StatusType] || STATUS_COLORS['Pending'];
                  const fillColor = r.status === 'Completed' ? '#16a34a' : r.status === 'Cancel' ? '#dc2626' : r.status === 'Part Delivery' ? '#ea580c' : '#1a56db';
                  return (
                    <tr key={r.id}>
                      <td><span className="osm-serial">{(currentPage - 1) * pageSize + i + 1}</span></td>
                      <td><span className="osm-code">{r.order_code}</span></td>
                      <td style={{ fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customer_name || '—'}</td>
                      <td style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12 }}>{r.po_no || '—'}</td>
                      <td style={{ fontFamily: 'JetBrains Mono,monospace', fontWeight: 700 }}>{fmt2(total)} m</td>
                      <td>
                        <div className="osm-progress-wrap">
                          <div className="osm-progress-bg">
                            <div className="osm-progress-fill" style={{ width: `${pct}%`, background: fillColor }} />
                          </div>
                          <div className="osm-progress-label">{fmt2(delivered)} / {fmt2(total)} m ({pct.toFixed(0)}%)</div>
                        </div>
                      </td>
                      <td style={{ fontFamily: 'JetBrains Mono,monospace', color: '#c2410c', fontWeight: 700 }}>{fmt2(Math.max(0, total - delivered))} m</td>
                      <td>
                        <span className="osm-status-badge" style={{ background: sc.bg, color: sc.color, borderColor: sc.border }}>
                          {r.status === 'Completed' && <FiCheck size={11} />}
                          {r.status === 'Cancel'    && <FiXCircle size={11} />}
                          {r.status === 'Part Delivery' && <FiTruck size={11} />}
                          {r.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{(r as any).delivery_count ?? 0} term{((r as any).delivery_count ?? 0) !== 1 ? 's' : ''}</td>
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
                          placeholder="Search order code or customer…"
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
                              [{o.order_code}] {o.customer_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {form.order_code && (
                      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FiCheck size={12} />
                        <strong>{form.order_code}</strong>
                        {form.customer_name && <> · {form.customer_name}</>}
                      </div>
                    )}
                  </div>

                  {/* ── Order Code (manual) + Total Meter ───────────── */}
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
                    const sc = STATUS_COLORS[previewStatus];
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
                        </div>
                        <div style={{ flex: 1, minWidth: 120 }}>
                          <div style={{ height: 8, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden', marginBottom: 4 }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: previewStatus === 'Completed' ? '#16a34a' : previewStatus === 'Cancel' ? '#dc2626' : '#1a56db', borderRadius: 99, transition: 'width .3s' }} />
                          </div>
                        </div>
                        <span className="osm-status-badge" style={{ background: sc.bg, color: sc.color, borderColor: sc.border, fontSize: 12, padding: '4px 12px' }}>
                          Auto Status: <strong style={{ marginLeft: 4 }}>{previewStatus}</strong>
                        </span>
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
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono,monospace', fontWeight: 800, fontSize: 13, color: '#0f766e', background: '#f8fafc' }}>
                              {fmt2(deliveredTotal)} m
                            </td>
                            <td colSpan={2} style={{ background: '#f8fafc' }} />
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

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