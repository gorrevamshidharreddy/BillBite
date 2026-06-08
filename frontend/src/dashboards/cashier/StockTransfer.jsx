import React, { useState } from 'react';
import {
  Box, Paper, Typography, TextField, Button, Grid, Card, CardContent,
  Alert, Snackbar, CircularProgress, List, ListItem, ListItemText,
  ListItemButton, Divider,
} from '@mui/material';
import api from '../../services/api';

const StockTransfer = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [sizes, setSizes] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cases, setCases] = useState(0);
  const [loose, setLoose] = useState(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

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
      // Request shop stock
      const res = await api.get(`/cashier/liquor/sizes/${brand.brand_code}`, {
        params: { location: 'shop' }
      });
      // Filter only sizes with stock > 0
      const availableSizes = res.data.filter(size => size.current_stock > 0);
      setSizes(availableSizes);
      setSearchResults([]);
      setSearchTerm('');
      if (availableSizes.length === 0) {
        setSnackbar({ open: true, message: 'No sizes available in shop stock', severity: 'warning' });
      }
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
    if (selectedProduct.current_stock < (casesNum * selectedProduct.pack_qty + looseNum)) {
      setSnackbar({ open: true, message: 'Insufficient shop stock', severity: 'error' });
      return;
    }
    setLoading(true);
    try {
      await api.post('/cashier/stock-transfer', {
        product_id: selectedProduct.product_id,
        cases: casesNum,
        loose_bottles: looseNum,
        notes: notes,
      });
      setSnackbar({ open: true, message: 'Stock transferred to mart successfully', severity: 'success' });
      // Reset form
      setSelectedProduct(null);
      setSelectedBrand(null);
      setSizes([]);
      setSearchTerm('');
      setSearchResults([]);
      setCases(0);
      setLoose(0);
      setNotes('');
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.detail || 'Transfer failed', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 3, borderRadius: 2 }}>
        <Typography variant="h5" gutterBottom>Stock Transfer (Shop → Mart)</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Transfer stock from the shop inventory to the mart. Only shop‑assigned cashiers can perform this.
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
                <Typography variant="subtitle2" gutterBottom>Select a size (only those with shop stock):</Typography>
                <Grid container spacing={2}>
                  {sizes.map((size) => (
                    <Grid item xs={6} sm={4} key={size.product_id}>
                      <Card variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => handleSizeSelect(size)}>
                        <CardContent>
                          <Typography variant="subtitle1">{size.size_code}</Typography>
                          <Typography variant="body2">{size.size_ml} ml</Typography>
                          <Typography variant="body2">Pack: {size.pack_qty} bottles/case</Typography>
                          <Typography variant="body2">
                            Shop Stock: <strong>{size.current_stock}</strong> bottles
                          </Typography>
                          <Typography variant="body2" fontWeight="bold">MRP: ₹{size.mrp}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
                {sizes.length === 0 && (
                  <Alert severity="info" sx={{ mt: 2 }}>No sizes available in shop stock for this brand.</Alert>
                )}
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
                  Current shop stock: <strong>{selectedProduct.current_stock}</strong> bottles
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
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Notes (optional)"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      multiline
                      rows={2}
                    />
                  </Grid>
                </Grid>
                <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                  <Button variant="contained" color="primary" onClick={handleSubmit} disabled={loading}>
                    Transfer to Mart
                  </Button>
                  <Button variant="outlined" onClick={() => { setSelectedProduct(null); setCases(0); setLoose(0); setNotes(''); }}>
                    Cancel
                  </Button>
                </Box>
              </Card>
            </Grid>
          )}
        </Grid>

        <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
        </Snackbar>
      </Paper>
    </Box>
  );
};

export default StockTransfer;