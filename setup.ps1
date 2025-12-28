# Setup Script - Configura Fog Gateway después del despliegue de Pulumi
# PowerShell version for Windows

Write-Host "==========================================" -ForegroundColor Blue
Write-Host "  Smart Greenhouse - Setup Script" -ForegroundColor Blue
Write-Host "==========================================" -ForegroundColor Blue

# Check if we're in the right directory
if (!(Test-Path "pulumi-infra") -or !(Test-Path "fog-gateway")) {
    Write-Host "Error: Run this script from the project root directory" -ForegroundColor Red
    exit 1
}

Set-Location pulumi-infra

# Check if Pulumi stack exists
try {
    $null = pulumi stack --show-name 2>&1
} catch {
    Write-Host "Error: No Pulumi stack found. Run 'pulumi up' first" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 1: Creating certificates directory..." -ForegroundColor Green
New-Item -ItemType Directory -Force -Path "..\fog-gateway\certs" | Out-Null

Write-Host ""
Write-Host "Step 2: Downloading Amazon Root CA..." -ForegroundColor Green
Invoke-WebRequest -Uri "https://www.amazontrust.com/repository/AmazonRootCA1.pem" -OutFile "..\fog-gateway\certs\AmazonRootCA1.pem"

Write-Host ""
Write-Host "Step 3: Extracting IoT certificate..." -ForegroundColor Green
pulumi stack output certificatePem --show-secrets | Out-File -FilePath "..\fog-gateway\certs\certificate.pem.crt" -Encoding utf8

Write-Host ""
Write-Host "Step 4: Extracting IoT private key..." -ForegroundColor Green
pulumi stack output privateKey --show-secrets | Out-File -FilePath "..\fog-gateway\certs\private.pem.key" -Encoding utf8

Write-Host ""
Write-Host "Step 5: Getting IoT endpoint..." -ForegroundColor Green
$iotEndpoint = pulumi stack output iotEndpoint
Write-Host "IoT Endpoint: $iotEndpoint" -ForegroundColor Cyan

Write-Host ""
Write-Host "Step 6: Updating fog-gateway config.json..." -ForegroundColor Green
Set-Location ..\fog-gateway

$configPath = "config.json"
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$config.mqtt.endpoint = $iotEndpoint
$config | ConvertTo-Json -Depth 10 | Set-Content $configPath

Write-Host ""
Write-Host "Step 7: Installing Fog Gateway dependencies..." -ForegroundColor Green
npm install

Set-Location ..

Write-Host ""
Write-Host "==========================================" -ForegroundColor Blue
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Blue
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. cd fog-gateway"
Write-Host "  2. node src/index.js"
Write-Host ""
Write-Host "Monitor in AWS Console:"
Write-Host "  - IoT Core Test Client: Subscribe to 'greenhouse/#'"
Write-Host "  - DynamoDB: GreenhouseState table"
Write-Host "  - CloudWatch Logs: /aws/lambda/ProcessTelemetry"
Write-Host ""
