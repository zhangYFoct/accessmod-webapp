'use client';

import type { DashboardContentProps } from 'src/layouts/dashboard';

import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';

import { DashboardContent } from 'src/layouts/dashboard';

// ----------------------------------------------------------------------

const StyledContent = styled(Box)(({ theme }) => ({
  minHeight: 'calc(100vh - 200px)',
}));

// ----------------------------------------------------------------------

interface AnalysisLayoutProps extends DashboardContentProps {
  children: React.ReactNode;
}

export function AnalysisLayout({ children, ...other }: AnalysisLayoutProps) {
  return (
    <DashboardContent {...other}>
      {/* Content area */}
      <StyledContent>
        {children}
      </StyledContent>
    </DashboardContent>
  );
}