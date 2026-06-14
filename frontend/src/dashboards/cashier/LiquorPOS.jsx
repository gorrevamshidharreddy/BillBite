import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Divider,
  Alert,
  CircularProgress,
  Chip,
  InputAdornment,
  Badge,
  Snackbar,
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Delete as DeleteIcon,
  ShoppingCart as CartIcon,
  Print as PrintIcon,
  Save as SaveIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  History as HistoryIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const LiquorPOS = () => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignedToMart, setAssignedToMart] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [sizes, setSizes] = useState([]);
  const [cart, setCart] = useState([]);
  const [cartTotal, setCartTotal] = useState(0);
  const [holdOrders, setHoldOrders] = useState([]);
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [recalledOrderId, setRecalledOrderId] = useState(null);
  const searchInputRef = useRef(null);

  // Check if current cashier is assigned to mart
  useEffect(() => {
    const checkAssignment = async () => {
      if (!user || user.role !== 'cashier') {
        setAssignedToMart(false);
        setAssignmentsLoading(false);
        return;
      }
      try {
        const response = await api.get('/cashier/my-assignments');
        setAssignedToMart(response.data.assigned_to_mart === true);
      } catch (err) {
        console.error('Failed to fetch cashier assignments', err);
        setAssignedToMart(false);
      } finally {
        setAssignmentsLoading(false);
      }
    };
    checkAssignment();
  }, [user]);

  useEffect(() => {
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    const total = cart.reduce((sum, item) => sum + item.mrp * item.quantity, 0);
    setCartTotal(total);
  }, [cart]);

  // Debounced brand search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        setLoading(true);
        api.get(`/cashier/liquor/search-brand?q=${encodeURIComponent(searchQuery)}`)
          .then(res => {
            setSearchResults(res.data);
          })
          .catch(err => {
            console.error('Failed to search brands', err);
          })
          .finally(() => {
            setLoading(false);
          });
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleBrandSelect = async (brand) => {
    setSelectedBrand(brand);
    setSearchQuery('');
    setSearchResults([]);
    setLoading(true);
    try {
      const location = assignedToMart ? 'mart' : 'shop';
      const res = await api.get(`/cashier/liquor/sizes/${brand.brand_code}?location=${location}`);
      setSizes(res.data);
    } catch (err) {
      console.error('Failed to fetch sizes', err);
      setSnackbar({ open: true, message: 'Failed to fetch sizes', severity: 'error' });
      setSizes([]);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (size) => {
    if (size.current_stock <= 0) {
      setSnackbar({ open: true, message: 'Out of stock', severity: 'warning' });
      return;
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === size.product_id);
      if (existing) {
        return prev.map((item) =>
          item.product_id === size.product_id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          product_id: size.product_id,
          brand_name: selectedBrand.brand_name,
          size_code: size.size_code,
          size_ml: size.size_ml,
          pack_qty: size.pack_qty,
          mrp: size.mrp,
          unit_cost: size.unit_cost,
          quantity: 1,
        },
      ];
    });
    setSnackbar({ open: true, message: 'Added to cart', severity: 'success' });
  };

  const updateQuantity = (productId, delta) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product_id === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeItem = (productId) => {
    setCart((prev) => prev.filter((item) => item.product_id !== productId));
  };

  const holdOrder = async () => {
    if (cart.length === 0) {
      setSnackbar({ open: true, message: 'Cart is empty', severity: 'warning' });
      return;
    }
    try {
      const response = await api.post('/cashier/orders', {
        items: cart.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.mrp,
        })),
        payment_method: paymentMethod || 'cash',
        status: 'hold',
      });
      setCart([]);
      setSelectedBrand(null);
      setSizes([]);
      setSearchQuery('');
      setRecalledOrderId(null);
      setSnackbar({ open: true, message: 'Order held', severity: 'success' });
      fetchHoldOrders();
    } catch (err) {
      console.error('Hold order failed', err);
      setSnackbar({ open: true, message: 'Failed to hold order', severity: 'error' });
    }
  };

  const fetchHoldOrders = async () => {
    try {
      const response = await api.get('/cashier/orders/hold');
      setHoldOrders(response.data);
    } catch (err) {
      console.error('Failed to fetch held orders', err);
    }
  };

  useEffect(() => {
    fetchHoldOrders();
  }, []);

  const recallOrder = async (orderId) => {
    setLoading(true);
    try {
      const response = await api.get(`/cashier/orders/${orderId}`);
      const order = response.data;
      const cartItems = order.items.map((item) => ({
        product_id: item.product_id,
        brand_name: item.brand_name,
        size_code: item.size_code || '',
        size_ml: item.size_ml || 0,
        pack_qty: item.pack_qty || 0,
        mrp: item.unit_price,
        unit_cost: item.cost_price || 0,
        quantity: item.quantity,
      }));
      setCart(cartItems);
      setRecalledOrderId(orderId);
      setHoldDialogOpen(false);
      setSnackbar({ open: true, message: 'Order recalled', severity: 'success' });
    } catch (err) {
      console.error('Recall failed', err);
      setSnackbar({ open: true, message: 'Failed to recall order', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = (orderId, items, total, paymentMethod) => {
    const doc = new jsPDF();
    const tenantName = currentTenant?.name || 'Liquor Mart';
    const tenantAddress = currentTenant?.address || '';
    const currentDate = new Date().toLocaleString();

    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text(tenantName, 105, 15, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(tenantAddress, 105, 22, { align: 'center' });
    doc.text(`Date: ${currentDate}`, 105, 30, { align: 'center' });
    doc.line(15, 35, 195, 35);

    const tableData = items.map((item) => [
      item.brand_name,
      item.quantity,
      `₹${item.mrp}`,
      `₹${item.mrp * item.quantity}`,
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Item', 'Qty', 'Rate', 'Amount']],
      body: tableData,
      theme: 'striped',
      styles: {
        fontSize: 9,
        cellPadding: 2,
        valign: 'middle',
        overflow: 'linebreak',
      },
      columnStyles: {
        0: { cellWidth: 'auto', minCellWidth: 60 },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 25, halign: 'right' },
        3: { cellWidth: 30, halign: 'right' },
      },
      headStyles: { fillColor: [66, 66, 66], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 240, 240] },
    });

    const finalY = doc.lastAutoTable.finalY + 5;
    doc.setFontSize(10);
    doc.text(`Total: ₹${total}`, 150, finalY);
    doc.text(`Payment: ${paymentMethod.toUpperCase()}`, 150, finalY + 7);
    doc.text('Thank you! Visit again.', 105, finalY + 20, { align: 'center' });

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bill_${orderId.slice(0,8)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const completeSale = async () => {
    if (cart.length === 0) {
      setSnackbar({ open: true, message: 'Cart is empty', severity: 'warning' });
      return;
    }
    setLoading(true);
    try {
      let response;
      if (recalledOrderId) {
        // Update existing held order to completed (stock already deducted)
        response = await api.put(`/cashier/orders/${recalledOrderId}`, {
          items: cart.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.mrp,
          })),
          payment_method: paymentMethod,
          status: 'completed',
        });
        setRecalledOrderId(null);
      } else {
        // Create new order (stock will be deducted)
        response = await api.post('/cashier/orders', {
          items: cart.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.mrp,
          })),
          payment_method: paymentMethod,
          status: 'completed',
        });
      }
      const orderId = response.data.order_id;
      generatePDF(orderId, cart, cartTotal, paymentMethod);
      setCart([]);
      setSelectedBrand(null);
      setSizes([]);
      setSearchQuery('');
      setCompleteDialogOpen(false);
      setSnackbar({ open: true, message: 'Sale completed', severity: 'success' });
      fetchHoldOrders();
    } catch (err) {
      console.error('Complete sale failed', err);
      setSnackbar({ open: true, message: err.response?.data?.detail || 'Failed to complete sale', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const clearCart = () => {
    if (cart.length > 0) {
      setCart([]);
      setRecalledOrderId(null);
      setSnackbar({ open: true, message: 'Cart cleared', severity: 'info' });
    }
  };

  if (assignmentsLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  }

  if (!assignedToMart) {
    return <Alert severity="warning">You are not assigned to the mart. Cannot use POS.</Alert>;
  }

  return (
    <Box sx={{ p: { xs: 1, md: 3 }, height: '100%' }}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }}>
            <TextField
              fullWidth
              inputRef={searchInputRef}
              placeholder="Search by brand name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: searchQuery && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery('')}>
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Paper>

          {selectedBrand ? (
            <Paper sx={{ p: 2, borderRadius: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  {selectedBrand.brand_name} <Chip label={selectedBrand.brand_code} size="small" />
                </Typography>
                <Button size="small" onClick={() => { setSelectedBrand(null); setSizes([]); }}>
                  Change Brand
                </Button>
              </Box>
              <Divider sx={{ mb: 2 }} />
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
              ) : sizes.length === 0 ? (
                <Typography color="text.secondary">No sizes available</Typography>
              ) : (
                <Grid container spacing={2}>
                  {sizes.map((size) => (
                    <Grid item xs={6} sm={4} key={size.product_id}>
                      <Card
                        variant="outlined"
                        sx={{
                          cursor: size.current_stock > 0 ? 'pointer' : 'not-allowed',
                          opacity: size.current_stock > 0 ? 1 : 0.6,
                          '&:hover': size.current_stock > 0 ? { boxShadow: 3 } : {}
                        }}
                        onClick={() => addToCart(size)}
                      >
                        <CardContent sx={{ textAlign: 'center', p: 1.5 }}>
                          <Typography variant="subtitle1">{size.size_code}</Typography>
                          <Typography variant="caption">{size.size_ml}ml</Typography>
                          <Typography variant="caption" display="block">Pack: {size.pack_qty} btls/case</Typography>
                          <Typography variant="body2" fontWeight={600}>₹{size.mrp}</Typography>
                          <Chip
                            label={`Stock: ${size.current_stock}`}
                            size="small"
                            color={size.current_stock < 5 ? 'warning' : 'default'}
                            sx={{ mt: 0.5 }}
                          />
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Paper>
          ) : (
            <Paper sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {searchQuery ? 'Select a brand from search results' : 'Type to search for a brand'}
              </Typography>
              {loading && <CircularProgress size={24} sx={{ mt: 1 }} />}
              {searchResults.length > 0 && (
                <List>
                  {searchResults.map((brand) => (
                    <ListItem
                      key={`${brand.brand_code}_${brand.brand_name}`}
                      sx={{ cursor: 'pointer' }}
                      onClick={() => handleBrandSelect(brand)}
                    >
                      <ListItemText primary={brand.brand_name} secondary={`Code: ${brand.brand_code}`} />
                    </ListItem>
                  ))}
                </List>
              )}
            </Paper>
          )}
        </Grid>

        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2, borderRadius: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Cart</Typography>
              <Badge badgeContent={cart.length} color="primary">
                <CartIcon />
              </Badge>
            </Box>
            <Divider />
            <Box sx={{ flexGrow: 1, maxHeight: '60vh', overflow: 'auto', mt: 2 }}>
              {cart.length === 0 ? (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>Cart is empty</Typography>
              ) : (
                cart.map((item) => (
                  <Box key={item.product_id} sx={{ mb: 2, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{item.brand_name}</Typography>
                        <Typography variant="caption">{item.size_code} ({item.size_ml}ml) | ₹{item.mrp}</Typography>
                      </Box>
                      <Box>
                        <IconButton size="small" onClick={() => updateQuantity(item.product_id, -1)}><RemoveIcon fontSize="small" /></IconButton>
                        <Typography variant="body2" component="span" sx={{ mx: 1 }}>{item.quantity}</Typography>
                        <IconButton size="small" onClick={() => updateQuantity(item.product_id, 1)}><AddIcon fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={() => removeItem(item.product_id)}><DeleteIcon fontSize="small" /></IconButton>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Typography variant="body2">₹{item.mrp * item.quantity}</Typography>
                    </Box>
                  </Box>
                ))
              )}
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="subtitle1">Total</Typography>
              <Typography variant="h6">₹{cartTotal.toLocaleString()}</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button variant="outlined" startIcon={<SaveIcon />} onClick={holdOrder} disabled={cart.length === 0}>Hold</Button>
              <Button variant="outlined" startIcon={<HistoryIcon />} onClick={() => setHoldDialogOpen(true)}>Recall</Button>
              <Button variant="outlined" color="error" startIcon={<ClearIcon />} onClick={clearCart} disabled={cart.length === 0}>Clear</Button>
              <Button variant="contained" startIcon={<PrintIcon />} onClick={() => setCompleteDialogOpen(true)} disabled={cart.length === 0}>Pay & Print</Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={holdDialogOpen} onClose={() => setHoldDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Held Orders</DialogTitle>
        <DialogContent>
          {holdOrders.length === 0 ? (
            <Typography>No held orders</Typography>
          ) : (
            <List>
              {holdOrders.map((order) => (
                <ListItem key={order.id} sx={{ cursor: 'pointer' }} onClick={() => recallOrder(order.id)}>
                  <ListItemText primary={`Order: ${order.id.slice(0, 8)}`} secondary={`Items: ${order.items_count} | ₹${order.total_amount}`} />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHoldDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={completeDialogOpen} onClose={() => setCompleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Complete Sale</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>Total Amount: ₹{cartTotal.toLocaleString()}</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['cash', 'upi', 'card'].map((method) => (
              <Button
                key={method}
                variant={paymentMethod === method ? 'contained' : 'outlined'}
                onClick={() => setPaymentMethod(method)}
                startIcon={paymentMethod === method ? <CheckIcon /> : null}
              >
                {method.toUpperCase()}
              </Button>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompleteDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={completeSale} disabled={loading}>Confirm & Print</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default LiquorPOS;