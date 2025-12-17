# Webhook Testing Guide

This guide explains how to test your webhook deployment setup.

## Test Scripts

Two test scripts are available:

1. **quick-test.sh** - Fast sanity check (5 tests, ~2 seconds)
2. **test-webhook.sh** - Comprehensive test suite (12 tests, ~10 seconds)

## Running Tests

### Quick Test (Recommended for regular checks)

```bash
cd /home/www/apps/shared-modules
chmod +x quick-test.sh
./quick-test.sh
```

**Output example:**
```
Quick Webhook Test
==================
1. Backend server... ✓
2. Webhook endpoint... ✓
3. OpenLiteSpeed proxy... ✓
4. Webhook deployment... ✓
5. Deploy scripts... ✓

Run './test-webhook.sh' for detailed tests
```

### Comprehensive Test (Recommended before going live)

```bash
cd /home/www/apps/shared-modules
chmod +x test-webhook.sh
./test-webhook.sh
```

**This will test:**
1. ✓ Backend server health (port 3001)
2. ✓ Webhook endpoint configuration
3. ✓ OpenLiteSpeed proxy (/api/ rewrite)
4. ✓ Webhook through proxy
5. ✓ Deployment for shared-modules
6. ✓ Deployment for app-domain-ssl-monitor
7. ✓ Webhook signature verification
8. ✓ Non-main branch rejection
9. ✓ Unconfigured repository rejection
10. ✓ Deployment script permissions
11. ✓ PM2 process status
12. ✓ Git SSH access

## What Each Test Does

### Test 1: Backend Server Health
- **Checks:** Backend is running on port 3001
- **Command:** `curl http://localhost:3001/health`
- **Expected:** `{"status":"ok",...}`

### Test 2: Webhook Endpoint Health
- **Checks:** Webhook endpoint is configured with repositories
- **Command:** `curl http://localhost:3001/webhook/health`
- **Expected:** Response contains "shared-modules" and "app-domain-ssl-monitor"

### Test 3: OpenLiteSpeed Proxy
- **Checks:** /api/ is proxied to port 3001
- **Command:** `curl http://localhost:3000/api/health`
- **Expected:** `{"status":"ok",...}`
- **Fix if fails:** Configure OpenLiteSpeed proxy (see DEPLOYMENT.md)

### Test 4: Webhook Through Proxy
- **Checks:** Webhook accessible via /api/ proxy
- **Command:** `curl http://localhost:3000/api/webhook/health`
- **Expected:** Repository configuration

### Test 5: Webhook Deployment (shared-modules)
- **Checks:** Webhook accepts deployment for shared-modules
- **Expected:** `"Deployment started for shared-modules"`

### Test 6: Webhook Deployment (app-domain-ssl-monitor)
- **Checks:** Webhook accepts deployment for frontend
- **Expected:** `"Deployment started for app-domain-ssl-monitor"`

### Test 7: Webhook Signature Verification
- **Checks:** GitHub signature verification works
- **Expected:** Deployment starts with valid signature

### Test 8: Branch Filtering
- **Checks:** Only configured branch (main) triggers deployment
- **Expected:** `"Ignoring push to develop"`

### Test 9: Unknown Repository
- **Checks:** Unconfigured repos are rejected
- **Expected:** `"not configured for automatic deployment"`

### Test 10: Script Permissions
- **Checks:** deploy.sh files are executable
- **Fix if fails:** `chmod +x /path/to/deploy.sh`

### Test 11: PM2 Processes
- **Checks:** PM2 is managing your applications
- **Fix if fails:** `pm2 start ...` (see DEPLOYMENT.md)

### Test 12: Git SSH Access
- **Checks:** Server can pull from GitHub via SSH
- **Fix if fails:** Setup SSH keys (see DEPLOYMENT.md)

## Troubleshooting

### All tests fail
```bash
# Check if backend is running
pm2 status
pm2 logs shared-modules

# Restart backend
pm2 restart shared-modules
```

### Proxy tests fail (Test 3-4)
```bash
# Check OpenLiteSpeed configuration
# Go to WebAdmin → Virtual Hosts → Context
# Ensure /api/ proxy is configured to http://localhost:3001/
```

### Deployment tests fail (Test 5-6)
```bash
# Check environment variables
cat .env | grep DEPLOY

# Verify paths exist
ls -la /home/www/apps/shared-modules/deploy.sh
ls -la /home/www/apps/app-domain-ssl-monitor/frontend/deploy.sh
```

### Permission tests fail (Test 10)
```bash
# Make scripts executable
chmod +x /home/www/apps/shared-modules/deploy.sh
chmod +x /home/www/apps/app-domain-ssl-monitor/frontend/deploy.sh
```

### Git SSH test fails (Test 12)
```bash
# Test SSH connection
ssh -T git@github.com

# If fails, setup SSH key
ssh-keygen -t ed25519 -C "your_email@example.com"
cat ~/.ssh/id_ed25519.pub
# Add this to GitHub → Settings → SSH Keys
```

## Manual Testing

### Test a Real Deployment

**For shared-modules:**
```bash
cd /home/www/apps/shared-modules
git pull origin main
./deploy.sh
```

**For frontend:**
```bash
cd /home/www/apps/app-domain-ssl-monitor/frontend
git pull origin main
./deploy.sh
```

### Monitor Deployment Logs

```bash
# Watch all PM2 logs
pm2 logs

# Watch specific service
pm2 logs shared-modules --lines 100

# Check for deployment messages
pm2 logs shared-modules | grep -i deploy
```

### Test from GitHub

1. Make a test commit:
   ```bash
   git commit -m "Test webhook deployment" --allow-empty
   git push origin main
   ```

2. Check GitHub webhook delivery:
   - Go to repository → Settings → Webhooks
   - Click on your webhook
   - Check "Recent Deliveries" tab
   - Should see 200 OK response

3. Check server logs:
   ```bash
   pm2 logs shared-modules --lines 50
   ```

## Success Criteria

All tests should pass before configuring GitHub webhooks. If any tests fail, review the troubleshooting section above.

**Minimum requirements:**
- ✓ Tests 1-2: Backend must be running
- ✓ Tests 3-4: Proxy must work (or skip if using direct port)
- ✓ Tests 5-6: Webhook must accept deployments
- ✓ Test 10: Scripts must be executable
- ✓ Test 11: PM2 must be managing processes

## Next Steps

Once all tests pass:
1. Configure GitHub webhooks (see DEPLOYMENT.md)
2. Test with a real push to your repository
3. Monitor PM2 logs to verify automatic deployment
4. Celebrate! 🎉
