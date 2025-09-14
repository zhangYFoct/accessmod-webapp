// src/sections/analysis/types.ts 

export interface AnalysisConfig {
  landcover: string;
  scenario: string;
  analysisType: 'isotropic' | 'anisotropic';
  direction: 'from_facilities' | 'to_facilities';
  maxTime: number;
  useKnightsMove: boolean;
  shortTags: string;
  facilities: string;
}

export interface AnalysisResults {
  accessibility: 'analysis_complete' | 'analysis_pending' | 'analysis_failed';
  coverage: number;
  timestamp: Date;
  mapData: string;
  totalFacilities?: number;
  averageAccessTime?: number;
  populationCovered?: number;
  analysisId?: string;
  isBackendAnalysis?: boolean; // Indicates whether it's backend analysis
}

// Hospital interface (unchanged)
export interface Hospital {
  id: number;
  name: string;
  nameEn?: string;
  address: string;
  city: string;
  province: string;
  country: string;
  phone?: string;
  email?: string;
  latitude: number;
  longitude: number;
  hospitalType: string;
  level?: string;
  bedCount?: number;
  isEmergency: boolean;
  is24h: boolean;
  redcrossCertified: boolean;
  status: 'active' | 'inactive' | 'closed';
  description?: string;
  departments?: Array<{
    id: number;
    name: string;
    nameEn?: string;
    isFeatured: boolean;
  }>;
  services?: Array<{
    id: number;
    name: string;
    nameEn?: string;
    category?: string;
    operatingHours?: string;
    isAvailable: boolean;
  }>;
  contacts?: Array<{
    id: number;
    contactType: string;
    name?: string;
    phone?: string;
    email?: string;
    department?: string;
    isPrimary: boolean;
  }>;
}
