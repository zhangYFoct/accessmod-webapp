# backend/main.py
import os
import sys
import io

# Set stdout encoding to UTF-8 to avoid Windows encoding issues
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from fastapi.security.http import HTTPAuthorizationCredentials
from pydantic import BaseModel
import ee
from analysis import IFRCDataAPI, get_country_boundary, get_population_stats, build_analysis_grid
from gee_tiles import create_tile_url, get_travel_time_vis_params
from database import get_db, close_db
from sqlalchemy.ext.asyncio import AsyncSession
from auth_utils import (
    hash_password, verify_password, create_access_token, verify_token,
    extract_token_from_header
)
from typing import Optional

app = FastAPI(title="Healthcare Accessibility Analysis API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8083",
        "http://127.0.0.1:8083",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Request models
class AnalysisRequest(BaseModel):
    country_name: str

class TileUrlRequest(BaseModel):
    asset_id: str
    layer_type: str = "travel_time"

class BoundaryRequest(BaseModel):
    country_name: str

# Auth related models
class SignInRequest(BaseModel):
    email: str
    password: str

class SignUpRequest(BaseModel):
    email: str
    password: str
    firstName: str
    lastName: str

class UpdateUserRequest(BaseModel):
    firstName: str
    lastName: str
    email: str

class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str

# JWT authentication dependency
security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Get current authenticated user"""
    token = credentials.credentials 
    
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return payload

# Initialize Google Earth Engine
def initialize_ee():
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

# Initialize GEE on startup
@app.on_event("startup")
async def startup_event():
    if initialize_ee():
        print("GEE initialization successful!")
    else:
        print("Failed to initialize Earth Engine")
        raise RuntimeError("Google Earth Engine initialization failed")

@app.on_event("shutdown")
async def shutdown_event():
    await close_db()

# Auth endpoints
@app.post("/api/auth/sign-up")
async def sign_up(request: SignUpRequest, db: AsyncSession = Depends(get_db)):
    """User registration"""
    try:
        from models import User
        from sqlalchemy import select
        
        # Check if email already exists
        stmt = select(User).where(User.email == request.email)
        result = await db.execute(stmt)
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Create new user
        hashed_password = hash_password(request.password)
        new_user = User(
            firstname=request.firstName,
            lastname=request.lastName,
            email=request.email,
            password=hashed_password
        )
        
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        
        # Generate JWT token
        token_data = {
            "user_id": new_user.id,
            "email": new_user.email,
            "firstName": new_user.firstname,
            "lastName": new_user.lastname
        }
        access_token = create_access_token(token_data)
        
        return {
            "success": True,
            "accessToken": access_token,
            "user": {
                "id": new_user.id,
                "email": new_user.email,
                "firstName": new_user.firstname,
                "lastName": new_user.lastname
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Sign up error: {e}")
        raise HTTPException(status_code=500, detail="Registration failed")

@app.post("/api/auth/sign-in")
async def sign_in(request: SignInRequest, db: AsyncSession = Depends(get_db)):
    """User login"""
    try:
        from models import User
        from sqlalchemy import select
        
        # Find user
        stmt = select(User).where(User.email == request.email)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            return {
                "success": False,
                "error": "Invalid email or password"
            }
        
        if not verify_password(request.password, user.password):
            return {
                "success": False,
                "error": "Invalid email or password"
            }
        
        # Generate JWT token
        token_data = {
            "user_id": user.id,
            "email": user.email,
            "firstName": user.firstname,
            "lastName": user.lastname
        }
        access_token = create_access_token(token_data)
        
        return {
            "success": True,
            "accessToken": access_token,
            "user": {
                "id": user.id,
                "email": user.email,
                "firstName": user.firstname,
                "lastName": user.lastname
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Sign in error: {e}")
        raise HTTPException(status_code=500, detail="Login failed")

@app.get("/api/auth/me")
async def get_current_user_info(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get current user information"""
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        from models import User
        from sqlalchemy import select
        
        user_id = current_user.get("user_id")
        
        # Get latest user information from database
        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "success": True,
            "user": {
                "id": user.id,
                "email": user.email,
                "firstName": user.firstname,
                "lastName": user.lastname
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Get user info error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get user info")

@app.put("/api/auth/update-profile")
async def update_user_profile(
    request: UpdateUserRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update user profile"""
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        from models import User
        from sqlalchemy import select
        
        user_id = current_user.get("user_id")
        
        # Get current user
        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # If email changed, check if new email is already in use
        if request.email != user.email:
            email_check = select(User).where(User.email == request.email, User.id != user_id)
            email_result = await db.execute(email_check)
            if email_result.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Email already in use")
        
        # Update user information
        user.firstname = request.firstName
        user.lastname = request.lastName
        user.email = request.email
        
        await db.commit()
        await db.refresh(user)
        
        return {
            "success": True,
            "message": "Profile updated successfully",
            "user": {
                "id": user.id,
                "email": user.email,
                "firstName": user.firstname,
                "lastName": user.lastname
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Update profile error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update profile")

@app.put("/api/auth/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Change password"""
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        from models import User
        from sqlalchemy import select
        
        user_id = current_user.get("user_id")
        
        # Get current user
        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Verify current password
        if not verify_password(request.currentPassword, user.password):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        
        # Update password
        user.password = hash_password(request.newPassword)
        
        await db.commit()
        
        return {
            "success": True,
            "message": "Password updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Change password error: {e}")
        raise HTTPException(status_code=500, detail="Failed to change password")

@app.get("/api/test")
async def test():
    return {
        "success": True,
        "message": "Backend server is running",
        "gee_initialized": True
    }

@app.get("/api/countries")
async def get_countries():
    try:
        ifrc_api = IFRCDataAPI()
        countries_data, facilities_data = ifrc_api.get_countries_with_facilities()
        
        return {
            "success": True,
            "countries": list(countries_data.keys()),
            "total_countries": len(countries_data)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze-from-asset")
async def analyze_from_asset(
    request: AnalysisRequest, 
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        # Check if user is authenticated
        if not current_user:
            raise HTTPException(status_code=401, detail="Authentication required")
            
        country_name = request.country_name
        user_id = current_user.get("user_id")
        
        if not country_name:
            raise HTTPException(status_code=400, detail="Country name required")
        
        # Calculate Asset ID
        folder_name = 'accessibility_analysis'
        clean_country_name = country_name.replace(' ', '_').replace(',', '').replace('.', '').replace('(', '').replace(')', '')
        
        # Get country boundary and projection
        country_boundary = get_country_boundary(country_name)
        if not country_boundary:
            raise HTTPException(status_code=404, detail="Country boundary not found")
        
        analysis_proj, resolution_meters, crs_string = build_analysis_grid(country_boundary.geometry())
        asset_id = f'projects/halogen-plasma-465713-t3/assets/{folder_name}/{clean_country_name}_travel_time_{resolution_meters}m'
        
        # Check if Asset exists
        try:
            accessibility_asset = ee.Image(asset_id)
            accessibility_asset.getInfo()  # Test if asset exists
        except:
            raise HTTPException(
                status_code=404, 
                detail=f'Asset not found: {asset_id}. Please run batch processing first.'
            )
        
        # Execute population statistics analysis
        quantitative_results = get_population_stats(
            accessibility_map=accessibility_asset,
            country_geometry=country_boundary,
            analysis_proj=analysis_proj,
            analysis_scale=resolution_meters
        )
        
        # Save analysis results to database
        from models import AnalysisResult
        from datetime import datetime
        
        new_analysis = AnalysisResult(
            user_id=user_id,
            country=country_name,
            analysis_time=datetime.utcnow(),
            population_15min_percent=quantitative_results.get('coverage_15min', 0),
            population_30min_percent=quantitative_results.get('coverage_30min', 0),
            population_60min_percent=quantitative_results.get('coverage_60min', 0),
            analysis_resolution=resolution_meters,
            total_population=quantitative_results.get('total_population', 0)
        )
        
        db.add(new_analysis)
        await db.commit()
        await db.refresh(new_analysis)
        
        return {
            "success": True,
            "data": {
                "country_name": country_name,
                "asset_id": asset_id,
                "resolution": resolution_meters,
                "analysis_id": new_analysis.id,
                **quantitative_results
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/get-tile-url")
async def get_tile_url(request: TileUrlRequest):
    """Get tile URL for a GEE asset"""
    try:
        if not request.asset_id:
            raise HTTPException(status_code=400, detail="Asset ID required")
        
        # Get appropriate visualization parameters
        if request.layer_type == "travel_time":
            vis_params = get_travel_time_vis_params()
        else:
            vis_params = get_travel_time_vis_params()  # Default
        
        # Create tile URL
        tile_url = create_tile_url(request.asset_id, vis_params)
        
        if not tile_url:
            raise HTTPException(status_code=500, detail="Failed to create tile URL")
        
        return {
            "success": True,
            "tile_url": tile_url,
            "asset_id": request.asset_id,
            "layer_type": request.layer_type
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/get-country-boundary")
async def get_country_boundary_layer(request: BoundaryRequest):
    """Get country boundary as tile layer"""
    try:
        if not request.country_name:
            raise HTTPException(status_code=400, detail="Country name required")
        
        # Get country boundary
        country_boundary = get_country_boundary(request.country_name)
        if not country_boundary:
            raise HTTPException(status_code=404, detail="Country boundary not found")
        
        # Convert Feature to FeatureCollection, then convert to boundary-only image
        country_fc = ee.FeatureCollection([country_boundary])
        
        # Create an image that only shows boundary lines
        boundary_image = ee.Image().paint(country_fc, 1, 2)  # paint with value 1, width 2
        
        # Create visualization parameters for boundary layer - black lines
        boundary_vis_params = {
            'palette': ['000000'],  # Black
            'min': 0,
            'max': 1
        }
        
        # Create tile URL for boundary layer
        boundary_tile_url = create_tile_url(boundary_image, boundary_vis_params)
        
        if not boundary_tile_url:
            raise HTTPException(status_code=500, detail="Failed to create boundary tile URL")
        
        return {
            "success": True,
            "tile_url": boundary_tile_url,
            "country_name": request.country_name,
            "layer_type": "boundary"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Get analysis history
@app.get("/api/analysis/history")
async def get_analysis_history(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """Get current user's analysis history"""
    try:
        # Verify user identity
        if not authorization:
            raise HTTPException(status_code=401, detail="Authorization header required")
        
        token = extract_token_from_header(authorization)
        user_data = verify_token(token)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        
        user_id = user_data.get('user_id')
        
        from models import AnalysisResult, User
        from sqlalchemy import select
        
        # Query current user's analysis records, ordered by time descending
        stmt = select(AnalysisResult).where(AnalysisResult.user_id == user_id).order_by(AnalysisResult.analysis_time.desc())
        result = await db.execute(stmt)
        analyses = result.scalars().all()
        
        history_data = []
        for analysis in analyses:
            history_data.append({
                "id": analysis.id,
                "country": analysis.country,
                "analysis_time": analysis.analysis_time.isoformat(),
                "analysis_resolution": analysis.analysis_resolution,
                "total_population": analysis.total_population,
                "population_15min_percent": analysis.population_15min_percent,
                "population_30min_percent": analysis.population_30min_percent,
                "population_60min_percent": analysis.population_60min_percent
            })
        
        return {
            "success": True,
            "data": history_data,
            "total": len(history_data)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Get specific analysis record
@app.get("/api/analysis/{analysis_id}")
async def get_analysis_detail(analysis_id: int, db: AsyncSession = Depends(get_db)):
    """Get specific analysis record details"""
    try:
        from models import AnalysisResult
        from sqlalchemy import select
        
        stmt = select(AnalysisResult).where(AnalysisResult.id == analysis_id)
        result = await db.execute(stmt)
        analysis = result.scalar_one_or_none()
        
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis record not found")
        
        return {
            "success": True,
            "data": {
                "id": analysis.id,
                "country": analysis.country,
                "analysis_time": analysis.analysis_time.isoformat(),
                "population_15min_percent": analysis.population_15min_percent,
                "population_30min_percent": analysis.population_30min_percent,
                "population_60min_percent": analysis.population_60min_percent
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)