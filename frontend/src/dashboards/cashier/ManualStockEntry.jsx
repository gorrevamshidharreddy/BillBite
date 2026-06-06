import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, TextField, Button, Grid,
  Card, CardContent, Alert, Snackbar, CircularProgress,
  List, ListItem, ListItemText, ListItemButton, Divider
} from '@mui/material';
import api from '../../services/api';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../context/AuthContext';

const ManualStockEntry = () => {
  const { currentTenant } = useTenant();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [sizes, setSizes] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cases, setCases] = useState(0);
  const [loose, setLoose] = useState(0);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Check if cashier is assigned to mart
  useEffect(() => {
    const checkMartAssignment = async () => {
      if (!token) {
        navigate('/login');
        return;
      }
      try {
        const res = await api.get('/cashier/my-assignments');
        if (!res.data.assigned_to_mart) {
          navigate('/cashier', { replace: true });
        }
      } catch (err) {
        console.error('Failed to check assignment', err);
        navigate('/cashier', { replace: true });
      } finally {
        setCheckingAccess(false);
      }
    };
    checkMartAssignment();
  }, [token, navigate]);

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setLoading(true);
    try {
      const res = await api.get('/cashier/liquor/search-brand', { params: { q: searchTerm } });
      setSearchResults(res.data);
      setSelectedBrand(null);
      setSizes([]);
      setSelectedProduct(null);
    } catch (err) {
      setSnackbar({ open: true, message: 'Search failed', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleBrandSelect = async (brand) => {
    setLoading(true);
    setSelectedBrand(brand);
    setSelectedProduct(null);
    setCases(0);
    setLoose(0);
    try {
      const res = await api.get(`/cashier/liquor/sizes/${brand.brand_code}`);
      setSizes(res.data);
      setSearchResults([]);
      setSearchTerm('');
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to load sizes', severity: 'error' });
      setSelectedBrand(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSizeSelect = (size) => {
    setSelectedProduct(size);
  };

  const handleBackToBrands = () => {
    setSelectedBrand(null);
    setSizes([]);
    setSelectedProduct(null);
    setSearchTerm('');
    setSearchResults([]);
  };

  const handleSubmit = async () => {
    if (!selectedProduct) {
      setSnackbar({ open: true, message: 'Select a product (size) first', severity: 'warning' });
      return;
    }
    const casesNum = parseInt(cases) || 0;
    const looseNum = parseInt(loose) || 0;
    if (casesNum === 0 && looseNum === 0) {
      setSnackbar({ open: true, message: 'Enter at least one case or loose bottle', severity: 'warning' });
      return;
    }
    setLoading(true);
    try {
      await api.post('/cashier/liquor/add-stock-manual', {
        product_id: selectedProduct.product_id,
        cases: casesNum,
        loose_bottles: looseNum
      });
      const refreshRes = await api.get(`/cashier/liquor/sizes/${selectedBrand.brand_code}`);
      const updatedSizes = refreshRes.data;
      setSizes(updatedSizes);
      const updatedProduct = updatedSizes.find(s => s.product_id === selectedProduct.product_id);
      if (updatedProduct) {
        setSelectedProduct(updatedProduct);
      }
      setSnackbar({ open: true, message: 'Stock added successfully', severity: 'success' });
      setCases(0);
      setLoose(0);
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.detail || 'Failed to add stock', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (checkingAccess) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 3, borderRadius: 2 }}>
        <Typography variant="h5" gutterBottom>Manual Stock Entry</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Search for a brand → select a specific size → add cases and/or loose bottles.
        </Typography>

        <Grid container spacing={2}>
          {!selectedBrand && (
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Search Brand (name or code)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button variant="contained" onClick={handleSearch} sx={{ mt: 1 }} disabled={loading}>
                {loading ? <CircularProgress size={24} /> : 'Search'}
              </Button>
            </Grid>
          )}

          {!selectedBrand && searchResults.length > 0 && (
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ mt: 2 }}>Select a brand:</Typography>
              <List>
                {searchResults.map((brand) => (
                  <ListItem key={brand.brand_code} disablePadding>
                    <ListItemButton onClick={() => handleBrandSelect(brand)}>
                      <ListItemText primary={brand.brand_name} secondary={`Code: ${brand.brand_code}`} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Grid>
          )}

          {selectedBrand && !selectedProduct && (
            <Grid item xs={12}>
              <Card variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6">{selectedBrand.brand_name}</Typography>
                  <Button size="small" onClick={handleBackToBrands}>Change Brand</Button>
                </Box>
                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle2" gutterBottom>Select a size:</Typography>
                <Grid container spacing={2}>
                  {sizes.map((size) => (
                    <Grid item xs={6} sm={4} key={size.product_id}>
                      <Card variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => handleSizeSelect(size)}>
                        <CardContent>
                          <Typography variant="subtitle1">{size.size_code}</Typography>
                          <Typography variant="body2">{size.size_ml} ml</Typography>
                          <Typography variant="body2">Pack: {size.pack_qty} bottles/case</Typography>
                          <Typography variant="body2">Stock: {size.current_stock} bottles</Typography>
                          <Typography variant="body2" fontWeight="bold">MRP: ₹{size.mrp}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Card>
            </Grid>
          )}

          {selectedProduct && (
            <Grid item xs={12}>
              <Card variant="outlined" sx={{ p: 2, mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6">
                    {selectedProduct.brand_name} – {selectedProduct.size_code} ({selectedProduct.size_ml}ml)
                  </Typography>
                  <Button size="small" onClick={() => setSelectedProduct(null)}>Change Size</Button>
                </Box>
                <Divider sx={{ my: 1 }} />
                <Typography variant="body2" gutterBottom>
                  Current stock: <strong>{selectedProduct.current_stock}</strong> bottles
                </Typography>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      type="number"
                      label={`Cases (1 case = ${selectedProduct.pack_qty} bottles)`}
                      value={cases}
                      onChange={(e) => setCases(e.target.value)}
                      inputProps={{ min: 0 }}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Loose Bottles"
                      value={loose}
                      onChange={(e) => setLoose(e.target.value)}
                      inputProps={{ min: 0 }}
                    />
                  </Grid>
                </Grid>
                <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                  <Button variant="contained" color="primary" onClick={handleSubmit} disabled={loading}>
                    Add Stock
                  </Button>
                  <Button variant="outlined" onClick={() => { setSelectedProduct(null); setCases(0); setLoose(0); }}>
                    Cancel
                  </Button>
                </Box>
              </Card>
            </Grid>
          )}
        </Grid>

        <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Paper>
    </Box>
  );
};

export default ManualStockEntry;