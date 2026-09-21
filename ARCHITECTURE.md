# Aurelia — Technical Architecture

> Premium jewellery e-commerce storefront + admin, built for the Indian market (INR, GST, UPI-first payments).

This document is the decision record for the stack, the system architecture and the data model.
It is written to be reviewed *before* the bulk of the implementation lands.

---

## 1. Executive summary

| Concern | Decision |
| --- | --- |
| Language | TypeScript (strict), end to end |
| Framework | Next.js 15 (App Router, React 19 Server Components) |
| Backend | Same Next.js process; business logic isolated in a framework-agnostic `src/server` layer |
| Database | PostgreSQL 16 |
| ORM | Prisma 6 |
| Auth | First-party session layer: Argon2id password hashing + opaque, DB-backed, hashed session tokens |
| Authorization | Role-based (`CUSTOMER` / `STAFF` / `ADMIN`) enforced in a single server-side guard |
| Payments | Razorpay (primary), behind a `PaymentProvider` interface |
| File storage | S3-compatible via presigned uploads, behind a `StorageProvider` interface (local driver for dev) |
| Search | PostgreSQL full-text (`tsvector` + GIN) with `pg_trgm` trigram fallback for typos/autocomplete |
| Caching | Next.js data cache + tag revalidation + HTTP caching. **No Redis.** |
| Email | Provider interface, Resend driver in prod, console driver in dev |
| Validation | Zod at every trust boundary (including `process.env`) |
| State | Server-owned state (cart/wishlist live in Postgres); client state kept deliberately tiny |
| UI | Tailwind CSS v4 + Radix UI primitives (shadcn-style, vendored) |
| Testing | Vitest (unit + integration against real Postgres) + Playwright (e2e) |
| Deploy | Single Docker image (`next build` standalone) + managed Postgres + S3/R2 + CDN |

---

## 2. Why this stack

### 2.1 Next.js 15 App Router — frontend *and* backend

E-commerce lives or dies on SEO and first-paint. Category and product pages must be
server-rendered, indexable HTML with correct metadata and structured data. The App Router gives us:

- **React Server Components** — product pages render on the server with zero client JS for the
  content that matters; only the interactive islands (gallery, variant picker, add-to-cart) ship JS.
- **Streaming + partial rendering** — the hero and product grid paint before reviews/related products resolve.
- **`next/image`** — automatic AVIF/WebP, correct `srcset`, blur placeholders. Jewellery is an
  image-heavy category; this is worth a lot.
- **Metadata API, `sitemap.ts`, `robots.ts`** — SEO primitives built in.
- **Route Handlers** — a proper place for webhooks (`/api/webhooks/razorpay`) that need the raw body.
- **Server Actions** — mutations without hand-written fetch plumbing, with the *server* as the
  single source of truth for price, discount and stock.

**Alternatives considered**

- *Separate NestJS API + React SPA.* Rejected for now. It doubles the deployment surface, splits
  auth/session handling across two services, and loses SSR for the pages that need indexing. The cost
  is real and the benefit (independent scaling, multi-client API) is hypothetical for a single store.
  Mitigation: all business logic lives in `src/server/**` and never in components or route handlers,
  so lifting it into a standalone service later is a move, not a rewrite.
- *Remix.* Comparable quality; smaller ecosystem for commerce integrations and no equivalent of the
  RSC-based zero-JS content rendering at the time of writing.
- *Astro.* Excellent for the marketing surface, weaker for the large interactive surface (cart,
  checkout, admin) — we would end up with two apps.

### 2.2 PostgreSQL 16

Everything expensive to get wrong here is relational: orders, payments, inventory and money.
Postgres gives us in one system what would otherwise be three:

- ACID transactions and `SELECT … FOR UPDATE` — the mechanism that actually prevents overselling.
- Partial and composite unique indexes — e.g. "one active cart per user", "one active variant SKU".
- `numeric`/`bigint` for money (we store **integer minor units**, never floats).
- `jsonb` for genuinely schemaless payloads (webhook bodies, audit metadata).
- **Full-text search** (`tsvector`, GIN) and **`pg_trgm`** — good enough search without another service.

*Alternative:* MySQL (weaker FTS, no partial indexes), MongoDB (wrong tool — this data is relational
and money needs transactions).

### 2.3 Prisma 6

Chosen for type safety and migration ergonomics: the generated client makes invalid queries a
compile error, `prisma migrate` produces reviewable SQL files, and the schema doubles as living
documentation of the data model.

*Trade-off:* Prisma's query builder is weaker than raw SQL for faceted search and analytics, and
it can emit inefficient queries if used carelessly. Mitigation: the catalogue search/filter query
and the admin dashboard aggregates are written as **parameterised raw SQL** (`$queryRaw` with
tagged templates — never string concatenation) inside the repository layer, where they're tested.

*Alternative:* Drizzle — lighter and closer to SQL, but its migration story and introspection are
less mature. Prisma wins on maintainability for a team that will grow.

### 2.4 Authentication — a deliberate choice

We implement the session layer ourselves, using standard, well-documented primitives:

- **Argon2id** (`@node-rs/argon2`, OWASP-recommended parameters) for password hashing.
- **Opaque session tokens**: 256 bits from a CSPRNG, sent in an `HttpOnly; Secure; SameSite=Lax`
  cookie, stored **SHA-256-hashed** in the database so a DB leak does not hand over live sessions.
- Sliding expiry, explicit revocation, and a per-user session list (the "sign out other devices" UX).
- Single-use, hashed, expiring tokens for email verification and password reset.

This is *not* rolling our own crypto — it is the standard opaque-token pattern, roughly 200 lines,
fully covered by tests.

**Why not Auth.js (NextAuth) v5?** Its Credentials provider **cannot use database sessions** — it
forces stateless JWTs. That directly conflicts with two hard requirements: server-side session
management and immediate revocation. Working around it means re-implementing sessions anyway, on top
of a framework we'd be fighting.

**Why not Better Auth?** A strong candidate and the closest alternative; it owns its own schema and
migration lifecycle, which we did not want entangled with the commerce schema. Revisit if we add
social login and MFA, where its breadth would start to pay for itself.

### 2.5 Payments — Razorpay, not Stripe

The store prices in **INR** and sells to Indian customers.

- **UPI** is the dominant payment method in Indian e-commerce; Razorpay supports UPI, RuPay,
  netbanking, domestic cards, wallets and no-cost EMI natively. Stripe's India support for domestic
  businesses is comparatively constrained.
- Razorpay settles to Indian bank accounts with the compliance paperwork Indian merchants already have.
- High-value jewellery orders make EMI and netbanking materially important; Razorpay covers both.

Implementation is behind a `PaymentProvider` interface (`createOrder`, `verifyCallbackSignature`,
`parseWebhookEvent`, `refund`) so Stripe can be added for an international storefront without touching
the order state machine. A `FakePaymentProvider` (deterministic, signature-verifying) backs tests and
credential-free local development — the *state machine itself is never faked*.

**Payment integrity rules (non-negotiable):**
1. Amounts are computed server-side from the database, never accepted from the client.
2. A checkout callback from the browser only *hints* that payment happened; it verifies the HMAC
   signature and then re-reads the provider's own record.
3. The **webhook is the source of truth** for `PAID`. Signatures are verified against the raw request
   body; every event is recorded in `PaymentEvent` with a unique `providerEventId`, making
   replays idempotent no-ops.

### 2.6 Search — Postgres first

Requirements are: name, SKU, category, brand, keyword relevance, autocomplete. At this catalogue size
(thousands of SKUs, not millions), Postgres handles all of it:

- A **generated `tsvector` column** on `Product`, weighted `name > sku/brand > tags > description`,
  indexed with GIN, ranked by `ts_rank_cd`.
- **`pg_trgm`** index for typo tolerance and prefix autocomplete ("dimond" → "diamond").

**We deliberately do not add Meilisearch/Elasticsearch.** It would be a second datastore to deploy,
secure, fund and keep in sync, buying us little at this scale. The trigger to revisit is concrete:
catalogue beyond ~100k SKUs, or a need for typo-tolerant faceted counts at sub-50ms. Search is behind
a `SearchService` interface so that swap stays local.

### 2.7 Caching — no Redis (yet)

Adding Redis "for scale" would be exactly the over-engineering we were asked to avoid. Instead:

- **Next.js data cache + tag-based revalidation** for the catalogue (`revalidateTag('product:<id>')`
  when an admin edits a product). Catalogue reads are the hot path and they are cacheable.
- **HTTP `Cache-Control` / `stale-while-revalidate`** on public pages, served by the CDN.
- **Postgres-backed fixed-window rate limiting** — one small table, correct across multiple app
  instances, and it disappears the moment we do add Redis.

Concrete triggers to introduce Redis: shared rate limiting under real attack volume, cross-instance
cart locking, or a background job queue. None of these exist yet.

### 2.8 Everything else, briefly

- **Storage** — product media goes to S3/R2 via **presigned PUT** URLs, so image bytes never pass
  through the app server. Uploads are constrained by content type and size, and keys are
  server-generated (the client never chooses a path). A local-disk driver keeps `pnpm dev` working
  with no cloud account.
- **Email** — transactional only (verification, password reset, order confirmation, shipping).
  Resend in production; in development the driver writes to stdout, so no one needs an API key to
  run the signup flow.
- **Validation** — Zod schemas at each boundary. `src/env.ts` parses `process.env` at startup and
  crashes early on misconfiguration rather than at 2am in a checkout.
- **UI** — Tailwind v4 (CSS-first config) + Radix primitives vendored in `src/components/ui`.
  Radix gives us focus traps, ARIA wiring and keyboard behaviour that we would otherwise get wrong.
  Type: Cormorant Garamond (display) + Inter (text), self-hosted through `next/font` (no layout shift,
  no third-party request).

---

## 3. System architecture

```
                    ┌──────────────────────────────────────────┐
   Browser ───────► │  CDN / Edge  (static assets, ISR HTML)    │
                    └───────────────────┬──────────────────────┘
                                        │
                    ┌───────────────────▼──────────────────────┐
                    │           Next.js 15 (Node runtime)      │
                    │                                          │
                    │  app/(storefront)  RSC pages, SEO, ISR   │
                    │  app/(account)     authenticated pages   │
                    │  app/admin         RBAC-gated admin      │
                    │  app/api/…         webhooks, feeds       │
                    │  ──────────────────────────────────────  │
                    │  src/server/       ← ALL business logic  │
                    │    modules/*/service.ts   use-cases      │
                    │    modules/*/repository.ts data access   │
                    │    modules/*/schema.ts     Zod contracts │
                    │    auth/  rbac/  money/  errors/         │
                    │    integrations/ payments|storage|email  │
                    └───┬────────────┬─────────────┬───────────┘
                        │            │             │
                 ┌──────▼─────┐ ┌────▼──────┐ ┌────▼─────────┐
                 │ PostgreSQL │ │ S3 / R2   │ │ Razorpay     │
                 │ (Prisma)   │ │ (media)   │ │ Resend       │
                 └────────────┘ └───────────┘ └──────────────┘
                        ▲                            │
                        └──── webhooks (verified) ◄──┘
```

### 3.1 Layering rules

1. **Pages / components** render. They may call services; they contain no business rules.
2. **Server Actions & Route Handlers** are thin adapters: authenticate → validate with Zod →
   call a service → map the result to a response. No SQL, no pricing maths.
3. **Services** own use-cases and transactions (`placeOrder`, `applyCoupon`, `reserveStock`). They are
   plain functions, importable from tests with no HTTP involved.
4. **Repositories** own data access and are the only place Prisma/SQL appears.
5. **Integrations** wrap third parties behind interfaces, each with a dev/test driver.

We use services and repositories where they earn their keep (commerce logic, catalogue querying).
We do **not** add interfaces, factories or DI containers for their own sake.

### 3.2 Request → order, end to end

```
add to cart ─► CartService.addItem   (validates variant is purchasable, live-prices the line)
checkout    ─► CheckoutService.createDraftOrder
                 ├─ re-prices every line from the DB  (client totals are ignored entirely)
                 ├─ re-validates the coupon against live rules + per-user usage
                 ├─ computes GST and shipping server-side
                 ├─ reserves inventory  (conditional UPDATE, expires in 15 min)
                 └─ creates Order(PENDING/…) + Payment(PENDING) in ONE transaction
pay         ─► PaymentProvider.createOrder(amount from the DB order)
callback    ─► verify HMAC → re-read provider record → optimistic status bump
webhook     ─► verify HMAC on RAW body → dedupe on providerEventId
                 └─ payment.captured → PAID: commit reservations, decrement stock,
                    record coupon redemption, mark cart CONVERTED, email the customer
```

Cancellation, expiry and refunds run the same machinery in reverse, releasing reservations and
restoring stock inside a transaction.

---

## 4. Data model

Full schema: `prisma/schema.prisma`. The decisions worth defending:

**Money is `Int` minor units (paise).** `₹52,499.00` is `5249900`. No floats anywhere in the
pricing path. A single `Money` module does all arithmetic, and rounding is explicit (half-up at the
line level, then summed — so the displayed lines always add up to the displayed total).

**Every product has at least one variant.** Even a one-size pendant gets a default variant. This
removes an entire class of `if (hasVariants)` branching from cart, inventory and orders: cart items,
order items and stock *always* point at a `ProductVariant`.

**Variant options are generic, not jewellery-specific.**
`ProductOption` ("Size") → `ProductOptionValue` ("6", "7", "8") → `VariantOptionValue` (join).
Ring sizes, bracelet S/M/L and chain lengths all fall out of the same three tables; adding
"Chain length" tomorrow is data, not a migration.

**Facets are data too.** `Attribute` (metal type, purity, stone type, material) → `AttributeValue`
("22K", "Diamond") → `ProductAttributeValue` (join). Filters are built by generating one `EXISTS`
clause per attribute — *OR within an attribute, AND across attributes* — which is both the correct
faceted-search semantic and index-friendly. The alternative (a column per jewellery property) would
mean a schema migration every time merchandising invents a facet.
`gender`, `status` and price stay as real columns because they are on nearly every query.

**Inventory is its own table, one row per variant**, holding `quantity`, `reserved` and
`lowStockThreshold`. Reservations are rows in `InventoryReservation` with an expiry.
Overselling is prevented by a **conditional update** —
`UPDATE "Inventory" SET reserved = reserved + $n WHERE variantId = $v AND quantity - reserved >= $n`
— which is atomic in Postgres; if it updates zero rows, the checkout fails cleanly. Frontend stock
checks are a UX nicety only; this is the actual enforcement.

**Orders store immutable snapshots.** `OrderItem` copies the product name, variant label, SKU, image
and unit price at purchase time; `OrderAddress` copies the address. Renaming a product or deleting an
address next year must not rewrite history, and an invoice must be reproducible forever.

**Order status and payment status are separate enums.** An order can be `CONFIRMED` while its payment
is `PARTIALLY_REFUNDED`; conflating them produces states that cannot be expressed.

**No `Role`/`Permission` tables.** There are three static roles and permissions are compile-time
constants in `src/server/rbac`. Database-backed permissions would add joins to every request and a
migration path we have no product requirement for. When customer-configurable roles appear, the
guard is the one place that changes.

**No `RecentlyViewed` table.** It is per-browser, low-value, high-write data — it lives in
`localStorage`, and the server only hydrates the product cards. Not every feature needs a table.

**Soft deletion only where history depends on it** — `Product`, `ProductVariant`, `Address`, `User`.
Carts, sessions and reservations are hard-deleted or expired; keeping them would just be litter.

**Indexes are placed against real queries**, not sprinkled: catalogue listing
(`status, publishedAt`, `categoryId`, `basePriceMinor`), search (GIN on `searchVector`, trigram on
`name`), order lookup (`userId, createdAt`, `orderNumber`), webhook idempotency
(unique `providerEventId`), and the partial unique index enforcing one active cart per user.

---

## 5. Security posture

| Threat | Control |
| --- | --- |
| SQL injection | Prisma parameterises everything; raw SQL only via tagged templates. No string-built SQL. |
| XSS | React escapes by default; no `dangerouslySetInnerHTML` on user content; strict CSP header. |
| CSRF | `SameSite=Lax` session cookie + `Origin` check on every state-changing request. |
| Broken authorization | One `requireUser` / `requireRole` guard; admin routes additionally gated in middleware. |
| IDOR | Every resource read is scoped by owner (`where: { id, userId }`), never by id alone. |
| Session attacks | Hashed tokens at rest, rotation on privilege change, revocation list, sliding expiry. |
| Mass assignment | Zod schemas whitelist fields; Prisma inputs are constructed explicitly, never spread from the body. |
| Price / discount manipulation | Totals are recomputed server-side at checkout. Client totals are display-only. |
| Coupon abuse | Server-side validation of window, usage caps and per-user caps, enforced by a unique redemption row inside the order transaction. |
| Inventory manipulation | Atomic conditional updates + expiring reservations. |
| Payment spoofing | HMAC verification on callbacks *and* webhooks, against the raw body; orders are only marked paid from a verified provider event. |
| Brute force / abuse | Rate limits on login, registration, password reset, coupon application and checkout. |
| Secret exposure | Zod-validated env; only `NEXT_PUBLIC_*` reaches the browser; `.env.example` holds no real values. |

Security headers (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`) are set
centrally in `next.config.ts` / middleware.

---

## 6. SEO & performance

- Server-rendered catalogue with canonical URLs; filters are **real URL query params**, so a filtered
  view is shareable and can be indexed or deliberately `noindex`-ed (thin filter combinations are
  `noindex, follow` to avoid crawl bloat).
- `Product`, `BreadcrumbList` and `Organization` JSON-LD on the relevant pages.
- `sitemap.ts` streams products, categories and collections; `robots.ts` blocks `/admin`, `/account`,
  `/checkout` and `/api`.
- Images: `next/image` with AVIF/WebP, explicit dimensions (no CLS), lazy below the fold, priority on
  the LCP hero.
- Fonts self-hosted and preloaded, `display: swap`.
- Client JS budget: the home page and PDP ship only the interactive islands. No global state library.
- Catalogue queries are paginated (keyset where ordering allows), and list views select only the
  columns a card renders.

---

## 7. Testing strategy

| Layer | Tool | What it covers |
| --- | --- | --- |
| Unit | Vitest | Money arithmetic, pricing/tax/shipping, coupon rules, order state machine, RBAC, webhook signature verification |
| Integration | Vitest + real Postgres | Cart merge on login, concurrent checkout (overselling), order placement transaction, webhook idempotency, review eligibility, admin authorization |
| E2E | Playwright | Browse → filter → PDP → add to cart → checkout → pay (fake provider) → order confirmation; login/register; admin product creation |

Tests target behaviour that can actually break in production. We do not write assertions against
rendered markup for its own sake, and we do not chase a coverage number.

---

## 8. Deployment

Single **Docker image** from `next build` (standalone output) — runs on Railway, Fly, Render, ECS or
a plain VM; Vercel also works with no changes.

- **Postgres**: managed (RDS / Neon / Railway). Migrations run as a release step (`prisma migrate deploy`).
- **Media**: S3 or Cloudflare R2 behind a CDN. R2 is the cheaper default (no egress fees), and the
  storage interface makes the choice reversible.
- **Secrets**: injected as environment variables; `src/env.ts` fails the boot if any are missing.
- **Observability**: structured JSON logs with a request id; `/api/health` for liveness.

Estimated baseline cost at launch: a small app instance + a small managed Postgres + R2 — roughly
$25–40/month, with no second datastore to pay for. That is a deliberate outcome of the "no Redis, no
Elasticsearch until there's a reason" stance.

---

## 9. Deliberate non-goals (v1)

Multi-currency, multi-warehouse, social login, MFA, a background job queue, a headless mobile API,
CMS-managed landing pages, and returns beyond the request/approve states. Each has a clean
insertion point above; none is built speculatively.

---

## 10. Explicit assumptions

1. Single storefront, single currency (**INR**), shipping within India.
2. **GST 3%** on jewellery — configurable per category, with an environment-level default.
3. One warehouse; no split fulfilment.
4. Guest checkout is allowed; an order is linked to a user account when one is signed in.
5. Reviews require a delivered purchase of that product (see `ReviewService`), which is the honest
   definition of "verified".
6. Prices are entered and stored GST-inclusive is **false** — prices are ex-tax and GST is added at
   checkout, shown as a separate line.
