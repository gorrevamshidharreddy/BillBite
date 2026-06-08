import { useState, useEffect } from 'react';
import {
  Box,
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
  Switch,
  FormControlLabel,
  Grid,
  Alert,
  Snackbar,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Password as PasswordIcon,
} from '@mui/icons-material';
import api from '../../services/api';
import { useTenant } from '../../context/TenantContext';

export default function StaffManagement() {
  const { currentTenant } = useTenant();
  const [staff, setStaff] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [form, setForm] = useState({
    email: '',
    full_name: '',
    phone: '',
    password: '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const isLiquorMart = currentTenant?.business_type === 'liquor_mart';

  const fetchStaffAndAssignments = async () => {
    setLoading(true);
    try {
      const staffRes = await api.get('/owner/staff');
      setStaff(staffRes.data);

      if (isLiquorMart) {
        const assignRes = await api.get('/owner/cashier-assignments');
        const map = {};
        assignRes.data.forEach((item) => {
          map[item.cashier_id] = {
            assigned_to_shop: item.assigned_to_shop,
            assigned_to_mart: item.assigned_to_mart,
          };
        });
        setAssignments(map);
      }
    } catch (err) {
      console.error(err);
      setSnackbar({ open: true, message: 'Failed to load staff data', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentTenant?.id) {
      fetchStaffAndAssignments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTenant?.id]);

  const handleCreate = async () => {
    // Log payload for debugging
    console.log('Creating cashier with payload:', form);
    if (!form.email || !form.full_name || !form.password) {
      setSnackbar({ open: true, message: 'Email, Name and Password are required', severity: 'warning' });
      return;
    }
    setLoading(true);
    try {
      await api.post('/owner/staff', form);
      setForm({ email: '', full_name: '', phone: '', password: '' });
      setSnackbar({ open: true, message: 'Cashier created successfully', severity: 'success' });
      fetchStaffAndAssignments();
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Failed to create cashier';
      console.error('Create cashier error:', err);
      setSnackbar({ open: true, message: detail, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (userId, currentStatus) => {
    try {
      await api.put(`/owner/staff/${userId}`, { is_active: !currentStatus });
      setSnackbar({ open: true, message: 'Status updated', severity: 'success' });
      fetchStaffAndAssignments();
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to update status', severity: 'error' });
    }
  };

  const resetPassword = async (userId) => {
    const newPassword = prompt('Enter new password:');
    if (!newPassword || newPassword.trim() === '') return;
    try {
      await api.put(`/owner/staff/${userId}`, { password: newPassword });
      setSnackbar({ open: true, message: 'Password reset successfully', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to reset password', severity: 'error' });
    }
  };

  const handleAssignmentToggle = async (cashierId, field) => {
    const currentAssign = assignments[cashierId] || { assigned_to_shop: false, assigned_to_mart: false };
    const updated = {
      ...currentAssign,
      [field]: !currentAssign[field],
    };

    // Optimistic UI update
    setAssignments((prev) => ({
      ...prev,
      [cashierId]: updated,
    }));

    try {
      await api.post('/owner/cashier-assignments', {
        cashier_id: cashierId,
        assigned_to_shop: updated.assigned_to_shop,
        assigned_to_mart: updated.assigned_to_mart,
      });
      setSnackbar({ open: true, message: 'Assignment updated successfully', severity: 'success' });
    } catch (err) {
      // Revert on error
      setAssignments((prev) => ({
        ...prev,
        [cashierId]: currentAssign,
      }));
      setSnackbar({ open: true, message: 'Failed to update assignment', severity: 'error' });
    }
  };

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      <Paper sx={{ p: 3, borderRadius: 2, mb: 3 }}>
        <Typography variant="h5" fontWeight={600} gutterBottom>
          Staff Management
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Add, manage, and assign cashiers to your shop or mart.
        </Typography>

        {/* Create Cashier Form */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: '#f9f9f9' }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Add New Cashier
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                label="Email"
                size="small"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                label="Full Name"
                size="small"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                label="Phone (optional)"
                size="small"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                type="password"
                label="Password"
                size="small"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Button
                fullWidth
                variant="contained"
                onClick={handleCreate}
                // disabled={loading}
                startIcon={<AddIcon />}
              >
                Create Cashier
              </Button>
            </Grid>
          </Grid>
        </Paper>

        {/* Staff List Table */}
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f5f5f5' }}>
              <TableRow>
                <TableCell><strong>Email</strong></TableCell>
                <TableCell><strong>Full Name</strong></TableCell>
                <TableCell><strong>Phone</strong></TableCell>
                {isLiquorMart && <TableCell align="center"><strong>Shop</strong></TableCell>}
                {isLiquorMart && <TableCell align="center"><strong>Mart</strong></TableCell>}
                <TableCell align="center"><strong>Active</strong></TableCell>
                <TableCell align="center"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {staff.map((cashier) => (
                <TableRow key={cashier.id} hover>
                  <TableCell>{cashier.email}</TableCell>
                  <TableCell>{cashier.full_name}</TableCell>
                  <TableCell>{cashier.phone || '—'}</TableCell>
                  {isLiquorMart && (
                    <TableCell align="center">
                      <Switch
                        checked={assignments[cashier.id]?.assigned_to_shop ?? false}
                        onChange={() => handleAssignmentToggle(cashier.id, 'assigned_to_shop')}
                        size="small"
                      />
                    </TableCell>
                  )}
                  {isLiquorMart && (
                    <TableCell align="center">
                      <Switch
                        checked={assignments[cashier.id]?.assigned_to_mart ?? false}
                        onChange={() => handleAssignmentToggle(cashier.id, 'assigned_to_mart')}
                        size="small"
                      />
                    </TableCell>
                  )}
                  <TableCell align="center">
                    <FormControlLabel
                      control={
                        <Switch
                          checked={cashier.is_active}
                          onChange={() => toggleStatus(cashier.id, cashier.is_active)}
                          size="small"
                        />
                      }
                      label=""
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Reset Password">
                      <IconButton
                        size="small"
                        onClick={() => resetPassword(cashier.id)}
                        color="primary"
                      >
                        <PasswordIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {staff.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={isLiquorMart ? 7 : 5} align="center">
                    <Typography color="text.secondary">No cashiers found.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}