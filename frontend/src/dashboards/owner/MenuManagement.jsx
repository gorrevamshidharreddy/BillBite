import { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  TextField, Button, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Box, Select, MenuItem, FormControl, InputLabel,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Grid,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

export default function MenuManagement() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ name: '', price: '', item_type: 'prepared', category_id: '' });
  const [editId, setEditId] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [categoryName, setCategoryName] = useState('');

  const fetchItems = async () => {
    const res = await api.get('/owner/menu');
    setItems(res.data);
  };
  const fetchCategories = async () => {
    const res = await api.get('/owner/menu/categories');
    setCategories(res.data);
  };

  useEffect(() => { fetchItems(); fetchCategories(); }, []);

  const handleSubmit = async () => {
    const data = {
      name: form.name, price: parseFloat(form.price),
      item_type: form.item_type, category_id: form.category_id || null,
    };
    if (editId) {
      await api.put(`/owner/menu/items/${editId}`, data);
    } else {
      await api.post('/owner/menu/items', data);
    }
    setForm({ name: '', price: '', item_type: 'prepared', category_id: '' });
    setEditId(null);
    setOpenDialog(false);
    fetchItems();
  };

  const handleEdit = (item) => {
    setEditId(item.id);
    setForm({ name: item.name, price: item.price.toString(), item_type: item.item_type, category_id: item.category_id || '' });
    setOpenDialog(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete item?')) {
      await api.delete(`/owner/menu/items/${id}`);
      fetchItems();
    }
  };

  const addCategory = async () => {
    if (categoryName.trim()) {
      await api.post('/owner/menu/categories', { name: categoryName });
      setCategoryName('');
      fetchCategories();
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h4">Menu Management</Typography>
        <Button variant="contained" onClick={() => { setEditId(null); setForm({ name: '', price: '', item_type: 'prepared', category_id: '' }); setOpenDialog(true); }}>
          Add Item
        </Button>
      </Box>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit Item' : 'New Item'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}><TextField fullWidth label="Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></Grid>
            <Grid item xs={6}><TextField fullWidth type="number" label="Price" value={form.price} onChange={e => setForm({...form, price: e.target.value})} required /></Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select value={form.item_type} label="Type" onChange={e => setForm({...form, item_type: e.target.value})}>
                  <MenuItem value="prepared">Prepared</MenuItem>
                  <MenuItem value="packaged">Packaged</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select value={form.category_id} label="Category" onChange={e => setForm({...form, category_id: e.target.value})}>
                  <MenuItem value="">None</MenuItem>
                  {categories.map(cat => <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit}>{editId ? 'Update' : 'Add'}</Button>
        </DialogActions>
      </Dialog>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" mb={1}>Categories</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField size="small" placeholder="New category" value={categoryName} onChange={e => setCategoryName(e.target.value)} />
          <Button variant="outlined" onClick={addCategory}>Add</Button>
        </Box>
        <Box sx={{ mt: 1 }}>
          {categories.map(c => <Button key={c.id} variant="outlined" size="small" sx={{ m: 0.5 }}>{c.name}</Button>)}
        </Box>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell><TableCell>Price</TableCell><TableCell>Type</TableCell><TableCell>Category</TableCell><TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>₹{item.price}</TableCell>
                <TableCell>{item.item_type}</TableCell>
                <TableCell>{categories.find(c => c.id === item.category_id)?.name || '-'}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleEdit(item)}><EditIcon /></IconButton>
                  <IconButton onClick={() => handleDelete(item.id)} color="error"><DeleteIcon /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}