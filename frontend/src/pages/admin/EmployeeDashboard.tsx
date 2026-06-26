/// <reference types="vite/client" />
// frontend/src/pages/admin/EmployeeDashboard.tsx
// Fix: passes `user` (UserPayload) as a prop to every lazy-loaded stage component
// so child pages can read employee_id, employee_code, etc. for their API calls.

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  lazy,
  Suspense,
  Component,
  CSSProperties,
} from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import {
  Menu, X, LogOut, ChevronRight, ChevronDown,
  Home, Bell, Settings, LayoutDashboard, User, Users,
  ClipboardList, ArrowDownToLine, Layers, Car, Store,
  Factory, Tangent, Hash, Tag, Palette, Ruler, Globe,
  ListChecks, Boxes, CalendarClock, SlidersHorizontal,
  Package, Droplets, Truck, BarChart2, TrendingUp,
  PieChart, FileText, Receipt, Banknote, CreditCard,
  BookOpen, UserCheck, Navigation, Cog, AlertTriangle,
  ShoppingCart, Send, RotateCcw, CheckSquare, Beaker,
} from 'lucide-react';
import { CgProductHunt } from 'react-icons/cg';

/* ── Breakpoints ──────────────────────────────────────────────────── */
const BP = { mobile: 576, tablet: 768, desktop: 992 };

/* ── Types ────────────────────────────────────────────────────────── */
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

// All lazy-loaded stage components receive this prop shape.
// Pages that don't need it can simply ignore it.
export interface StagePageProps {
  user: UserPayload;
}

interface StageLeaf {
  id: string;
  label: string;
  icon: ReactNode;
  component?: string;
}
interface StageNode extends StageLeaf {
  children?: StageLeaf[];
}

interface ModuleMeta {
  id: string;
  label: string;
  color: string;
  accentColor: string;
  headerIcon: ReactNode;
}

/* ══════════════════════════════════════════════════════════════════
   MODULE CATALOGUE
══════════════════════════════════════════════════════════════════ */
const MODULES: ModuleMeta[] = [
  { id: 'master_data',         label: 'Master Data',            color: '#4ae7c5', accentColor: 'rgba(22,249,219,0.12)',  headerIcon: <User size={16} /> },
  { id: 'production_workflow', label: 'Production Workflow',    color: '#6366f1', accentColor: 'rgba(99,102,241,0.12)',  headerIcon: <Users size={16} /> },
  { id: 'order_management',    label: 'Order Management',       color: '#0ea5e9', accentColor: 'rgba(14,165,233,0.12)',  headerIcon: <ClipboardList size={16} /> },
  { id: 'production_ops',      label: 'Production Operations',  color: '#d14634', accentColor: 'rgba(245,158,11,0.12)', headerIcon: <CgProductHunt size={16} /> },
  { id: 'purchase_ops',        label: 'Purchase Operations',    color: '#f59e0b', accentColor: 'rgba(59,130,246,0.12)', headerIcon: <Package size={16} /> },
  { id: 'sales_ops',           label: 'Sales Operations',       color: '#ec4899', accentColor: 'rgba(236,72,153,0.12)', headerIcon: <Droplets size={16} /> },
  { id: 'dispatch_logistics',  label: 'Dispatch & Logistics',   color: '#22c55e', accentColor: 'rgba(34,197,94,0.12)',  headerIcon: <Truck size={16} /> },
  { id: 'reports_analytics',   label: 'Reports & Analytics',    color: '#a855f7', accentColor: 'rgba(168,85,247,0.12)', headerIcon: <BarChart2 size={16} /> },
  { id: 'finance_billing',     label: 'Finance & Billing',      color: '#f97316', accentColor: 'rgba(249,115,22,0.12)', headerIcon: <Banknote size={16} /> },
  { id: 'sample_dev',          label: 'Sample & Development',   color: '#06b6d4', accentColor: 'rgba(6,182,212,0.12)',  headerIcon: <Beaker size={16} /> },
];

/* ══════════════════════════════════════════════════════════════════
   STAGE CATALOGUE
══════════════════════════════════════════════════════════════════ */
const STAGES: Record<string, StageNode[]> = {
  /* ─── Master Data ──────────────────────────────────────────────── */
  master_data: [
    { id: 'customer_master',  label: 'Customer Master',  icon: <Users size={14} />,   component: 'CustomerMaster' },
    { id: 'agent_master',     label: 'Agent Master',     icon: <User size={14} />,    component: 'AgentMaster' },
    { id: 'fabric_master',    label: 'Fabric Master',    icon: <Layers size={14} />,  component: 'FabricMaster' },
    { id: 'transport_master', label: 'Transport Master', icon: <Car size={14} />,     component: 'TransportMaster' },
    { id: 'vendor_master',    label: 'Vendor Master',    icon: <Store size={14} />,   component: 'VendorMaster' },
    { id: 'supplier_master',  label: 'Supplier Master',  icon: <Factory size={14} />, component: 'SupplierMaster' },
    { id: 'yarn_master',      label: 'Yarn Master',      icon: <Tangent size={14} />, component: 'YarnMaster' },
    {
      id: 'other_master', label: 'Other Master', icon: <Hash size={14} />, children: [
        { id: 'employee_master',       label: 'Employee Master',       icon: <User size={13} />,              component: 'EmployeeMaster' },
        { id: 'service_type_master',   label: 'Service Type Master',   icon: <Users size={13} />,             component: 'ServiceTypeMaster' },
        { id: 'package_master',        label: 'Package Master',        icon: <Globe size={13} />,             component: 'PackageMaster' },
        { id: 'region_master',         label: 'Region Master',         icon: <UserCheck size={13} />,         component: 'RegionMaster' },
        { id: 'customer_group_master', label: 'Customer Group Master', icon: <ListChecks size={13} />,        component: 'CustomerGroupMaster' },
        { id: 'processing_types',      label: 'Processing Types',      icon: <SlidersHorizontal size={13} />, component: 'ProcessingTypesMaster' },
        { id: 'payment_terms',         label: 'Payment Terms',         icon: <CalendarClock size={13} />,     component: 'PaymentTermsMaster' },
        { id: 'color_master',          label: 'Color Master',          icon: <Package size={13} />,           component: 'ColorMaster' },
        { id: 'certification_master',  label: 'Certification Master',  icon: <Palette size={13} />,           component: 'CertificationMaster' },
        { id: 'currency_master',       label: 'Currency Master',       icon: <Ruler size={13} />,             component: 'CurrencyMaster' },
        { id: 'discount_type_master',  label: 'Discount Type Master',  icon: <Boxes size={13} />,             component: 'DiscountTypeMaster' },
        { id: 'hsn_code_master',       label: 'HSN Code Master',       icon: <Tag size={13} />,               component: 'HsnMaster' },
      ],
    },
  ],

  /* ─── Production Workflow ──────────────────────────────────────── */
  production_workflow: [
    { id: 'request_analysis', label: 'Request Analysis',         icon: <Cog size={14} />,          component: 'DevelopmentProcess' },
    { id: 'edit_development', label: 'Edit Development Process', icon: <Cog size={14} />,          component: 'EditDevelopmentProcess' },
    { id: 'order_bookings',   label: 'Order Bookings',           icon: <ClipboardList size={14} />, component: 'OrderBookings' },
    { id: 'inward_processed', label: 'Inward Processed',         icon: <ArrowDownToLine size={14} />, component: 'InwardProcessed' },
  ],

  /* ─── Order Management ─────────────────────────────────────────── */
  order_management: [
    { id: 'customer_order', label: 'Customer Order', icon: <ClipboardList size={14} />, component: 'CustomerOrder' },
    { id: 'order_status',   label: 'Order Status',    icon: <ClipboardList size={14} />, component: 'OrderStatusMaster' },
  ],

  /* ─── Production Operations ────────────────────────────────────── */
  production_ops: [
    { id: 'production_planning', label: 'Production Planning', icon: <CgProductHunt size={14} />,   component: 'ProductionMaster' },
    { id: 'work_order',          label: 'Work Order',          icon: <ArrowDownToLine size={14} />, component: 'WorkOrderMaster' },
  ],

  /* ─── Purchase Operations ──────────────────────────────────────── */
  purchase_ops: [
    {
      id: 'fabric_purchase', label: 'Fabric Purchase', icon: <Layers size={14} />, children: [
        { id: 'fabric_purchase_order',  label: 'Fabric Purchase Order',  icon: <ClipboardList size={13} />,   component: 'FabricPurchaseOrders' },
        { id: 'fabric_purchase_inward', label: 'Fabric Purchase Inward', icon: <ArrowDownToLine size={13} />, component: 'FabricPurchaseInward' },
      ],
    },
    {
      id: 'yarn_purchase', label: 'Yarn Purchase', icon: <Tangent size={14} />, children: [
        { id: 'yarn_purchase_order',  label: 'Yarn Purchase Order',  icon: <ClipboardList size={13} />,   component: 'YarnPurchaseOrderMaster' },
        { id: 'yarn_purchase_inward', label: 'Yarn Purchase Inward', icon: <ArrowDownToLine size={13} />, component: 'YarnPurchaseInwardMaster' },
      ],
    },
  ],

  /* ─── Sales Operations ─────────────────────────────────────────── */
  sales_ops: [
    { id: 'quotation',   label: 'Quotation',   icon: <FileText size={14} /> },
    { id: 'invoice',     label: 'Invoice',     icon: <Receipt size={14} /> },
    { id: 'credit_note', label: 'Credit Note', icon: <CreditCard size={14} /> },
  ],

  /* ─── Dispatch & Logistics ─────────────────────────────────────── */
  dispatch_logistics: [
    { id: 'dispatch_order',   label: 'Dispatch Order',   icon: <Truck size={14} />,    component: 'Dispatch' },
    { id: 'outward',          label: 'Outward',          icon: <Send size={14} />,     component: 'Outward' },
    { id: 'delivery_challan', label: 'Delivery Challan', icon: <FileText size={14} /> },
    { id: 'tracking',         label: 'Tracking',         icon: <Navigation size={14} /> },
  ],

  /* ─── Reports & Analytics ──────────────────────────────────────── */
  reports_analytics: [
    { id: 'sales_report',      label: 'Sales Report',      icon: <TrendingUp size={14} /> },
    { id: 'production_report', label: 'Production Report', icon: <PieChart size={14} /> },
    { id: 'stock_report',      label: 'Stock Report',      icon: <Boxes size={14} /> },
    { id: 'sample_report',     label: 'Sample Report',     icon: <FileText size={14} />, component: 'SampleReportModal' },
  ],

  /* ─── Finance & Billing ────────────────────────────────────────── */
  finance_billing: [
    { id: 'payment', label: 'Payment', icon: <CreditCard size={14} /> },
    { id: 'receipt', label: 'Receipt', icon: <Receipt size={14} /> },
    { id: 'ledger',  label: 'Ledger',  icon: <BookOpen size={14} /> },
  ],

  /* ─── Sample & Development ─────────────────────────────────────── */
  sample_dev: [
    { id: 'sample_requests', label: 'Sample Requests', icon: <ShoppingCart size={14} />, component: 'SampleRequests' },
  ],
};

/* ── Flat stage index ─────────────────────────────────────────────── */
const STAGE_INDEX: Record<string, StageLeaf> = {};
Object.values(STAGES).forEach((nodes) => {
  nodes.forEach((node) => {
    if (node.children?.length) {
      node.children.forEach((child) => { STAGE_INDEX[child.id] = child; });
    } else {
      STAGE_INDEX[node.id] = node;
    }
  });
});

/* ══════════════════════════════════════════════════════════════════
   EXPLICIT FILE-NAME MAP
══════════════════════════════════════════════════════════════════ */
const EXPLICIT_LOADERS: Record<string, () => Promise<{ default: React.ComponentType<any> }>> = {
  // ── Master sub-folder ────────────────────────────────────────────
  AgentMaster:           () => import('./master/AgentMaster'),
  CertificationMaster:   () => import('./master/CertificationMaster'),
  ColorMaster:           () => import('./master/ColorMaster'),
  CurrencyMaster:        () => import('./master/CurrencyMaster'),
  CustomerGroupMaster:   () => import('./master/CustomerGroupMaster'),
  DiscountTypeMaster:    () => import('./master/DiscountTypeMaster'),
  EmployeeMaster:        () => import('./master/EmployeeMaster'),
  FabricMaster:          () => import('./master/FabricMaster'),
  HsnMaster:             () => import('./master/HsnMaster'),
  PackageMaster:         () => import('./master/PackageMaster'),
  PaymentTermsMaster:    () => import('./master/PaymentTermsMaster'),
  ProcessingTypesMaster: () => import('./master/ProcessingTypesMaster'),
  RegionMaster:          () => import('./master/RegionMaster'),
  ServiceTypeMaster:     () => import('./master/ServiceTypeMaster'),
  SupplierMaster:        () => import('./master/SupplierMaster'),
  TransportMaster:       () => import('./master/TransportMaster'),
  VendorMaster:          () => import('./master/VendorMaster'),
  YarnMaster:            () => import('./master/YarnMaster'),

  // ── Admin root pages ─────────────────────────────────────────────
  CustomerMaster:           () => import('./CustomerMaster'),
  CustomerOrder:            () => import('./CustomerOrder'),
  OrderStatusMaster: () => import('./OrderStatusMaster'),
  DevelopmentProcess:       () => import('./DevelopmentProcess'),
  EditDevelopmentProcess:   () => import('./EditDevelopmentProcess'),
  Dispatch:                 () => import('./Dispatch'),
  FabricPurchaseInward:     () => import('./FabricPurchaseInward'),
  FabricPurchaseOrders:     () => import('./FabricPurchaseOrders'),
  InwardProcessed:          () => import('./InwardProcessed'),
  OrderBookings:            () => import('./OrderBookings'),
  Outward:                  () => import('./Outward'),
  ProductionMaster:         () => import('./ProductionMaster'),
  SampleRequests:           () => import('./SampleRequests'),
  SampleReportModal:        () => import('./SampleReportModal'),
  WorkOrderMaster:          () => import('./WorkOrderMaster'),
  YarnPurchaseInwardMaster: () => import('./YarnPurchaseInwardMaster'),
  YarnPurchaseOrderMaster:  () => import('./YarnPurchaseOrderMaster'),
};

/* ── Glob fallback ────────────────────────────────────────────────── */
const GLOB_LOADERS = import.meta.glob(
  './**/*.tsx',
  { eager: false }
) as Record<string, () => Promise<{ default: React.ComponentType<any> }>>;

const GLOB_BY_NAME: Record<string, () => Promise<{ default: React.ComponentType<any> }>> = {};
for (const filePath in GLOB_LOADERS) {
  const baseName = filePath.split('/').pop()!.replace(/\.tsx$/, '');
  if (baseName === 'EmployeeDashboard' || baseName === 'AdminDashboard') continue;
  GLOB_BY_NAME[baseName] = GLOB_LOADERS[filePath];
}

/* ── Helpers ──────────────────────────────────────────────────────── */
function toPascalCase(id: string): string {
  return id.split('_').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

// Stable lazy-component cache
const lazyCache = new Map<string, React.LazyExoticComponent<React.ComponentType<any>>>();

function resolveStageComponent(
  stageId: string
): React.LazyExoticComponent<React.ComponentType<any>> | undefined {
  const override = STAGE_INDEX[stageId]?.component;
  const fileName = override ?? toPascalCase(stageId);

  const cached = lazyCache.get(fileName);
  if (cached) return cached;

  const loader = EXPLICIT_LOADERS[fileName] ?? GLOB_BY_NAME[fileName];
  if (!loader) return undefined;

  const Component = lazy(loader);
  lazyCache.set(fileName, Component);
  return Component;
}

/* ── ErrorBoundary ────────────────────────────────────────────────── */
interface EBState { hasError: boolean; error?: Error }
class PageErrorBoundary extends Component<
  { children: ReactNode; stageLabel: string; onReset: () => void },
  EBState
> {
  state: EBState = { hasError: false };

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[EmployeeDashboard] Page "${this.props.stageLabel}" crashed:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid #fee2e2',
          padding: 32, minHeight: 300, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'linear-gradient(135deg,#ef4444,#dc2626)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(239,68,68,0.3)',
          }}>
            <AlertTriangle size={26} color="#fff" />
          </div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1e293b' }}>
            {this.props.stageLabel} failed to load
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b', textAlign: 'center', maxWidth: 360, lineHeight: 1.7 }}>
            {this.state.error?.message ?? 'An unexpected error occurred while rendering this page.'}
          </p>
          <button
            onClick={this.props.onReset}
            style={{
              marginTop: 4, padding: '8px 20px', borderRadius: 8, border: 'none',
              background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Utilities ────────────────────────────────────────────────────── */
function safeParseArray(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[];
  if (typeof val === 'string') { try { return JSON.parse(val) || []; } catch { return []; } }
  return [];
}

function decodeJwt(token: string): UserPayload | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      ...payload,
      module_access: safeParseArray(payload.module_access),
      stage_access:  safeParseArray(payload.stage_access),
    };
  } catch { return null; }
}

function getInitials(name = '') {
  const parts = name.trim().split(' ');
  return parts.length === 1
    ? (parts[0]?.[0] ?? '').toUpperCase()
    : ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

/* ── useBreakpoint ────────────────────────────────────────────────── */
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
    isMobile:    width < BP.mobile,
    isTablet:    width >= BP.mobile && width < BP.desktop,
    isDesktop:   width >= BP.desktop,
    isCollapsed: width < BP.desktop,
  };
}

/* ── PageContent — placeholder when no file found ────────────────── */
function PageContent({ stageId, stageLabel }: { stageId: string; stageLabel: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
      padding: 32, minHeight: 400, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: 'linear-gradient(135deg,#6366f1,#818cf8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
      }}>📄</div>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>{stageLabel}</h2>
      <p style={{ margin: 0, fontSize: 14, color: '#64748b', textAlign: 'center', maxWidth: 440, lineHeight: 1.7 }}>
        No component found for this stage. Create a file named{' '}
        <code style={{ background: '#f1f5f9', padding: '1px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
          {toPascalCase(stageId)}.tsx
        </code>{' '}
        under{' '}
        <code style={{ background: '#f1f5f9', padding: '1px 8px', borderRadius: 4, fontSize: 12 }}>
          pages/admin/
        </code>{' '}
        (or{' '}
        <code style={{ background: '#f1f5f9', padding: '1px 8px', borderRadius: 4, fontSize: 12 }}>
          pages/admin/master/
        </code>
        ) and add it to{' '}
        <code style={{ background: '#f1f5f9', padding: '1px 8px', borderRadius: 4, fontSize: 12 }}>
          EXPLICIT_LOADERS
        </code>{' '}
        in EmployeeDashboard.tsx.
        <br /><br />
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          Stage ID: <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 3, fontSize: 11 }}>{stageId}</code>
        </span>
      </p>
    </div>
  );
}

/* ── StageLoading — Suspense fallback ────────────────────────────── */
function StageLoading({ label }: { label: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
      padding: 32, minHeight: 400, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
      boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: '50%',
        border: '3px solid #e2e8f0', borderTopColor: '#6366f1',
        animation: 'emp-spin 0.7s linear infinite',
      }} />
      <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Loading {label}…</p>
    </div>
  );
}

/* ── EmployeeHome ─────────────────────────────────────────────────── */
function EmployeeHome({ user, moduleCount, stageCount, allowedModules }: {
  user: UserPayload; moduleCount: number; stageCount: number; allowedModules: string[];
}) {
  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg,#6366f1 0%,#7c3aed 100%)',
        borderRadius: 16, padding: '28px 32px', marginBottom: 24,
        color: '#fff', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', right: -20, top: -20, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
        <div style={{ position: 'absolute', right: 40, bottom: -40, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <p style={{ margin: '0 0 4px', fontSize: 13, opacity: 0.8 }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800 }}>
          Welcome back, {user.name.split(' ')[0]}! 👋
        </h1>
        <p style={{ margin: 0, fontSize: 14, opacity: 0.85 }}>
          <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 6, padding: '2px 10px', fontFamily: 'monospace', fontSize: 12 }}>
            {user.employee_code}
          </span>
          &nbsp;·&nbsp;{user.employee_category}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Modules Assigned', value: moduleCount,            icon: '🗂️', color: '#6366f1', bg: '#eff0fe' },
          { label: 'Pages Accessible', value: stageCount,             icon: '📄', color: '#0891b2', bg: '#ecfeff' },
          { label: 'Account Status',   value: 'Active',               icon: '✅', color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Role',             value: user.employee_category, icon: '🔐', color: '#d97706', bg: '#fffbeb' },
        ].map(card => (
          <div key={card.label} style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
            padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6,
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{card.label}</span>
              <span style={{ width: 32, height: 32, borderRadius: 8, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{card.icon}</span>
            </div>
            <span style={{ fontSize: 22, fontWeight: 800, color: card.color }}>{card.value}</span>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Your Accessible Modules</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {MODULES.filter(m => allowedModules.includes(m.id)).map(mod => (
            <div key={mod.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
              padding: '8px 14px', fontSize: 13, color: '#374151', fontWeight: 500,
            }}>
              <span style={{ color: mod.color, display: 'flex' }}>{mod.headerIcon}</span>{mod.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── EmployeeBreadcrumb ───────────────────────────────────────────── */
function EmployeeBreadcrumb({ activeLabel, isMobile, onHome }: {
  activeLabel: string; isMobile: boolean; onHome: () => void;
}) {
  return (
    <div>
      {!isMobile && (
        <div className="breadcrumb-row" style={S.breadcrumb}>
          <button onClick={onHome} style={S.breadcrumbHome} title="Dashboard">
            <Home size={12} />
          </button>
          {activeLabel && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={S.breadcrumbSep}>/</span>
              <span style={S.breadcrumbCurrent}>{activeLabel}</span>
            </span>
          )}
        </div>
      )}
      <h1 className="page-title" style={S.pageTitle}>{activeLabel || 'Dashboard'}</h1>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════ */
export default function EmployeeDashboard() {
  const [user, setUser]                 = useState<UserPayload | null>(null);
  const [activeStage, setActiveStage]   = useState('');
  const [activeLabel, setActiveLabel]   = useState('');
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [profileOpen, setProfileOpen]   = useState(false);
  const [openGroups, setOpenGroups]     = useState<Record<string, boolean>>({});
  const [openSubMenus, setOpenSubMenus] = useState<Record<string, boolean>>({});
  const [boundaryKey, setBoundaryKey]   = useState(0);

  const profileRef = useRef<HTMLDivElement>(null);
  const { isMobile, isTablet, isCollapsed } = useBreakpoint();

  /* ── JWT decode ─────────────────────────────────────────────── */
  useEffect(() => {
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
    if (!token) { window.location.href = '/login'; return; }
    const payload = decodeJwt(token);
    if (!payload || payload.role !== 'employee') { window.location.href = '/login'; return; }
    setUser(payload);
  }, []);

  /* ── Close sidebar on stage change (mobile/tablet) ─────────── */
  useEffect(() => {
    if (isCollapsed) setMobileOpen(false);
  }, [activeStage, isCollapsed]);

  /* ── Close profile dropdown on outside click ────────────────── */
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  /* ── Prevent body scroll when mobile sidebar open ───────────── */
  useEffect(() => {
    document.body.style.overflow = isCollapsed && mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isCollapsed, mobileOpen]);

  /* ── Auto-open active group & sub-menu ──────────────────────── */
  useEffect(() => {
    if (!user || !activeStage) return;
    for (const mod of MODULES) {
      if (!user.module_access.includes(mod.id)) continue;
      const stages      = STAGES[mod.id] || [];
      const directMatch = stages.some(s => !s.children && s.id === activeStage);
      const groupMatch  = stages.some(s => s.children?.some(c => c.id === activeStage));
      if (directMatch || groupMatch) {
        setOpenGroups(prev => ({ ...prev, [mod.id]: true }));
      }
      if (groupMatch) {
        const parent = stages.find(s => s.children?.some(c => c.id === activeStage));
        if (parent) setOpenSubMenus(prev => ({ ...prev, [parent.id]: true }));
      }
    }
  }, [activeStage, user]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    window.location.href = '/login';
  }, []);

  const handleSelect = useCallback((stageId: string, stageLabel: string) => {
    setActiveStage(stageId);
    setActiveLabel(stageLabel);
    setMobileOpen(false);
    setBoundaryKey(k => k + 1);
  }, []);

  const toggleGroup   = (id: string) => setOpenGroups(p => ({ [id]: !p[id] }));
  const toggleSubMenu = (id: string) => setOpenSubMenus(p => ({ ...p, [id]: !p[id] }));

  const ActiveComponent = useMemo(
    () => (activeStage ? resolveStageComponent(activeStage) : undefined),
    [activeStage],
  );

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
        <div style={{ color: '#94a3b8', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Loading…</div>
      </div>
    );
  }

  const allowedModules = user.module_access;
  const allowedStages  = user.stage_access;
  const moduleCount    = allowedModules.length;
  const stageCount     = allowedStages.length;

  function getVisibleStages(moduleId: string): StageNode[] {
    return (STAGES[moduleId] || []).reduce<StageNode[]>((acc, stage) => {
      if (stage.children) {
        const visibleChildren = stage.children.filter(c => allowedStages.includes(c.id));
        if (visibleChildren.length) acc.push({ ...stage, children: visibleChildren });
      } else if (allowedStages.includes(stage.id)) {
        acc.push(stage);
      }
      return acc;
    }, []);
  }

  /* ── Sidebar ──────────────────────────────────────────────────── */
  const sidebarStyle: CSSProperties = {
    ...S.sidebar,
    ...(isCollapsed ? (mobileOpen ? S.sidebarOpen : S.sidebarClosed) : {}),
  };

  const sidebar = (
    <aside style={sidebarStyle}>
      {/* Brand */}
      <div style={S.brand}>
        <div style={S.brandLogo}>S</div>
        <div style={{ flex: 1 }}>
          <div style={S.brandName}>Synkore Tech</div>
          <div style={S.brandSub}>Employee Portal</div>
        </div>
        {isCollapsed && mobileOpen && (
          <button style={S.sidebarCloseBtn} onClick={() => setMobileOpen(false)} aria-label="Close sidebar">
            <X size={18} color="#94a3b8" />
          </button>
        )}
      </div>

      {/* Scrollable nav */}
      <div style={S.scrollableArea} className="sidebar-scroll">

        {/* Dashboard link */}
        <button
          onClick={() => { setActiveStage(''); setActiveLabel(''); setMobileOpen(false); }}
          style={{ ...S.dashLink, ...(!activeStage ? S.dashLinkActive : {}) }}
        >
          <div style={{ ...S.dashIcon, background: !activeStage ? '#4f46e5' : 'rgba(255,255,255,0.06)' }}>
            <LayoutDashboard size={15} />
          </div>
          <span>Dashboard</span>
          {!activeStage && <div style={S.activeBar} />}
        </button>

        <nav style={S.nav}>
          {MODULES.filter(m => allowedModules.includes(m.id)).map(mod => {
            const stages  = getVisibleStages(mod.id);
            if (!stages.length) return null;

            const isOpen    = !!openGroups[mod.id];
            const hasActive = stages.some(s =>
              s.children ? s.children.some(c => c.id === activeStage) : s.id === activeStage,
            );

            return (
              <div key={mod.id} style={S.groupBlock}>
                <button
                  style={{
                    ...S.groupHeader,
                    background: isOpen || hasActive ? mod.accentColor : 'transparent',
                    borderLeft: isOpen || hasActive ? `3px solid ${mod.color}` : '3px solid transparent',
                  }}
                  onClick={() => toggleGroup(mod.id)}
                >
                  <div style={S.groupLeft}>
                    <div style={{ ...S.groupIcon, background: mod.accentColor, color: mod.color }}>
                      {mod.headerIcon}
                    </div>
                    <span style={{ ...S.groupTitle, color: isOpen || hasActive ? '#f1f5f9' : '#94a3b8' }}>
                      {mod.label}
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

                {isOpen && (
                  <div style={S.groupItems}>
                    {stages.map(stage => {
                      const hasChildren = !!stage.children?.length;
                      const subOpen     = !!openSubMenus[stage.id];
                      const subActive   = stage.children?.some(c => c.id === activeStage) ?? false;

                      if (hasChildren) {
                        return (
                          <div key={stage.id}>
                            <button
                              onClick={() => toggleSubMenu(stage.id)}
                              style={{
                                ...S.navItem,
                                width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left',
                                background: subActive
                                  ? `${mod.color}18`
                                  : subOpen ? 'rgba(255,255,255,0.04)' : 'transparent',
                                borderLeft: subActive
                                  ? `3px solid ${mod.color}`
                                  : subOpen ? '3px solid rgba(255,255,255,0.08)' : '3px solid transparent',
                              }}
                            >
                              <span style={{ ...S.navIcon, color: subActive ? mod.color : subOpen ? '#94a3b8' : 'white' }}>
                                {stage.icon}
                              </span>
                              <span style={{ ...S.navLabel, flex: 1, color: subActive ? '#f1f5f9' : subOpen ? '#cbd5e1' : '#94a3b8', fontWeight: subActive ? 600 : 400 }}>
                                {stage.label}
                              </span>
                              <span style={{
                                fontSize: 10, fontWeight: 700,
                                color: subActive ? mod.color : 'white',
                                background: subActive ? `${mod.color}22` : 'rgba(255,255,255,0.05)',
                                borderRadius: 10, padding: '1px 6px', marginRight: 4, flexShrink: 0,
                              }}>
                                {stage.children!.length}
                              </span>
                              <ChevronDown
                                size={12}
                                style={{
                                  color: 'white', flexShrink: 0,
                                  transition: 'transform 0.2s ease',
                                  transform: subOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                }}
                              />
                            </button>

                            {subOpen && (
                              <div style={S.subItemsContainer}>
                                <div style={S.subConnectorLine} />
                                <div style={S.subItemsList}>
                                  {stage.children!.map(child => {
                                    const childActive = activeStage === child.id;
                                    return (
                                      <button
                                        key={child.id}
                                        onClick={() => handleSelect(child.id, child.label)}
                                        style={{
                                          ...S.subNavItem,
                                          width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left',
                                          background: childActive ? `${mod.color}1a` : 'transparent',
                                        }}
                                      >
                                        <div style={{
                                          ...S.subDot,
                                          background: childActive ? mod.color : '#1e293b',
                                          boxShadow: childActive ? `0 0 0 3px ${mod.color}33` : 'none',
                                        }} />
                                        <span style={{ ...S.subNavIcon, color: childActive ? mod.color : 'white' }}>
                                          {child.icon}
                                        </span>
                                        <span style={{ fontSize: 13, fontWeight: childActive ? 600 : 400, color: '#f1f5f9', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {child.label}
                                        </span>
                                        {childActive && <div style={{ width: 4, height: 4, borderRadius: '50%', background: mod.color, flexShrink: 0 }} />}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }

                      const active = activeStage === stage.id;
                      return (
                        <button
                          key={stage.id}
                          onClick={() => handleSelect(stage.id, stage.label)}
                          style={{
                            ...S.navItem,
                            width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left',
                            background: active ? `${mod.color}20` : 'transparent',
                            borderLeft: active ? `3px solid ${mod.color}` : '3px solid transparent',
                          }}
                        >
                          <span style={{ ...S.navIcon, color: active ? mod.color : 'white' }}>
                            {stage.icon}
                          </span>
                          <span style={{ ...S.navLabel, color: active ? '#f1f5f9' : '#94a3b8', fontWeight: active ? 600 : 400 }}>
                            {stage.label}
                          </span>
                          {active && <div style={{ ...S.activeDot, background: mod.color }} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {moduleCount === 0 && (
          <div style={S.emptyState}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
            <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
              No modules assigned yet.<br />Contact your administrator.
            </div>
          </div>
        )}

        <div style={S.sidebarBottom}>
          <div style={S.sectionLabel}>ACCOUNT</div>
          <button style={S.bottomLink} onClick={handleLogout}>
            <LogOut size={14} style={{ color: 'white' }} />
            <span style={S.bottomLinkText}>Sign Out</span>
          </button>
        </div>
      </div>
    </aside>
  );

  const headerHeight = isMobile ? 54 : 62;

  return (
    <div style={S.shell}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'DM Sans', sans-serif; }
        @keyframes emp-spin { to { transform: rotate(360deg); } }
        .sidebar-scroll { overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; }
        .sidebar-scroll::-webkit-scrollbar { width: 3px; }
        .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
        .sidebar-scroll::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        button { cursor: pointer; }
        @media (max-width: 575px) {
          .emp-content { padding: 12px !important; }
          .emp-header  { padding: 0 12px !important; height: 54px !important; }
        }
        @media (min-width: 576px) and (max-width: 991px) {
          .emp-content { padding: 16px !important; }
          .emp-header  { padding: 0 16px !important; height: 58px !important; }
        }
        @media (max-width: 480px) { .profile-info-block { display: none !important; } }
        @media (max-width: 575px) { .page-title { font-size: 15px !important; } .breadcrumb-row { display: none !important; } }
        @media (min-width: 576px) and (max-width: 767px) { .page-title { font-size: 16px !important; } }
      `}</style>

      {isCollapsed && mobileOpen && (
        <div style={S.overlay} onClick={() => setMobileOpen(false)} />
      )}

      {sidebar}

      <div style={S.main}>
        {/* Header */}
        <header
          className="emp-header"
          style={{
            ...S.header,
            height: headerHeight,
            padding: isMobile ? '0 12px' : isTablet ? '0 16px' : '0 24px',
          }}
        >
          <div style={S.headerLeft}>
            {isCollapsed && (
              <button style={S.menuBtn} onClick={() => setMobileOpen(v => !v)} aria-label="Toggle menu">
                {mobileOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            )}
            <EmployeeBreadcrumb
              activeLabel={activeLabel}
              isMobile={isMobile}
              onHome={() => { setActiveStage(''); setActiveLabel(''); }}
            />
          </div>

          <div style={S.headerRight}>
            <button style={S.iconBtn} aria-label="Notifications">
              <Bell size={18} />
              <span style={S.bellDot} />
            </button>
            <div style={S.headerDivider} />

            <div ref={profileRef} style={{ position: 'relative' }}>
              <button style={S.profileBtn} onClick={() => setProfileOpen(o => !o)}>
                <div style={S.avatar}>{getInitials(user.name)}</div>
                <div className="profile-info-block" style={S.profileInfo}>
                  <span style={S.profileName}>{user.name}</span>
                  <span style={S.profileRole}>{user.employee_category}</span>
                </div>
                <ChevronDown
                  size={14}
                  style={{
                    color: '#94a3b8',
                    transform: profileOpen ? 'rotate(180deg)' : 'rotate(0deg)',
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
                    <div style={S.dropAvatar}>{getInitials(user.name)}</div>
                    <div style={{ minWidth: 0, overflow: 'hidden' }}>
                      <div style={S.dropName}>{user.name}</div>
                      <div style={S.dropEmail}>{user.email}</div>
                    </div>
                  </div>
                  <div style={S.dropDivider} />
                  <div style={S.dropStatus}>
                    <div style={S.statusDot} />
                    <span style={S.statusText}>Active · {user.employee_category}</span>
                  </div>
                  <div style={S.dropDivider} />
                  <div style={{ ...S.dropItem, cursor: 'default' }}>
                    <Settings size={14} style={{ color: '#64748b' }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{user.employee_code}</span>
                  </div>
                  <div style={S.dropDivider} />
                  <button
                    style={{ ...S.dropItem, ...S.dropLogout }}
                    onClick={() => { setProfileOpen(false); handleLogout(); }}
                  >
                    <LogOut size={14} />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Content ───────────────────────────────────────────────
            KEY CHANGE: ActiveComponent now receives `user` as a prop.
            Every child page (CustomerOrder, DevelopmentProcess, etc.)
            gets the full UserPayload so they can include employee_id /
            employee_code / id in their API requests.
        ─────────────────────────────────────────────────────────── */}
        <main
          className="emp-content"
          style={{
            ...S.content,
            padding: isMobile ? 12 : isTablet ? 16 : 24,
          }}
        >
          {ActiveComponent ? (
            <PageErrorBoundary
              key={`${boundaryKey}-${activeStage}`}
              stageLabel={activeLabel}
              onReset={() => setBoundaryKey(k => k + 1)}
            >
              <Suspense fallback={<StageLoading label={activeLabel} />}>
                {/* ↓ user prop injected here — available in every stage page */}
                <ActiveComponent user={user} />
              </Suspense>
            </PageErrorBoundary>
          ) : activeStage ? (
            <PageContent stageId={activeStage} stageLabel={activeLabel} />
          ) : (
            <EmployeeHome
              user={user}
              moduleCount={moduleCount}
              stageCount={stageCount}
              allowedModules={allowedModules}
            />
          )}
        </main>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════ */
const S: Record<string, CSSProperties> = {
  shell:   { display: 'flex', minHeight: '100vh', background: '#f1f5f9' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 998, backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' },

  sidebar:       { width: 260, minWidth: 260, background: '#0f172a', display: 'flex', flexDirection: 'column', flexShrink: 0, zIndex: 1000, overflow: 'hidden', height: '100vh', position: 'sticky', top: 0, borderRight: '1px solid rgba(255,255,255,0.04)', transition: 'left 0.28s cubic-bezier(.4,0,.2,1)' },
  sidebarClosed: { position: 'fixed', left: -280, top: 0, height: '100vh' },
  sidebarOpen:   { position: 'fixed', left: 0,    top: 0, height: '100vh', boxShadow: '4px 0 32px rgba(0,0,0,0.45)' },

  brand:          { display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 },
  brandLogo:      { width: 34, height: 34, background: 'linear-gradient(135deg,#6366f1,#7c3aed)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(99,102,241,0.4)', color: '#fff', fontWeight: 800, fontSize: 16 },
  brandName:      { fontSize: 16, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2, letterSpacing: '-0.01em' },
  brandSub:       { fontSize: 11, color: '#64748b', marginTop: 1 },
  sidebarCloseBtn:{ background: 'transparent', border: 'none', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 6, flexShrink: 0 },

  scrollableArea: { flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', padding: '12px 0 0' },
  sectionLabel:   { fontSize: 9.5, fontWeight: 700, color: '#334155', letterSpacing: '0.1em', padding: '0 18px 6px', textTransform: 'uppercase', flexShrink: 0 },

  dashLink:       { display: 'flex', alignItems: 'center', gap: 10, margin: '0 10px 12px', padding: '9px 10px', borderRadius: 9, color: '#64748b', fontSize: 14, fontWeight: 500, transition: 'all 0.15s', position: 'relative', flexShrink: 0, minHeight: 44, border: 'none', background: 'transparent', width: 'calc(100% - 20px)', textAlign: 'left' },
  dashLinkActive: { color: '#f1f5f9', background: 'rgba(79,70,229,0.15)' },
  dashIcon:       { width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, transition: 'background 0.15s' },
  activeBar:      { position: 'absolute', right: 10, width: 6, height: 6, borderRadius: '50%', background: '#4f46e5' },

  nav:        { display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 10px 8px' },
  groupBlock: { borderRadius: 9, overflow: 'hidden' },
  groupHeader:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 10px', border: 'none', borderRadius: 8, cursor: 'pointer', transition: 'all 0.18s ease', marginBottom: 1, minHeight: 44, background: 'transparent' },
  groupLeft:  { display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 },
  groupIcon:  { width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  groupTitle: { fontSize: 13, fontWeight: 600, transition: 'color 0.15s', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  groupItems: { paddingLeft: 8, paddingBottom: 4 },

  navItem:  { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 5px', borderRadius: 7, fontSize: 13, color: '#94a3b8', marginBottom: 2, transition: 'all 0.15s', position: 'relative', marginTop: 4, minHeight: 40 },
  navIcon:  { flexShrink: 0, transition: 'color 0.15s', display: 'flex' },
  navLabel: { transition: 'color 0.15s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  activeDot:{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0 },

  subItemsContainer: { position: 'relative', marginLeft: 14, marginBottom: 4 },
  subConnectorLine:  { position: 'absolute', left: 7, top: 0, bottom: 8, width: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 1 },
  subItemsList:      { paddingLeft: 16 },
  subNavItem:        { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 7, fontSize: 12, color: '#64748b', marginBottom: 1, transition: 'all 0.15s', position: 'relative', minHeight: 36 },
  subDot:            { width: 5, height: 5, borderRadius: '50%', flexShrink: 0, transition: 'all 0.15s', marginLeft: -4 },
  subNavIcon:        { flexShrink: 0, transition: 'color 0.15s', display: 'flex' },

  emptyState: { padding: '24px 16px', textAlign: 'center' },

  sidebarBottom:  { marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, paddingBottom: 12 },
  bottomLink:     { display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '10px 18px', border: 'none', background: 'transparent', cursor: 'pointer', transition: 'background 0.12s', minHeight: 40 },
  bottomLinkText: { fontSize: 12, color: 'white', fontWeight: 500 },

  main:    { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', width: '100%' },
  header:  { background: '#ffffff', padding: '0 24px', height: 62, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', flexShrink: 0 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 },
  menuBtn:    { width: 36, height: 36, borderRadius: 9, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0, touchAction: 'manipulation' },

  breadcrumb:        { display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2, flexWrap: 'wrap' },
  breadcrumbHome:    { display: 'flex', alignItems: 'center', color: '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 },
  breadcrumbSep:     { color: '#cbd5e1', fontSize: 12 },
  breadcrumbCurrent: { fontSize: 11, color: '#64748b', fontWeight: 500 },
  pageTitle:         { fontSize: 17, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },

  headerRight:  { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  iconBtn:      { width: 36, height: 36, borderRadius: 9, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: 'pointer', touchAction: 'manipulation', position: 'relative' },
  bellDot:      { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: '50%', background: '#6366f1', border: '2px solid #fff' },
  headerDivider:{ width: 1, height: 28, background: '#e2e8f0', margin: '0 2px' },
  profileBtn:   { display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '5px 8px 5px 5px', cursor: 'pointer', touchAction: 'manipulation' },
  avatar:       { width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flexShrink: 0, letterSpacing: '0.03em' },
  profileInfo:  { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 },
  profileName:  { fontSize: 12, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' },
  profileRole:  { fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' },

  dropdown:   { position: 'absolute', top: 'calc(100% + 10px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.14),0 4px 16px rgba(0,0,0,0.06)', minWidth: 240, zIndex: 500, overflow: 'hidden' },
  dropArrow:  { position: 'absolute', top: -5, right: 20, width: 10, height: 10, background: '#fff', border: '1px solid #e2e8f0', borderBottom: 'none', borderRight: 'none', transform: 'rotate(45deg)' },
  dropHead:   { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)' },
  dropAvatar: { width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0, boxShadow: '0 4px 10px rgba(79,70,229,0.3)' },
  dropName:   { fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dropEmail:  { fontSize: 11, color: '#64748b', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dropStatus: { display: 'flex', alignItems: 'center', gap: 7, padding: '7px 16px' },
  statusDot:  { width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 2px rgba(34,197,94,0.2)' },
  statusText: { fontSize: 11, color: '#22c55e', fontWeight: 600 },
  dropDivider:{ height: 1, background: '#f1f5f9' },
  dropItem:   { display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: '#374151', textAlign: 'left', fontWeight: 500, transition: 'background 0.12s', minHeight: 40 },
  dropLogout: { color: '#ef4444', fontWeight: 600 },

  content: { flex: 1, padding: 24, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' },
};