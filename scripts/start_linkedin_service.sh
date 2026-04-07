#!/bin/bash

# LinkedIn Video Posting Service Startup Script (FastAPI)

echo "🚀 Starting LinkedIn Video Posting Service (FastAPI)..."
echo ""
echo "📋 Checking dependencies..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3."
    exit 1
fi

# Check if required packages are installed
python3 -c "import fastapi" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  FastAPI not found. Installing dependencies..."
    pip3 install fastapi uvicorn requests pydantic
fi

echo "✅ Dependencies OK"
echo ""
echo "📍 Starting FastAPI service on http://localhost:5002"
echo "📝 API Endpoint: POST /api/linkedin/post-video"
echo "🏥 Health Check: GET /api/linkedin/health"
echo "📚 API Docs: http://localhost:5002/docs"
echo "📊 ReDoc: http://localhost:5002/redoc"
echo ""
echo "Press Ctrl+C to stop the service"
echo "========================================"
echo ""

# Start the FastAPI service
python3 linkedin_service_fastapi.py
