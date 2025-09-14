import { formatDate, exportToCSV, type AnalysisRecord } from '../../src/sections/projects/utils/projects-utils';

// Basic mocks for CSV export
global.URL.createObjectURL = jest.fn();
global.Blob = jest.fn();
global.document = {
  createElement: jest.fn(() => ({
    setAttribute: jest.fn(),
    style: {},
    click: jest.fn(),
  })),
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn(),
  },
} as any;

describe('Projects Functionality', () => {
  describe('formatDate', () => {
    it('should format ISO date string to locale string', () => {
      const isoDate = '2024-01-15T10:30:45.000Z';
      const result = formatDate(isoDate);
      
      expect(result).toBe(new Date(isoDate).toLocaleString());
      expect(typeof result).toBe('string');
    });

    it('should handle invalid date gracefully', () => {
      const result = formatDate('invalid-date');
      expect(result).toBe('Invalid Date');
    });
  });

  describe('exportToCSV', () => {
    const testRecords: AnalysisRecord[] = [
      {
        id: 1,
        country: 'Kenya',
        analysis_time: '2024-01-15T10:30:45.000Z',
        analysis_resolution: 1000,
        total_population: 50000000,
        population_15min_percent: 10.5,
        population_30min_percent: 30.2,
        population_60min_percent: 55.8
      }
    ];

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should export CSV without crashing', () => {
      expect(() => exportToCSV(testRecords)).not.toThrow();
      expect(global.Blob).toHaveBeenCalled();
    });

    it('should handle missing optional fields', () => {
      const recordsWithMissingFields: AnalysisRecord[] = [
        {
          id: 2,
          country: 'Uganda',
          analysis_time: '2024-01-16T14:20:30.000Z',
          population_15min_percent: 8.3,
          population_30min_percent: 25.1,
          population_60min_percent: 45.7
        }
      ];

      expect(() => exportToCSV(recordsWithMissingFields)).not.toThrow();
    });

    it('should handle quotes in country names', () => {
      const recordsWithQuotes: AnalysisRecord[] = [
        {
          id: 1,
          country: 'Test "Country"',
          analysis_time: '2024-01-15T10:30:45.000Z',
          population_15min_percent: 10.5,
          population_30min_percent: 30.2,
          population_60min_percent: 55.8
        }
      ];

      expect(() => exportToCSV(recordsWithQuotes)).not.toThrow();
    });

    it('should handle empty records array', () => {
      expect(() => exportToCSV([])).not.toThrow();
    });
  });
});