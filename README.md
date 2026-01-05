# Germinal

A modern web application for showcasing events and talents, built with SvelteKit, PostgreSQL, and AWS S3.

## Features

- 📅 **Events Management** - Create and display events with rich media galleries
- 👥 **Talent Profiles** - Showcase talented individuals with bios and portfolios
- 🖼️ **Media Galleries** - Support for images and videos stored in S3
- 🚀 **Server-Side Rendering** - Fast, SEO-friendly pages
- 🐳 **Docker Ready** - Production-ready containerization
- 🔒 **Type-Safe** - Full TypeScript coverage with Drizzle ORM

## ⚡ Quickstart - Try it NOW!

Want to see the app running with sample data in 30 seconds?

```bash
./dev.sh
```

Visit **http://localhost:5173** - **No database, no setup, just works!** 🎉

> Uses mock data - perfect for UI development and testing. See [QUICKSTART.md](./QUICKSTART.md) for details.

---

## Full Setup (With Database)

### Local Development

```bash
# 1. Install dependencies
pnpm install

# 2. Set up database (using Docker)
docker run -d --name germinal-postgres \
  -e POSTGRES_DB=germinal \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:15-alpine

# 3. Run migrations
pnpm drizzle-kit push

# 4. Start development server
pnpm dev
```

Visit **http://localhost:5173**

> **Note:** See [DEV_SETUP.md](./DEV_SETUP.md) for comprehensive setup guide.

### Production (Docker)

```bash
# Build and run with Docker Compose
docker-compose up -d
```

Visit **http://localhost:3000**

## Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - ⚡ Get running in 1 minute with mock data
- **[DEV_SETUP.md](./DEV_SETUP.md)** - Comprehensive local development guide
- **[PLAN.md](./PLAN.md)** - Architecture and implementation details
- **[DOCKER.md](./DOCKER.md)** - Docker deployment guide

## Tech Stack

- **Framework:** SvelteKit 2.x
- **Database:** PostgreSQL 15 with Drizzle ORM
- **Storage:** Amazon S3 (or MinIO for local development)
- **Styling:** Tailwind CSS 4
- **Language:** TypeScript
- **Deployment:** Docker + Node.js

## Project Structure

```
germinal/
├── src/
│   ├── lib/
│   │   ├── components/     # Reusable UI components
│   │   ├── server/         # Backend services and database
│   │   ├── types/          # TypeScript type definitions
│   │   └── utils/          # Shared utilities
│   └── routes/             # SvelteKit pages and API endpoints
├── drizzle/                # Database migrations
├── static/                 # Static assets
└── docker-compose.yml      # Docker configuration
```

## Development Commands

```bash
pnpm dev              # Start development server
pnpm build            # Build for production
pnpm preview          # Preview production build
pnpm check            # Run TypeScript checks
pnpm drizzle-kit push # Push database schema
pnpm drizzle-kit studio # Open database GUI
```

## Environment Variables

The app works out of the box with minimal configuration. Only `DATABASE_URL` is required:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/germinal
```

For production or file upload testing, additional variables are needed. See [DEV_SETUP.md](./DEV_SETUP.md) for full details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `pnpm check` to ensure type safety
5. Submit a pull request

## License

MIT
