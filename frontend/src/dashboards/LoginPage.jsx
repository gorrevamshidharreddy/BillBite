import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { TextField, Button, Typography, Paper, Box, Alert } from '@mui/material';
import ReceiptIcon from '@mui/icons-material/Receipt';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const response = await login(email, password);
      const { role, tenants, tenant } = response;
      const tenantList = tenants || (tenant ? [tenant] : []);
      const tenantCount = tenantList.length;

      // Map co_owner to owner dashboard
      const dashboardRole = role === 'co_owner' ? 'owner' : role;

      if (dashboardRole === 'admin') {
        navigate('/admin');
      } else {
        navigate(`/${dashboardRole}`);
      }
    } catch (err) {
      setError('Invalid email or password');
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
        p: 2,
      }}
    >
      <Paper
        elevation={6}
        sx={{ p: { xs: 3, md: 5 }, maxWidth: 420, width: '100%', borderRadius: 4 }}
      >
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <ReceiptIcon color="primary" sx={{ fontSize: 60 }} />
          <Typography variant="h4" fontWeight={700}>
            BillBite
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Smart counter billing
          </Typography>
        </Box>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Email"
            variant="outlined"
            margin="normal"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            variant="outlined"
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            sx={{ mt: 2, py: 1.5 }}
          >
            Log In
          </Button>
        </form>
      </Paper>
    </Box>
  );
}