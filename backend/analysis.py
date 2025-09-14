# backend/analysis.py
import ee
import requests
import traceback
import math
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

class IFRCDataAPI:
    def __init__(self):
        self.base_url = "https://goadmin.ifrc.org/api/v2"
        self.session = requests.Session()
        self.session.headers.update({'User-Agent': 'Healthcare-Accessibility-Analysis/1.0'})

    def get_countries_with_facilities(self):
        try:
            response = self.session.get(f"{self.base_url}/public-local-units/", params={'limit': 50000}, timeout=30)
            response.raise_for_status()
            countries, facilities_by_country = {}, {}
            for unit in response.json().get('results', []):
                if unit.get('type_details', {}).get('code') == 2 and unit.get('country_details'):
                    country_name = unit['country_details']['name']
                    if country_name not in countries:
                        countries[country_name] = unit['country_details']
                    
                    # Check if coordinates are valid
                    if len(unit.get('location_geojson', {}).get('coordinates', [])) == 2:
                        lon, lat = unit['location_geojson']['coordinates']
                        if -90 <= lat <= 90 and -180 <= lon <= 180:
                            if country_name not in facilities_by_country: 
                                facilities_by_country[country_name] = []
                            facilities_by_country[country_name].append({
                                'id': unit.get('id'), 
                                'name': unit.get('local_branch_name', 'Unknown'), 
                                'latitude': float(lat), 
                                'longitude': float(lon)
                            })
            
            print(f"Found {len(countries)} countries with type=2 health facilities from IFRC GO")
            return countries, facilities_by_country
        except Exception as e:
            print(f"Failed to get country list: {e}")
            return {}, {}

def get_country_boundary(country_name):
    """Get country boundary from GEE with name mapping"""
    # Country name mapping for GEE dataset
    name_mapping = {
        'Syrian Arab Republic': 'Syria',
        'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
        'Central African Republic': 'Central African Rep',
        'Congo': 'Rep of the Congo',
        'Czech Republic': 'Czechia',
        'Republic of Korea': 'Korea, South',
        'Myanmar': 'Burma',
        'Palestine': 'West Bank',
        'Trinidad and Tobago': 'Trinidad & Tobago',
        'Tanzania, United Republic of': 'Tanzania'
    }
    
    # Try mapped name first
    mapped_name = name_mapping.get(country_name, country_name)
    
    country = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017').filter(ee.Filter.eq('country_na', mapped_name))
    if country.size().getInfo() > 0:
        print(f"Successfully retrieved country boundary: {country_name}")
        return country.first()
    
    # If mapped name fails, try original name
    if mapped_name != country_name:
        country = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017').filter(ee.Filter.eq('country_na', country_name))
        if country.size().getInfo() > 0:
            print(f"Successfully retrieved country boundary: {country_name}")
            return country.first()
    
    print(f"Error: Unable to find country '{country_name}' in GEE dataset")
    return None

def get_ifrc_facilities(country_name, facilities_by_country):
    facilities = facilities_by_country.get(country_name, [])
    if not facilities: return None
    print(f"Found {len(facilities)} type=2 health facilities in {country_name}")
    features = [ee.Feature(ee.Geometry.Point([f['longitude'], f['latitude']]), {'facility_id': f['id']}) for f in facilities]
    return ee.FeatureCollection(features)

# --- Core Analysis Functions ---
def get_optimal_resolution_by_area(country_geometry):
    # Calculate country area (square meters)
    area_sq_m = country_geometry.area().getInfo()
    area_sq_km = area_sq_m / 1e6  # Convert to square kilometers

    # Categorize by area
    if area_sq_km > 2000000:  # Greater than 2 million square kilometers
        resolution = 8000
        tier = "Large"
    elif area_sq_km > 200000:  # 200k-2 million square kilometers
        resolution = 6000
        tier = "Medium"
    else:  # Less than 200k square kilometers
        resolution = 4000
        tier = "Small"

    print(f"Country area: {area_sq_km:,.0f} square kilometers")
    print(f"Classification: {tier} country")
    print(f"Selected resolution: {resolution} meters")
    
    return resolution

# Modified build_analysis_grid function to support automatic resolution selection
def build_analysis_grid(country_geometry, fixed_scale=None):
    """
    Build unified UTM analysis grid
    If fixed_scale is None, automatically select resolution based on country area
    """
    if fixed_scale is None:
        # Automatically select resolution
        fixed_scale = get_optimal_resolution_by_area(country_geometry)
    
    centroid = country_geometry.centroid().coordinates()
    lon, lat = ee.Number(centroid.get(0)), ee.Number(centroid.get(1))
    utm_zone = lon.add(180).divide(6).int().add(1)
    crs_string = ee.Algorithms.If(lat.gte(0), ee.String('EPSG:326').cat(utm_zone.format('%02d')), ee.String('EPSG:327').cat(utm_zone.format('%02d')))
    analysis_proj = ee.Projection(crs_string).atScale(fixed_scale)
    return analysis_proj, fixed_scale, crs_string

# =============================================================================
# Function 1: Load Road Network
# =============================================================================

def load_osm_roads(country_geometry):
    """Load OSM roads from GRIP4 dataset (remove projection processing, only return FeatureCollection)"""
    try:
        print("  a. Loading OSM road network...")
        
        road_datasets = [
            'projects/sat-io/open-datasets/GRIP4/Central-South-America',
            'projects/sat-io/open-datasets/GRIP4/North-America', 
            'projects/sat-io/open-datasets/GRIP4/Europe',
            'projects/sat-io/open-datasets/GRIP4/Africa',
            'projects/sat-io/open-datasets/GRIP4/South-East-Asia',
            'projects/sat-io/open-datasets/GRIP4/Oceania',
            'projects/sat-io/open-datasets/GRIP4/Middle-East-Central-Asia'
        ]
        
        simplified_geometry = country_geometry.simplify(maxError=1000)
        
        roads_fc = None
        for road_dataset in road_datasets:
            try:
                print(f"     > Trying region: {road_dataset.split('/')[-1]}...")
                roads_candidate = ee.FeatureCollection(road_dataset)
                roads_in_country = roads_candidate.filterBounds(simplified_geometry)
                roads_in_country.first().toDictionary(['GP_RTP']).getInfo()
                
                roads_fc = roads_in_country
                print(f"     > Successfully found road network in {road_dataset.split('/')[-1]}!")
                break
            except Exception:
                continue
        
        if roads_fc is None:
            print("   Warning: No valid OSM road network data found.")
            return None, None, None
        
        # Classify roads into major and others (only return FeatureCollection, no rasterization and projection)
        major_roads = roads_fc.filter(ee.Filter.inList('GP_RTP', [1, 2]))    # Highways + Primary roads
        medium_roads = roads_fc.filter(ee.Filter.inList('GP_RTP', [3, 4]))   # Secondary + Tertiary roads
        minor_roads = roads_fc.filter(ee.Filter.eq('GP_RTP', 5))             # Local roads
        
        print("  b. Road network loaded and classified.")
        return major_roads, medium_roads, minor_roads  # Return FeatureCollection, not rasters
        
    except Exception as e:
        print(f"  > Error during road network loading: {e}")
        return None, None, None

def create_friction_surface(country_geometry, analysis_proj):
    """Create friction surface (only modify projection handling)"""
    print("1. Creating base friction from land cover...")
    
    # Immediately force projection to target grid
    worldcover = ee.ImageCollection('ESA/WorldCover/v100').first()
    landcover = worldcover.clip(country_geometry)
    landcover_projected = landcover.reproject(analysis_proj)
    
    speed_kmh = landcover_projected.remap(
        [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100], 
        [3, 5, 6, 10, 15, 5, 2, 0, 3, 2, 4],
        0
    )
    base_friction = speed_kmh.expression('1.0 / ((speed * 1000) / 60)', {'speed': speed_kmh}).updateMask(speed_kmh.gt(0))

    print("2. Loading road network and updating friction...")
    # Road network loading doesn't pass analysis_proj parameter
    major_roads_fc, medium_roads_fc, minor_roads_fc = load_osm_roads(country_geometry)
    
    friction_with_roads = base_friction
    if all(roads is not None for roads in [major_roads_fc, medium_roads_fc, minor_roads_fc]):
        # Uniformly handle all road network rasterization and projection here
        major_raster = major_roads_fc.reduceToImage(['GP_RTP'], ee.Reducer.first()).gt(0).reproject(analysis_proj)
        medium_raster = medium_roads_fc.reduceToImage(['GP_RTP'], ee.Reducer.first()).gt(0).reproject(analysis_proj)
        minor_raster = minor_roads_fc.reduceToImage(['GP_RTP'], ee.Reducer.first()).gt(0).reproject(analysis_proj)
        
        major_speed = 50
        medium_speed = 30
        minor_speed = 25
        
        major_friction = 1 / ((major_speed * 1000) / 60)
        medium_friction = 1 / ((medium_speed * 1000) / 60)
        minor_friction = 1 / ((minor_speed * 1000) / 60)
        
        friction_with_roads = friction_with_roads.where(minor_raster, minor_friction)
        friction_with_roads = friction_with_roads.where(medium_raster, medium_friction)
        friction_with_roads = friction_with_roads.where(major_raster, major_friction)
        
        print(f"   Road speed settings: Major roads {major_speed} km/h, Medium roads {medium_speed} km/h, Local roads {minor_speed} km/h")

    print("3. Adding slope effects...")
    # Immediately force project DEM
    dem = ee.Image('USGS/SRTMGL1_003').clip(country_geometry)
    dem_projected = dem.reproject(analysis_proj)
    slope = ee.Terrain.slope(dem_projected)
    slope_factor = slope.multiply(0.05).add(1.0)
    
    final_friction = friction_with_roads.multiply(slope_factor)
    
    # Ensure final result is in target projection
    final_friction = final_friction.setDefaultProjection(analysis_proj)
    
    print("Friction surface creation complete (including road network).")
    return final_friction, landcover_projected, dem_projected, slope

def calculate_accessibility(friction_surface, facilities, max_time_minutes=60, analysis_proj=None):
    """Calculate accessibility map - Fixed version (added buffer and unmask handling)"""
    print("3. Calculating travel time...")
    
    # Get analysis scale
    try:
        analysis_scale = analysis_proj.nominalScale().getInfo() if analysis_proj else 6000
    except:
        analysis_scale = 6000
    
    # 1. Buffer handling - ensure facility points are not lost during rasterization
    fac_fc = ee.FeatureCollection(facilities)
    buff_m = ee.Number(analysis_scale).multiply(1.5)   # 1.5 pixel buffer
    fac_buffered = fac_fc.map(lambda f: ee.Feature(f).buffer(buff_m))
    
    # 2. Use paint method instead of reduceToImage - more stable
    facility_image = (ee.Image(0).toByte()
        .paint(fac_buffered, 1)
        .setDefaultProjection(analysis_proj))
    
    # 3. Friction surface unmask handling - ensure connectivity, avoid "island" problems
    friction_safe = friction_surface.unmask(0.12).setDefaultProjection(analysis_proj)
    cost_sec_per_m = friction_safe.multiply(60)
    
    # Fixed distance limit
    max_dist = 100000  # 100km
    
    travel_time_sec = cost_sec_per_m.cumulativeCost(
        source=facility_image, 
        maxDistance=max_dist
    )
    
    accessibility = travel_time_sec.divide(60).setDefaultProjection(analysis_proj)
    print("Travel time calculation complete.")
    return accessibility.updateMask(accessibility.lte(max_time_minutes))

# =============================================================================
# Function 2: Calculate Population Coverage
# =============================================================================

def _tiles_over_bbox(country_geom, step_deg=1.0):
    """Generates a grid of tiles over the country's bounding box."""
    bbox = country_geom.bounds(ee.ErrorMargin(1000))
    coords = ee.List(bbox.coordinates().get(0))
    min_lon = ee.Number(coords.map(lambda p: ee.List(p).get(0)).reduce(ee.Reducer.min()))
    max_lon = ee.Number(coords.map(lambda p: ee.List(p).get(0)).reduce(ee.Reducer.max()))
    min_lat = ee.Number(coords.map(lambda p: ee.List(p).get(1)).reduce(ee.Reducer.min()))
    max_lat = ee.Number(coords.map(lambda p: ee.List(p).get(1)).reduce(ee.Reducer.max()))
    lons = ee.List.sequence(min_lon, max_lon, step_deg)
    lats = ee.List.sequence(min_lat, max_lat, step_deg)
    tiles = lats.map(lambda y: lons.map(lambda x: ee.Feature(ee.Geometry.Rectangle([x, y, ee.Number(x).add(step_deg), ee.Number(y).add(step_deg)], None, False)))).flatten()
    return ee.FeatureCollection(tiles).filterBounds(country_geom)

def _tiled_sum(stacked_img, country_geom, target_proj, target_scale_m):
    """Calculates the sum of image pixels over a set of tiles."""
    tiles = _tiles_over_bbox(country_geom)
    
    def aggregate_tile(tile):
        sum_dict = stacked_img.reduceRegion(
            reducer=ee.Reducer.sum(),
            geometry=tile.geometry(),
            scale=target_scale_m,
            crs=target_proj,
            bestEffort=True,
            maxPixels=1e13
        )
        return tile.set(sum_dict)
    
    tile_sums_fc = tiles.map(aggregate_tile)
    band_names = stacked_img.bandNames()
    
    def sum_over_tiles(band_name, prev_dict):
        sum_val = tile_sums_fc.aggregate_sum(band_name)
        return ee.Dictionary(prev_dict).set(band_name, sum_val)
    
    return ee.Dictionary(band_names.iterate(sum_over_tiles, ee.Dictionary()))

def get_population_stats(accessibility_map, country_geometry, analysis_proj, analysis_scale, time_thresholds=[15, 30, 60]):
    """
    Population statistics function: Calculate k value and conservative resolution here
    """
    print("Beginning population analysis (K-Calculated Version)...")
    
    country_geom = country_geometry.geometry().dissolve(maxError=1000)
    
    # Calculate country area, decide whether tiling is needed
    area_km2 = float(country_geom.area().divide(1e6).getInfo())
    use_tiling = area_km2 > 500_000
    
    print("  a. Loading GPW population data...")
    pop_img = ee.Image("CIESIN/GPWv411/GPW_Population_Count/gpw_v4_population_count_rev11_2020_30_sec").select('population_count').unmask(0)
    
    # Get GPW native projection and resolution
    gpw_proj = pop_img.projection()
    native_scale = float(gpw_proj.nominalScale().getInfo())  # 927.7m
    
    print(f"  b. GPW native resolution: {native_scale:.1f}m, target resolution: {analysis_scale:.0f}m")
    
    # Step 1: Apply country mask in native projection
    pop_masked = pop_img.clip(country_geom).setDefaultProjection(gpw_proj)

    print("  b1. Calculating GPW original population at native resolution...")
    try:
        gpw_original_population = pop_masked.reduceRegion(
            reducer=ee.Reducer.sum(),
            geometry=country_geom,
            scale=native_scale,
            crs=gpw_proj,
            maxPixels=1e9,
            bestEffort=True
        ).getNumber('population_count').getInfo()
        
        gpw_original_population = int(gpw_original_population or 0)
        print(f"  > GPW Original Population (at {native_scale:.1f}m resolution): {gpw_original_population:,}")
        
    except Exception as e:
        print(f"  ERROR: Failed to get GPW original population: {e}")
        return {'total_population': 0}
    
    # Key: Calculate k value and conservative resolution here
    k = max(1, round(analysis_scale / native_scale))
    conservative_scale = k * native_scale
    conservative_proj = gpw_proj.atScale(conservative_scale)
    
    print(f"  c. Calculated k={k}, conservative resolution: {conservative_scale:.0f}m")
    print(f"  d. Country area: {area_km2:,.0f} km², using {'tiling' if use_tiling else 'direct'} method")
    
    # Check how well target resolution matches conservative resolution
    resolution_diff = abs(analysis_scale - conservative_scale)
    if resolution_diff < 50:  # 50 meter tolerance
        print(f"  > Good match: target vs conservative difference = {resolution_diff:.0f}m")
        use_target_resolution = True
        final_scale = conservative_scale  # Use conservative resolution
    else:
        print(f"  > Large difference: target vs conservative = {resolution_diff:.0f}m")
        use_target_resolution = False
        final_scale = analysis_scale  # Use target resolution
    
    # Step 2: Conservative aggregation to conservative resolution
    pop_conservative = pop_masked.reduceResolution(
        reducer=ee.Reducer.sum().unweighted(),
        maxPixels=32768
    ).reproject(crs=conservative_proj)
    
    # Step 3: Aggregated population calculation (for quality monitoring)
    print("  e. Calculating aggregated population for quality check...")
    try:
        aggregated_pop = pop_conservative.reduceRegion(
            reducer=ee.Reducer.sum(),
            geometry=country_geom,
            scale=conservative_scale,
            crs=conservative_proj,
            maxPixels=1e9,
            bestEffort=True
        ).getNumber('population_count').getInfo()
        
        aggregated_pop = int(aggregated_pop)
        population_loss = gpw_original_population - aggregated_pop
        loss_percentage = (population_loss / gpw_original_population * 100) if gpw_original_population > 0 else 0
        
        print(f"  > Aggregated Population: {aggregated_pop:,}")
        print(f"  > Population loss in aggregation: {population_loss:,} ({loss_percentage:.1f}%)")
        print(f"  > Using GPW original population ({gpw_original_population:,}) as denominator for coverage calculation")
        
    except Exception as e:
        print(f"  ERROR: Aggregation check failed: {e}")
        return {'total_population': 0}
    
    # Step 4: Prepare population layer for coverage calculation
    if use_target_resolution:
        # Use conservative resolution, only reproject coordinate system
        print(f"  f. Using conservative resolution {conservative_scale:.0f}m for coverage calculation")
        pop_final = pop_conservative.reproject(
            crs=analysis_proj,
            scale=conservative_scale
        )
        coverage_scale = conservative_scale
    else:
        # Reproject to target resolution
        print(f"  f. Reprojecting to target resolution {analysis_scale:.0f}m for coverage calculation")
        pop_final = pop_conservative.reproject(
            crs=analysis_proj,
            scale=analysis_scale
        )
        coverage_scale = analysis_scale
    
    # Apply final mask
    mask_image = ee.Image.constant(1).clip(country_geom).mask()
    pop_final = pop_final.updateMask(mask_image)
    
    stats = {
        'total_population': gpw_original_population, 
        'target_resolution': analysis_scale,
        'conservative_resolution': conservative_scale,
        'k_factor': k,
        'coverage_scale_used': coverage_scale
    }
    
    # Step 5: Coverage calculation
    if use_tiling:
        print("  g. Calculating coverage using tiling method...")
        
        coverage_bands = []
        for t in time_thresholds:
            accessibility_mask = accessibility_map.lte(t)
            pop_within_t_image = pop_final.updateMask(accessibility_mask)
            coverage_bands.append(pop_within_t_image.rename(f'pop_within_{t}min'))
        
        stacked = ee.Image.cat(coverage_bands)
        coverage_results = _tiled_sum(stacked, country_geom, analysis_proj, coverage_scale).getInfo()
        
        for t in time_thresholds:
            n = int(coverage_results.get(f'pop_within_{t}min', 0) or 0)
            stats[f'pop_within_{t}min'] = n
            stats[f'coverage_{t}min'] = round((n / gpw_original_population * 100), 2) if gpw_original_population > 0 else 0
            print(f"  > {t} minute coverage: {stats[f'coverage_{t}min']:.1f}% ({n:,} people)")
            
    else:
        print("  g. Calculating coverage using direct method...")
        
        for t in time_thresholds:
            print(f"     Calculating coverage for {t} minutes...")
            
            accessibility_mask = accessibility_map.lte(t)
            pop_within_t_image = pop_final.updateMask(accessibility_mask)
            
            try:
                pop_within_t = pop_within_t_image.reduceRegion(
                    reducer=ee.Reducer.sum(),
                    geometry=country_geom,
                    scale=coverage_scale,
                    crs=analysis_proj,
                    maxPixels=1e9,
                    bestEffort=True
                ).getNumber('population_count').getInfo()
                
                n = int(pop_within_t or 0)
                stats[f'pop_within_{t}min'] = n
                stats[f'coverage_{t}min'] = round((n / gpw_original_population * 100), 2) if gpw_original_population > 0 else 0
                print(f"  > {t} minute coverage: {stats[f'coverage_{t}min']:.1f}% ({n:,} people)")
                
            except Exception as e:
                print(f"     Direct method failed for {t}min, using tiling fallback...")
                accessibility_mask = accessibility_map.lte(t)
                pop_within_t_image = pop_final.updateMask(accessibility_mask)
                result = _tiled_sum(pop_within_t_image.rename('pop_within_t'), country_geom, analysis_proj, coverage_scale).getInfo()
                n = int(result.get('pop_within_t', 0) or 0)
                stats[f'pop_within_{t}min'] = n
                stats[f'coverage_{t}min'] = round((n / gpw_original_population * 100), 2) if gpw_original_population > 0 else 0
                print(f"  > {t} minute coverage: {stats[f'coverage_{t}min']:.1f}% ({n:,} people) [tiled]")
    
    print("Population analysis complete.")
    print(f"Note: Coverage percentages calculated using GPW original population ({gpw_original_population:,}) as denominator")
    return stats

# =============================================================================
# Batch Processing for GEE Asset Export
# =============================================================================

# Configuration
CLOUD_PROJECT_ID = 'halogen-plasma-465713-t3'
MAX_TIME_MINUTES = 60
MAX_CONCURRENT_COUNTRIES = 1  # Process countries one by one for stability
MAX_RETRIES = 2

class BatchProcessor:
    def __init__(self, cloud_project_id, max_concurrent=1):
        self.cloud_project_id = cloud_project_id
        self.max_concurrent = max_concurrent
        self.completed_countries = []
        self.failed_countries = []
        self.lock = threading.Lock()
        
    def process_all_countries_automated(self):
        """
        Fully automated processing of all countries
        Uses threading to handle multiple countries simultaneously
        """
        print("=" * 80)
        print("FULLY AUTOMATED BATCH PROCESSING")
        print("=" * 80)
        
        # Get all countries
        try:
            ifrc_api = IFRCDataAPI()
            countries_data, facilities_data = ifrc_api.get_countries_with_facilities()
            
            if not countries_data:
                print("No countries with type=2 facilities found.")
                return
                
            country_list = list(countries_data.keys())
            total_countries = len(country_list)
            
            print(f"Found {total_countries} countries to process")
            print(f"Max concurrent processing: {self.max_concurrent}")
            print(f"Starting automated processing...\n")
            
        except Exception as e:
            print(f"Error getting country list: {e}")
            return
        
        # Process countries with threading
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            # Submit all countries to thread pool
            future_to_country = {
                executor.submit(
                    self._process_country_with_retries, 
                    country_name, 
                    countries_data, 
                    facilities_data
                ): country_name 
                for country_name in country_list
            }
            
            # Process completed tasks
            for future in as_completed(future_to_country):
                country_name = future_to_country[future]
                try:
                    result = future.result()
                    with self.lock:
                        if result['success']:
                            self.completed_countries.append(result)
                            status = "COMPLETED"
                        else:
                            self.failed_countries.append(result)
                            status = "FAILED"
                        
                        completed = len(self.completed_countries)
                        failed = len(self.failed_countries)
                        total_done = completed + failed
                        
                        print(f"[{total_done}/{total_countries}] {status}: {country_name}")
                        if not result['success']:
                            print(f"    Error: {result['error']}")
                        
                        # Progress update every 10 countries
                        if total_done % 10 == 0 or total_done == total_countries:
                            elapsed = time.time() - start_time
                            rate = total_done / elapsed if elapsed > 0 else 0
                            eta = (total_countries - total_done) / rate if rate > 0 else 0
                            print(f"\nProgress: {completed} success, {failed} failed")
                            print(f"Rate: {rate:.1f} countries/min, ETA: {eta/60:.1f} min\n")
                            
                except Exception as e:
                    with self.lock:
                        self.failed_countries.append({
                            'country': country_name,
                            'success': False,
                            'error': f"Thread execution error: {e}"
                        })
                        print(f"THREAD ERROR: {country_name} - {e}")
        
        # Final summary
        self._print_final_summary(start_time)
        
        return self
    
    def _process_country_with_retries(self, country_name, countries_data, facilities_data):
        """Process a single country with retry logic"""
        last_error = None
        
        for attempt in range(MAX_RETRIES + 1):
            try:
                if attempt > 0:
                    print(f"Retry {attempt}/{MAX_RETRIES}: {country_name}")
                    time.sleep(5 * attempt)  # Exponential backoff
                
                result = self._process_single_country(
                    country_name, 
                    countries_data, 
                    facilities_data
                )
                
                if result['success']:
                    return result
                else:
                    last_error = result['error']
                    if attempt < MAX_RETRIES:
                        continue
                    else:
                        return result
                        
            except Exception as e:
                last_error = str(e)
                if attempt < MAX_RETRIES:
                    continue
                else:
                    return {
                        'country': country_name,
                        'success': False,
                        'error': f"All retries failed. Last error: {last_error}"
                    }
    
    def _process_single_country(self, country_name, countries_data, facilities_data):
        """Process a single country (core logic)"""
        try:
            # Validate country exists
            if country_name not in countries_data:
                return {'country': country_name, 'success': False, 'error': 'Country not in IFRC data'}
            
            # Get country boundary
            country_boundary = get_country_boundary(country_name)
            if not country_boundary:
                return {'country': country_name, 'success': False, 'error': 'Country boundary not found'}
            
            # Get facilities
            facilities = get_ifrc_facilities(country_name, facilities_data)
            if not facilities:
                return {'country': country_name, 'success': False, 'error': 'No valid facilities'}
            
            # Analysis
            analysis_proj, resolution_meters, crs_string = build_analysis_grid(country_boundary.geometry())
            friction_surface, landcover, dem, slope = create_friction_surface(country_boundary.geometry(), analysis_proj)
            accessibility_map = calculate_accessibility(friction_surface, facilities, MAX_TIME_MINUTES, analysis_proj)
            
            # Export setup
            folder_name = 'accessibility_analysis'
            clean_country_name = country_name.replace(' ', '_').replace(',', '').replace('.', '').replace('(', '').replace(')', '')
            asset_id = f'projects/{self.cloud_project_id}/assets/{folder_name}/{clean_country_name}_travel_time_{resolution_meters}m'
            
            # Create and start export task
            export_task = ee.batch.Export.image.toAsset(
                image=accessibility_map.clip(country_boundary.geometry()),
                description=f'Accessibility_{clean_country_name}_{resolution_meters}m',
                assetId=asset_id,
                scale=resolution_meters,
                crs=analysis_proj.crs(),
                maxPixels=1e13
            )
            export_task.start()
            
            return {
                'country': country_name,
                'success': True,
                'asset_id': asset_id,
                'task_id': export_task.id,
                'resolution': resolution_meters,
                'facilities_count': len(facilities_data.get(country_name, [])),
                'crs': crs_string.getInfo() if hasattr(crs_string, 'getInfo') else str(crs_string)
            }
            
        except Exception as e:
            return {
                'country': country_name,
                'success': False,
                'error': str(e)
            }
    
    def _print_final_summary(self, start_time):
        """Print comprehensive final summary"""
        total_time = time.time() - start_time
        total_countries = len(self.completed_countries) + len(self.failed_countries)
        success_rate = len(self.completed_countries) / total_countries * 100 if total_countries > 0 else 0
        
        print("\n" + "=" * 80)
        print("AUTOMATED BATCH PROCESSING COMPLETE")
        print("=" * 80)
        print(f"Total processing time: {total_time/60:.1f} minutes")
        print(f"Countries processed: {total_countries}")
        print(f"Successful: {len(self.completed_countries)}")
        print(f"Failed: {len(self.failed_countries)}")
        print(f"Success rate: {success_rate:.1f}%")
        
        if self.completed_countries:
            print(f"\nSUCCESSFUL EXPORTS ({len(self.completed_countries)}):")
            print("-" * 60)
            for result in self.completed_countries:
                print(f"  {result['country']:<25} | {result['resolution']}m | {result['facilities_count']} facilities")
                print(f"    Asset: {result['asset_id']}")
                print(f"    Task:  {result['task_id']}")
                print()
        
        if self.failed_countries:
            print(f"\nFAILED COUNTRIES ({len(self.failed_countries)}):")
            print("-" * 60)
            for result in self.failed_countries:
                print(f"  {result['country']:<25} | {result['error']}")
        
        print(f"\nNEXT STEPS:")
        print("1. Go to https://code.earthengine.google.com/")
        print("2. Click 'Tasks' tab")
        print("3. Filter by 'Accessibility_' to find your tasks")
        print("4. Select all tasks and click 'RUN'")
        print("5. Close this notebook - GEE will process in the background")
        print("6. Check back in a few hours/days for completed results")

def run_automated_batch_processing(cloud_project_id=CLOUD_PROJECT_ID, max_concurrent=MAX_CONCURRENT_COUNTRIES):
    """
    Main function to run automated batch processing
    """
    print("Starting fully automated batch processing...")
    print("This will process ALL countries with type=2 facilities automatically.")
    print("Estimated time: 30-60 minutes to create all tasks.")
    print("\nProcessing will begin in 5 seconds. Press Ctrl+C to cancel if needed.\n")
    
    # 5 second countdown
    for i in range(5, 0, -1):
        print(f"Starting in {i}...")
        time.sleep(1)
    
    print("Starting batch processing...\n")
    
    # Run the batch processing
    batch_processor = BatchProcessor(
        cloud_project_id=cloud_project_id,
        max_concurrent=max_concurrent
    )
    
    result = batch_processor.process_all_countries_automated()
    
    print("\n" + "=" * 80)
    print("BATCH TASK CREATION COMPLETE!")
    print("=" * 80)
    print("All export tasks have been created and submitted to GEE.")
    print("You can now close this notebook.")
    print("Go to GEE Code Editor to start all tasks with one click.")
    print("=" * 80)
    
    return result

# =============================================================================
# GEE Initialization Function
# =============================================================================
def initialize_ee():
    """Initialize Google Earth Engine with service account or user authentication"""
    import os
    try:
        # Check if service account key file exists
        service_account_path = os.path.join(os.path.dirname(__file__), 'service-account-key.json')
        
        if os.path.exists(service_account_path):
            # Use service account authentication
            print("Using service account authentication...")
            credentials = ee.ServiceAccountCredentials(None, service_account_path)
            ee.Initialize(credentials, project='halogen-plasma-465713-t3')
            print("Service account authentication successful!")
        else:
            # Use user authentication (original method)
            print("Using user authentication...")
            ee.Initialize(project='halogen-plasma-465713-t3')
            print("User authentication successful!")
        
        return True
    except ee.EEException as e:
        if "Token has expired" in str(e) or "Invalid token" in str(e):
            print(f"Token expired. Please run: earthengine authenticate")
            print(f"Error details: {e}")
            return False
        else:
            print(f"EE initialization failed: {e}")
            return False
    except Exception as e:
        print(f"EE initialization failed: {e}")
        return False

def run_automated_batch_processing(cloud_project_id=CLOUD_PROJECT_ID, max_concurrent=MAX_CONCURRENT_COUNTRIES):
    """
    Main function to run automated batch processing
    """
    # Initialize GEE first
    if not initialize_ee():
        print("Failed to initialize Google Earth Engine. Exiting.")
        return None
    
    print("Starting fully automated batch processing...")
    print("This will process ALL countries with type=2 facilities automatically.")
    print("Estimated time: 30-60 minutes to create all tasks.")
    print("\nProcessing will begin in 5 seconds. Press Ctrl+C to cancel if needed.\n")
    
    # 5 second countdown
    for i in range(5, 0, -1):
        print(f"Starting in {i}...")
        time.sleep(1)
    
    print("Starting batch processing...\n")
    
    # Run the batch processing
    batch_processor = BatchProcessor(
        cloud_project_id=cloud_project_id,
        max_concurrent=max_concurrent
    )
    
    result = batch_processor.process_all_countries_automated()
    
    print("\n" + "=" * 80)
    print("BATCH TASK CREATION COMPLETE!")
    print("=" * 80)
    print("All export tasks have been created and submitted to GEE.")
    print("You can now close this notebook.")
    print("Go to GEE Code Editor to start all tasks with one click.")
    print("=" * 80)
    
    return result

# =============================================================================
# Example Usage
# =============================================================================
if __name__ == "__main__":
    # Run automated processing (GEE initialization is handled inside the function)
    result = run_automated_batch_processing()