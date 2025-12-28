#!/bin/bash

# Verification Script - Check prerequisites before deployment

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Pre-Deployment Verification Script   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

CHECKS_PASSED=0
CHECKS_FAILED=0

# Function to check command exists
check_command() {
  local cmd=$1
  local name=$2

  if command -v $cmd &> /dev/null; then
    echo -e "${GREEN}✓${NC} $name installed"
    ((CHECKS_PASSED++))
    return 0
  else
    echo -e "${RED}✗${NC} $name NOT installed"
    ((CHECKS_FAILED++))
    return 1
  fi
}

# Function to check file exists
check_file() {
  local file=$1
  local name=$2

  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $name exists"
    ((CHECKS_PASSED++))
    return 0
  else
    echo -e "${YELLOW}⚠${NC} $name missing"
    ((CHECKS_FAILED++))
    return 1
  fi
}

echo "Checking prerequisites..."
echo ""

# Check Node.js
if check_command node "Node.js"; then
  VERSION=$(node --version)
  echo "  Version: $VERSION"
fi

# Check npm
check_command npm "npm"

# Check AWS CLI
if check_command aws "AWS CLI"; then
  VERSION=$(aws --version)
  echo "  Version: $VERSION"
fi

# Check Pulumi
if check_command pulumi "Pulumi CLI"; then
  VERSION=$(pulumi version)
  echo "  Version: $VERSION"
fi

echo ""
echo "Checking AWS credentials..."

# Check AWS credentials
if aws sts get-caller-identity &> /dev/null; then
  ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
  REGION=$(aws configure get region)
  echo -e "${GREEN}✓${NC} AWS credentials configured"
  echo "  Account: $ACCOUNT"
  echo "  Region: $REGION"
  ((CHECKS_PASSED++))
else
  echo -e "${RED}✗${NC} AWS credentials NOT configured"
  echo "  Run: aws configure"
  ((CHECKS_FAILED++))
fi

echo ""
echo "Checking project structure..."

# Check directories
check_file "fog-gateway/package.json" "Fog Gateway package.json"
check_file "fog-gateway/config.json" "Fog Gateway config.json"
check_file "pulumi-infra/package.json" "Pulumi package.json"
check_file "pulumi-infra/index.ts" "Pulumi index.ts"
check_file "pulumi-infra/lambda/package.json" "Lambda package.json"
check_file "pulumi-infra/lambda/process-telemetry.js" "Lambda function"

echo ""
echo "Checking dependencies..."

# Check fog-gateway dependencies
if [ -d "fog-gateway/node_modules" ]; then
  echo -e "${GREEN}✓${NC} Fog Gateway dependencies installed"
  ((CHECKS_PASSED++))
else
  echo -e "${YELLOW}⚠${NC} Fog Gateway dependencies not installed"
  echo "  Run: cd fog-gateway && npm install"
  ((CHECKS_FAILED++))
fi

# Check pulumi-infra dependencies
if [ -d "pulumi-infra/node_modules" ]; then
  echo -e "${GREEN}✓${NC} Pulumi dependencies installed"
  ((CHECKS_PASSED++))
else
  echo -e "${YELLOW}⚠${NC} Pulumi dependencies not installed"
  echo "  Run: cd pulumi-infra && npm install"
  ((CHECKS_FAILED++))
fi

# Check lambda dependencies
if [ -d "pulumi-infra/lambda/node_modules" ]; then
  echo -e "${GREEN}✓${NC} Lambda dependencies installed"
  ((CHECKS_PASSED++))
else
  echo -e "${YELLOW}⚠${NC} Lambda dependencies not installed"
  echo "  Run: cd pulumi-infra/lambda && npm install"
  ((CHECKS_FAILED++))
fi

echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           VERIFICATION SUMMARY         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "Checks passed: ${GREEN}$CHECKS_PASSED${NC}"
echo -e "Checks failed: ${RED}$CHECKS_FAILED${NC}"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All checks passed! Ready to deploy.${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. cd pulumi-infra"
  echo "  2. pulumi up"
  echo "  3. cd .. && ./setup.sh"
  echo "  4. cd fog-gateway && node src/index.js"
  echo ""
  exit 0
else
  echo -e "${YELLOW}⚠ Some checks failed. Please fix the issues above.${NC}"
  echo ""
  echo "Quick fixes:"
  echo "  • Install Node.js: https://nodejs.org/"
  echo "  • Install AWS CLI: https://aws.amazon.com/cli/"
  echo "  • Install Pulumi: https://www.pulumi.com/docs/get-started/install/"
  echo "  • Configure AWS: aws configure"
  echo "  • Install dependencies:"
  echo "      cd fog-gateway && npm install"
  echo "      cd pulumi-infra && npm install"
  echo "      cd pulumi-infra/lambda && npm install"
  echo ""
  exit 1
fi
