/*
  PROFESSIONAL RESPONSIVE DASHBOARD
  Mobile (320px) → Tablet (768px) → Laptop (1024px) → Desktop (1440px+)
  All layout via CSS media queries injected via <style> tag
*/

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';

import {
  ArrowUpRight,
  PackageCheck,
  Truck,
  FlaskConical,
  Droplets,
  Clock3,
  Activity,
  TrendingUp,
} from 'lucide-react';

import { getDashboard } from '../../api/services';

interface Stats {
  inward: number;
  dyeing: number;
  dispatch: number;
  orders: number;
  samples: number;
  pendingInward: number;
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

const COLORS = ['#4f46e5', '#f59e0b', '#10b981', '#ec4899', '#06b6d4'];

export default function DashboardHome() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const width = useWidth();

  const isMobile  = width < 576;
  const isTablet  = width >= 576 && width < 992;
  const isDesktop = width >= 992;

  useEffect(() => {
    getDashboard()
      .then((r) => setStats(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { title: 'Total Inward', value: stats?.inward    || 0, icon: <PackageCheck size={isMobile ? 22 : 26} />, color: '#4f46e5', bg: '#eef2ff', growth: '+12%' },
    { title: 'Orders',       value: stats?.orders    || 0, icon: <Activity      size={isMobile ? 22 : 26} />, color: '#f59e0b', bg: '#fffbeb', growth: '+8%'  },
    { title: 'Dispatch',     value: stats?.dispatch  || 0, icon: <Truck         size={isMobile ? 22 : 26} />, color: '#10b981', bg: '#ecfdf5', growth: '+18%' },
    { title: 'Samples',      value: stats?.samples   || 0, icon: <FlaskConical  size={isMobile ? 22 : 26} />, color: '#ec4899', bg: '#fdf2f8', growth: '+6%'  },
  ];

  const chartData = [
    { name: 'Inward',   value: stats?.inward   || 0 },
    { name: 'Orders',   value: stats?.orders   || 0 },
    { name: 'Dispatch', value: stats?.dispatch || 0 },
    { name: 'Samples',  value: stats?.samples  || 0 },
    { name: 'Dyeing',   value: stats?.dyeing   || 0 },
  ];

  const productionTrend = [
    { day: 'Mon', qty: 24 },
    { day: 'Tue', qty: 38 },
    { day: 'Wed', qty: 42 },
    { day: 'Thu', qty: 55 },
    { day: 'Fri', qty: 68 },
    { day: 'Sat', qty: 49 },
  ];

  if (loading) {
    return (
      <div style={S.loaderWrap}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={S.loader} />
      </div>
    );
  }

  /* ── Chart heights per breakpoint ── */
  const barH  = isMobile ? 220 : isTablet ? 280 : 320;
  const pieH  = isMobile ? 220 : isTablet ? 260 : 300;
  const areaH = isMobile ? 180 : isTablet ? 220 : 260;
  const pieOR = isMobile ? 70  : isTablet ? 90  : 110;
  const pieIR = isMobile ? 40  : isTablet ? 52  : 65;

  return (
    <div style={S.page}>
      {/* ── Global responsive CSS ── */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

        /* CARD GRID */
        .dash-card-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(2, 1fr);
        }
        @media (max-width: 480px) {
          .dash-card-grid { grid-template-columns: 1fr; gap: 12px; }
        }
        @media (min-width: 1200px) {
          .dash-card-grid { grid-template-columns: repeat(4, 1fr); gap: 20px; }
        }

        /* CHART GRID */
        .dash-chart-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: 1fr;
        }
        @media (min-width: 900px) {
          .dash-chart-grid { grid-template-columns: 1fr 1fr; gap: 20px; }
        }

        /* BOTTOM GRID */
        .dash-bottom-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: 1fr;
        }
        @media (min-width: 768px) {
          .dash-bottom-grid { grid-template-columns: 1fr 1fr; gap: 20px; }
        }

        /* CARD inner */
        .dash-card {
          border-radius: 20px;
          padding: 18px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.07);
          transition: transform 0.25s, box-shadow 0.25s;
          position: relative;
          overflow: hidden;
        }
        @media (min-width: 576px) {
          .dash-card { padding: 20px; border-radius: 22px; gap: 14px; }
        }
        @media (min-width: 992px) {
          .dash-card { padding: 24px; border-radius: 24px; gap: 16px; }
        }
        .dash-card:hover { transform: translateY(-5px); box-shadow: 0 14px 40px rgba(0,0,0,0.10); }

        /* CARD value */
        .dash-card-value {
          font-size: 26px;
          font-weight: 800;
          margin-top: 4px;
          color: #111827;
          line-height: 1;
        }
        @media (min-width: 576px) { .dash-card-value { font-size: 30px; } }
        @media (min-width: 992px) { .dash-card-value { font-size: 36px; } }

        /* CARD icon wrap */
        .dash-icon-wrap {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          flex-shrink: 0;
        }
        @media (min-width: 576px) { .dash-icon-wrap { width: 54px; height: 54px; border-radius: 16px; } }
        @media (min-width: 992px) { .dash-icon-wrap { width: 60px; height: 60px; border-radius: 18px; } }

        /* PAGE TITLE */
        .dash-page-title {
          font-size: 22px;
          font-weight: 800;
          color: #111827;
          margin: 0;
          letter-spacing: -0.03em;
        }
        @media (min-width: 576px) { .dash-page-title { font-size: 26px; } }
        @media (min-width: 992px) { .dash-page-title { font-size: 32px; } }

        /* CHART CARD */
        .dash-chart-card {
          background: #fff;
          border-radius: 20px;
          padding: 16px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.05);
          overflow: hidden;
        }
        @media (min-width: 576px) { .dash-chart-card { padding: 20px; border-radius: 22px; } }
        @media (min-width: 992px) { .dash-chart-card { padding: 24px; border-radius: 24px; } }

        /* ACTIVITY CARD */
        .dash-activity-card {
          background: #fff;
          border-radius: 20px;
          padding: 16px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.05);
        }
        @media (min-width: 576px) { .dash-activity-card { padding: 20px; border-radius: 22px; } }
        @media (min-width: 992px) { .dash-activity-card { padding: 24px; border-radius: 24px; } }

        /* STATUS VALUE */
        .dash-status-value {
          font-size: 24px;
          font-weight: 800;
          margin-top: 4px;
          color: #111827;
        }
        @media (min-width: 576px) { .dash-status-value { font-size: 28px; } }

        /* AREA FULL-WIDTH CARD */
        .dash-area-card {
          background: #fff;
          border-radius: 20px;
          padding: 16px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.05);
          overflow: hidden;
        }
        @media (min-width: 576px) { .dash-area-card { padding: 20px; border-radius: 22px; } }
        @media (min-width: 992px) { .dash-area-card { padding: 24px; border-radius: 24px; } }

        /* TOP SECTION */
        .dash-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }

        /* LIVE badge */
        .dash-live {
          display: flex;
          align-items: center;
          gap: 7px;
          background: #ecfdf5;
          color: #10b981;
          padding: 8px 14px;
          border-radius: 999px;
          font-weight: 600;
          font-size: 13px;
        }
        @media (min-width: 576px) { .dash-live { font-size: 14px; padding: 10px 16px; } }

        /* Pie legend */
        .dash-pie-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 16px;
          margin-top: 12px;
          justify-content: center;
        }
        .dash-pie-legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #6b7280;
          font-weight: 500;
        }
        @media (min-width: 576px) { .dash-pie-legend-item { font-size: 13px; } }
      `}</style>

      {/* TOP ROW */}
      <div className="dash-top">
        <div>
          <h1 className="dash-page-title">Production Analytics</h1>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: isMobile ? 13 : 15 }}>
            Real-time ERP workflow overview
          </p>
        </div>
        <div className="dash-live">
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite', display: 'inline-block' }} />
          Live Data
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="dash-card-grid">
        {cards.map((card, i) => (
          <motion.div
            key={card.title}
            className="dash-card"
            style={{ background: card.bg }}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.45 }}
          >
            {/* decorative circle */}
            <div style={{
              position: 'absolute', top: -24, right: -24,
              width: 90, height: 90, borderRadius: '50%',
              background: card.color, opacity: 0.08,
              pointerEvents: 'none',
            }} />
            <div className="dash-icon-wrap" style={{ background: card.color }}>
              {card.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#6b7280', fontSize: isMobile ? 12 : 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {card.title}
              </div>
              <div className="dash-card-value">{card.value}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: card.color, fontWeight: 700, fontSize: isMobile ? 12 : 14, flexShrink: 0 }}>
              <ArrowUpRight size={isMobile ? 13 : 15} />
              {card.growth}
            </div>
          </motion.div>
        ))}
      </div>

      {/* PRODUCTION TREND — full width */}
      <motion.div
        className="dash-area-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div style={S.chartHeader}>
          <div>
            <h3 style={{ ...S.chartTitle, fontSize: isMobile ? 15 : 18 }}>Production Trend</h3>
            <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: 12 }}>Weekly output (units)</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0fdf4', color: '#10b981', padding: '5px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600 }}>
            <TrendingUp size={14} /> +18% week
          </div>
        </div>
        <ResponsiveContainer width="100%" height={areaH}>
          <AreaChart data={productionTrend}>
            <defs>
              <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#4f46e5" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="day" tick={{ fontSize: isMobile ? 11 : 13 }} />
            <YAxis tick={{ fontSize: isMobile ? 11 : 13 }} width={isMobile ? 28 : 36} />
            <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }} />
            <Area
              type="monotone"
              dataKey="qty"
              stroke="#4f46e5"
              strokeWidth={3}
              fill="url(#trendGrad)"
              dot={{ r: 5, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 7 }}
              animationDuration={1800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>

      {/* BAR + PIE CHARTS */}
      <div className="dash-chart-grid">
        {/* BAR */}
        <motion.div
          className="dash-chart-card"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.35 }}
        >
          <div style={S.chartHeader}>
            <h3 style={{ ...S.chartTitle, fontSize: isMobile ? 15 : 18 }}>Workflow Statistics</h3>
            <span style={S.badge}>Weekly</span>
          </div>
          <ResponsiveContainer width="100%" height={barH}>
            <BarChart data={chartData} margin={{ left: isMobile ? -18 : 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: isMobile ? 10 : 13 }} />
              <YAxis tick={{ fontSize: isMobile ? 10 : 13 }} width={isMobile ? 28 : 36} />
              <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} animationDuration={1600}>
                {chartData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* PIE */}
        <motion.div
          className="dash-chart-card"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div style={S.chartHeader}>
            <h3 style={{ ...S.chartTitle, fontSize: isMobile ? 15 : 18 }}>Process Distribution</h3>
            <span style={{ ...S.badge, background: '#ecfdf5', color: '#10b981' }}>Live</span>
          </div>
          <ResponsiveContainer width="100%" height={pieH}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                outerRadius={pieOR}
                innerRadius={pieIR}
                paddingAngle={3}
                animationDuration={1700}
              >
                {chartData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }} />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="dash-pie-legend">
            {chartData.map((d, idx) => (
              <div key={d.name} className="dash-pie-legend-item">
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[idx], display: 'inline-block', flexShrink: 0 }} />
                {d.name}
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* BOTTOM: ACTIVITY + STATUS */}
      <div className="dash-bottom-grid">
        {/* RECENT ACTIVITY */}
        <motion.div
          className="dash-activity-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <div style={{ ...S.chartHeader, marginBottom: 4 }}>
            <h3 style={{ ...S.chartTitle, fontSize: isMobile ? 15 : 18 }}>Recent Activity</h3>
            <Clock3 size={18} color="#9ca3af" />
          </div>
          {[
            { icon: '📦', text: 'New inward fabric received',  time: '2 mins ago'  },
            { icon: '🎨', text: 'Dyeing process updated',       time: '12 mins ago' },
            { icon: '🚚', text: 'Dispatch completed',           time: '28 mins ago' },
            { icon: '🧪', text: 'Sample request approved',      time: '1 hour ago'  },
          ].map((item) => (
            <ActivityItem key={item.text} {...item} isMobile={isMobile} />
          ))}
        </motion.div>

        {/* WORKFLOW STATUS */}
        <motion.div
          className="dash-activity-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <div style={{ ...S.chartHeader, marginBottom: 4 }}>
            <h3 style={{ ...S.chartTitle, fontSize: isMobile ? 15 : 18 }}>Workflow Status</h3>
            <Droplets size={18} color="#06b6d4" />
          </div>
          <StatusItem title="Pending Inward"    value={stats?.pendingInward || 0} color="#f59e0b" total={120} />
          <StatusItem title="Dyeing Active"     value={stats?.dyeing        || 0} color="#06b6d4" total={80}  />
          <StatusItem title="Completed Dispatch" value={stats?.dispatch      || 0} color="#10b981" total={100} />
        </motion.div>
      </div>
    </div>
  );
}

/* ── Activity Item ──────────────────────────────────────── */
function ActivityItem({
  icon, text, time, isMobile,
}: { icon: string; text: string; time: string; isMobile: boolean }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: isMobile ? 10 : 14,
      padding: isMobile ? '11px 0' : '14px 0',
      borderBottom: '1px solid #f3f4f6',
    }}>
      <div style={{
        width:  isMobile ? 36 : 44,
        height: isMobile ? 36 : 44,
        borderRadius: 12,
        background: '#f3f4f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: isMobile ? 16 : 18,
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: '#111827', fontSize: isMobile ? 13 : 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {text}
        </div>
        <div style={{ fontSize: isMobile ? 11 : 13, color: '#9ca3af', marginTop: 3 }}>
          {time}
        </div>
      </div>
    </div>
  );
}

/* ── Status Item with progress bar ─────────────────────── */
function StatusItem({
  title, value, color, total,
}: { title: string; value: number; color: string; total: number }) {
  const pct = Math.min(100, total > 0 ? Math.round((value / total) * 100) : 0);
  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
        <div>
          <div style={{ color: '#6b7280', fontSize: 13, fontWeight: 500 }}>{title}</div>
          <div className="dash-status-value">{value}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 0 3px ${color}30` }} />
          <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{pct}%</span>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{ height: 6, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          style={{ height: '100%', borderRadius: 999, background: color }}
        />
      </div>
    </div>
  );
}

/* ── Static styles ──────────────────────────────────────── */
const S: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    width: '100%',
    boxSizing: 'border-box',
  },
  loaderWrap: {
    height: '60vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #4f46e5',
    animation: 'spin 0.9s linear infinite',
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 10,
    flexWrap: 'wrap',
  },
  chartTitle: {
    fontWeight: 700,
    color: '#111827',
    margin: 0,
  },
  badge: {
    background: '#f3f4f6',
    padding: '5px 12px',
    borderRadius: 999,
    fontSize: 12,
    color: '#6b7280',
    fontWeight: 600,
    flexShrink: 0,
  },
};