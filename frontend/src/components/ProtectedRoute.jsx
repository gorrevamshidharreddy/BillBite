import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useEffect, useState } from 'react';

export default function ProtectedRoute({ children, allowedRole }) {
  const { token, user } = useAuth();
  const { currentTenant, availableTenants, setCurrentTenant, loading: tenantLoading } = useTenant();
  const [autoRedirecting, setAutoRedirecting] = useState(false);

  // No token → not logged in
  if (!token) {
    return <Navigate to="/login" />;
  }

  // User data or tenant data still loading
  if (!user || tenantLoading) {
    return <div>Loading...</div>;
  }

  // Admin: no tenant needed, just check role
  if (user.role === 'admin') {
    if (allowedRole && user.role !== allowedRole) {
      return <Navigate to="/login" />;
    }
    return children;
  }

  // Non‑admin user: must have a selected tenant
  if (!currentTenant) {
    // If only one tenant exists, automatically select it and redirect to dashboard
    if (availableTenants.length === 1 && !autoRedirecting) {
      setAutoRedirecting(true);
      // Set the tenant and then navigate
      setCurrentTenant(availableTenants[0]);
      // Return null while the redirect happens; the next render will have currentTenant
      return null;
    }
    // Otherwise show tenant selection page
    return <Navigate to="/select-tenant" />;
  }

  // Role check
  if (allowedRole && user.role !== allowedRole) {
    return <Navigate to="/login" />;
  }

  return children;
}