'use client';

import { useState, useCallback, useEffect } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import InputAdornment from '@mui/material/InputAdornment';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { styled } from '@mui/material/styles';

import { Iconify } from 'src/components/iconify';
import { CountryHospitalMap } from 'src/components/map/ReactLeafletComponent';
import { ifrcService, type IFRCFacility, type IFRCCountryInfo, FACILITY_TYPES, getRegionInfo } from 'src/services/ifrcService';

// ----------------------------------------------------------------------

const MapContainer = styled(Box)(({ theme }) => ({
  height: '50vh',
  minHeight: '400px',
  borderRadius: theme.shape.borderRadius,
  overflow: 'hidden',
  border: `1px solid ${theme.palette.divider}`,
  marginBottom: theme.spacing(3),
}));

const FacilityCard = styled(Card)(({ theme }) => ({
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  '&:hover': {
    boxShadow: theme.shadows[4],
    transform: 'translateY(-2px)',
  },
}));

const SearchSection = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  marginBottom: theme.spacing(3),
  background: theme.palette.background.paper,
}));

// ----------------------------------------------------------------------

export function DashboardPage() {
  // State management
  const [countries, setCountries] = useState<IFRCCountryInfo[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<IFRCCountryInfo | null>(null);
  const [facilities, setFacilities] = useState<IFRCFacility[]>([]);
  const [filteredFacilities, setFilteredFacilities] = useState<IFRCFacility[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<number | 'all'>('all');
  const [loading, setLoading] = useState({
    countries: false,
    facilities: false,
  });
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    loadCountries();
  }, []);


  useEffect(() => {
    let filtered = facilities;

    if (selectedType !== 'all') {
      filtered = filtered.filter((facility) => facility.type_code === selectedType);
    }

    if (searchTerm.trim()) {
      filtered = filtered.filter((facility) =>
        facility.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredFacilities(filtered);
  }, [searchTerm, selectedType, facilities]);

  // Load countries with facilities
  const loadCountries = async () => {
    setLoading((prev) => ({ ...prev, countries: true }));
    setError(null);

    try {
      const countriesData = await ifrcService.getCountriesWithFacilities();
      setCountries(countriesData);
    } catch (err: any) {
      setError(`Failed to load countries: ${err.message || 'Unknown error'}`);
      setCountries([]);
    } finally {
      setLoading((prev) => ({ ...prev, countries: false }));
    }
  };

  // Load facilities for selected country
  const loadFacilitiesForCountry = async (countryName: string) => {
    setLoading((prev) => ({ ...prev, facilities: true }));
    setError(null);

    try {
      const facilitiesData = await ifrcService.getFacilitiesByCountry(countryName);
      setFacilities(facilitiesData);
    } catch (err: any) {
      setError('Failed to load facilities. Please try again later.');
      setFacilities([]);
    } finally {
      setLoading((prev) => ({ ...prev, facilities: false }));
    }
  };

  // Handle country selection
  const handleCountrySelect = useCallback((country: IFRCCountryInfo | null) => {
    setSelectedCountry(country);
    setSearchTerm('');
    setSelectedType('all');
    if (country) {
      loadFacilitiesForCountry(country.name);
    } else {
      setFacilities([]);
    }
  }, []);

  // Get facility type display
  const getFacilityTypeDisplay = (facility: IFRCFacility) => {
    const localUnitType = facility.type_name;

    if (facility.type_code === 2 && facility.health_facility_type) {
      return {
        localUnitType,
        healthFacilityType: facility.health_facility_type,
      };
    }

    return {
      localUnitType,
      healthFacilityType: null,
    };
  };

  // Get available facility types in current selection
  const getAvailableTypes = () => {
    const types = [...new Set(facilities.map((f) => f.type_code))];
    return types
      .map((typeCode) => ({
        code: typeCode,
        name: FACILITY_TYPES[typeCode as keyof typeof FACILITY_TYPES]?.name || `Type ${typeCode}`,
        color: FACILITY_TYPES[typeCode as keyof typeof FACILITY_TYPES]?.color || '#gray',
      }))
      .sort((a, b) => a.code - b.code);
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Page Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Iconify width={32} icon="solar:hospital-bold" />
          Red Cross Medical Facilities
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Explore Red Cross medical facilities worldwide and access healthcare information
        </Typography>
      </Box>

      {/* World Map */}
      <MapContainer>
        <CountryHospitalMap
          selectedCountry={selectedCountry?.iso3?.toLowerCase()}
          countryName={selectedCountry?.name} // Pass country name for boundary display
          hospitals={
            filteredFacilities.map((f) => ({
              ...f,
              hospitalType: f.type_name,
            })) as any[]
          }
          height="100%"
          onHospitalClick={(facility) => console.log('Clicked facility:', facility)}
          isLoading={loading.facilities}
          error={error}
        />
      </MapContainer>

      {/* Search and Filter Section */}
      <SearchSection elevation={2}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={4}>
            <Autocomplete
              value={selectedCountry}
              onChange={(_, newValue) => handleCountrySelect(newValue)}
              options={countries}
              getOptionLabel={(option) => option.name}
              loading={loading.countries}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Country"
                  placeholder="Choose a country to view facilities..."
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <InputAdornment position="start">
                        <Iconify icon="solar:global-bold" />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <>
                        {loading.countries ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              renderOption={(props, option) => {
                const { key, ...otherProps } = props;
                return (
                  <Box component="li" key={key} {...otherProps}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="body2">{option.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.facility_count} facilities
                        </Typography>
                      </Box>
                      <Chip label={option.iso3} size="small" variant="outlined" sx={{ ml: 1 }} />
                    </Box>
                  </Box>
                );
              }}
            />
          </Grid>

          <Grid item xs={12} md={4}>
            <FormControl fullWidth disabled={!selectedCountry}>
              <InputLabel>Filter by Type</InputLabel>
              <Select
                value={selectedType}
                label="Filter by Type"
                onChange={(e) => setSelectedType(e.target.value as number | 'all')}
              >
                <MenuItem value="all">All Types</MenuItem>
                {getAvailableTypes().map((type) => (
                  <MenuItem key={type.code} value={type.code}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: type.color }} />
                      {type.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search facilities..."
              disabled={!selectedCountry}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Iconify icon="solar:magnifer-bold" />
                  </InputAdornment>
                ),
                endAdornment:
                  searchTerm && (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearchTerm('')}>
                        <Iconify icon="solar:close-circle-bold" />
                      </IconButton>
                    </InputAdornment>
                  ),
              }}
            />
          </Grid>
        </Grid>

        {/* Country Info and Legend */}
        {selectedCountry && (
          <Box sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Typography variant="h6">{selectedCountry.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {filteredFacilities.length} {filteredFacilities.length === 1 ? 'facility' : 'facilities'} found
              </Typography>
            </Box>

            {getAvailableTypes().length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Facility Types:
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {getAvailableTypes().map((type) => (
                    <Chip
                      key={type.code}
                      label={type.name}
                      size="small"
                      sx={{
                        backgroundColor: type.color + '20',
                        color: type.color,
                        border: `1px solid ${type.color}40`,
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </SearchSection>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Facility List */}
      <Box>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Iconify width={24} icon="solar:hospital-bold" />
          Facilities
          {loading.facilities && <CircularProgress size={20} sx={{ ml: 1 }} />}
        </Typography>

        {!selectedCountry ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Iconify width={64} icon="solar:global-bold" sx={{ color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Select a Country
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Choose a country from the dropdown above to view Red Cross facilities
            </Typography>
          </Paper>
        ) : filteredFacilities.length === 0 && !loading.facilities ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Iconify width={64} icon="solar:hospital-bold" sx={{ color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Facilities Found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {searchTerm
                ? `No facilities match "${searchTerm}" in ${selectedCountry.name}`
                : `No facilities available for ${selectedCountry.name}`}
            </Typography>
          </Paper>
        ) : (
          <Grid container spacing={2}>
            {filteredFacilities.map((facility) => {
              const typeDisplay = getFacilityTypeDisplay(facility);
              const typeColor = FACILITY_TYPES[facility.type_code as keyof typeof FACILITY_TYPES]?.color || '#gray';

              return (
                <Grid item xs={12} md={6} lg={4} key={facility.id}>
                  <FacilityCard>
                    <CardContent>
                      {/* Facility Header */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="h6" gutterBottom>
                            {facility.name}
                          </Typography>
                        </Box>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            backgroundColor: typeColor,
                            mt: 1,
                          }}
                        />
                      </Box>

                      {/* Facility Info */}
                      <Box sx={{ mb: 2 }}>
                        <Box
                          sx={{
                            '& > p': { lineHeight: 1.7, m: 0 },
                            '& > p + p': { mt: 1.25 },
                          }}
                        >
                          <Typography variant="body2" color="text.primary">
                            <strong>Local unit type:</strong>{' '}{typeDisplay.localUnitType || '-'}
                          </Typography>

                          {typeDisplay.healthFacilityType && (
                            <Typography variant="body2" color="text.primary">
                              <strong>Health facility type:</strong>{' '}{typeDisplay.healthFacilityType}
                            </Typography>
                          )}

                          <Typography variant="body2" color="text.primary">
                            <strong>Address:</strong>{' '}{facility.address || '-'}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>

                    <CardActions sx={{ px: 2, pb: 2 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<Iconify icon="solar:map-point-bold" />}
                        onClick={(e) => {
                          e.stopPropagation();
                          const url = `https://www.google.com/maps/dir/?api=1&destination=${facility.latitude},${facility.longitude}`;
                          window.open(url, '_blank');
                        }}
                      >
                        Directions
                      </Button>
                    </CardActions>
                  </FacilityCard>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Box>
    </Box>
  );
}
