// frontend/src/dashboards/cashier/POS.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  Card,
  CardContent,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  Select,
  MenuItem,
  Alert,
  Snackbar,
  CircularProgress,
  Divider,
  Chip,
  Badge,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Delete as DeleteIcon,
  Print as PrintIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
  ShoppingCart as CartIcon,
} from '@mui/icons-material';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../../services/api';
import { useTenant } from '../../context/TenantContext';

const POS = () => {
  const { currentTenant } = useTenant();
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [heldOrders, setHeldOrders] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [recalledOrderId, setRecalledOrderId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [error, setError] = useState('');

  // Fetch data
  const fetchMenu = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/cashier/menu');
      setMenu(res.data);
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to load menu', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHeldOrders = useCallback(async () => {
    try {
      const res = await api.get('/cashier/orders/hold');
      setHeldOrders(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
    fetchHeldOrders();
  }, [fetchMenu, fetchHeldOrders]);

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { menu_item_id: item.id, name: item.name, unit_price: item.price, quantity: 1 }];
    });
    setSnackbar({ open: true, message: `${item.name} added`, severity: 'success' });
  };

  const updateCartItem = (menu_item_id, quantity) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((c) => c.menu_item_id !== menu_item_id));
    } else {
      setCart((prev) =>
        prev.map((c) => (c.menu_item_id === menu_item_id ? { ...c, quantity } : c))
      );
    }
  };

  const removeItem = (menu_item_id) => {
    setCart((prev) => prev.filter((c) => c.menu_item_id !== menu_item_id));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const generatePDF = (orderId, tokenNumber, total, payMethod) => {
    const doc = new jsPDF({ unit: 'mm', format: [80, 200] });
    const pageWidth = 80;
    let y = 5;

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(currentTenant?.name || 'Restaurant', pageWidth / 2, y, { align: 'center' });
    y += 6;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    if (currentTenant?.address) {
      doc.text(currentTenant.address, pageWidth / 2, y, { align: 'center' });
      y += 4;
    }
    if (currentTenant?.phone) {
      doc.text(`Tel: ${currentTenant.phone}`, pageWidth / 2, y, { align: 'center' });
      y += 4;
    }
    y += 2;
    doc.text(`Date: ${new Date().toLocaleString()}`, pageWidth / 2, y, { align: 'center' });
    y += 5;
    doc.setLineWidth(0.2);
    doc.line(5, y, pageWidth - 5, y);
    y += 5;

    // Token
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOKEN: ${tokenNumber}`, pageWidth / 2, y, { align: 'center' });
    y += 8;

    // Items table
    const tableRows = cart.map((item) => [
      item.name.substring(0, 18),
      item.quantity.toString(),
      (item.unit_price * item.quantity).toFixed(2),
    ]);
    autoTable(doc, {
      head: [['Item', 'Qty', 'Price']],
      body: tableRows,
      startY: y,
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1, halign: 'left' },
      headStyles: { fontSize: 8, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 15, halign: 'center' }, 2: { cellWidth: 20, halign: 'right' } },
      margin: { left: 5, right: 5 },
    });
    y = doc.lastAutoTable.finalY + 3;
    doc.setLineWidth(0.2);
    doc.line(5, y, pageWidth - 5, y);
    y += 4;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total: ₹${total.toFixed(2)}`, pageWidth / 2, y, { align: 'center' });
    y += 5;
    doc.setFontSize(8);
    doc.text(`Payment: ${payMethod.toUpperCase()}`, pageWidth / 2, y, { align: 'center' });
    y += 8;

    // Kitchen copy separator
    doc.line(5, y, pageWidth - 5, y);
    y += 5;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('--- KITCHEN COPY ---', pageWidth / 2, y, { align: 'center' });
    y += 6;
    doc.setFontSize(14);
    doc.text(`TOKEN: ${tokenNumber}`, pageWidth / 2, y, { align: 'center' });
    y += 6;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Items:', 10, y);
    y += 4;
    cart.forEach((item) => {
      doc.text(`${item.quantity}x ${item.name.substring(0, 20)}`, 10, y);
      y += 4;
    });
    y += 4;
    doc.line(5, y, pageWidth - 5, y);

    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, '_blank');
  };

  const placeOrder = async (status = 'completed') => {
    if (cart.length === 0) {
      setSnackbar({ open: true, message: 'Cart is empty', severity: 'warning' });
      return;
    }
    setLoading(true);
    try {
      if (recalledOrderId && status === 'completed') {
        const res = await api.put(`/cashier/orders/${recalledOrderId}`, {
          items: cart.map(({ menu_item_id, quantity, unit_price }) => ({
            menu_item_id,
            quantity,
            unit_price,
          })),
          payment_method: paymentMethod,
          status: 'completed',
        });
        generatePDF(res.data.token_number, res.data.token_number, cartTotal, paymentMethod);
        setRecalledOrderId(null);
      } else {
        const res = await api.post('/cashier/orders', {
          items: cart.map(({ menu_item_id, quantity, unit_price }) => ({
            menu_item_id,
            quantity,
            unit_price,
          })),
          payment_method: status === 'completed' ? paymentMethod : '',
          status,
        });
        if (status === 'completed') {
          generatePDF(res.data.order_id, res.data.token_number, res.data.total, paymentMethod);
        }
      }
      setCart([]);
      fetchHeldOrders();
      setSnackbar({ open: true, message: status === 'completed' ? 'Order completed & bill printed' : 'Order held', severity: 'success' });
    } catch (err) {
      console.error(err);
      setSnackbar({ open: true, message: err.response?.data?.detail || 'Operation failed', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const recallOrder = async (orderId) => {
    setLoading(true);
    try {
      const res = await api.get(`/cashier/orders/${orderId}`);
      const order = res.data;
      const cartItems = order.items.map((it) => ({
        menu_item_id: it.menu_item_id,
        name: it.name,
        unit_price: it.unit_price,
        quantity: it.quantity,
      }));
      setCart(cartItems);
      setRecalledOrderId(orderId);
      setHeldOrders((prev) => prev.filter((o) => o.id !== orderId));
      setSnackbar({ open: true, message: 'Order recalled', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to recall order', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 1, md: 3 }, minHeight: '100vh' }}>
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Menu Grid */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>
              Menu
            </Typography>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Grid container spacing={1.5}>
                {menu.map((item) => (
                  <Grid item xs={6} sm={4} md={3} key={item.id}>
                    <Button
                      variant="outlined"
                      fullWidth
                      sx={{
                        height: 70,
                        display: 'flex',
                        flexDirection: 'column',
                        textTransform: 'none',
                        borderRadius: 2,
                        transition: '0.2s',
                        '&:hover': { transform: 'translateY(-2px)', boxShadow: 2 },
                      }}
                      onClick={() => addToCart(item)}
                    >
                      <Typography variant="body2" fontWeight={500}>
                        {item.name}
                      </Typography>
                      <Typography variant="caption" color="primary">
                        ₹{item.price}
                      </Typography>
                    </Button>
                  </Grid>
                ))}
              </Grid>
            )}
          </Paper>
        </Grid>

        {/* Cart & Controls */}
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 2, mb: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Cart</Typography>
                <Badge badgeContent={cartItemCount} color="primary">
                  <CartIcon />
                </Badge>
              </Box>
              <Divider />

              {cart.length === 0 ? (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  Cart is empty
                </Typography>
              ) : (
                <TableContainer sx={{ maxHeight: 300, overflow: 'auto' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Item</TableCell>
                        <TableCell align="center">Qty</TableCell>
                        <TableCell align="right">Total</TableCell>
                        <TableCell align="center"></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cart.map((item) => (
                        <TableRow key={item.menu_item_id}>
                          <TableCell>
                            <Typography variant="body2">{item.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              ₹{item.unit_price}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <IconButton size="small" onClick={() => updateCartItem(item.menu_item_id, item.quantity - 1)}>
                                <RemoveIcon fontSize="small" />
                              </IconButton>
                              <Typography sx={{ mx: 1 }}>{item.quantity}</Typography>
                              <IconButton size="small" onClick={() => updateCartItem(item.menu_item_id, item.quantity + 1)}>
                                <AddIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </TableCell>
                          <TableCell align="right">₹{(item.unit_price * item.quantity).toFixed(2)}</TableCell>
                          <TableCell align="center">
                            <Tooltip title="Remove">
                              <IconButton size="small" color="error" onClick={() => removeItem(item.menu_item_id)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle1">Total</Typography>
                <Typography variant="h6">₹{cartTotal.toFixed(2)}</Typography>
              </Box>

              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <MenuItem value="cash">Cash</MenuItem>
                  <MenuItem value="upi">UPI</MenuItem>
                  <MenuItem value="card">Card</MenuItem>
                </Select>
              </FormControl>

              <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                <Button
                  variant="contained"
                  startIcon={<PrintIcon />}
                  onClick={() => placeOrder('completed')}
                  disabled={loading || cart.length === 0}
                  fullWidth
                >
                  {recalledOrderId ? 'Complete & Print' : 'Complete & Print'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<SaveIcon />}
                  onClick={() => placeOrder('hold')}
                  disabled={loading || cart.length === 0}
                  fullWidth
                >
                  Hold Bill
                </Button>
              </Box>

              {recalledOrderId && (
                <Chip
                  label={`Editing recalled order ${recalledOrderId.slice(0, 8)}`}
                  color="primary"
                  size="small"
                  sx={{ mt: 2, width: '100%' }}
                  onDelete={() => {
                    setRecalledOrderId(null);
                    setCart([]);
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* Held Orders */}
          <Paper sx={{ p: 2, borderRadius: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle1">Held Orders</Typography>
              <IconButton size="small" onClick={fetchHeldOrders}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Box>
            {heldOrders.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No held orders
              </Typography>
            ) : (
              heldOrders.map((order) => (
                <Box
                  key={order.id}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 1,
                    mb: 1,
                  }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      ₹{order.total_amount}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(order.created_at).toLocaleTimeString()}
                    </Typography>
                  </Box>
                  <Button size="small" variant="contained" onClick={() => recallOrder(order.id)}>
                    Recall
                  </Button>
                </Box>
              ))
            )}
          </Paper>
        </Grid>
      </Grid>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default POS;