# Local Development Setup Guide

This guide will help you run Germinal locally on your machine for development.

## Prerequisites

- **Node.js** 20+ and **pnpm** installed
- **PostgreSQL** 15+ (local installation or Docker)
- **Optional**: AWS S3 credentials (only needed if testing file uploads)

---

## Quick Start (Minimal Setup)

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up PostgreSQL Database

**Option A: Using Docker (Recommended)**

```bash
# Start PostgreSQL in Docker
docker run -d \
  --name germinal-postgres \
  -e POSTGRES_DB=germinal \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:15-alpine
```

**Option B: Using Local PostgreSQL**

```bash
# Create database
createdb germinal

# Or using psql
psql -U postgres -c "CREATE DATABASE germinal;"
```

### 3. Environment Configuration

The app already has a minimal `.env` file configured for local development. If you need to customize it:

```bash
# .env is already created with defaults:
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/germinal

# S3 is OPTIONAL - leave commented out unless you need file uploads
```

### 4. Run Database Migrations

```bash
pnpm drizzle-kit push
```

This will create all necessary tables in your database.

### 5. Start Development Server

```bash
pnpm dev
```

The app will be available at **http://localhost:5173**

---

## What Works Without S3?

In development mode **without AWS S3 credentials**, you can:

✅ Browse events and talents (if seeded)  
✅ View all pages and UI  
✅ Test navigation and routing  
✅ Work on styling and components  
✅ Test database queries  

❌ File uploads will not work (returns helpful error message)

---

## Adding S3 for File Uploads (Optional)

If you need to test file uploads, you have two options:

### Option 1: Use Real AWS S3

1. Create an S3 bucket in AWS
2. Get your AWS credentials
3. Update `.env`:

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
S3_BUCKET_NAME=your-bucket-name
S3_PUBLIC_URL=https://your-bucket-name.s3.amazonaws.com
```

4. Restart dev server

### Option 2: Use MinIO (Local S3-Compatible Storage)

MinIO provides S3-compatible storage that runs locally:

```bash
# Run MinIO in Docker
docker run -d \
  --name germinal-minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

Then update `.env`:

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=germinal-media
S3_PUBLIC_URL=http://localhost:9000
```

Create the bucket:
- Visit http://localhost:9001
- Login with minioadmin/minioadmin
- Create bucket named `germinal-media`
- Set it to public

---

## Database Management

### Using Drizzle Studio (GUI)

```bash
pnpm drizzle-kit studio
```

This opens a web UI at **http://localhost:4983** where you can:
- View all tables
- Browse data
- Run queries
- Edit records

### Using psql (CLI)

```bash
psql postgresql://postgres:postgres@localhost:5432/germinal
```

### Useful Commands

```bash
# Generate new migration
pnpm drizzle-kit generate

# Push schema changes to database
pnpm drizzle-kit push

# Reset database (⚠️ deletes all data)
psql postgresql://postgres:postgres@localhost:5432/germinal -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
pnpm drizzle-kit push
```

---

## Seed Data (Optional)

To add sample data for testing:

Create `scripts/seed.ts`:

```typescript
import { db } from '../src/lib/server/db';
import { events, talents } from '../src/lib/server/db/schema';

async function seed() {
  console.log('🌱 Seeding database...');

  // Create sample event
  await db.insert(events).values({
    title: 'Summer Music Festival 2026',
    slug: 'summer-music-festival-2026',
    description: 'Join us for an unforgettable night of live music and entertainment.',
    startDate: new Date('2026-07-15T18:00:00Z'),
    endDate: new Date('2026-07-15T23:00:00Z'),
    location: 'Central Park, New York',
    published: true,
  });

  // Create sample talent
  await db.insert(talents).values({
    firstName: 'Jane',
    lastName: 'Doe',
    role: 'Lead Vocalist',
    bio: 'Award-winning vocalist with 10+ years of experience.',
    published: true,
  });

  console.log('✅ Database seeded successfully');
  process.exit(0);
}

seed().catch(console.error);
```

Run it:

```bash
tsx scripts/seed.ts
```

---

## Development Workflow

### Typical Development Session

```bash
# 1. Start PostgreSQL (if using Docker)
docker start germinal-postgres

# 2. Start dev server
pnpm dev

# 3. Open browser to http://localhost:5173

# 4. Make changes - HMR will auto-reload
```

### Working on Database Changes

```bash
# 1. Edit src/lib/server/db/schema.ts

# 2. Push changes to database
pnpm drizzle-kit push

# 3. Verify in Drizzle Studio
pnpm drizzle-kit studio
```

### Type Checking

```bash
# Check for TypeScript errors
pnpm check

# Watch mode
pnpm check:watch
```

---

## Troubleshooting

### "Cannot connect to database"

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Or if using local PostgreSQL
pg_isready

# Check connection string in .env
echo $DATABASE_URL
```

### "Invalid environment variables"

The app should work with minimal config. If you see this error:

1. Check that `.env` exists
2. Verify DATABASE_URL is set
3. Make sure NODE_ENV is not set to 'production'

### "S3 is not configured" when uploading files

This is expected! File uploads require S3 credentials. Either:
- Add AWS credentials to `.env`
- Use MinIO for local S3
- Or skip file upload features during development

### Port 5173 already in use

```bash
# Kill the process using the port
lsof -ti:5173 | xargs kill -9

# Or use a different port
pnpm dev -- --port 3000
```

### Database schema out of sync

```bash
# Reset and recreate schema
pnpm drizzle-kit push
```

---

## Environment Variables Reference

### Required (with defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/germinal` | PostgreSQL connection string |

### Optional (S3 Configuration)

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_REGION` | `us-east-1` | AWS region |
| `AWS_ACCESS_KEY_ID` | _(empty)_ | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | _(empty)_ | AWS secret key |
| `S3_BUCKET_NAME` | `germinal-media-dev` | S3 bucket name |
| `S3_PUBLIC_URL` | `http://localhost:9000` | Public S3 URL |

### Optional (Upload Limits)

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_FILE_SIZE` | `10485760` (10MB) | Max upload size in bytes |
| `ALLOWED_IMAGE_TYPES` | `image/jpeg,image/png,image/webp,image/gif` | Allowed image MIME types |
| `ALLOWED_VIDEO_TYPES` | `video/mp4,video/webm,video/quicktime` | Allowed video MIME types |

---

## Running with Docker Compose (Alternative)

If you prefer to run everything in Docker:

```bash
# Start database only
docker-compose up -d db

# Run app locally, database in Docker
pnpm dev

# Or run everything in Docker
docker-compose up
```

---

## Next Steps

- See [PLAN.md](./PLAN.md) for architecture details
- See [DOCKER.md](./DOCKER.md) for production deployment
- Check [README.md](./README.md) for project overview

---

## Tips for Development

1. **Use Drizzle Studio** - Much easier than writing SQL queries
2. **Hot Module Replacement (HMR)** - Save files and see changes instantly
3. **TypeScript Errors** - Run `pnpm check` before committing
4. **Database Changes** - Always use `drizzle-kit` for migrations
5. **Console Logs** - Check terminal for helpful dev mode messages

Happy coding! 🚀
