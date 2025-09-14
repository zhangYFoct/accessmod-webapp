'use client';

import { useState, useCallback, useEffect } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Autocomplete from '@mui/material/Autocomplete';
import { styled } from '@mui/material/styles';

import { Iconify } from 'src/components/iconify';
import { AccessibilityAnalysisMap, type Hospital, type AnalysisResults as MapAnalysisResults, type AnalysisZone } from 'src/components/map/AccessibilityAnalysisMap';

// Import the existing services
import { 
  ifrcService,
  type IFRCCountryInfo,
  type IFRCFacility,
  FACILITY_TYPES
} from 'src/services/ifrcService';
import { backendApiService, type AnalysisResponse } from 'src/services/backendApiService';
import type { GEELayer } from 'src/components/map/AccessibilityAnalysisMap';

import type { AnalysisResults } from './types';
import { createGeeLayersFromAnalysis } from './utils/gee-layers-utils';

// ----------------------------------------------------------------------

const StyledRoot = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(2),
  minHeight: 'calc(100vh - 240px)',
}));

const StyledAnalysisPanel = styled(Paper)(({ theme }) => ({
  width: '100%',
  padding: theme.spacing(3),
  backgroundColor: theme.palette.background.paper,
}));

const StyledMapPanel = styled(Paper)(({ theme }) => ({
  width: '100%',
  padding: theme.spacing(3),
  overflow: 'hidden',
  position: 'relative',
  minHeight: 700,
  backgroundColor: theme.palette.background.paper,
}));

// Helper functions
function extractCityFromAddress(address: string): string {
  if (!address) return 'Unknown';
  const parts = address.split(',');
  return parts[parts.length - 2]?.trim() || parts[0]?.trim() || 'Unknown';
}

function extractProvinceFromAddress(address: string): string {
  if (!address) return 'Unknown';
  const parts = address.split(',');
  return parts[parts.length - 1]?.trim() || 'Unknown';
}


export function AccessibilityAnalysis() {
  // State management
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [analysisStartTime, setAnalysisStartTime] = useState<Date | null>(null);
  const [analysisElapsedTime, setAnalysisElapsedTime] = useState(0);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  
  // Country and map data state
  const [availableCountries, setAvailableCountries] = useState<IFRCCountryInfo[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<IFRCCountryInfo | null>(null);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [countriesError, setCountriesError] = useState<string | null>(null);
  
  const [healthFacilities, setHealthFacilities] = useState<IFRCFacility[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  
  // Backend analysis state
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [backendAnalysisResults, setBackendAnalysisResults] = useState<AnalysisResponse | null>(null);
  
  // GEE layers state
  const [geeLayers, setGeeLayers] = useState<GEELayer[]>([]);
  const [geeAssetId, setGeeAssetId] = useState<string | undefined>(undefined);

  // Load countries with healthcare facilities
  const loadAvailableCountries = useCallback(async () => {
    setCountriesLoading(true);
    setCountriesError(null);

    try {
      const healthcareFacilities = await ifrcService.getFacilitiesByType(2);
      const countryMap = new Map<string, IFRCCountryInfo>();
      
      healthcareFacilities.forEach(facility => {
        const key = facility.country_iso3 || facility.country_name;
        if (countryMap.has(key)) {
          countryMap.get(key)!.facility_count++;
        } else {
          countryMap.set(key, {
            name: facility.country_name,
            iso: facility.country_iso,
            iso3: facility.country_iso3,
            facility_count: 1
          });
        }
      });
      
      const countriesWithHealthcare = Array.from(countryMap.values())
        .sort((a, b) => a.name.localeCompare(b.name));
      
      setAvailableCountries(countriesWithHealthcare);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load countries';
      setCountriesError(errorMessage);
      setAvailableCountries([]);
    } finally {
      setCountriesLoading(false);
    }
  }, []);

  // Test backend connection
  const testBackendConnection = useCallback(async () => {
    try {
      const result = await backendApiService.test();
      setBackendConnected(result.success && result.gee_initialized);
    } catch (error) {
      setBackendConnected(false);
    }
  }, []);

  // Load IFRC countries on component mount
  useEffect(() => {
    loadAvailableCountries();
    testBackendConnection();
  }, [loadAvailableCountries, testBackendConnection]);

  // Update elapsed time during analysis
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading && analysisStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - analysisStartTime.getTime()) / 1000);
        setAnalysisElapsedTime(elapsed);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading, analysisStartTime]);

  // Handle country selection
  const handleCountryChange = useCallback(async (country: IFRCCountryInfo | null) => {
    setSelectedCountry(country);
    setHealthFacilities([]);
    setHospitals([]);
    setMapError(null);
    setSelectedHospital(null);
    setResults(null);

    if (!country) return;
    await loadHealthcareFacilitiesForCountry(country);
  }, []);

  // Load healthcare facilities for selected country
  const loadHealthcareFacilitiesForCountry = useCallback(async (country: IFRCCountryInfo) => {
    if (!country) {
      setHealthFacilities([]);
      setHospitals([]);
      return;
    }

    setMapLoading(true);
    setMapError(null);

    try {
      const allHealthFacilities = await ifrcService.getFacilitiesByType(2);
      const countryHealthFacilities = allHealthFacilities.filter(
        facility => facility.country_name === country.name
      );
      
      // Convert to Hospital format
      const hospitalsData: Hospital[] = countryHealthFacilities.map((facility, index) => ({
        id: parseInt(facility.id) || index,
        name: facility.name,
        nameEn: facility.name,
        address: facility.address,
        city: extractCityFromAddress(facility.address),
        province: extractProvinceFromAddress(facility.address),
        country: facility.country_name,
        phone: '',
        email: '',
        latitude: facility.latitude,
        longitude: facility.longitude,
        hospitalType: facility.health_facility_type || 'Healthcare Facility',
        level: '',
        bedCount: 0,
        isEmergency: false,
        is24h: false,
        redcrossCertified: true,
        status: 'active' as const,
        description: `Red Cross ${facility.health_facility_type || 'Healthcare Facility'}`
      }));
      
      setHealthFacilities(countryHealthFacilities);
      setHospitals(hospitalsData);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load healthcare facilities';
      setMapError(errorMessage);
      setHealthFacilities([]);
      setHospitals([]);
    } finally {
      setMapLoading(false);
    }
  }, []);

  const isDataReady = Boolean(selectedCountry);

  const handleRunAnalysis = useCallback(async () => {
    if (!isDataReady || !selectedCountry) return;

    setIsLoading(true);
    setProgress(0);
    setResults(null);
    setBackendAnalysisResults(null);
    setAnalysisStartTime(new Date());
    setAnalysisElapsedTime(0);

    try {
      if (!backendConnected) {
        throw new Error('Backend Earth Engine is not available. Please ensure the backend server is running and connected to Google Earth Engine.');
      }
      
      const analysisSteps = [
        'Connecting to backend...',
        'Loading country boundary from Earth Engine...',
        'Processing IFRC facility data...',
        'Computing travel time analysis...',
        'Calculating population statistics...',
        'Finalizing results...'
      ];

      for (let i = 0; i < analysisSteps.length; i++) {
        setProgress((i + 1) * 16.67);
        
        if (i === analysisSteps.length - 2) {
          const backendResult = await backendApiService.analyzeFromAsset({
            country_name: selectedCountry.name
          });
          
          setBackendAnalysisResults(backendResult);
          
          if (backendResult?.success) {
            const backendData = backendResult.data;
            
            // Create GEE layers from analysis results
            const { layers, assetId } = await createGeeLayersFromAnalysis(backendData, selectedCountry.name);
            setGeeLayers(layers);
            setGeeAssetId(assetId);
            
            const analysisResults: AnalysisResults = {
              accessibility: 'analysis_complete',
              coverage: backendData.coverage_60min || backendData.coverage_30min || 0,
              timestamp: new Date(),
              mapData: backendData.asset_id,
              totalFacilities: hospitals.length,
              averageAccessTime: 60,
              analysisId: `backend_${selectedCountry.iso3}_${Date.now()}`,
              isBackendAnalysis: true
            };
            
            setResults(analysisResults);
          } else {
            throw new Error('Backend analysis failed: ' + (backendResult.data || 'Unknown error'));
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, i === analysisSteps.length - 2 ? 2000 : 500));
      }

    } catch (error) {
      console.error('Analysis failed:', error);
      setMapError('Analysis failed. Please try again.');
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  }, [selectedCountry, hospitals, isDataReady, backendConnected, backendAnalysisResults]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <StyledRoot>
        {/* Top - Analysis Configuration Panel */}
        <StyledAnalysisPanel elevation={1}>
          <Box sx={{ display: 'flex', flexDirection: 'row', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Backend Status */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
              <Iconify 
                width={16} 
                icon={backendConnected === null ? "solar:loader-2-bold" : backendConnected ? "solar:check-circle-bold" : "solar:close-circle-bold"}
                sx={{ 
                  color: backendConnected === null ? 'warning.main' : backendConnected ? 'success.main' : 'error.main'
                }}
              />
              <Typography variant="caption" color="text.secondary">
                Backend: {backendConnected === null ? 'Connecting...' : backendConnected ? 'Earth Engine Ready' : 'Offline'}
              </Typography>
            </Box>

            {/* Country Selection */}
            <Box sx={{ flex: 1, minWidth: 300 }}>
              {countriesLoading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <CircularProgress size={20} />
                  <Typography variant="body2">Loading countries...</Typography>
                </Box>
              ) : countriesError ? (
                <Alert severity="error" sx={{ py: 1 }}>
                  {countriesError}
                  <Button size="small" onClick={loadAvailableCountries} sx={{ ml: 1 }}>
                    Retry
                  </Button>
                </Alert>
              ) : (
                <Autocomplete
                  value={selectedCountry}
                  onChange={(_, newValue) => handleCountryChange(newValue)}
                  options={availableCountries}
                  getOptionLabel={(option) => option.name}
                  isOptionEqualToValue={(option, value) => option.name === value.name}
                  renderOption={(props, option) => {
                    const { key, ...otherProps } = props;
                    return (
                      <Box component="li" key={key} {...otherProps}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                          <Typography variant="body2">
                            {option.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            {option.iso3} • {option.facility_count} Healthcare Facilities
                          </Typography>
                        </Box>
                      </Box>
                    );
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Select Country"
                      placeholder="Search countries..."
                      size="small"
                    />
                  )}
                  noOptionsText="No countries found"
                  loadingText="Loading countries..."
                />
              )}
            </Box>

            {/* Run Button */}
            <Button
              variant="contained"
              size="large"
              disabled={!isDataReady || isLoading}
              onClick={handleRunAnalysis}
              startIcon={
                isLoading ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <Iconify icon="solar:play-bold" />
                )
              }
              sx={{ py: 1.5, minWidth: 200 }}
            >
              {isLoading ? 'Running Analysis...' : 'Run Analysis'}
            </Button>
          </Box>
        </StyledAnalysisPanel>

        {/* Middle - Map Panel */}
        <StyledMapPanel elevation={1}>
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Map Header */}
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Iconify width={20} icon="solar:map-bold" />
                  {results 
                    ? 'Accessibility Analysis Results' 
                    : selectedCountry 
                      ? `Red Cross Healthcare Facilities in ${selectedCountry.name}`
                      : 'Healthcare Facilities Map'
                  }
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="Refresh facility data">
                  <span>
                    <IconButton 
                      size="small" 
                      onClick={() => selectedCountry && loadHealthcareFacilitiesForCountry(selectedCountry)} 
                      disabled={mapLoading || !selectedCountry}
                    >
                      <Iconify icon="solar:refresh-bold" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Button 
                  variant="outlined" 
                  size="small"
                  disabled={!results}
                  startIcon={<Iconify icon="solar:export-bold" />}
                  onClick={() => {
                    if (results && backendAnalysisResults?.success && selectedCountry) {
                      // Try multiple ways to find the map element
                      let mapElement = document.querySelector('#analysis-map-container .leaflet-container') as HTMLElement;
                      if (!mapElement) {
                        mapElement = document.querySelector('.leaflet-container') as HTMLElement;
                      }
                      if (!mapElement) {
                        mapElement = document.querySelector('#analysis-map-container') as HTMLElement;
                      }
                      console.log('Map element found:', !!mapElement);
                      let mapInstance = null;
                      
                      // Try to get the map instance from Leaflet
                      if (mapElement && (mapElement as any)._leaflet_map) {
                        mapInstance = (mapElement as any)._leaflet_map;
                      }
                      console.log('Map instance found:', !!mapInstance);
                      
                      if (mapElement) {
                        console.log('Starting map capture...');
                        import('html2canvas').then((html2canvas) => {
                            html2canvas.default(mapElement, {
                              useCORS: true,
                              allowTaint: true,
                              background: '#ffffff',
                              width: 800,
                              height: 600,
                              logging: false
                            }).then((mapCanvas) => {
                            // Create main canvas for the complete report
                            const canvas = document.createElement('canvas');
                            canvas.width = 1600;
                            canvas.height = 1400;
                            const ctx = canvas.getContext('2d');
                            
                            if (ctx) {
                              // Background
                              ctx.fillStyle = '#ffffff';
                              ctx.fillRect(0, 0, canvas.width, canvas.height);
                              
                              // Title
                              ctx.fillStyle = '#1976d2';
                              ctx.font = 'bold 36px Arial';
                              ctx.textAlign = 'center';
                              ctx.fillText(`Healthcare Accessibility Analysis - ${selectedCountry?.name}`, canvas.width / 2, 60);
                              
                              // Subtitle
                              ctx.fillStyle = '#666';
                              ctx.font = '20px Arial';
                              ctx.fillText(`Generated on ${new Date().toLocaleDateString()}`, canvas.width / 2, 100);
                              
                              // Draw the captured map
                              ctx.drawImage(mapCanvas, 50, 130, 800, 600);
                              
                              // Data boxes
                              const data = [
                                { label: 'Total Population', value: backendAnalysisResults.data.total_population?.toLocaleString() || 'N/A', color: '#1976d2' },
                                { label: '15 min Access', value: `${backendAnalysisResults.data.pop_within_15min?.toLocaleString() || 'N/A'} (${backendAnalysisResults.data.coverage_15min?.toFixed(1) || 'N/A'}%)`, color: '#4caf50' },
                                { label: '30 min Access', value: `${backendAnalysisResults.data.pop_within_30min?.toLocaleString() || 'N/A'} (${backendAnalysisResults.data.coverage_30min?.toFixed(1) || 'N/A'}%)`, color: '#ff9800' },
                                { label: '60 min Access', value: `${backendAnalysisResults.data.pop_within_60min?.toLocaleString() || 'N/A'} (${backendAnalysisResults.data.coverage_60min?.toFixed(1) || 'N/A'}%)`, color: '#f44336' }
                              ];
                              
                              // Draw data boxes (right side of map)
                              data.forEach((item, index) => {
                                const x = 900;
                                const y = 150 + index * 90;
                                
                                // Box border
                                ctx.strokeStyle = item.color;
                                ctx.lineWidth = 3;
                                ctx.strokeRect(x, y, 650, 80);
                                
                                // Label
                                ctx.fillStyle = '#333';
                                ctx.font = 'bold 20px Arial';
                                ctx.textAlign = 'left';
                                ctx.fillText(item.label, x + 20, y + 30);
                                
                                // Value
                                ctx.fillStyle = item.color;
                                ctx.font = 'bold 24px Arial';
                                ctx.fillText(item.value, x + 20, y + 60);
                              });
                              
                              // Chart area
                              ctx.fillStyle = '#f5f5f5';
                              ctx.fillRect(100, 780, 1400, 350);
                              ctx.strokeStyle = '#ddd';
                              ctx.lineWidth = 2;
                              ctx.strokeRect(100, 780, 1400, 350);
                              
                              // Chart title
                              ctx.fillStyle = '#333';
                              ctx.font = 'bold 24px Arial';
                              ctx.textAlign = 'center';
                              ctx.fillText('Population Coverage by Travel Time', 800, 820);
                              
                              // Draw bars
                              const chartData = [
                                { label: '15 min', value: backendAnalysisResults.data.coverage_15min || 0, color: '#4caf50' },
                                { label: '30 min', value: backendAnalysisResults.data.coverage_30min || 0, color: '#ff9800' },
                                { label: '60 min', value: backendAnalysisResults.data.coverage_60min || 0, color: '#f44336' }
                              ];
                              
                              const barWidth = 150;
                              const maxBarHeight = 220;
                              const startX = 400;
                              const baseY = 1080;
                              
                              chartData.forEach((bar, index) => {
                                const x = startX + index * 200;
                                const barHeight = (bar.value / 100) * maxBarHeight;
                                const y = baseY - barHeight;
                                
                                // Draw bar
                                ctx.fillStyle = bar.color;
                                ctx.fillRect(x, y, barWidth, barHeight);
                                
                                // Value on top
                                ctx.fillStyle = '#333';
                                ctx.font = 'bold 18px Arial';
                                ctx.textAlign = 'center';
                                ctx.fillText(`${bar.value.toFixed(1)}%`, x + barWidth / 2, y - 10);
                                
                                // Label below
                                ctx.fillText(bar.label, x + barWidth / 2, baseY + 25);
                              });
                              
                              // Y-axis labels
                              ctx.textAlign = 'right';
                              ctx.font = '14px Arial';
                              ctx.fillStyle = '#666';
                              for (let i = 0; i <= 100; i += 25) {
                                const y = baseY - (i / 100) * maxBarHeight;
                                ctx.fillText(`${i}%`, startX - 30, y);
                                
                                // Grid lines
                                ctx.strokeStyle = '#eee';
                                ctx.lineWidth = 1;
                                ctx.beginPath();
                                ctx.moveTo(startX - 20, y);
                                ctx.lineTo(startX + 800, y);
                                ctx.stroke();
                              }
                              
                              // Footer info
                              ctx.fillStyle = '#999';
                              ctx.font = '14px Arial';
                              ctx.textAlign = 'left';
                              ctx.fillText(`Analysis Resolution: ${backendAnalysisResults.data.target_resolution || 'N/A'}m | Total Facilities: ${results.totalFacilities}`, 100, canvas.height - 30);
                              
                              // Convert to blob and download
                              canvas.toBlob((blob) => {
                                if (blob) {
                                  const url = URL.createObjectURL(blob);
                                  const link = document.createElement('a');
                                  link.href = url;
                                  link.download = `accessibility_analysis_${selectedCountry?.name?.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.png`;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                  URL.revokeObjectURL(url);
                                }
                              }, 'image/png');
                            }
                          }).catch((error) => {
                            console.error('Error capturing map:', error);
                            alert('Failed to capture map. Please try again.');
                          });
                        });
                      }
                    }
                  }}
                >
                  Export
                </Button>
              </Box>
            </Box>

            {/* Progress Bar */}
            {isLoading && (
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Analysis Progress</Typography>
                  <Typography variant="body2">{Math.round(progress)}%</Typography>
                </Box>
                <LinearProgress variant="determinate" value={progress} />
              </Box>
            )}

            {/* Map Container */}
            <Box id="analysis-map-container" sx={{ flex: 1, position: 'relative', border: '1px solid #ddd', borderRadius: 1, height: 600 }}>
              <AccessibilityAnalysisMap
                selectedCountry={selectedCountry?.iso3 || ''}
                hospitals={hospitals}
                onHospitalClick={setSelectedHospital}
                showAnalysis={false}
                isLoading={mapLoading}
                error={mapError}
                geeLayers={geeLayers}
                geeAssetId={geeAssetId}
                height="600px"
              />

              {/* Loading overlay for map analysis */}
              {isLoading && (
                <Box sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  bgcolor: 'rgba(255, 255, 255, 0.8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1001
                }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <CircularProgress sx={{ mb: 2, color: '#dc143c' }} />
                    <Typography variant="h6" color="text.secondary" gutterBottom>
                      Running Accessibility Analysis
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Computing coverage areas and accessibility metrics...
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                      Progress: {Math.round(progress)}%
                    </Typography>
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        </StyledMapPanel>
      </StyledRoot>

      {/* Bottom - Population Analysis Results */}
      {results && backendAnalysisResults?.success && (
        <Card sx={{ p: 3, mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Iconify width={20} icon="solar:chart-bold" />
              Population Analysis Results
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Analysis completed at {results.timestamp.toLocaleString()}
            </Typography>
          </Box>
          
          <Box sx={{ display: 'flex', gap: 4, alignItems: 'stretch' }}>
            {/* Left side - Information Grid */}
            <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 3 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>Total Population (GPW v4.11, 2020)</Typography>
                <Typography variant="h4" color="primary">
                  {backendAnalysisResults.data.total_population?.toLocaleString() || 'N/A'}
                </Typography>
              </Box>
              
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>15 min Access</Typography>
                <Typography variant="h5" color="success.main">
                  {backendAnalysisResults.data.pop_within_15min?.toLocaleString() || 'N/A'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ({backendAnalysisResults.data.coverage_15min?.toFixed(1) || 'N/A'}%)
                </Typography>
              </Box>
              
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>30 min Access</Typography>
                <Typography variant="h5" color="warning.main">
                  {backendAnalysisResults.data.pop_within_30min?.toLocaleString() || 'N/A'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ({backendAnalysisResults.data.coverage_30min?.toFixed(1) || 'N/A'}%)
                </Typography>
              </Box>
              
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>60 min Access</Typography>
                <Typography variant="h5" color="error.main">
                  {backendAnalysisResults.data.pop_within_60min?.toLocaleString() || 'N/A'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ({backendAnalysisResults.data.coverage_60min?.toFixed(1) || 'N/A'}%)
                </Typography>
              </Box>
              
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>Analysis Resolution</Typography>
                <Typography variant="h6">
                  {backendAnalysisResults.data.target_resolution || 'N/A'}m
                </Typography>
              </Box>
              
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>Total Facilities</Typography>
                <Typography variant="h6">
                  {results.totalFacilities}
                </Typography>
              </Box>
            </Box>
            
            {/* Right side - Chart */}
            <Box sx={{ flex: 1, minWidth: 400, height: 300 }}>
              <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* Simple SVG Bar Chart */}
                <svg width="100%" height="100%" viewBox="0 0 400 250" style={{ border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fafafa' }}>
                  {/* Chart Title */}
                  <text x="200" y="20" textAnchor="middle" fill="#666" fontSize="14" fontWeight="bold">
                    Population Accessibility Coverage
                  </text>
                  
                  {/* Chart Bars */}
                  {(() => {
                    const data = [
                      { label: '15 min', value: backendAnalysisResults.data.coverage_15min || 0, color: '#4caf50' },
                      { label: '30 min', value: backendAnalysisResults.data.coverage_30min || 0, color: '#ff9800' },
                      { label: '60 min', value: backendAnalysisResults.data.coverage_60min || 0, color: '#f44336' }
                    ];
                    
                    const maxValue = 100; // percentage
                    const barWidth = 80;
                    const barSpacing = 120;
                    const chartHeight = 150;
                    const chartTop = 50;
                    const chartLeft = 50;
                    
                    return data.map((item, index) => {
                      const barHeight = (item.value / maxValue) * chartHeight;
                      const x = chartLeft + index * barSpacing;
                      const y = chartTop + chartHeight - barHeight;
                      
                      return (
                        <g key={item.label}>
                          {/* Bar */}
                          <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={barHeight}
                            fill={item.color}
                            rx="4"
                          />
                          {/* Value label on top of bar */}
                          <text
                            x={x + barWidth / 2}
                            y={y - 5}
                            textAnchor="middle"
                            fill="#333"
                            fontSize="12"
                            fontWeight="bold"
                          >
                            {item.value.toFixed(1)}%
                          </text>
                          {/* X-axis label */}
                          <text
                            x={x + barWidth / 2}
                            y={chartTop + chartHeight + 20}
                            textAnchor="middle"
                            fill="#666"
                            fontSize="12"
                          >
                            {item.label}
                          </text>
                        </g>
                      );
                    });
                  })()}
                  
                  {/* Y-axis */}
                  <line x1="50" y1="50" x2="50" y2="200" stroke="#ddd" strokeWidth="1" />
                  
                  {/* Y-axis labels */}
                  {[0, 25, 50, 75, 100].map(value => {
                    const y = 200 - (value / 100) * 150;
                    return (
                      <g key={value}>
                        <line x1="45" y1={y} x2="50" y2={y} stroke="#ddd" strokeWidth="1" />
                        <text x="40" y={y + 4} textAnchor="end" fill="#666" fontSize="10">
                          {value}%
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </Box>
            </Box>
          </Box>
        </Card>
      )}
    </Box>
  );
}