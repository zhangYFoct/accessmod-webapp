/**
 * Environment Setup for Integration Tests
 * Sets up environment variables and configuration
 */

// Test environment configuration (use Object.assign to avoid read-only error)
if (!process.env.NODE_ENV) {
  Object.assign(process.env, { NODE_ENV: 'test' });
}

// Backend service URL
process.env.TEST_BACKEND_URL = process.env.TEST_BACKEND_URL || 'http://localhost:5000';

// JWT configuration
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret-key';

// Database configuration for tests (use same password as docker-compose)
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:admin@localhost:5432/healthcare_analysis';

// Google Earth Engine configuration
process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
process.env.GEE_PROJECT_ID = process.env.GEE_PROJECT_ID || 'halogen-plasma-465713-t3';

// Test timeouts
process.env.TEST_TIMEOUT = process.env.TEST_TIMEOUT || '30000';

// Logging level for tests
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

// Disable console warnings during tests (optional)
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  // Filter out specific warnings that are noise during testing
  const message = args.join(' ');
  if (
    message.includes('punycode') ||
    message.includes('deprecated') ||
    message.includes('experimental')
  ) {
    return;
  }
  originalWarn.apply(console, args);
};