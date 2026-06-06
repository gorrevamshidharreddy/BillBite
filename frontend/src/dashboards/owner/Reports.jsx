import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  Snackbar,
  Divider,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  AttachMoney as MoneyIcon,
  ShoppingCart as OrdersIcon,
  TrendingUp as ProfitIcon,
  Receipt as ExpenseIcon,
  Inventory as InventoryIcon,
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
} from 'recharts';
import api from '../../services/api';

const Reports = () => {
  const theme = useTheme();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sales, setSales] = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [profit, setProfit] = useState(null);
  const [itemSales, setItemSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    try {
      const [s, e, p, i] = await Promise.all([
        api.get('/owner/reports/sales', { params }),
        api.get('/owner/reports/expenses', { params }),
        api.get('/owner/reports/profit', { params }),
        api.get('/owner/reports/item-sales', { params }),
      ]);
      setSales(s.data);
      setExpenses(e.data);
      setProfit(p.data);
      setItemSales(i.data);
      setSnackbar({ open: true, message: 'Reports updated', severity: 'success' });
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to load reports');
      setSnackbar({ open: true, message: 'Failed to load reports', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
  };

  // Prepare data for top 5 items chart
  const topItems = [...itemSales].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const chartData = topItems.map(item => ({
    name: item.item_name.length > 15 ? item.item_name.slice(0, 12) + '...' : item.item_name,
    revenue: item.revenue,
    quantity: item.quantity_sold,
  }));

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
        <Typography variant="h5" fontWeight={600} gutterBottom>
          Restaurant Reports
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          View sales, expenses, profit, and item‑wise performance.
        </Typography>
      </Paper>

      {/* Date Filters */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }} elevation={2}>
        <Grid container spacing={2} alignItems="flex-end">
          <Grid item xs={12} sm={4}>
            <TextField
              type="date"
              label="Start Date"
              InputLabelProps={{ shrink: true }}
              fullWidth
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              size="small"
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              type="date"
              label="End Date"
              InputLabelProps={{ shrink: true }}
              fullWidth
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              size="small"
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="contained" onClick={fetchReports} disabled={loading} fullWidth>
                {loading ? <CircularProgress size={24} /> : 'Generate'}
              </Button>
              <Button variant="outlined" onClick={clearFilters} disabled={loading}>
                Clear
              </Button>
              <Tooltip title="Refresh">
                <IconButton onClick={fetchReports} disabled={loading}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && !sales ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : sales ? (
        <Grid container spacing={3}>
          {/* Sales Summary Card */}
          <Grid item xs={12} md={6} lg={4}>
            <Card sx={{ height: '100%', borderRadius: 2, boxShadow: 3, transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-4px)' } }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <MoneyIcon color="success" sx={{ mr: 1, fontSize: 28 }} />
                  <Typography variant="h6" fontWeight={600}>Sales Summary</Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Total Sales</Typography>
                    <Typography variant="h5" fontWeight={700} color="success.main">
                      ₹{sales.total_sales?.toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Order Count</Typography>
                    <Typography variant="h5" fontWeight={700}>
                      {sales.order_count}
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>Payment Split</Typography>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                      <Chip label={`Cash: ₹${sales.payment_split?.cash?.toLocaleString()}`} size="small" variant="outlined" />
                      <Chip label={`UPI: ₹${sales.payment_split?.upi?.toLocaleString()}`} size="small" variant="outlined" />
                      <Chip label={`Card: ₹${sales.payment_split?.card?.toLocaleString()}`} size="small" variant="outlined" />
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Expenses & Profit Card */}
          <Grid item xs={12} md={6} lg={4}>
            <Card sx={{ height: '100%', borderRadius: 2, boxShadow: 3, transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-4px)' } }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <ExpenseIcon color="error" sx={{ mr: 1, fontSize: 28 }} />
                  <Typography variant="h6" fontWeight={600}>Expenses & Profit</Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Raw Materials</Typography>
                    <Typography variant="body1" fontWeight={500}>
                      ₹{expenses?.raw_material_expenses?.toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Other Expenses</Typography>
                    <Typography variant="body1" fontWeight={500}>
                      ₹{expenses?.other_expenses?.toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        Gross Profit
                      </Typography>
                      <Typography variant="h6" color={profit?.profit >= 0 ? 'success.main' : 'error.main'}>
                        ₹{profit?.profit?.toLocaleString()}
                      </Typography>
                    </Box>
                    <Chip
                      label={profit?.profit >= 0 ? 'Profitable' : 'Loss'}
                      color={profit?.profit >= 0 ? 'success' : 'error'}
                      size="small"
                      sx={{ mt: 1 }}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Item‑wise Sales Table + Chart */}
          <Grid item xs={12} lg={8}>
            <Card sx={{ borderRadius: 2, boxShadow: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Item‑wise Sales</Typography>
                {itemSales.length === 0 ? (
                  <Alert severity="info">No sales data for selected period.</Alert>
                ) : (
                  <>
                    {/* Bar Chart for Top 5 Items */}
                    {chartData.length > 0 && (
                      <Box sx={{ mb: 3, height: 260 }}>
                        <Typography variant="subtitle2" gutterBottom>Top 5 Items by Revenue</Typography>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" angle={-15} textAnchor="end" height={50} tick={{ fontSize: 10 }} />
                            <YAxis tickFormatter={(value) => `₹${value}`} />
                            <ChartTooltip formatter={(value) => `₹${value}`} />
                            <Bar dataKey="revenue" fill={theme.palette.primary.main} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </Box>
                    )}
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead sx={{ bgcolor: theme.palette.grey[100] }}>
                          <TableRow>
                            <TableCell><strong>Item Name</strong></TableCell>
                            <TableCell align="right"><strong>Quantity Sold</strong></TableCell>
                            <TableCell align="right"><strong>Revenue (₹)</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {itemSales.map((row, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell>{row.item_name}</TableCell>
                              <TableCell align="right">{row.quantity_sold}</TableCell>
                              <TableCell align="right">₹{row.revenue.toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      ) : (
        <Alert severity="info">No data available. Adjust date filters and try again.</Alert>
      )}

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

export default Reports;