# Automatic Deployment Setup with GitHub Webhooks (Multi-Repository)

This guide will help you set up automatic deployment for multiple GitHub repositories (shared-modules and app-domain-ssl-monitor).

## Overview

When you push changes to the configured branch (default: `main`), GitHub will send a webhook to your server, which will automatically:

1. Identify which repository was updated
2. Pull the latest code from GitHub
3. Install dependencies
4. Build the project
5. Restart the appropriate application

**Supported Repositories:**
- `shared-modules` - Backend API
- `app-domain-ssl-monitor` - Frontend application

## Setup Instructions

### Step 1: Make Deployment Scripts Executable

On your server, navigate to each project directory and make the deployment scripts executable:

```bash
# Backend (shared-modules)
cd /var/www/shared-modules
chmod +x deploy.sh

# Frontend (app-domain-ssl-monitor)
cd /var/www/app-domain-ssl-monitor/frontend
chmod +x deploy.sh
```

**Note:** Adjust the paths above to match your actual server directory structure.

### Step 2: Configure Environment Variables

Add these environment variables to your `shared-modules/.env` file:

```env
# GitHub Webhook Configuration (shared secret for all repositories)
GITHUB_WEBHOOK_SECRET=your-github-webhook-secret-here

# Shared Modules Repository Configuration
SHARED_MODULES_DEPLOY_SCRIPT=/var/www/shared-modules/deploy.sh
SHARED_MODULES_DEPLOY_BRANCH=main
SHARED_MODULES_PATH=/var/www/shared-modules

# Frontend Repository Configuration
FRONTEND_DEPLOY_SCRIPT=/var/www/app-domain-ssl-monitor/frontend/deploy.sh
FRONTEND_DEPLOY_BRANCH=main
FRONTEND_PATH=/var/www/app-domain-ssl-monitor/frontend
```

**Environment Variables Explained:**
- `GITHUB_WEBHOOK_SECRET`: A strong secret key that GitHub will use to sign webhook requests (same for all repos)
- `*_DEPLOY_SCRIPT`: Absolute path to the deployment script for each repository
- `*_DEPLOY_BRANCH`: The branch that triggers deployment for each repository (default: `main`)
- `*_PATH`: Absolute path to the project directory

**Generate a secure webhook secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Important:** Use the same `GITHUB_WEBHOOK_SECRET` for all repository webhooks.

### Step 3: Configure GitHub Webhooks (For Both Repositories)

You need to set up a webhook for **each repository** (shared-modules and app-domain-ssl-monitor). Both webhooks will use the **same endpoint** and **same secret**.

#### For shared-modules repository:

1. Go to `https://github.com/YOUR_USERNAME/shared-modules`
2. Click **Settings** → **Webhooks** → **Add webhook**
3. Configure the webhook:
   - **Payload URL**: `https://your-domain.com/api/webhook/deploy`
     - Note: If you configured OpenLiteSpeed to proxy `/api/` to port 3001, use this URL
     - Otherwise use: `https://your-domain.com:3001/webhook/deploy`
   - **Content type**: `application/json`
   - **Secret**: Paste the `GITHUB_WEBHOOK_SECRET` you generated in Step 2
   - **Which events would you like to trigger this webhook?**: Select "Just the push event"
   - **Active**: Check this box
4. Click **Add webhook**

#### For app-domain-ssl-monitor repository:

1. Go to `https://github.com/YOUR_USERNAME/app-domain-ssl-monitor`
2. Click **Settings** → **Webhooks** → **Add webhook**
3. Use the **exact same configuration** as above:
   - **Payload URL**: `https://your-domain.com/api/webhook/deploy` (same URL)
   - **Content type**: `application/json`
   - **Secret**: Same `GITHUB_WEBHOOK_SECRET` as the first repository
   - **Which events would you like to trigger this webhook?**: Select "Just the push event"
   - **Active**: Check this box
4. Click **Add webhook**

**Important:** Both repositories use the same webhook endpoint. The webhook handler automatically determines which project to deploy based on the repository name in the payload.

### Step 4: Configure OpenLiteSpeed Proxy (If needed)

If your main application is on port 3000 and backend on port 3001, you need to configure OpenLiteSpeed to proxy API requests.

#### Option A: Using Virtual Host Context (Recommended)

1. Go to OpenLiteSpeed WebAdmin (typically `http://your-server:7080`)
2. Navigate to: **Virtual Hosts** → **[Your Virtual Host]** → **Context**
3. Click **Add** and select **Proxy**
4. Configure:
   - **URI**: `/api/`
   - **Web Server Address**: `http://localhost:3001/`
   - **Enable**: Yes
5. **Graceful Restart** OpenLiteSpeed

#### Option B: Using Rewrite Rules

Add to your virtual host rewrite rules:
```
RewriteEngine On
RewriteRule ^/api/(.*)$ http://localhost:3001/$1 [P,L]
```

### Step 5: Set Up Process Manager (PM2)

Install PM2 globally if you haven't already:

```bash
npm install -g pm2
```

Start your application with PM2:

```bash
# Backend
cd /path/to/shared-modules
pm2 start npm --name "shared-modules" -- start

# Frontend
cd /path/to/frontend
pm2 start npm --name "frontend" -- start

# Save PM2 configuration
pm2 save

# Set up PM2 to start on system boot
pm2 startup
```

### Step 6: Configure Git SSH Access

To allow automated git pulls without manual authentication:

```bash
# Generate SSH key (if you don't have one)
ssh-keygen -t ed25519 -C "your_email@example.com"

# Copy the public key
cat ~/.ssh/id_ed25519.pub
```

Add this SSH public key to your GitHub account:
1. Go to **GitHub Settings** → **SSH and GPG keys**
2. Click **New SSH key**
3. Paste your public key

Test the connection:
```bash
ssh -T git@github.com
```

Ensure your repository is using SSH URL (not HTTPS):
```bash
git remote set-url origin git@github.com:username/repository.git
```

### Step 7: Test the Webhook

1. Restart your server to load the new webhook endpoint:
   ```bash
   pm2 restart shared-modules
   ```

2. Test the webhook endpoint manually:
   ```bash
   curl https://your-domain.com/api/webhook/health
   ```

   You should see:
   ```json
   {
     "status": "ok",
     "repositories": [
       {
         "name": "shared-modules",
         "branch": "main",
         "configured": true
       },
       {
         "name": "app-domain-ssl-monitor",
         "branch": "main",
         "configured": true
       }
     ],
     "timestamp": "2025-12-05T..."
   }
   ```

3. Make a test push to each repository:

   **Test shared-modules:**
   ```bash
   cd /path/to/shared-modules
   git commit -m "Test deployment webhook" --allow-empty
   git push origin main
   ```

   **Test app-domain-ssl-monitor:**
   ```bash
   cd /path/to/app-domain-ssl-monitor
   git commit -m "Test deployment webhook" --allow-empty
   git push origin main
   ```

4. Check webhook delivery in GitHub:
   - For **each repository**, go to **Settings** → **Webhooks**
   - Click on your webhook
   - Check the **Recent Deliveries** tab
   - Verify the response is `200 OK`
   - The response body should show which repository was deployed

5. Check your server logs:
   ```bash
   # Watch all logs
   pm2 logs

   # Or specific services
   pm2 logs shared-modules
   pm2 logs frontend
   ```

   You should see messages like:
   ```
   Webhook received for repository: shared-modules, branch: main
   Starting deployment for shared-modules from branch main...
   Deployment completed successfully for shared-modules
   ```

## Security Notes

1. **Always use HTTPS** in production for the webhook URL
2. **Never commit** your `GITHUB_WEBHOOK_SECRET` to the repository
3. The webhook endpoint **verifies** the GitHub signature to prevent unauthorized deployments
4. Consider adding **IP whitelisting** for GitHub's webhook IPs

## Troubleshooting

### Webhook returns 401 Unauthorized
- Check that `GITHUB_WEBHOOK_SECRET` matches in both GitHub and your `.env` file
- Ensure there are no extra spaces in the secret

### Deployment script doesn't execute
- Verify the script has execute permissions: `ls -l deploy.sh`
- Check PM2 logs: `pm2 logs shared-modules`
- Try running the script manually: `./deploy.sh`

### Git pull fails with authentication error
- Verify SSH key is added to GitHub
- Test SSH connection: `ssh -T git@github.com`
- Ensure repository URL uses SSH, not HTTPS

### PM2 process not restarting
- Check if the process name matches: `pm2 list`
- Try restarting manually: `pm2 restart shared-modules`

### OpenLiteSpeed proxy not working
- Verify proxy context configuration
- Check OpenLiteSpeed error logs
- Ensure graceful restart was performed

## Advanced Configuration

### Deploy Multiple Projects (Already Configured!)

The webhook endpoint is already configured to handle multiple repositories! Each repository has its own deployment script:

- **shared-modules**: Uses `SHARED_MODULES_DEPLOY_SCRIPT`
- **app-domain-ssl-monitor**: Uses `FRONTEND_DEPLOY_SCRIPT`

When GitHub sends a webhook, the handler:
1. Identifies the repository from the payload
2. Looks up the corresponding configuration
3. Executes the appropriate deployment script

### Adding More Repositories

To add another repository, add its configuration to `.env`:

```env
# New Repository Configuration
NEW_REPO_DEPLOY_SCRIPT=/path/to/new-repo/deploy.sh
NEW_REPO_DEPLOY_BRANCH=main
NEW_REPO_PATH=/path/to/new-repo
```

Then update the `getRepositoryConfig` function in `webhook.routes.ts` to include the new repository.

### Deploy Specific Branches

To deploy different branches to different environments, modify the `.env`:

```env
# Production
DEPLOY_BRANCH=main

# Or Staging
DEPLOY_BRANCH=staging
```

### Custom Deployment Actions

You can customize the `deploy.sh` script to:
- Run database migrations
- Clear caches
- Send deployment notifications
- Run tests before deployment
- Create deployment backups

## Support

For issues or questions, check:
- Server logs: `pm2 logs`
- GitHub webhook delivery logs
- OpenLiteSpeed error logs: `/usr/local/lsws/logs/error.log`
