import { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  TextField,
  Button,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
  Grid,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Divider,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import StorefrontIcon from '@mui/icons-material/Storefront';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import InfoIcon from '@mui/icons-material/Info';

export default function TenantManagement() {
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState({
    hotel_name: '',
    phone: '',
    address: '',
    date_of_joining: '',
    owner_full_name: '',
    owner_email: '',
    owner_password: '',
    business_type: 'liquor_mart',
    shop_number: '',
  });
  const [message, setMessage] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [viewTenant, setViewTenant] = useState(null);
  const [openViewDialog, setOpenViewDialog] = useState(false);

  const handleView = (t) => {
    setViewTenant(t);
    setOpenViewDialog(true);
  };

  const handleEdit = (t) => {
    setViewTenant(t);
    setOpenViewDialog(true);
  };

  useEffect(() => { fetchTenants(); }, []);

  const fetchTenants = async () => {
    const res = await api.get('/admin/tenants');
    setTenants(res.data);
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async () => {
    try {
      await api.post('/admin/tenants', form);
      setMessage('Tenant created successfully!');
      setForm({
        hotel_name: '', phone: '', address: '',
        date_of_joining: '', owner_full_name: '', owner_email: '', owner_password: '',
        business_type: 'liquor_mart', shop_number: '',
      });
      setOpenDialog(false);
      fetchTenants();
    } catch (err) {
      setMessage('Error: ' + (err.response?.data?.detail || 'Unknown error'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this tenant?')) {
      await api.delete(`/admin/tenants/${id}`);
      fetchTenants();
    }
  };

  const getBusinessTypeLabel = (type) => {
    return type === 'restaurant' ? 'Restaurant' : 'Liquor Mart';
  };

  const getBusinessTypeColor = (type) => {
    return type === 'restaurant' ? 'info' : 'warning';
  };

  const getMartStatusLabel = (tenant) => {
    if (!tenant.has_mart) return 'No Mart';
    if (tenant.mart_approved) return 'Approved';
    return 'Pending Approval';
  };

  const getMartStatusColor = (tenant) => {
    if (!tenant.has_mart) return 'default';
    if (tenant.mart_approved) return 'success';
    return 'warning';
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Tenant Management</Typography>
        <Button variant="contained" onClick={() => setOpenDialog(true)}>Add New Business</Button>
      </Box>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3, padding: 1 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.5rem', color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
          <StorefrontIcon fontSize="large" /> Register New Liquor Mart
        </DialogTitle>
        <Divider sx={{ mb: 2 }} />
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          <DialogContent>
            {/* Business Details Section */}
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600, color: 'text.secondary' }}>
              Business Information
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Shop Number / Gazeet Number" name="shop_number" value={form.shop_number} onChange={handleChange} required inputProps={{ pattern: "[0-9]*" }} helperText="Only numbers allowed" />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Shop Name" name="hotel_name" value={form.hotel_name} onChange={handleChange} required />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Phone" name="phone" value={form.phone} onChange={handleChange} required inputProps={{ pattern: "[0-9]{10}", maxLength: 10 }} helperText="10 digits only" />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Address" name="address" value={form.address} onChange={handleChange} required />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth type="date" label="Date of Joining" name="date_of_joining" value={form.date_of_joining} onChange={handleChange} InputLabelProps={{ shrink: true }} />
              </Grid>
            </Grid>

            {/* Owner Details Section */}
            <Divider sx={{ my: 4 }} />
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600, color: 'text.secondary' }}>
              Owner Credentials
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <TextField fullWidth label="Owner Full Name" name="owner_full_name" value={form.owner_full_name} onChange={handleChange} required inputProps={{ pattern: "[A-Za-z ]+" }} helperText="Only characters" />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField fullWidth type="email" label="Owner Email" name="owner_email" value={form.owner_email} onChange={handleChange} required inputProps={{ pattern: ".*@gmail\\.com" }} helperText="Must be @gmail.com" />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField fullWidth type="password" label="Owner Password" name="owner_password" value={form.owner_password} onChange={handleChange} required />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => setOpenDialog(false)} sx={{ borderRadius: 2, px: 3, fontWeight: 600 }}>Cancel</Button>
            <Button type="submit" variant="contained" sx={{ borderRadius: 2, px: 4, py: 1, fontWeight: 600, boxShadow: 2 }}>Register Liquor Mart</Button>
          </DialogActions>
        </form>
      </Dialog>

      {message && <Typography color="primary" sx={{ mb: 2 }}>{message}</Typography>}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Shop Number</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Shop Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Mart Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Owner Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Phone</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Date Joined</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tenants.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.shop_number || '-'}</TableCell>
                <TableCell>{t.name}</TableCell>
                <TableCell>
                  <Chip
                    label={getMartStatusLabel(t)}
                    color={getMartStatusColor(t)}
                    size="small"
                    icon={t.has_mart ? <StorefrontIcon /> : undefined}
                  />
                </TableCell>
                <TableCell>{t.owner_name}</TableCell>
                <TableCell>{t.phone}</TableCell>
                <TableCell>{t.date_of_joining ? new Date(t.date_of_joining).toLocaleDateString() : ''}</TableCell>
                <TableCell>{t.status}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleView(t)} color="primary"><VisibilityIcon /></IconButton>
                  <IconButton onClick={() => handleEdit(t)} color="info"><EditIcon /></IconButton>
                  <IconButton onClick={() => handleDelete(t.id)} color="error"><DeleteIcon /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* View Details Dialog */}
      <Dialog open={openViewDialog} onClose={() => setOpenViewDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3, padding: 1 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.5rem', color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
          <InfoIcon fontSize="large" /> Tenant Details
        </DialogTitle>
        <Divider sx={{ mb: 2 }} />
        <DialogContent>
          {viewTenant && (
            <Grid container spacing={2}>
              <Grid item xs={6}><Typography variant="subtitle2" color="text.secondary">Shop Number</Typography><Typography>{viewTenant.shop_number || '-'}</Typography></Grid>
              <Grid item xs={6}><Typography variant="subtitle2" color="text.secondary">Shop Name</Typography><Typography>{viewTenant.name}</Typography></Grid>
              <Grid item xs={6}><Typography variant="subtitle2" color="text.secondary">Owner Name</Typography><Typography>{viewTenant.owner_name}</Typography></Grid>
              <Grid item xs={6}><Typography variant="subtitle2" color="text.secondary">Phone</Typography><Typography>{viewTenant.phone || '-'}</Typography></Grid>
              <Grid item xs={12}><Typography variant="subtitle2" color="text.secondary">Address</Typography><Typography>{viewTenant.address || '-'}</Typography></Grid>
              <Grid item xs={6}><Typography variant="subtitle2" color="text.secondary">Date Joined</Typography><Typography>{viewTenant.date_of_joining ? new Date(viewTenant.date_of_joining).toLocaleDateString() : '-'}</Typography></Grid>
              <Grid item xs={6}><Typography variant="subtitle2" color="text.secondary">Status</Typography><Typography>{viewTenant.status}</Typography></Grid>
              <Grid item xs={6}><Typography variant="subtitle2" color="text.secondary">Mart Approved</Typography><Typography>{viewTenant.mart_approved ? 'Yes' : 'No'}</Typography></Grid>
              <Grid item xs={6}><Typography variant="subtitle2" color="text.secondary">Mart Name</Typography><Typography>{viewTenant.mart_name || '-'}</Typography></Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenViewDialog(false)} variant="contained" sx={{ borderRadius: 2, px: 3 }}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}