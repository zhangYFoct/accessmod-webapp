// src/services/ifrcProxyService.ts - Use backend proxy instead of direct IFRC API calls

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
}

// Response types for backend proxy
interface CountriesResponse {
  success: boolean;
  countries: IFRCCountryInfo[];
  total_countries: number;
}

interface FacilitiesResponse {
  success: boolean;
  country_name?: string;
  facilities: IFRCFacility[];
  total_facilities: number;
  countries_count?: number;
}

export class IFRCProxyService {
  private cache: Map<string, any> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache
  
  private allFacilities: IFRCFacility[] = [];
  private allCountries: IFRCCountryInfo[] = [];
  private dataLoaded = false;

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

  // Load all data using backend proxy
  private async loadAllData(): Promise<void> {
    if (this.dataLoaded) return;

    const cacheKey = 'all_ifrc_proxy_data';
    const cached = this.getCache(cacheKey);
    if (cached) {
      this.allFacilities = cached.facilities;
      this.allCountries = cached.countries;
      this.dataLoaded = true;
      return;
    }

    try {
      console.log('Loading IFRC data via backend proxy...');
      
      // Use backend proxy to get countries and facilities
      const [countriesResponse, facilitiesResponse] = await Promise.all([
        this.getCountriesFromProxy(),
        this.getAllFacilitiesFromProxy()
      ]);

      this.allCountries = countriesResponse.countries;
      this.allFacilities = facilitiesResponse.facilities;
      this.dataLoaded = true;

      console.log(`Loaded ${this.allFacilities.length} facilities across ${this.allCountries.length} countries via proxy`);

      // Cache results
      this.setCache(cacheKey, {
        facilities: this.allFacilities,
        countries: this.allCountries
      });

    } catch (error: any) {
      console.error('Failed to load IFRC data via proxy:', error);
      throw new Error(`Failed to load data via proxy: ${error.message}`);
    }
  }

  // Backend proxy methods
  private async getCountriesFromProxy(): Promise<CountriesResponse> {
    const response = await fetch('/api/ifrc/countries');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  private async getAllFacilitiesFromProxy(): Promise<FacilitiesResponse> {
    const response = await fetch('/api/ifrc/facilities');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }


  // Public API methods (same interface as original IFRCService)
  async getCountriesWithFacilities(): Promise<IFRCCountryInfo[]> {
    await this.loadAllData();
    return this.allCountries;
  }

  async getFacilitiesByCountry(countryName: string): Promise<IFRCFacility[]> {
    await this.loadAllData();
    return this.allFacilities.filter(facility => 
      facility.country_name === countryName
    );
  }

  async getAllFacilities(): Promise<IFRCFacility[]> {
    await this.loadAllData();
    return this.allFacilities;
  }

  async getFacilitiesByType(typeCode: number): Promise<IFRCFacility[]> {
    await this.loadAllData();
    return this.allFacilities.filter(facility => 
      facility.type_code === typeCode
    );
  }

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

  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
    this.dataLoaded = false;
    this.allFacilities = [];
    this.allCountries = [];
  }
}

export const ifrcProxyService = new IFRCProxyService();