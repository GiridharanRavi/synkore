// frontend/src/pages/admin/AdminDashboard.tsx
// Professional CoreUI-style Admin Dashboard — Fully Responsive
// UPDATED: "Other Master" expanded into a sub-dropdown with all sub-masters
// UPDATED: Added "Account Details" item to the profile dropdown menu
// UPDATED: Fabric Purchase now has 4 ordered sub-items:
//          Fabric Purchase Order -> Fabric Purchase Inward -> Fabric Stock -> Packing List
// UPDATED: Added "Employee Master" dropdown -> Employee Details -> Employee Tracker

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
  ClipboardList,
  Clipboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  Droplets,
  Truck,
  LogOut,
  Cog,
  User,
  Users,
  ChevronRight,
  Settings,
  HelpCircle,
  Home,
  BarChart2,
  TrendingUp,
  PieChart,
  FileText,
  Receipt,
  Banknote,
  CreditCard,
  BookOpen,
  UserCheck,
  Layers,
  Car,
  Package,
  Store,
  Factory,
  Tangent,
  Hash,
  ChevronDown,
  Tag,
  Palette,
  Ruler,
  Globe,
  ListChecks,
  Boxes,
  CalendarClock,
  SlidersHorizontal,
  IdCard,
  Warehouse,
  PackageCheck,
 
} from 'lucide-react';

import {
  useEffect,
  useRef,
  useState,
  CSSProperties,
} from 'react';

import { useAuth } from '../../context/AuthContext';
// import NotificationBell from './NotificationBell';
import { CgProductHunt } from 'react-icons/cg';
import { BsBank } from 'react-icons/bs';

/* ── Breakpoints ─────────────────────────────────────────── */
const BP = { mobile: 576, tablet: 768, desktop: 992 };

/* ── Nav types ───────────────────────────────────────────── */
interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  subItems?: NavItem[];           // ← nested sub-dropdown
}

interface NavGroup {
  title: string;
  color: string;
  accentColor: string;
  headerIcon: React.ReactNode;
  items: NavItem[];
}

/* ── Employee Master sub-items ───────────────────────────── */
/*   Order: Employee Details -> Employee Tracker  */
const employeeMasterSubItems: NavItem[] = [
  { path: '/admin/master/employee',   label: 'Employee Details',       icon: <User size={13} /> },
  { path: '/admin/master/employee-tracker', label: 'Employee Tracker',  icon: <CalendarClock size={13} /> },
];

/* ── Other Master sub-items ──────────────────────────────── */
const otherMasterSubItems: NavItem[] = [
  { path: '/admin/master/service-types',   label: 'Service Type Master',       icon: <Users size={13} /> },
  { path: '/admin/master/packages',           label: 'Package Master',        icon: <Globe size={13} /> },
  { path: '/admin/master/regions',            label: 'Region Master',         icon: <UserCheck size={13} /> },
  { path: '/admin/master/customer-group',     label: 'Customer Group Master',         icon: <ListChecks size={13} /> },
  { path: '/admin/master/processing-types',  label: 'Processing Types',      icon: <SlidersHorizontal size={13} /> },
  { path: '/admin/master/payment-terms',     label: 'Payment Terms',        icon: <CalendarClock size={13} /> },
  { path: '/admin/master/colors',     label: 'Color Master',         icon: <Package size={13} /> },
  { path: '/admin/master/certification',            label: 'Certification Master',         icon: <Palette size={13} /> },
  { path: '/admin/master/currency',             label: 'Currency Master',          icon: <Ruler size={13} /> },
  { path: '/admin/master/discount-types',               label: 'Discount Type Master',      icon: <Boxes size={13} /> },
  { path: '/admin/master/hsn-codes',         label: 'HSN Code Master',      icon: <Tag size={13} /> },
  
];

/* ── Fabric Purchase sub-items ──────────────────────────── */
/*   Order: Fabric Purchase Order -> Fabric Purchase Inward
     -> Fabric Stock -> Packing List (split into two separate items)  */
const fabricPurchaseSubItems: NavItem[] = [
  { path: '/admin/jobwork',                 label: 'Fabric Purchase Order',  icon: <ClipboardList size={13} /> },
  { path: '/admin/inward',                  label: 'Fabric Purchase Inward', icon: <ArrowDownToLine size={13} /> },
  { path: '/admin/fabric-stock',            label: 'Fabric Purchase Stock',           icon: <Warehouse size={13} /> },
  
];

/* ── Nav config ─────────────────────────────────────────── */
const navGroups: NavGroup[] = [
  {
    title: 'Master Data',
    color: '#4ae7c5',
    accentColor: 'rgba(22, 249, 219, 0.12)',
    headerIcon: <User size={16} />,
    items: [
      { path: '/admin/customers',               label: 'Customer Master',        icon: <Users size={14} /> },
      { path: '/admin/master/agents',               label: 'Agent Master',        icon: <User size={14} /> },
      { path: '/admin/master/fabric',           label: 'Fabric Master',          icon: <Layers size={14} /> },
      { path: '/admin/master/transport',        label: 'Transport Master',       icon: <Car size={14} /> },
      { path: '/admin/master/vendors',          label: 'Vendor Master',          icon: <Store size={14} /> },
      { path: '/admin/master/suppliers',        label: 'Supplier Master',        icon: <Factory size={14} /> },
      // { path: '/admin/master/delivery-address', label: 'Delivery Address',       icon: <MapPin size={14} /> },
      { path: '/admin/master/yarn',             label: 'Yarn Master',            icon: <Tangent size={14} /> },
       { path: '/admin/master/company-details',             label: 'Company Details Master',            icon: <Banknote size={14} /> },
      // ── Employee Master — has sub-items ──
      {
        path: '/admin/master/employee',
        label: 'Employee Master',
        icon: <User size={14} />,
        subItems: employeeMasterSubItems,
      },
      // ── Other Master — has sub-items ──
      {
        path: '/admin/master/other',
        label: 'Other Master',
        icon: <Hash size={14} />,
        subItems: otherMasterSubItems,
      },
    ],
  },
  {
    title: 'Production Workflow',
    color: '#6366f1',
    accentColor: 'rgba(99,102,241,0.12)',
    headerIcon: <Users size={16} />,
    items: [
      { path: '/admin/development', label: 'Request Analysis', icon: <Cog size={14} /> },
    ],
  },
  {
    title: 'Order Management',
    color: '#0ea5e9',
    accentColor: 'rgba(14,165,233,0.12)',
    headerIcon: <ClipboardList size={16} />,
    items: [
      { path: '/admin/customer-orders', label: 'Customer Order', icon: <ClipboardList size={14} /> },
      { path: '/admin/order-status',          label: 'Order Status',  icon: <Clipboard size={14} /> },
    ],
  },
  {
    title: 'Production Operations',
    color: '#d14634',
    accentColor: 'rgba(245,158,11,0.12)',
    headerIcon: <CgProductHunt size={16} />,
    items: [
      { path: '/admin/production', label: 'Production Planning', icon: <CgProductHunt size={14} /> },
      { path: '/admin/workorder',  label: 'Work Order',    icon: <ArrowDownToLine size={14} /> },
    ],
  },

  {
  title: 'Purchase Operations',
  color: '#f59e0b',
  accentColor: 'rgba(59,130,246,0.12)',
  headerIcon: <Package size={16} />,
  items: [
    {
      path: '/admin/purchase/fabric',
      label: 'Fabric Purchase',
      icon: <Layers size={14} />,
      // ── UPDATED: Fabric Purchase Order -> Fabric Purchase Inward -> Fabric Stock -> Packing List ──
      subItems: fabricPurchaseSubItems,
    },
    {
      path: '/admin/purchase/yarn',
      label: 'Yarn Purchase',
      icon: <Tangent size={14} />,
      subItems: [
        { path: '/admin/yarn-order',  label: 'Yarn Purchase Order',  icon: <ClipboardList size={13} /> },
        { path: '/admin/yarn-inward', label: 'Yarn Purchase Inward', icon: <ArrowDownToLine size={13} /> },
        { path: '/admin/yarn-stock', label: 'Yarn Purchase Stock', icon: <Warehouse size={13} /> },
        // { path: '/admin/yarn-packing-list', label: 'Yarn Packing List', icon: <PackageCheck size={13} /> },
      ],
    },
  ],
},

  //  {
  //   title: 'Fabric Operations',
  //   color: '#f59e0b',
  //   accentColor: 'rgba(245,158,11,0.12)',
  //   headerIcon: <Wrench size={16} />,
  //   items: [
  //     { path: '/admin/jobwork', label: 'Fabric Purchase Order', icon: <Wrench size={14} /> },
  //     { path: '/admin/inward',  label: 'Inward Fabric',    icon: <ArrowDownToLine size={14} /> },
  //   ],
  // },

  {
    title: 'Sales Operations',
    color: '#ec4899',
    accentColor: 'rgba(236,72,153,0.12)',
    headerIcon: <Droplets size={16} />,
    items: [
     { path: '/admin/packing-list',            label: 'Packing List',           icon: <PackageCheck size={13} /> },
    ],
  },
  // {
  //   title: 'Dispatch & Logistics',
  //   color: '#22c55e',
  //   accentColor: 'rgba(34,197,94,0.12)',
  //   headerIcon: <Truck size={16} />,
  //   items: [
  //     { path: '/admin/dispatch', label: 'Final Dispatch', icon: <Truck size={14} /> },
  //   ],
  // },

  {
    title: 'Finance & Billing',
    color: '#f97316',
    accentColor: 'rgba(249,115,22,0.12)',
    headerIcon: <Banknote size={16} />,
    items: [
      { path: '/admin/sales-invoice', label: 'Sales Invoices',       icon: <Receipt size={14} /> },
       { path: '/admin/purchase-invoice', label: 'Fabric Purchase Invoices',       icon: <Receipt size={14} /> },
       { path: '/admin/yarn-purchase-invoice', label: 'Yarn Purchase Invoices',       icon: <Receipt size={14} /> },
      // { path: '/admin/finance/payments', label: 'Payments',       icon: <CreditCard size={14} /> },
      // { path: '/admin/finance/ledger',   label: 'General Ledger', icon: <BookOpen size={14} /> },
    ],
  },
  {
    title: 'Reports & Analytics',
    color: '#a855f7',
    accentColor: 'rgba(168,85,247,0.12)',
    headerIcon: <BarChart2 size={16} />,
    items: [
      { path: '/admin/sales-report',      label: 'Sales Report',      icon: <TrendingUp size={14} /> },
      { path: '/admin/purchase-report', label: 'Purchase Report', icon: <PieChart size={14} /> },
      { path: '/admin/dispatch',   label: 'Dispatch Summary',  icon: <FileText size={14} /> },
      { path: '/admin/reports/overview',   label: 'Business Overview', icon: <BarChart2 size={14} /> },
    ],
  },
  
  {
    title: 'Account',
    color: '#64748b',
    accentColor: 'rgba(100,116,139,0.12)',
    headerIcon: <IdCard size={16} />,
    items: [
      { path: '/admin/account-details',  label: 'Account Details',  icon: <IdCard size={14} /> },
    ],
  },
];

/* ── useBreakpoint ───────────────────────────────────────── */
function useBreakpoint() {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200,
  );
  useEffect(() => {
    const fn = () => setWidth(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return {
    width,
    isMobile:   width < BP.mobile,
    isTablet:   width >= BP.mobile && width < BP.desktop,
    isDesktop:  width >= BP.desktop,
    isCollapsed: width < BP.desktop,
  };
}

/* ══════════════════════════════════════════════════════════
   Main Component
══════════════════════════════════════════════════════════ */
export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile, isTablet, isCollapsed } = useBreakpoint();

  const [mobileOpen, setMobileOpen]     = useState(false);
  const [profileOpen, setProfileOpen]   = useState(false);
  const [openGroups, setOpenGroups]     = useState<Record<string, boolean>>({});
  const [openSubMenus, setOpenSubMenus] = useState<Record<string, boolean>>({});

  const profileRef = useRef<HTMLDivElement>(null);

  // Close sidebar on route change for mobile/tablet
  useEffect(() => {
    if (isCollapsed) setMobileOpen(false);
  }, [location.pathname, isCollapsed]);

  // Close profile dropdown on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // Auto-open the active group AND sub-menu on navigation
  useEffect(() => {
    navGroups.forEach((g) => {
      const directMatch = g.items.some(
        (i) => !i.subItems && i.path === location.pathname,
      );
      const subMatch = g.items.some(
        (i) => i.subItems?.some((s) => s.path === location.pathname),
      );
      if (directMatch || subMatch) {
        setOpenGroups((prev) => ({ ...prev, [g.title]: true }));
      }
      if (subMatch) {
        const parentItem = g.items.find((i) =>
          i.subItems?.some((s) => s.path === location.pathname),
        );
        if (parentItem) {
          setOpenSubMenus((prev) => ({ ...prev, [parentItem.path]: true }));
        }
      }
    });
  }, [location.pathname]);

  // Prevent body scroll when mobile sidebar open
  useEffect(() => {
    document.body.style.overflow = isCollapsed && mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isCollapsed, mobileOpen]);

  const toggleGroup   = (title: string) =>
    setOpenGroups((p) => ({ [title]: !p[title] }));

  const toggleSubMenu = (path: string) =>
    setOpenSubMenus((p) => ({ ...p, [path]: !p[path] }));

  const getInitials = (name?: string) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    return parts.length === 1
      ? parts[0][0].toUpperCase()
      : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  /* ── Sidebar ─────────────────────────────────────────── */
  const sidebarStyle: CSSProperties = {
    ...S.sidebar,
    ...(isCollapsed ? (mobileOpen ? S.sidebarOpen : S.sidebarClosed) : {}),
  };

  const sidebar = (
    <aside style={sidebarStyle}>
      {/* Brand — pinned, never scrolls */}
      <div style={S.brand}>
        <div style={S.brandLogo}>
          <img
            src="/logo.png"
            alt=""
            style={{ width: 20, height: 20, borderRadius: 5 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
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

      {/* Scrollable nav area */}
      <div style={S.scrollableArea} className="sidebar-scroll">
        <div style={S.sectionLabel}>NAVIGATION</div>

        {/* Dashboard link */}
        <Link
          to="/admin/dashboard"
          style={{
            ...S.dashLink,
            ...(location.pathname === '/admin/dashboard' ? S.dashLinkActive : {}),
          }}
          onClick={() => isCollapsed && setMobileOpen(false)}
        >
          <div style={{
            ...S.dashIcon,
            background: location.pathname === '/admin/dashboard'
              ? '#4f46e5'
              : 'rgba(255,255,255,0.06)',
          }}>
            <LayoutDashboard size={15} />
          </div>
          <span>Dashboard</span>
          {location.pathname === '/admin/dashboard' && <div style={S.activeBar} />}
        </Link>

        <div style={S.sectionLabel}>MODULES</div>

        <nav style={S.nav}>
          {navGroups.map((group) => {
            const isOpen    = !!openGroups[group.title];
            const hasActive = group.items.some(
              (i) =>
                (!i.subItems && i.path === location.pathname) ||
                (i.subItems?.some((s) => s.path === location.pathname)),
            );

            return (
              <div key={group.title} style={S.groupBlock}>
                {/* Group header */}
                <button
                  style={{
                    ...S.groupHeader,
                    background: isOpen || hasActive ? group.accentColor : 'transparent',
                    borderLeft: isOpen || hasActive
                      ? `3px solid ${group.color}`
                      : '3px solid transparent',
                  }}
                  onClick={() => toggleGroup(group.title)}
                >
                  <div style={S.groupLeft}>
                    <div style={{ ...S.groupIcon, background: group.accentColor, color: group.color }}>
                      {group.headerIcon}
                    </div>
                    <span style={{
                      ...S.groupTitle,
                      color: isOpen || hasActive ? '#f1f5f9' : '#94a3b8',
                    }}>
                      {group.title}
                    </span>
                  </div>
                  <ChevronRight
                    size={13}
                    style={{
                      color: 'white',
                      transition: 'transform 0.22s ease',
                      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      flexShrink: 0,
                    }}
                  />
                </button>

                {/* Group items */}
                {isOpen && (
                  <div style={S.groupItems}>
                    {group.items.map((item) => {
                      const active    = !item.subItems && location.pathname === item.path;
                      const hasSubItems = !!item.subItems?.length;
                      const subOpen   = !!openSubMenus[item.path];
                      const subActive = item.subItems?.some((s) => s.path === location.pathname) ?? false;

                      // ── Item WITH sub-dropdown (e.g. Employee Master, Other Master, Fabric Purchase) ──
                      if (hasSubItems) {
                        return (
                          <div key={item.path}>
                            {/* Parent row — acts as toggle, not a link */}
                            <button
                              onClick={() => toggleSubMenu(item.path)}
                              style={{
                                ...S.navItem,
                                width: '100%',
                                border: 'none',
                                cursor: 'pointer',
                                textAlign: 'left',
                                background: subActive
                                  ? `${group.color}18`
                                  : subOpen
                                    ? 'rgba(255,255,255,0.04)'
                                    : 'transparent',
                                borderLeft: subActive
                                  ? `3px solid ${group.color}`
                                  : subOpen
                                    ? `3px solid rgba(255,255,255,0.08)`
                                    : '3px solid transparent',
                              }}
                            >
                              <span style={{
                                ...S.navIcon,
                                color: subActive ? group.color : subOpen ? '#94a3b8' : 'white',
                              }}>
                                {item.icon}
                              </span>
                              <span style={{
                                ...S.navLabel,
                                flex: 1,
                                color: subActive ? '#f1f5f9' : subOpen ? '#cbd5e1' : '#94a3b8',
                                fontWeight: subActive ? 600 : 400,
                              }}>
                                {item.label}
                              </span>
                              {/* Badge showing count */}
                              <span style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: subActive ? group.color : 'white',
                                background: subActive ? `${group.color}22` : 'rgba(255,255,255,0.05)',
                                borderRadius: 10,
                                padding: '1px 6px',
                                marginRight: 4,
                                flexShrink: 0,
                              }}>
                                {item.subItems!.length}
                              </span>
                              <ChevronDown
                                size={12}
                                style={{
                                  color: 'white',
                                  flexShrink: 0,
                                  transition: 'transform 0.2s ease',
                                  transform: subOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                }}
                              />
                            </button>

                            {/* Sub-items list */}
                            {subOpen && (
                              <div style={S.subItemsContainer}>
                                {/* Vertical connector line */}
                                <div style={S.subConnectorLine} />
                                <div style={S.subItemsList}>
                                  {item.subItems!.map((sub) => {
                                    const subItemActive = location.pathname === sub.path;
                                    return (
                                      <Link
                                        key={sub.path}
                                        to={sub.path}
                                        onClick={() => isCollapsed && setMobileOpen(false)}
                                        style={{
                                          ...S.subNavItem,
                                          background: subItemActive
                                            ? `${group.color}1a`
                                            : 'transparent',
                                          color: subItemActive ? '#f1f5f9' : '#64748b',
                                        }}
                                      >
                                        {/* Connector dot */}
                                        <div style={{
                                          ...S.subDot,
                                          background: subItemActive ? group.color : '#1e293b',
                                          boxShadow: subItemActive ? `0 0 0 3px ${group.color}33` : 'none',
                                        }} />
                                        <span style={{ ...S.subNavIcon, color: subItemActive ? group.color : 'white' }}>
                                          {sub.icon}
                                        </span>
                                        <span style={{
                                          fontSize: 13,
                                          fontWeight: subItemActive ? 600 : 400,
                                          color: subItemActive ? '#f1f5f9' : '#f1f5f9',
                                          flex: 1,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                        }}>
                                          {sub.label}
                                        </span>
                                        {subItemActive && (
                                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: group.color, flexShrink: 0 }} />
                                        )}
                                      </Link>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }

                      // ── Regular nav item (no sub-items) ──
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => isCollapsed && setMobileOpen(false)}
                          style={{
                            ...S.navItem,
                            background: active ? `${group.color}20` : 'transparent',
                            borderLeft: active
                              ? `3px solid ${group.color}`
                              : '3px solid transparent',
                          }}
                        >
                          <span style={{ ...S.navIcon, color: active ? group.color : 'white' }}>
                            {item.icon}
                          </span>
                          <span style={{
                            ...S.navLabel,
                            color: active ? '#f1f5f9' : '#94a3b8',
                            fontWeight: active ? 600 : 400,
                          }}>
                            {item.label}
                          </span>
                          {active && <div style={{ ...S.activeDot, background: group.color }} />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom links */}
        <div style={S.sidebarBottom}>
          <div style={S.sectionLabel}>SUPPORT</div>
          <button style={S.bottomLink}>
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

        @media (max-width: 575px) {
          .admin-content { padding: 12px !important; }
          .admin-header  { padding: 0 12px !important; height: 54px !important; }
        }
        @media (min-width: 576px) and (max-width: 991px) {
          .admin-content { padding: 16px !important; }
          .admin-header  { padding: 0 16px !important; height: 58px !important; }
        }
        @media (max-width: 991px) {
          .sidebar-nav-item { min-height: 44px !important; }
          .sidebar-group-header { min-height: 44px !important; }
        }
        @media (max-width: 480px) {
          .profile-info-block { display: none !important; }
        }
        @media (max-width: 575px) {
          .page-title { font-size: 15px !important; }
          .breadcrumb-row { display: none !important; }
        }
        @media (min-width: 576px) and (max-width: 767px) {
          .page-title { font-size: 16px !important; }
        }

        /* Sub-item hover */
        .sub-nav-item:hover {
          background: rgba(255,255,255,0.04) !important;
          color: #cbd5e1 !important;
        }
      `}</style>

      {isCollapsed && mobileOpen && (
        <div style={S.overlay} onClick={() => setMobileOpen(false)} />
      )}

      {sidebar}

      <div style={{ ...S.main, marginLeft: isCollapsed ? 0 : undefined }}>
        {/* Header */}
        <header
          className="admin-header"
          style={{
            ...S.header,
            height: headerHeight,
            padding: isMobile ? '0 12px' : isTablet ? '0 16px' : '0 24px',
          }}
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
            {/* <div style={S.iconBtn}><NotificationBell /></div> */}
            {/* <div style={S.headerDivider} /> */}

            <div ref={profileRef} style={{ position: 'relative' }}>
              <button style={S.profileBtn} onClick={() => setProfileOpen((o) => !o)}>
                <div style={S.avatar}>{getInitials(user?.name)}</div>
                <div className="profile-info-block" style={S.profileInfo}>
                  <span style={S.profileName}>{user?.name}</span>
                  <span style={S.profileRole}>Administrator</span>
                </div>
                <ChevronRight
                  size={14}
                  style={{
                    color: '#94a3b8',
                    transform: profileOpen ? 'rotate(90deg)' : 'rotate(270deg)',
                    transition: 'transform 0.2s',
                  }}
                />
              </button>

              {profileOpen && (
                <div style={{
                  ...S.dropdown,
                  right: isMobile ? '-8px' : 0,
                  minWidth: isMobile ? 200 : 240,
                }}>
                  <div style={S.dropArrow} />
                  <div style={S.dropHead}>
                    <div style={S.dropAvatar}>{getInitials(user?.name)}</div>
                    <div>
                      <div style={S.dropName}>{user?.name}</div>
                      <div style={S.dropEmail}>{user?.email}</div>
                    </div>
                  </div>
                  <div style={S.dropDivider} />
                  <div style={S.dropStatus}>
                    <div style={S.statusDot} />
                    <span style={S.statusText}>Active</span>
                  </div>
                  <div style={S.dropDivider} />
                  <DropItem icon={<User size={14} />}     label="My Profile" onClick={() => { setProfileOpen(false); navigate('/admin/profile'); }} />
                  {/* ── Account Details ── */}
                  <DropItem icon={<IdCard size={14} />}   label="Account Details" onClick={() => { setProfileOpen(false); navigate('/admin/account-details'); }} />
                  <DropItem icon={<Settings size={14} />} label="Account Settings" onClick={() => { setProfileOpen(false); navigate('/admin/account-settings'); }} />

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
        <main
          className="admin-content"
          style={{
            ...S.content,
            padding: isMobile ? 12 : isTablet ? 16 : 24,
          }}
        >
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
    seg.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
          <Link to="/admin/dashboard" style={S.breadcrumbHome} title="Home">
            <Home size={12} />
          </Link>
          {crumbs.map((crumb) => (
            <span key={crumb.path} style={{ display:'flex', alignItems:'center', gap:5 }}>
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

/* ── DropItem ────────────────────────────────────────────── */
function DropItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={{ ...S.dropItem, background: hovered ? '#f8fafc' : 'transparent' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <span style={{ color:'#64748b' }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════ */
const S: Record<string, CSSProperties> = {
  shell: { display:'flex', minHeight:'100vh', background:'#f1f5f9' },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:998, backdropFilter:'blur(2px)', WebkitBackdropFilter:'blur(2px)' },

  /* Sidebar */
  sidebar: { width:260, minWidth:260, background:'#0f172a', display:'flex', flexDirection:'column', flexShrink:0, zIndex:1000, overflow:'hidden', height:'100vh', position:'sticky', top:0, borderRight:'1px solid rgba(255,255,255,0.04)', transition:'left 0.28s cubic-bezier(.4,0,.2,1)' },
  sidebarClosed: { position:'fixed', left:-280, top:0, height:'100vh' },
  sidebarOpen:   { position:'fixed', left:0,    top:0, height:'100vh', boxShadow:'4px 0 32px rgba(0,0,0,0.45)' },

  brand: { display:'flex', alignItems:'center', gap:10, padding:'18px 16px 14px', borderBottom:'1px solid rgba(255,255,255,0.05)', flexShrink:0 },
  brandLogo: { width:34, height:34, background:'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 4px 12px rgba(79,70,229,0.4)' },
  brandName: { fontSize:18, fontWeight:700, color:'#f1f5f9', lineHeight:1.2, letterSpacing:'-0.01em' },
  sidebarCloseBtn: { background:'transparent', border:'none', padding:4, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', borderRadius:6, flexShrink:0 },

  scrollableArea: { flex:1, overflowY:'auto', overflowX:'hidden', WebkitOverflowScrolling:'touch', display:'flex', flexDirection:'column', padding:'12px 0 0' } as CSSProperties,

  sectionLabel: { fontSize:9.5, fontWeight:700, color:'#334155', letterSpacing:'0.1em', padding:'0 18px 6px', textTransform:'uppercase', flexShrink:0 },

  dashLink: { display:'flex', alignItems:'center', gap:10, margin:'0 10px 12px', padding:'9px 10px', borderRadius:9, color:'#64748b', fontSize:14, fontWeight:500, transition:'all 0.15s', position:'relative', flexShrink:0, minHeight:44 },
  dashLinkActive: { color:'#f1f5f9', background:'rgba(79,70,229,0.15)' },
  dashIcon: { width:28, height:28, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', flexShrink:0, transition:'background 0.15s' },
  activeBar: { position:'absolute', right:10, width:6, height:6, borderRadius:'50%', background:'#4f46e5' },

  nav: { display:'flex', flexDirection:'column', gap:4, padding:'4px 10px 8px' },
  groupBlock: { borderRadius:9, overflow:'hidden' },
  groupHeader: { display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'8px 10px', border:'none', borderRadius:8, cursor:'pointer', transition:'all 0.18s ease', marginBottom:1, minHeight:44 },
  groupLeft: { display:'flex', alignItems:'center', gap:9, minWidth:0 },
  groupIcon: { width:28, height:28, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  groupTitle: { fontSize:13, fontWeight:600, transition:'color 0.15s', textAlign:'left', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  groupItems: { paddingLeft:8, paddingBottom:4 },

  navItem: { display:'flex', alignItems:'center', gap:10, padding:'9px 5px', borderRadius:7, fontSize:13, color:'#94a3b8', marginBottom:2, transition:'all 0.15s', position:'relative', marginTop:4, minHeight:40 },
  navIcon: { flexShrink:0, transition:'color 0.15s' },
  navLabel: { flex:1, transition:'color 0.15s', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  activeDot: { width:5, height:5, borderRadius:'50%', flexShrink:0 },

  /* Sub-dropdown */
  subItemsContainer: { position:'relative', marginLeft:14, marginBottom:4 },
  subConnectorLine:  { position:'absolute', left:7, top:0, bottom:8, width:1, background:'rgba(255,255,255,0.06)', borderRadius:1 },
  subItemsList:      { paddingLeft:16 },
  subNavItem: {
    display:'flex', alignItems:'center', gap:8,
    padding:'7px 8px', borderRadius:7,
    fontSize:12, color:'#64748b',
    marginBottom:1, transition:'all 0.15s',
    position:'relative', minHeight:36,
    textDecoration:'none',
  },
  subDot:     { width:5, height:5, borderRadius:'50%', flexShrink:0, transition:'all 0.15s', marginLeft:-4 },
  subNavIcon: { flexShrink:0, transition:'color 0.15s' },

  sidebarBottom: { marginTop:'auto', paddingTop:12, borderTop:'1px solid rgba(255,255,255,0.05)', flexShrink:0, paddingBottom:12 },
  bottomLink: { display:'flex', alignItems:'center', gap:9, width:'100%', padding:'10px 18px', border:'none', background:'transparent', cursor:'pointer', transition:'background 0.12s', minHeight:40 },
  bottomLinkText: { fontSize:12, color:'white', fontWeight:500 },

  /* Main */
  main: { flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden', width:'100%' },
  header: { background:'#ffffff', padding:'0 24px', height:62, display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #e2e8f0', position:'sticky', top:0, zIndex:100, boxShadow:'0 1px 3px rgba(0,0,0,0.04)', flexShrink:0 },
  headerLeft: { display:'flex', alignItems:'center', gap:12, minWidth:0, flex:1 },
  menuBtn: { width:36, height:36, borderRadius:9, border:'1px solid #e2e8f0', background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b', flexShrink:0, touchAction:'manipulation' },
  breadcrumb: { display:'flex', alignItems:'center', gap:5, marginBottom:2, flexWrap:'wrap' },
  breadcrumbHome: { display:'flex', alignItems:'center', color:'#94a3b8', textDecoration:'none' },
  breadcrumbLink: { fontSize:11, color:'#64748b', fontWeight:500, textDecoration:'none' },
  breadcrumbSep: { color:'#cbd5e1', fontSize:12 },
  breadcrumbCurrent: { fontSize:11, color:'#64748b', fontWeight:500 },
  pageTitle: { fontSize:17, fontWeight:700, color:'#0f172a', letterSpacing:'-0.02em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  headerRight: { display:'flex', alignItems:'center', gap:6, flexShrink:0 },
  iconBtn: { width:36, height:36, borderRadius:9, border:'1px solid #e2e8f0', background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b', cursor:'pointer', touchAction:'manipulation' },
  headerDivider: { width:1, height:28, background:'#e2e8f0', margin:'0 2px' },
  profileBtn: { display:'flex', alignItems:'center', gap:8, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'5px 8px 5px 5px', cursor:'pointer', touchAction:'manipulation' },
  avatar: { width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,#4f46e5,#7c3aed)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:11, flexShrink:0, letterSpacing:'0.03em' },
  profileInfo: { display:'flex', flexDirection:'column', alignItems:'flex-start', lineHeight:1.2 },
  profileName: { fontSize:12, fontWeight:700, color:'#0f172a', whiteSpace:'nowrap' },
  profileRole: { fontSize:10, color:'#94a3b8', whiteSpace:'nowrap' },
  dropdown: { position:'absolute', top:'calc(100% + 10px)', right:0, background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, boxShadow:'0 20px 60px rgba(0,0,0,0.14),0 4px 16px rgba(0,0,0,0.06)', minWidth:240, zIndex:500, overflow:'hidden' },
  dropArrow: { position:'absolute', top:-5, right:20, width:10, height:10, background:'#fff', border:'1px solid #e2e8f0', borderBottom:'none', borderRight:'none', transform:'rotate(45deg)' },
  dropHead: { display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'linear-gradient(135deg,#f8fafc,#f1f5f9)' },
  dropAvatar: { width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#4f46e5,#7c3aed)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13, flexShrink:0, boxShadow:'0 4px 10px rgba(79,70,229,0.3)' },
  dropName: { fontSize:13, fontWeight:700, color:'#0f172a' },
  dropEmail: { fontSize:11, color:'#64748b', marginTop:1 },
  dropStatus: { display:'flex', alignItems:'center', gap:7, padding:'7px 16px' },
  statusDot: { width:7, height:7, borderRadius:'50%', background:'#22c55e', boxShadow:'0 0 0 2px rgba(34,197,94,0.2)' },
  statusText: { fontSize:11, color:'#22c55e', fontWeight:600 },
  dropDivider: { height:1, background:'#f1f5f9' },
  dropItem: { display:'flex', alignItems:'center', gap:9, width:'100%', padding:'10px 16px', border:'none', background:'transparent', cursor:'pointer', fontSize:12.5, color:'#374151', textAlign:'left', fontWeight:500, transition:'background 0.12s', fontFamily:'DM Sans,sans-serif', minHeight:40 },
  dropLogout: { color:'#ef4444', fontWeight:600 },
  content: { flex:1, padding:24, overflowY:'auto', overflowX:'hidden', WebkitOverflowScrolling:'touch' },
};