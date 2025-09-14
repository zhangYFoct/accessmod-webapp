'use client';

import { useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';

import { Iconify } from 'src/components/iconify';
import { useAuthContext } from 'src/auth/hooks';
import axios from 'src/lib/axios';
import { type AnalysisRecord, formatDate, exportToCSV } from './utils/projects-utils';

// ----------------------------------------------------------------------

export function ProjectsView() {
  const { user } = useAuthContext();
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchAnalysisHistory();
    }
  }, [user]);

  const fetchAnalysisHistory = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/analysis/history');
      if (response.data.success) {
        setRecords(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch analysis history:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Analysis Records
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Healthcare accessibility analysis history 
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Iconify icon="solar:export-bold" />}
          onClick={() => exportToCSV(records)}
          disabled={records.length === 0}
        >
          Export CSV
        </Button>
      </Box>

      {/* Analysis Records Table */}
      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Country</TableCell>
                <TableCell>Analysis Time</TableCell>
                <TableCell>Resolution</TableCell>
                <TableCell>Total Population</TableCell>
                <TableCell>15min Coverage</TableCell>
                <TableCell>30min Coverage</TableCell>
                <TableCell>60min Coverage</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      #{record.id}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {record.country}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {formatDate(record.analysis_time)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {record.analysis_resolution ? `${record.analysis_resolution}m` : 'N/A'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {record.total_population ? record.total_population.toLocaleString() : 'N/A'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={`${record.population_15min_percent}%`}
                      color="success"
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={`${record.population_30min_percent}%`}
                      color="warning"
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={`${record.population_60min_percent}%`}
                      color="error"
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
}