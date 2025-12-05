#!/bin/bash

# Deployment script for shared-modules
# This script is triggered by GitHub webhook

set -e  # Exit on any error

echo "========================================="
echo "Starting deployment: $(date)"
echo "========================================="

# Navigate to the project directory
cd "$(dirname "$0")"
PROJECT_DIR=$(pwd)

echo "Project directory: $PROJECT_DIR"

# Pull latest changes
echo "Pulling latest changes from Git..."
git pull origin main

# Install dependencies
echo "Installing dependencies..."
npm install

# Build the project
echo "Building the project..."
npm run build

# Restart the service using PM2 (if using PM2)
# Uncomment and adjust the service name as needed
if command -v pm2 &> /dev/null; then
    echo "Restarting service with PM2..."
    pm2 restart shared-modules || pm2 start npm --name "shared-modules" -- start
else
    echo "PM2 not found. Restart the service manually or use systemd."
fi

# Alternative: If using systemd, uncomment below:
# sudo systemctl restart shared-modules.service

echo "========================================="
echo "Deployment completed successfully: $(date)"
echo "========================================="
