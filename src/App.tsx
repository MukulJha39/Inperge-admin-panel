import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import {
  CATALOG_PERMISSIONS,
  ORDER_PERMISSIONS,
  PERMISSIONS,
  RELATIONSHIP_PERMISSIONS,
} from './auth/permissions';
import { AppShell } from './components/AppShell';
import { ToastProvider } from './components/Toast';
import { AccountPage } from './pages/AccountPage';
import { AuditPage } from './pages/AuditPage';
import { ChangePasswordGate } from './pages/ChangePasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import {
  ItemsPage,
  LowStockPage,
  MaterialsPage,
  ServicesPage,
  StockActivityPage,
} from './pages/CatalogPages';
import { NotFoundPage } from './pages/FallbackPages';
import { LoginPage } from './pages/LoginPage';
import { MerchantDetailPage } from './pages/MerchantDetailPage';
import { MerchantsPage } from './pages/MerchantsPage';
import {
  InstallmentsPage,
  OrdersPage,
  PaymentsPage,
  ReceivablesPage,
} from './pages/OrderPages';
import { CustomersPage, PurchasesPage, SuppliersPage } from './pages/RelationshipPages';
import { RolesPage } from './pages/RolesPage';
import { UnitsPage } from './pages/UnitsPage';
import { TeamPage } from './pages/TeamPage';
import { ProtectedRoute, RequirePermission } from './routes/ProtectedRoute';

/**
 * Sends an admin to the overview, or past it when their role summarises nothing.
 *
 * The dashboard adapts to what a role may see, so for almost everyone it is the right
 * landing place. A role that can open none of the sections it draws on would land on an
 * empty page, so it is skipped for the first section they can actually use.
 */
function LandingRedirect() {
  const { can, canAny } = useAuth();
  if (
    canAny(
      PERMISSIONS.MERCHANT_VIEW,
      ORDER_PERMISSIONS.ORDER_VIEW,
      ORDER_PERMISSIONS.PAYMENT_VIEW,
      CATALOG_PERMISSIONS.STOCK_VIEW,
      PERMISSIONS.AUDIT_VIEW,
    )
  ) {
    return <Navigate to="/dashboard" replace />;
  }
  if (can(PERMISSIONS.ROLE_VIEW)) return <Navigate to="/roles" replace />;
  return <Navigate to="/account" replace />;
}

function AuthenticatedApp() {
  const { admin } = useAuth();

  /*
   * An admin still carrying a password somebody else chose gets the change-password
   * screen and nothing else. This mirrors the API, which refuses every other admin
   * endpoint in that state — a panel whose every link returned 403 would only confuse.
   */
  if (admin?.mustChangePassword) return <ChangePasswordGate />;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<LandingRedirect />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route
          path="/merchants"
          element={
            <RequirePermission permissions={[PERMISSIONS.MERCHANT_VIEW]}>
              <MerchantsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/merchants/:id"
          element={
            <RequirePermission permissions={[PERMISSIONS.MERCHANT_VIEW]}>
              <MerchantDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path="/items"
          element={
            <RequirePermission permissions={[CATALOG_PERMISSIONS.ITEM_VIEW]}>
              <ItemsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/services"
          element={
            <RequirePermission permissions={[CATALOG_PERMISSIONS.SERVICE_VIEW]}>
              <ServicesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/materials"
          element={
            <RequirePermission permissions={[CATALOG_PERMISSIONS.MATERIAL_VIEW]}>
              <MaterialsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/units"
          element={
            <RequirePermission permissions={[CATALOG_PERMISSIONS.ITEM_VIEW]}>
              <UnitsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/low-stock"
          element={
            <RequirePermission permissions={[CATALOG_PERMISSIONS.STOCK_VIEW]}>
              <LowStockPage />
            </RequirePermission>
          }
        />
        <Route
          path="/stock-activity"
          element={
            <RequirePermission permissions={[CATALOG_PERMISSIONS.STOCK_VIEW]}>
              <StockActivityPage />
            </RequirePermission>
          }
        />
        <Route
          path="/customers"
          element={
            <RequirePermission permissions={[RELATIONSHIP_PERMISSIONS.CUSTOMER_VIEW]}>
              <CustomersPage />
            </RequirePermission>
          }
        />
        <Route
          path="/suppliers"
          element={
            <RequirePermission permissions={[RELATIONSHIP_PERMISSIONS.SUPPLIER_VIEW]}>
              <SuppliersPage />
            </RequirePermission>
          }
        />
        <Route
          path="/purchases"
          element={
            <RequirePermission permissions={[RELATIONSHIP_PERMISSIONS.PURCHASE_VIEW]}>
              <PurchasesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/orders"
          element={
            <RequirePermission permissions={[ORDER_PERMISSIONS.ORDER_VIEW]}>
              <OrdersPage />
            </RequirePermission>
          }
        />
        <Route
          path="/receivables"
          element={
            <RequirePermission permissions={[ORDER_PERMISSIONS.PAYMENT_VIEW]}>
              <ReceivablesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/installments"
          element={
            <RequirePermission permissions={[ORDER_PERMISSIONS.INSTALLMENT_VIEW]}>
              <InstallmentsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/payments"
          element={
            <RequirePermission permissions={[ORDER_PERMISSIONS.PAYMENT_VIEW]}>
              <PaymentsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/team"
          element={
            <RequirePermission permissions={[PERMISSIONS.ADMIN_VIEW]}>
              <TeamPage />
            </RequirePermission>
          }
        />
        <Route
          path="/roles"
          element={
            <RequirePermission permissions={[PERMISSIONS.ROLE_VIEW]}>
              <RolesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/audit"
          element={
            <RequirePermission permissions={[PERMISSIONS.AUDIT_VIEW]}>
              <AuditPage />
            </RequirePermission>
          }
        />
        <Route path="/account" element={<AccountPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <AuthenticatedApp />
              </ProtectedRoute>
            }
          />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
