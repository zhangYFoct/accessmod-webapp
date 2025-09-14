'use client'

import { Box, Card} from '@mui/material';

import { SettingsButton } from 'src/layouts/components/settings-button';

import { Logo } from 'src/components/logo'; 

import { GuestGuard } from 'src/auth/guard'; 


type Props = {
  children: React.ReactNode;
};

export default function Layout({ children }: Props) {
  return (
    <GuestGuard>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#f4f6f8',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            width: '100%',
            height: '72px',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#ffffff',
            position: 'fixed',
            top: 0,
            left: 0,
            px: 3,
            boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.1)',
          }}
        >
          <Logo />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <SettingsButton />
          </Box>
        </Box>
        <Card
          sx={{
            display: 'flex',
            width: '600px',
            height: '600px',
            padding: '24px',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            flexShrink: 0,
            borderRadius: '7px',
            backgroundColor: '#FFF',
            boxShadow: 3,
          }}
        >
          {children}
        </Card>
      </Box>
    </GuestGuard>
  );
}