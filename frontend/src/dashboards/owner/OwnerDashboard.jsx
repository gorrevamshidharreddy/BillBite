// frontend/src/dashboards/owner/OwnerDashboard.jsx
import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  useMediaQuery,
  useTheme,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  Snackbar,
} from '@mui/material';
import api from '../../services/api';
import MenuIcon from '@mui/icons-material/Menu';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import InventoryIcon from '@mui/icons-material/Inventory';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import AssessmentIcon from '@mui/icons-material/Assessment';
import LogoutIcon from '@mui/icons-material/Logout';
import StoreIcon from '@mui/icons-material/Store';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import TenantSwitcher from '../../components/TenantSwitcher';

const drawerWidth = 240;

// Navigation items for Restaurant
const restaurantNavItems = [
  { text: 'Menu', icon: <RestaurantMenuIcon />, path: '/owner/menu' },
  { text: 'Stock', icon: <InventoryIcon />, path: '/owner/stock' },
  { text: 'Expenses', icon: <AttachMoneyIcon />, path: '/owner/expenses' },
  { text: 'Staff', icon: <PeopleAltIcon />, path: '/owner/staff' },
  { text: 'Reports', icon: <AssessmentIcon />, path: '/owner/reports' },
];

// Navigation items for Liquor Mart
const liquorNavItems = [
  { text: 'Stock Verification', icon: <InventoryIcon />, path: '/owner/liquor/stock-verification' },
  { text: 'Profit & Loss', icon: <AttachMoneyIcon />, path: '/owner/liquor/profit-loss' },
  { text: 'Analytics', icon: <TrendingUpIcon />, path: '/owner/liquor/analytics' },
  { text: 'Expenses', icon: <AttachMoneyIcon />, path: '/owner/expenses' },
  { text: 'Staff', icon: <PeopleAltIcon />, path: '/owner/staff' },
];

export default function OwnerDashboard() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { currentTenant, setCurrentTenant } = useTenant();

  // Mart Request related states
  const [tenantDetails, setTenantDetails] = useState(null);
  const [openMartDialog, setOpenMartDialog] = useState(false);
  const [martName, setMartName] = useState('');
  const [martAddress, setMartAddress] = useState('');
  const [martRequestLoading, setMartRequestLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const isLiquorMart = currentTenant?.business_type === 'liquor_mart';
  const navItems = isLiquorMart ? liquorNavItems : restaurantNavItems;

  const fetchTenantDetails = async () => {
    try {
      const res = await api.get('/owner/tenant');
      setTenantDetails(res.data);
      setMartName(res.data.mart_name || `${res.data.name} Mart`);
      setMartAddress(res.data.mart_address || res.data.address || '');
      
      // Update tenant context with newest info from DB
      if (setCurrentTenant && typeof setCurrentTenant === 'function') {
        setCurrentTenant({
          ...currentTenant,
          has_mart: res.data.has_mart,
          mart_approved: res.data.mart_approved,
          mart_name: res.data.mart_name,
          mart_address: res.data.mart_address,
        });
      }
    } catch (err) {
      console.error('Failed to fetch tenant details', err);
    }
  };

  useEffect(() => {
    if (currentTenant) {
      fetchTenantDetails();
    }
  }, [currentTenant]);

  const handleMartRequestSubmit = async () => {
    if (!martName.trim() || !martAddress.trim()) {
      setSnackbar({ open: true, message: 'Mart name and address are required', severity: 'warning' });
      return;
    }
    setMartRequestLoading(true);
    try {
      await api.post('/owner/mart/request', {
        mart_name: martName,
        mart_address: martAddress,
      });
      setSnackbar({ open: true, message: 'Mart activation request submitted successfully!', severity: 'success' });
      setOpenMartDialog(false);
      fetchTenantDetails();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.detail || 'Failed to submit request', severity: 'error' });
    } finally {
      setMartRequestLoading(false);
    }
  };

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="h6" fontWeight={700} color="primary">
          BillBite
        </Typography>
        <Chip
          label={isLiquorMart ? 'Liquor Mart' : 'Restaurant'}
          size="small"
          color={isLiquorMart ? 'warning' : 'info'}
          sx={{ mt: 1 }}
        />
      </Box>
      <List sx={{ flexGrow: 1 }}>
        {navItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => {
                navigate(item.path);
                setMobileOpen(false);
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <ListItem disablePadding>
          <ListItemButton onClick={logout}>
            <ListItemIcon><LogoutIcon /></ListItemIcon>
            <ListItemText primary="Logout" />
          </ListItemButton>
        </ListItem>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          {isMobile && (
            <IconButton color="inherit" edge="start" onClick={handleDrawerToggle} sx={{ mr: 2 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {isLiquorMart ? 'Liquor Mart Dashboard' : 'Restaurant Dashboard'}
          </Typography>
          <TenantSwitcher />
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={handleDrawerToggle}
            ModalProps={{ keepMounted: true }}
            sx={{ '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }}
          >
            {drawer}
          </Drawer>
        ) : (
          <Drawer
            variant="permanent"
            sx={{ '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }}
            open
          >
            {drawer}
          </Drawer>
        )}
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          mt: 8,
        }}
      >
        {/* Mart Activation alert banner for Liquor Mart owners */}
        {isLiquorMart && tenantDetails && !tenantDetails.has_mart && (
          <Alert 
            severity={tenantDetails.mart_approved ? "success" : "warning"}
            action={
              !tenantDetails.mart_approved && (
                <Button color="inherit" size="small" variant="outlined" onClick={() => setOpenMartDialog(true)}>
                  Request Activation
                </Button>
              )
            }
            sx={{ mb: 3 }}
          >
            {tenantDetails.mart_approved 
              ? "Your Mart activation request has been approved! Re-log in or refresh your session to see the Mart POS options."
              : "Mart features are not active. Request activation to unlock Mart POS, Stock Transfer, and separate Mart stock tracking."}
          </Alert>
        )}

        <Outlet />

        {/* Mart Activation Dialog */}
        <Dialog open={openMartDialog} onClose={() => setOpenMartDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Request Mart Activation</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter the name and address of the Mart to request activation. An admin will review and approve your request.
            </Typography>
            <TextField
              autoFocus
              margin="dense"
              label="Mart Name"
              type="text"
              fullWidth
              variant="outlined"
              value={martName}
              onChange={(e) => setMartName(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              margin="dense"
              label="Mart Address"
              type="text"
              fullWidth
              variant="outlined"
              multiline
              rows={3}
              value={martAddress}
              onChange={(e) => setMartAddress(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenMartDialog(false)} disabled={martRequestLoading}>Cancel</Button>
            <Button variant="contained" onClick={handleMartRequestSubmit} disabled={martRequestLoading}>
              Submit Request
            </Button>
          </DialogActions>
        </Dialog>

        {/* Snackbar for notifications */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </Box>
  );
}