/*
  DASHBOARD — "Textile Manufacturing ERP" theme (matches design reference)
  Mobile (320px) → Tablet (768px) → Laptop (1024px) → Desktop (1440px+)
  All layout via CSS media queries injected via <style> tag.

  LIVE DATA CONTRACT
  -------------------
  This still calls the existing getDashboard() endpoint. Field names are
  resolved defensively (multiple candidate keys tried per metric, same
  pattern used elsewhere in FabricFlow) so this won't break if the backend
  already returns the old shape (inward/dyeing/dispatch/orders/samples/
  pendingInward). For the new cards to show real numbers instead of 0,
  add these to whatever the /api/dashboard handler returns (any of the
  candidate names below work):

    totalOrders        (fallback: orders)
    totalOrdersGrowth   number, e.g. 12.5  → renders "+12.5%"
    inProduction        (fallback: dyeing)
    inProductionGrowth
    yarnStock           number, kg
    yarnStockGrowth
    pendingDelivery      (fallback: dispatch is NOT used — different meaning)
    pendingDeliveryGrowth
    totalCustomers
    activeMachines
    revenue              raw number, e.g. 2400000 → renders "₹2.4M"
    pendingTasks         (fallback: samples)
    orderStatus: { completed, inProgress, pending }   // donut breakdown

  Growth fields are optional — if omitted, the card just won't show a
  growth row instead of showing a fake number.

  Production Overview trend (Weekly/Monthly/Yearly bars) doesn't have a
  backend endpoint yet, so it currently renders structured placeholder
  data per period. If the backend later returns
    raw.productionTrend = { weekly: [...], monthly: [...], yearly: [...] }
  (each entry `{ label: string; pct: number }`), it's used automatically
  instead of the placeholder — see normalizeTrend() below.
*/

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LabelList,
  PieChart,
  Pie,
  Tooltip,
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
} from 'lucide-react';

import { getDashboard } from '../../api/services';

/* ── Currency — Indian textile ERP, change to '$' if you want an exact
   match to the design mock (which used $) ── */
const CURRENCY_SYMBOL = '₹';

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

/* ── Placeholder trend data (used until a real trend endpoint exists) ── */
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

function normalizeTrend(raw: any): Record<Period, TrendPoint[]> {
  const t = raw?.productionTrend || raw?.production_trend;
  if (!t) return FALLBACK_TREND;
  const ok = (arr: any) =>
    Array.isArray(arr) && arr.every((p) => typeof p?.pct === 'number' && typeof p?.label === 'string');
  return {
    weekly: ok(t.weekly) ? t.weekly : FALLBACK_TREND.weekly,
    monthly: ok(t.monthly) ? t.monthly : FALLBACK_TREND.monthly,
    yearly: ok(t.yearly) ? t.yearly : FALLBACK_TREND.yearly,
  };
}

/* ── Formatting helpers ────────────────────────────────── */
function fmtInt(n: number) {
  return n.toLocaleString('en-US');
}

function fmtRevenue(n: number) {
  if (n >= 1_000_000) return `${CURRENCY_SYMBOL}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${CURRENCY_SYMBOL}${(n / 1_000).toFixed(1)}K`;
  return `${CURRENCY_SYMBOL}${fmtInt(n)}`;
}

/* ── Theme ──────────────────────────────────────────────── */
const GREEN = '#15803d';
const GREEN_SOFT = '#166534';

export default function DashboardHome() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [trend, setTrend] = useState<Record<Period, TrendPoint[]>>(FALLBACK_TREND);
  const [period, setPeriod] = useState<Period>('weekly');
  const [loading, setLoading] = useState(true);
  const width = useWidth();

  const isMobile = width < 480;
  const isTablet = width >= 480 && width < 1200;

  useEffect(() => {
    getDashboard()
      .then((r) => {
        const raw = r?.data || {};
        setStats(normalizeStats(raw));
        setTrend(normalizeTrend(raw));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const primaryCards = useMemo(() => {
    if (!stats) return [];
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
        value: fmtInt(stats.inProduction),
        growth: stats.inProductionGrowth,
        icon: <Factory size={isMobile ? 18 : 20} />,
        iconColor: '#f97316',
        iconBg: '#ffedd5',
      },
      {
        title: 'Yarn Stock',
        value: `${fmtInt(stats.yarnStock)} kg`,
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
  }, [stats, isMobile]);

  const secondaryCards = useMemo(() => {
    if (!stats) return [];
    return [
      { title: 'Total Customers', value: fmtInt(stats.totalCustomers), icon: <Users size={isMobile ? 16 : 18} />, iconColor: '#a855f7' },
      { title: 'Active Machines', value: fmtInt(stats.activeMachines), icon: <Cpu size={isMobile ? 16 : 18} />, iconColor: '#3b82f6' },
      { title: 'Revenue', value: fmtRevenue(stats.revenue), icon: <TrendingUp size={isMobile ? 16 : 18} />, iconColor: '#16a34a' },
      { title: 'Pending Tasks', value: fmtInt(stats.pendingTasks), icon: <Clock3 size={isMobile ? 16 : 18} />, iconColor: '#ef4444' },
    ];
  }, [stats, isMobile]);

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

        .dbx-period-toggle {
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
        {primaryCards.map((card, i) => (
          <motion.div
            key={card.title}
            className="dbx-primary-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.4 }}
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
        {secondaryCards.map((card, i) => (
          <motion.div
            key={card.title}
            className="dbx-secondary-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 + i * 0.06, duration: 0.4 }}
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
            <h3 className="dbx-panel-title">Production Overview</h3>
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
          <AnimatePresence mode="wait">
            <motion.div
              key={period}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <ResponsiveContainer width="100%" height={barH}>
                <BarChart data={trend[period]} margin={{ top: 24, left: isMobile ? -20 : -8 }}>
                  <Bar dataKey="pct" radius={[8, 8, 0, 0]} maxBarSize={56} animationDuration={900}>
                    <LabelList
                      dataKey="pct"
                      position="top"
                      formatter={(v: number) => `${v}%`}
                      style={{ fontSize: isMobile ? 11 : 13, fontWeight: 700, fill: '#374151' }}
                    />
                    {trend[period].map((point, idx) => {
                      const isWeekend =
                        period === 'weekly' && (point.label === 'Sat' || point.label === 'Sun');
                      return (
                        <Cell key={idx} fill={isWeekend ? '#e5e7eb' : GREEN} />
                      );
                    })}
                  </Bar>
                </BarChart>
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