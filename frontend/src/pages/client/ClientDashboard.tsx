// frontend/src/pages/client/ClientDashboard.tsx
// UPDATES:
//   1. NotificationBell — live data from GET /notifications, unread badge,
//      mark-all-read, per-notification mark-read, deep-link icon routing.
//   2. Profile dropdown → "My Profile" now navigates to /client/profile.
//   3. Avatar uses profile.avatar_url if available.
//   4. Polling every 30 s for new notifications in the background.

import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import {
  Menu,
  X,
  LayoutDashboard,
  FlaskConical,
  ClipboardList,
  LogOut,
  User,
  ChevronRight,
  Settings,
  HelpCircle,
  Home,
  Bell,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  CSSProperties,
} from 'react';

import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';

/* ── Breakpoints ─────────────────────────────────────────── */
const BP = { mobile: 576, tablet: 768, desktop: 992 };

/* ── Nav types ───────────────────────────────────────────── */
interface NavItem { path: string; label: string; icon: React.ReactNode; }

/* ── Notification type ───────────────────────────────────── */
interface AppNotification {
  id: number;
  title: string;
  message: string;
  type: string;            // 'sample_new' | 'sample_status' | 'order_new' | 'order_status' | 'chat_message' | 'report_ready' | 'info' | 'warning'
  is_read: boolean;
  created_at: string;
  sample_request_id?: number | null;
  order_id?: number | null;
}

/* ── Nav config ─────────────────────────────────────────── */
const navItems: NavItem[] = [
  { path: '/client/samples', label: 'Sample Requests', icon: <FlaskConical size={14} /> },
  { path: '/client/orders',  label: 'My Orders',       icon: <ClipboardList size={14} /> },
];

/* ── Type → icon/color map ───────────────────────────────── */
const NOTIF_META: Record<string, { icon: string; color: string; bg: string; dot: string }> = {
  sample_new:    { icon: '🧵', color: '#7c3aed', bg: '#ede9fe', dot: '#8b5cf6' },
  sample_status: { icon: '🔄', color: '#1d4ed8', bg: '#dbeafe', dot: '#3b82f6' },
  order_new:     { icon: '📦', color: '#065f46', bg: '#d1fae5', dot: '#10b981' },
  order_status:  { icon: '🚚', color: '#0f6e56', bg: '#ccfbf1', dot: '#0d9488' },
  chat_message:  { icon: '💬', color: '#d97706', bg: '#fef3c7', dot: '#f59e0b' },
  report_ready:  { icon: '📋', color: '#1e40af', bg: '#dbeafe', dot: '#2563eb' },
  warning:       { icon: '⚠️', color: '#92400e', bg: '#fef3c7', dot: '#f59e0b' },
  info:          { icon: 'ℹ️', color: '#475569', bg: '#f1f5f9', dot: '#94a3b8' },
};
const getNotifMeta = (type: string) => NOTIF_META[type] || NOTIF_META['info'];

/* ── useBreakpoint ───────────────────────────────────────── */
function useBreakpoint() {
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setWidth(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return {
    width,
    isMobile:    width < BP.mobile,
    isTablet:    width >= BP.mobile && width < BP.desktop,
    isDesktop:   width >= BP.desktop,
    isCollapsed: width < BP.desktop,
  };
}

/* ── Time ago helper ─────────────────────────────────────── */
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ══════════════════════════════════════════════════════════
   NotificationBell — live, DB-backed
══════════════════════════════════════════════════════════ */
function NotificationBell({ customerId, userId }: { customerId?: string; userId?: number }) {
  const navigate = useNavigate();
  const [open,  setOpen]  = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const unreadCount = items.filter(n => !n.is_read).length;

  /* ── Fetch from DB ── */
  const fetchNotifs = useCallback(async () => {
    if (!customerId) return;
    try {
      const res = await axios.get(`/client-notifications?customer_id=${customerId}&limit=20`);
      const data: AppNotification[] = Array.isArray(res.data) ? res.data : [];
      setItems(data);
    } catch { /* silent */ }
  }, [customerId]);

  useEffect(() => {
    fetchNotifs();
    pollRef.current = setInterval(fetchNotifs, 30000); // poll every 30 s
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchNotifs]);

  /* ── Close on outside click ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── Mark single read ── */
  const markRead = async (id: number) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    try { await axios.patch(`/client-notifications/${id}/read`); } catch { /* silent */ }
  };

  /* ── Mark all read ── */
  const markAllRead = async () => {
    setItems(prev => prev.map(n => ({ ...n, is_read: true })));
    try { await axios.patch(`/client-notifications/read-all?customer_id=${customerId}`); } catch { /* silent */ }
  };

  /* ── Click a notification → navigate ── */
  const handleClick = (n: AppNotification) => {
    markRead(n.id);
    if (n.sample_request_id) { navigate('/client/samples'); setOpen(false); return; }
    if (n.order_id)          { navigate('/client/orders');  setOpen(false); return; }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        style={S.iconBtn}
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span style={S.bellBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div style={S.bellDropdown}>
          {/* Header */}
          <div style={S.bellHeader}>
            <span style={S.bellTitle}>
              Notifications
              {unreadCount > 0 && (
                <span style={S.bellCountPill}>{unreadCount} new</span>
              )}
            </span>
            {unreadCount > 0 && (
              <button style={S.bellMarkAll} onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <div style={S.dropDivider} />

          {/* List */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={S.bellEmpty}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
                <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>All caught up!</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>No notifications yet</div>
              </div>
            ) : items.map(n => {
              const meta = getNotifMeta(n.type);
              return (
                <div
                  key={n.id}
                  style={{
                    ...S.bellItem,
                    background: n.is_read ? '#fff' : '#f8faff',
                    borderLeft: n.is_read ? '3px solid transparent' : `3px solid ${meta.dot}`,
                    cursor: (n.sample_request_id || n.order_id) ? 'pointer' : 'default',
                  }}
                  onClick={() => handleClick(n)}
                >
                  <div style={{ ...S.bellTypeIcon, background: meta.bg }}>
                    <span style={{ fontSize: 14 }}>{meta.icon}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12.5, fontWeight: n.is_read ? 500 : 700,
                      color: n.is_read ? '#64748b' : '#0f172a',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>
                      {n.message}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                  {!n.is_read && (
                    <button
                      style={S.bellReadBtn}
                      onClick={e => { e.stopPropagation(); markRead(n.id); }}
                      title="Mark as read"
                    >
                      ✓
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <>
              <div style={S.dropDivider} />
              <div style={{ padding: '8px 12px', textAlign: 'center' }}>
                <button
                  style={S.bellViewAll}
                  onClick={() => { setOpen(false); navigate('/client/notifications'); }}
                >
                  View all notifications →
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main Component
══════════════════════════════════════════════════════════ */
export default function ClientDashboard() {
  const { user, logout } = useAuth();
  const location  = useLocation();
  const navigate  = useNavigate();
  const { isMobile, isTablet, isCollapsed } = useBreakpoint();

  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarUrl,   setAvatarUrl]   = useState('');
  const profileRef = useRef<HTMLDivElement>(null);

  // Read local user for IDs
  const localUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const customerId = localUser?.customer_id;
  const userId     = user?.id || localUser?.id;

  // Load avatar from profile (non-critical)
  useEffect(() => {
    if (!userId) return;
    axios.get(`/client-profile?user_id=${userId}`)
      .then(res => { if (res.data?.avatar_url) setAvatarUrl(res.data.avatar_url); })
      .catch(() => {});
  }, [userId]);

  // Close sidebar on route change
  useEffect(() => { if (isCollapsed) setMobileOpen(false); }, [location.pathname, isCollapsed]);

  // Close profile dropdown on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // Prevent body scroll when mobile sidebar open
  useEffect(() => {
    document.body.style.overflow = isCollapsed && mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isCollapsed, mobileOpen]);

  const getInitials = (name?: string) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    return parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  /* ── Sidebar ─────────────────────────────────────────── */
  const sidebarStyle: CSSProperties = {
    ...S.sidebar,
    ...(isCollapsed ? (mobileOpen ? S.sidebarOpen : S.sidebarClosed) : {}),
  };

  const sidebar = (
    <aside style={sidebarStyle}>
      <div style={S.brand}>
        <div style={S.brandLogo}>
          <img src="/logo.png" alt="" style={{ width: 20, height: 20, borderRadius: 5 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={S.brandName}>Synkore Tech</div>
        </div>
        {isCollapsed && mobileOpen && (
          <button style={S.sidebarCloseBtn} onClick={() => setMobileOpen(false)} aria-label="Close sidebar">
            <X size={18} color="#94a3b8" />
          </button>
        )}
      </div>

      <div style={S.scrollableArea} className="sidebar-scroll">
        <div style={S.sectionLabel}>NAVIGATION</div>

        <Link
          to="/client/dashboard"
          style={{ ...S.dashLink, ...(location.pathname === '/client/dashboard' ? S.dashLinkActive : {}) }}
          onClick={() => isCollapsed && setMobileOpen(false)}
        >
          <div style={{ ...S.dashIcon, background: location.pathname === '/client/dashboard' ? '#4f46e5' : 'rgba(255,255,255,0.06)' }}>
            <LayoutDashboard size={15} />
          </div>
          <span>Dashboard</span>
          {location.pathname === '/client/dashboard' && <div style={S.activeBar} />}
        </Link>

        <div style={S.sectionLabel}>MODULES</div>

        <nav style={S.nav}>
          {navItems.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}
                onClick={() => isCollapsed && setMobileOpen(false)}
                style={{ ...S.navItem, background: active ? 'rgba(79,70,229,0.20)' : 'transparent', borderLeft: active ? '3px solid #6366f1' : '3px solid transparent' }}
              >
                <span style={{ ...S.navIcon, color: active ? '#6366f1' : 'white' }}>{item.icon}</span>
                <span style={{ ...S.navLabel, color: active ? '#f1f5f9' : '#94a3b8', fontWeight: active ? 600 : 400 }}>{item.label}</span>
                {active && <div style={{ ...S.activeDot, background: '#6366f1' }} />}
              </Link>
            );
          })}
        </nav>

        <div style={S.sidebarBottom}>
          <div style={S.sectionLabel}>SUPPORT</div>
          <button style={S.bottomLink} onClick={() => navigate('/client/profile')}>
            <Settings size={14} style={{ color: 'white' }} />
            <span style={S.bottomLinkText}>Settings</span>
          </button>
          <button style={S.bottomLink}>
            <HelpCircle size={14} style={{ color: 'white' }} />
            <span style={S.bottomLinkText}>Help Center</span>
          </button>
        </div>
      </div>
    </aside>
  );

  const headerHeight = isMobile ? 54 : 62;

  return (
    <div style={S.shell}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'DM Sans', sans-serif; }
        .sidebar-scroll { overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; }
        .sidebar-scroll::-webkit-scrollbar { width: 3px; }
        .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
        .sidebar-scroll::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        a { text-decoration: none; }
        button { cursor: pointer; }
        .bell-item-hover:hover { background: #f8faff !important; }
        @media (max-width: 575px) {
          .admin-content { padding: 12px !important; }
          .admin-header  { padding: 0 12px !important; height: 54px !important; }
        }
        @media (min-width: 576px) and (max-width: 991px) {
          .admin-content { padding: 16px !important; }
          .admin-header  { padding: 0 16px !important; height: 58px !important; }
        }
        @media (max-width: 991px) { .sidebar-nav-item { min-height: 44px !important; } }
        @media (max-width: 480px) { .profile-info-block { display: none !important; } }
        @media (max-width: 575px) { .page-title { font-size: 15px !important; } .breadcrumb-row { display: none !important; } }
        @media (min-width: 576px) and (max-width: 767px) { .page-title { font-size: 16px !important; } }
      `}</style>

      {isCollapsed && mobileOpen && <div style={S.overlay} onClick={() => setMobileOpen(false)} />}

      {sidebar}

      <div style={{ ...S.main, marginLeft: isCollapsed ? 0 : undefined }}>
        {/* Header */}
        <header
          className="admin-header"
          style={{ ...S.header, height: headerHeight, padding: isMobile ? '0 12px' : isTablet ? '0 16px' : '0 24px' }}
        >
          <div style={S.headerLeft}>
            {isCollapsed && (
              <button style={S.menuBtn} onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
                {mobileOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            )}
            <DynamicBreadcrumb pathname={location.pathname} isMobile={isMobile} />
          </div>

          <div style={S.headerRight}>
            {/* ── Live notification bell ── */}
            <NotificationBell customerId={customerId} userId={userId} />

            <div style={S.headerDivider} />

            {/* ── Profile dropdown ── */}
            <div ref={profileRef} style={{ position: 'relative' }}>
              <button style={S.profileBtn} onClick={() => setProfileOpen(o => !o)}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" style={{ ...S.avatar, objectFit: 'cover' }} />
                ) : (
                  <div style={S.avatar}>{getInitials(user?.name)}</div>
                )}
                <div className="profile-info-block" style={S.profileInfo}>
                  <span style={S.profileName}>{user?.name}</span>
                  <span style={S.profileRole}>Client</span>
                </div>
                <ChevronRight size={14} style={{ color: '#94a3b8', transform: profileOpen ? 'rotate(90deg)' : 'rotate(270deg)', transition: 'transform 0.2s' }} />
              </button>

              {profileOpen && (
                <div style={{ ...S.dropdown, right: isMobile ? '-8px' : 0, minWidth: isMobile ? 200 : 240 }}>
                  <div style={S.dropArrow} />
                  <div style={S.dropHead}>
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="avatar" style={{ ...S.dropAvatar, objectFit: 'cover' }} />
                    ) : (
                      <div style={S.dropAvatar}>{getInitials(user?.name)}</div>
                    )}
                    <div>
                      <div style={S.dropName}>{user?.name}</div>
                      <div style={S.dropEmail}>{user?.email}</div>
                    </div>
                  </div>
                  <div style={S.dropDivider} />
                  <div style={S.dropStatus}>
                    <div style={S.statusDot} />
                    <span style={S.statusText}>Active</span>
                    {customerId && <span style={S.custIdPill}>{customerId}</span>}
                  </div>
                  <div style={S.dropDivider} />

                  {/* ── My Profile — navigates to /client/profile ── */}
                  <button
                    style={S.dropItem}
                    onClick={() => { setProfileOpen(false); navigate('/client/profile'); }}
                  >
                    <span style={{ color: '#64748b' }}><User size={14} /></span>
                    <span>My Profile</span>
                  </button>

                  <div style={S.dropDivider} />
                  <button
                    style={{ ...S.dropItem, ...S.dropLogout }}
                    onClick={() => { setProfileOpen(false); logout(); }}
                  >
                    <LogOut size={14} />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="admin-content" style={{ ...S.content, padding: isMobile ? 12 : isTablet ? 16 : 24 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/* ── DynamicBreadcrumb ───────────────────────────────────── */
function DynamicBreadcrumb({ pathname, isMobile }: { pathname: string; isMobile: boolean }) {
  const segments = pathname.split('/').filter(Boolean);
  const formatLabel = (seg: string) =>
    seg.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const crumbs = segments.map((seg, idx) => ({
    label: formatLabel(seg),
    path: '/' + segments.slice(0, idx + 1).join('/'),
    isLast: idx === segments.length - 1,
  }));
  const pageTitle = crumbs.length > 0 ? crumbs[crumbs.length - 1].label : 'Dashboard';

  return (
    <div>
      {!isMobile && (
        <div className="breadcrumb-row" style={S.breadcrumb}>
          <Link to="/client/dashboard" style={S.breadcrumbHome} title="Home"><Home size={12} /></Link>
          {crumbs.map(crumb => (
            <span key={crumb.path} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={S.breadcrumbSep}>/</span>
              {crumb.isLast
                ? <span style={S.breadcrumbCurrent}>{crumb.label}</span>
                : <Link to={crumb.path} style={S.breadcrumbLink}>{crumb.label}</Link>}
            </span>
          ))}
        </div>
      )}
      <h1 className="page-title" style={S.pageTitle}>{pageTitle}</h1>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════ */
const S: Record<string, CSSProperties> = {
  shell:   { display: 'flex', minHeight: '100vh', background: '#f1f5f9' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 998, backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' },

  sidebar:       { width: 260, minWidth: 260, background: '#0f172a', display: 'flex', flexDirection: 'column', flexShrink: 0, zIndex: 1000, overflow: 'hidden', height: '100vh', position: 'sticky', top: 0, borderRight: '1px solid rgba(255,255,255,0.04)', transition: 'left 0.28s cubic-bezier(.4,0,.2,1)' },
  sidebarClosed: { position: 'fixed', left: -280, top: 0, height: '100vh' },
  sidebarOpen:   { position: 'fixed', left: 0,    top: 0, height: '100vh', boxShadow: '4px 0 32px rgba(0,0,0,0.45)' },

  brand:          { display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 },
  brandLogo:      { width: 34, height: 34, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(79,70,229,0.4)' },
  brandName:      { fontSize: 18, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2, letterSpacing: '-0.01em' },
  sidebarCloseBtn:{ background: 'transparent', border: 'none', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 6, flexShrink: 0 },
  scrollableArea: { flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', padding: '12px 0 0' } as CSSProperties,
  sectionLabel:   { fontSize: 9.5, fontWeight: 700, color: '#334155', letterSpacing: '0.1em', padding: '0 18px 6px', textTransform: 'uppercase', flexShrink: 0 },
  dashLink:       { display: 'flex', alignItems: 'center', gap: 10, margin: '0 10px 12px', padding: '9px 10px', borderRadius: 9, color: '#64748b', fontSize: 14, fontWeight: 500, transition: 'all 0.15s', position: 'relative', flexShrink: 0, minHeight: 44 },
  dashLinkActive: { color: '#f1f5f9', background: 'rgba(79,70,229,0.15)' },
  dashIcon:       { width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, transition: 'background 0.15s' },
  activeBar:      { position: 'absolute', right: 10, width: 6, height: 6, borderRadius: '50%', background: '#4f46e5' },
  nav:            { display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 10px 8px' },
  navItem:        { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 5px', borderRadius: 7, fontSize: 13, color: '#94a3b8', marginBottom: 2, transition: 'all 0.15s', position: 'relative', marginTop: 4, minHeight: 40 },
  navIcon:        { flexShrink: 0, transition: 'color 0.15s' },
  navLabel:       { flex: 1, transition: 'color 0.15s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  activeDot:      { width: 5, height: 5, borderRadius: '50%', flexShrink: 0 },
  sidebarBottom:  { marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, paddingBottom: 12 },
  bottomLink:     { display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '10px 18px', border: 'none', background: 'transparent', cursor: 'pointer', transition: 'background 0.12s', minHeight: 40 },
  bottomLinkText: { fontSize: 12, color: 'white', fontWeight: 500 },

  main:    { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', width: '100%' },
  header:  { background: '#ffffff', padding: '0 24px', height: 62, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', flexShrink: 0 },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 },
  menuBtn:     { width: 36, height: 36, borderRadius: 9, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0, touchAction: 'manipulation' },
  breadcrumb:        { display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2, flexWrap: 'wrap' },
  breadcrumbHome:    { display: 'flex', alignItems: 'center', color: '#94a3b8', textDecoration: 'none' },
  breadcrumbLink:    { fontSize: 11, color: '#64748b', fontWeight: 500, textDecoration: 'none' },
  breadcrumbSep:     { color: '#cbd5e1', fontSize: 12 },
  breadcrumbCurrent: { fontSize: 11, color: '#64748b', fontWeight: 500 },
  pageTitle:   { fontSize: 17, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  iconBtn:       { width: 36, height: 36, borderRadius: 9, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: 'pointer', touchAction: 'manipulation', position: 'relative' },
  headerDivider: { width: 1, height: 28, background: '#e2e8f0', margin: '0 2px' },
  profileBtn:    { display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '5px 8px 5px 5px', cursor: 'pointer', touchAction: 'manipulation' },
  avatar:        { width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flexShrink: 0, letterSpacing: '0.03em' },
  profileInfo:   { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 },
  profileName:   { fontSize: 12, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' },
  profileRole:   { fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' },

  dropdown:   { position: 'absolute', top: 'calc(100% + 10px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.14),0 4px 16px rgba(0,0,0,0.06)', minWidth: 240, zIndex: 500, overflow: 'hidden' },
  dropArrow:  { position: 'absolute', top: -5, right: 20, width: 10, height: 10, background: '#fff', border: '1px solid #e2e8f0', borderBottom: 'none', borderRight: 'none', transform: 'rotate(45deg)' },
  dropHead:   { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)' },
  dropAvatar: { width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0, boxShadow: '0 4px 10px rgba(79,70,229,0.3)' },
  dropName:   { fontSize: 13, fontWeight: 700, color: '#0f172a' },
  dropEmail:  { fontSize: 11, color: '#64748b', marginTop: 1 },
  dropStatus: { display: 'flex', alignItems: 'center', gap: 7, padding: '7px 16px', flexWrap: 'wrap' },
  statusDot:  { width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 2px rgba(34,197,94,0.2)' },
  statusText: { fontSize: 11, color: '#22c55e', fontWeight: 600 },
  custIdPill: { marginLeft: 'auto', background: '#ede9fe', color: '#6d28d9', borderRadius: 20, padding: '1px 9px', fontSize: 10, fontWeight: 700 },
  dropDivider:{ height: 1, background: '#f1f5f9' },
  dropItem:   { display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: '#374151', textAlign: 'left', fontWeight: 500, transition: 'background 0.12s', fontFamily: 'DM Sans,sans-serif', minHeight: 40 },
  dropLogout: { color: '#ef4444', fontWeight: 600 },
  content:    { flex: 1, padding: 24, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' },

  /* Notification Bell dropdown */
  bellBadge:    { position: 'absolute', top: 4, right: 4, minWidth: 15, height: 15, borderRadius: 99, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: '0 3px' },
  bellDropdown: { position: 'absolute', top: 'calc(100% + 10px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.14)', width: 360, zIndex: 500, overflow: 'hidden' },
  bellHeader:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)' },
  bellTitle:    { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#0f172a' },
  bellCountPill:{ background: '#ef4444', color: '#fff', borderRadius: 20, padding: '1px 7px', fontSize: 10, fontWeight: 700 },
  bellMarkAll:  { fontSize: 11, color: '#4f46e5', cursor: 'pointer', fontWeight: 600, border: 'none', background: 'none', fontFamily: 'inherit' },
  bellEmpty:    { padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 },
  bellItem:     { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', borderBottom: '1px solid #f3f4f6', transition: 'background .12s' },
  bellTypeIcon: { width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bellReadBtn:  { flexShrink: 0, width: 22, height: 22, borderRadius: '50%', border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 11, color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 },
  bellViewAll:  { fontSize: 12, color: '#6366f1', fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' },
};