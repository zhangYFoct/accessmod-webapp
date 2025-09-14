// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
  })),
}));

import axios from 'axios';
import { backendApiService } from '../../src/services/backendApiService';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockAxiosInstance = (mockedAxios.create as jest.Mock).mock.results[0].value;

// Mock sessionStorage
Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  },
  writable: true,
});

describe('backendApiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('test()', () => {
    it('should call GET /api/test', async () => {
      const mockResponse = { data: { message: 'API is working', success: true } };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await backendApiService.test();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/test');
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle API errors', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      await expect(backendApiService.test()).rejects.toThrow('Network error');
    });
  });

  describe('getCountries()', () => {
    it('should fetch countries list', async () => {
      const mockResponse = {
        data: {
          success: true,
          countries: ['Kenya', 'Uganda'],
          total_countries: 2
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await backendApiService.getCountries();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/countries');
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle network errors', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network Error'));

      await expect(backendApiService.getCountries()).rejects.toThrow('Network Error');
    });
  });

  describe('analyzeFromAsset()', () => {
    it('should submit analysis request', async () => {
      const analysisRequest = {
        country_name: 'Kenya'
      };
      const mockResponse = {
        data: { success: true, data: { asset_id: 'test-id' } }
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await backendApiService.analyzeFromAsset(analysisRequest);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/analyze-from-asset', analysisRequest);
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle analysis submission errors', async () => {
      const analysisRequest = { country_name: 'Kenya' };
      mockAxiosInstance.post.mockRejectedValue(new Error('Submission failed'));

      await expect(backendApiService.analyzeFromAsset(analysisRequest)).rejects.toThrow('Submission failed');
    });

    it('should handle 500 server errors', async () => {
      const analysisRequest = { country_name: 'Kenya' };
      const serverError = {
        response: { status: 500, data: { error: 'Internal server error' } },
        message: 'Request failed with status code 500'
      };
      mockAxiosInstance.post.mockRejectedValue(serverError);

      await expect(backendApiService.analyzeFromAsset(analysisRequest)).rejects.toMatchObject(serverError);
    });

    it('should handle 400 validation errors', async () => {
      const analysisRequest = { country_name: '' };
      const validationError = {
        response: { status: 400, data: { error: 'Country name is required' } },
        message: 'Request failed with status code 400'
      };
      mockAxiosInstance.post.mockRejectedValue(validationError);

      await expect(backendApiService.analyzeFromAsset(analysisRequest)).rejects.toMatchObject(validationError);
    });
  });


});