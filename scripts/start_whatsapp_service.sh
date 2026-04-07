#!/bin/bash

# WhatsApp Video Sharing Service Startup Script (FastAPI)

echo "🚀 Starting WhatsApp Video Sharing Service (FastAPI)..."
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
    pip3 install fastapi uvicorn requests pydantic pywhatkit pyautogui
fi

python3 -c "import pywhatkit" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  PyWhatKit not found. Installing..."
    pip3 install pywhatkit pyautogui
fi

echo "✅ Dependencies OK"
echo ""
echo "📍 Starting FastAPI service on http://localhost:5004"
echo "📝 API Endpoint: POST /api/whatsapp/send-video"
echo "🏥 Health Check: GET /api/whatsapp/health"
echo "📚 API Docs: http://localhost:5004/docs"
echo "📊 ReDoc: http://localhost:5004/redoc"
echo ""
echo "⚠️  NOTE: WhatsApp Web will open automatically in your browser"
echo "⚠️  Make sure you're logged into WhatsApp Web before sending"
echo ""
echo "Press Ctrl+C to stop the service"
echo "========================================"
echo ""

# Start the FastAPI service
python3 whatsapp_service_fastapi.py
