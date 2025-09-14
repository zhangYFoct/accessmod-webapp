"""
Authentication utilities for JWT token handling and password management
"""

import os
import jwt
import bcrypt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from pydantic import BaseModel

# JWT Configuration
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_TIME_HOURS = 24

class TokenData(BaseModel):
    email: Optional[str] = None
    user_id: Optional[int] = None

class UserCredentials(BaseModel):
    email: str
    password: str

class UserRegistration(BaseModel):
    email: str
    password: str
    firstName: str
    lastName: str

def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(data: Dict[Any, Any]) -> str:
    """Create a new JWT access token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_TIME_HOURS)
    to_encode.update({"exp": expire})
    
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> Optional[Dict[Any, Any]]:
    """Verify and decode a JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def extract_token_from_header(authorization: str) -> Optional[str]:
    """Extract token from Authorization header"""
    if authorization and authorization.startswith("Bearer "):
        return authorization.split(" ")[1]
    return None