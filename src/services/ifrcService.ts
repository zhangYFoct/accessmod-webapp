// src/services/ifrcService.ts
import axios from 'axios';

export interface IFRCFacility {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type_code: number;
  type_name: string;
  health_facility_type?: string;
  address: string;
  country_name: string;
  country_iso: string;
  country_iso3: string;
}

export interface IFRCCountryInfo {
  name: string;
  iso: string;
  iso3: string;
  facility_count: number;
  region?: number;
}

// Facility type mapping
export const FACILITY_TYPES = {
  1: { name: 'Administrative', color: '#ff6b6b' },
  2: { name: 'Health Care', color: '#4ecdc4' },
  3: { name: 'Emergency Response', color: '#ff9f43' },
  4: { name: 'Humanitarian Assistance Centres', color: '#45b7d1' },
  5: { name: 'Training and Education', color: '#26de81' },
  6: { name: 'Other', color: '#a55eea' },
} as const;

// Region mapping
export const IFRC_REGIONS = {
  0: { name: 'Africa', color: '#ff6b35' },
  1: { name: 'Americas', color: '#4ecdc4' }, 
  2: { name: 'Asia Pacific', color: '#45b7d1' },
  3: { name: 'Europe', color: '#f9ca24' },
  4: { name: 'Middle East & North Africa', color: '#6c5ce7' }
} as const;

export class IFRCService {
  private apiClient: ReturnType<typeof axios.create>;
  private cache: Map<string, any> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache
  
  private allFacilities: IFRCFacility[] = [];
  private allCountries: IFRCCountryInfo[] = [];
  private dataLoaded = false;

  constructor() {
    this.apiClient = axios.create({
      baseURL: 'https://goadmin.ifrc.org/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, data);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_DURATION);
  }

  private getCache(key: string): any | null {
    const expiry = this.cacheExpiry.get(key);
    if (expiry && Date.now() > expiry) {
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
      return null;
    }
    return this.cache.get(key) || null;
  }

  // Load all data at once
  private async loadAllData(): Promise<void> {
    if (this.dataLoaded) return;

    const cacheKey = 'all_ifrc_data';
    const cached = this.getCache(cacheKey);
    if (cached) {
      this.allFacilities = cached.facilities;
      this.allCountries = cached.countries;
      this.dataLoaded = true;
      return;
    }

    try {
      console.log('Loading all IFRC local units data...');
      
      const response = await this.apiClient.get('/v2/public-local-units/', {
        params: {
          limit: 50000,  // 增加到50000，应该能覆盖全球数据
          validated: true
        }
      });

      const units = response.data.results || [];
      const facilities: IFRCFacility[] = [];
      const seenIds = new Set<string>();
      const seenLocations = new Set<string>();
      const countriesMap = new Map<string, IFRCCountryInfo>();

      units.forEach((unit: any) => {
        const countryDetails = unit.country_details;
        const coords = unit.location_geojson?.coordinates;
        
        if (!countryDetails || !coords || coords.length !== 2) return;
        
        const [lon, lat] = coords;
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

        const typeCode = unit.type_details?.code;
        const countryKey = countryDetails.iso3 || countryDetails.name;

        // Skip if we've already seen this ID
        const facilityId = String(unit.id);
        if (seenIds.has(facilityId)) return;

        // Skip if we've seen this exact location with same name (same lat,lon + country + name)
        const facilityName = unit.local_branch_name || unit.english_branch_name || 'Unknown';
        const locationKey = `${lat.toFixed(6)},${lon.toFixed(6)},${countryDetails.name},${facilityName}`;
        if (seenLocations.has(locationKey)) return;

        seenIds.add(facilityId);
        seenLocations.add(locationKey);

        // Create facility record
        const facility: IFRCFacility = {
          id: facilityId,
          name: unit.english_branch_name || unit.local_branch_name || 'Unknown',
          latitude: lat,
          longitude: lon,
          type_code: typeCode,
          type_name: FACILITY_TYPES[typeCode as keyof typeof FACILITY_TYPES]?.name || unit.type_details?.name || 'Unknown',
          address: unit.address_en || unit.address_loc || 'Unknown',
          country_name: countryDetails.name,
          country_iso: countryDetails.iso || '',
          country_iso3: countryDetails.iso3 || ''
        };

        // If it's Health Care type, get specific type
        if (typeCode === 2 && unit.health_details?.health_facility_type_details?.name) {
          facility.health_facility_type = unit.health_details.health_facility_type_details.name;
        }

        facilities.push(facility);

        // Count country information
        if (!countriesMap.has(countryKey)) {
          countriesMap.set(countryKey, {
            name: countryDetails.name,
            iso: countryDetails.iso || '',
            iso3: countryDetails.iso3 || '',
            facility_count: 1
          });
        } else {
          countriesMap.get(countryKey)!.facility_count++;
        }
      });

      this.allFacilities = facilities;
      this.allCountries = Array.from(countriesMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      this.dataLoaded = true;

      console.log(`Loaded ${facilities.length} facilities across ${this.allCountries.length} countries`);

      // Cache results
      this.setCache(cacheKey, {
        facilities: this.allFacilities,
        countries: this.allCountries
      });

    } catch (error: any) {
      console.error('Failed to load IFRC data:', error);
      throw new Error(`Failed to load data: ${error.message}`);
    }
  }

  // Get all countries with facilities
  async getCountriesWithFacilities(): Promise<IFRCCountryInfo[]> {
    await this.loadAllData();
    return this.allCountries;
  }

  // Get facilities by country name
  async getFacilitiesByCountry(countryName: string): Promise<IFRCFacility[]> {
    await this.loadAllData();
    return this.allFacilities.filter(facility => 
      facility.country_name === countryName
    );
  }

  // Get all facilities
  async getAllFacilities(): Promise<IFRCFacility[]> {
    await this.loadAllData();
    return this.allFacilities;
  }

  // Filter facilities by type
  async getFacilitiesByType(typeCode: number): Promise<IFRCFacility[]> {
    await this.loadAllData();
    return this.allFacilities.filter(facility => 
      facility.type_code === typeCode
    );
  }

  // Search facilities (name only)
  async searchFacilities(searchTerm: string, countryName?: string): Promise<IFRCFacility[]> {
    await this.loadAllData();
    
    let facilities = countryName ? 
      this.allFacilities.filter(f => f.country_name === countryName) : 
      this.allFacilities;

    if (!searchTerm.trim()) return facilities;

    const term = searchTerm.toLowerCase();
    return facilities.filter(facility =>
      facility.name.toLowerCase().includes(term)
    );
  }

  // Helper methods
  private extractCityFromAddress(address: string): string {
    if (!address) return '';
    const parts = address.split(',');
    return parts[parts.length - 2]?.trim() || parts[0]?.trim() || '';
  }

  private extractProvinceFromAddress(address: string): string {
    if (!address) return '';
    const parts = address.split(',');
    return parts[parts.length - 1]?.trim() || '';
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
    this.dataLoaded = false;
    this.allFacilities = [];
    this.allCountries = [];
  }
}

export const ifrcService = new IFRCService();

// Helper functions
export const getRegionInfo = (regionId: number) => {
  return IFRC_REGIONS[regionId as keyof typeof IFRC_REGIONS] || { 
    name: 'Unknown Region', 
    color: 'grey'
  };
};