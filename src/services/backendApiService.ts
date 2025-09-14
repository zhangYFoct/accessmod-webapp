import axios from 'axios';

// Create a separate axios instance for backend API
const backendAxios = axios.create({
  baseURL: 'http://localhost:5000',
  timeout: 120000, // Increased to 2 minutes as GEE analysis may take longer
});

// Add request interceptor to include auth token
backendAxios.interceptors.request.use(
  (config) => {
    // Get token from sessionStorage (same key as used by frontend auth)
    const token = sessionStorage.getItem('jwt_access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add error handling
backendAxios.interceptors.response.use(
  (response) => {
    console.log('Backend API success:', response.config.url, response.status);
    return response;
  },
  (error) => {
    console.error('Backend API Error:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      message: error.message,
      data: error.response?.data
    });
    return Promise.reject(error);
  }
);

// Types for backend API
export interface BackendCountryResponse {
  success: boolean;
  countries: string[];
  total_countries: number;
}

export interface AnalysisRequest {
  country_name: string;
}

export interface AnalysisResponse {
  success: boolean;
  data: {
    country_name: string;
    asset_id: string;
    resolution: number;
    total_population: number;
    target_resolution: number;
    conservative_resolution: number;
    k_factor: number;
    coverage_scale_used: number;
    pop_within_15min: number;
    coverage_15min: number;
    pop_within_30min: number;
    coverage_30min: number;
    pop_within_60min: number;
    coverage_60min: number;
  };
}

export interface TestResponse {
  success: boolean;
  message: string;
  gee_initialized: boolean;
}

export interface TileUrlRequest {
  asset_id: string;
  layer_type?: string;
}

export interface TileUrlResponse {
  success: boolean;
  tile_url: string;
  asset_id: string;
  layer_type: string;
}

export interface BoundaryRequest {
  country_name: string;
}

export interface BoundaryResponse {
  success: boolean;
  tile_url: string;
  country_name: string;
  layer_type: string;
}

export const backendApiService = {
  // Test backend connection
  async test(): Promise<TestResponse> {
    const response = await backendAxios.get('/api/test');
    return response.data;
  },

  // Get available countries
  async getCountries(): Promise<BackendCountryResponse> {
    const response = await backendAxios.get('/api/countries');
    return response.data;
  },

  // Analyze accessibility from asset
  async analyzeFromAsset(request: AnalysisRequest): Promise<AnalysisResponse> {
    const response = await backendAxios.post('/api/analyze-from-asset', request);
    return response.data;
  },

  // Get tile URL for GEE asset
  async getTileUrl(request: TileUrlRequest): Promise<TileUrlResponse> {
    const response = await backendAxios.post('/api/get-tile-url', request);
    return response.data;
  },

  // Get country boundary layer
  async getCountryBoundary(request: BoundaryRequest): Promise<BoundaryResponse> {
    const response = await backendAxios.post('/api/get-country-boundary', request);
    return response.data;
  },
};