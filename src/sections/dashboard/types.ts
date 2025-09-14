export interface Project {
  id: string;
  country: string;
  countryCode: string;
  flag: string;
  region?: string;
  createdAt: Date;
  lastAccessed: Date;
  analysisCount: number;
  status: 'active' | 'inactive';
  dataStatus: {
    landcover: boolean;
    roads: boolean;
    facilities: boolean;
    dem: boolean;
  };
}