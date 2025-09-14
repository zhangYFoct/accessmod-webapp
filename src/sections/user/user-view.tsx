'use client';

import { useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';

import { Iconify } from 'src/components/iconify';
import { useAuthContext } from 'src/auth/hooks';
import { useRouter } from 'src/routes/hooks';
import axios from 'src/lib/axios';

// ----------------------------------------------------------------------

interface UserInfo {
  firstName: string;
  lastName: string;
  email: string;
}

interface PasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// ----------------------------------------------------------------------

export function UserView() {
  const { user, checkUserSession } = useAuthContext();
  const router = useRouter();
  
  const [userInfo, setUserInfo] = useState<UserInfo>({
    firstName: '',
    lastName: '',
    email: ''
  });
  
  // Update form when user data loads
  useEffect(() => {
    if (user) {
      setUserInfo({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || ''
      });
    }
  }, [user]);

  const [passwordData, setPasswordData] = useState<PasswordData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [generalSaving, setGeneralSaving] = useState(false);
  const [securitySaving, setSecuritySaving] = useState(false);
  const [generalSuccess, setGeneralSuccess] = useState(false);
  const [securitySuccess, setSecuritySuccess] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [securityError, setSecurityError] = useState('');

  const handleUserInfoChange = (field: keyof UserInfo) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setUserInfo(prev => ({
      ...prev,
      [field]: event.target.value
    }));
    // Clear error when user starts typing
    if (generalError) {
      setGeneralError('');
    }
  };

  const handlePasswordChange = (field: keyof PasswordData) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setPasswordData(prev => ({
      ...prev,
      [field]: event.target.value
    }));
    // Clear error when user starts typing
    if (securityError) {
      setSecurityError('');
    }
  };

  const handleSaveGeneral = async () => {
    setGeneralSaving(true);
    setGeneralError('');
    try {
      const response = await axios.put('http://localhost:5000/api/auth/update-profile', userInfo);
      
      if (response.data.success) {
        setGeneralSuccess(true);
        setTimeout(() => setGeneralSuccess(false), 3000);
        
        if (checkUserSession) {
          await checkUserSession();
        }
      }
    } catch (error: any) {
      console.error('Failed to update user info:', error);
      setGeneralError(error.response?.data?.detail || error.message || 'Failed to update profile');
    } finally {
      setGeneralSaving(false);
    }
  };

  const handleSaveSecurity = async () => {
    setSecurityError('');
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setSecurityError('New password and confirm password do not match');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      setSecurityError('Password must be at least 6 characters long');
      return;
    }

    setSecuritySaving(true);
    try {
      const response = await axios.put('http://localhost:5000/api/auth/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });
      
      if (response.data.success) {
        setSecuritySuccess(true);
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
        setTimeout(() => setSecuritySuccess(false), 3000);
      }
    } catch (error: any) {
      console.error('Failed to change password:', error);
      
      // Extract error message from different possible locations
      let errorMessage = 'Failed to change password';
      
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.detail) {
        errorMessage = error.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      console.log('Final error message:', errorMessage);
      
      // Check if it's a current password error
      if (errorMessage.toLowerCase().includes('current password') || 
          errorMessage.toLowerCase().includes('incorrect')) {
        setSecurityError('Current password is incorrect. Please try again.');
      } else {
        setSecurityError(errorMessage);
      }
    } finally {
      setSecuritySaving(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          User Settings
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage your account settings and security preferences
        </Typography>
      </Box>

      <Grid container spacing={4}>
        {/* General Information */}
        <Grid item xs={12}>
          <Card sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Iconify icon="solar:user-bold" width={24} sx={{ mr: 1 }} />
              <Typography variant="h5">
                General Information
              </Typography>
            </Box>

            {generalSuccess && (
              <Alert severity="success" sx={{ mb: 3 }}>
                Profile information updated successfully!
              </Alert>
            )}
            
            {generalError && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {generalError}
              </Alert>
            )}

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="First Name"
                  value={userInfo.firstName}
                  onChange={handleUserInfoChange('firstName')}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Last Name"
                  value={userInfo.lastName}
                  onChange={handleUserInfoChange('lastName')}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Email"
                  type="email"
                  value={userInfo.email}
                  onChange={handleUserInfoChange('email')}
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                size="large"
                onClick={handleSaveGeneral}
                disabled={generalSaving}
                startIcon={
                  generalSaving ? (
                    <Iconify icon="solar:loader-2-bold" width={20} sx={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Iconify icon="solar:floppy-disk-bold" width={20} />
                  )
                }
              >
                {generalSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </Box>
          </Card>
        </Grid>

        {/* Security */}
        <Grid item xs={12}>
          <Card sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Iconify icon="solar:lock-bold" width={24} sx={{ mr: 1 }} />
              <Typography variant="h5">
                Security
              </Typography>
            </Box>

            {securitySuccess && (
              <Alert severity="success" sx={{ mb: 3 }}>
                Password updated successfully!
              </Alert>
            )}
            
            {securityError && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {securityError}
              </Alert>
            )}

            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Current Password"
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={handlePasswordChange('currentPassword')}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="New Password"
                  type="password"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange('newPassword')}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Confirm New Password"
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange('confirmPassword')}
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                size="large"
                onClick={handleSaveSecurity}
                disabled={securitySaving || !passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}
                startIcon={
                  securitySaving ? (
                    <Iconify icon="solar:loader-2-bold" width={20} sx={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Iconify icon="solar:shield-check-bold" width={20} />
                  )
                }
              >
                {securitySaving ? 'Updating...' : 'Update Password'}
              </Button>
            </Box>
          </Card>
        </Grid>
      </Grid>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Box>
  );
}