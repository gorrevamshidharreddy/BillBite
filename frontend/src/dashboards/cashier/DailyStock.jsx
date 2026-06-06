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
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TablePagination,
  Chip,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Edit as EditIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import api from '../../services/api';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../context/AuthContext';

const DailyStock = () => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);               // original data from backend (read-only view)
  const [editableData, setEditableData] = useState([]); // working copy for editing
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [orderBy, setOrderBy] = useState('brand_name');
  const [order, setOrder] = useState('asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [editMode, setEditMode] = useState(false);
  const [paymentTotals, setPaymentTotals] = useState({ cash: 0, upi: 0, card: 0 });
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Determine if editing is allowed for the selected date
  const isEditable = () => {
    const now = new Date();
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow12pm = new Date(today);
    tomorrow12pm.setDate(tomorrow12pm.getDate() + 1);
    tomorrow12pm.setHours(12, 0, 0, 0);
    // Allow editing only if selected date is today AND current time < tomorrow 12pm
    return selected.getTime() === today.getTime() && now < tomorrow12pm;
  };

  // Fetch daily stock data (read-only view) and also fetch any existing reconciliation for the selected date
  const fetchData = useCallback(async () => {
    if (!currentTenant) return;
    setLoading(true);
    setError(null);
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      // Fetch the stock statement (opening, receipts from transactions, sales, transfers, etc.)
      const response = await api.get('/cashier/liquor/daily-stock', {
        params: { target_date: dateStr },
      });
      setData(response.data);
      
      // If editing allowed, try to load any previously saved reconciliation for this date
      if (isEditable()) {
        try {
          const recRes = await api.get('/cashier/daily-stock/reconciliation', { params: { date: dateStr } });
          if (recRes.data && recRes.data.items) {
            // Merge saved user inputs (receipts, closing stock) with the stock statement
            const savedItems = recRes.data.items;
            const merged = response.data.map(item => {
              const saved = savedItems.find(s => s.product_id === item.product_id);
              return {
                ...item,
                receipts_cases: saved?.receipts_cases ?? item.receipts_cases,
                receipts_loose: saved?.receipts_loose ?? item.receipts_loose,
                closing_stock_physical: saved?.closing_stock_physical ?? item.closing_stock,
              };
            });
            setEditableData(merged);
            setPaymentTotals({
              cash: recRes.data.cash_total || 0,
              upi: recRes.data.upi_total || 0,
              card: recRes.data.card_total || 0,
            });
          } else {
            // No saved reconciliation, initialise editable data with current receipts and calculated closing
            const initEditable = response.data.map(item => ({
              ...item,
              receipts_cases: item.receipts_cases,
              receipts_loose: item.receipts_loose,
              closing_stock_physical: item.closing_stock,
            }));
            setEditableData(initEditable);
            setPaymentTotals({ cash: 0, upi: 0, card: 0 });
          }
        } catch (err) {
          // If no reconciliation exists, just use stock statement as base
          const initEditable = response.data.map(item => ({
            ...item,
            receipts_cases: item.receipts_cases,
            receipts_loose: item.receipts_loose,
            closing_stock_physical: item.closing_stock,
          }));
          setEditableData(initEditable);
        }
      } else {
        setEditableData([]);
      }
      setPage(0);
    } catch (err) {
      console.error('Failed to fetch daily stock', err);
      setError(err.response?.data?.detail || 'Failed to load stock data');
    } finally {
      setLoading(false);
    }
  }, [currentTenant, selectedDate, isEditable]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter and sort data (use editableData when in edit mode, otherwise use data)
  const displayData = editMode ? editableData : data;
  
  const filteredData = displayData.filter((item) =>
    item.brand_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.brand_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.size_code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Summary statistics based on filtered data (include transfers in receipts? Not needed)
  const summary = filteredData.reduce((acc, item) => {
    acc.totalOpening += item.opening_stock || 0;
    acc.totalReceipts += (item.receipts_cases || 0) * (item.pack_qty || 1) + (item.receipts_loose || 0);
    acc.totalTransfers += item.transfers_received || 0;
    acc.totalSales += item.sale_bottles || 0;
    acc.totalClosing += editMode ? (item.closing_stock_physical || 0) : (item.closing_stock || 0);
    acc.totalSaleAmount += item.sale_amount || 0;
    return acc;
  }, { totalOpening: 0, totalReceipts: 0, totalTransfers: 0, totalSales: 0, totalClosing: 0, totalSaleAmount: 0 });

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const sortedData = React.useMemo(() => {
    const comparator = (a, b) => {
      const aVal = a[orderBy];
      const bVal = b[orderBy];
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    };
    return [...filteredData].sort(comparator);
  }, [filteredData, orderBy, order]);

  const paginatedData = sortedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  // Handlers for editable fields
  const handleReceiptsChange = (productId, field, value) => {
    const newVal = parseInt(value) || 0;
    setEditableData(prev =>
      prev.map(item =>
        item.product_id === productId ? { ...item, [field]: newVal } : item
      )
    );
  };

  const handleClosingStockChange = (productId, value) => {
    const newVal = parseInt(value) || 0;
    setEditableData(prev =>
      prev.map(item =>
        item.product_id === productId ? { ...item, closing_stock_physical: newVal } : item
      )
    );
  };

  const handlePaymentChange = (method, value) => {
    setPaymentTotals(prev => ({ ...prev, [method]: parseFloat(value) || 0 }));
  };

  const saveReconciliation = async () => {
    if (!isEditable()) {
      setSnackbar({ open: true, message: 'Editing window has expired', severity: 'error' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date: selectedDate.toISOString().split('T')[0],
        items: editableData.map(item => ({
          product_id: item.product_id,
          receipts_cases: item.receipts_cases,
          receipts_loose: item.receipts_loose,
          closing_stock_physical: item.closing_stock_physical,
        })),
        cash_total: paymentTotals.cash,
        upi_total: paymentTotals.upi,
        card_total: paymentTotals.card,
        notes: '',
      };
      await api.post('/cashier/daily-stock/reconcile', payload);
      setSnackbar({ open: true, message: 'Stock reconciliation saved', severity: 'success' });
      setEditMode(false);
      fetchData(); // refresh with saved data
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.detail || 'Save failed', severity: 'error' });
    } finally {
      setSaving(false);
      setSaveDialogOpen(false);
    }
  };

  const exportToCSV = () => {
    const headers = [
      'Brand Code', 'Size Code', 'Brand Name', 'Opening Stock',
      'Receipts (Cases)', 'Receipts (Loose)', 'Total Receipts',
      'Transfers In', 'Sale Bottles', 'Closing Stock', 'MRP', 'Sale Amount'
    ];
    const rows = filteredData.map((item) => [
      item.brand_code,
      item.size_code,
      item.brand_name,
      item.opening_stock,
      item.receipts_cases,
      item.receipts_loose,
      (item.receipts_cases * (item.pack_qty || 1) + item.receipts_loose),
      item.transfers_received || 0,
      item.sale_bottles,
      editMode ? item.closing_stock_physical : item.closing_stock,
      item.mrp,
      item.sale_amount,
    ]);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily_stock_${selectedDate.toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: { xs: 1, md: 3 } }}>
        {/* Header */}
        <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            <Typography variant="h5" fontWeight={600}>
              Daily Stock {editMode ? '(Editing)' : '(View)'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <DatePicker
                label="Select Date"
                value={selectedDate}
                onChange={(newValue) => {
                  setSelectedDate(newValue);
                  setEditMode(false);
                }}
                renderInput={(params) => <TextField {...params} size="small" sx={{ minWidth: 150 }} />}
              />
              {isEditable() && !editMode && (
                <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setEditMode(true)}>
                  Edit Today's Sheet
                </Button>
              )}
              {editMode && (
                <>
                  <Button variant="contained" startIcon={<SaveIcon />} onClick={() => setSaveDialogOpen(true)} disabled={saving}>
                    Save
                  </Button>
                  <Button variant="outlined" onClick={() => { setEditMode(false); fetchData(); }}>
                    Cancel
                  </Button>
                </>
              )}
              <Tooltip title="Refresh">
                <IconButton onClick={fetchData} disabled={loading}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Export CSV">
                <IconButton onClick={exportToCSV} disabled={!filteredData.length}>
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
          {isEditable() && !editMode && (
            <Alert severity="info" sx={{ mt: 1 }}>
              You can edit today's stock sheet until tomorrow 12:00 PM.
            </Alert>
          )}
        </Paper>

        {/* Summary Cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={4} md={2}>
            <Card sx={{ bgcolor: '#e3f2fd', borderRadius: 2 }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Opening Stock</Typography>
                <Typography variant="h6" fontWeight={700}>{summary.totalOpening.toLocaleString()}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <Card sx={{ bgcolor: '#e8f5e9', borderRadius: 2 }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Receipts (Bottles)</Typography>
                <Typography variant="h6" fontWeight={700} color="success.main">{summary.totalReceipts.toLocaleString()}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <Card sx={{ bgcolor: '#fff3e0', borderRadius: 2 }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Transfers In</Typography>
                <Typography variant="h6" fontWeight={700} color="info.main">{summary.totalTransfers.toLocaleString()}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <Card sx={{ bgcolor: '#ffebee', borderRadius: 2 }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Sales (Bottles)</Typography>
                <Typography variant="h6" fontWeight={700} color="error.main">{summary.totalSales.toLocaleString()}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <Card sx={{ bgcolor: '#fff3e0', borderRadius: 2 }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Closing Stock</Typography>
                <Typography variant="h6" fontWeight={700}>{summary.totalClosing.toLocaleString()}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <Card sx={{ bgcolor: '#f3e5f5', borderRadius: 2 }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Sale Amount (₹)</Typography>
                <Typography variant="h6" fontWeight={700}>₹{summary.totalSaleAmount.toLocaleString()}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Payment Totals (only in edit mode) */}
        {editMode && (
          <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>Payment Totals for the Day</Typography>
            <Grid container spacing={2}>
              <Grid item xs={4}>
                <TextField
                  fullWidth
                  label="Cash (₹)"
                  type="number"
                  value={paymentTotals.cash}
                  onChange={(e) => handlePaymentChange('cash', e.target.value)}
                />
              </Grid>
              <Grid item xs={4}>
                <TextField
                  fullWidth
                  label="UPI (₹)"
                  type="number"
                  value={paymentTotals.upi}
                  onChange={(e) => handlePaymentChange('upi', e.target.value)}
                />
              </Grid>
              <Grid item xs={4}>
                <TextField
                  fullWidth
                  label="Card (₹)"
                  type="number"
                  value={paymentTotals.card}
                  onChange={(e) => handlePaymentChange('card', e.target.value)}
                />
              </Grid>
            </Grid>
          </Paper>
        )}

        {/* Search Bar */}
        <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search by brand name, code or size code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
              endAdornment: searchTerm && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchTerm('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Paper>

        {/* Stock Table */}
        <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>
          ) : filteredData.length === 0 ? (
            <Alert severity="info" sx={{ m: 2 }}>No stock data available for this date.</Alert>
          ) : (
            <>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Brand Code</TableCell>
                      <TableCell>Brand Name</TableCell>
                      <TableCell>Size</TableCell>
                      <TableCell align="right">Opening</TableCell>
                      <TableCell align="right">Cases Rec.</TableCell>
                      <TableCell align="right">Loose Rec.</TableCell>
                      <TableCell align="right">Total Rec.</TableCell>
                      <TableCell align="right">Transfers In</TableCell>
                      <TableCell align="right">Sold</TableCell>
                      <TableCell align="right">Closing Stock</TableCell>
                      <TableCell align="right">MRP</TableCell>
                      <TableCell align="right">Sale Amt</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedData.map((item) => (
                      <TableRow key={item.product_id || item.brand_code + item.size_ml} hover>
                        <TableCell>{item.brand_code}</TableCell>
                        <TableCell>{item.brand_name}</TableCell>
                        <TableCell><Chip label={item.size_code} size="small" variant="outlined" /></TableCell>
                        <TableCell align="right">{item.opening_stock}</TableCell>
                        <TableCell align="right">
                          {editMode ? (
                            <TextField
                              type="number"
                              size="small"
                              value={item.receipts_cases}
                              onChange={(e) => handleReceiptsChange(item.product_id, 'receipts_cases', e.target.value)}
                              sx={{ width: 70 }}
                              inputProps={{ min: 0 }}
                            />
                          ) : (
                            item.receipts_cases
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {editMode ? (
                            <TextField
                              type="number"
                              size="small"
                              value={item.receipts_loose}
                              onChange={(e) => handleReceiptsChange(item.product_id, 'receipts_loose', e.target.value)}
                              sx={{ width: 70 }}
                              inputProps={{ min: 0 }}
                            />
                          ) : (
                            item.receipts_loose
                          )}
                        </TableCell>
                        <TableCell align="right"><strong>{item.receipts_cases * (item.pack_qty || 1) + item.receipts_loose}</strong></TableCell>
                        <TableCell align="right">{item.transfers_received || 0}</TableCell>
                        <TableCell align="right">{item.sale_bottles}</TableCell>
                        <TableCell align="right">
                          {editMode ? (
                            <TextField
                              type="number"
                              size="small"
                              value={item.closing_stock_physical}
                              onChange={(e) => handleClosingStockChange(item.product_id, e.target.value)}
                              sx={{ width: 80 }}
                              inputProps={{ min: 0 }}
                            />
                          ) : (
                            <strong>{item.closing_stock}</strong>
                          )}
                        </TableCell>
                        <TableCell align="right">₹{item.mrp}</TableCell>
                        <TableCell align="right">₹{item.sale_amount.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                rowsPerPageOptions={[10, 25, 50, 100]}
                component="div"
                count={filteredData.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={(e, newPage) => setPage(newPage)}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10));
                  setPage(0);
                }}
              />
            </>
          )}
        </Paper>

        {/* Save Confirmation Dialog */}
        <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
          <DialogTitle>Save Stock Reconciliation</DialogTitle>
          <DialogContent>
            <Typography>Are you sure you want to save today's stock entry? This will record the physical stock and payment totals.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={saveReconciliation} disabled={saving}>Save</Button>
          </DialogActions>
        </Dialog>

        <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
        </Snackbar>
      </Box>
    </LocalizationProvider>
  );
};

export default DailyStock;