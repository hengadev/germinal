# Docker Setup Guide for Germinal

This guide explains how to run Germinal using Docker and Docker Compose.

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- AWS S3 credentials (for media storage)

## Quick Start

### 1. Environment Setup

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
- Database credentials (or use defaults for local development)
- AWS S3 credentials
- Other configuration values

### 2. Run with Docker Compose

Start the application and database:

```bash
docker-compose up -d
```

This will:
- Build the Germinal application image
- Start PostgreSQL database
- Start the application on port 3000

Access the application at: http://localhost:3000

### 3. Run Database Migrations

After first start, run database migrations:

```bash
docker-compose exec app pnpm drizzle-kit push
```

### 4. Optional: Run Drizzle Studio

For database management GUI:

```bash
docker-compose --profile tools up drizzle-studio
```

Access Drizzle Studio at: http://localhost:4983

## Docker Commands

### Build and Start

```bash
# Build and start all services
docker-compose up --build

# Start in detached mode (background)
docker-compose up -d

# View logs
docker-compose logs -f app
```

### Stop and Clean

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ deletes database data)
docker-compose down -v
```

### Database Management

```bash
# Access PostgreSQL CLI
docker-compose exec db psql -U postgres -d germinal

# Create database backup
docker-compose exec db pg_dump -U postgres germinal > backup.sql

# Restore database from backup
docker-compose exec -T db psql -U postgres germinal < backup.sql
```

### Application Management

```bash
# View application logs
docker-compose logs -f app

# Restart application only
docker-compose restart app

# Execute commands in running container
docker-compose exec app sh

# Run migrations
docker-compose exec app pnpm drizzle-kit push
```

## Production Deployment

### Build Production Image

```bash
docker build -t germinal:latest .
```

### Run Production Container

```bash
docker run -d \
  --name germinal \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/germinal" \
  -e AWS_REGION="us-east-1" \
  -e AWS_ACCESS_KEY_ID="your_key" \
  -e AWS_SECRET_ACCESS_KEY="your_secret" \
  -e S3_BUCKET_NAME="your-bucket" \
  -e S3_PUBLIC_URL="https://your-bucket.s3.amazonaws.com" \
  --restart unless-stopped \
  germinal:latest
```

### Environment Variables (Production)

Required environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `AWS_REGION` | AWS region for S3 | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | AWS access key | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `S3_BUCKET_NAME` | S3 bucket name | `germinal-media` |
| `S3_PUBLIC_URL` | Public S3 URL | `https://bucket.s3.amazonaws.com` |
| `NODE_ENV` | Environment | `production` |
| `PORT` | Application port | `3000` |

Optional:

| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_FILE_SIZE` | Max upload size (bytes) | `10485760` (10MB) |
| `ALLOWED_IMAGE_TYPES` | Allowed image MIME types | `image/jpeg,image/png,image/webp,image/gif` |
| `ALLOWED_VIDEO_TYPES` | Allowed video MIME types | `video/mp4,video/webm,video/quicktime` |

## Dockerfile Features

### Security Features
- ✅ Non-root user (`nodejs:nodejs`)
- ✅ Alpine-based images (smaller attack surface)
- ✅ Multi-stage build (no dev dependencies in production)
- ✅ Health checks included
- ✅ Production-only dependencies in final image

### Optimizations
- ✅ pnpm for faster, more efficient installs
- ✅ Layer caching for dependencies
- ✅ Minimal image size (~200-250MB)
- ✅ Proper signal handling

### Health Check

The container includes a health check that runs every 30 seconds:

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' germinal
```

## Troubleshooting

### Application won't start

Check logs:
```bash
docker-compose logs app
```

Common issues:
- Missing environment variables
- Database connection failed
- Port already in use

### Database connection errors

Ensure database is ready:
```bash
docker-compose exec db pg_isready -U postgres
```

Restart services:
```bash
docker-compose restart
```

### Permission errors

If you see permission errors, ensure the `nodejs` user has access:
```bash
# Rebuild with no cache
docker-compose build --no-cache
```

### Image size too large

Check image size:
```bash
docker images germinal
```

Expected size: ~200-250MB

If larger, ensure:
- `.dockerignore` is present
- Production dependencies only in final stage
- Multi-stage build is working correctly

## Development Workflow

### Local Development (Without Docker)

For local development without Docker:

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev
```

### Hybrid Approach (Database in Docker)

Run only the database in Docker:

```bash
# Start only database
docker-compose up -d db

# Run app locally
pnpm dev
```

This gives you:
- Fast HMR (Hot Module Replacement)
- Database isolation
- Easy cleanup

## Multi-Platform Builds

For deploying to ARM architecture (e.g., AWS Graviton):

```bash
# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t germinal:latest \
  --push \
  .
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build and Push Docker Image

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build Docker image
        run: docker build -t germinal:${{ github.sha }} .
      
      - name: Push to registry
        run: |
          echo "${{ secrets.DOCKER_PASSWORD }}" | docker login -u "${{ secrets.DOCKER_USERNAME }}" --password-stdin
          docker push germinal:${{ github.sha }}
```

## Resources

- [SvelteKit Documentation](https://kit.svelte.dev)
- [Docker Documentation](https://docs.docker.com)
- [Docker Compose Documentation](https://docs.docker.com/compose)
- [Drizzle ORM Documentation](https://orm.drizzle.team)

## Support

For issues related to:
- **Application**: Check `PLAN.md`
- **Docker setup**: Review this guide
- **Database**: See Drizzle documentation
