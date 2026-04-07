#!/bin/bash

# 🔐 SocialFlow Environment Setup Script
# Run this script to set up your local development environment

echo "🎯 SocialFlow Environment Setup"
echo "================================"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ Created .env file"
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env file with your actual values:"
    echo "   - MONGODB_PASSWORD"
    echo "   - OPENAI_API_KEY"
    echo "   - Other API keys as needed"
    echo ""
else
    echo "✅ .env file already exists"
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "🐍 Creating Python virtual environment..."
    python3 -m venv venv
    echo "✅ Virtual environment created"
fi

# Activate virtual environment
echo "🔄 Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env file with your actual credentials"
echo "2. Activate virtual environment: source venv/bin/activate"
echo "3. Start the application: python main.py"
echo ""
echo "🔐 Security reminders:"
echo "- Never commit .env files to version control"
echo "- Use strong passwords for MongoDB Atlas"
echo "- Rotate API keys regularly"
echo ""
