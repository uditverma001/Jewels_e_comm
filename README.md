# Aurelia

A production-shaped jewellery storefront and admin, built for the Indian market
(INR, GST, UPI-first payments).

The design decisions and their reasoning live in **[ARCHITECTURE.md](./ARCHITECTURE.md)**.
This file is how to run it.

---

## Stack

TypeScript · Next.js 15 (App Router) · PostgreSQL 16 · Prisma 6 · Tailwind CSS v4 ·
Radix UI · Razorpay · Vitest · Playwright

---

## Running it

You need **Node 20.11+**, **pnpm** and a **PostgreSQL 16** database.

```bash
pnpm install
cp .env.example .env            # the defaults work against a local Postgres
createdb jewels_dev && createdb jewels_test

pnpm db:migrate                 # apply migrations
pnpm db:seed                    # 12 products, 3 shipping methods, 3 coupons, 2 users
pnpm dev
```

The shop is at http://localhost:3000 and the admin at `/admin`.

Seeded sign-ins (development only — they come from `.env`):

| Role     | Email                   | Password        |
| -------- | ----------------------- | --------------- |
| Admin    | `admin@aurelia.test`    | `Admin!2345`    |
| Customer | `customer@aurelia.test` | `Customer!2345` |

### No credentials needed

Every external service has a development driver, so a fresh clone runs the whole
purchase flow offline:

- **Payments** — a local driver that issues real HMAC signatures and real
  webhooks, and runs the same verification path as Razorpay. It is _not_ a stub
  that returns success; the failure path works too.
- **Storage** — writes to `public/uploads` instead of S3.
- **Email** — prints to stdout, so verification and password-reset links are
  usable.
- **Imagery** — the seed uses generated placeholders in
  `public/images/placeholders`, so nothing depends on a third-party CDN.
  Regenerate them with `pnpm exec tsx scripts/generate-placeholder-media.mjs`,
  or point `SEED_IMAGE_BASE_URL` at real photography.

`src/env.ts` refuses to start production with any of these, unless the app is
answering on localhost — so `pnpm build && pnpm start` works locally without
weakening the production guard.

### With Docker

```bash
docker compose up --build
```

Builds the real production image (not `next dev`), runs migrations, and starts
the app against a Postgres container.

---

## Commands

| Command                              | What it does                                          |
| ------------------------------------ | ----------------------------------------------------- |
| `pnpm dev`                           | Development server                                    |
| `pnpm build` / `pnpm start`          | Production build and server                           |
| `pnpm check`                         | Typecheck, lint and the full test suite               |
| `pnpm test`                          | Unit + integration (migrates the test database first) |
| `pnpm test:unit`                     | Unit tests only — no database needed                  |
| `pnpm test:integration`              | Integration tests against real Postgres               |
| `pnpm test:e2e`                      | Playwright, against a production build                |
| `pnpm db:migrate` / `pnpm db:deploy` | Migrations, development / production                  |
| `pnpm db:seed` / `pnpm db:reset`     | Seed / reset and reseed                               |
| `pnpm db:studio`                     | Prisma Studio                                         |

### Tests

Unit tests cover money arithmetic, the pricing engine, the order state machine
and redirect safety. Integration tests run against a real Postgres because the
things worth testing — atomic stock reservation, transactional order creation,
unique-constraint idempotency — _are_ the database.

`TEST_DATABASE_URL` must name a database containing `test`; the suite refuses to
run otherwise, because it truncates every table.

End-to-end tests need a built app:

```bash
pnpm build && pnpm test:e2e
```

If your environment ships a pre-installed Chromium, point Playwright at it with
`PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium` rather than downloading another.

---

## Layout

```
prisma/          schema, migrations, seed
src/
  app/
    (storefront)/  shop, product, cart, account — public and customer pages
    (checkout)/    checkout, deliberately without site navigation
    (auth)/        sign-in, register, password reset
    admin/         staff area, gated in its layout
    api/           webhooks, search suggest, health, maintenance
    actions/       server actions — thin adapters, no business logic
  server/          ALL business logic, framework-free and directly testable
    auth/ rbac/ money/ catalog/ cart/ checkout/ orders/ payments/
    inventory/ coupons/ reviews/ wishlist/ addresses/ admin/ search/
    integrations/  payments | storage | email, each behind an interface
  components/      UI — ui/ primitives, then feature folders
  content/         editorial pages (help, legal)
tests/             unit + integration
e2e/               Playwright
```

**The layering rule:** pages render, actions adapt, services decide, repositories
read and write. Nothing in `src/server` imports from `src/app`, so any of it can
be lifted into a standalone API without a rewrite.

---

## Going to production

1. **Database** — run `pnpm db:deploy` as a release step.
2. **Secrets** — set every variable in `.env.example`. `SESSION_SECRET` and
   `MAINTENANCE_TOKEN` should each be 32+ random bytes (`openssl rand -base64
48`) and **must differ from each other** — the app refuses to boot otherwise,
   because the maintenance token lives in your scheduler's configuration and
   should not also unlock anything else. The app will not boot with a
   placeholder either.
3. **Payments** — set `PAYMENT_PROVIDER=razorpay` with its key, secret and
   webhook secret, and point the Razorpay webhook at
   `https://your-domain/api/webhooks/razorpay` for `payment.captured`,
   `payment.failed` and `refund.processed`.
4. **Storage** — set `STORAGE_DRIVER=s3` with a bucket and a public CDN URL.
5. **Email** — set `EMAIL_DRIVER=resend` with an API key and a verified `EMAIL_FROM`.
6. **Scheduled maintenance** — `POST /api/maintenance` every few minutes with
   `Authorization: Bearer $MAINTENANCE_TOKEN`. It releases expired stock
   reservations (sending any back-in-stock notices that frees up) and sweeps
   rate-limit counters. **Without it, abandoned checkouts hold stock
   indefinitely.**
7. **Health** — point your load balancer at `GET /api/health`, which checks the
   database.
8. **Domains** — `APP_URL` must be the origin customers actually browse, because
   the CSRF check trusts only it. If you serve more than one hostname (apex and
   `www`, a staging alias), list the others in `ADDITIONAL_ORIGINS`, comma
   separated. Get this wrong and every form submission returns 403.

---

## Notes for whoever picks this up

- **Money is integer minor units (paise) everywhere.** `₹52,499.00` is
  `5249900`. `src/server/money` is the only place that rounds.
- **The client never sends a price.** Checkout re-reads every line from the
  database, re-validates the coupon, and recomputes tax and shipping.
- **The webhook is the authority on payment**, not the browser callback. Events
  are recorded under a unique key _before_ processing, so replays are no-ops.
- **Overselling is prevented by one conditional `UPDATE`**, not by read-then-write
  logic. Frontend stock checks are a courtesy.
- **Orders snapshot what was bought.** Editing a product never rewrites history.
- **Every account query is scoped by owner in the query itself**, never checked
  afterwards.

### Deliberately not built

Multi-currency, multi-warehouse, social login, MFA, a background job queue, a
headless mobile API, and CMS-managed content. Each has a clean insertion point;
none was built speculatively. See ARCHITECTURE.md §9.
