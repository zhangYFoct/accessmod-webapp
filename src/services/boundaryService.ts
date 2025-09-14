// Boundary service to load and manage country boundary data from GeoJSON
export interface CountryBoundary {
  name: string;
  iso2: string;
  iso3: string;
  geometry: any; // GeoJSON geometry for map display
  properties: any; // Full properties from GeoJSON
}

export class BoundaryService {
  private static boundaryData: any = null;
  private static cache = new Map<string, CountryBoundary>();

  /**
   * Load boundary data from local GeoJSON file
   */
  static async loadBoundaryData() {
    if (this.boundaryData) return this.boundaryData;
    
    try {
      const response = await fetch('/geo/ne_countries_110m.geojson');
      if (!response.ok) {
        throw new Error(`Failed to fetch boundary data: ${response.statusText}`);
      }
      
      this.boundaryData = await response.json();
      console.log(`Loaded ${this.boundaryData.features?.length || 0} country boundaries`);
      return this.boundaryData;
    } catch (error) {
      console.error('Failed to load country boundary data:', error);
      throw error;
    }
  }

  /**
   * Get boundary data for a specific country
   * Supports fuzzy matching for country names
   */
  static async getCountryBoundary(countryName: string): Promise<CountryBoundary | null> {
    // Check cache first
    const cacheKey = countryName.toLowerCase().trim();
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) || null;
    }

    try {
      const data = await this.loadBoundaryData();
      
      // Try exact name match first
      let feature = data.features.find((f: any) => 
        f.properties.name === countryName
      );

      // If no exact match, try case-insensitive match
      if (!feature) {
        feature = data.features.find((f: any) => 
          f.properties.name.toLowerCase() === countryName.toLowerCase()
        );
      }

      // If still no match, try partial matching for common name variations
      if (!feature) {
        feature = data.features.find((f: any) => {
          const name = f.properties.name.toLowerCase();
          const searchName = countryName.toLowerCase();
          
          // Handle common name variations
          return (
            name.includes(searchName) || 
            searchName.includes(name) ||
            this.matchCommonVariations(name, searchName)
          );
        });
      }

      if (feature) {
        const boundary: CountryBoundary = {
          name: feature.properties.name,
          iso2: feature.properties['ISO3166-1-Alpha-2'] || '',
          iso3: feature.properties['ISO3166-1-Alpha-3'] || '',
          geometry: feature.geometry,
          properties: feature.properties
        };

        // Cache the result
        this.cache.set(cacheKey, boundary);
        return boundary;
      }

      console.warn(`Country boundary not found for: ${countryName}`);
      return null;
    } catch (error) {
      console.error(`Failed to get boundary for ${countryName}:`, error);
      return null;
    }
  }

  /**
   * Get all available countries from boundary data
   */
  static async getAllCountries(): Promise<CountryBoundary[]> {
    try {
      const data = await this.loadBoundaryData();
      
      return data.features.map((feature: any) => ({
        name: feature.properties.name,
        iso2: feature.properties['ISO3166-1-Alpha-2'] || '',
        iso3: feature.properties['ISO3166-1-Alpha-3'] || '',
        geometry: feature.geometry,
        properties: feature.properties
      })).sort((a: CountryBoundary, b: CountryBoundary) => 
        a.name.localeCompare(b.name)
      );
    } catch (error) {
      console.error('Failed to get all countries:', error);
      return [];
    }
  }

  /**
   * Handle common country name variations
   */
  private static matchCommonVariations(geoName: string, searchName: string): boolean {
    const variations: Record<string, string[]> = {
      'united states of america': ['usa', 'united states', 'us', 'america'],
      'united kingdom': ['uk', 'great britain', 'britain', 'england'],
      'russian federation': ['russia'],
      'china': ['peoples republic of china', 'prc'],
      'south korea': ['republic of korea', 'korea south'],
      'north korea': ['democratic peoples republic of korea', 'korea north'],
      'democratic republic of the congo': ['congo drc', 'dr congo', 'zaire'],
      'republic of the congo': ['congo', 'congo republic'],
      'czech republic': ['czechia'],
      'myanmar': ['burma'],
      'east timor': ['timor-leste'],
      'macedonia': ['north macedonia', 'fyrom']
    };

    // Check if either name matches any variation
    for (const [canonical, alts] of Object.entries(variations)) {
      if (canonical.includes(geoName) || geoName.includes(canonical)) {
        return alts.some(alt => 
          alt.includes(searchName) || searchName.includes(alt)
        );
      }
      
      if (canonical.includes(searchName) || searchName.includes(canonical)) {
        return alts.some(alt => 
          alt.includes(geoName) || geoName.includes(alt)
        );
      }

      if (alts.some(alt => alt.includes(geoName) || geoName.includes(alt))) {
        return alts.some(alt => 
          alt.includes(searchName) || searchName.includes(alt)
        );
      }
    }

    return false;
  }

  /**
   * Clear the boundary data cache
   */
  static clearCache(): void {
    this.cache.clear();
    this.boundaryData = null;
  }
}