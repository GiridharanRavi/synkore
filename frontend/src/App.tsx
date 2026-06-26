// frontend/src/App.tsx

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';

import {
  AuthProvider,
  useAuth,
} from './context/AuthContext';

import { NotificationProvider } from './pages/admin/NotificationContext';

import Login    from './pages/Login';
import Register from './pages/Register';

/* Layouts */
import AdminDashboard    from './pages/admin/AdminDashboard';
import ClientDashboard   from './pages/client/ClientDashboard';
import EmployeeDashboard from './pages/admin/EmployeeDashboard';   // ← NEW

/* Admin Pages */
import DashboardHome          from './pages/admin/DashboardHome';
import SampleRequests         from './pages/admin/SampleRequests';
import CustomerMaster         from './pages/admin/CustomerMaster';
import DevelopmentProcess     from './pages/admin/DevelopmentProcess';
import EditDevelopmentProcess from './pages/admin/EditDevelopmentProcess';
import CustomerOrder          from './pages/admin/CustomerOrder';
import OrderBookings          from './pages/admin/OrderBookings';
import Inward                 from './pages/admin/FabricPurchaseInward';
import JobWork                from './pages/admin/FabricPurchaseOrders';
import Outward                from './pages/admin/Outward';
import Dyeing                 from './pages/admin/Dyeing';
import InwardProcessed        from './pages/admin/InwardProcessed';
import Dispatch               from './pages/admin/Dispatch';
import ProductionMaster       from './pages/admin/ProductionMaster';
import WorkordernMaster       from './pages/admin/WorkOrderMaster';

/* Client Pages */
import ClientDashboardHome from './pages/client/ClientDashboardHome';
import ClientOrders        from './pages/client/ClientOrders';
import ClientSamples       from './pages/client/ClientSamples';
import ClientProfile   from './pages/client/ClientProfile';

/* Master Pages — existing */
import FabricMaster    from './pages/admin/master/FabricMaster';
import TransportMaster from './pages/admin/master/TransportMaster';
import AgentMaster     from './pages/admin/master/AgentMaster';
import VendorMaster    from './pages/admin/master/VendorMaster';
import SupplierMaster  from './pages/admin/master/SupplierMaster';
import YarnMaster      from './pages/admin/master/YarnMaster';

/* Master Pages — new */
import ServiceTypeMaster   from './pages/admin/master/ServiceTypeMaster';
import PackageMaster       from './pages/admin/master/PackageMaster';
import RegionMaster        from './pages/admin/master/RegionMaster';
import CustomerGroupMaster from './pages/admin/master/CustomerGroupMaster';
import ProcessingMaster    from './pages/admin/master/ProcessingTypesMaster';
import PaymentTermsMaster  from './pages/admin/master/PaymentTermsMaster';
import ColorMaster         from './pages/admin/master/ColorMaster';
import CertificationMaster from './pages/admin/master/CertificationMaster';
import HsnMaster           from './pages/admin/master/HsnMaster';
import CurrencyMaster      from './pages/admin/master/CurrencyMaster';
import DiscountTypeMaster  from './pages/admin/master/DiscountTypeMaster';
import EmployeeMaster      from './pages/admin/master/EmployeeMaster';

/* Procurement Pages */
import YarnPurchaseOrderMaster  from './pages/admin/YarnPurchaseOrderMaster';
import YarnPurchaseInwardMaster from './pages/admin/YarnPurchaseInwardMaster';

import OrderStatusMaster from './pages/admin/OrderStatusMaster'; 

import { ReactNode } from 'react';

// ─── Role helpers ─────────────────────────────────────────────────────────────
// Returns the default landing path for each role.
function defaultPath(role?: string) {
  if (role === 'admin')    return '/admin/dashboard';
  if (role === 'employee') return '/employee/dashboard';
  return '/client/dashboard';
}

// ─── Route guards ─────────────────────────────────────────────────────────────
/**
 * AdminRoute  — only role === 'admin' may pass; others go to their own home.
 * EmployeeRoute — only role === 'employee' may pass.
 * ClientRoute   — only role === 'client' may pass.
 * All three redirect unauthenticated users to /login.
 */
function AdminRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to={defaultPath(user.role)} replace />;
  return <>{children}</>;
}

function EmployeeRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'employee') return <Navigate to={defaultPath(user.role)} replace />;
  return <>{children}</>;
}

function ClientRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'client') return <Navigate to={defaultPath(user.role)} replace />;
  return <>{children}</>;
}

// ─── Routes ───────────────────────────────────────────────────────────────────
function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>

      {/* ── LOGIN — redirect already-logged-in users to their dashboard ── */}
      <Route
        path="/login"
        element={
          user
            ? <Navigate to={defaultPath(user.role)} replace />
            : <Login />
        }
      />

      {/* ── REGISTER ── */}
      <Route path="/register" element={<Register />} />

      {/* ═══════════════════════════════════════════════════════════════════
          ADMIN  (/admin/*)
      ═══════════════════════════════════════════════════════════════════ */}
      <Route
        path="/admin/*"
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />

        <Route path="dashboard" element={<DashboardHome />} />

        {/* Masters — existing */}
        <Route path="master/fabric"    element={<FabricMaster />} />
        <Route path="master/transport" element={<TransportMaster />} />
        <Route path="master/agents"    element={<AgentMaster />} />
        <Route path="master/vendors"   element={<VendorMaster />} />
        <Route path="master/suppliers" element={<SupplierMaster />} />
        <Route path="master/yarn"      element={<YarnMaster />} />
         <Route path="order-status" element={<OrderStatusMaster  />} />

        {/* Masters — new */}
        <Route path="master/employee"         element={<EmployeeMaster />} />
        <Route path="master/service-types"    element={<ServiceTypeMaster />} />
        <Route path="master/packages"         element={<PackageMaster />} />
        <Route path="master/regions"          element={<RegionMaster />} />
        <Route path="master/customer-group"   element={<CustomerGroupMaster />} />
        <Route path="master/processing-types" element={<ProcessingMaster />} />
        <Route path="master/payment-terms"    element={<PaymentTermsMaster />} />
        <Route path="master/colors"           element={<ColorMaster />} />
        <Route path="master/certification"    element={<CertificationMaster />} />
        <Route path="master/hsn-codes"        element={<HsnMaster />} />
        <Route path="master/currency"         element={<CurrencyMaster />} />
        <Route path="master/discount-types"   element={<DiscountTypeMaster />} />

        {/* Production */}
        <Route path="production" element={<ProductionMaster />} />
        <Route path="workorder"  element={<WorkordernMaster />} />

        {/* Procurement */}
        <Route path="yarn-order"  element={<YarnPurchaseOrderMaster />} />
        <Route path="yarn-inward" element={<YarnPurchaseInwardMaster />} />

        {/* Stage 1 */}
        <Route path="samples"     element={<SampleRequests />} />
        <Route path="customers"   element={<CustomerMaster />} />
        <Route path="development" element={<DevelopmentProcess />} />
        <Route path="development-process/edit/:id" element={<EditDevelopmentProcess />} />

        {/* Stage 2 */}
        <Route path="customer-orders" element={<CustomerOrder />} />
        <Route path="orders"          element={<OrderBookings />} />

        {/* Stage 3 */}
        <Route path="inward"  element={<Inward />} />
        <Route path="jobwork" element={<JobWork />} />

        {/* Stage 4 */}
        <Route path="outward"          element={<Outward />} />
        <Route path="dyeing"           element={<Dyeing />} />
        <Route path="inward-processed" element={<InwardProcessed />} />

        {/* Stage 5 */}
        <Route path="dispatch" element={<Dispatch />} />
      </Route>

      {/* ═══════════════════════════════════════════════════════════════════
          EMPLOYEE  (/employee/*)   ← NEW
          EmployeeDashboard handles its own internal page rendering based
          on module_access + stage_access stored in the JWT / AuthContext.
      ═══════════════════════════════════════════════════════════════════ */}
      <Route
        path="/employee/*"
        element={
          <EmployeeRoute>
            <EmployeeDashboard />
          </EmployeeRoute>
        }
      />

      {/* ═══════════════════════════════════════════════════════════════════
          CLIENT  (/client/*)
      ═══════════════════════════════════════════════════════════════════ */}
      <Route
        path="/client/*"
        element={
          <ClientRoute>
            <ClientDashboard />
          </ClientRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<ClientDashboardHome />} />
        <Route path="samples"   element={<ClientSamples />} />
        <Route path="orders"    element={<ClientOrders />} />
         <Route path="profile"      element={<ClientProfile />} />
      </Route>

      {/* ── FALLBACK ── */}
      <Route path="*" element={<Navigate to="/login" replace />} />

    </Routes>
  );
}

// ─── App wrapper ──────────────────────────────────────────────────────────────
export default function App() {
  return (
    <NotificationProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </NotificationProvider>
  );
}