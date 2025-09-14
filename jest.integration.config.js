const config = {
  // Test environment
  testEnvironment: 'node',
  
  // Root directory
  rootDir: '.',
  
  // Test file patterns
  testMatch: [
    '<rootDir>/tests/integration_test/**/*.integration.test.ts'
  ],
  
  // Module resolution
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // TypeScript transformation
  preset: 'ts-jest',
  
  // Module name mapping for imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  
  // Test timeout (extended for GEE operations)
  testTimeout: 180000,
  
  // Test execution
  verbose: true,
  detectOpenHandles: true,
  forceExit: true,
  
  // Coverage
  collectCoverage: false,
  
  // Setup files
  setupFiles: ['<rootDir>/tests/integration_test/env-setup.ts']
};

module.exports = config;