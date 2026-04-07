#!/bin/bash

# YouTube Video Upload Service Startup Script (FastAPI)

echo "🚀 Starting YouTube Video Upload Service (FastAPI)..."
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
    pip3 install fastapi uvicorn requests pydantic google-auth-oauthlib google-auth-httplib2 google-api-python-client
fi

python3 -c "import googleapiclient" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  Google API client not found. Installing..."
    pip3 install google-auth-oauthlib google-auth-httplib2 google-api-python-client
fi

# Check if client.json exists
if [ ! -f "client.json" ]; then
    echo "⚠️  WARNING: client.json not found!"
    echo "   Please download your OAuth credentials from:"
    echo "   https://console.cloud.google.com/"
    echo "   And save them as 'client.json' in this directory"
    echo ""
fi

echo "✅ Dependencies OK"
echo ""
echo "📍 Starting FastAPI service on http://localhost:5005"
echo "📝 API Endpoint: POST /api/youtube/upload-video"
echo "🏥 Health Check: GET /api/youtube/health"
echo "📚 API Docs: http://localhost:5005/docs"
echo "📊 ReDoc: http://localhost:5005/redoc"
echo ""
echo "⚠️  NOTE: First-time use will require OAuth authorization"
echo "⚠️  A browser will open for you to authorize YouTube access"
echo ""
echo "Press Ctrl+C to stop the service"
echo "========================================"
echo ""

# Start the FastAPI service
python3 youtube_service_fastapi.py
