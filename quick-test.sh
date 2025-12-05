#!/bin/bash

# Quick Webhook Test - Fast sanity check

echo "Quick Webhook Test"
echo "=================="

# Test 1: Backend health
echo -n "1. Backend server... "
if curl -s http://localhost:3001/health | grep -q "ok"; then
    echo "✓"
else
    echo "✗ FAILED"
fi

# Test 2: Webhook health
echo -n "2. Webhook endpoint... "
if curl -s http://localhost:3001/webhook/health | grep -q "shared-modules"; then
    echo "✓"
else
    echo "✗ FAILED"
fi

# Test 3: Proxy
echo -n "3. OpenLiteSpeed proxy... "
if curl -s http://localhost:3000/api/health 2>&1 | grep -q "ok"; then
    echo "✓"
else
    echo "✗ FAILED"
fi

# Test 4: Webhook deployment
echo -n "4. Webhook deployment... "
RESPONSE=$(curl -s -X POST http://localhost:3001/webhook/deploy \
  -H "Content-Type: application/json" \
  -d '{"ref":"refs/heads/main","repository":{"name":"shared-modules","full_name":"GoranGolijanin/shared-modules"}}')
if echo "$RESPONSE" | grep -q "Deployment started"; then
    echo "✓"
else
    echo "✗ FAILED"
fi

# Test 5: Scripts executable
echo -n "5. Deploy scripts... "
if [ -x "/home/www/apps/shared-modules/deploy.sh" ] && [ -x "/home/www/apps/app-domain-ssl-monitor/frontend/deploy.sh" ]; then
    echo "✓"
else
    echo "✗ FAILED (not executable)"
fi

echo ""
echo "Run './test-webhook.sh' for detailed tests"
