/*
  DASHBOARD — "Textile Manufacturing ERP" theme (matches design reference)
  Mobile (320px) → Tablet (768px) → Laptop (1024px) → Desktop (1440px+)

  LIVE DATA CONTRACT
  -------------------
  Base stat cards + order status donut still come from getDashboard(),
  same as before, field names resolved defensively.

  Three stat cards are wired to their real modules (unchanged from the
  previous revision):

    1. "In Production" → Fabric Stock (GET /api/fabric-stock/summary,
       array of grouped rows, summed client-side).
    2. "Yarn Stock" → yarnStockService.getSummary() → stats.total_kgs.
    3. "Total Customers" → getCustomers() (raw axios, count array).

  *** NEW IN THIS REVISION — Production Overview chart ***
  ------------------------------------------------------------------
  The "Production Overview" chart (the bar/line/area chart with the
  Weekly/Monthly/Yearly toggle) is now driven by real Orders + Deliveries
  data instead of the old placeholder/dedicated-endpoint trend, per your
  request to connect "daily order and delivery" to the chart.

  Metric shown: % of orders completed, per bucket
    (completedOrders / totalOrders) * 100
  ...for whichever period is selected:
    - weekly  → buckets by day of week (Mon..Sun) over the last 7 days
    - monthly → buckets by week-of-month (Week 1..4) in the current month
    - yearly  → buckets by quarter (Q1..Q4) in the current year

  Data sources: getOrders() and getDeliveries(), both confirmed by you to
  exist as separate service functions (mirroring the getCustomers() raw
  axios pattern already used elsewhere in this file).

  An order counts as "completed" if EITHER:
    a) its own status field matches a completed/delivered/dispatched/done
       keyword, OR
    b) its id shows up in the set of order ids referenced by getDeliveries()
       rows (i.e. a delivery record exists for it).
  This mirrors the same "search several plausible key names, don't assume
  one exact shape" approach already used for the fabric-stock summary —
  because it's guessing field names, this part is different from the
  confirmed fabric-stock fix.

  ⚠️ CONFIRM THIS: unlike the fabric-stock/yarn-stock/customers cards,
  the *exact* field names below for order date, order status, order id,
  and the order-id field on a delivery row are NOT confirmed against your
  real API response — they're a defensive best-guess list, same pattern
  as pickNum()/findNumberByPattern() elsewhere in this file. Please check
  the console.debug output (search "ORDER TREND DEBUG" in devtools) once,
  confirm it's picking up the right date/status keys for your actual
  payload shape, then delete that debug block. If your real field names
  aren't in the guess lists below, add them to ORDER_DATE_KEYS /
  ORDER_STATUS_KEYS / ORDER_ID_KEYS / DELIVERY_ORDER_ID_KEYS.

  Priority order for what the chart displays (highest wins):
    1. liveOrderTrend   — computed here from getOrders() + getDeliveries()
    2. liveTrend        — from optional getProductionTrend() if it exists
    3. dashboardTrend   — embedded productionTrend field on getDashboard()
    4. FALLBACK_TREND   — static placeholder, last resort only

  Also unchanged from before: 60s polling refresh, chart-type toggle.
*/

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  Cell,
  LabelList,
  PieChart,
  Pie,
  Tooltip,
  CartesianGrid,
} from 'recharts';

import {
  Briefcase,
  Factory,
  Archive,
  Truck,
  Users,
  Cpu,
  TrendingUp,
  Clock3,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  BarChart3,
  LineChart as LineChartIcon,
  AreaChart as AreaChartIcon,
} from 'lucide-react';

// Confirmed real exports from services.ts:
import {
  getDashboard,
  getFabricStockSummary, // GET /fabric-stock/summary → res.data → StockSummaryRow[] (array, grouped by Sort No + Construction)
  yarnStockService,      // yarnStockService.getSummary() → { data, total, page, limit, stats: { total_kgs, ... } }
  getCustomers,          // GET /customers → raw axios response (unwrap with r.data)
} from '../../api/services';

// *** FIX ***
// getOrders / getDeliveries / getProductionTrend are NOT statically imported
// anymore. A static `import { x } from '...'` for a name that doesn't
// actually exist on the target module throws
//   "does not provide an export named 'x'"
// and Vite's ESM bundler fails the WHOLE module — which is exactly what
// crashed this page. Instead we look them up defensively at runtime via the
// module namespace object, the same safe pattern already used for
// getProductionTrend before this fix. If a name doesn't exist, the
// corresponding fetch below is simply skipped (chart falls back to the next
// trend source) instead of crashing the page.
//
// ⚠️ Once you confirm the real export names in services.ts for
// orders/deliveries (they may be named differently — e.g. orderService,
// deliveryService, getOrderList, etc.), update ORDER_FN_NAMES /
// DELIVERY_FN_NAMES below, or just rename them here to a plain static
// import once confirmed.
import * as servicesModule from '../../api/services';

function resolveServiceFn(candidateNames: string[]): ((...args: any[]) => Promise<any>) | undefined {
  for (const name of candidateNames) {
    const fn = (servicesModule as any)[name];
    if (typeof fn === 'function') return fn;
  }
  return undefined;
}

const getProductionTrend: undefined | ((period: Period) => Promise<any>) =
  resolveServiceFn(['getProductionTrend']);

// Try a few plausible names since 'getOrders' / 'getDeliveries' turned out
// not to exist under those exact names in your services.ts.
const ORDER_FN_NAMES = ['getOrders', 'getOrderList', 'orderService', 'getAllOrders', 'fetchOrders'];
const DELIVERY_FN_NAMES = ['getDeliveries', 'getDeliveryList', 'deliveryService', 'getAllDeliveries', 'fetchDeliveries'];

const getOrdersFn = resolveServiceFn(ORDER_FN_NAMES);
const getDeliveriesFn = resolveServiceFn(DELIVERY_FN_NAMES);

if (typeof getOrdersFn !== 'function' || typeof getDeliveriesFn !== 'function') {
  // Non-fatal — just means the Production Overview chart will fall back to
  // getProductionTrend / the dashboard-embedded trend / the placeholder,
  // instead of live order+delivery data, until services.ts is confirmed.
  console.warn(
    '[DashboardHome] Could not find getOrders/getDeliveries exports in ../../api/services. ' +
    'Production Overview chart will use a fallback trend source instead of live order/delivery data. ' +
    'Update ORDER_FN_NAMES / DELIVERY_FN_NAMES in DashboardHome.tsx with the real export names.'
  );
}

/* ── Which fabric-stock field to headline on the "In Production" card ── */
type ProductionMetric = 'totalStockMeter' | 'piecesInStock';
const PRODUCTION_METRIC: ProductionMetric = 'totalStockMeter';

/* ── Currency — Indian textile ERP, change to '$' if you want an exact
   match to the design mock (which used $) ── */
const CURRENCY_SYMBOL = '₹';

/* ── Live refresh interval (ms). Set to 0 to disable polling. ── */
const REFRESH_INTERVAL_MS = 60_000;

/* ── Types ──────────────────────────────────────────────── */
interface OrderStatusBreakdown {
  completed: number;
  inProgress: number;
  pending: number;
}

interface Stats {
  totalOrders: number;
  totalOrdersGrowth?: number;
  inProduction: number;
  inProductionGrowth?: number;
  yarnStock: number;
  yarnStockGrowth?: number;
  pendingDelivery: number;
  pendingDeliveryGrowth?: number;
  totalCustomers: number;
  activeMachines: number;
  revenue: number;
  pendingTasks: number;
  orderStatus: OrderStatusBreakdown;
}

type TrendPoint = { label: string; pct: number };
type Period = 'weekly' | 'monthly' | 'yearly';
type ChartType = 'bar' | 'line' | 'area';

/* Shape returned per-row by GET /api/fabric-stock/summary — mirrors
   StockSummaryRow in FabricStock.tsx exactly. */
interface FabricStockSummaryRow {
  sort_no: string;
  construction: string;
  hsn_code?: string;
  total_meter: number;
  piece_count: number;
  suppliers?: string[];
  locations?: string[];
  fpo_nos?: string[];
  last_inward?: string | null;
}

/* Loose shapes for Orders / Deliveries — NOT confirmed against your real
   API response, kept intentionally loose (all optional / any) and read
   defensively via pick*() helpers below. See the ⚠️ CONFIRM THIS note at
   the top of the file. */
interface OrderRow {
  [key: string]: any;
}
interface DeliveryRow {
  [key: string]: any;
}

/* ── Responsive hook ────────────────────────────────────── */
function useWidth() {
  const [w, setW] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return w;
}

/* ── Defensive field-name resolution ───────────────────────
   Same spirit as the schema-introspection helpers used elsewhere in
   FabricFlow (getColumns/pickColumn) — try several plausible key names
   before falling back to 0/undefined. */
function pickNum(raw: any, keys: string[]): number {
  for (const k of keys) {
    const v = raw?.[k];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return 0;
}

function pickMaybeNum(raw: any, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = raw?.[k];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return undefined;
}

/* Try several plausible key names for a STRING field. Also handles the
   common case where the value is actually a nested object with an `id`
   (e.g. delivery.order = { id: "..." } instead of delivery.order_id). */
function pickStr(raw: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = raw?.[k];
    if (typeof v === 'string' && v.trim() !== '') return v;
    if (typeof v === 'number') return String(v);
    if (v && typeof v === 'object' && typeof v.id !== 'undefined') return String(v.id);
  }
  return undefined;
}

/* Try several plausible key names for a DATE field, parsing whatever comes
   back (ISO string, timestamp, etc.) into a real Date. Returns null if
   nothing parses. */
function pickDate(raw: any, keys: string[]): Date | null {
  for (const k of keys) {
    const v = raw?.[k];
    if (!v) continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/* ── Fallback: scan an object's keys (and one level of nesting) for any
   numeric field whose key name matches ALL of the given patterns,
   case/format-insensitive (ignores _, -, space). Used ONLY when the
   endpoint returns a single flat/nested summary object instead of the
   confirmed array-of-rows shape — see fetchFabricStockSummary() below,
   which now checks the array shape FIRST. ── */
function findNumberByPattern(raw: any, mustInclude: string[]): number | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;

  const normalize = (s: string) => s.toLowerCase().replace(/[_\-\s]/g, '');
  const patterns = mustInclude.map(normalize);

  const scanLevel = (obj: any): number | undefined => {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const key of Object.keys(obj)) {
      const normKey = normalize(key);
      if (patterns.every((p) => normKey.includes(p))) {
        const v = obj[key];
        if (typeof v === 'number' && !Number.isNaN(v)) return v;
        if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v.replace(/,/g, '')))) {
          return Number(v.replace(/,/g, ''));
        }
      }
    }
    return undefined;
  };

  // Flat scan first
  const flat = scanLevel(raw);
  if (typeof flat === 'number') return flat;

  // One level of nesting (raw.data, raw.summary, raw.result, raw.stats, ...)
  for (const key of Object.keys(raw)) {
    const child = raw[key];
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      const nested = scanLevel(child);
      if (typeof nested === 'number') return nested;
    }
  }

  return undefined;
}

/* Sum a numeric field across every row of an array, tolerating both
   snake_case and camelCase key spellings and string-typed numbers. */
function sumRows(rows: any[], keys: string[]): number {
  return rows.reduce((total, row) => total + pickNum(row, keys), 0);
}

/* Count distinct non-empty values across a field that may itself be an
   array (e.g. `locations: string[]` per row) or a single string. */
function countDistinct(rows: any[], key: string): number {
  const set = new Set<string>();
  for (const row of rows) {
    const v = row?.[key];
    if (Array.isArray(v)) {
      v.forEach((x) => x && set.add(String(x)));
    } else if (v) {
      set.add(String(v));
    }
  }
  return set.size;
}

/* Unwrap a raw axios-style response (or a plain array) into an array of
   rows, trying the same handful of common wrapper shapes used elsewhere
   in this file (r.data, r.data.data, r.data.results, ...). */
function unwrapArray(r: any, extraKeys: string[] = []): any[] {
  const raw = r?.data ?? r;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.results)) return raw.results;
  for (const k of extraKeys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

function normalizeStats(raw: any): Stats {
  const orderStatusRaw = raw?.orderStatus || raw?.order_status || {};
  return {
    totalOrders: pickNum(raw, ['totalOrders', 'total_orders', 'orders']),
    totalOrdersGrowth: pickMaybeNum(raw, ['totalOrdersGrowth', 'total_orders_growth', 'ordersGrowth']),
    inProduction: pickNum(raw, ['inProduction', 'in_production', 'dyeing']),
    inProductionGrowth: pickMaybeNum(raw, ['inProductionGrowth', 'in_production_growth']),
    yarnStock: pickNum(raw, ['yarnStock', 'yarn_stock', 'yarnStockKg']),
    yarnStockGrowth: pickMaybeNum(raw, ['yarnStockGrowth', 'yarn_stock_growth']),
    pendingDelivery: pickNum(raw, ['pendingDelivery', 'pending_delivery']),
    pendingDeliveryGrowth: pickMaybeNum(raw, ['pendingDeliveryGrowth', 'pending_delivery_growth']),
    totalCustomers: pickNum(raw, ['totalCustomers', 'total_customers', 'customers']),
    activeMachines: pickNum(raw, ['activeMachines', 'active_machines', 'machines']),
    revenue: pickNum(raw, ['revenue', 'totalRevenue', 'total_revenue']),
    pendingTasks: pickNum(raw, ['pendingTasks', 'pending_tasks', 'samples']),
    orderStatus: {
      completed: pickNum(orderStatusRaw, ['completed']) || pickNum(raw, ['ordersCompleted', 'dispatch']),
      inProgress: pickNum(orderStatusRaw, ['inProgress', 'in_progress']) || pickNum(raw, ['ordersInProgress', 'dyeing']),
      pending: pickNum(orderStatusRaw, ['pending']) || pickNum(raw, ['ordersPending', 'pendingInward']),
    },
  };
}

/* ── Placeholder trend data (last-resort fallback only — real data now
   comes from Orders + Deliveries, see fetchOrdersDeliveryTrend() below) ── */
const FALLBACK_TREND: Record<Period, TrendPoint[]> = {
  weekly: [
    { label: 'Mon', pct: 75 },
    { label: 'Tue', pct: 85 },
    { label: 'Wed', pct: 65 },
    { label: 'Thu', pct: 90 },
    { label: 'Fri', pct: 80 },
    { label: 'Sat', pct: 70 },
    { label: 'Sun', pct: 60 },
  ],
  monthly: [
    { label: 'Week 1', pct: 72 },
    { label: 'Week 2', pct: 88 },
    { label: 'Week 3', pct: 79 },
    { label: 'Week 4', pct: 91 },
  ],
  yearly: [
    { label: 'Q1', pct: 68 },
    { label: 'Q2', pct: 82 },
    { label: 'Q3', pct: 77 },
    { label: 'Q4', pct: 86 },
  ],
};

function isValidTrendArray(arr: any): arr is TrendPoint[] {
  return Array.isArray(arr) && arr.length > 0 && arr.every((p) => typeof p?.pct === 'number' && typeof p?.label === 'string');
}

function normalizeTrendFromDashboard(raw: any): Partial<Record<Period, TrendPoint[]>> {
  const t = raw?.productionTrend || raw?.production_trend;
  if (!t) return {};
  const out: Partial<Record<Period, TrendPoint[]>> = {};
  if (isValidTrendArray(t.weekly)) out.weekly = t.weekly;
  if (isValidTrendArray(t.monthly)) out.monthly = t.monthly;
  if (isValidTrendArray(t.yearly)) out.yearly = t.yearly;
  return out;
}

/* ── Orders + Deliveries → Production Overview trend ────────────────
   ⚠️ Field-name guesses below are NOT confirmed against your real API —
   see the ⚠️ CONFIRM THIS note at the top of the file. Add your real key
   names to these lists if they aren't already covered. */
const ORDER_DATE_KEYS = ['order_date', 'orderDate', 'created_at', 'createdAt', 'date'];
const ORDER_STATUS_KEYS = ['status', 'order_status', 'orderStatus'];
const ORDER_ID_KEYS = ['id', 'order_id', 'orderId', '_id'];
const DELIVERY_ORDER_ID_KEYS = ['order_id', 'orderId', 'order', 'order_ref', 'orderRef'];

const COMPLETED_STATUS_KEYWORDS = ['complete', 'completed', 'delivered', 'dispatch', 'dispatched', 'done', 'fulfilled'];

function isOrderCompleted(order: OrderRow, deliveredOrderIds: Set<string>): boolean {
  const status = pickStr(order, ORDER_STATUS_KEYS)?.toLowerCase();
  if (status && COMPLETED_STATUS_KEYWORDS.some((kw) => status.includes(kw))) return true;

  const id = pickStr(order, ORDER_ID_KEYS);
  if (id && deliveredOrderIds.has(id)) return true;

  return false;
}

/* Bucket orders into the given period's slots and compute
   (completed / total) * 100 per slot. Buckets with zero orders show 0%
   rather than being omitted, so the chart always has a consistent shape. */
function computeCompletionBuckets(
  orders: OrderRow[],
  deliveredOrderIds: Set<string>,
  period: Period
): TrendPoint[] {
  const now = new Date();

  if (period === 'weekly') {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const buckets = labels.map(() => ({ completed: 0, total: 0 }));

    for (const order of orders) {
      const d = pickDate(order, ORDER_DATE_KEYS);
      if (!d || d < sevenDaysAgo || d > now) continue;
      const monFirstIndex = (d.getDay() + 6) % 7; // JS getDay(): 0=Sun..6=Sat → 0=Mon..6=Sun
      buckets[monFirstIndex].total += 1;
      if (isOrderCompleted(order, deliveredOrderIds)) buckets[monFirstIndex].completed += 1;
    }

    return labels.map((label, i) => ({
      label,
      pct: buckets[i].total > 0 ? Math.round((buckets[i].completed / buckets[i].total) * 100) : 0,
    }));
  }

  if (period === 'monthly') {
    const labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    const buckets = labels.map(() => ({ completed: 0, total: 0 }));

    for (const order of orders) {
      const d = pickDate(order, ORDER_DATE_KEYS);
      if (!d || d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
      const weekIndex = Math.min(3, Math.floor((d.getDate() - 1) / 7)); // days 29-31 fold into Week 4
      buckets[weekIndex].total += 1;
      if (isOrderCompleted(order, deliveredOrderIds)) buckets[weekIndex].completed += 1;
    }

    return labels.map((label, i) => ({
      label,
      pct: buckets[i].total > 0 ? Math.round((buckets[i].completed / buckets[i].total) * 100) : 0,
    }));
  }

  // yearly
  const labels = ['Q1', 'Q2', 'Q3', 'Q4'];
  const buckets = labels.map(() => ({ completed: 0, total: 0 }));

  for (const order of orders) {
    const d = pickDate(order, ORDER_DATE_KEYS);
    if (!d || d.getFullYear() !== now.getFullYear()) continue;
    const quarterIndex = Math.floor(d.getMonth() / 3);
    buckets[quarterIndex].total += 1;
    if (isOrderCompleted(order, deliveredOrderIds)) buckets[quarterIndex].completed += 1;
  }

  return labels.map((label, i) => ({
    label,
    pct: buckets[i].total > 0 ? Math.round((buckets[i].completed / buckets[i].total) * 100) : 0,
  }));
}

/* ── Formatting helpers ────────────────────────────────── */
function fmtInt(n: number) {
  return n.toLocaleString('en-US');
}

/* Always renders exactly 2 decimals + uppercase "M", to match the Fabric
   Stock screen's "23,250.00 M" exactly. */
function fmtMeters(n: number) {
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M`;
}

function fmtRevenue(n: number) {
  if (n >= 1_000_000) return `${CURRENCY_SYMBOL}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${CURRENCY_SYMBOL}${(n / 1_000).toFixed(1)}K`;
  return `${CURRENCY_SYMBOL}${fmtInt(n)}`;
}

/* ── Fabric Stock live fetch ────────────────────────────────
   services.ts already exports getFabricStockSummary() using the shared
   `api` instance — same auth as getDashboard() — so this is a normal,
   already-authenticated call.

   CONFIRMED SHAPE: the endpoint returns an ARRAY of grouped rows (one per
   Sort No + Construction), each carrying its own `total_meter` and
   `piece_count` — identical to the `summary` state populated in
   FabricStock.tsx. There is no single flat "totalStockMeter" field on the
   response itself; that number only exists on the Fabric Stock PAGE as a
   client-side SUM across all rows (Inward + Manual combined, since manual
   entries are merged into their matching Sort No group server-side).

   So to make this card match the Fabric Stock page exactly, we do the same
   sum here. This is checked FIRST. The old flat/nested single-object
   guessing (via findNumberByPattern) is kept only as a fallback in case the
   endpoint shape is ever changed to a single summary object — it no longer
   runs against arrays, so it can't silently grab one row's value again. */
async function fetchFabricStockSummary(): Promise<{
  totalStockMeter: number;
  piecesInStock: number;
  constructions: number;
  locations: number;
} | null> {
  try {
    const raw = await getFabricStockSummary();

    // Resolve to the actual array of rows, wherever it lives.
    const rows: FabricStockSummaryRow[] | null =
      (Array.isArray(raw) && raw) ||
      (Array.isArray(raw?.data) && raw.data) ||
      (Array.isArray(raw?.summary) && raw.summary) ||
      (Array.isArray(raw?.result) && raw.result) ||
      null;

    if (rows) {
      return {
        totalStockMeter: sumRows(rows, ['total_meter', 'totalMeter']),
        piecesInStock: sumRows(rows, ['piece_count', 'pieceCount']),
        constructions: rows.length,
        locations: countDistinct(rows, 'locations'),
      };
    }

    // Fallback: endpoint returned a single object instead of an array.
    const explicitKeys = [
      'totalStockMeter', 'total_stock_meter',
      'totalStockMeters', 'total_stock_meters',
      'totalMeter', 'total_meter', 'totalMeters', 'total_meters',
      'stockMeter', 'stock_meter', 'stockMeters', 'stock_meters',
      'totalStockMtr', 'total_stock_mtr', 'totalMtr', 'total_mtr',
      'TOTAL_STOCK_METER', 'totalStockMtrs', 'total_stock_mtrs',
    ];

    let totalStockMeter =
      pickMaybeNum(raw, explicitKeys) ??
      pickMaybeNum(raw?.data, explicitKeys) ??
      pickMaybeNum(raw?.summary, explicitKeys) ??
      pickMaybeNum(raw?.result, explicitKeys) ??
      pickMaybeNum(raw?.stats, explicitKeys);

    if (typeof totalStockMeter !== 'number') {
      totalStockMeter =
        findNumberByPattern(raw, ['stock', 'meter']) ??
        findNumberByPattern(raw, ['stock', 'mtr']) ??
        findNumberByPattern(raw, ['total', 'meter']);
    }

    return {
      totalStockMeter: totalStockMeter ?? 0,
      piecesInStock: pickNum(raw, ['piecesInStock', 'pieces_in_stock']),
      constructions: pickNum(raw, ['constructions']),
      locations: pickNum(raw, ['locations']),
    };
  } catch (err) {
    console.error(err);
    return null;
  }
}

/* ── Theme ──────────────────────────────────────────────── */
const GREEN = '#15803d';
const GREEN_SOFT = '#166534';

export default function DashboardHome() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [dashboardTrend, setDashboardTrend] = useState<Partial<Record<Period, TrendPoint[]>>>({});
  const [liveTrend, setLiveTrend] = useState<Partial<Record<Period, TrendPoint[]>>>({});
  const [liveOrderTrend, setLiveOrderTrend] = useState<Partial<Record<Period, TrendPoint[]>>>({});
  const [period, setPeriod] = useState<Period>('weekly');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [loading, setLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(false);

  // Live overrides for the three linked cards. undefined = "use getDashboard() value"
  const [fabricStockMeter, setFabricStockMeter] = useState<number | undefined>(undefined);
  const [yarnStockLive, setYarnStockLive] = useState<number | undefined>(undefined);
  const [customerCountLive, setCustomerCountLive] = useState<number | undefined>(undefined);

  const width = useWidth();
  const mountedRef = useRef(true);

  const isMobile = width < 480;
  const isTablet = width >= 480 && width < 1200;

  /* Fetch stat cards + order status (and dashboard-embedded trend, if any) */
  const fetchDashboard = () => {
    return getDashboard()
      .then((r: any) => {
        if (!mountedRef.current) return;
        const raw = r?.data || {};
        setStats(normalizeStats(raw));
        setDashboardTrend(normalizeTrendFromDashboard(raw));
      })
      .catch(console.error);
  };

  /* Fabric Stock → "In Production" */
  const fetchFabricStock = () => {
    fetchFabricStockSummary().then((data) => {
      if (!mountedRef.current || !data) return;
      setFabricStockMeter(
        PRODUCTION_METRIC === 'totalStockMeter' ? data.totalStockMeter : data.piecesInStock
      );
    });
  };

  /* Yarn Stock — confirmed via yarnStockService.getSummary() */
  const fetchYarnStock = () => {
    yarnStockService
      .getSummary()
      .then((result: any) => {
        if (!mountedRef.current) return;
        const val = pickMaybeNum(result?.stats ?? {}, ['total_kgs']);
        if (typeof val === 'number') setYarnStockLive(val);
      })
      .catch(console.error);
  };

  /* Total Customers — confirmed via getCustomers(), a raw axios GET */
  const fetchCustomers = () => {
    getCustomers()
      .then((r: any) => {
        if (!mountedRef.current) return;
        const raw = r?.data ?? r;
        if (Array.isArray(raw)) {
          setCustomerCountLive(raw.length);
        } else if (Array.isArray(raw?.data)) {
          setCustomerCountLive(raw.data.length);
        } else {
          const val = pickMaybeNum(raw, ['total', 'count', 'totalCustomers']);
          if (typeof val === 'number') setCustomerCountLive(val);
        }
      })
      .catch(console.error);
  };

  /* Production Overview chart → live Orders + Deliveries.
     Computes % completed per bucket for ALL THREE periods at once (cheap
     to do client-side once we have the two arrays), so switching the
     Weekly/Monthly/Yearly toggle is instant with no extra fetch. */
  const fetchOrdersDeliveryTrend = () => {
    if (typeof getOrdersFn !== 'function' || typeof getDeliveriesFn !== 'function') {
      // Already warned about this above at module load. Skip quietly here —
      // trend chain falls back to getProductionTrend / dashboardTrend / placeholder.
      return;
    }
    Promise.all([getOrdersFn(), getDeliveriesFn()])
      .then(([ordersRes, deliveriesRes]) => {
        if (!mountedRef.current) return;

        const orders: OrderRow[] = unwrapArray(ordersRes, ['orders']);
        const deliveries: DeliveryRow[] = unwrapArray(deliveriesRes, ['deliveries']);

        const deliveredOrderIds = new Set<string>();
        for (const delivery of deliveries) {
          const oid = pickStr(delivery, DELIVERY_ORDER_ID_KEYS);
          if (oid) deliveredOrderIds.add(oid);
        }

        // TEMP DEBUG — confirm this is reading your real field names, then
        // delete this block. See ⚠️ CONFIRM THIS note at top of file.
        if (orders.length > 0) {
          console.debug('ORDER TREND DEBUG — sample order:', orders[0]);
        }
        if (deliveries.length > 0) {
          console.debug('ORDER TREND DEBUG — sample delivery:', deliveries[0]);
        }
        console.debug('ORDER TREND DEBUG — delivered order id count:', deliveredOrderIds.size);

        setLiveOrderTrend({
          weekly: computeCompletionBuckets(orders, deliveredOrderIds, 'weekly'),
          monthly: computeCompletionBuckets(orders, deliveredOrderIds, 'monthly'),
          yearly: computeCompletionBuckets(orders, deliveredOrderIds, 'yearly'),
        });
      })
      .catch(console.error);
  };

  /* Optional dedicated live-trend endpoint (kept as a lower-priority
     fallback — see priority order in the header comment). Only runs if
     getProductionTrend actually exists on services.ts. */
  const fetchTrendForPeriod = (p: Period) => {
    if (typeof getProductionTrend !== 'function') return;
    setTrendLoading(true);
    getProductionTrend(p)
      .then((r: any) => {
        if (!mountedRef.current) return;
        const data = r?.data ?? r;
        if (isValidTrendArray(data)) {
          setLiveTrend((prev) => ({ ...prev, [p]: data }));
        }
      })
      .catch(console.error)
      .finally(() => {
        if (mountedRef.current) setTrendLoading(false);
      });
  };

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    Promise.all([
      fetchDashboard(),
      fetchFabricStock(),
      fetchYarnStock(),
      fetchCustomers(),
      fetchOrdersDeliveryTrend(),
    ]).finally(() => {
      if (mountedRef.current) setLoading(false);
    });

    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (REFRESH_INTERVAL_MS > 0) {
      intervalId = setInterval(() => {
        fetchDashboard();
        fetchFabricStock();
        fetchYarnStock();
        fetchCustomers();
        fetchOrdersDeliveryTrend();
      }, REFRESH_INTERVAL_MS);
    }
    return () => {
      mountedRef.current = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    fetchTrendForPeriod(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  /* Priority: live Orders+Deliveries completion rate > dedicated live-trend
     endpoint (if it exists) > embedded dashboard trend > placeholder */
  const trend: Record<Period, TrendPoint[]> = {
    weekly: liveOrderTrend.weekly || liveTrend.weekly || dashboardTrend.weekly || FALLBACK_TREND.weekly,
    monthly: liveOrderTrend.monthly || liveTrend.monthly || dashboardTrend.monthly || FALLBACK_TREND.monthly,
    yearly: liveOrderTrend.yearly || liveTrend.yearly || dashboardTrend.yearly || FALLBACK_TREND.yearly,
  };

  const primaryCards = useMemo(() => {
    if (!stats) return [];

    const inProductionValue =
      typeof fabricStockMeter === 'number'
        ? PRODUCTION_METRIC === 'totalStockMeter'
          ? fmtMeters(fabricStockMeter)
          : fmtInt(fabricStockMeter)
        : fmtInt(stats.inProduction);

    const yarnStockValue = `${fmtInt(typeof yarnStockLive === 'number' ? yarnStockLive : stats.yarnStock)} kg`;

    return [
      {
        title: 'Total Orders',
        value: fmtInt(stats.totalOrders),
        growth: stats.totalOrdersGrowth,
        icon: <Briefcase size={isMobile ? 18 : 20} />,
        iconColor: '#7c3aed',
        iconBg: '#ede9fe',
      },
      {
        title: 'In Production',
        value: inProductionValue,
        growth: stats.inProductionGrowth,
        icon: <Factory size={isMobile ? 18 : 20} />,
        iconColor: '#f97316',
        iconBg: '#ffedd5',
      },
      {
        title: 'Yarn Stock',
        value: yarnStockValue,
        growth: stats.yarnStockGrowth,
        icon: <Archive size={isMobile ? 18 : 20} />,
        iconColor: '#16a34a',
        iconBg: '#dcfce7',
      },
      {
        title: 'Pending Delivery',
        value: fmtInt(stats.pendingDelivery),
        growth: stats.pendingDeliveryGrowth,
        icon: <Truck size={isMobile ? 18 : 20} />,
        iconColor: '#f59e0b',
        iconBg: '#fef3c7',
      },
    ];
  }, [stats, isMobile, fabricStockMeter, yarnStockLive]);

  const secondaryCards = useMemo(() => {
    if (!stats) return [];
    const customersValue = fmtInt(typeof customerCountLive === 'number' ? customerCountLive : stats.totalCustomers);
    return [
      {
        title: 'Total Customers',
        value: customersValue,
        icon: <Users size={isMobile ? 16 : 18} />,
        iconColor: '#a855f7',
      },
      { title: 'Active Machines', value: fmtInt(stats.activeMachines), icon: <Cpu size={isMobile ? 16 : 18} />, iconColor: '#3b82f6' },
      { title: 'Revenue', value: fmtRevenue(stats.revenue), icon: <TrendingUp size={isMobile ? 16 : 18} />, iconColor: '#16a34a' },
      { title: 'Pending Tasks', value: fmtInt(stats.pendingTasks), icon: <Clock3 size={isMobile ? 16 : 18} />, iconColor: '#ef4444' },
    ];
  }, [stats, isMobile, customerCountLive]);

  const orderStatusData = useMemo(() => {
    if (!stats) return [];
    const { completed, inProgress, pending } = stats.orderStatus;
    return [
      { name: 'Completed', value: completed, color: '#16a34a' },
      { name: 'In Progress', value: inProgress, color: '#f59e0b' },
      { name: 'Pending', value: pending, color: '#3b82f6' },
    ];
  }, [stats]);

  const orderStatusTotal = stats?.totalOrders ?? 0;

  if (loading) {
    return (
      <div style={S.loaderWrap}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={S.loader} />
      </div>
    );
  }

  const barH = isMobile ? 200 : isTablet ? 240 : 260;
  const pieSize = isMobile ? 140 : isTablet ? 160 : 180;
  const pieOR = pieSize / 2;
  const pieIR = pieOR * 0.62;

  const renderChart = () => {
    const data = trend[period];
    const commonMargin = { top: 24, left: isMobile ? -20 : -8, right: 8 };

    if (chartType === 'line') {
      return (
        <LineChart data={data} margin={commonMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f5" vertical={false} />
          <Line
            type="monotone"
            dataKey="pct"
            stroke={GREEN}
            strokeWidth={3}
            dot={{ r: 4, fill: GREEN, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
            animationDuration={900}
          >
            <LabelList
              dataKey="pct"
              position="top"
              formatter={(v: number) => `${v}%`}
              style={{ fontSize: isMobile ? 11 : 13, fontWeight: 700, fill: '#374151' }}
            />
          </Line>
          <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }} />
        </LineChart>
      );
    }

    if (chartType === 'area') {
      return (
        <AreaChart data={data} margin={commonMargin}>
          <defs>
            <linearGradient id="dbxAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={GREEN} stopOpacity={0.35} />
              <stop offset="95%" stopColor={GREEN} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f5" vertical={false} />
          <Area
            type="monotone"
            dataKey="pct"
            stroke={GREEN}
            strokeWidth={3}
            fill="url(#dbxAreaFill)"
            animationDuration={900}
          >
            <LabelList
              dataKey="pct"
              position="top"
              formatter={(v: number) => `${v}%`}
              style={{ fontSize: isMobile ? 11 : 13, fontWeight: 700, fill: '#374151' }}
            />
          </Area>
          <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }} />
        </AreaChart>
      );
    }

    // default: bar
    return (
      <BarChart data={data} margin={commonMargin}>
        <Bar dataKey="pct" radius={[8, 8, 0, 0]} maxBarSize={56} animationDuration={900}>
          <LabelList
            dataKey="pct"
            position="top"
            formatter={(v: number) => `${v}%`}
            style={{ fontSize: isMobile ? 11 : 13, fontWeight: 700, fill: '#374151' }}
          />
          {data.map((point, idx) => {
            const isWeekend = period === 'weekly' && (point.label === 'Sat' || point.label === 'Sun');
            return <Cell key={idx} fill={isWeekend ? '#e5e7eb' : GREEN} />;
          })}
        </Bar>
        <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }} />
      </BarChart>
    );
  };

  return (
    <div style={S.page}>
      {/* ── Global responsive CSS ── */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        .dbx-card-grid {
          display: grid;
          gap: 14px;
          grid-template-columns: 1fr;
        }
        @media (min-width: 480px) {
          .dbx-card-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 1200px) {
          .dbx-card-grid { grid-template-columns: repeat(4, 1fr); gap: 16px; }
        }

        .dbx-primary-card {
          background: #fff;
          border: 1px solid #f1f3f5;
          border-radius: 16px;
          padding: 18px 18px 16px;
          box-shadow: 0 1px 3px rgba(16,24,40,0.04);
          position: relative;
          transition: box-shadow 0.15s, transform 0.15s;
        }
        .dbx-primary-card.dbx-clickable,
        .dbx-secondary-card.dbx-clickable {
          cursor: pointer;
        }
        .dbx-primary-card.dbx-clickable:hover,
        .dbx-secondary-card.dbx-clickable:hover {
          box-shadow: 0 4px 16px rgba(16,24,40,0.08);
          transform: translateY(-1px);
        }
        .dbx-secondary-card {
          background: #fff;
          border: 1px solid #f1f3f5;
          border-radius: 16px;
          padding: 16px 18px;
          box-shadow: 0 1px 3px rgba(16,24,40,0.04);
          display: flex;
          align-items: center;
          gap: 12px;
          position: relative;
          transition: box-shadow 0.15s, transform 0.15s;
        }

        .dbx-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
        }
        .dbx-card-title {
          font-size: 13px;
          color: #6b7280;
          font-weight: 500;
        }
        .dbx-plus-btn {
          width: 22px;
          height: 22px;
          border-radius: 7px;
          background: #f3f4f6;
          color: #9ca3af;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border: none;
          cursor: default;
        }
        .dbx-icon-badge {
          width: 40px;
          height: 40px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        @media (min-width: 1200px) {
          .dbx-icon-badge { width: 44px; height: 44px; }
        }
        .dbx-card-value {
          font-size: 24px;
          font-weight: 800;
          color: #111827;
          margin-top: 10px;
          line-height: 1;
        }
        @media (min-width: 1200px) {
          .dbx-card-value { font-size: 28px; }
        }
        .dbx-secondary-value {
          font-size: 19px;
          font-weight: 800;
          color: #111827;
          margin-top: 2px;
        }
        .dbx-card-growth {
          display: flex;
          align-items: center;
          gap: 3px;
          font-size: 12px;
          font-weight: 600;
          margin-top: 10px;
        }

        .dbx-bottom-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: 1fr;
        }
        @media (min-width: 992px) {
          .dbx-bottom-grid { grid-template-columns: 2fr 1fr; gap: 20px; }
        }

        .dbx-panel {
          background: #fff;
          border: 1px solid #f1f3f5;
          border-radius: 16px;
          padding: 18px;
          box-shadow: 0 1px 3px rgba(16,24,40,0.04);
          overflow: hidden;
        }
        .dbx-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }
        .dbx-panel-title {
          font-size: 16px;
          font-weight: 700;
          color: #111827;
          margin: 0;
        }
        .dbx-panel-header-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .dbx-period-toggle, .dbx-chart-toggle {
          display: flex;
          gap: 6px;
          background: transparent;
        }
        .dbx-period-btn {
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #6b7280;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .dbx-period-btn.active {
          background: ${GREEN};
          border-color: ${GREEN};
          color: #fff;
        }
        .dbx-chart-btn {
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #9ca3af;
          width: 30px;
          height: 30px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .dbx-chart-btn.active {
          background: #ecfdf3;
          border-color: ${GREEN};
          color: ${GREEN};
        }

        .dbx-pill-badge {
          background: ${GREEN};
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          padding: 7px 14px;
          border-radius: 999px;
        }

        .dbx-donut-wrap {
          position: relative;
          display: flex;
          justify-content: center;
        }
        .dbx-donut-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          pointer-events: none;
        }
        .dbx-donut-total {
          font-size: 20px;
          font-weight: 800;
          color: #111827;
          line-height: 1;
        }
        .dbx-donut-label {
          font-size: 11px;
          color: #9ca3af;
          margin-top: 2px;
        }

        .dbx-legend {
          margin-top: 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .dbx-legend-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
        }
        .dbx-legend-left {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #4b5563;
          font-weight: 500;
        }
        .dbx-legend-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .dbx-legend-value {
          font-weight: 700;
          color: #111827;
        }
      `}</style>

      {/* HEADER */}
      <div>
        <h1 style={S.title}>Dashboard</h1>
        <p style={S.subtitle}>Welcome to Textile Manufacturing ERP</p>
      </div>

      {/* PRIMARY STAT CARDS */}
      <div className="dbx-card-grid">
        {primaryCards.map((card: any, i) => (
          <motion.div
            key={card.title}
            className={`dbx-primary-card ${card.onClick ? 'dbx-clickable' : ''}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.4 }}
            onClick={card.onClick}
            role={card.onClick ? 'button' : undefined}
            tabIndex={card.onClick ? 0 : undefined}
          >
            <div className="dbx-card-top">
              <span className="dbx-card-title">{card.title}</span>
              <button className="dbx-plus-btn" tabIndex={-1} aria-hidden="true">
                <Plus size={13} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
              <div className="dbx-card-value">{card.value}</div>
              <div className="dbx-icon-badge" style={{ background: card.iconBg, color: card.iconColor }}>
                {card.icon}
              </div>
            </div>
            {typeof card.growth === 'number' && (
              <div
                className="dbx-card-growth"
                style={{ color: card.growth >= 0 ? '#16a34a' : '#ef4444' }}
              >
                {card.growth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {Math.abs(card.growth)}%
                <span style={{ color: '#9ca3af', fontWeight: 500, marginLeft: 2 }}>This Week</span>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* SECONDARY STAT CARDS */}
      <div className="dbx-card-grid">
        {secondaryCards.map((card: any, i) => (
          <motion.div
            key={card.title}
            className={`dbx-secondary-card ${card.onClick ? 'dbx-clickable' : ''}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 + i * 0.06, duration: 0.4 }}
            onClick={card.onClick}
            role={card.onClick ? 'button' : undefined}
            tabIndex={card.onClick ? 0 : undefined}
          >
            <span style={{ color: card.iconColor, display: 'flex' }}>{card.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="dbx-card-title">{card.title}</div>
              <div className="dbx-secondary-value">{card.value}</div>
            </div>
            <button
              className="dbx-plus-btn"
              style={{ position: 'absolute', top: 14, right: 14 }}
              tabIndex={-1}
              aria-hidden="true"
            >
              <Plus size={13} />
            </button>
          </motion.div>
        ))}
      </div>

      {/* PRODUCTION OVERVIEW + ORDER STATUS */}
      <div className="dbx-bottom-grid">
        {/* PRODUCTION OVERVIEW */}
        <motion.div
          className="dbx-panel"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="dbx-panel-header">
            <h3 className="dbx-panel-title">
              Production Overview{trendLoading ? ' •' : ''}
            </h3>
            <div className="dbx-panel-header-controls">
              <div className="dbx-chart-toggle">
                <button
                  className={`dbx-chart-btn ${chartType === 'bar' ? 'active' : ''}`}
                  onClick={() => setChartType('bar')}
                  title="Bar chart"
                >
                  <BarChart3 size={15} />
                </button>
                <button
                  className={`dbx-chart-btn ${chartType === 'line' ? 'active' : ''}`}
                  onClick={() => setChartType('line')}
                  title="Line chart"
                >
                  <LineChartIcon size={15} />
                </button>
                <button
                  className={`dbx-chart-btn ${chartType === 'area' ? 'active' : ''}`}
                  onClick={() => setChartType('area')}
                  title="Area chart"
                >
                  <AreaChartIcon size={15} />
                </button>
              </div>
              <div className="dbx-period-toggle">
                {(['weekly', 'monthly', 'yearly'] as Period[]).map((p) => (
                  <button
                    key={p}
                    className={`dbx-period-btn ${period === p ? 'active' : ''}`}
                    onClick={() => setPeriod(p)}
                  >
                    {p === 'weekly' ? 'Weekly' : p === 'monthly' ? 'Monthly' : 'Yearly'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${period}-${chartType}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <ResponsiveContainer width="100%" height={barH}>
                {renderChart()}
              </ResponsiveContainer>
            </motion.div>
          </AnimatePresence>
          {/* X-axis labels rendered separately so they line up under fixed-width bars cleanly across breakpoints */}
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 4 }}>
            {trend[period].map((point) => (
              <span key={point.label} style={{ fontSize: isMobile ? 10 : 12, color: '#9ca3af', fontWeight: 500 }}>
                {point.label}
              </span>
            ))}
          </div>
        </motion.div>

        {/* ORDER STATUS */}
        <motion.div
          className="dbx-panel"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36 }}
        >
          <div className="dbx-panel-header">
            <h3 className="dbx-panel-title">Order Status</h3>
            <span className="dbx-pill-badge">This Month</span>
          </div>

          <div className="dbx-donut-wrap">
            <ResponsiveContainer width="100%" height={pieSize + 20}>
              <PieChart>
                <Pie
                  data={orderStatusData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={pieOR}
                  innerRadius={pieIR}
                  paddingAngle={3}
                  startAngle={90}
                  endAngle={-270}
                  animationDuration={1100}
                >
                  {orderStatusData.map((d, idx) => (
                    <Cell key={idx} fill={d.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="dbx-donut-center">
              <div className="dbx-donut-total">{fmtInt(orderStatusTotal)}</div>
              <div className="dbx-donut-label">Total</div>
            </div>
          </div>

          <div className="dbx-legend">
            {orderStatusData.map((d) => (
              <div className="dbx-legend-row" key={d.name}>
                <span className="dbx-legend-left">
                  <span className="dbx-legend-dot" style={{ background: d.color }} />
                  {d.name}
                </span>
                <span className="dbx-legend-value">{fmtInt(d.value)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/* ── Static styles ──────────────────────────────────────── */
const S: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    width: '100%',
    boxSizing: 'border-box',
  },
  title: {
    fontSize: 24,
    fontWeight: 800,
    color: '#111827',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: '4px 0 0',
    color: '#6b7280',
    fontSize: 14,
  },
  loaderWrap: {
    height: '60vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: '4px solid #e5e7eb',
    borderTop: `4px solid ${GREEN_SOFT}`,
    animation: 'spin 0.9s linear infinite',
  },
};