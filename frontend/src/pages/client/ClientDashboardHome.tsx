// frontend/src/pages/client/ClientDashboardHome.tsx

import { useEffect, useState } from 'react';
import { getOrderBookings, getSampleRequests } from '../../api/services';

const statusColor = (s: string) =>
  ({
    pending:   '#f59e0b',
    booked:    '#3b82f6',
    completed: '#10b981',
    cancelled: '#ef4444',
  } as Record<string, string>)[s] || '#6b7280';

// ── Decode JWT without any library ───────────────────────────────────────────
function decodeJwt(token: string): Record<string, any> {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

// ── Read logged-in user ───────────────────────────────────────────────────────
// Tries localStorage 'user' first.
// If customer_id is missing (old token), decodes the JWT directly as fallback.
function getLoggedInUser() {
  try {
    const user  = JSON.parse(localStorage.getItem('user') || '{}');
    const token = localStorage.getItem('token') || '';

    // If customer_id already exists in user object, use it directly
    if (user.customer_id) return user;

    // Fallback: decode JWT and merge customer_id from token payload
    if (token) {
      const payload = decodeJwt(token);
      if (payload.customer_id) {
        const merged = { ...user, ...payload };
        // Patch localStorage so next render doesn't need to decode again
        localStorage.setItem('user', JSON.stringify(merged));
        return merged;
      }
    }

    return user;
  } catch {
    return {};
  }
}

export default function ClientDashboardHome() {
  const [orders,  setOrders]  = useState<any[]>([]);
  const [samples, setSamples] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const user         = getLoggedInUser();
  const customerId   = user.customer_id;
  const customerName = user.name || user.email || 'Customer';

  useEffect(() => {
    if (!customerId) {
      setLoading(false);
      return;
    }

    Promise.all([
      getOrderBookings(customerId),
      getSampleRequests(customerId),
    ])
      .then(([o, s]) => {
        setOrders(Array.isArray(o.data) ? o.data : []);
        setSamples(Array.isArray(s.data) ? s.data : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <p style={{ color: '#888', padding: 24 }}>Loading...</p>;

  if (!customerId) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
        <p>Unable to identify your customer account. Please log out and log in again.</p>
      </div>
    );
  }

  const cards = [
    { label: 'Total Orders',     value: orders.length,                                         color: '#4f46e5' },
    { label: 'Sample Requests',  value: samples.length,                                        color: '#7c3aed' },
    { label: 'Completed Orders', value: orders.filter((o) => o.status === 'completed').length, color: '#10b981' },
    { label: 'Pending Orders',   value: orders.filter((o) => o.status === 'pending').length,   color: '#f59e0b' },
  ];

  return (
    <div>
      {/* ── Customer identity banner ── */}
      <div style={S.customerBanner}>
        <div style={S.customerAvatar}>
          {customerName.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={S.customerName}>{customerName}</div>
          <div style={S.customerId}>Customer ID: {customerId}</div>
        </div>
        <span style={S.scopeTag}>📌 Showing your data only</span>
      </div>

      {/* ── Stat Cards ── */}
      <div style={S.cardsWrap}>
        {cards.map((c) => (
          <div key={c.label} style={S.card}>
            <div style={{ ...S.cardAccent, background: c.color }} />
            <div style={S.cardBody}>
              <p style={S.cardLabel}>{c.label}</p>
              <p style={{ ...S.cardValue, color: c.color }}>{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Recent Orders ── */}
      <div style={S.section}>
        <h3 style={S.sectionTitle}>Recent Orders</h3>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {['#', 'Fabric Type', 'Qty', 'Delivery Date', 'Status'].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 5).length === 0 ? (
                <tr>
                  <td colSpan={5} style={S.empty}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
                    <div>No orders found for your account</div>
                  </td>
                </tr>
              ) : orders.slice(0, 5).map((o, i) => (
                <tr key={o.id ?? i} style={i % 2 !== 0 ? S.altRow : {}}>
                  <td style={{ ...S.td, color: '#94a3b8' }}>{i + 1}</td>
                  <td style={S.td}>{o.fabric_type || '—'}</td>
                  <td style={S.td}>{o.quantity ?? '—'}</td>
                  <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                    {o.delivery_date?.slice(0, 10) || '—'}
                  </td>
                  <td style={S.td}>
                    <span style={{ ...S.badge, background: statusColor(o.status) }}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Recent Sample Requests ── */}
      <div style={{ ...S.section, marginTop: 24 }}>
        <h3 style={S.sectionTitle}>Recent Sample Requests</h3>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {['#', 'Request Code', 'Fabric Code', 'Color', 'Qty (m)', 'Status'].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {samples.slice(0, 5).length === 0 ? (
                <tr>
                  <td colSpan={6} style={S.empty}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
                    <div>No sample requests found for your account</div>
                  </td>
                </tr>
              ) : samples.slice(0, 5).map((s, i) => (
                <tr key={s.id ?? i} style={i % 2 !== 0 ? S.altRow : {}}>
                  <td style={{ ...S.td, color: '#94a3b8' }}>{i + 1}</td>
                  <td style={{ ...S.td, fontWeight: 700 }}>{s.request_code || '—'}</td>
                  <td style={S.td}>{s.fabric_code || s.fabric_type || '—'}</td>
                  <td style={S.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 12, height: 12, borderRadius: '50%',
                        background: s.color?.toLowerCase() || '#e2e8f0',
                        border: '1px solid rgba(0,0,0,0.1)',
                      }} />
                      {s.color || '—'}
                    </div>
                  </td>
                  <td style={S.td}>{s.quantity_meters ?? '—'} m</td>
                  <td style={S.td}>
                    <span style={{
                      ...S.badge,
                      background: s.status === 'approved' ? '#10b981'
                        : s.status === 'rejected' ? '#ef4444'
                        : s.status === 'collected' ? '#0d9488'
                        : '#f59e0b',
                    }}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  customerBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: 'linear-gradient(135deg, #ede9fe 0%, #dbeafe 100%)',
    border: '1px solid #c4b5fd',
    borderRadius: 14,
    padding: '14px 20px',
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  customerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 11,
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: 18,
    flexShrink: 0,
    boxShadow: '0 4px 12px rgba(79,70,229,0.35)',
  },
  customerName: {
    fontSize: 15,
    fontWeight: 800,
    color: '#1e1b4b',
  },
  customerId: {
    fontSize: 12,
    color: '#6d28d9',
    marginTop: 2,
    fontWeight: 500,
  },
  scopeTag: {
    marginLeft: 'auto',
    background: '#fff',
    border: '1px solid #c4b5fd',
    borderRadius: 20,
    padding: '4px 14px',
    fontSize: 12,
    fontWeight: 700,
    color: '#4f46e5',
  },
  cardsWrap: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 20,
    marginBottom: 32,
  },
  card: {
    background: '#fff',
    borderRadius: 14,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  cardAccent: { height: 4, width: '100%' },
  cardBody: { padding: '20px 24px' },
  cardLabel: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: 500,
    margin: 0,
  },
  cardValue: {
    fontSize: 36,
    fontWeight: 800,
    margin: '8px 0 0',
  },
  section: { marginTop: 8 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#111827',
    marginBottom: 14,
  },
  tableWrap: {
    background: '#fff',
    borderRadius: 14,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    background: '#f9fafb',
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: 12,
    color: '#6b7280',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderBottom: '1px solid #f3f4f6',
  },
  td: {
    padding: '12px 16px',
    fontSize: 14,
    color: '#374151',
    borderTop: '1px solid #f3f4f6',
  },
  altRow: { background: '#f9fafb' },
  badge: {
    color: '#fff',
    borderRadius: 12,
    padding: '3px 10px',
    fontSize: 12,
    fontWeight: 600,
  },
  empty: {
    padding: '40px',
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 14,
  },
};