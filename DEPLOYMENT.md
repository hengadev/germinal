# Germinal VPS Deployment Guide

This guide covers deploying Germinal on a VPS with Caddy as reverse proxy.

## Architecture

| Environment | Public Domain | Admin Domain | Port |
|-------------|---------------|--------------|------|
| Production | germinal.henga.dev | admin.henga.dev | 4100 |
| Development | dev-germinal.henga.dev | dev-admin.henga.dev | 4101 |

- **Caddy**: Handles HTTPS and reverse proxy for all domains
- **Database**: Production uses PostgreSQL, Dev uses mock data
- Both environments can run simultaneously

---

## Step 1: DNS Records

Create these A records pointing to your VPS IP address (all under `henga.dev`):

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| A | germinal | `<YOUR_VPS_IP>` | Production public |
| A | admin | `<YOUR_VPS_IP>` | Production admin |
| A | dev-germinal | `<YOUR_VPS_IP>` | Development public |
| A | dev-admin | `<YOUR_VPS_IP>` | Development admin |

---

## Step 2: Caddyfile Configuration

Add this to your `/etc/caddy/Caddyfile`:

```caddyfile
# ============================================
# GERMINAL - PRODUCTION (port 4100)
# ============================================

# Production - Public site
germinal.henga.dev {
    reverse_proxy localhost:4100
    encode gzip
}

# Production - Admin site
admin.henga.dev {
    reverse_proxy localhost:4100
    encode gzip
}

# ============================================
# GERMINAL - DEVELOPMENT (port 4101)
# ============================================

# Development - Public site
dev-germinal.henga.dev {
    reverse_proxy localhost:4101
    encode gzip
}

# Development - Admin site
dev-admin.henga.dev {
    reverse_proxy localhost:4101
    encode gzip
}
```

Then reload Caddy:

```bash
sudo systemctl reload caddy
```

---

## Step 3: Clone and Setup

```bash
# Clone the repository
cd /home/user  # or your preferred directory
git clone <your-repo-url> germinal
cd germinal

# Create production environment file
cp .env.example .env.prod
```

---

## Step 4: Configure Environment Variables

Edit `.env.prod` with your production values:

```bash
nano .env.prod
```

**Required variables:**

```bash
# Database (uses container name as host)
DATABASE_URL=postgresql://germinal:YOUR_STRONG_PASSWORD@db:5432/germinal_prod
POSTGRES_PASSWORD=YOUR_STRONG_PASSWORD

# App
NODE_ENV=production
PUBLIC_URL=https://germinal.henga.dev

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET_NAME=your-bucket-name
S3_PUBLIC_URL=https://your-bucket.s3.amazonaws.com

# SMTP (for sending emails)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email
SMTP_PASSWORD=your-password
SMTP_FROM_EMAIL=noreply@germinal.com
SMTP_FROM_NAME=Germinal
CONTACT_EMAIL=hello@germinal.com

# Stripe (for payments)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESERVATION_EXPIRY_MINUTES=15

# Upload limits
MAX_FILE_SIZE=10485760
ALLOWED_IMAGE_TYPES=image/jpeg,image/png,image/webp,image/gif
ALLOWED_VIDEO_TYPES=video/mp4,video/webm,video/quicktime

# Mock mode - MUST be false for production
USE_MOCK_DATA=false
```

---

## Step 5: Start Production

```bash
# Build and start production containers
docker compose -f docker-compose.prod.yml up -d --build

# Check containers are running
docker ps

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

---

## Step 6: Run Database Migrations

```bash
docker compose -f docker-compose.prod.yml exec app npx drizzle-kit push
```

---

## Step 7: Create Admin User

```bash
docker compose -f docker-compose.prod.yml exec app npx tsx scripts/create-admin.ts
```

Follow the prompts to create your admin account.

---

## Development Environment

The dev environment uses mock data and doesn't need a database.

```bash
# Start development (can run alongside production)
docker compose -f docker-compose.dev.yml up -d

# View dev logs
docker compose -f docker-compose.dev.yml logs -f
```

**Access URLs:**
- Public: `https://dev-germinal.henga.dev`
- Admin: `https://dev-admin.henga.dev`
- Login with: `admin@germinal.com` / `admin123`

---

## Common Commands

### Production

```bash
# Start production
docker compose -f docker-compose.prod.yml up -d --build

# Stop production
docker compose -f docker-compose.prod.yml down

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Restart after code changes
git pull
docker compose -f docker-compose.prod.yml up -d --build

# Run migrations
docker compose -f docker-compose.prod.yml exec app npx drizzle-kit push

# Enter app container shell
docker compose -f docker-compose.prod.yml exec app sh
```

### Development

```bash
# Start development
docker compose -f docker-compose.dev.yml up -d

# Stop development
docker compose -f docker-compose.dev.yml down

# View logs
docker compose -f docker-compose.dev.yml logs -f
```

---

## Verification Checklist

### Production
- [ ] `https://germinal.henga.dev` loads the public site
- [ ] `https://admin.henga.dev` shows the admin login page
- [ ] `https://germinal.henga.dev/admin` returns 404 (correct - not admin domain)
- [ ] Login at `admin.henga.dev` works and creates a session
- [ ] Logout redirects back to `admin.henga.dev/login`

### Development
- [ ] `https://dev-germinal.henga.dev` loads the public site
- [ ] `https://dev-admin.henga.dev` shows the admin login page
- [ ] `https://dev-germinal.henga.dev/admin` returns 404 (correct - not admin domain)
- [ ] Login at `dev-admin.henga.dev` works with mock credentials
- [ ] Logout redirects back to `dev-admin.henga.dev/login`

---

## Switching to a New Domain Later

When you get `germinalstudio.co` working:

1. Edit `src/lib/server/hostname.ts`:
   - The `ADMIN_DOMAINS` array already includes `admin.germinalstudio.co`
   - The `getCookieDomain` function already handles `.germinalstudio.co`

2. Add new entries to your Caddyfile:
   ```caddyfile
   germinalstudio.co, www.germinalstudio.co {
       reverse_proxy localhost:4100
       encode gzip
   }

   admin.germinalstudio.co {
       reverse_proxy localhost:4100
       encode gzip
   }
   ```

3. Create DNS records for the new domain

4. Keep the old `henga.dev` domains working during transition

---

## Troubleshooting

### Container won't start
```bash
# Check logs for errors
docker compose -f docker-compose.prod.yml logs app

# Check database is healthy
docker compose -f docker-compose.prod.yml logs db
```

### Database connection issues
```bash
# Verify database is running
docker compose -f docker-compose.prod.yml ps

# Test database connection
docker compose -f docker-compose.prod.yml exec db psql -U germinal -d germinal_prod
```

### Caddy issues
```bash
# Check Caddy status
sudo systemctl status caddy

# Test Caddy config
sudo caddy validate --config /etc/caddy/Caddyfile

# View Caddy logs
sudo journalctl -u caddy -f
```

### Cookie/session issues
- Ensure both domains are accessible via HTTPS
- Cookies are set with domain `.henga.dev` to work across subdomains
- Clear browser cookies and try logging in again
