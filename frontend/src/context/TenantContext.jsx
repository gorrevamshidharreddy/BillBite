// frontend/src/context/TenantContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../services/api';

const TenantContext = createContext();

export function TenantProvider({ children }) {
  const { user, tenants: authTenants, token } = useAuth();
  const [currentTenant, setCurrentTenant] = useState(null);
  const [availableTenants, setAvailableTenants] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sync available tenants from AuthContext
  useEffect(() => {
    if (authTenants && authTenants.length > 0) {
      setAvailableTenants(authTenants);
    } else if (user && user.role === 'admin') {
      // For admin, we may want to fetch all tenants from the backend
      // But we'll keep existing behavior: empty array and let refreshTenants fetch.
      setAvailableTenants([]);
    } else {
      setAvailableTenants([]);
    }
  }, [authTenants, user]);

  // Load saved tenant from localStorage or set default
  useEffect(() => {
    if (!token) {
      setCurrentTenant(null);
      setLoading(false);
      return;
    }

    const savedTenantId = localStorage.getItem('currentTenantId');
    if (savedTenantId && availableTenants.length > 0) {
      const found = availableTenants.find(t => t.id === savedTenantId);
      if (found) {
        setCurrentTenant(found);
        setLoading(false);
        return;
      }
    }
    // Default to first tenant if any
    if (availableTenants.length > 0) {
      setCurrentTenant(availableTenants[0]);
      localStorage.setItem('currentTenantId', availableTenants[0].id);
    } else {
      setCurrentTenant(null);
    }
    setLoading(false);
  }, [token, availableTenants]);

  // Update axios header when tenant changes
  useEffect(() => {
    if (currentTenant && currentTenant.id) {
      api.defaults.headers['X-Tenant-ID'] = currentTenant.id;
      localStorage.setItem('currentTenantId', currentTenant.id);
    } else if (!currentTenant && token) {
      // For admin without tenant, clear header
      delete api.defaults.headers['X-Tenant-ID'];
      localStorage.removeItem('currentTenantId');
    }
  }, [currentTenant, token]);

  const switchTenant = useCallback(async (tenant) => {
    if (!tenant || !tenant.id) return;
    setCurrentTenant(tenant);
    localStorage.setItem('currentTenantId', tenant.id);
    // Optionally re-fetch any user-specific data or reload the page
    return Promise.resolve();
  }, []);

  const refreshTenants = useCallback(async () => {
    // Re-fetch tenants from backend (e.g., after tenant creation)
    if (!token) return;
    try {
      const response = await api.get('/auth/tenants'); // assuming you have an endpoint
      if (response.data && response.data.tenants) {
        setAvailableTenants(response.data.tenants);
      }
    } catch (error) {
      console.error('Failed to refresh tenants', error);
    }
  }, [token]);

  const value = {
    currentTenant,
    setCurrentTenant: switchTenant,
    availableTenants,
    refreshTenants,
    loading,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};