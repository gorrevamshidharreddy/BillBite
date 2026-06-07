import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, TextField, Button, Grid,
  Card, CardContent, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Dialog, DialogTitle,
  DialogContent, DialogActions, Alert, Snackbar, CircularProgress,
  InputAdornment, Chip
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, AttachMoney as MoneyIcon } from '@mui/icons-material';
import api from '../../services/api';

export default function Expenditure() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [form, setForm] = useState({ description: '', amount: '', category: '' });
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const res = await api.get('/cashier/expenditure');
      setExpenses(res.data);
    } catch (err) {
      console.error(err);
      setSnackbar({ open: true, message: 'Failed to load expenses', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const handleSubmit = async () => {
    if (!form.description || !form.amount || !form.category) {
      setSnackbar({ open: true, message: 'Please fill all fields', severity: 'warning' });
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/cashier/expenditure', {
        description: form.description,
        amount: parseFloat(form.amount),
        category: form.category
      });
      setSnackbar({ open: true, message: 'Expense added', severity: 'success' });
      setOpenDialog(false);
      setForm({ description: '', amount: '', category: '' });
      fetchExpenses();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.detail || 'Failed to add expense', severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      <Paper sx={{ p: 2, borderRadius: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h5" fontWeight={600}>Petty Cash / Expenditure</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenDialog(true)}>
            Add Expense
          </Button>
        </Box>
      </Paper>

      {/* Summary Card */}
      <Card sx={{ mb: 3, bgcolor: '#fff3e0' }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <MoneyIcon color="warning" sx={{ fontSize: 40 }} />
            <Box>
              <Typography variant="caption" color="text.secondary">Total Expenses</Typography>
              <Typography variant="h5">₹{totalAmount.toLocaleString()}</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Expenses Table */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
        ) : expenses.length === 0 ? (
          <Alert severity="info" sx={{ m: 2 }}>No expenses recorded yet.</Alert>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell><strong>Date</strong></TableCell>
                  <TableCell><strong>Category</strong></TableCell>
                  <TableCell><strong>Description</strong></TableCell>
                  <TableCell align="right"><strong>Amount (₹)</strong></TableCell>
                  <TableCell><strong>Recorded By</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {expenses.map((exp) => (
                  <TableRow key={exp.id} hover>
                    <TableCell>{new Date(exp.date).toLocaleString()}</TableCell>
                    <TableCell><Chip label={exp.category} size="small" variant="outlined" /></TableCell>
                    <TableCell>{exp.description}</TableCell>
                    <TableCell align="right"><strong>₹{exp.amount.toLocaleString()}</strong></TableCell>
                    <TableCell>{exp.cashier_name || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Add Expense Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Record Expense</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Category"
                placeholder="e.g., Cleaning, Snacks, Transport"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                placeholder="What was the expense for?"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                multiline
                rows={2}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                type="number"
                label="Amount (₹)"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                required
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <CircularProgress size={24} /> : 'Save Expense'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}