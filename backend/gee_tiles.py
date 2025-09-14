# backend/gee_tiles.py - GEE Tile URL generation
import ee
from urllib.parse import urlencode

def create_tile_url(asset, vis_params: dict = None) -> str:
    """
    Create a tile URL for a Google Earth Engine asset or geometry
    """
    try:
        # Handle different asset types
        if isinstance(asset, str):
            # Asset ID string - load as Image
            ee_object = ee.Image(asset)
        elif hasattr(asset, 'getMapId'):
            # Already a GEE object (Image, FeatureCollection, etc.)
            ee_object = asset
        else:
            raise ValueError("Asset must be either a string (asset ID) or a GEE object")
        
        # Default visualization parameters for Images
        if vis_params is None:
            vis_params = {
                'min': 0,
                'max': 60,  # 60 minutes travel time
                'palette': ['green', 'yellow', 'orange', 'red']
            }
        
        # Get the tile URL
        map_id_dict = ee_object.getMapId(vis_params)
        tile_url_template = map_id_dict['tile_fetcher'].url_format
        
        return tile_url_template
    
    except Exception as e:
        print(f"Error creating tile URL: {e}")
        return None

def get_travel_time_vis_params():
    """Get visualization parameters for travel time analysis"""
    return {
        'min': 0,
        'max': 60,
        'palette': [
            '#2E8B57',  # Sea Green (0-15 min)
            '#FFD700',  # Gold (15-30 min) 
            '#FF8C00',  # Dark Orange (30-45 min)
            '#DC143C'   # Crimson (45-60+ min)
        ]
    }

def get_population_vis_params():
    """Get visualization parameters for population density"""
    return {
        'min': 0,
        'max': 1000,
        'palette': [
            '#440154',  # Dark purple (low)
            '#3B528B',  # Blue
            '#21908C',  # Teal  
            '#5DC863',  # Green
            '#FDE725'   # Yellow (high)
        ]
    }