import request from 'supertest';

const BASE_URL = process.env.TEST_BACKEND_URL || 'http://localhost:5000';

describe('Google Earth Engine Service Integration Tests', () => {
  let accessToken: string;
  
  const testUser = {
    email: `gee-test-${Date.now()}@example.com`,
    password: 'TestPassword123',
    firstName: 'GEE',
    lastName: 'Tester'
  };

  const testCountries = ['Kenya', 'Uganda', 'Tanzania']; // Countries with likely GEE data

  beforeAll(async () => {
    // Setup authenticated user for GEE tests
    const signUpResponse = await request(BASE_URL)
      .post('/api/auth/sign-up')
      .send(testUser);

    accessToken = signUpResponse.body.accessToken;
  });

  describe('GEE Initialization and Connectivity', () => {
    it('should confirm GEE is properly initialized on backend startup', async () => {
      const testResponse = await request(BASE_URL)
        .get('/api/test')
        .expect(200);

      expect(testResponse.body.success).toBe(true);
      expect(testResponse.body.message).toBe('Backend server is running');
      expect(testResponse.body.gee_initialized).toBe(true);

      console.log('GEE initialization confirmed');
    });

    it('should access IFRC data through GEE successfully', async () => {
      const countriesResponse = await request(BASE_URL)
        .get('/api/countries')
        .expect(200);

      expect(countriesResponse.body.success).toBe(true);
      expect(countriesResponse.body.countries).toBeInstanceOf(Array);
      expect(countriesResponse.body.total_countries).toBeGreaterThan(0);

      // Verify test countries are available
      const availableCountries = countriesResponse.body.countries;
      const testCountriesAvailable = testCountries.filter(country => 
        availableCountries.includes(country)
      );

      expect(testCountriesAvailable.length).toBeGreaterThan(0);
      console.log(`Available test countries: ${testCountriesAvailable.join(', ')}`);
    });
  });

  describe('Country Boundary Data Processing', () => {
    it('should retrieve and process boundary data for one test country', async () => {
      const country = testCountries[0]; // Just test one country
        const boundaryResponse = await request(BASE_URL)
          .post('/api/get-country-boundary')
          .send({ country_name: country })
          .expect(200);

        expect(boundaryResponse.body.success).toBe(true);
        expect(boundaryResponse.body.tile_url).toBeDefined();
        expect(boundaryResponse.body.country_name).toBe(country);
        expect(boundaryResponse.body.layer_type).toBe('boundary');

        // Verify tile URL structure
        const tileUrl = boundaryResponse.body.tile_url;
        expect(tileUrl).toMatch(/^https:\/\/earthengine\.googleapis\.com/);
        expect(tileUrl).toContain('{z}');
        expect(tileUrl).toContain('{x}');
        expect(tileUrl).toContain('{y}');

        console.log(`${country} boundary tile URL: ${tileUrl.substring(0, 50)}...`);
      });

    it('should handle non-existent country boundary requests', async () => {
      const invalidResponse = await request(BASE_URL)
        .post('/api/get-country-boundary')
        .send({ country_name: 'NonExistentCountry123' })
        .expect(404);

      expect(invalidResponse.body.detail).toBe('Country boundary not found');
    });

    it('should validate country name parameter for boundary requests', async () => {
      const emptyNameResponse = await request(BASE_URL)
        .post('/api/get-country-boundary')
        .send({ country_name: '' })
        .expect(400);

      expect(emptyNameResponse.body.detail).toBe('Country name required');

      const missingNameResponse = await request(BASE_URL)
        .post('/api/get-country-boundary')
        .send({})
        .expect(422); // FastAPI validation error

      expect(missingNameResponse.body.detail).toBeDefined();
    });
  });

  describe('GEE Asset Access and Tile Generation', () => {
    let validAssetId: string;
    let testCountryWithAsset: string;

    beforeAll(async () => {
      // Find a country with available assets by testing analysis
      for (const country of testCountries) {
        try {
          const analysisResponse = await request(BASE_URL)
            .post('/api/analyze-from-asset')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ country_name: country });

          if (analysisResponse.status === 200) {
            validAssetId = analysisResponse.body.data.asset_id;
            testCountryWithAsset = country;
            break;
          }
        } catch (error) {
          // Continue to next country if this one fails
          continue;
        }
      }
    });

    it('should generate tile URLs for valid GEE assets', async () => {
      if (!validAssetId) {
        console.warn('No valid asset found for tile generation test - skipping');
        return;
      }

      const tileResponse = await request(BASE_URL)
        .post('/api/get-tile-url')
        .send({
          asset_id: validAssetId,
          layer_type: 'travel_time'
        })
        .expect(200);

      expect(tileResponse.body.success).toBe(true);
      expect(tileResponse.body.tile_url).toBeDefined();
      expect(tileResponse.body.asset_id).toBe(validAssetId);
      expect(tileResponse.body.layer_type).toBe('travel_time');

      // Verify tile URL structure
      const tileUrl = tileResponse.body.tile_url;
      expect(tileUrl).toMatch(/^https:\/\/earthengine\.googleapis\.com/);
      expect(tileUrl).toContain('{z}');
      expect(tileUrl).toContain('{x}');
      expect(tileUrl).toContain('{y}');

      console.log(`Generated tile URL for ${testCountryWithAsset}: ${tileUrl.substring(0, 50)}...`);
    });


    it('should validate tile URL request parameters', async () => {
      const emptyAssetResponse = await request(BASE_URL)
        .post('/api/get-tile-url')
        .send({
          asset_id: '',
          layer_type: 'travel_time'
        })
        .expect(400);

      expect(emptyAssetResponse.body.detail).toBe('Asset ID required');

      const missingAssetResponse = await request(BASE_URL)
        .post('/api/get-tile-url')
        .send({
          layer_type: 'travel_time'
        })
        .expect(422); // FastAPI validation error

      expect(missingAssetResponse.body.detail).toBeDefined();
    });
  });


});