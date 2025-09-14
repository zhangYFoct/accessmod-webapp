// Mock the backend API service
jest.mock('../../src/services/backendApiService', () => ({
  backendApiService: {
    getTileUrl: jest.fn(),
    getCountryBoundary: jest.fn(),
  },
}));

import { createGeeLayersFromAnalysis } from '../../src/sections/analysis/utils/gee-layers-utils';
import { backendApiService } from '../../src/services/backendApiService';

const mockGetTileUrl = backendApiService.getTileUrl as jest.Mock;
const mockGetCountryBoundary = backendApiService.getCountryBoundary as jest.Mock;

describe('createGeeLayersFromAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockAnalysisData = {
    country_name: 'Kenya',
    asset_id: 'test-asset-id',
    resolution: 1000,
    total_population: 50000000,
    target_resolution: 1000,
    conservative_resolution: 2000,
    k_factor: 1.5,
    coverage_scale_used: 1000,
    pop_within_15min: 7750000,
    coverage_15min: 15.5,
    pop_within_30min: 17600000,
    coverage_30min: 35.2,
    pop_within_60min: 32900000,
    coverage_60min: 65.8
  };
  
  const mockCountryName = 'Kenya';

  it('should create layers when APIs succeed', async () => {
    mockGetCountryBoundary.mockResolvedValue({
      success: true,
      tile_url: 'boundary-url'
    });
    
    mockGetTileUrl.mockResolvedValue({
      success: true,
      tile_url: 'travel-time-url'
    });

    const result = await createGeeLayersFromAnalysis(mockAnalysisData, mockCountryName);

    expect(result.layers).toHaveLength(2);
    expect(result.layers[0].name).toBe('Country Boundary');
    expect(result.layers[1].name).toBe('Travel Time Analysis');
    expect(result.assetId).toBe('test-asset-id');
  });

  it('should return empty layers when APIs fail', async () => {
    mockGetCountryBoundary.mockRejectedValue(new Error('API Error'));
    mockGetTileUrl.mockRejectedValue(new Error('API Error'));

    const result = await createGeeLayersFromAnalysis(mockAnalysisData, mockCountryName);
    
    expect(result.layers).toHaveLength(0);
    expect(result.assetId).toBe('test-asset-id');
  });

  it('should handle unsuccessful API responses', async () => {
    mockGetCountryBoundary.mockResolvedValue({ success: false });
    mockGetTileUrl.mockResolvedValue({ success: false });

    const result = await createGeeLayersFromAnalysis(mockAnalysisData, mockCountryName);
    
    expect(result.layers).toHaveLength(0);
    expect(result.assetId).toBe('test-asset-id');
  });

  it('should skip travel time layer when no asset ID', async () => {
    const dataWithoutAssetId = { ...mockAnalysisData, asset_id: '' };
    mockGetCountryBoundary.mockResolvedValue({ success: true, tile_url: 'boundary' });

    const result = await createGeeLayersFromAnalysis(dataWithoutAssetId, mockCountryName);
    
    expect(result.assetId).toBeUndefined();
    expect(result.layers).toHaveLength(1); // Only boundary layer
    expect(result.layers[0].name).toBe('Country Boundary');
  });

  it('should set correct layer properties', async () => {
    mockGetCountryBoundary.mockResolvedValue({ 
      success: true, 
      tile_url: 'boundary-url' 
    });
    
    mockGetTileUrl.mockResolvedValue({ 
      success: true, 
      tile_url: 'travel-time-url' 
    });

    const result = await createGeeLayersFromAnalysis(mockAnalysisData, mockCountryName);

    // Check boundary layer properties
    expect(result.layers[0]).toMatchObject({
      id: 'country_boundary',
      name: 'Country Boundary',
      url: 'boundary-url',
      opacity: 1.0,
      visible: true
    });
    
    // Check travel time layer properties
    expect(result.layers[1]).toMatchObject({
      id: 'accessibility_main',
      name: 'Travel Time Analysis', 
      url: 'travel-time-url',
      opacity: 1.0,
      visible: true
    });
  });
});