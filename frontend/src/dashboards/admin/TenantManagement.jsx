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
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import StorefrontIcon from '@mui/icons-material/Storefront';

export default function TenantManagement() {
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState({
    hotel_name: '',
    email: '',
    phone: '',
    address: '',
    date_of_joining: '',
    owner_full_name: '',
    owner_email: '',
    owner_password: '',
    business_type: 'restaurant',
  });
  const [message, setMessage] = useState('');
  const [openDialog, setOpenDialog] = useState(false);

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
        hotel_name: '', email: '', phone: '', address: '',
        date_of_joining: '', owner_full_name: '', owner_email: '', owner_password: '',
        business_type: 'restaurant',
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

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Register New Business</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth required>
                <InputLabel>Business Type</InputLabel>
                <Select
                  name="business_type"
                  value={form.business_type}
                  label="Business Type"
                  onChange={handleChange}
                >
                  <MenuItem value="restaurant">Restaurant / Food Counter</MenuItem>
                  <MenuItem value="liquor_mart">Liquor Mart</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Business Name" name="hotel_name" value={form.hotel_name} onChange={handleChange} required />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Business Email" name="email" value={form.email} onChange={handleChange} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Phone" name="phone" value={form.phone} onChange={handleChange} required />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Address" name="address" value={form.address} onChange={handleChange} required />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth type="date" label="Date of Joining" name="date_of_joining" value={form.date_of_joining} onChange={handleChange} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle1" mt={2}>Owner Account</Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Owner Full Name" name="owner_full_name" value={form.owner_full_name} onChange={handleChange} required />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Owner Email" name="owner_email" value={form.owner_email} onChange={handleChange} required />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth type="password" label="Owner Password" name="owner_password" value={form.owner_password} onChange={handleChange} required />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit}>Register</Button>
        </DialogActions>
      </Dialog>

      {message && <Typography color="primary" sx={{ mb: 2 }}>{message}</Typography>}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Business Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Mart Status</TableCell>
              <TableCell>Mart Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Address</TableCell>
              <TableCell>Date Joined</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tenants.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.name}</TableCell>
                <TableCell>
                  <Chip
                    label={getBusinessTypeLabel(t.business_type)}
                    color={getBusinessTypeColor(t.business_type)}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={getMartStatusLabel(t)}
                    color={getMartStatusColor(t)}
                    size="small"
                    icon={t.has_mart ? <StorefrontIcon /> : undefined}
                  />
                </TableCell>
                <TableCell>{t.mart_name || '-'}</TableCell>
                <TableCell>{t.email}</TableCell>
                <TableCell>{t.phone}</TableCell>
                <TableCell>{t.address}</TableCell>
                <TableCell>{t.date_of_joining ? new Date(t.date_of_joining).toLocaleDateString() : ''}</TableCell>
                <TableCell>{t.status}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleDelete(t.id)} color="error"><DeleteIcon /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}