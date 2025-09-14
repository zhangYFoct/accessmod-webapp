import React, { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Dynamic map positioning component
function FitToData({
  selectedCountry,
  hospitals,
  zones
}: {
  selectedCountry?: string;
  hospitals: Hospital[];
  zones: AnalysisZone[];
}) {
  const map = useMap();

  useEffect(() => {
    // Only fit when country is selected and has data
    if (!selectedCountry || (hospitals.length === 0 && zones.length === 0)) return;

    const allPoints: L.LatLng[] = [];
    
    // Add hospital coordinates
    hospitals.forEach(h => {
      if (h.latitude && h.longitude) {
        allPoints.push(L.latLng(Number(h.latitude), Number(h.longitude)));
      }
    });
    
    // Add zone coordinates
    zones.forEach(zone => {
      if (zone.center) {
        allPoints.push(L.latLng(zone.center[0], zone.center[1]));
      }
    });
    
    if (allPoints.length === 0) return;
    
    const bounds = L.latLngBounds(allPoints);
    
    // Single point -> zoom to reasonable level; multiple points -> fit bounds
    if (allPoints.length === 1) {
      map.setView(allPoints[0], Math.max(map.getZoom(), 10));
    } else {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [selectedCountry, hospitals, zones, map]);

  return null;
}

// Hospital data type
export interface Hospital {
  id: number;
  name: string;
  nameEn?: string;
  address: string;
  city: string;
  province: string;
  country: string;
  phone?: string;
  email?: string;
  latitude: number;
  longitude: number;
  hospitalType: string;
  level?: string;
  bedCount?: number;
  isEmergency: boolean;
  is24h: boolean;
  redcrossCertified: boolean;
  status: 'active' | 'inactive' | 'closed';
  description?: string;
}

// Analysis zone interface
export interface AnalysisZone {
  center: [number, number];
  radius: number; // in kilometers
  time: number; // travel time in minutes
  color: string;
  coverage?: number; // population coverage percentage
}

// Analysis results interface
export interface AnalysisResults {
  coverage: number;
  zones: AnalysisZone[];
  totalFacilities?: number;
  averageAccessTime?: number;
  populationCovered?: number;
  analysis_id?: string;
}

// GEE Layer interface
export interface GEELayer {
  id: string;
  name: string;
  url: string;
  attribution?: string;
  opacity?: number;
  visible?: boolean;
}

// Extended analysis results with GEE data
export interface ExtendedAnalysisResults extends AnalysisResults {
  geeAssetId?: string;
  geeLayers?: GEELayer[];
}

// Create custom icons for facilities
const createFacilityIcon = (hospitalType: string = 'general', isEmergency: boolean = false) => {
  let bgColor = '#dc143c';
  let emoji = '🏥';
  
  if (isEmergency) {
    bgColor = '#ff4444';
    emoji = '🚑';
  } else {
    switch (hospitalType.toLowerCase()) {
      case 'health care':
        bgColor = '#dc143c';
        emoji = '🏥';
        break;
      case 'administrative':
        bgColor = '#4a90e2';
        emoji = '🏢';
        break;
      case 'emergency response':
        bgColor = '#ff6b35';
        emoji = '🚑';
        break;
      case 'red cross branch office':
        bgColor = '#4a90e2';
        emoji = '🏢';
        break;
      default:
        bgColor = '#dc143c';
        emoji = '🏥';
    }
  }
  
  return L.divIcon({
    html: `<div style="
      background-color: ${bgColor}; 
      width: 14px; 
      height: 14px; 
      border-radius: 50%; 
      border: 1px solid white; 
      box-shadow: 0 1px 2px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 8px;
      font-weight: bold;
      position: relative;
      z-index: 1000;
    ">${emoji}</div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -7],
    className: 'analysis-facility-marker'
  });
};


// Analysis Map Component
interface AccessibilityAnalysisMapProps {
  selectedCountry?: string;
  hospitals?: Hospital[];
  analysisResults?: AnalysisResults;
  onHospitalClick?: (hospital: Hospital) => void;
  showAnalysis?: boolean;
  isLoading?: boolean;
  error?: string | null;
  height?: string;
  geeLayers?: GEELayer[];  // GEE layers array
  geeAssetId?: string;     // Main GEE Asset ID
}

export const AccessibilityAnalysisMap: React.FC<AccessibilityAnalysisMapProps> = ({
  selectedCountry,
  hospitals = [],
  analysisResults,
  onHospitalClick,
  showAnalysis = false,
  isLoading = false,
  error = null,
  height = '100%',
  geeLayers = [],
  geeAssetId
}) => {
  // Initial map settings - will be dynamically adjusted by FitToData component
  const initialCenter: [number, number] = [20.0, 0.0];
  const initialZoom = 2;

  // Handle facility marker click
  const handleMarkerClick = useCallback((hospital: Hospital) => {
    onHospitalClick?.(hospital);
  }, [onHospitalClick]);

  // Get zone color with opacity
  const getZoneColor = (zone: AnalysisZone) => {
    const baseColor = zone.color || '#dc143c';
    return baseColor;
  };

  return (
    <Box sx={{ height, width: '100%', position: 'relative' }}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        touchZoom={true}
        boxZoom={true}
        keyboard={true}
        closePopupOnClick={false}
      >
        <LayersControl position="topright">
          {/* Base layers */}
          <LayersControl.BaseLayer checked name="CartoDB Voyager">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              maxZoom={19}
              minZoom={2}
            />
          </LayersControl.BaseLayer>
          
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer
              attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={18}
              minZoom={2}
            />
          </LayersControl.BaseLayer>
          
          {/* GEE Overlay layers */}
          {geeLayers.map((layer) => (
            <LayersControl.Overlay 
              key={layer.id} 
              name={layer.name}
              checked={layer.visible !== false}
            >
              <TileLayer
                url={layer.url}
                attribution={layer.attribution || 'Google Earth Engine'}
                opacity={layer.opacity || 0.7}
                maxZoom={18}
                minZoom={2}
              />
            </LayersControl.Overlay>
          ))}
          
        </LayersControl>
        
        <FitToData selectedCountry={selectedCountry} hospitals={hospitals} zones={analysisResults?.zones || []} />
        
        {/* Analysis zones (coverage areas) */}
        {showAnalysis && analysisResults?.zones?.map((zone, index) => (
          <Circle
            key={`zone-${index}`}
            center={zone.center}
            radius={zone.radius * 1000} // Convert km to meters
            pathOptions={{
              color: getZoneColor(zone),
              fillColor: getZoneColor(zone),
              fillOpacity: 0.15,
              weight: 2,
              opacity: 0.6,
              dashArray: '5, 5'
            }}
          />
        ))}
        
        {/* Facility markers */}
        {hospitals.map((hospital) => (
          <Marker
            key={hospital.id}
            position={[hospital.latitude, hospital.longitude]}
            icon={createFacilityIcon(hospital.hospitalType, hospital.isEmergency)}
            eventHandlers={{
              click: () => handleMarkerClick(hospital)
            }}
          >
            <Popup maxWidth={400} minWidth={300} closeOnClick={false}>
              <Box sx={{ minWidth: 280, maxWidth: 380 }}>
                {/* Facility header */}
                <Box sx={{ borderBottom: 1, borderColor: 'divider', pb: 2, mb: 2 }}>
                  <Typography variant="h6" sx={{ color: '#000000', mb: 1, lineHeight: 1.2, fontWeight: 600 }}>
                    {hospital.name}
                  </Typography>
                  {hospital.nameEn && hospital.nameEn !== hospital.name && (
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 1 }}>
                      {hospital.nameEn}
                    </Typography>
                  )}
                  
                  {/* Status chips */}
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    <Chip 
                      label={hospital.hospitalType} 
                      size="small" 
                      color="primary"
                      sx={{ height: 22, fontSize: '0.75rem' }}
                    />
                    {hospital.level && (
                      <Chip 
                        label={hospital.level} 
                        size="small" 
                        color="secondary"
                        sx={{ height: 22, fontSize: '0.75rem' }}
                      />
                    )}
                    {hospital.isEmergency && (
                      <Chip 
                        label="Emergency" 
                        size="small" 
                        color="error"
                        sx={{ height: 22, fontSize: '0.75rem' }}
                      />
                    )}
                    {hospital.is24h && (
                      <Chip 
                        label="24/7" 
                        size="small" 
                        color="info"
                        sx={{ height: 22, fontSize: '0.75rem' }}
                      />
                    )}
                    {hospital.redcrossCertified && (
                      <Chip 
                        label="Red Cross" 
                        size="small" 
                        color="success"
                        sx={{ height: 22, fontSize: '0.75rem' }}
                      />
                    )}
                  </Box>
                </Box>
                
                {/* Contact and location info */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>📍</span> {hospital.address}, {hospital.city}, {hospital.province}
                  </Typography>
                  {hospital.phone && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>📞</span> {hospital.phone}
                    </Typography>
                  )}
                  {hospital.email && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>📧</span> {hospital.email}
                    </Typography>
                  )}
                </Box>
                
                
                {/* Action buttons */}
                <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
                  <Button
                    variant="contained"
                    size="small"
                    fullWidth
                    sx={{ 
                      bgcolor: '#dc143c', 
                      '&:hover': { bgcolor: '#b91c1c' },
                      textTransform: 'none',
                      fontSize: '0.8rem'
                    }}
                    onClick={() => {
                      const url = `https://www.google.com/maps/dir/?api=1&destination=${hospital.latitude},${hospital.longitude}`;
                      window.open(url, '_blank');
                    }}
                  >
                    🗺️ Get Directions
                  </Button>
                </Box>
              </Box>
            </Popup>
          </Marker>
        ))}
      </MapContainer>


      {/* Loading state */}
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
              Running Analysis
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Computing accessibility metrics...
            </Typography>
          </Box>
        </Box>
      )}

      {/* Error state */}
      {error && (
        <Box sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1001,
          width: '90%',
          maxWidth: 400
        }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Analysis Error
            </Typography>
            <Typography variant="body2">
              {error}
            </Typography>
          </Alert>
          <Button
            variant="outlined"
            fullWidth
            onClick={() => window.location.reload()}
          >
            Retry Analysis
          </Button>
        </Box>
      )}

      {/* No data state */}
      {!isLoading && !error && hospitals.length === 0 && selectedCountry && (
        <Box sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          zIndex: 1000,
          p: 4,
          bgcolor: 'rgba(255, 255, 255, 0.95)',
          borderRadius: 2,
          boxShadow: 3,
          maxWidth: 350
        }}>
          <Box sx={{ fontSize: 64, mb: 2 }}>🏥</Box>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No Facilities Found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            No Red Cross medical facilities found in {selectedCountry.toUpperCase()}. 
            Please select a different country or check data availability.
          </Typography>
        </Box>
      )}

      {/* No country selected state */}
      {!selectedCountry && !isLoading && !error && (
        <Box sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          zIndex: 1000,
          p: 3,
          bgcolor: 'rgba(255, 255, 255, 0.9)',
          borderRadius: 2,
          boxShadow: 2,
          maxWidth: 300
        }}>
          <Box sx={{ fontSize: 48, mb: 1 }}>🗺️</Box>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Select a Country
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Choose a country from the dropdown above to view healthcare facilities
          </Typography>
        </Box>
      )}

      {/* Custom map styles */}
      <style>{`
        .leaflet-popup-content-wrapper {
          border-radius: 12px !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2) !important;
          border: 1px solid rgba(220, 20, 60, 0.1) !important;
        }
        
        .leaflet-popup-content {
          margin: 0 !important;
          padding: 0 !important;
          border-radius: 12px !important;
        }
        
        .leaflet-popup-tip {
          background: white !important;
          border: 1px solid rgba(220, 20, 60, 0.1) !important;
        }
        
        .analysis-facility-marker {
          transition: all 0.2s ease !important;
          cursor: pointer !important;
        }
        
        .analysis-facility-marker:hover {
          z-index: 1001 !important;
          filter: brightness(1.15) drop-shadow(0 6px 12px rgba(0, 0, 0, 0.4)) !important;
        }
        
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
        }
        
        .leaflet-control-zoom a {
          background-color: rgba(255, 255, 255, 0.9) !important;
          border: 1px solid rgba(0, 0, 0, 0.1) !important;
          color: #333 !important;
          font-weight: bold !important;
        }
        
        .leaflet-control-zoom a:hover {
          background-color: #dc143c !important;
          color: white !important;
        }
        
        .leaflet-container {
          font-family: inherit !important;
        }

        .leaflet-marker-icon {
          transition: all 0.2s ease !important;
        }
        
        .leaflet-marker-icon:hover {
          filter: brightness(1.15) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3)) !important;
        }

        .leaflet-popup {
          pointer-events: auto !important;
        }
        
        .leaflet-popup-content-wrapper {
          pointer-events: auto !important;
        }

        /* Analysis zone styles */
        .leaflet-interactive {
          cursor: pointer !important;
        }
        
        .leaflet-interactive:hover {
          opacity: 0.8 !important;
        }
      `}</style>
    </Box>
  );
};