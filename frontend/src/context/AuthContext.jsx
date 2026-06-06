import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [tenants, setTenants] = useState([]);

  useEffect(() => {
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({
          id: payload.sub,
          role: payload.role,
          tenant_id: payload.tenant_id,
          name: payload.full_name || payload.name || 'User',
          business_type: payload.business_type,
          has_mart: payload.has_mart || false,
          mart_approved: payload.mart_approved || false,
          phone: payload.phone || null,
        });
      } catch (err) {
        console.error('Failed to parse token', err);
        localStorage.removeItem('token');
        setToken(null);
      }
    }
  }, [token]);

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { access_token, role, user_id, name, tenants: userTenants } = response.data;

      localStorage.setItem('token', access_token);
      setToken(access_token);
      setTenants(userTenants || []);

      const defaultTenant = userTenants && userTenants.length > 0 ? userTenants[0] : null;
      
      // Decode token to get additional fields (business_type, has_mart, etc.)
      let additionalUserFields = {};
      try {
        const payload = JSON.parse(atob(access_token.split('.')[1]));
        additionalUserFields = {
          business_type: payload.business_type,
          has_mart: payload.has_mart || false,
          mart_approved: payload.mart_approved || false,
          phone: payload.phone || null,
        };
      } catch (e) {
        console.warn('Could not decode token for additional fields', e);
      }
      
      setUser({
        id: user_id,
        role,
        tenant_id: defaultTenant?.id || null,
        name: name || 'User',
        ...additionalUserFields,
      });

      return response.data;
    } catch (error) {
      console.error('Login error details:', error.response?.data || error.message);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setTenants([]);
  };

  return (
    <AuthContext.Provider value={{ user, token, tenants, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);