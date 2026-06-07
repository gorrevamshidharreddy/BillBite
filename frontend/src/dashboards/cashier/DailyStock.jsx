import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, TextField, Button, Grid, Card, CardContent,
  IconButton, Tooltip, Alert, CircularProgress, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TableSortLabel, TablePagination,
  InputAdornment, Dialog, DialogTitle, DialogContent, DialogActions,
  Snackbar,
} from '@mui/material';
import {
  Refresh as RefreshIcon, Download as DownloadIcon, Search as SearchIcon,
  Clear as ClearIcon, Edit as EditIcon, Save as SaveIcon,
} from '@mui/icons-material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import api from '../../services/api';
import { useTenant } from '../../context/TenantContext';

const DailyStock = () => {
  const { currentTenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);
  const [editableData, setEditableData] = useState([]);
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
  const [location, setLocation] = useState(null);
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false);

  // Fetch assignment
  useEffect(() => {
    const fetchAssignment = async () => {
      try {
        const res = await api.get('/cashier/my-assignments');
        if (res.data.assigned_to_shop) setLocation('shop');
        else if (res.data.assigned_to_mart) setLocation('mart');
        else setError('Not assigned to shop or mart');
      } catch (err) {
        setError('Failed to fetch assignment');
      } finally {
        setAssignmentsLoaded(true);
      }
    };
    fetchAssignment();
  }, []);

  const checkEditable = useCallback((date) => {
    const now = new Date();
    const selected = new Date(date);
    selected.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow12pm = new Date(today);
    tomorrow12pm.setDate(tomorrow12pm.getDate() + 1);
    tomorrow12pm.setHours(12, 0, 0, 0);
    return selected.getTime() === today.getTime() && now < tomorrow12pm;
  }, []);

  const fetchData = useCallback(async () => {
    if (!currentTenant || !location) return;
    setLoading(true);
    setError(null);
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const response = await api.get('/cashier/liquor/daily-stock', {
        params: { target_date: dateStr, location: location }
      });
      setData(response.data);

      let savedItems = [];
      let savedCash = 0, savedUpi = 0, savedCard = 0;
      try {
        const recRes = await api.get('/cashier/daily-stock/reconciliation', {
          params: { date: dateStr, location: location }
        });
        if (recRes.data && recRes.data.items) {
          savedItems = recRes.data.items;
          savedCash = recRes.data.cash_total || 0;
          savedUpi = recRes.data.upi_total || 0;
          savedCard = recRes.data.card_total || 0;
        }
      } catch (err) {}

      const editable = checkEditable(selectedDate);
      if (editable) {
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
        setPaymentTotals({ cash: savedCash, upi: savedUpi, card: savedCard });
      } else {
        setEditableData([]);
        setPaymentTotals({ cash: savedCash, upi: savedUpi, card: savedCard });
      }
      setPage(0);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [currentTenant, selectedDate, location, checkEditable]);

  useEffect(() => {
    if (assignmentsLoaded && location) fetchData();
  }, [fetchData, assignmentsLoaded, location]);

  const displayData = editMode ? editableData : data;

  const filteredData = displayData.filter(item => {
    const matchesSearch = item.brand_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.brand_code?.toLowerCase().includes(searchTerm.toLowerCase());
    const transfersField = location === 'shop' ? (item.transfers_out || 0) : (item.transfers_in || 0);
    const hasActivity = (item.opening_stock > 0) || (item.total_receipts > 0) || (transfersField > 0) || (item.closing_stock > 0);
    return matchesSearch && hasActivity;
  });

  const summary = filteredData.reduce((acc, item) => {
    acc.totalOpening += item.opening_stock || 0;
    acc.totalReceipts += (item.receipts_cases || 0) * (item.pack_qty || 1) + (item.receipts_loose || 0);
    const transfersField = location === 'shop' ? (item.transfers_out || 0) : (item.transfers_in || 0);
    acc.totalTransfers += transfersField;
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
      let aVal = a[orderBy], bVal = b[orderBy];
      if (typeof aVal === 'number' && typeof bVal === 'number') return order === 'asc' ? aVal - bVal : bVal - aVal;
      aVal = (aVal || '').toString().toLowerCase();
      bVal = (bVal || '').toString().toLowerCase();
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    };
    return [...filteredData].sort(comparator);
  }, [filteredData, orderBy, order]);

  const paginatedData = sortedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleReceiptsChange = (productId, field, value) => {
    const newVal = parseInt(value) || 0;
    setEditableData(prev => prev.map(item => item.product_id === productId ? { ...item, [field]: newVal } : item));
  };

  const handleClosingStockChange = (productId, value) => {
    const newVal = parseInt(value) || 0;
    setEditableData(prev => prev.map(item => item.product_id === productId ? { ...item, closing_stock_physical: newVal } : item));
  };

  const handlePaymentChange = (method, value) => {
    setPaymentTotals(prev => ({ ...prev, [method]: parseFloat(value) || 0 }));
  };

  const saveReconciliation = async () => {
    if (!checkEditable(selectedDate)) {
      setSnackbar({ open: true, message: 'Editing window expired', severity: 'error' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date: selectedDate.toISOString().split('T')[0],
        location: location,
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
      setSnackbar({ open: true, message: 'Saved successfully', severity: 'success' });
      setEditMode(false);
      fetchData();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.detail || 'Save failed', severity: 'error' });
    } finally {
      setSaving(false);
      setSaveDialogOpen(false);
    }
  };

  const exportToCSV = () => {
    const headers = [
      'Brand Code', 'Brand Name', 'Size (ml)', 'Opening',
      'Cases Rec', 'Loose Rec', 'Total Rec',
      location === 'shop' ? 'Transfers Out' : 'Transfers In',
      'Closing', 'Sold', 'MRP', 'Sale Amt'
    ];
    const rows = filteredData.map(item => [
      item.brand_code, item.brand_name, item.size_ml, item.opening_stock,
      item.receipts_cases, item.receipts_loose,
      (item.receipts_cases * (item.pack_qty || 1) + item.receipts_loose),
      location === 'shop' ? (item.transfers_out || 0) : (item.transfers_in || 0),
      editMode ? item.closing_stock_physical : item.closing_stock,
      item.sale_bottles || 0,
      item.mrp, item.sale_amount || 0,
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily_stock_${location}_${selectedDate.toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!assignmentsLoaded || !location) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: { xs: 1, md: 3 } }}>
        <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            <Typography variant="h5" fontWeight={600}>
              Daily Stock ({location === 'shop' ? 'Shop' : 'Mart'}) {editMode ? '(Editing)' : '(View)'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <DatePicker
                label="Select Date"
                value={selectedDate}
                onChange={(newValue) => { setSelectedDate(newValue); setEditMode(false); }}
                renderInput={(params) => <TextField {...params} size="small" sx={{ minWidth: 150 }} />}
              />
              {checkEditable(selectedDate) && !editMode && (
                <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setEditMode(true)}>Edit Today's Sheet</Button>
              )}
              {editMode && (
                <>
                  <Button variant="contained" startIcon={<SaveIcon />} onClick={() => setSaveDialogOpen(true)} disabled={saving}>Save</Button>
                  <Button variant="outlined" onClick={() => { setEditMode(false); fetchData(); }}>Cancel</Button>
                </>
              )}
              <Tooltip title="Refresh"><IconButton onClick={fetchData} disabled={loading}><RefreshIcon /></IconButton></Tooltip>
              <Tooltip title="Export CSV"><IconButton onClick={exportToCSV} disabled={!filteredData.length}><DownloadIcon /></IconButton></Tooltip>
            </Box>
          </Box>
          {checkEditable(selectedDate) && !editMode && (
            <Alert severity="info" sx={{ mt: 1 }}>You can edit today's sheet until tomorrow 12:00 PM.</Alert>
          )}
        </Paper>

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={4} md={2}><Card sx={{ bgcolor: '#e3f2fd' }}><CardContent sx={{ textAlign: 'center' }}><Typography variant="caption">Opening</Typography><Typography variant="h6">{summary.totalOpening.toLocaleString()}</Typography></CardContent></Card></Grid>
          <Grid item xs={6} sm={4} md={2}><Card sx={{ bgcolor: '#e8f5e9' }}><CardContent sx={{ textAlign: 'center' }}><Typography variant="caption">Receipts</Typography><Typography variant="h6" color="success.main">{summary.totalReceipts.toLocaleString()}</Typography></CardContent></Card></Grid>
          <Grid item xs={6} sm={4} md={2}><Card sx={{ bgcolor: '#fff3e0' }}><CardContent sx={{ textAlign: 'center' }}><Typography variant="caption">{location === 'shop' ? 'Transfers Out' : 'Transfers In'}</Typography><Typography variant="h6">{summary.totalTransfers.toLocaleString()}</Typography></CardContent></Card></Grid>
          <Grid item xs={6} sm={4} md={2}><Card sx={{ bgcolor: '#ffebee' }}><CardContent sx={{ textAlign: 'center' }}><Typography variant="caption">Sold</Typography><Typography variant="h6" color="error.main">{summary.totalSales.toLocaleString()}</Typography></CardContent></Card></Grid>
          <Grid item xs={6} sm={4} md={2}><Card sx={{ bgcolor: '#fff3e0' }}><CardContent sx={{ textAlign: 'center' }}><Typography variant="caption">Closing</Typography><Typography variant="h6">{summary.totalClosing.toLocaleString()}</Typography></CardContent></Card></Grid>
          <Grid item xs={6} sm={4} md={2}><Card sx={{ bgcolor: '#f3e5f5' }}><CardContent sx={{ textAlign: 'center' }}><Typography variant="caption">Sale Amt (₹)</Typography><Typography variant="h6">₹{summary.totalSaleAmount.toLocaleString()}</Typography></CardContent></Card></Grid>
        </Grid>

        <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            {editMode ? 'Payment Totals for the Day' : 'Saved Payment Totals'}
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={4}>
              <TextField fullWidth label="Cash (₹)" type="number" value={paymentTotals.cash} disabled={!editMode} onChange={(e) => handlePaymentChange('cash', e.target.value)} />
            </Grid>
            <Grid item xs={4}>
              <TextField fullWidth label="UPI (₹)" type="number" value={paymentTotals.upi} disabled={!editMode} onChange={(e) => handlePaymentChange('upi', e.target.value)} />
            </Grid>
            <Grid item xs={4}>
              <TextField fullWidth label="Card (₹)" type="number" value={paymentTotals.card} disabled={!editMode} onChange={(e) => handlePaymentChange('card', e.target.value)} />
            </Grid>
          </Grid>
        </Paper>

        <Paper sx={{ p: 2, mb: 3 }}>
          <TextField fullWidth size="small" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
              endAdornment: searchTerm && <IconButton onClick={() => setSearchTerm('')}><ClearIcon /></IconButton> }} />
        </Paper>

        <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
          {loading ? <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box> :
           error ? <Alert severity="error" sx={{ m: 2 }}>{error}</Alert> :
           filteredData.length === 0 ? <Alert severity="info" sx={{ m: 2 }}>No stock data</Alert> :
           <>
            <TableContainer><Table stickyHeader size="small">
              <TableHead><TableRow>
                <TableCell>Brand Code</TableCell>
                <TableCell>Brand Name</TableCell>
                <TableCell>Size (ml)</TableCell>
                <TableCell align="right">Opening</TableCell>
                <TableCell align="right">Cases Rec</TableCell>
                <TableCell align="right">Loose Rec</TableCell>
                <TableCell align="right">Total Rec</TableCell>
                <TableCell align="right">{location === 'shop' ? 'Transfers Out' : 'Transfers In'}</TableCell>
                <TableCell align="right">Closing</TableCell>
                <TableCell align="right">Sold</TableCell>
                <TableCell align="right">MRP</TableCell>
                <TableCell align="right">Sale Amt</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {paginatedData.map((item) => (
                  <TableRow key={item.product_id} hover>
                    <TableCell>{item.brand_code}</TableCell>
                    <TableCell>{item.brand_name}</TableCell>
                    <TableCell>{item.size_ml}</TableCell>
                    <TableCell align="right">{item.opening_stock}</TableCell>
                    <TableCell align="right">{editMode ? <TextField type="number" size="small" value={item.receipts_cases} onChange={(e) => handleReceiptsChange(item.product_id, 'receipts_cases', e.target.value)} sx={{ width: 70 }} inputProps={{ min: 0 }} /> : item.receipts_cases}</TableCell>
                    <TableCell align="right">{editMode ? <TextField type="number" size="small" value={item.receipts_loose} onChange={(e) => handleReceiptsChange(item.product_id, 'receipts_loose', e.target.value)} sx={{ width: 70 }} inputProps={{ min: 0 }} /> : item.receipts_loose}</TableCell>
                    <TableCell align="right"><strong>{(item.receipts_cases * (item.pack_qty || 1)) + item.receipts_loose}</strong></TableCell>
                    <TableCell align="right">{location === 'shop' ? (item.transfers_out || 0) : (item.transfers_in || 0)}</TableCell>
                    <TableCell align="right">{editMode ? <TextField type="number" size="small" value={item.closing_stock_physical} onChange={(e) => handleClosingStockChange(item.product_id, e.target.value)} sx={{ width: 80 }} inputProps={{ min: 0 }} /> : <strong>{item.closing_stock}</strong>}</TableCell>
                    <TableCell align="right">{item.sale_bottles || 0}</TableCell>
                    <TableCell align="right">₹{item.mrp}</TableCell>
                    <TableCell align="right">₹{(item.sale_amount || 0).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></TableContainer>
            <TablePagination rowsPerPageOptions={[10,25,50,100]} component="div" count={filteredData.length} rowsPerPage={rowsPerPage} page={page} onPageChange={(e,newPage)=>setPage(newPage)} onRowsPerPageChange={(e)=>{setRowsPerPage(parseInt(e.target.value,10)); setPage(0);}} />
           </>}
        </Paper>

        <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
          <DialogTitle>Save Stock Reconciliation</DialogTitle>
          <DialogContent><Typography>Are you sure?</Typography></DialogContent>
          <DialogActions><Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button><Button variant="contained" onClick={saveReconciliation} disabled={saving}>Save</Button></DialogActions>
        </Dialog>

        <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
        </Snackbar>
      </Box>
    </LocalizationProvider>
  );
};

export default DailyStock;