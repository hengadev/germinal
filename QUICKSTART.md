# Quickstart - Run Germinal in 1 Minute! ⚡

Want to see the app running ASAP with mock data? Here's the fastest way:

## Option 1: Local (Recommended) 🖥️

```bash
# 1. Run the dev script
./dev.sh
```

That's it! Visit **http://localhost:5173**

The app runs with mock data - **no database, no S3, no complex setup required!**

---

## Option 2: Docker 🐳

```bash
# 1. Start with docker-compose
docker-compose -f docker-compose.dev.yml up
```

Visit **http://localhost:5173**

---

## What You Get

✅ **5 sample events** - Music festivals, tech summits, art exhibitions  
✅ **5 sample talents** - Vocalists, entrepreneurs, artists, chefs, athletes  
✅ **Full UI** - Navigation, event pages, talent profiles  
✅ **Hot reload** - Changes update instantly  
✅ **No setup** - No database, credentials, or configuration needed

---

## Making Changes

Just edit files in `src/` and see changes live:

```bash
src/routes/events/+page.svelte    # Events listing page
src/lib/components/EventCard.svelte  # Event card component
src/lib/mock-data.ts              # Add more mock data
```

---

## Want Real Data?

When you're ready to use a real database:

1. **Remove the mock data flag:**
   ```bash
   # Don't set USE_MOCK_DATA
   unset USE_MOCK_DATA
   ```

2. **Set up database:**
   ```bash
   # Start PostgreSQL
   docker run -d --name germinal-postgres \
     -e POSTGRES_DB=germinal \
     -e POSTGRES_USER=postgres \
     -e POSTGRES_PASSWORD=postgres \
     -p 5432:5432 \
     postgres:15-alpine

   # Run migrations
   pnpm drizzle-kit push

   # Start app
   pnpm dev
   ```

See [DEV_SETUP.md](./DEV_SETUP.md) for complete documentation.

---

## Troubleshooting

**Port 5173 already in use?**
```bash
# Use a different port
pnpm dev -- --port 3000
```

**Dependencies not installed?**
```bash
pnpm install
```

**Changes not updating?**
- Save the file
- Check terminal for errors
- Refresh browser

---

## Next Steps

- 📖 Read [PLAN.md](./PLAN.md) for architecture details
- 🐳 See [DOCKER.md](./DOCKER.md) for production deployment
- 🔧 Check [DEV_SETUP.md](./DEV_SETUP.md) for full development guide

Happy coding! 🎉
