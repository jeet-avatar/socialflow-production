#!/bin/bash

# SocialFlow Production Deployment Script
# Run this on your EC2 server

echo "🚀 Starting SocialFlow Production Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if running as root or with sudo
if [[ $EUID -eq 0 ]]; then
   print_error "Don't run this script as root. Run as ec2-user."
   exit 1
fi

# 1. Update system packages
print_status "Updating system packages..."
sudo yum update -y

# 2. Install Python 3.9+ if not available
print_status "Checking Python installation..."
python3 --version || {
    print_status "Installing Python 3.9..."
    sudo yum install python3 python3-pip -y
}

# 3. Install system dependencies for video processing
print_status "Installing system dependencies..."
sudo yum groupinstall -y "Development Tools"
sudo yum install -y ffmpeg python3-devel

# 4. Create virtual environment
print_status "Setting up Python virtual environment..."
cd /home/ec2-user/socialflowproject/restart
python3 -m venv venv
source venv/bin/activate

# 5. Upgrade pip and install Python packages
print_status "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# 6. Generate encryption key if .env doesn't exist
if [ ! -f .env ]; then
    print_status "Creating .env file from template..."
    cp .env.example .env
    
    # Generate a secure 32-character encryption key
    ENCRYPTION_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32)[:32])")
    
    # Update .env with generated encryption key
    sed -i "s/your_32_character_encryption_key_here/$ENCRYPTION_KEY/" .env
    
    print_warning "Please update the .env file with your actual API keys and database credentials!"
    print_warning "Generated encryption key: $ENCRYPTION_KEY"
else
    # Check if encryption key exists in .env
    if ! grep -q "INTEGRATION_ENCRYPTION_KEY=" .env; then
        print_status "Adding encryption key to existing .env..."
        ENCRYPTION_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32)[:32])")
        echo "INTEGRATION_ENCRYPTION_KEY=$ENCRYPTION_KEY" >> .env
        print_warning "Added encryption key: $ENCRYPTION_KEY"
    fi
fi

# 7. Create static directory if it doesn't exist
print_status "Creating static directory..."
mkdir -p static

# 8. Set up systemd service for auto-start
print_status "Setting up systemd service..."
sudo tee /etc/systemd/system/socialflow.service > /dev/null <<EOF
[Unit]
Description=SocialFlow FastAPI Application
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/socialflowproject/restart
Environment=PATH=/home/ec2-user/socialflowproject/restart/venv/bin
ExecStart=/home/ec2-user/socialflowproject/restart/venv/bin/python main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 9. Enable and start the service
print_status "Enabling SocialFlow service..."
sudo systemctl daemon-reload
sudo systemctl enable socialflow
sudo systemctl start socialflow

# 10. Configure firewall
print_status "Configuring firewall..."
sudo firewall-cmd --permanent --add-port=8000/tcp
sudo firewall-cmd --reload

# 11. Check service status
print_status "Checking service status..."
sleep 5
sudo systemctl status socialflow --no-pager

# 12. Test the API
print_status "Testing API endpoint..."
sleep 2
curl -f http://localhost:8000/health 2>/dev/null && print_status "API is responding!" || print_warning "API might not be ready yet"

print_status "Deployment completed!"
print_warning "Next steps:"
echo "1. Update .env file with your actual API keys"
echo "2. Check logs: sudo journalctl -u socialflow -f"
echo "3. Restart service: sudo systemctl restart socialflow"
echo "4. Your API is available at: http://13.51.109.41:8000"

print_status "Useful commands:"
echo "- Check status: sudo systemctl status socialflow"
echo "- View logs: sudo journalctl -u socialflow -f"
echo "- Restart: sudo systemctl restart socialflow"
echo "- Stop: sudo systemctl stop socialflow"
