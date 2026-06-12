import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './dashboards/LoginPage';
import AdminDashboard from './dashboards/admin/AdminDashboard';
import OwnerDashboard from './dashboards/owner/OwnerDashboard';
import CashierDashboard from './dashboards/cashier/CashierDashboard';
import ProtectedRoute from './components/ProtectedRoute';
import { useTenant } from './context/TenantContext';

const OwnerIndexRedirect = () => {
  return <Navigate to="liquor/daily-stock" />;
};

// Admin sub-pages
import TenantManagement from './dashboards/admin/TenantManagement';
import MartRequests from './dashboards/admin/MartRequests';
import PlatformAnalytics from './dashboards/admin/PlatformAnalytics';
import Subscription from './dashboards/admin/Subscription';
import SupportTickets from './dashboards/admin/SupportTickets';

import ExpenseLog from './dashboards/owner/ExpenseLog';
import StaffManagement from './dashboards/owner/StaffManagement';
import Reports from './dashboards/owner/Reports';

// Owner sub-pages (Liquor)
import LiquorOwnerTab from './dashboards/owner/LiquorOwnerTab';

// Cashier sub-pages
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
        <Route path="expenses" element={<ExpenseLog />} />
        <Route path="staff" element={<StaffManagement />} />
        <Route path="reports" element={<Reports />} />
        {/* Liquor */}
        <Route path="liquor/daily-stock" element={<DailyStock isOwnerView={true} />} />
        <Route path="liquor/profit-loss" element={<LiquorOwnerTab />} />
        <Route path="liquor/analytics" element={<LiquorOwnerTab />} />
        <Route index element={<OwnerIndexRedirect />} />
      </Route>

      {/* Cashier routes */}
      <Route path="/cashier/*" element={<ProtectedRoute allowedRole="cashier"><CashierDashboard /></ProtectedRoute>}>
          {/* Liquor */}
          <Route path="liquor-pos" element={<LiquorPOS />} />
          <Route path="upload-invoice" element={<UploadInvoice />} />
          <Route path="daily-stock" element={<DailyStock />} />
          <Route path="manual-stock" element={<ManualStockEntry />} />
          <Route path="stock-transfer" element={<StockTransfer />} />   {/* <-- NEW ROUTE */}
          <Route path="expenditure" element={<Expenditure />} />
          {/* Common */}
          <Route path="history" element={<OrderHistory />} />
          <Route index element={<Navigate to="daily-stock" />} />
        </Route>

      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}

export default App;