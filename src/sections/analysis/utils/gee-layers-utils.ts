import { backendApiService, type AnalysisResponse } from '../../../services/backendApiService';
import type { GEELayer } from '../../../components/map/AccessibilityAnalysisMap';

/**
 * Create GEE layers from analysis results
 * @param analysisData - The analysis data from backend
 * @param countryName - The name of the country
 * @returns Promise containing layers array and optional assetId
 */
export async function createGeeLayersFromAnalysis(
  analysisData: AnalysisResponse['data'], 
  countryName: string
): Promise<{ layers: GEELayer[]; assetId?: string }> {
  const layers: GEELayer[] = [];
  
  // Add country boundary layer
  try {
    const boundaryResponse = await backendApiService.getCountryBoundary({
      country_name: countryName
    });
    
    if (boundaryResponse.success) {
      layers.push({
        id: 'country_boundary',
        name: 'Country Boundary',
        url: boundaryResponse.tile_url,
        attribution: 'Google Earth Engine',
        opacity: 1.0,
        visible: true
      });
      console.log('Created country boundary layer');
    }
  } catch (error) {
    console.error('Error getting boundary layer:', error);
  }
  
  if (analysisData.asset_id) {
    try {
      // Get tile URL from backend
      const tileUrlResponse = await backendApiService.getTileUrl({
        asset_id: analysisData.asset_id,
        layer_type: 'travel_time'
      });
      
      if (tileUrlResponse.success) {
        // Create main accessibility layer with real tile URL
        layers.push({
          id: 'accessibility_main',
          name: 'Travel Time Analysis',
          url: tileUrlResponse.tile_url,
          attribution: 'Google Earth Engine',
          opacity: 1.0,
          visible: true
        });
        
        console.log('Created GEE layer with tile URL:', tileUrlResponse.tile_url);
      } else {
        console.warn('Failed to get tile URL from backend');
      }
    } catch (error) {
      console.error('Error getting tile URL:', error);
    }
    
    return { layers, assetId: analysisData.asset_id };
  }
  
  return { layers, assetId: undefined };
}