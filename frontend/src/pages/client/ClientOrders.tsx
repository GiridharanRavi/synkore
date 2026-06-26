// frontend/src/pages/client/ClientOrders.tsx
//
// ROOT CAUSE OF MISSING ORDERS (earlier fix, kept):
//   The old version only iterated over `samples` and tried to find a matching
//   order for each one. Any order created DIRECTLY in CustomerOrder.tsx (no
//   sample_request_id / request_code match) silently never appeared.
//   Fixed by building a unified MergedItem[] = sample-rows UNION orders with
//   no sample link at all.
//
// UPDATE (this pass):
//   1. STYLE WARNING FIX — "Removing a style property during rerender
//      (borderColor) when a conflicting property is set (border)". Three
//      spots mixed shorthand `border` in a base style with longhand
//      `borderColor` in an override (filter pills, summary chips, stage-
//      tracker dots). All overrides now use the full `border` shorthand so
//      React never has to diff shorthand vs. longhand on the same property.
//   2. DATE DISPLAY CONSISTENCY — the card header was slicing raw ISO
//      strings (`2026-06-30`) instead of running them through fmtDate(),
//      so it didn't match the dd/mm/yyyy format used everywhere else. Now
//      every date in this file goes through fmtDate() exactly once.
//   3. CLICKABLE STAGE TRACKER — previously the expanded detail panel
//      always showed the same "Order Status" (CO) or sample (SR) fields
//      regardless of which stage was actually active. Each stage node is
//      now clickable; clicking it shows THAT stage's own fields (Expected
//      Delivery date, Delivery Terms/payment info, Dispatch status, etc.),
//      with a short note instead of empty fields if that stage doesn't
//      have data yet (e.g. delivery info before a sample is converted).

import { useEffect, useState } from 'react';
import { getSampleRequests, getOrderBookings } from '../../api/services';

// ─── Read logged-in user (robust) ─────────────────────────────────────────────

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const base64 = token.split('.')[1];
    if (!base64) return null;
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getLoggedInUser(): {
  id?: number; customer_id?: string | number; name?: string; email?: string; role?: string;
} {
  let user: Record<string, any> = {};
  try { user = JSON.parse(localStorage.getItem('user') || '{}'); } catch { user = {}; }

  if (!user.customer_id && !user.id) {
    const TOKEN_KEYS = ['token', 'auth_token', 'access_token', 'authToken', 'accessToken', 'jwt'];
    for (const key of TOKEN_KEYS) {
      const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (!raw) continue;
      const payload = decodeJwtPayload(raw);
      if (payload && (payload.customer_id || payload.id)) {
        user = { ...payload, ...user };
        break;
      }
    }
  }

  const customer_id = user.customer_id ?? user.customerId ?? user.cust_id ??
    (user.role === 'client' ? user.id : undefined);

  return { ...user, customer_id };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SampleRecord {
  id: number;
  request_code: string;
  fabric_type?: string;
  fabric_code?: string;
  fabric_quality?: string;
  color?: string;
  quantity_meters?: number;
  description?: string;
  customer_comments?: string;
  request_date?: string;
  created_at?: string;
  development_date?: string;
  status: string;
  image_url?: string;
  customer_name?: string;
  agent_name?: string;
  sample_type?: string;
}

interface OrderRecord {
  id?: number;
  sample_request_id?: number | null;
  request_code?: string;
  order_code?: string;
  client_name?: string;
  fabric_type?: string;
  quantity?: number;
  order_date?: string;
  po_date?: string;
  expect_delivery?: string;
  delivery_date?: string;
  dispatch_date?: string;
  payment_terms?: string;
  delivery_instruction?: string;
  created_at?: string;
  status: string;
}

type MergedItem =
  | { type: 'sr'; key: string; sample: SampleRecord; order?: OrderRecord }
  | { type: 'co'; key: string; order: OrderRecord };

interface StageData {
  key: string; icon: string; label: string;
  status: string; date: string; state: 'done' | 'active' | 'idle' | 'cancelled';
}

// Fields shown in a stage's detail panel. `value` is optional — falsy/'—'
// values get filtered out before render.
type StageField = { icon: string; label: string; value?: string };
type StageDetail = { fields: StageField[]; wideFields: StageField[]; note?: string };

// ─── Status badge maps (shared) ───────────────────────────────────────────────

const SAMPLE_META: Record<string, { color: string; bg: string; dot: string; label: string }> = {
  pending:          { color: '#92400e', bg: '#fef3c7', dot: '#f59e0b', label: 'Pending' },
  quality_check:    { color: '#1e40af', bg: '#dbeafe', dot: '#3b82f6', label: 'Quality Check' },
  yardage_pricing:  { color: '#7c3aed', bg: '#ede9fe', dot: '#8b5cf6', label: 'Yardage Pricing' },
  price_listed:     { color: '#065f46', bg: '#d1fae5', dot: '#10b981', label: 'Price Listed' },
  bulk_order_ready: { color: '#1e3a5f', bg: '#bfdbfe', dot: '#2563eb', label: 'Bulk Ready' },
  approved:         { color: '#14532d', bg: '#bbf7d0', dot: '#16a34a', label: 'Approved' },
  rejected:         { color: '#7f1d1d', bg: '#fee2e2', dot: '#ef4444', label: 'Rejected' },
  rework:           { color: '#7c2d12', bg: '#ffedd5', dot: '#f97316', label: 'Rework' },
  collected:        { color: '#134e4a', bg: '#ccfbf1', dot: '#0d9488', label: 'Collected' },
};

const ORDER_META: Record<string, { color: string; bg: string; dot: string; label: string }> = {
  pending:    { color: '#92400e', bg: '#fef3c7', dot: '#f59e0b', label: 'Pending' },
  booked:     { color: '#1e40af', bg: '#dbeafe', dot: '#3b82f6', label: 'Booked' },
  processing: { color: '#3C3489', bg: '#EEEDFE', dot: '#6366f1', label: 'Processing' },
  job_work:   { color: '#3C3489', bg: '#EEEDFE', dot: '#6366f1', label: 'Job Work' },
  inward:     { color: '#0F6E56', bg: '#E1F5EE', dot: '#10b981', label: 'Inward' },
  outward:    { color: '#0F6E56', bg: '#E1F5EE', dot: '#10b981', label: 'Outward' },
  dispatch:   { color: '#185FA5', bg: '#E6F1FB', dot: '#3b82f6', label: 'Dispatch' },
  completed:  { color: '#14532d', bg: '#bbf7d0', dot: '#16a34a', label: 'Completed' },
  cancelled:  { color: '#7f1d1d', bg: '#fee2e2', dot: '#ef4444', label: 'Cancelled' },
};

const CANCELLED_STATUSES = new Set(['rejected', 'cancelled']);

const DEV_SUBSTAGE_LABEL: Record<string, string> = {
  pending:          'Not started',
  quality_check:    'Quality Check',
  yardage_pricing:  'Yardage & Pricing',
  price_listed:     'Price Listed',
  rework:           'Rework',
  bulk_order_ready: 'Development Complete',
  approved:         'Development Complete',
  collected:        'Development Complete',
};

function getBadge(sample: SampleRecord, order?: OrderRecord) {
  if (order) return ORDER_META[order.status] || { color: '#374151', bg: '#f3f4f6', dot: '#6b7280', label: order.status };
  return SAMPLE_META[sample.status] || { color: '#374151', bg: '#f3f4f6', dot: '#6b7280', label: sample.status };
}

// Single source of truth for date formatting. Parses the 'YYYY-MM-DD' prefix
// directly via regex — never constructs a JS Date object — so it can't be
// shifted by the browser's local timezone the way `new Date(str)` can.
const fmtDate = (v?: string | null): string => {
  if (!v) return '—';
  const match = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '—';
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
};

// ─── Pipeline 1: Sample Request → Converted Order ─────────────────────────────

const SR_STAGE_DEFS = [
  { key: 'sample_request',  icon: '📋', label: 'Sample Request' },
  { key: 'development',     icon: '🔬', label: 'Development' },
  { key: 'converted_order', icon: '✅', label: 'Order Converted' },
  { key: 'delivery',        icon: '🚛', label: 'Delivery' },
  { key: 'dispatch',        icon: '📤', label: 'Dispatch' },
];

function mapSampleToSRIndex(status: string): number {
  if (status === 'pending') return 0;
  if (['quality_check', 'yardage_pricing', 'price_listed', 'rework'].includes(status)) return 1;
  if (['bulk_order_ready', 'approved', 'collected'].includes(status)) return 2;
  return 0;
}

function mapOrderToSRIndex(status: string): number {
  if (['pending', 'booked'].includes(status)) return 2;
  if (['processing', 'job_work', 'inward', 'outward'].includes(status)) return 3;
  if (['dispatch', 'completed'].includes(status)) return 4;
  return 2;
}

function buildSRTimeline(sample: SampleRecord, order?: OrderRecord): {
  stages: StageData[]; activeStage: number; cancelled: boolean;
} {
  const cancelled = CANCELLED_STATUSES.has(sample.status) || (!!order && CANCELLED_STATUSES.has(order.status));
  const activeStage = cancelled ? -1 : (order ? mapOrderToSRIndex(order.status) : mapSampleToSRIndex(sample.status));

  const isDispatched = !!order && ['dispatch', 'completed'].includes(order.status);

  const info: { status: string; date: string }[] = [
    {
      status: SAMPLE_META[sample.status]?.label || sample.status,
      date: fmtDate(sample.request_date || sample.created_at),
    },
    {
      status: DEV_SUBSTAGE_LABEL[sample.status] || (order ? 'Development Complete' : 'Not started'),
      date: fmtDate(sample.development_date),
    },
    {
      status: order
        ? `Converted${order.order_code ? ' · ' + order.order_code : ''}`
        : (['bulk_order_ready', 'approved'].includes(sample.status) ? 'Ready for Conversion' : 'Awaiting Conversion'),
      date: fmtDate(order?.order_date || order?.created_at),
    },
    {
      status: order ? (ORDER_META[order.status]?.label || order.status) : 'Awaiting Order',
      date: fmtDate(order?.delivery_date || order?.expect_delivery),
    },
    {
      status: isDispatched ? 'Dispatched' : 'Pending',
      date: fmtDate(order?.dispatch_date || (isDispatched ? order?.delivery_date : undefined)),
    },
  ];

  const stages: StageData[] = SR_STAGE_DEFS.map((def, i) => ({
    ...def,
    status: info[i].status,
    date: info[i].date,
    state: cancelled ? 'cancelled' : i < activeStage ? 'done' : i === activeStage ? 'active' : 'idle',
  }));

  return { stages, activeStage, cancelled };
}

// ─── Pipeline 2: Direct Customer Order ────────────────────────────────────────

const CO_STAGE_DEFS = [
  { key: 'order_status',      icon: '🧾', label: 'Order Status' },
  { key: 'expected_delivery', icon: '📅', label: 'Expected Delivery' },
  { key: 'delivery_terms',    icon: '📜', label: 'Delivery Terms' },
  { key: 'dispatch',          icon: '🚚', label: 'Dispatch' },
];

function mapOrderToCOIndex(status: string): number {
  if (status === 'pending') return 0;
  if (status === 'booked') return 1;
  if (['processing', 'job_work', 'inward', 'outward'].includes(status)) return 2;
  if (['dispatch', 'completed'].includes(status)) return 3;
  return 0;
}

function buildCOTimeline(order: OrderRecord): {
  stages: StageData[]; activeStage: number; cancelled: boolean;
} {
  const cancelled = CANCELLED_STATUSES.has(order.status);
  const activeStage = cancelled ? -1 : mapOrderToCOIndex(order.status);
  const isDispatched = ['dispatch', 'completed'].includes(order.status);
  const deliveryDate = order.delivery_date || order.expect_delivery;

  const info: { status: string; date: string }[] = [
    {
      status: ORDER_META[order.status]?.label || order.status,
      date: fmtDate(order.order_date || order.created_at),
    },
    {
      status: deliveryDate ? 'Scheduled' : 'Not set',
      date: fmtDate(deliveryDate),
    },
    {
      status: order.payment_terms || order.delivery_instruction || 'Standard Terms',
      date: fmtDate(order.po_date || order.order_date),
    },
    {
      status: isDispatched ? 'Dispatched' : 'Pending',
      date: fmtDate(order.dispatch_date || (isDispatched ? deliveryDate : undefined)),
    },
  ];

  const stages: StageData[] = CO_STAGE_DEFS.map((def, i) => ({
    ...def,
    status: info[i].status,
    date: info[i].date,
    state: cancelled ? 'cancelled' : i < activeStage ? 'done' : i === activeStage ? 'active' : 'idle',
  }));

  return { stages, activeStage, cancelled };
}

// ─── Header info (per card, shared between both types) ───────────────────────

function getHeaderInfo(item: MergedItem) {
  if (item.type === 'sr') {
    const { sample: s, order: o } = item;
    return {
      codeLabel: o ? 'Order Code' : 'Request Code',
      code: o?.order_code || s.request_code,
      fabric: s.fabric_code || s.fabric_type || o?.fabric_type || '—',
      quality: s.fabric_quality || '—',
      qty: s.quantity_meters ?? o?.quantity ?? '—',
      date: fmtDate(s.created_at || s.request_date),
      color: s.color,
      delivery: o?.delivery_date || o?.expect_delivery,
      badge: getBadge(s, o),
    };
  }
  const o = item.order;
  return {
    codeLabel: 'Order Code',
    code: o.order_code || (o.id != null ? `ORD-${o.id}` : '—'),
    fabric: o.fabric_type || '—',
    quality: '—',
    qty: o.quantity ?? '—',
    date: fmtDate(o.order_date || o.created_at),
    color: undefined as string | undefined,
    delivery: o.delivery_date || o.expect_delivery,
    badge: ORDER_META[o.status] || { color: '#374151', bg: '#f3f4f6', dot: '#6b7280', label: o.status },
  };
}

// ─── Per-stage detail panels ──────────────────────────────────────────────────
// Given the stage index the user clicked, return ONLY that stage's own
// fields — not a generic "always show order status" panel like before.

function getSRStageDetail(
  sample: SampleRecord, order: OrderRecord | undefined, idx: number, stages: StageData[]
): StageDetail {
  const st = stages[idx];
  switch (idx) {
    case 0: // Sample Request
      return {
        fields: [
          { icon: '🔖', label: 'Request Code', value: sample.request_code },
          { icon: '🧵', label: 'Fabric Code',  value: sample.fabric_code || sample.fabric_type },
          { icon: '✨', label: 'Quality',      value: sample.fabric_quality },
          { icon: '🎨', label: 'Color',        value: sample.color },
          { icon: '📐', label: 'Quantity',     value: sample.quantity_meters != null ? `${sample.quantity_meters} m` : undefined },
          { icon: '🏷️', label: 'Sample Type',  value: sample.sample_type },
          { icon: '👨‍💼', label: 'Agent',       value: sample.agent_name },
        ],
        wideFields: [
          { icon: '📝', label: 'Description', value: sample.description },
          { icon: '💬', label: 'Comments',    value: sample.customer_comments },
        ],
      };
    case 1: // Development
      return {
        fields: [
          { icon: '🔬', label: 'Development Status', value: st.status },
          { icon: '📅', label: 'Development Date',    value: st.date !== '—' ? st.date : undefined },
        ],
        wideFields: [],
      };
    case 2: // Order Converted
      return order
        ? {
            fields: [
              { icon: '🧾', label: 'Order Code', value: order.order_code },
              { icon: '👤', label: 'Customer',   value: order.client_name },
              { icon: '📐', label: 'Quantity',   value: order.quantity != null ? `${order.quantity} m` : undefined },
              { icon: '📅', label: 'Order Date', value: fmtDate(order.order_date || order.created_at) },
            ],
            wideFields: [],
          }
        : {
            fields: [],
            wideFields: [],
            note: '⏳ Not yet converted to an order — your team will confirm and book this once development is complete.',
          };
    case 3: // Delivery
      return order
        ? {
            fields: [
              { icon: '🚚', label: 'Expected Delivery', value: fmtDate(order.delivery_date || order.expect_delivery) },
              { icon: '📦', label: 'Delivery Status',   value: st.status },
            ],
            wideFields: [],
          }
        : { fields: [], wideFields: [], note: '📦 Delivery details will appear once this sample is converted into an order.' };
    case 4: // Dispatch
      return order
        ? {
            fields: [
              { icon: '🚛', label: 'Dispatch Status', value: st.status },
              { icon: '📅', label: 'Dispatch Date',   value: st.date !== '—' ? st.date : undefined },
            ],
            wideFields: [],
          }
        : { fields: [], wideFields: [], note: '📤 Dispatch info will appear once this sample is converted into an order.' };
    default:
      return { fields: [], wideFields: [] };
  }
}

function getCOStageDetail(order: OrderRecord, idx: number, stages: StageData[]): StageDetail {
  const st = stages[idx];
  switch (idx) {
    case 0: // Order Status
      return {
        fields: [
          { icon: '🧾', label: 'Order Code', value: order.order_code },
          { icon: '👤', label: 'Customer',   value: order.client_name },
          { icon: '📐', label: 'Quantity',   value: order.quantity != null ? `${order.quantity} m` : undefined },
          { icon: '📅', label: 'Order Date', value: fmtDate(order.order_date || order.created_at) },
        ],
        wideFields: [],
      };
    case 1: // Expected Delivery
      return {
        fields: [
          { icon: '🚚', label: 'Expected Delivery', value: fmtDate(order.delivery_date || order.expect_delivery) },
          { icon: '📦', label: 'Status',             value: st.status },
        ],
        wideFields: [],
      };
    case 2: // Delivery Terms
      return {
        fields: [
          { icon: '💳', label: 'Payment Terms',        value: order.payment_terms },
          { icon: '📜', label: 'Delivery Instruction', value: order.delivery_instruction },
          { icon: '📅', label: 'PO Date',              value: fmtDate(order.po_date || order.order_date) },
        ],
        wideFields: [],
      };
    case 3: // Dispatch
      return {
        fields: [
          { icon: '🚛', label: 'Dispatch Status', value: st.status },
          { icon: '📅', label: 'Dispatch Date',   value: st.date !== '—' ? st.date : undefined },
        ],
        wideFields: [],
      };
    default:
      return { fields: [], wideFields: [] };
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ClientOrders() {
  const [merged,     setMerged]     = useState<MergedItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [typeFilter,  setTypeFilter]  = useState<'all' | 'sr' | 'co'>('all');

  const user       = getLoggedInUser();
  const customerId = user.customer_id;

  useEffect(() => {
    if (!customerId) { setLoading(false); return; }

    Promise.allSettled([
    getSampleRequests(String(customerId)),
    getOrderBookings(String(customerId)),
  ])
      .then(([samplesRes, ordersRes]) => {
        const samples: SampleRecord[] =
          samplesRes.status === 'fulfilled' && Array.isArray(samplesRes.value.data)
            ? samplesRes.value.data : [];

        const orders: OrderRecord[] =
          ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value.data)
            ? ordersRes.value.data : [];

        const usedOrderIds = new Set<number>();
        const items: MergedItem[] = [];

        samples.forEach((s) => {
          const matchedOrder = orders.find(
            (o) =>
              (o.sample_request_id != null && o.sample_request_id === s.id) ||
              (!!o.request_code && o.request_code === s.request_code)
          );
          if (matchedOrder?.id != null) usedOrderIds.add(matchedOrder.id);
          items.push({ type: 'sr', key: `sr-${s.id}`, sample: s, order: matchedOrder });
        });

        orders.forEach((o) => {
          const isLinked = (o.id != null && usedOrderIds.has(o.id)) || o.sample_request_id != null;
          if (!isLinked) {
            items.push({
              type: 'co',
              key: `co-${o.id ?? o.order_code ?? Math.random().toString(36).slice(2)}`,
              order: o,
            });
          }
        });

        items.sort((a, b) => {
          const dateOf = (item: MergedItem) => {
            const raw = item.type === 'sr'
              ? (item.order?.order_date || item.order?.created_at || item.sample.request_date || item.sample.created_at)
              : (item.order.order_date || item.order.created_at);
            const t = raw ? new Date(raw).getTime() : 0;
            return isNaN(t) ? 0 : t;
          };
          return dateOf(b) - dateOf(a);
        });

        setMerged(items);
      })
      .finally(() => setLoading(false));
  }, [customerId]);

  const isItemDispatched = (item: MergedItem): boolean =>
    item.type === 'sr'
      ? (() => { const t = buildSRTimeline(item.sample, item.order); return !t.cancelled && t.activeStage === 4; })()
      : (() => { const t = buildCOTimeline(item.order); return !t.cancelled && t.activeStage === 3; })();

  const isItemCancelled = (item: MergedItem): boolean =>
    item.type === 'sr' ? buildSRTimeline(item.sample, item.order).cancelled : buildCOTimeline(item.order).cancelled;

  const searched = merged.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    if (item.type === 'sr') {
      const { sample: s, order: o } = item;
      return (
        s.request_code?.toLowerCase().includes(q) ||
        s.fabric_type?.toLowerCase().includes(q) ||
        s.fabric_code?.toLowerCase().includes(q) ||
        o?.client_name?.toLowerCase().includes(q) ||
        o?.order_code?.toLowerCase().includes(q)
      );
    }
    const o = item.order;
    return (
      o.order_code?.toLowerCase().includes(q) ||
      o.client_name?.toLowerCase().includes(q) ||
      o.fabric_type?.toLowerCase().includes(q)
    );
  });

  const visible = searched.filter((item) => typeFilter === 'all' || item.type === typeFilter);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  if (!loading && !customerId) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontWeight: 700, color: '#374151', marginBottom: 8 }}>Session Error</div>
        <p style={{ fontSize: 14 }}>Unable to identify your account. Please log out and sign in again.</p>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <style>{`
        @keyframes co-fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes co-spin   { to{transform:rotate(360deg)} }
        .co-card:hover { border-color:#c7d2fe !important; box-shadow:0 4px 20px rgba(79,70,229,0.08) !important; }
        .co-head:hover { background:#fafbff !important; }
        .co-search:focus { border-color:#6366f1 !important; box-shadow:0 0 0 3px rgba(99,102,241,0.1) !important; outline:none; }
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:99px;}
        ::-webkit-scrollbar-track{background:transparent;}
        @media(max-width:640px){
          .co-info-row{flex-direction:column!important;gap:8px!important;}
          .co-steps{overflow-x:auto;padding-bottom:6px;}
          .co-detail-grid{grid-template-columns:1fr!important;}
          .co-chips{flex-wrap:wrap!important;}
        }
      `}</style>

      {/* ── Page Header ── */}
      <div style={S.pageHead}>
        <div>
          <div style={S.customerTag}>
            <div style={S.customerDot} />
            {user.name || user.email || 'Customer'}
            <span style={S.customerIdBadge}>ID: {customerId}</span>
          </div>
          <h2 style={S.pageTitle}>My Orders</h2>
          <p style={S.pageSub}>Sample-converted orders &amp; direct orders — tracked separately</p>
        </div>
        <div style={S.searchWrap}>
          <svg style={S.searchIco} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="co-search"
            style={S.searchBox}
            placeholder="Search by code, fabric..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Filter pills ── */}
      {!loading && (
        <div style={S.filterRow}>
          {[
            { key: 'all', label: `All (${merged.length})` },
            { key: 'sr',  label: `Sample → Order (${merged.filter(m => m.type === 'sr').length})` },
            { key: 'co',  label: `Direct Orders (${merged.filter(m => m.type === 'co').length})` },
          ].map((p) => (
            <button
              key={p.key}
              style={{ ...S.filterPill, ...(typeFilter === p.key ? S.filterPillActive : {}) }}
              onClick={() => setTypeFilter(p.key as 'all' | 'sr' | 'co')}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Summary chips ── */}
      {!loading && (
        <div style={S.chips} className="co-chips">
          {[
            { label: 'Total Orders',      count: merged.length,                                            bg: '#ede9fe', color: '#4f46e5', border: '#c4b5fd', icon: '📦' },
            { label: 'Sample → Order',    count: merged.filter(m => m.type === 'sr').length,                bg: '#f5f3ff', color: '#6d28d9', border: '#c4b5fd', icon: '🔄' },
            { label: 'Direct Orders',     count: merged.filter(m => m.type === 'co').length,                bg: '#f0fdfa', color: '#0f766e', border: '#5eead4', icon: '🧾' },
            { label: 'Dispatched',        count: merged.filter(isItemDispatched).length,                    bg: '#dcfce7', color: '#15803d', border: '#86efac', icon: '🚚' },
            { label: 'Cancelled',         count: merged.filter(isItemCancelled).length,                     bg: '#fee2e2', color: '#dc2626', border: '#fca5a5', icon: '✕' },
          ].map((c) => (
            <div key={c.label} style={{ ...S.chip, background: c.bg, border: `1.5px solid ${c.border}` }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{c.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: c.color, lineHeight: 1 }}>{c.count}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.color, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Cards ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"
            style={{ animation: 'co-spin 1s linear infinite', display: 'inline-block' }}>
            <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
            <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
          </svg>
          <p style={{ color: '#94a3b8', marginTop: 12, fontSize: 14 }}>Loading your orders...</p>
        </div>
      ) : visible.length === 0 ? (
        <div style={S.emptyBox}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 700, color: '#374151', marginBottom: 6 }}>No orders found</div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            {search ? 'Try a different search term' : 'Your admin will create orders linked to your account'}
          </div>
        </div>
      ) : (
        visible.map((item, i) => (
          <TrackingCard
            key={item.key}
            item={item}
            index={i}
            open={expanded.has(item.key)}
            onToggle={() => toggle(item.key)}
            userName={user.name}
          />
        ))
      )}
    </div>
  );
}

// ─── Source chip ───────────────────────────────────────────────────────────────

function SourceChip({ type }: { type: 'sr' | 'co' }) {
  const style = type === 'sr'
    ? { background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd' }
    : { background: '#f0fdfa', color: '#0f766e', border: '1px solid #5eead4' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap', flexShrink: 0, ...style }}>
      {type === 'sr' ? '🔄 Sample → Order' : '🧾 Direct Order'}
    </span>
  );
}

// ─── Tracking Card ──────────────────────────────────────────────────────────────

function TrackingCard({
  item, index: i, open, onToggle, userName,
}: {
  item: MergedItem; index: number; open: boolean; onToggle: () => void; userName?: string;
}) {
  const header   = getHeaderInfo(item);
  const timeline = item.type === 'sr' ? buildSRTimeline(item.sample, item.order) : buildCOTimeline(item.order);

  // Which stage's panel is currently shown. Defaults to whatever stage is
  // active right now (or 0 if cancelled) — click any tracker node to inspect
  // that stage's own info instead.
  const [viewStage, setViewStage] = useState<number>(
    timeline.activeStage >= 0 ? timeline.activeStage : 0
  );

  const selSt = timeline.stages[viewStage];

  const detail: StageDetail = item.type === 'sr'
    ? getSRStageDetail(item.sample, item.order, viewStage, timeline.stages)
    : getCOStageDetail(item.order, viewStage, timeline.stages);

  const fields     = detail.fields.filter(f => f.value && f.value !== '—' && f.value !== '— m');
  const wideFields = detail.wideFields.filter(f => f.value);

  const banner = selSt.state === 'cancelled'
    ? { bg: '#fef2f2', border: '#fca5a5', dot: '#ef4444', text: '#dc2626' }
    : selSt.state === 'done'
    ? { bg: '#f0fdf4', border: '#bbf7d0', dot: '#16a34a', text: '#15803d' }
    : selSt.state === 'active'
    ? { bg: '#eff6ff', border: '#bfdbfe', dot: '#2563eb', text: '#1d4ed8' }
    : { bg: '#f8fafc', border: '#e2e8f0', dot: '#94a3b8', text: '#64748b' };

  return (
    <div className="co-card" style={{ ...S.card, animation: `co-fadeUp 0.35s ${i * 0.04}s both` }}>

      {/* ── Card header (always visible, clickable) ── */}
      <div className="co-head" style={S.cardHead} onClick={onToggle}>
        <div style={S.indexBubble}>#{i + 1}</div>
        <SourceChip type={item.type} />

        <div style={S.infoRow} className="co-info-row">
          <MetaCol label={header.codeLabel} value={header.code || '—'} bold />
          <MetaCol label="Fabric" value={header.fabric} />
          {header.quality !== '—' && <MetaCol label="Quality" value={header.quality} />}
          <MetaCol label="Qty" value={`${header.qty} m`} />
          <MetaCol label="Date" value={header.date} />
          {header.delivery && <MetaCol label="Exp. Delivery" value={fmtDate(header.delivery)} />}
        </div>

        {header.color && (
          <div style={S.colorCell}>
            <div style={{
              width: 13, height: 13, borderRadius: '50%',
              background: header.color.toLowerCase(),
              border: '1.5px solid rgba(0,0,0,0.1)', flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, color: '#64748b' }}>{header.color}</span>
          </div>
        )}

        <span style={{ ...S.badge, color: header.badge.color, background: header.badge.bg }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: header.badge.dot, marginRight: 5 }} />
          {header.badge.label}
        </span>

        <div style={{ ...S.chevronWrap, transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6,9 12,15 18,9"/>
          </svg>
        </div>
      </div>

      {/* ── Expandable body ── */}
      <div style={{ ...S.body, maxHeight: open ? 800 : 0 }}>
        <div style={S.bodyDivider} />
        <div style={S.bodyInner}>

          {/* Click any stage node to see ITS OWN panel below */}
          <StageTracker
            stages={timeline.stages}
            selectedIndex={viewStage}
            onSelect={(idx) => setViewStage(idx)}
          />

          {/* ── Dynamic banner for whichever stage is selected ── */}
          <div style={{ ...S.activeBanner, background: banner.bg, border: `1px solid ${banner.border}` }}>
            <span style={{ ...S.activeBannerDot, background: banner.dot }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: banner.text }}>
              {selSt.icon} {selSt.label}
            </span>
            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>
              — {selSt.status} · {selSt.date}
            </span>
          </div>

          {/* ── Detail grid for the selected stage only ── */}
          {(fields.length > 0 || wideFields.length > 0) && (
            <div style={S.detailGrid} className="co-detail-grid">
              {fields.map(f => (
                <DetailRow key={f.label} icon={f.icon} label={f.label} value={f.value as string} />
              ))}
              {wideFields.map(f => (
                <DetailRow key={f.label} icon={f.icon} label={f.label} value={f.value as string} wide />
              ))}
            </div>
          )}

          {detail.note && (
            <div style={S.pendingNote}>{detail.note}</div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Stage Tracker (shared renderer for both pipelines, now clickable) ───────

function StageTracker({
  stages, selectedIndex, onSelect,
}: { stages: StageData[]; selectedIndex: number; onSelect: (i: number) => void }) {
  return (
    <div style={S.trackerWrap} className="co-steps">
      <div style={S.trackLine} aria-hidden>
        {stages.slice(0, -1).map((_, i) => (
          <div key={i} style={{
            ...S.trackSeg,
            background: stages[i].state === 'done' ? '#1d9e75' : '#e5e7eb',
            transition: 'background 0.5s',
          }} />
        ))}
      </div>

      {stages.map((st, i) => (
        <div
          key={st.key}
          style={{
            ...S.trackStep,
            cursor: 'pointer',
            borderRadius: 10,
            // Selection ring uses `outline`, not border/box-shadow, so it
            // never collides with the shorthand/longhand border rules below.
            outline: i === selectedIndex ? '2px solid #6366f1' : 'none',
            outlineOffset: 4,
          }}
          onClick={() => onSelect(i)}
          title={`View ${st.label} details`}
        >
          <div style={{
            ...S.trackIc,
            ...(st.state === 'done'      ? { background: '#1d9e75', border: '2px solid #1d9e75', color: '#fff' } : {}),
            ...(st.state === 'active'    ? { background: '#2563eb', border: '2px solid #2563eb', color: '#fff', boxShadow: '0 0 0 4px rgba(37,99,235,0.15)' } : {}),
            ...(st.state === 'cancelled' ? { background: '#dc2626', border: '2px solid #dc2626', color: '#fff' } : {}),
          }}>
            {st.state === 'done' ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <polyline points="20,6 9,17 4,12"/>
              </svg>
            ) : st.state === 'cancelled' ? '✕' : st.icon}
          </div>
          <span style={{
            ...S.trackLbl,
            ...(st.state === 'done'      ? { color: '#0f6e56', fontWeight: 600 } : {}),
            ...(st.state === 'active'    ? { color: '#1d4ed8', fontWeight: 700 } : {}),
            ...(st.state === 'cancelled' ? { color: '#dc2626', fontWeight: 600 } : {}),
          }}>
            {st.label}
          </span>
          <span style={S.trackStatus}>{st.status}</span>
          <span style={S.trackDate}>{st.date}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function MetaCol({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={S.metaCol}>
      <span style={S.metaLabel}>{label}</span>
      <span style={{ ...S.metaVal, fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

function DetailRow({ icon, label, value, wide }: { icon: string; label: string; value: string; wide?: boolean }) {
  return (
    <div style={{ ...S.detRow, ...(wide ? { gridColumn: '1 / -1' } : {}) }}>
      <div style={S.detLabel}>{icon} {label}</div>
      <div style={S.detVal}>{value}</div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  wrap: { fontFamily: "'DM Sans', system-ui, sans-serif", minHeight: '100%' },

  // Header
  pageHead:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 16, flexWrap: 'wrap' },
  customerTag:{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, fontSize: 12, fontWeight: 700, color: '#4f46e5' },
  customerDot:{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 2px rgba(34,197,94,0.2)' },
  customerIdBadge: { background: '#dbeafe', color: '#1d4ed8', borderRadius: 20, padding: '1px 9px', fontSize: 11, fontWeight: 700 },
  pageTitle:  { fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' },
  pageSub:    { fontSize: 13, color: '#64748b', marginTop: 3, margin: '3px 0 0' },
  searchWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  searchIco:  { position: 'absolute', left: 11, width: 14, height: 14, color: '#94a3b8', pointerEvents: 'none' } as React.CSSProperties,
  searchBox:  { padding: '9px 14px 9px 33px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13, width: 230, background: '#fff', transition: 'border .2s, box-shadow .2s', fontFamily: 'inherit' },

  // Filter pills
  filterRow:        { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  filterPill:        { padding: '7px 14px', borderRadius: 20, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 12.5, fontWeight: 600, color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' },
  // NOTE: full `border` shorthand here (not `borderColor`) — fixes the
  // "Removing a style property during rerender" console warning, since the
  // base style above also sets the shorthand `border`.
  filterPillActive: { background: '#eef2ff', border: '1.5px solid #a5b4fc', color: '#4338ca' },

  // Chips
  chips: { display: 'flex', gap: 12, marginBottom: 20 },
  chip:  { borderRadius: 14, padding: '14px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 100, border: '1.5px solid transparent', flex: 1 },

  // Empty
  emptyBox: { textAlign: 'center', padding: '60px 24px', color: '#9ca3af', fontSize: 14 },

  // Card
  card:     { background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 16, marginBottom: 12, overflow: 'hidden', transition: 'border-color .2s, box-shadow .2s', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer', transition: 'background .15s', flexWrap: 'wrap' },
  indexBubble: { width: 28, height: 28, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#64748b', flexShrink: 0 },
  infoRow:  { flex: 1, display: 'flex', gap: 20, flexWrap: 'wrap', minWidth: 0 },
  metaCol:  { display: 'flex', flexDirection: 'column', gap: 2 },
  metaLabel:{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaVal:  { fontSize: 13, color: '#0f172a' },
  colorCell:{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 },
  badge:    { display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 600, padding: '4px 11px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 },
  chevronWrap: { width: 28, height: 28, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0, transition: 'transform .3s cubic-bezier(.4,0,.2,1)' },

  // Body
  body:       { overflow: 'hidden', transition: 'max-height .45s cubic-bezier(.4,0,.2,1)' },
  bodyDivider:{ height: 1, background: '#f1f5f9', margin: '0 18px' },
  bodyInner:  { padding: '16px 18px 18px' },

  // Active banner
  activeBanner:  { display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, padding: '9px 14px', marginBottom: 16, flexWrap: 'wrap' },
  activeBannerDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },

  // Stage tracker
  trackerWrap: { display: 'flex', alignItems: 'flex-start', position: 'relative', marginBottom: 16, paddingBottom: 4 },
  trackLine:   { position: 'absolute', top: 15, left: 0, right: 0, display: 'flex', height: 2, zIndex: 0 },
  trackSeg:    { flex: 1, height: 2 },
  trackStep:   { flex: 1, minWidth: 72, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1, padding: '0 2px' },
  // NOTE: state overrides in StageTracker use full `border` shorthand to
  // match this base style — fixes the same shorthand/longhand warning.
  trackIc:     { width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, border: '2px solid #e5e7eb', background: '#f9fafb', color: '#94a3b8', transition: 'all .35s', flexShrink: 0 },
  trackLbl:    { fontSize: 10, marginTop: 6, textAlign: 'center', color: '#94a3b8', maxWidth: 78, lineHeight: 1.3, letterSpacing: 0.1 },
  trackStatus: { fontSize: 9.5, marginTop: 3, textAlign: 'center', color: '#475569', fontWeight: 600, maxWidth: 78, lineHeight: 1.3, wordBreak: 'break-word' },
  trackDate:   { fontSize: 8.5, marginTop: 2, textAlign: 'center', color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace", maxWidth: 78 },

  // Detail grid
  detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: '#f1f5f9', borderRadius: 12, overflow: 'hidden', marginBottom: 12, border: '1px solid #e2e8f0' },
  detRow:     { display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 14px', background: '#fff' },
  detLabel:   { fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 },
  detVal:     { fontSize: 13, color: '#0f172a', fontWeight: 500 },

  // Stage note (shown when a stage has no data yet)
  pendingNote: { fontSize: 12.5, color: '#64748b', background: '#f8fafc', border: '1px dashed #e2e8f0', borderRadius: 10, padding: '10px 14px' },
};