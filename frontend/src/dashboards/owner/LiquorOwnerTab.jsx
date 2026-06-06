// frontend/src/dashboards/owner/LiquorOwnerTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  TrendingUp as TrendingUpIcon,
  Inventory as InventoryIcon,
  Warning as WarningIcon,
  AttachMoney as MoneyIcon,
  SwapHoriz as SwapHorizIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import api from '../../services/api';
import { useTenant } from '../../context/TenantContext';

const LiquorOwnerTab = () => {
  const { currentTenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [stockData, setStockData] = useState([]);
  const [profitLoss, setProfitLoss] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [plStartDate, setPlStartDate] = useState(new Date(new Date().setDate(1)));
  const [plEndDate, setPlEndDate] = useState(new Date());
  const [stockSearch, setStockSearch] = useState('');
  const [stockOrderBy, setStockOrderBy] = useState('brand_name');
  const [stockOrder, setStockOrder] = useState('asc');
  const [stockLocation, setStockLocation] = useState('shop'); // 'shop' or 'mart'
  const [transferHistory, setTransferHistory] = useState([]);
  const [transferHistoryLoading, setTransferHistoryLoading] = useState(false);

  // Fetch stock verification data (with location)
  const fetchStockVerification = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/owner/liquor/stock-verification', {
        params: { location: stockLocation }
      });
      setStockData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [stockLocation]);

  // Fetch profit & loss
  const fetchProfitLoss = useCallback(async () => {
    try {
      const params = {
        start_date: plStartDate.toISOString().split('T')[0],
        end_date: plEndDate.toISOString().split('T')[0],
      };
      const res = await api.get('/owner/liquor/profit-loss', { params });
      setProfitLoss(res.data);
    } catch (err) {
      console.error(err);
    }
  }, [plStartDate, plEndDate]);

  // Fetch analytics
  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await api.get('/owner/liquor/analytics');
      setAnalytics(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Fetch stock transfer history
  const fetchTransferHistory = useCallback(async () => {
    setTransferHistoryLoading(true);
    try {
      const res = await api.get('/owner/liquor/stock-transfer-history');
      setTransferHistory(res.data);
    } catch (err) {
      console.error('Failed to fetch transfer history', err);
    } finally {
      setTransferHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStockVerification();
    fetchProfitLoss();
    fetchAnalytics();
    fetchTransferHistory();
  }, [fetchStockVerification, fetchProfitLoss, fetchAnalytics, fetchTransferHistory]);

  // Stock table sorting
  const handleStockSort = (property) => {
    const isAsc = stockOrderBy === property && stockOrder === 'asc';
    setStockOrder(isAsc ? 'desc' : 'asc');
    setStockOrderBy(property);
  };

  const filteredStock = stockData.filter((item) =>
    item.brand_name.toLowerCase().includes(stockSearch.toLowerCase()) ||
    item.brand_code.includes(stockSearch)
  );

  const sortedStock = [...filteredStock].sort((a, b) => {
    let aVal = a[stockOrderBy];
    let bVal = b[stockOrderBy];
    if (stockOrderBy === 'stock_value') {
      aVal = a.stock_value;
      bVal = b.stock_value;
    }
    if (aVal < bVal) return stockOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return stockOrder === 'asc' ? 1 : -1;
    return 0;
  });

  // Export stock to CSV
  const exportStockCSV = () => {
    const headers = ['Brand Code', 'Size Code', 'Brand Name', 'Size (ml)', 'Current Stock', 'Unit Cost', 'MRP', 'Stock Value'];
    const rows = sortedStock.map((item) => [
      item.brand_code,
      item.size_code,
      item.brand_name,
      item.size_ml,
      item.current_stock,
      item.unit_cost,
      item.mrp,
      item.stock_value,
    ]);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock_verification_${stockLocation}_${new Date().toISOString().slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export transfer history to CSV
  const exportTransferHistoryCSV = () => {
    const headers = ['Product', 'Size (ml)', 'Cases', 'Loose', 'Total Bottles', 'Transfer Date', 'Transferred By', 'Notes'];
    const rows = transferHistory.map((item) => [
      item.product_name,
      item.size_ml,
      item.cases,
      item.loose_bottles,
      item.total_bottles,
      new Date(item.transfer_date).toLocaleString(),
      item.transferred_by,
      item.notes || '',
    ]);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock_transfers_${new Date().toISOString().slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Colors for pie chart
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: { xs: 1, md: 3 } }}>
        {/* Header */}
        <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
          <Typography variant="h5" fontWeight={600}>
            Liquor Mart Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Welcome back, {currentTenant?.name}
          </Typography>
        </Paper>

        {/* Summary Cards (from analytics) */}
        {analytics && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} sm={3}>
              <Card sx={{ bgcolor: '#e8f5e9' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="caption">Total Products</Typography>
                    <InventoryIcon color="success" />
                  </Box>
                  <Typography variant="h5">{analytics.total_products || stockData.length}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card sx={{ bgcolor: '#fff3e0' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="caption">Low Stock Items</Typography>
                    <WarningIcon color="warning" />
                  </Box>
                  <Typography variant="h5">{analytics.low_stock_alerts?.length || 0}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card sx={{ bgcolor: '#e3f2fd' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="caption">Top Brand Sales (30d)</Typography>
                    <TrendingUpIcon color="primary" />
                  </Box>
                  <Typography variant="body2" noWrap>
                    {analytics.top_brands?.[0]?.brand_name || '—'}
                  </Typography>
                  <Typography variant="caption">
                    {analytics.top_brands?.[0]?.quantity_sold || 0} bottles
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card sx={{ bgcolor: '#f3e5f5' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="caption">Net Profit (this period)</Typography>
                    <MoneyIcon color="secondary" />
                  </Box>
                  <Typography variant="h6">
                    ₹{profitLoss?.net_profit?.toLocaleString() || '—'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}

        {/* Profit & Loss Section */}
        <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
            <Typography variant="h6">Profit & Loss Statement</Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <DatePicker
                label="From"
                value={plStartDate}
                onChange={setPlStartDate}
                renderInput={(params) => <TextField {...params} size="small" sx={{ width: 140 }} />}
              />
              <DatePicker
                label="To"
                value={plEndDate}
                onChange={setPlEndDate}
                renderInput={(params) => <TextField {...params} size="small" sx={{ width: 140 }} />}
              />
              <Button variant="outlined" size="small" onClick={fetchProfitLoss}>
                Refresh
              </Button>
            </Box>
          </Box>
          {profitLoss ? (
            <Grid container spacing={2}>
              <Grid item xs={6} sm={4}>
                <Typography variant="caption">Total Revenue</Typography>
                <Typography variant="subtitle1">₹{profitLoss.total_revenue?.toLocaleString()}</Typography>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Typography variant="caption">COGS</Typography>
                <Typography variant="subtitle1">₹{profitLoss.total_cogs?.toLocaleString()}</Typography>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Typography variant="caption">Cess + TCS</Typography>
                <Typography variant="subtitle1">₹{(profitLoss.total_cess + profitLoss.total_tcs).toLocaleString()}</Typography>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Typography variant="caption">Gross Profit</Typography>
                <Typography variant="subtitle1" fontWeight={600}>₹{profitLoss.gross_profit?.toLocaleString()}</Typography>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Typography variant="caption">Other Expenses</Typography>
                <Typography variant="subtitle1">₹{profitLoss.other_expenses?.toLocaleString()}</Typography>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Typography variant="caption">Net Profit</Typography>
                <Typography variant="h6" color={profitLoss.net_profit >= 0 ? 'success.main' : 'error.main'}>
                  ₹{profitLoss.net_profit?.toLocaleString()}
                </Typography>
              </Grid>
            </Grid>
          ) : (
            <Typography>Select date range to view profit & loss</Typography>
          )}
        </Paper>

        {/* Analytics: Charts */}
        {analytics && (
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom>Sales Trend (Last 7 Days)</Typography>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={analytics.sales_trend_last_7_days}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <ChartTooltip formatter={(value) => `₹${value}`} />
                    <Line type="monotone" dataKey="revenue" stroke="#8884d8" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom>Top 5 Brands (Last 30 Days)</Typography>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={analytics.top_brands} layout="vertical" margin={{ left: 40 }}>
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="brand_name" width={100} />
                    <ChartTooltip formatter={(value) => `${value} bottles`} />
                    <Bar dataKey="quantity_sold" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          </Grid>
        )}

        {/* Low Stock Alerts */}
        {analytics && analytics.low_stock_alerts && analytics.low_stock_alerts.length > 0 && (
          <Paper sx={{ p: 2, mb: 3, borderRadius: 2, bgcolor: '#fff8e1' }}>
            <Typography variant="h6" gutterBottom color="warning.main">⚠️ Low Stock Alerts</Typography>
            <Grid container spacing={2}>
              {analytics.low_stock_alerts.map((item, idx) => (
                <Grid item xs={6} sm={4} md={3} key={idx}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="body2" fontWeight={600}>{item.brand_name}</Typography>
                      <Typography variant="caption">{item.size_ml}ml</Typography>
                      <Typography variant="body2" color="error">Stock: {item.current_stock} bottles</Typography>
                      <Typography variant="caption">MRP: ₹{item.mrp}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Paper>
        )}

        {/* Stock Verification Table with Location Toggle */}
        <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
            <Typography variant="h6">Current Stock</Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Location</InputLabel>
                <Select
                  value={stockLocation}
                  label="Location"
                  onChange={(e) => setStockLocation(e.target.value)}
                >
                  <MenuItem value="shop">Shop</MenuItem>
                  <MenuItem value="mart">Mart</MenuItem>
                </Select>
              </FormControl>
              <TextField
                size="small"
                placeholder="Search brand..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                sx={{ width: 200 }}
              />
              <Tooltip title="Export CSV">
                <IconButton onClick={exportStockCSV}>
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Refresh">
                <IconButton onClick={fetchStockVerification}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
          {loading ? (
            <CircularProgress />
          ) : (
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <TableSortLabel active={stockOrderBy === 'brand_code'} direction={stockOrderBy === 'brand_code' ? stockOrder : 'asc'} onClick={() => handleStockSort('brand_code')}>
                        Code
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel active={stockOrderBy === 'brand_name'} direction={stockOrderBy === 'brand_name' ? stockOrder : 'asc'} onClick={() => handleStockSort('brand_name')}>
                        Brand
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Size</TableCell>
                    <TableCell align="right">
                      <TableSortLabel active={stockOrderBy === 'current_stock'} direction={stockOrderBy === 'current_stock' ? stockOrder : 'asc'} onClick={() => handleStockSort('current_stock')}>
                        Stock
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">Unit Cost</TableCell>
                    <TableCell align="right">MRP</TableCell>
                    <TableCell align="right">
                      <TableSortLabel active={stockOrderBy === 'stock_value'} direction={stockOrderBy === 'stock_value' ? stockOrder : 'asc'} onClick={() => handleStockSort('stock_value')}>
                        Stock Value
                      </TableSortLabel>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedStock.slice(0, 100).map((item) => (
                    <TableRow key={`${item.brand_code}_${item.size_ml}`} hover>
                      <TableCell>{item.brand_code}</TableCell>
                      <TableCell>{item.brand_name}</TableCell>
                      <TableCell>{item.size_ml}ml ({item.size_code})</TableCell>
                      <TableCell align="right">
                        <Chip label={item.current_stock} size="small" color={item.current_stock < 10 ? 'warning' : 'default'} />
                      </TableCell>
                      <TableCell align="right">₹{item.unit_cost.toFixed(2)}</TableCell>
                      <TableCell align="right">₹{item.mrp.toFixed(2)}</TableCell>
                      <TableCell align="right">₹{item.stock_value.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {sortedStock.length > 100 && (
                <Typography variant="caption" sx={{ p: 2, display: 'block', textAlign: 'center' }}>
                  Showing first 100 of {sortedStock.length} products. Use search to narrow.
                </Typography>
              )}
            </TableContainer>
          )}
        </Paper>

        {/* Stock Transfer History */}
        <Paper sx={{ p: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
            <Typography variant="h6">
              <SwapHorizIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Stock Transfer History (Shop → Mart)
            </Typography>
            <Tooltip title="Export CSV">
              <IconButton onClick={exportTransferHistoryCSV} disabled={!transferHistory.length}>
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          </Box>
          {transferHistoryLoading ? (
            <CircularProgress />
          ) : transferHistory.length === 0 ? (
            <Alert severity="info">No stock transfers found.</Alert>
          ) : (
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell>Size (ml)</TableCell>
                    <TableCell align="right">Cases</TableCell>
                    <TableCell align="right">Loose</TableCell>
                    <TableCell align="right">Total Bottles</TableCell>
                    <TableCell>Transfer Date</TableCell>
                    <TableCell>Transferred By</TableCell>
                    <TableCell>Notes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transferHistory.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell>{item.size_ml}</TableCell>
                      <TableCell align="right">{item.cases}</TableCell>
                      <TableCell align="right">{item.loose_bottles}</TableCell>
                      <TableCell align="right"><strong>{item.total_bottles}</strong></TableCell>
                      <TableCell>{new Date(item.transfer_date).toLocaleString()}</TableCell>
                      <TableCell>{item.transferred_by}</TableCell>
                      <TableCell>{item.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Box>
    </LocalizationProvider>
  );
};

export default LiquorOwnerTab;