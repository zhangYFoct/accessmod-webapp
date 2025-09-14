"""
Database models for healthcare accessibility analysis
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    firstname = Column(String(100), nullable=False)
    lastname = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    
    # Relationships
    analyses = relationship("AnalysisResult", back_populates="user")

class AnalysisResult(Base):
    __tablename__ = "analysis_results"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    country = Column(String(255), nullable=False)
    analysis_time = Column(DateTime, default=datetime.utcnow)
    population_15min_percent = Column(Float, nullable=True)
    population_30min_percent = Column(Float, nullable=True)
    population_60min_percent = Column(Float, nullable=True)
    analysis_resolution = Column(Integer, nullable=True)  # Analysis resolution in meters
    total_population = Column(Integer, nullable=True)     # Total population count
    
    # Relationships
    user = relationship("User", back_populates="analyses")