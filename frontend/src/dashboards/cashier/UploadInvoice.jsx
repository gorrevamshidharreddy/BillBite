import React, { useState } from 'react';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, IconButton, Alert, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Grid, Card, CardContent
} from '@mui/material';
import { CloudUpload as UploadIcon, Delete as DeleteIcon, CheckCircle as CheckIcon } from '@mui/icons-material';
import api from '../../services/api';

export default function UploadInvoice() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [error, setError] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setPreviewData(null);
    }
  };

  const processInvoice = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await api.post('/cashier/liquor/upload-invoice/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreviewData(response.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to process invoice');
    } finally {
      setUploading(false);
    }
  };

  const updateLooseBottles = (index, value) => {
    const newItems = [...previewData.items];
    newItems[index].loose = parseInt(value) || 0;
    setPreviewData({ ...previewData, items: newItems });
  };

  const confirmUpload = async () => {
    setUploading(true);
    try {
      await api.post('/cashier/liquor/upload-invoice/confirm', previewData);
      setSuccess(true);
      setTimeout(() => {
        setFile(null);
        setPreviewData(null);
        setSuccess(false);
        setConfirmDialog(false);
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add stock');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h5">Upload ICDC Invoice</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Upload the PDF invoice from the distributor. The system will extract products.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>Stock added successfully!</Alert>}

        {!previewData && !success && (
          <>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              style={{ marginBottom: 16 }}
            />
            {file && (
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Typography variant="body2">{file.name}</Typography>
                <IconButton size="small" onClick={() => setFile(null)}><DeleteIcon /></IconButton>
                <Button variant="contained" onClick={processInvoice} disabled={uploading}>
                  {uploading ? <CircularProgress size={24} /> : 'Preview Invoice'}
                </Button>
              </Box>
            )}
          </>
        )}

        {previewData && !success && (
          <>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={4}><Card><CardContent><Typography variant="caption">Total Items</Typography><Typography variant="h6">{previewData.items?.length}</Typography></CardContent></Card></Grid>
              <Grid item xs={4}><Card><CardContent><Typography variant="caption">New Products</Typography><Typography variant="h6">{previewData.new_products_count}</Typography></CardContent></Card></Grid>
              <Grid item xs={4}><Card><CardContent><Typography variant="caption">Total Bottles</Typography><Typography variant="h6">{previewData.total_bottles}</Typography></CardContent></Card></Grid>
            </Grid>
            <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Brand Code</TableCell>
                    <TableCell>Brand Name</TableCell>
                    <TableCell>Size (ml)</TableCell>
                    <TableCell align="center">Pack Qty</TableCell>
                    <TableCell align="center">Cases</TableCell>
                    <TableCell align="center">Loose</TableCell>
                    <TableCell align="center">Total</TableCell>
                    <TableCell>New?</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewData.items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{item.brand_code}</TableCell>
                      <TableCell>{item.brand_name}</TableCell>
                      <TableCell>{item.size_ml}</TableCell>
                      <TableCell align="center">{item.pack_qty}</TableCell>
                      <TableCell align="center">{item.cases}</TableCell>
                      <TableCell align="center">
                        <TextField
                          type="number"
                          size="small"
                          value={item.loose}
                          onChange={(e) => updateLooseBottles(idx, e.target.value)}
                          sx={{ width: 70 }}
                        />
                      </TableCell>
                      <TableCell align="center">{(item.cases * item.pack_qty) + (item.loose || 0)}</TableCell>
                      <TableCell align="center">
                        {item.is_new ? <Chip label="NEW" color="warning" size="small" /> : <CheckIcon color="success" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="contained" onClick={() => setConfirmDialog(true)}>Confirm & Add Stock</Button>
            </Box>
          </>
        )}
      </Paper>

      <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)}>
        <DialogTitle>Confirm Stock Addition</DialogTitle>
        <DialogContent>Are you sure you want to add {previewData?.total_bottles} bottles?</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={confirmUpload}>Confirm</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}