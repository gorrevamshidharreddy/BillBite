import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './dashboards/LoginPage';
import TenantSelection from './dashboards/TenantSelection';
import AdminDashboard from './dashboards/admin/AdminDashboard';
import OwnerDashboard from './dashboards/owner/OwnerDashboard';
import CashierDashboard from './dashboards/cashier/CashierDashboard';
import ProtectedRoute from './components/ProtectedRoute';

// Admin sub-pages
import TenantManagement from './dashboards/admin/TenantManagement';
import MartRequests from './dashboards/admin/MartRequests';
import PlatformAnalytics from './dashboards/admin/PlatformAnalytics';
import Subscription from './dashboards/admin/Subscription';
import SupportTickets from './dashboards/admin/SupportTickets';

// Owner sub-pages (Restaurant)
import MenuManagement from './dashboards/owner/MenuManagement';
import StockManagement from './dashboards/owner/StockManagement';
import ExpenseLog from './dashboards/owner/ExpenseLog';
import StaffManagement from './dashboards/owner/StaffManagement';
import Reports from './dashboards/owner/Reports';

// Owner sub-pages (Liquor)
import LiquorOwnerTab from './dashboards/owner/LiquorOwnerTab';

// Cashier sub-pages (Restaurant)
import POS from './dashboards/cashier/POS';
import OrderHistory from './dashboards/cashier/OrderHistory';

// Cashier sub-pages (Liquor)
import LiquorPOS from './dashboards/cashier/LiquorPOS';
import UploadInvoice from './dashboards/cashier/UploadInvoice';
import DailyStock from './dashboards/cashier/DailyStock';
import ManualStockEntry from './dashboards/cashier/ManualStockEntry';
import StockTransfer from './dashboards/cashier/StockTransfer';   // <-- NEW
import Expenditure from './dashboards/cashier/Expenditure';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/select-tenant" element={<TenantSelection />} />

      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute allowedRole="admin"><AdminDashboard /></ProtectedRoute>}>
        <Route path="tenants" element={<TenantManagement />} />

        <Route path="analytics" element={<PlatformAnalytics />} />
        <Route path="support" element={<SupportTickets />} />
        <Route path="mart-requests" element={<MartRequests />} />
        <Route index element={<Navigate to="tenants" />} />
      </Route>

      {/* Owner routes */}
      <Route path="/owner" element={<ProtectedRoute allowedRole="owner"><OwnerDashboard /></ProtectedRoute>}>
        {/* Restaurant */}
        <Route path="menu" element={<MenuManagement />} />
        <Route path="stock" element={<StockManagement />} />
        <Route path="expenses" element={<ExpenseLog />} />
        <Route path="staff" element={<StaffManagement />} />
        <Route path="reports" element={<Reports />} />
        {/* Liquor */}
        <Route path="liquor/stock-verification" element={<LiquorOwnerTab />} />
        <Route path="liquor/profit-loss" element={<LiquorOwnerTab />} />
        <Route path="liquor/analytics" element={<LiquorOwnerTab />} />
        <Route index element={<Navigate to="menu" />} />
      </Route>

      {/* Cashier routes */}
      <Route path="/cashier/*" element={<ProtectedRoute allowedRole="cashier"><CashierDashboard /></ProtectedRoute>}>
          {/* Restaurant */}
          <Route path="pos" element={<POS />} />
          {/* Liquor */}
          <Route path="liquor-pos" element={<LiquorPOS />} />
          <Route path="upload-invoice" element={<UploadInvoice />} />
          <Route path="daily-stock" element={<DailyStock />} />
          <Route path="manual-stock" element={<ManualStockEntry />} />
          <Route path="stock-transfer" element={<StockTransfer />} />   {/* <-- NEW ROUTE */}
          <Route path="expenditure" element={<Expenditure />} />
          {/* Common */}
          <Route path="history" element={<OrderHistory />} />
          <Route index element={<Navigate to="pos" />} />
        </Route>

      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}

export default App;