import sys
import os

# Add the project root to the Python path so Vercel can find backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app import app

# Vercel serverless entry point
handler = app
