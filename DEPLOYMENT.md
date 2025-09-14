# AccessMod Healthcare Analysis - Deployment Manual

## Overview
This guide covers the deployment of the AccessMod Healthcare Analysis application, which consists of:
- **Frontend**: Next.js application (Port 8083)
- **Backend**: FastAPI Python service (Port 5000) 
- **Database**: PostgreSQL 15 (Port 5432)
- **External APIs**: Google Earth Engine integration

## System Requirements

### Hardware Requirements
- **CPU**: 4 cores minimum, 8 cores recommended
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 50GB minimum, 100GB recommended
- **Network**: Stable internet connection for GEE API

### Software Requirements
- **OS**: Ubuntu 20.04+ / CentOS 8+ / Docker-compatible Linux
- **Docker**: Version 20.10+
- **Docker Compose**: Version 2.0+
- **Git**: For code deployment

## Pre-deployment Setup

### 1. Server Preparation
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Google Earth Engine Setup
1. Create a Google Cloud Project
2. Enable Earth Engine API
3. Create a service account and download JSON key
4. Place the key file as `backend/service-account-key.json`

### 3. Directory Structure
```
/opt/accessmod/
├── accessmod-webapp/          # Application code
├── data/                      # PostgreSQL data volume
├── logs/                      # Application logs
└── backups/                   # Database backups
```

## Deployment Steps

### 1. Clone Repository
```bash
sudo mkdir -p /opt/accessmod
cd /opt/accessmod
sudo git clone <your-repo-url> accessmod-webapp
sudo chown -R $USER:$USER accessmod-webapp
cd accessmod-webapp
```

### 2. Configure Environment
```bash
# Copy and edit production environment file
cp docker-compose.yml docker-compose.prod.yml

# Edit production configuration
nano docker-compose.prod.yml
```

### 3. Prepare Google Earth Engine Credentials
```bash
# Place your GEE service account key
sudo cp /path/to/your/service-account-key.json ./backend/service-account-key.json
sudo chmod 600 ./backend/service-account-key.json
```

### 4. Production Configuration

Edit `docker-compose.prod.yml` for production:

```yaml
services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "80:8083"  # Changed to port 80 for production
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_SERVER_URL=http://your-domain.com  # Change this
      - NEXT_PUBLIC_BUILD_STATIC_EXPORT=false
    restart: unless-stopped
    depends_on:
      - backend
    volumes:
      - /app/node_modules
    networks:
      - app-network

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    environment:
      - PYTHONPATH=/app
      - PYTHONUNBUFFERED=1
      - DATABASE_URL=postgresql://postgres:admin@database:5432/healthcare_analysis
    volumes:
      - ./backend/service-account-key.json:/app/service-account-key.json:ro
      - ./backend/logs:/app/logs
      - /opt/accessmod/logs:/app/logs  # Host log directory
    restart: unless-stopped
    depends_on:
      - database
    networks:
      - app-network

  database:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=healthcare_analysis
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=admin  # Change this to a strong password for production
    ports:
      - "5432:5432"
    volumes:
      - /opt/accessmod/data:/var/lib/postgresql/data  # Persistent data
    restart: unless-stopped
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
```

### 5. Build and Deploy
```bash
# Build and start services
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Check service status
docker-compose -f docker-compose.prod.yml ps
```

## Post-Deployment Configuration

### 1. Verify Services
```bash
# Check all containers are running
docker ps

# Check logs
docker-compose -f docker-compose.prod.yml logs frontend
docker-compose -f docker-compose.prod.yml logs backend
docker-compose -f docker-compose.prod.yml logs database
```

### 2. Test Application
- Frontend: http://your-server-ip
- Backend API: http://your-server-ip:5000/docs
- Health check: http://your-server-ip:5000/api/test

### 3. Database Setup
```bash
# Access database container
docker-compose -f docker-compose.prod.yml exec database psql -U postgres -d healthcare_analysis

# Run any necessary migrations (if applicable)
docker-compose -f docker-compose.prod.yml exec backend python -m alembic upgrade head
```

## Security Configuration

### 1. Firewall Setup
```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp  # SSH

# Block direct database access from outside
sudo ufw deny 5432/tcp

# Enable firewall
sudo ufw enable
```

### 2. SSL/HTTPS (Recommended)
Use nginx as reverse proxy with Let's Encrypt:

```bash
# Install nginx
sudo apt install nginx certbot python3-certbot-nginx

# Configure nginx reverse proxy
sudo nano /etc/nginx/sites-available/accessmod
```

Nginx configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8083;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable site and get SSL certificate
sudo ln -s /etc/nginx/sites-available/accessmod /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo certbot --nginx -d your-domain.com
```

## Monitoring & Maintenance

### 1. Log Management
```bash
# View real-time logs
docker-compose -f docker-compose.prod.yml logs -f

# Log rotation setup
sudo nano /etc/logrotate.d/accessmod
```

### 2. Health Monitoring
Create monitoring script:
```bash
#!/bin/bash
# /opt/accessmod/monitor.sh

# Check if services are running
if ! docker-compose -f /opt/accessmod/accessmod-webapp/docker-compose.prod.yml ps | grep -q "Up"; then
    echo "$(date): Services down, restarting..." >> /opt/accessmod/logs/monitor.log
    cd /opt/accessmod/accessmod-webapp
    docker-compose -f docker-compose.prod.yml restart
fi

# Check health endpoints
curl -f http://localhost:5000/api/test > /dev/null || {
    echo "$(date): Backend health check failed" >> /opt/accessmod/logs/monitor.log
}
```

Add to crontab:
```bash
# Run health check every 5 minutes
*/5 * * * * /opt/accessmod/monitor.sh
```

### 3. Backup Strategy
```bash
#!/bin/bash
# /opt/accessmod/backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/accessmod/backups"

# Database backup
docker-compose -f /opt/accessmod/accessmod-webapp/docker-compose.prod.yml exec -T database \
    pg_dump -U postgres healthcare_analysis > "$BACKUP_DIR/db_$DATE.sql"

# Keep only last 7 days of backups
find $BACKUP_DIR -name "db_*.sql" -mtime +7 -delete
```

## Updates & Maintenance

### 1. Application Updates
```bash
cd /opt/accessmod/accessmod-webapp

# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

### 2. System Updates
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Docker images
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

## Troubleshooting

### Common Issues

#### 1. Frontend Won't Start
```bash
# Check build logs
docker-compose -f docker-compose.prod.yml logs frontend

# Common fixes:
docker-compose -f docker-compose.prod.yml restart frontend
```

#### 2. Backend Connection Issues
```bash
# Check if GEE credentials are correct
docker-compose -f docker-compose.prod.yml exec backend ls -la service-account-key.json

# Test database connection
docker-compose -f docker-compose.prod.yml exec backend python -c "
import asyncpg
import asyncio
async def test_connection():
    conn = await asyncpg.connect('postgresql://postgres:admin@database:5432/healthcare_analysis')
    await conn.close()
    print('Database connection OK')
asyncio.run(test_connection())
"
```

#### 3. Database Issues
```bash
# Reset database (WARNING: This will delete all data)
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml up -d
```

#### 4. Performance Issues
```bash
# Check system resources
htop
docker stats

# Check disk space
df -h
```

### Emergency Procedures

#### Quick Restart
```bash
cd /opt/accessmod/accessmod-webapp
docker-compose -f docker-compose.prod.yml restart
```

#### Complete Rebuild
```bash
cd /opt/accessmod/accessmod-webapp
docker-compose -f docker-compose.prod.yml down
docker system prune -a
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

#### Rollback
```bash
cd /opt/accessmod/accessmod-webapp
git checkout <previous-commit-hash>
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

## Support Information

### Important File Locations
- Application: `/opt/accessmod/accessmod-webapp`
- Data: `/opt/accessmod/data`
- Logs: `/opt/accessmod/logs`
- Backups: `/opt/accessmod/backups`

### Service Ports
- Frontend: 80 (via nginx) or 8083 (direct)
- Backend API: 5000
- Database: 5432 (localhost only)

### Configuration Files
- Docker Compose: `docker-compose.prod.yml`
- GEE Credentials: `backend/service-account-key.json`
- Nginx Config: `/etc/nginx/sites-available/accessmod`

For additional support, check the application logs and refer to the project documentation.