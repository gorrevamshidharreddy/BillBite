import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
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
  CircularProgress,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import HistoryIcon from '@mui/icons-material/History';
import LogoutIcon from '@mui/icons-material/Logout';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AddIcon from '@mui/icons-material/Add';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'; // for stock transfer
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import api from '../../services/api';

const drawerWidth = 200;

export default function CashierDashboard() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { currentTenant } = useTenant();
  const [assignments, setAssignments] = useState({ assigned_to_shop: false, assigned_to_mart: false });
  const [loading, setLoading] = useState(true);

  // Fetch cashier assignments (shop/mart)
  useEffect(() => {
    const fetchAssignments = async () => {
      if (!currentTenant) return;
      try {
        const res = await api.get('/cashier/my-assignments');
        setAssignments(res.data);
      } catch (err) {
        console.error('Failed to fetch assignments', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAssignments();
  }, [currentTenant]);

  const handleNavigate = (path) => {
    navigate(path);
    setMobileOpen(false);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  const isLiquorMart = currentTenant?.business_type === 'liquor_mart';
  // For liquor mart, we show mart‑specific items only if cashier is assigned to mart;
  // shop‑specific items (invoice, manual stock, transfer) only if assigned to shop.
  const showMartItems = isLiquorMart && assignments.assigned_to_mart;
  const showShopItems = isLiquorMart && assignments.assigned_to_shop;

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="h6" color="primary" fontWeight={700}>
          BillBite
        </Typography>
      </Box>

      <List sx={{ flexGrow: 1 }}>
        {/* POS – only if assigned to mart */}
        {showMartItems && (
          <ListItem disablePadding>
            <ListItemButton onClick={() => handleNavigate('/cashier/liquor-pos')}>
              <ListItemIcon><PointOfSaleIcon /></ListItemIcon>
              <ListItemText primary="POS" />
            </ListItemButton>
          </ListItem>
        )}

        {/* Shop‑only features */}
        {showShopItems && (
          <>
            <ListItem disablePadding>
              <ListItemButton onClick={() => handleNavigate('/cashier/upload-invoice')}>
                <ListItemIcon><UploadFileIcon /></ListItemIcon>
                <ListItemText primary="Upload Invoice" />
              </ListItemButton>
            </ListItem>
            <ListItem disablePadding>
              <ListItemButton onClick={() => handleNavigate('/cashier/manual-stock')}>
                <ListItemIcon><AddIcon /></ListItemIcon>
                <ListItemText primary="Manual Stock" />
              </ListItemButton>
            </ListItem>
            <ListItem disablePadding>
              <ListItemButton onClick={() => handleNavigate('/cashier/stock-transfer')}>
                <ListItemIcon><SwapHorizIcon /></ListItemIcon>
                <ListItemText primary="Stock Transfer" />
              </ListItemButton>
            </ListItem>
          </>
        )}

        {/* Daily stock – only if assigned to mart */}
        {showMartItems && (
          <ListItem disablePadding>
            <ListItemButton onClick={() => handleNavigate('/cashier/daily-stock')}>
              <ListItemIcon><AssessmentIcon /></ListItemIcon>
              <ListItemText primary="Daily Stock" />
            </ListItemButton>
          </ListItem>
        )}

        {/* Order History – common for all cashiers */}
        <ListItem disablePadding>
          <ListItemButton onClick={() => handleNavigate('/cashier/history')}>
            <ListItemIcon><HistoryIcon /></ListItemIcon>
            <ListItemText primary="History" />
          </ListItemButton>
        </ListItem>
      </List>

      <List>
        <ListItem disablePadding>
          <ListItemButton onClick={logout}>
            <ListItemIcon><LogoutIcon /></ListItemIcon>
            <ListItemText primary="Logout" />
          </ListItemButton>
        </ListItem>
      </List>
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
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen(!mobileOpen)}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6">Cashier Panel</Typography>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: 0 }}>
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{ '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' } }}
          >
            {drawer}
          </Drawer>
        ) : (
          <Drawer
            variant="permanent"
            sx={{ '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' } }}
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
        <Outlet />
      </Box>
    </Box>
  );
}