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

  const [tenantsLoaded, setTenantsLoaded] = useState(false);

  // Sync available tenants from AuthContext or fetch on reload
  useEffect(() => {
    let isMounted = true;
    if (authTenants && authTenants.length > 0) {
      setAvailableTenants(authTenants);
      setTenantsLoaded(true);
    } else if (user && user.role === 'admin') {
      setAvailableTenants([]);
      setTenantsLoaded(true);
    } else if (token && user) {
      // If we have token and user but no tenants, we might be reloading. Fetch them.
      api.get('/auth/tenants')
        .then(res => {
          if (isMounted) {
            setAvailableTenants(res.data?.tenants || []);
            setTenantsLoaded(true);
          }
        })
        .catch(err => {
          console.error('Failed to fetch tenants on reload', err);
          if (isMounted) setTenantsLoaded(true);
        });
    } else if (!token) {
      setAvailableTenants([]);
      setTenantsLoaded(true);
    }
    return () => { isMounted = false; };
  }, [authTenants, user, token]);

  // Consolidate currentTenant setting logic
  useEffect(() => {
    if (!token) {
      setCurrentTenant(null);
      setLoading(false);
      return;
    }

    if (!tenantsLoaded || !user) {
      return; // wait until tenants have finished loading and user is parsed
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
    
    // Default to first available tenant
    if (availableTenants.length > 0) {
      setCurrentTenant(availableTenants[0]);
      localStorage.setItem('currentTenantId', availableTenants[0].id);
      setLoading(false);
      return;
    }

    // Fallback: If no availableTenants (e.g., on reload), use user.tenant_id from token
    if (user.tenant_id) {
      const fallbackTenant = {
        id: user.tenant_id,
        business_type: user.business_type,
        name: user.name,
      };
      setCurrentTenant(fallbackTenant);
      localStorage.setItem('currentTenantId', user.tenant_id);
      setLoading(false);
      return;
    }

    // If we reach here, there's no tenant at all
    setCurrentTenant(null);
    setLoading(false);
  }, [token, availableTenants, tenantsLoaded, user]);

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