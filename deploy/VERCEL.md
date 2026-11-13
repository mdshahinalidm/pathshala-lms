# PathShala LMS — Deploy to Vercel with PostgreSQL

Vercel's serverless filesystem cannot persist SQLite, so production deployments
run on PostgreSQL. This repository ships both Prisma schemas and one-command
switchers:

| File | Provider | Use |
|---|---|---|
| `prisma/schema.prisma` | SQLite | Local development (`bun run dev`) |
| `deploy/schema.postgres.prisma` | PostgreSQL | Vercel / any hosted Postgres |
| `deploy/schema.sqlite.prisma` | SQLite | Backup of the dev schema |

The application code is provider-agnostic — no raw SQL, no SQLite-specific
queries — so nothing else changes.

---

## 1. Create a PostgreSQL database

Pick any managed provider and copy its **connection string**:

- **Neon** — https://neon.tech (free tier, serverless Postgres)
- **Supabase** — https://supabase.com (free tier)
- **Vercel Postgres** — created from the Vercel dashboard (Storage tab)

The string looks like:

```
postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

## 2. Push the schema & seed the demo catalog

From the project root:

```bash
bun install

# switch the active Prisma schema to PostgreSQL
bun run db:switch:postgres

# point DATABASE_URL at the hosted database (local .env, used once)
#   DATABASE_URL="postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require"

bun run db:push     # creates all 20+ tables on the hosted Postgres
bun run db:seed     # seeds 55+ demo courses, users, orders & reviews
```

> Back to SQLite for everyday local development at any time:
> `bun run db:switch:sqlite`

## 3. Deploy on Vercel

1. Push this repository to GitHub and import it in Vercel.
2. **Environment variables** (Project → Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | your `postgresql://…` connection string |
   | `JWT_SECRET` | `openssl rand -base64 32` |
   | `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com` |

3. **Build Command** override (Project → Settings → Build & Output Settings):

   ```
   bun run db:switch:postgres && bun run build
   ```

   This swaps in the PostgreSQL schema, regenerates the Prisma client and
   produces the standalone build — every deploy is provider-correct, while the
   committed repo still defaults to SQLite for local dev.

4. Deploy. `postinstall` runs `prisma generate` automatically.

## 4. Custom domain & SEO

Point your domain at Vercel and set `NEXT_PUBLIC_SITE_URL` to it. Canonical
URLs, OpenGraph tags, `sitemap.xml` and `robots.txt` automatically follow the
serving domain — submit `/sitemap.xml` in Google Search Console after
verifying the property (Admin Panel → Settings → SEO settings for the
verification meta tag).

## 5. Post-deploy checklist

- [ ] Log in as `admin@pathshala.com` / `Admin@1234` and **change both seeded
      passwords immediately** (Admin Panel → Settings)
- [ ] Replace demo catalog with real courses (or clear the demo data)
- [ ] Configure payment gateways (bKash / SSLCommerz live credentials)
- [ ] Verify the domain in Google Search Console and submit the sitemap
- [ ] Run an SEO Center audit (Admin Panel → SEO Center → Refresh)
