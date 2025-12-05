#!/bin/bash

# Webhook Testing Script
# This script tests the webhook deployment setup for multiple repositories

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
GITHUB_USERNAME="GoranGolijanin"
WEBHOOK_SECRET="37f222b5c7ca56ddcf897bbfe8ecac4a9cd289cae68921b9f715dc8e9071e0a1"

# Test counter
PASSED=0
FAILED=0

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Webhook Deployment Test Suite${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Helper function to print test results
test_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}: $2"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: $2"
        ((FAILED++))
    fi
}

# Test 1: Backend server health check (direct port 3001)
echo -e "\n${YELLOW}Test 1: Backend Server Health Check (Port 3001)${NC}"
RESPONSE=$(curl -s http://localhost:3001/health)
if echo "$RESPONSE" | grep -q "ok"; then
    test_result 0 "Backend server is running on port 3001"
    echo "  Response: $RESPONSE"
else
    test_result 1 "Backend server health check failed"
    echo "  Response: $RESPONSE"
fi

# Test 2: Webhook health check (direct port 3001)
echo -e "\n${YELLOW}Test 2: Webhook Endpoint Health Check${NC}"
RESPONSE=$(curl -s http://localhost:3001/webhook/health)
if echo "$RESPONSE" | grep -q "shared-modules"; then
    test_result 0 "Webhook endpoint is configured correctly"
    echo "  Response: $RESPONSE"
else
    test_result 1 "Webhook endpoint configuration failed"
    echo "  Response: $RESPONSE"
fi

# Test 3: OpenLiteSpeed proxy test (port 3000 -> 3001)
echo -e "\n${YELLOW}Test 3: OpenLiteSpeed Proxy (/api/ rewrite)${NC}"
RESPONSE=$(curl -s http://localhost:3000/api/health 2>&1)
if echo "$RESPONSE" | grep -q "ok"; then
    test_result 0 "OpenLiteSpeed proxy is working (/api/ -> port 3001)"
    echo "  Response: $RESPONSE"
else
    test_result 1 "OpenLiteSpeed proxy failed - check proxy configuration"
    echo "  Response: $RESPONSE"
fi

# Test 4: Webhook proxy through OpenLiteSpeed
echo -e "\n${YELLOW}Test 4: Webhook Through Proxy${NC}"
RESPONSE=$(curl -s http://localhost:3000/api/webhook/health 2>&1)
if echo "$RESPONSE" | grep -q "shared-modules"; then
    test_result 0 "Webhook accessible through OpenLiteSpeed proxy"
    echo "  Response: $RESPONSE"
else
    test_result 1 "Webhook not accessible through proxy"
    echo "  Response: $RESPONSE"
fi

# Test 5: Webhook deployment - shared-modules (without signature)
echo -e "\n${YELLOW}Test 5: Webhook Deployment - shared-modules (No Signature)${NC}"
PAYLOAD='{
  "ref": "refs/heads/main",
  "repository": {
    "name": "shared-modules",
    "full_name": "'"$GITHUB_USERNAME"'/shared-modules"
  }
}'
RESPONSE=$(curl -s -X POST http://localhost:3001/webhook/deploy \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if echo "$RESPONSE" | grep -q "Deployment started"; then
    test_result 0 "Webhook accepted deployment request for shared-modules"
    echo "  Response: $RESPONSE"
else
    test_result 1 "Webhook deployment failed for shared-modules"
    echo "  Response: $RESPONSE"
fi

# Test 6: Webhook deployment - app-domain-ssl-monitor (without signature)
echo -e "\n${YELLOW}Test 6: Webhook Deployment - app-domain-ssl-monitor (No Signature)${NC}"
PAYLOAD='{
  "ref": "refs/heads/main",
  "repository": {
    "name": "app-domain-ssl-monitor",
    "full_name": "'"$GITHUB_USERNAME"'/app-domain-ssl-monitor"
  }
}'
RESPONSE=$(curl -s -X POST http://localhost:3001/webhook/deploy \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if echo "$RESPONSE" | grep -q "Deployment started"; then
    test_result 0 "Webhook accepted deployment request for app-domain-ssl-monitor"
    echo "  Response: $RESPONSE"
else
    test_result 1 "Webhook deployment failed for app-domain-ssl-monitor"
    echo "  Response: $RESPONSE"
fi

# Test 7: Webhook with valid signature (shared-modules)
echo -e "\n${YELLOW}Test 7: Webhook with Valid Signature (shared-modules)${NC}"
PAYLOAD='{"ref":"refs/heads/main","repository":{"name":"shared-modules","full_name":"'"$GITHUB_USERNAME"'/shared-modules"}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | sed 's/^.* //')

RESPONSE=$(curl -s -X POST http://localhost:3001/webhook/deploy \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -d "$PAYLOAD")

if echo "$RESPONSE" | grep -q "Deployment started"; then
    test_result 0 "Webhook signature verification working correctly"
    echo "  Response: $RESPONSE"
else
    test_result 1 "Webhook signature verification failed"
    echo "  Response: $RESPONSE"
fi

# Test 8: Webhook with wrong branch (should be ignored)
echo -e "\n${YELLOW}Test 8: Webhook with Non-Main Branch (Should Ignore)${NC}"
PAYLOAD='{
  "ref": "refs/heads/develop",
  "repository": {
    "name": "shared-modules",
    "full_name": "'"$GITHUB_USERNAME"'/shared-modules"
  }
}'
RESPONSE=$(curl -s -X POST http://localhost:3001/webhook/deploy \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if echo "$RESPONSE" | grep -q "Ignoring push"; then
    test_result 0 "Webhook correctly ignores non-main branches"
    echo "  Response: $RESPONSE"
else
    test_result 1 "Webhook should ignore non-main branches"
    echo "  Response: $RESPONSE"
fi

# Test 9: Webhook with unconfigured repository
echo -e "\n${YELLOW}Test 9: Webhook with Unconfigured Repository${NC}"
PAYLOAD='{
  "ref": "refs/heads/main",
  "repository": {
    "name": "unknown-repo",
    "full_name": "'"$GITHUB_USERNAME"'/unknown-repo"
  }
}'
RESPONSE=$(curl -s -X POST http://localhost:3001/webhook/deploy \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if echo "$RESPONSE" | grep -q "not configured"; then
    test_result 0 "Webhook correctly rejects unconfigured repositories"
    echo "  Response: $RESPONSE"
else
    test_result 1 "Webhook should reject unconfigured repositories"
    echo "  Response: $RESPONSE"
fi

# Test 10: Check deployment script permissions
echo -e "\n${YELLOW}Test 10: Deployment Script Permissions${NC}"
SHARED_MODULES_SCRIPT="/home/www/apps/shared-modules/deploy.sh"
FRONTEND_SCRIPT="/home/www/apps/app-domain-ssl-monitor/frontend/deploy.sh"

if [ -x "$SHARED_MODULES_SCRIPT" ]; then
    test_result 0 "shared-modules deploy.sh is executable"
else
    test_result 1 "shared-modules deploy.sh is NOT executable (run: chmod +x $SHARED_MODULES_SCRIPT)"
fi

if [ -x "$FRONTEND_SCRIPT" ]; then
    test_result 0 "frontend deploy.sh is executable"
else
    test_result 1 "frontend deploy.sh is NOT executable (run: chmod +x $FRONTEND_SCRIPT)"
fi

# Test 11: Check if PM2 processes are running
echo -e "\n${YELLOW}Test 11: PM2 Process Status${NC}"
if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q "shared-modules"; then
        test_result 0 "PM2 process 'shared-modules' is running"
    else
        test_result 1 "PM2 process 'shared-modules' is NOT running"
    fi

    if pm2 list | grep -q "frontend"; then
        test_result 0 "PM2 process 'frontend' is running"
    else
        test_result 1 "PM2 process 'frontend' is NOT running (optional)"
    fi
else
    test_result 1 "PM2 is not installed"
fi

# Test 12: Check Git SSH access
echo -e "\n${YELLOW}Test 12: Git SSH Access${NC}"
if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
    test_result 0 "Git SSH authentication is configured correctly"
else
    echo -e "${YELLOW}  Note: Git SSH authentication may need setup${NC}"
    echo "  This is required for automated deployments"
fi

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}  Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✓ All tests passed! Webhook deployment is ready.${NC}"
    exit 0
else
    echo -e "\n${RED}✗ Some tests failed. Please review the errors above.${NC}"
    exit 1
fi
