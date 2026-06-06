// frontend/src/dashboards/owner/OwnerDashboard.jsx
import { useState } from 'react';
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
} from '@mui/material';
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
  const { currentTenant } = useTenant();

  const isLiquorMart = currentTenant?.business_type === 'liquor_mart';
  const navItems = isLiquorMart ? liquorNavItems : restaurantNavItems;

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
        <Outlet />
      </Box>
    </Box>
  );
}