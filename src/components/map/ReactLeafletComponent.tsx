import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { BoundaryService } from 'src/services/boundaryService';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';

// Global boundary layer manager to prevent multiple boundaries
let globalBoundaryLayer: L.GeoJSON | null = null;

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// 6 facility type icons
const createHospitalIcon = (hospitalType: string = 'other') => {
  const t = (hospitalType || '').toLowerCase();
  let bgColor = '#6b7280'; // Other
  let emoji = '📌';

  if (t === 'administrative') {
    bgColor = '#4a90e2';
    emoji = '🏢';
  } else if (t === 'health care') {
    bgColor = '#dc143c';
    emoji = '🏥';
  } else if (t === 'emergency response') {
    bgColor = '#ff6b35';
    emoji = '🚑';
  } else if (t === 'humanitarian assistance centres') {
    bgColor = '#8e44ad';
    emoji = '🤝';
  } else if (t === 'training and education') {
    bgColor = '#2ecc71';
    emoji = '🎓';
  }

  return L.divIcon({
    html: `
      <div style="
        background-color:${bgColor};
        width:28px;height:28px;border-radius:50%;
        border:3px solid white;box-shadow:0 3px 6px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;
        color:white;font-size:14px;font-weight:bold;
        position:relative;z-index:1000;
      ">
        ${emoji}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
    className: 'hospital-marker',
  });
};

// Minimal data structure for map side (other fields optional, display if available)
export interface HospitalPin {
  id: number | string;
  name: string;
  latitude: number;
  longitude: number;
  hospitalType: string;

  // Optional information (display if available)
  address?: string;
  city?: string;
  province?: string;
  description?: string;
  nameEn?: string;
}

function FitToHospitals({
  selectedCountry,
  pins,
}: {
  selectedCountry?: string;
  pins: HospitalPin[];
}) {
  const map = useMap();

  useEffect(() => {
    // Only: selected country and has facility points, then locate
    if (!selectedCountry || pins.length === 0) return;

    // Calculate bounds (ensure all are numbers)
    const latlngs = pins.map((p) =>
      L.latLng(Number(p.latitude), Number(p.longitude))
    );
    const bounds = L.latLngBounds(latlngs);

    // Single point -> zoom in a bit; multiple points -> adaptive bounds
    if (pins.length === 1) {
      map.setView(latlngs[0], Math.max(map.getZoom(), 12));
    } else {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 8 });
    }
  }, [selectedCountry, pins, map]);

  return null;
}

// Country boundary display component
const CountryBoundary = ({ 
  countryName, 
  onBoundaryLoad 
}: { 
  countryName?: string;
  onBoundaryLoad?: (bounds: L.LatLngBounds | null) => void;
}) => {
  const map = useMap();
  const boundaryLayerRef = useRef<L.GeoJSON | null>(null);

  // Clear all boundary layers from map using global manager
  const clearAllBoundaryLayers = useCallback(() => {
    // Remove global boundary layer if exists
    if (globalBoundaryLayer) {
      try {
        map.removeLayer(globalBoundaryLayer);
        console.log('Removed global boundary layer');
      } catch (error) {
        console.warn('Error removing global boundary layer:', error);
      }
      globalBoundaryLayer = null;
    }

    // Remove tracked layer as fallback
    if (boundaryLayerRef.current) {
      try {
        map.removeLayer(boundaryLayerRef.current);
        console.log('Removed tracked boundary layer');
      } catch (error) {
        console.warn('Error removing tracked boundary layer:', error);
      }
      boundaryLayerRef.current = null;
    }

    // Also remove any layers that might have been orphaned
    map.eachLayer((layer: any) => {
      if (layer instanceof L.GeoJSON && (layer as any)._isBoundaryLayer) {
        try {
          map.removeLayer(layer);
          console.log('Removed orphaned boundary layer');
        } catch (error) {
          console.warn('Error removing orphaned boundary layer:', error);
        }
      }
    });
  }, [map]);

  useEffect(() => {
    // Clear all existing boundary layers first
    clearAllBoundaryLayers();

    // If no country selected, return
    if (!countryName) {
      console.log('No country selected, boundaries cleared');
      onBoundaryLoad?.(null);
      return;
    }

    // Load and display country boundary
    const loadBoundary = async () => {
      try {
        const boundary = await BoundaryService.getCountryBoundary(countryName);
        
        if (boundary && boundary.geometry) {
          // Create GeoJSON layer for the boundary
          const geoJsonLayer = L.geoJSON(boundary.geometry, {
            style: () => ({
              color: '#ff4444',        // Red border
              weight: 2,               // Border width
              opacity: 0.8,            // Border opacity
              fillColor: '#ff4444',    // Fill color
              fillOpacity: 0.1,        // Light fill opacity
              interactive: false       // Non-interactive overlay
            })
          });

          // Mark this layer as a boundary layer for identification
          (geoJsonLayer as any)._isBoundaryLayer = true;

          // Add to map and set as global boundary layer
          geoJsonLayer.addTo(map);
          boundaryLayerRef.current = geoJsonLayer;
          globalBoundaryLayer = geoJsonLayer;

          // Calculate bounds and fit map
          const bounds = geoJsonLayer.getBounds();
          map.fitBounds(bounds, {
            padding: [30, 30],
            maxZoom: 8  // Don't zoom too close for country view
          });

          onBoundaryLoad?.(bounds);
          
          console.log(`Country boundary loaded for: ${countryName}`);
        } else {
          console.warn(`No boundary found for country: ${countryName}`);
          onBoundaryLoad?.(null);
        }
      } catch (error) {
        console.error('Failed to load country boundary:', error);
        onBoundaryLoad?.(null);
      }
    };

    loadBoundary();
  }, [countryName, map, onBoundaryLoad, clearAllBoundaryLayers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllBoundaryLayers();
    };
  }, [clearAllBoundaryLayers]);

  return null;
};

function EmptyMapState({ message }: { message: string }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        zIndex: 1000,
        p: 3,
        bgcolor: 'rgba(255,255,255,0.95)',
        borderRadius: 2,
        boxShadow: 3,
        maxWidth: 300,
      }}
    >
      <Box sx={{ fontSize: 48, mb: 2 }}>🏥</Box>
      <Typography variant="h6" color="text.secondary" gutterBottom>
        No Hospitals Found
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );
}

function LoadingMapState() {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        zIndex: 1000,
        p: 3,
        bgcolor: 'rgba(255,255,255,0.95)',
        borderRadius: 2,
        boxShadow: 3,
      }}
    >
      <CircularProgress size={40} sx={{ mb: 2, color: '#dc143c' }} />
      <Typography variant="h6" color="text.secondary" gutterBottom>
        Loading Hospitals
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Fetching medical facilities data...
      </Typography>
    </Box>
  );
}

function CountrySelectState() {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        zIndex: 1000,
        p: 4,
        bgcolor: 'rgba(255,255,255,0.95)',
        borderRadius: 2,
        boxShadow: 3,
        maxWidth: 350,
      }}
    >
      <Box sx={{ fontSize: 64, mb: 2 }}>🌍</Box>
      <Typography variant="h5" color="text.secondary" gutterBottom>
        Red Cross Medical Facilities
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Select a country to view Red Cross medical facilities worldwide
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
        Use the country selector below to get started
      </Typography>
    </Box>
  );
}

interface CountryHospitalMapProps {
  selectedCountry?: string;
  countryName?: string; // For boundary display
  hospitals?: any[]; // Page passes ifrcFacility + hospitalType (as any[]), relaxed here
  height?: string;
  onHospitalClick?: (hospital: HospitalPin) => void;
  isLoading?: boolean;
  error?: string | null;
}

export const CountryHospitalMap: React.FC<CountryHospitalMapProps> = ({
  selectedCountry,
  countryName,
  hospitals = [],
  height = '100%',
  onHospitalClick,
  isLoading = false,
  error = null,
}) => {
  // Unify into pins (ensure coordinates are numbers, filter invalid coordinates)
  const pins: HospitalPin[] = useMemo(() => {
    return (hospitals as any[])
      .map((h) => ({
        id: h.id,
        name: h.name,
        latitude: Number(h.latitude),
        longitude: Number(h.longitude),
        hospitalType: h.hospitalType || h.type_name || 'Other',
        address: h.address,
        city: h.city,
        province: h.province,
        description: h.description,
        nameEn: h.nameEn,
      }))
      .filter(
        (p) =>
          Number.isFinite(p.latitude) &&
          Number.isFinite(p.longitude) &&
          p.latitude >= -90 &&
          p.latitude <= 90 &&
          p.longitude >= -180 &&
          p.longitude <= 180
      );
  }, [hospitals]);

  const handleMarkerClick = useCallback(
    (p: HospitalPin) => {
      onHospitalClick?.(p);
    },
    [onHospitalClick]
  );

  return (
    <Box sx={{ height, width: '100%', position: 'relative' }}>
      <MapContainer
        center={[20, 0]} // Initial world view
        zoom={2}
        style={{ height: '100%', width: '100%' }}
        zoomControl
        scrollWheelZoom
        doubleClickZoom
        touchZoom
        boxZoom
        keyboard
        closePopupOnClick={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          maxZoom={19}
          minZoom={2}
        />

        {/* Country boundary display */}
        <CountryBoundary 
          countryName={countryName}
          onBoundaryLoad={(bounds) => {
            // Optional: Handle boundary load event
            if (bounds && pins.length === 0) {
              // If no facilities, fit to boundary instead
              // The CountryBoundary component already handles this
            }
          }}
        />

        {/* Selected country with locations -> auto fit to points */}
        <FitToHospitals selectedCountry={selectedCountry} pins={pins} />

        {/* Markers */}
        {pins.map((p) => (
          <Marker
            key={String(p.id)}
            position={[Number(p.latitude), Number(p.longitude)]}
            icon={createHospitalIcon(p.hospitalType)}
            eventHandlers={{ click: () => handleMarkerClick(p) }}
          >
            <Popup maxWidth={400} minWidth={300} closeOnClick={false}>
              <Box sx={{ minWidth: 260, maxWidth: 380 }}>
                {/* Header */}
                <Box sx={{ borderBottom: 1, borderColor: 'divider', pb: 2, mb: 2 }}>
                  <Typography
                    variant="h6"
                    sx={{ color: '#000', mb: 1, lineHeight: 1.2, fontWeight: 600 }}
                  >
                    {p.name}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    <Chip
                      label={p.hospitalType}
                      size="small"
                      color="primary"
                      sx={{ height: 22, fontSize: '0.75rem' }}
                    />
                  </Box>
                </Box>

                {/* Address (show if available) */}
                {(p.address || p.city || p.province) && (
                  <Box sx={{ mb: 2 }}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                    >
                      <span>📍</span>
                      {[p.address, p.city, p.province].filter(Boolean).join(', ')}
                    </Typography>
                  </Box>
                )}

                {/* Description (show if available) */}
                {p.description && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mb: 2, display: 'block', fontStyle: 'italic' }}
                  >
                    {p.description}
                  </Typography>
                )}

                {/* Route button */}
                <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
                  <Button
                    variant="contained"
                    size="small"
                    fullWidth
                    sx={{
                      bgcolor: '#dc143c',
                      '&:hover': { bgcolor: '#b91c1c' },
                      textTransform: 'none',
                      fontSize: '0.8rem',
                    }}
                    onClick={() => {
                      const url = `https://www.google.com/maps/dir/?api=1&destination=${Number(
                        p.latitude
                      )},${Number(p.longitude)}`;
                      window.open(url, '_blank');
                    }}
                  >
                    🗺️ Directions
                  </Button>
                </Box>
              </Box>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Legend (6 types) */}
      {pins.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <Tooltip title="Hospital Legend">
            <Box
              sx={{
                bgcolor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: 1,
                p: 1,
                boxShadow: 1,
                backdropFilter: 'blur(4px)',
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                Legend
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      bgcolor: '#4a90e2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '8px',
                    }}
                  >
                    🏢
                  </Box>
                  <Typography variant="caption">Administrative</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      bgcolor: '#dc143c',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '8px',
                    }}
                  >
                    🏥
                  </Box>
                  <Typography variant="caption">Health Care</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      bgcolor: '#ff6b35',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '8px',
                    }}
                  >
                    🚑
                  </Box>
                  <Typography variant="caption">Emergency Response</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      bgcolor: '#8e44ad',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '8px',
                    }}
                  >
                    🤝
                  </Box>
                  <Typography variant="caption">Humanitarian Assistance Centres</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      bgcolor: '#2ecc71',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '8px',
                    }}
                  >
                    🎓
                  </Box>
                  <Typography variant="caption">Training and Education</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      bgcolor: '#6b7280',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '8px',
                    }}
                  >
                    📌
                  </Box>
                  <Typography variant="caption">Other</Typography>
                </Box>
              </Box>
            </Box>
          </Tooltip>
        </Box>
      )}

      {/* Loading / Error / Empty / No country */}
      {isLoading && <LoadingMapState />}

      {error && (
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            zIndex: 1000,
            p: 3,
            bgcolor: 'rgba(255, 255, 255, 0.95)',
            borderRadius: 2,
            boxShadow: 3,
            maxWidth: 350,
          }}
        >
          <Box sx={{ fontSize: 48, mb: 2, color: 'error.main' }}>⚠️</Box>
          <Typography variant="h6" color="error" gutterBottom>
            Error Loading Data
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {error}
          </Typography>
          <Button variant="outlined" size="small" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </Box>
      )}

      {!isLoading && !error && pins.length === 0 && selectedCountry && (
        <EmptyMapState
          message={`No Red Cross medical facilities found in ${selectedCountry
            .replace('_', ' ')
            .toUpperCase()}. The data may not be available for this country yet.`}
        />
      )}

      {!selectedCountry && !isLoading && !error && <CountrySelectState />}

      <style>{`
        .leaflet-popup-content-wrapper{border-radius:12px!important;box-shadow:0 8px 32px rgba(0,0,0,.2)!important;border:1px solid rgba(220,20,60,.1)!important}
        .leaflet-popup-content{margin:0!important;padding:0!important;border-radius:12px!important}
        .leaflet-popup-tip{background:white!important;border:1px solid rgba(220,20,60,.1)!important}
        .hospital-marker{transition:all .2s ease!important;cursor:pointer!important}
        .hospital-marker:hover{z-index:1001!important;filter:brightness(1.15)!important}
        .leaflet-control-zoom{border:none!important;box-shadow:0 4px 12px rgba(0,0,0,.15)!important}
        .leaflet-control-zoom a{background-color:rgba(255,255,255,.9)!important;border:1px solid rgba(0,0,0,.1)!important;color:#333!important;font-weight:bold!important}
        .leaflet-control-zoom a:hover{background-color:#dc143c!important;color:#fff!important}
        .leaflet-container{font-family:inherit!important}
        .leaflet-marker-icon{transition:all .2s ease!important}
        .leaflet-marker-icon:hover{filter:brightness(1.15) drop-shadow(0 4px 8px rgba(0,0,0,.3))!important}
        .leaflet-popup{pointer-events:auto!important}
        .leaflet-popup-content-wrapper{pointer-events:auto!important}
      `}</style>
    </Box>
  );
};
