import React, { useState } from 'react';
import {
  Box,
  Menu,
  MenuItem,
  Avatar,
  Typography,
  IconButton,
  ListItemIcon,
  ListItemText,
  Divider,
  CircularProgress,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  Storefront as StoreIcon,
  Restaurant as RestaurantIcon,
  Liquor as LiquorIcon,
  SwapHoriz as SwapIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';

export default function TenantSwitcher() {
  const { user } = useAuth();
  const {
    currentTenant,
    setCurrentTenant,
    availableTenants,
    refreshTenants,
  } = useTenant();

  const [anchorEl, setAnchorEl] = useState(null);
  const [loading, setLoading] = useState(false);
  const open = Boolean(anchorEl);

  // Only show switcher if user has access to more than one tenant
  // Allow admin, owner, and co_owner
  if (!user || (user.role !== 'admin' && user.role !== 'owner' && user.role !== 'co_owner') || availableTenants.length <= 1) {
    return null;
  }

  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSwitchTenant = async (tenant) => {
    setLoading(true);
    try {
      await setCurrentTenant(tenant);
      // Optional: refresh any dashboard data after switch
      if (window.location.pathname.includes('/owner') || window.location.pathname.includes('/cashier')) {
        window.location.reload(); // simple reload to refresh all data
      }
    } catch (error) {
      console.error('Failed to switch tenant', error);
    } finally {
      setLoading(false);
      handleClose();
    }
  };

  const getBusinessIcon = (businessType) => {
    if (businessType === 'restaurant') return <RestaurantIcon fontSize="small" />;
    if (businessType === 'liquor_mart') return <LiquorIcon fontSize="small" />;
    return <StoreIcon fontSize="small" />;
  };

  const currentBusinessIcon = currentTenant
    ? getBusinessIcon(currentTenant.business_type)
    : <StoreIcon />;

  return (
    <Box sx={{ px: 2, py: 1 }}>
      <Tooltip title="Switch Business">
        <IconButton
          onClick={handleOpen}
          size="medium"
          sx={{
            width: '100%',
            justifyContent: 'flex-start',
            borderRadius: 2,
            bgcolor: open ? 'action.hover' : 'transparent',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
            {currentBusinessIcon}
            <Typography variant="body2" noWrap sx={{ flex: 1, textAlign: 'left' }}>
              {currentTenant?.name || 'Select Business'}
              {currentTenant?.has_mart && (
                <Chip
                  label="Mart"
                  size="small"
                  sx={{ ml: 1, height: 18, fontSize: '0.6rem' }}
                />
              )}
            </Typography>
            <SwapIcon fontSize="small" color="action" />
          </Box>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: {
            mt: 1.5,
            minWidth: 240,
            maxHeight: 300,
            borderRadius: 2,
            boxShadow: 3,
          },
        }}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      >
        {availableTenants.map((tenant) => {
          const isCurrent = currentTenant?.id === tenant.id;
          return (
            <MenuItem
              key={tenant.id}
              onClick={() => handleSwitchTenant(tenant)}
              selected={isCurrent}
              disabled={loading}
              sx={{ borderRadius: 1, mx: 0.5, my: 0.25 }}
            >
              <ListItemIcon>
                {getBusinessIcon(tenant.business_type)}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {tenant.name}
                    {tenant.has_mart && (
                      <Chip
                        label="Mart"
                        size="small"
                        sx={{ height: 18, fontSize: '0.6rem' }}
                      />
                    )}
                  </Box>
                }
                secondary={tenant.business_type === 'restaurant' ? 'Restaurant' : 'Liquor Mart'}
                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
              />
              {isCurrent && (
                <CheckIcon fontSize="small" color="primary" />
              )}
            </MenuItem>
          );
        })}
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          onClick={() => {
            handleClose();
            // Optionally navigate to tenant selection page
            window.location.href = '/select-tenant';
          }}
          sx={{ borderRadius: 1, mx: 0.5 }}
        >
          <ListItemIcon>
            <SwapIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="View All Businesses" />
        </MenuItem>
      </Menu>

      {loading && (
        <Box sx={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1300 }}>
          <CircularProgress size={24} />
        </Box>
      )}
    </Box>
  );
}