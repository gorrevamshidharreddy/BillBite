import { useState, useEffect } from 'react';
import { Box, Paper, Typography, Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton, Tooltip, Alert, Snackbar } from '@mui/material';
import { Check as CheckIcon, Close as CloseIcon } from '@mui/icons-material';
import api from '../../services/api';

export default function MartRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [dialog, setDialog] = useState({ open: false, type: null, requestId: null, adminNotes: '' });

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/mart-requests');
      setRequests(res.data);
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to load mart requests', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const openDialog = (type, id) => {
    setDialog({ open: true, type, requestId: id, adminNotes: '' });
  };

  const closeDialog = () => {
    setDialog({ ...dialog, open: false });
  };

  const handleApprove = async () => {
    try {
      await api.post(`/admin/mart-requests/${dialog.requestId}/approve`, { admin_notes: dialog.adminNotes });
      setSnackbar({ open: true, message: 'Mart request approved', severity: 'success' });
      fetchRequests();
    } catch (err) {
      setSnackbar({ open: true, message: 'Approve failed', severity: 'error' });
    } finally {
      closeDialog();
    }
  };

  const handleReject = async () => {
    try {
      await api.post(`/admin/mart-requests/${dialog.requestId}/reject`, { admin_notes: dialog.adminNotes });
      setSnackbar({ open: true, message: 'Mart request rejected', severity: 'success' });
      fetchRequests();
    } catch (err) {
      setSnackbar({ open: true, message: 'Reject failed', severity: 'error' });
    } finally {
      closeDialog();
    }
  };

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      <Paper sx={{ p: 3, borderRadius: 2, mb: 3 }}>
        <Typography variant="h5" fontWeight={600} gutterBottom>Mart Activation Requests</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Review pending mart activation requests from owners.
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f5f5f5' }}>
              <TableRow>
                <TableCell><strong>Tenant</strong></TableCell>
                <TableCell><strong>Mart Name</strong></TableCell>
                <TableCell><strong>Address</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell align="center"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id} hover>
                  <TableCell>{req.tenant_name}</TableCell>
                  <TableCell>{req.requested_mart_name}</TableCell>
                  <TableCell>{req.requested_mart_address}</TableCell>
                  <TableCell>{req.status}</TableCell>
                  <TableCell align="center">
                    {req.status === 'pending' && (
                      <>
                        <Tooltip title="Approve">
                          <IconButton size="small" color="primary" onClick={() => openDialog('approve', req.id)}>
                            <CheckIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Reject">
                          <IconButton size="small" color="error" onClick={() => openDialog('reject', req.id)}>
                            <CloseIcon />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        
        <Dialog open={dialog.open} onClose={closeDialog} maxWidth="sm" fullWidth>
          <DialogTitle>{dialog.type === 'approve' ? 'Approve Request' : 'Reject Request'}</DialogTitle>
          <DialogContent>
            <TextField
              label="Admin Notes (optional)"
              fullWidth
              multiline
              rows={3}
              value={dialog.adminNotes}
              onChange={(e) => setDialog({ ...dialog, adminNotes: e.target.value })}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDialog}>Cancel</Button>
            <Button color={dialog.type === 'approve' ? 'primary' : 'error'} onClick={dialog.type === 'approve' ? handleApprove : handleReject}>
              {dialog.type === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogActions>
        </Dialog>
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
      </Paper>
    </Box>
  );
}
