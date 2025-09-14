# Healthcare Accessibility Analysis Platform

A comprehensive web application for analyzing healthcare accessibility using geospatial data and Google Earth Engine integration. Built for healthcare planning and accessibility analysis in resource-constrained settings.

## Overview

AccessMod enables healthcare planners to analyze population access to health facilities by calculating travel times and coverage areas. The platform integrates with Google Earth Engine for geospatial processing and IFRC healthcare facility data.


## Tech Stack

### Frontend
- **Next.js 14** with TypeScript and App Router
- **Material-UI** for modern UI components
- **Leaflet** for interactive mapping
- **React Hook Form** with Zod validation

### Backend
- **FastAPI** Python web framework
- **Google Earth Engine** for geospatial analysis
- **PostgreSQL** database with SQLAlchemy ORM
- **JWT Authentication** for secure API access

### Infrastructure
- **Docker** containerization for development and deployment
- **GitHub Actions** for automated testing

## Getting Started

### Prerequisites
- Node.js 20.x
- Python 3.11+
- Docker and Docker Compose
- Google Earth Engine service account

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/zhangYFoct/accessmod-webapp.git
   cd accessmod-webapp
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Set up backend**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

4. **Configure Google Earth Engine**
   - Place your service account key at `backend/service-account-key.json`
   - Ensure GEE access is enabled for your account

5. **Start with Docker**
   ```bash
   docker-compose up --build
   ```

The application will be available at:
- Frontend: http://localhost:8083
- Backend API: http://localhost:5000

## Available Scripts

### Frontend
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run test` - Run unit tests
- `npm run test:integration` - Run integration tests

### Backend
- `python main.py` - Start FastAPI server
- `python init_db.py` - Initialize database

## Testing

Comprehensive testing suite with 42+ integration tests covering:

- **Authentication Flow**: Registration, login, JWT validation
- **Analysis Workflow**: Country selection, GEE processing, result storage  
- **Database Relations**: Multi-user data isolation and integrity
- **API Endpoints**: Error handling and validation

```bash
# Run all tests
npm run test:all

# Run specific test suites
npm run test              # Unit tests
npm run test:integration  # Integration tests
```

## Core Functionality

1. **Country Selection**: Choose from countries with IFRC healthcare facilities
2. **Geospatial Analysis**: Calculate travel time surfaces using Google Earth Engine
3. **Population Analysis**: Determine population coverage at 15, 30, and 60-minute intervals
4. **Results Visualization**: Interactive maps and statistical summaries
5. **Export Capabilities**: Generate analysis reports and visualizations

## Data Sources

- **Population Data**: GPW v4.11 (2020) via Google Earth Engine
- **Healthcare Facilities**: International Federation of Red Cross (IFRC) GO Platform API
- **Country Boundaries**: USDOS/LSIB_SIMPLE/2017 via Google Earth Engine
- **Road Networks**: GRIP4 (Global Roads Inventory Project) OpenStreetMap data
- **Land Cover**: ESA WorldCover v100 for friction surface modeling
- **Elevation Data**: USGS SRTM GL1 30m for slope calculations
