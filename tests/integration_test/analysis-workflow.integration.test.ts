import request from 'supertest';

const BASE_URL = process.env.TEST_BACKEND_URL || 'http://localhost:5000';

describe('Analysis Workflow Integration Tests', () => {
  let accessToken: string;
  let userId: number;
  let analysisId: number;

  const testUser = {
    email: `analysis-test-${Date.now()}@example.com`,
    password: 'TestPassword123',
    firstName: 'Analysis',
    lastName: 'Tester'
  };

  const testCountry = 'Kenya'; // Using a country that should have test data

  beforeAll(async () => {
    // Setup authenticated user for analysis tests
    const signUpResponse = await request(BASE_URL)
      .post('/api/auth/sign-up')
      .send(testUser);

    accessToken = signUpResponse.body.accessToken;
    userId = signUpResponse.body.user.id;
  });

  describe('Complete Analysis Workflow', () => {
    it('should complete full analysis workflow: countries → analysis → results → history', async () => {
      // Step 1: Get available countries
      const countriesResponse = await request(BASE_URL)
        .get('/api/countries')
        .expect(200);

      expect(countriesResponse.body.success).toBe(true);
      expect(countriesResponse.body.countries).toBeInstanceOf(Array);
      expect(countriesResponse.body.total_countries).toBeGreaterThan(0);
      expect(countriesResponse.body.countries).toContain(testCountry);

      console.log(`Available countries: ${countriesResponse.body.total_countries}`);
    });

    it('should get country boundary layer successfully', async () => {
      // Step 2: Get country boundary for visualization
      const boundaryResponse = await request(BASE_URL)
        .post('/api/get-country-boundary')
        .send({ country_name: testCountry })
        .expect(200);

      expect(boundaryResponse.body.success).toBe(true);
      expect(boundaryResponse.body.tile_url).toBeDefined();
      expect(boundaryResponse.body.country_name).toBe(testCountry);
      expect(boundaryResponse.body.layer_type).toBe('boundary');

      console.log(`Country boundary URL generated for: ${testCountry}`);
    });

    it('should perform analysis and store results in database', async () => {
      // Step 3: Execute analysis for the country
      const analysisResponse = await request(BASE_URL)
        .post('/api/analyze-from-asset')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ country_name: testCountry })
        .expect(200);

      expect(analysisResponse.body.success).toBe(true);
      expect(analysisResponse.body.data).toBeDefined();

      const analysisData = analysisResponse.body.data;
      
      // Verify analysis result structure
      expect(analysisData.country_name).toBe(testCountry);
      expect(analysisData.asset_id).toBeDefined();
      expect(analysisData.resolution).toBeDefined();
      expect(analysisData.analysis_id).toBeDefined();
      
      // Verify population coverage data exists
      expect(analysisData).toHaveProperty('coverage_15min');
      expect(analysisData).toHaveProperty('coverage_30min');
      expect(analysisData).toHaveProperty('coverage_60min');
      expect(analysisData).toHaveProperty('total_population');

      // Verify data types and ranges
      expect(typeof analysisData.coverage_15min).toBe('number');
      expect(typeof analysisData.coverage_30min).toBe('number');
      expect(typeof analysisData.coverage_60min).toBe('number');
      expect(typeof analysisData.total_population).toBe('number');

      // Coverage percentages should be reasonable
      expect(analysisData.coverage_15min).toBeGreaterThanOrEqual(0);
      expect(analysisData.coverage_15min).toBeLessThanOrEqual(100);
      expect(analysisData.coverage_30min).toBeGreaterThanOrEqual(analysisData.coverage_15min);
      expect(analysisData.coverage_60min).toBeGreaterThanOrEqual(analysisData.coverage_30min);

      analysisId = analysisData.analysis_id;
      console.log(`Analysis completed for ${testCountry}, ID: ${analysisId}`);
    });

    it('should retrieve analysis tile URL for visualization', async () => {
      // Step 4: Get tile URL for map visualization
      const analysisResponse = await request(BASE_URL)
        .post('/api/analyze-from-asset')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ country_name: testCountry });

      const assetId = analysisResponse.body.data.asset_id;

      const tileResponse = await request(BASE_URL)
        .post('/api/get-tile-url')
        .send({ 
          asset_id: assetId,
          layer_type: 'travel_time'
        })
        .expect(200);

      expect(tileResponse.body.success).toBe(true);
      expect(tileResponse.body.tile_url).toBeDefined();
      expect(tileResponse.body.asset_id).toBe(assetId);
      expect(tileResponse.body.layer_type).toBe('travel_time');

      console.log('Analysis tile URL generated successfully');
    });

    it('should fetch user analysis history', async () => {
      // Step 5: Verify analysis appears in user history
      const historyResponse = await request(BASE_URL)
        .get('/api/analysis/history')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(historyResponse.body.success).toBe(true);
      expect(historyResponse.body.data).toBeInstanceOf(Array);
      expect(historyResponse.body.total).toBeGreaterThan(0);

      // Find our analysis in the history
      const ourAnalysis = historyResponse.body.data.find(
        (analysis: any) => analysis.id === analysisId
      );

      expect(ourAnalysis).toBeDefined();
      expect(ourAnalysis.country).toBe(testCountry);
      expect(ourAnalysis.analysis_time).toBeDefined();
      expect(ourAnalysis.total_population).toBeDefined();
      expect(ourAnalysis.population_15min_percent).toBeDefined();
      expect(ourAnalysis.population_30min_percent).toBeDefined();
      expect(ourAnalysis.population_60min_percent).toBeDefined();

      console.log(`Found analysis in history: ${ourAnalysis.analysis_time}`);
    });

    it('should retrieve specific analysis details', async () => {
      // Step 6: Get detailed analysis record
      const detailResponse = await request(BASE_URL)
        .get(`/api/analysis/${analysisId}`)
        .expect(200);

      expect(detailResponse.body.success).toBe(true);
      expect(detailResponse.body.data.id).toBe(analysisId);
      expect(detailResponse.body.data.country).toBe(testCountry);
      expect(detailResponse.body.data.analysis_time).toBeDefined();
      expect(detailResponse.body.data.population_15min_percent).toBeDefined();
      expect(detailResponse.body.data.population_30min_percent).toBeDefined();
      expect(detailResponse.body.data.population_60min_percent).toBeDefined();

      console.log('Analysis detail retrieval successful');
    });
  });

  describe('Analysis Error Handling', () => {
    it('should handle invalid country name gracefully', async () => {
      const invalidResponse = await request(BASE_URL)
        .post('/api/analyze-from-asset')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ country_name: 'NonExistentCountry123' })
        .expect(404);

      expect(invalidResponse.body.detail).toContain('Country boundary not found');
    });

    it('should require authentication for analysis', async () => {
      await request(BASE_URL)
        .post('/api/analyze-from-asset')
        .send({ country_name: testCountry })
        .expect(403); // No authorization header
    });

    it('should validate country name parameter', async () => {
      const emptyNameResponse = await request(BASE_URL)
        .post('/api/analyze-from-asset')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ country_name: '' })
        .expect(400);

      expect(emptyNameResponse.body.detail).toBe('Country name required');
    });

    it('should handle missing asset gracefully', async () => {
      // Try analysis with a country that doesn't have pre-computed assets
      const missingAssetResponse = await request(BASE_URL)
        .post('/api/analyze-from-asset')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ country_name: 'Vatican City' }) // Small country unlikely to have assets
        .expect(404);

      expect(missingAssetResponse.body.detail).toContain('Asset not found');
      expect(missingAssetResponse.body.detail).toContain('Please run batch processing first');
    });
  });

  describe('Data Consistency Verification', () => {
    it('should maintain consistent data across multiple requests', async () => {
      // Run same analysis multiple times and verify consistency
      const requests = Array(2).fill(null).map(() =>
        request(BASE_URL)
          .post('/api/analyze-from-asset')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ country_name: testCountry })
      );

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach((response: any) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Data should be consistent (same asset_id, resolution)
      const firstData = responses[0].body.data;
      const secondData = responses[1].body.data;

      expect(firstData.asset_id).toBe(secondData.asset_id);
      expect(firstData.resolution).toBe(secondData.resolution);
      expect(firstData.country_name).toBe(secondData.country_name);
    });

    it('should verify analysis results are reasonable', async () => {
      const analysisResponse = await request(BASE_URL)
        .post('/api/analyze-from-asset')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ country_name: testCountry });

      const data = analysisResponse.body.data;

      // Sanity checks for analysis results
      expect(data.total_population).toBeGreaterThan(0);
      expect(data.resolution).toBeGreaterThan(0);
      
      // Coverage should increase with time (15min <= 30min <= 60min)
      expect(data.coverage_30min).toBeGreaterThanOrEqual(data.coverage_15min);
      expect(data.coverage_60min).toBeGreaterThanOrEqual(data.coverage_30min);
      
      // Asset ID should follow expected format
      expect(data.asset_id).toContain('projects/halogen-plasma-465713-t3/assets/accessibility_analysis');
      expect(data.asset_id).toContain(testCountry.replace(' ', '_'));
    });
  });
});