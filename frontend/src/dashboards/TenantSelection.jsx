// frontend/src/dashboards/TenantSelection.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Avatar,
  CircularProgress,
  Alert,
  Paper,
} from '@mui/material';
import {
  Storefront as StoreIcon,
  Restaurant as RestaurantIcon,
  Liquor as LiquorIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';

export default function TenantSelection() {
  const navigate = useNavigate();
  const { user, tenants: authTenants, token } = useAuth();
  const { setCurrentTenant, availableTenants, refreshTenants, loading: tenantLoading } = useTenant();
  const [localLoading, setLocalLoading] = useState(false);
  const [error, setError] = useState(null);

  // Use tenants from AuthContext or from TenantContext (they should be same)
  const tenantsList = availableTenants.length > 0 ? availableTenants : authTenants;

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    // If no tenants loaded yet, try to refresh
    if (tenantsList.length === 0 && !tenantLoading) {
      refreshTenants().catch(err => setError('Failed to load businesses'));
    }
  }, [token, tenantsList, tenantLoading, refreshTenants, navigate]);

  const getBusinessIcon = (businessType) => {
    switch (businessType) {
      case 'restaurant':
        return <RestaurantIcon sx={{ fontSize: 40 }} />;
      case 'liquor_mart':
        return <LiquorIcon sx={{ fontSize: 40 }} />;
      default:
        return <StoreIcon sx={{ fontSize: 40 }} />;
    }
  };

  const getBusinessLabel = (businessType) => {
    switch (businessType) {
      case 'restaurant': return 'Restaurant';
      case 'liquor_mart': return 'Liquor Mart';
      default: return 'Business';
    }
  };

  const handleSelectTenant = async (tenant) => {
    setLocalLoading(true);
    setError(null);
    try {
      await setCurrentTenant(tenant);
      // Navigate to the appropriate dashboard based on user role
      const dashboardPath = user?.role === 'owner' ? '/owner' : '/cashier';
      navigate(dashboardPath);
    } catch (err) {
      console.error('Failed to select tenant', err);
      setError('Could not switch to this business. Please try again.');
    } finally {
      setLocalLoading(false);
    }
  };

  if (tenantLoading || localLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Alert severity="error" action={
          <button onClick={() => window.location.reload()}>Retry</button>
        }>
          {error}
        </Alert>
      </Container>
    );
  }

  if (!tenantsList || tenantsList.length === 0) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            No businesses found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            You don't have access to any restaurant or liquor mart. Please contact your administrator.
          </Typography>
        </Paper>
      </Container>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
        py: 6,
      }}
    >
      <Container maxWidth="md">
        <Box textAlign="center" mb={5}>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Select Your Business
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Choose a restaurant or liquor mart to continue
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {tenantsList.map((tenant) => (
            <Grid item xs={12} sm={6} key={tenant.id}>
              <Card
                sx={{
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 6,
                  },
                }}
              >
                <CardActionArea onClick={() => handleSelectTenant(tenant)}>
                  <CardContent sx={{ textAlign: 'center', py: 4 }}>
                    <Avatar
                      sx={{
                        width: 80,
                        height: 80,
                        bgcolor: 'primary.light',
                        margin: '0 auto 16px',
                      }}
                    >
                      {getBusinessIcon(tenant.business_type)}
                    </Avatar>
                    <Typography variant="h6" fontWeight={600} gutterBottom>
                      {tenant.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {getBusinessLabel(tenant.business_type)}
                    </Typography>
                    {tenant.address && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        {tenant.address}
                      </Typography>
                    )}
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}