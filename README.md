# Germinal

A web application for showcasing events and talents, with bookings, payments, and notifications, built with SvelteKit, PostgreSQL, and AWS S3.

## Features

- 📅 **Events Management** - Create and display events with rich media galleries
- 👥 **Talent Profiles** - Showcase talented individuals with bios and portfolios
- 🎫 **Reservations & Booking** - Time-limited reservations with QR code tickets
- 💳 **Payments** - Stripe checkout and webhooks
- ✉️ **Notifications** - Email (AWS SES) and SMS (Twilio) notifications
- 🔐 **Role-Based Access** - Separate admin, staff, and public route groups with argon2-based auth
- 🖼️ **Media Galleries** - Support for images and videos stored in S3
- 📱 **PWA Support** - Installable, with generated icons and a web manifest
- 🚀 **Server-Side Rendering** - Fast, SEO-friendly pages
- 🐳 **Docker Ready** - Production-ready containerization
- 🔒 **Type-Safe** - Full TypeScript coverage with Drizzle ORM

## 🌱 Try it locally

Run the real app — database, seeded content, admin back-office — with **no accounts and no configuration** beyond one copy-paste:

```bash
cp .env.example .env
make try
```

`make try` starts local Postgres and Redis containers (Docker), applies the migrations, seeds demo events, sessions and talents, creates a demo admin account (`ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`), and starts the dev server at **http://localhost:5173**. To explore the back-office, sign in at `/login` with those demo credentials.

**Prerequisites:** Docker, Node.js 20+, and pnpm.

### What is disabled in try mode

`.env.example` deliberately leaves every third-party integration unset — leaving a value empty disables that integration, so nothing ever runs against placeholder credentials. The following features are therefore off; their absence is expected, not a bug:

| Feature | Behaviour in try mode |
| --- | --- |
| 💳 Payments (Stripe) | Disabled — the checkout step reports that Stripe is not configured |
| 🖼️ Media uploads (S3) | Disabled — admin uploads report that S3 is not configured |
| ✉️ Email notifications (SES) | Disabled — no confirmation or ticket emails are sent |
| 📱 SMS notifications (Twilio) | Disabled — no SMS is sent |

To enable an integration, fill in its values in `.env` (each one is listed, commented out, in [.env.example](./.env.example)). Invited contributors can instead render a complete `.env` from the team's Infisical `dev` environment with `make env` (requires `infisical login`).

---

## ⚡ Quickstart - Mock data (no database)

Want to see the app running with sample data in 30 seconds, without even a database?

```bash
./dev.sh
```

You'll be prompted for mock admin credentials on first run (or set `MOCK_ADMIN_EMAIL` / `MOCK_ADMIN_PASSWORD` in `.env` — see [QUICKSTART.md](./QUICKSTART.md)). Then visit **http://localhost:5173**.

> Uses mock data - no real database needed, perfect for UI development and testing. See [QUICKSTART.md](./QUICKSTART.md) and [MOCK_DATA_GUIDE.md](./MOCK_DATA_GUIDE.md) for details.

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
  postgres:16-alpine

# 3. Run migrations
node scripts/migrate.js

# 4. Start development server
pnpm dev
```

Visit **http://localhost:5173**

> **Note:** See [DEV_SETUP.md](./DEV_SETUP.md) for comprehensive setup guide.

### Staging & Production (VPS)

Staging and production run on a VPS provisioned by Terraform and deployed via Ansible, with staging sharing prod's Postgres/Redis/Caddy but using its own database and app container. See `infrastructure/ansible/README.md` for the architecture and `make help` for the deploy commands (`make image-release`, `make deploy-staging`, `make deploy`, etc.).

## Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - ⚡ Get running in 1 minute with mock data
- **[DEV_SETUP.md](./DEV_SETUP.md)** - Comprehensive local development guide
- **[MOCK_DATA_GUIDE.md](./MOCK_DATA_GUIDE.md)** - Working with mock data mode
- **[infrastructure/ansible/README.md](./infrastructure/ansible/README.md)** - Staging/production deployment (Terraform + Ansible)
- **[CONTEXT.md](./CONTEXT.md)** - Domain language and project context

## Tech Stack

- **Framework:** SvelteKit 2.x
- **Database:** PostgreSQL 15 with Drizzle ORM
- **Storage:** Amazon S3 (or MinIO for local development)
- **Auth:** argon2 password hashing, role-based route groups (admin/staff/public)
- **Payments:** Stripe
- **Notifications:** AWS SES email, Twilio SMS
- **Background jobs:** pg-boss (scheduled cleanup, reminders, email queue)
- **Rate limiting:** Redis
- **Styling:** Tailwind CSS 4
- **Language:** TypeScript
- **Testing:** Vitest (unit/integration), Playwright (e2e)
- **Deployment:** Docker + Node.js, Caddy reverse proxy, Terraform-provisioned VPS, Ansible-managed staging/production

## Project Structure

```
germinal/
├── src/
│   ├── lib/
│   │   ├── components/     # Reusable UI components
│   │   ├── server/         # Backend services and database
│   │   ├── types/          # TypeScript type definitions
│   │   └── utils/          # Shared utilities
│   └── routes/
│       ├── (public)/       # Public-facing pages
│       ├── (admin)/        # Admin-only pages
│       ├── (staff)/        # Staff-only pages
│       ├── (auth)/         # Login/auth pages
│       └── api/            # API endpoints (incl. webhooks, cron)
├── drizzle/migrations/     # Database migrations (generated, never hand-written)
├── scripts/                # Migration, seeding, and admin-creation scripts
├── infrastructure/terraform/ # VPS/cloud infrastructure (provisioning)
├── infrastructure/ansible/   # Staging/production deployment
├── static/                 # Static assets
└── docker-compose.yml      # Local Postgres + Drizzle Studio for `pnpm dev`
```

## Development Commands

```bash
pnpm dev                  # Start development server
pnpm build                # Build for production
pnpm preview              # Preview production build
pnpm check                # Run TypeScript checks
pnpm test                 # Run unit tests (Vitest)
pnpm test:integration     # Run integration tests
pnpm test:e2e             # Run end-to-end tests (Playwright)
pnpm create-admin         # Create an admin user (reads ADMIN_EMAIL/ADMIN_PASSWORD)
npx drizzle-kit generate  # Generate a new migration from schema changes
node scripts/migrate.js   # Apply pending migrations
npx drizzle-kit studio    # Open database GUI
```

> Migrations must always go through `drizzle-kit generate` — never write SQL migration files by hand, as it breaks snapshot generation.

## Environment Variables

The app works out of the box with minimal configuration. Only `DATABASE_URL` is required for a real database; set `USE_MOCK_DATA=true` (plus `MOCK_ADMIN_EMAIL`/`MOCK_ADMIN_PASSWORD`) to skip the database entirely:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/germinal
```

Additional integrations (S3 uploads, Stripe payments, SES/Twilio notifications, Redis rate limiting, Sentry monitoring) each have their own variables — see [.env.example](./.env.example) and [DEV_SETUP.md](./DEV_SETUP.md) for full details.
