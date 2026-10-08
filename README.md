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

`make try` starts local Postgres, Redis and MinIO (local S3) containers (Docker), applies the migrations, seeds demo events, sessions and talents, creates a demo admin account (`ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`), and starts the dev server at **http://localhost:5173**. To explore the back-office, sign in at `/login` with those demo credentials.

**Prerequisites:** Docker, Node.js 22.12+, and pnpm.

### What is disabled in try mode

`.env.example` configures only the local containers and deliberately leaves every third-party integration unset — leaving a value empty disables that integration, so nothing ever runs against placeholder credentials. Media uploads work: they go to the local MinIO bucket (console at http://localhost:9001). The following features are off; their absence is expected, not a bug:

| Feature | Behaviour in try mode |
| --- | --- |
| 💳 Payments (Stripe) | Disabled — the checkout step reports that Stripe is not configured |
| ✉️ Email notifications (SES) | Disabled — no confirmation or ticket emails are sent |
| 📱 SMS notifications (Twilio) | Disabled — no SMS is sent |

To enable an integration, fill in its values in `.env` (each one is listed, commented out, in [.env.example](./.env.example)). Invited contributors can instead render a complete `.env` from the team's Infisical `dev` environment — see the next section.

---

## 👥 Contributing (invited contributors)

If you've been invited to the team's Infisical project, setup is two commands — no copying values by hand:

```bash
infisical login   # pick the team's instance when prompted
make env
```

`make env` renders `.env` from the Infisical `dev` environment using the **same templates the server's Infisical Agent renders** ([infrastructure/infisical/templates/](./infrastructure/infisical/templates/)), including the local admin account and the assembled `DATABASE_URL`, so local development can't drift from the server in how values are assembled. It fails with a clear message if the Infisical CLI is missing or you're not logged in, and it never overwrites an existing `.env` silently (the old one is backed up next to it).

With `.env` in place, `make dev` starts everything (database, Redis, MinIO for media uploads, migrations, dev server), and `pnpm test` / `node scripts/create-admin.js` work out of the box. The `dev` environment holds only credentials that can't spend money or reach real data: S3 points at the local MinIO (`S3_ENDPOINT`, `S3_*` credentials) and `AWS_*` stays empty, so email (SES) is off.

---

## ⚡ Quickstart - Mock data (no database)

Want to see the app running with sample data in 30 seconds, without even a database?

```bash
./dev.sh
```

You'll be prompted for mock admin credentials on first run (or set `MOCK_ADMIN_EMAIL` / `MOCK_ADMIN_PASSWORD` in `.env` — see [QUICKSTART.md](./QUICKSTART.md)). Then visit **http://localhost:5173**.

> Uses mock data - no real database needed, perfect for UI development and testing. See [QUICKSTART.md](./QUICKSTART.md) for details.

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

Staging and production run as two Docker Compose stacks on one VPS, provisioned by Terraform and set up with Ansible. Configuration values live only in Infisical, rendered on the server by the Infisical Agent. Releases go through CI (`.github/workflows`): a push to `main` deploys staging automatically, and the manual **Promote to production** workflow ships the exact SHA staging is serving (and rolls back by promoting an earlier SHA). See **[docs/deployment/](./docs/deployment/README.md)**: architecture and releases, the [environment-variable reference](./docs/deployment/environment.md), and the [setup checklist](./docs/deployment/setup.md).

## Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - ⚡ Get running in 1 minute with mock data
- **[DEV_SETUP.md](./DEV_SETUP.md)** - Comprehensive local development guide
- **[docs/deployment/](./docs/deployment/README.md)** - Staging/production: architecture, releases and rollback, environment variables, setup checklist
- **[docs/adr/](./docs/adr/)** - Architecture decisions
- **[CONTEXT.md](./CONTEXT.md)** - Domain language and project context

## Tech Stack

- **Framework:** SvelteKit 2.x
- **Database:** PostgreSQL 16 with Drizzle ORM
- **Storage:** Amazon S3 (or MinIO for local development)
- **Auth:** argon2 password hashing, role-based route groups (admin/staff/public)
- **Payments:** Stripe
- **Notifications:** AWS SES email, Twilio SMS
- **Background jobs:** pg-boss (scheduled cleanup, reminders, email queue)
- **Rate limiting:** Redis
- **Styling:** Tailwind CSS 4
- **Language:** TypeScript
- **Testing:** Vitest (unit/integration), Playwright (e2e)
- **Deployment:** Docker Compose on one Terraform-provisioned VPS, Caddy reverse proxy, Ansible-managed server, configuration from Infisical

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
├── infrastructure/ansible/   # Server setup (Ansible)
├── infrastructure/compose/   # Compose stacks + the deploy script
├── infrastructure/infisical/ # Env templates (server Agent + make env)
├── static/                 # Static assets
├── docs/                   # ADRs and deployment docs
└── docker-compose.yml      # Local Postgres, Redis, MinIO for `make dev` / `make try`
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
>
> **Every migration must work with the previous app version** (add first, remove in a later release): deploys run migrations before the new container starts, and a rollback does not revert the schema. See [the migration rule](./docs/deployment/README.md#the-migration-rule).

## Environment Variables

The app works out of the box with minimal configuration. Only `DATABASE_URL` is required for a real database; set `USE_MOCK_DATA=true` (plus `MOCK_ADMIN_EMAIL`/`MOCK_ADMIN_PASSWORD`) to skip the database entirely:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/germinal
```

Additional integrations (S3 uploads, Stripe payments, SES/Twilio notifications, Redis rate limiting, Sentry monitoring) each have their own variables — see [.env.example](./.env.example) and [DEV_SETUP.md](./DEV_SETUP.md) for full details.
