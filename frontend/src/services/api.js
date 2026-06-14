// frontend/src/services/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000',  // hardcoded for testing
});

// Attach token and tenant ID to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const tenantId = localStorage.getItem('currentTenantId');
  if (tenantId) {
    config.headers['X-Tenant-ID'] = tenantId;
  }

  return config;
});

// Handle 401 errors – DON'T redirect for login request
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      error.config.url !== '/auth/login'
    ) {
      localStorage.removeItem('token');
      localStorage.removeItem('currentTenantId');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;