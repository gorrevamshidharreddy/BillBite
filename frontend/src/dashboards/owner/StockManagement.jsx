import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Snackbar,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import api from '../../services/api';

const StockManagement = () => {
  const [stocks, setStocks] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [adjustQuantities, setAdjustQuantities] = useState({});
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/owner/stock');
      setStocks(res.data);
    } catch (err) {
      console.error(err);
      setSnackbar({ open: true, message: 'Failed to load stock', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMenuItems = useCallback(async () => {
    try {
      const res = await api.get('/owner/menu');
      setMenuItems(res.data.filter(item => item.item_type === 'packaged'));
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchStocks();
    fetchMenuItems();
  }, [fetchStocks, fetchMenuItems]);

  const handleAddStock = async () => {
    if (!selectedItem) {
      setSnackbar({ open: true, message: 'Please select an item', severity: 'warning' });
      return;
    }
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
      setSnackbar({ open: true, message: 'Quantity must be greater than 0', severity: 'warning' });
      return;
    }
    setLoading(true);
    try {
      await api.post('/owner/stock/add', {
        menu_item_id: selectedItem,
        quantity: qty,
      });
      setSnackbar({ open: true, message: 'Stock added successfully', severity: 'success' });
      setSelectedItem('');
      setQuantity(0);
      fetchStocks();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.detail || 'Failed to add stock', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAdjust = async (menu_item_id) => {
    const qty = adjustQuantities[menu_item_id];
    if (!qty || qty === 0 || isNaN(parseInt(qty))) {
      setSnackbar({ open: true, message: 'Enter a non-zero adjustment', severity: 'warning' });
      return;
    }
    setLoading(true);
    try {
      await api.post('/owner/stock/adjust', {
        menu_item_id,
        quantity_change: parseInt(qty),
      });
      setSnackbar({ open: true, message: 'Stock adjusted successfully', severity: 'success' });
      setAdjustQuantities(prev => ({ ...prev, [menu_item_id]: '' }));
      fetchStocks();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.detail || 'Failed to adjust stock', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustChange = (menu_item_id, value) => {
    setAdjustQuantities(prev => ({ ...prev, [menu_item_id]: value }));
  };

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Typography variant="h5" fontWeight={600} gutterBottom>
          Packaged Stock Management
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage inventory for packaged food items (beverages, snacks, etc.). Add new stock or adjust quantities manually.
        </Typography>
      </Paper>

      {/* Add Stock Form */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom>
          Add Stock
        </Typography>
        <Grid container spacing={2} alignItems="flex-end">
          <Grid item xs={12} sm={5}>
            <FormControl fullWidth>
              <InputLabel>Packaged Item</InputLabel>
              <Select
                value={selectedItem}
                onChange={(e) => setSelectedItem(e.target.value)}
                label="Packaged Item"
              >
                <MenuItem value="">-- Select item --</MenuItem>
                {menuItems.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name} (₹{item.price})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label="Quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              InputProps={{ inputProps: { min: 0 } }}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Button
              fullWidth
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddStock}
              disabled={loading}
            >
              Add Stock
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Current Stock Table */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Current Stock</Typography>
          <Tooltip title="Refresh">
            <IconButton onClick={fetchStocks} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : stocks.length === 0 ? (
          <Alert severity="info">No packaged stock items found. Add some packaged items to your menu first.</Alert>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Item Name</TableCell>
                  <TableCell align="center">Current Stock</TableCell>
                  <TableCell align="center">Low Stock Alert</TableCell>
                  <TableCell align="center">Adjustment</TableCell>
                  <TableCell align="center">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stocks.map((stock) => (
                  <TableRow key={stock.stock_id} hover>
                    <TableCell>{stock.item_name}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={stock.quantity_in_stock}
                        color={stock.quantity_in_stock <= stock.low_stock_threshold ? 'warning' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="center">{stock.low_stock_threshold}</TableCell>
                    <TableCell align="center">
                      <TextField
                        size="small"
                        type="number"
                        placeholder="+/-"
                        value={adjustQuantities[stock.menu_item_id] || ''}
                        onChange={(e) => handleAdjustChange(stock.menu_item_id, e.target.value)}
                        sx={{ width: 100 }}
                        InputProps={{
                          startAdornment: <InputAdornment position="start">±</InputAdornment>,
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleAdjust(stock.menu_item_id)}
                        disabled={loading}
                      >
                        Apply
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default StockManagement;