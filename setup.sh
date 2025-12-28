#!/bin/bash

# Setup Script - Configura Fog Gateway después del despliegue de Pulumi

set -e

echo "=========================================="
echo "  Smart Greenhouse - Setup Script"
echo "=========================================="

# Check if we're in the right directory
if [ ! -d "pulumi-infra" ] || [ ! -d "fog-gateway" ]; then
  echo "Error: Run this script from the project root directory"
  exit 1
fi

cd pulumi-infra

# Check if Pulumi stack exists
if ! pulumi stack --show-name &> /dev/null; then
  echo "Error: No Pulumi stack found. Run 'pulumi up' first"
  exit 1
fi

echo ""
echo "Step 1: Creating certificates directory..."
mkdir -p ../fog-gateway/certs

echo ""
echo "Step 2: Downloading Amazon Root CA..."
curl -o ../fog-gateway/certs/AmazonRootCA1.pem https://www.amazontrust.com/repository/AmazonRootCA1.pem

echo ""
echo "Step 3: Extracting IoT certificate..."
pulumi stack output certificatePem --show-secrets > ../fog-gateway/certs/certificate.pem.crt

echo ""
echo "Step 4: Extracting IoT private key..."
pulumi stack output privateKey --show-secrets > ../fog-gateway/certs/private.pem.key

echo ""
echo "Step 5: Getting IoT endpoint..."
IOT_ENDPOINT=$(pulumi stack output iotEndpoint)
echo "IoT Endpoint: $IOT_ENDPOINT"

echo ""
echo "Step 6: Updating fog-gateway config.json..."
cd ../fog-gateway

# Update config.json with IoT endpoint (cross-platform approach)
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' "s|\"endpoint\": \".*\"|\"endpoint\": \"$IOT_ENDPOINT\"|" config.json
else
  # Linux
  sed -i "s|\"endpoint\": \".*\"|\"endpoint\": \"$IOT_ENDPOINT\"|" config.json
fi

echo ""
echo "Step 7: Installing Fog Gateway dependencies..."
npm install

cd ..

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. cd fog-gateway"
echo "  2. node src/index.js"
echo ""
echo "Monitor in AWS Console:"
echo "  - IoT Core Test Client: Subscribe to 'greenhouse/#'"
echo "  - DynamoDB: GreenhouseState table"
echo "  - CloudWatch Logs: /aws/lambda/ProcessTelemetry"
echo ""
