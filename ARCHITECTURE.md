# Aurelia — Technical Architecture

> Premium jewellery e-commerce storefront + admin, built for the Indian market (INR, GST, UPI-first payments).

This document is the decision record for the stack, the system architecture and the data model.
It is written to be reviewed _before_ the bulk of the implementation lands.

---

## 1. Executive summary

| Concern       | Decision                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Language      | TypeScript (strict), end to end                                                                  |
| Framework     | Next.js 15 (App Router, React 19 Server Components)                                              |
| Backend       | Same Next.js process; business logic isolated in a framework-agnostic `src/server` layer         |
| Database      | PostgreSQL 16                                                                                    |
| ORM           | Prisma 6                                                                                         |
| Auth          | First-party session layer: Argon2id password hashing + opaque, DB-backed, hashed session tokens  |
| Authorization | Role-based (`CUSTOMER` / `STAFF` / `ADMIN`) enforced in a single server-side guard               |
| Payments      | Razorpay (primary), behind a `PaymentProvider` interface                                         |
| File storage  | S3-compatible via presigned uploads, behind a `StorageProvider` interface (local driver for dev) |
| Search        | PostgreSQL full-text (`tsvector` + GIN) with `pg_trgm` trigram fallback for typos/autocomplete   |
| Caching       | Next.js data cache + tag revalidation + HTTP caching. **No Redis.**                              |
| Email         | Provider interface, Resend driver in prod, console driver in dev                                 |
| Validation    | Zod at every trust boundary (including `process.env`)                                            |
| State         | Server-owned state (cart/wishlist live in Postgres); client state kept deliberately tiny         |
| UI            | Tailwind CSS v4 + Radix UI primitives (shadcn-style, vendored)                                   |
| Testing       | Vitest (unit + integration against real Postgres) + Playwright (e2e)                             |
| Deploy        | Single Docker image (`next build` standalone) + managed Postgres + S3/R2 + CDN                   |

---

## 2. Why this stack

### 2.1 Next.js 15 App Router — frontend _and_ backend

E-commerce lives or dies on SEO and first-paint. Category and product pages must be
server-rendered, indexable HTML with correct metadata and structured data. The App Router gives us:

- **React Server Components** — product pages render on the server with zero client JS for the
  content that matters; only the interactive islands (gallery, variant picker, add-to-cart) ship JS.
- **Streaming + partial rendering** — the hero and product grid paint before reviews/related products resolve.
- **`next/image`** — automatic AVIF/WebP, correct `srcset`, blur placeholders. Jewellery is an
  image-heavy category; this is worth a lot.
- **Metadata API, `sitemap.ts`, `robots.ts`** — SEO primitives built in.
- **Route Handlers** — a proper place for webhooks (`/api/webhooks/razorpay`) that need the raw body.
- **Server Actions** — mutations without hand-written fetch plumbing, with the _server_ as the
  single source of truth for price, discount and stock.

**Alternatives considered**

- _Separate NestJS API + React SPA._ Rejected for now. It doubles the deployment surface, splits
  auth/session handling across two services, and loses SSR for the pages that need indexing. The cost
  is real and the benefit (independent scaling, multi-client API) is hypothetical for a single store.
  Mitigation: all business logic lives in `src/server/**` and never in components or route handlers,
  so lifting it into a standalone service later is a move, not a rewrite.
- _Remix._ Comparable quality; smaller ecosystem for commerce integrations and no equivalent of the
  RSC-based zero-JS content rendering at the time of writing.
- _Astro._ Excellent for the marketing surface, weaker for the large interactive surface (cart,
  checkout, admin) — we would end up with two apps.

### 2.2 PostgreSQL 16

Everything expensive to get wrong here is relational: orders, payments, inventory and money.
Postgres gives us in one system what would otherwise be three:

- ACID transactions and `SELECT … FOR UPDATE` — the mechanism that actually prevents overselling.
- Partial and composite unique indexes — e.g. "one active cart per user", "one active variant SKU".
- `numeric`/`bigint` for money (we store **integer minor units**, never floats).
- `jsonb` for genuinely schemaless payloads (webhook bodies, audit metadata).
- **Full-text search** (`tsvector`, GIN) and **`pg_trgm`** — good enough search without another service.

_Alternative:_ MySQL (weaker FTS, no partial indexes), MongoDB (wrong tool — this data is relational
and money needs transactions).

### 2.3 Prisma 6

Chosen for type safety and migration ergonomics: the generated client makes invalid queries a
compile error, `prisma migrate` produces reviewable SQL files, and the schema doubles as living
documentation of the data model.

_Trade-off:_ Prisma's query builder is weaker than raw SQL for faceted search and analytics, and
it can emit inefficient queries if used carelessly. Mitigation: the catalogue search/filter query
and the admin dashboard aggregates are written as **parameterised raw SQL** (`$queryRaw` with
tagged templates — never string concatenation) inside the repository layer, where they're tested.

_Alternative:_ Drizzle — lighter and closer to SQL, but its migration story and introspection are
less mature. Prisma wins on maintainability for a team that will grow.

### 2.4 Authentication — a deliberate choice

We implement the session layer ourselves, using standard, well-documented primitives:

- **Argon2id** (`@node-rs/argon2`, OWASP-recommended parameters) for password hashing.
- **Opaque session tokens**: 256 bits from a CSPRNG, sent in an `HttpOnly; Secure; SameSite=Lax`
  cookie, stored **SHA-256-hashed** in the database so a DB leak does not hand over live sessions.
- Sliding expiry, explicit revocation, and a per-user session list (the "sign out other devices" UX).
- Single-use, hashed, expiring tokens for email verification and password reset.

This is _not_ rolling our own crypto — it is the standard opaque-token pattern, roughly 200 lines,
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
credential-free local development — the _state machine itself is never faked_.

**Payment integrity rules (non-negotiable):**

1. Amounts are computed server-side from the database, never accepted from the client.
2. A checkout callback from the browser only _hints_ that payment happened; it verifies the HMAC
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
order items and stock _always_ point at a `ProductVariant`.

**Variant options are generic, not jewellery-specific.**
`ProductOption` ("Size") → `ProductOptionValue` ("6", "7", "8") → `VariantOptionValue` (join).
Ring sizes, bracelet S/M/L and chain lengths all fall out of the same three tables; adding
"Chain length" tomorrow is data, not a migration.

**Facets are data too.** `Attribute` (metal type, purity, stone type, material) → `AttributeValue`
("22K", "Diamond") → `ProductAttributeValue` (join). Filters are built by generating one `EXISTS`
clause per attribute — _OR within an attribute, AND across attributes_ — which is both the correct
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

| Threat                        | Control                                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| SQL injection                 | Prisma parameterises everything; raw SQL only via tagged templates. No string-built SQL.                                          |
| XSS                           | React escapes by default; no `dangerouslySetInnerHTML` on user content; strict CSP header.                                        |
| CSRF                          | `SameSite=Lax` session cookie + `Origin` check on every state-changing request.                                                   |
| Broken authorization          | One `requireUser` / `requireRole` guard; admin routes additionally gated in middleware.                                           |
| IDOR                          | Every resource read is scoped by owner (`where: { id, userId }`), never by id alone.                                              |
| Session attacks               | Hashed tokens at rest, rotation on privilege change, revocation list, sliding expiry.                                             |
| Mass assignment               | Zod schemas whitelist fields; Prisma inputs are constructed explicitly, never spread from the body.                               |
| Price / discount manipulation | Totals are recomputed server-side at checkout. Client totals are display-only.                                                    |
| Coupon abuse                  | Server-side validation of window, usage caps and per-user caps, enforced by a unique redemption row inside the order transaction. |
| Inventory manipulation        | Atomic conditional updates + expiring reservations.                                                                               |
| Payment spoofing              | HMAC verification on callbacks _and_ webhooks, against the raw body; orders are only marked paid from a verified provider event.  |
| Brute force / abuse           | Rate limits on login, registration, password reset, coupon application and checkout.                                              |
| Secret exposure               | Zod-validated env; only `NEXT_PUBLIC_*` reaches the browser; `.env.example` holds no real values.                                 |
| Secret blast radius           | `MAINTENANCE_TOKEN` is separate from `SESSION_SECRET` and boot fails if they match — the scheduler's copy leaks more easily.      |
| Origin spoofing               | The CSRF allowlist comes from `APP_URL` + `ADDITIONAL_ORIGINS` only, never from the request's own `Host`/`X-Forwarded-Host`.      |

Security headers are split by what can vary: the ones that are identical on every response
(`HSTS`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`) stay
declarative in `next.config.ts`; the Content-Security-Policy is built per request in
`src/middleware.ts` from `src/server/security/csp.ts`.

### Why there are two Content-Security-Policies

A nonce is the only thing that makes a CSP actually stop XSS — a policy containing
`'unsafe-inline'` permits exactly what an injection needs. But Next.js can only stamp a nonce into
its bootstrap scripts while rendering, so **any page issued a nonce renders per request** and loses
its ISR cache.

That cache is the difference between a fast catalogue and a slow one, and it is worth nothing on the
pages that matter most for this threat. So:

- **`/account`, `/admin`, `/checkout`, `/cart`, `/sign-in`, `/register`** — one customer's data and
  all the privileged actions. These are already `force-dynamic`, so a nonce costs nothing. They get
  `'nonce-…' 'strict-dynamic'` and **no** `'unsafe-inline'`.
- **Everything else** — the ISR-cached catalogue. Keeps `'unsafe-inline'` for Next's bootstrap, and
  still denies `eval`, plugins, framing and off-origin form posts.

This is a trade, not a claim that the public pages are protected. What bounds the risk there is that
they render admin-authored catalogue copy and React-escaped review text — no customer-supplied HTML
reaches the DOM anywhere in the app. `'unsafe-eval'` is emitted in development only, for React
Refresh; `e2e/security.spec.ts` asserts it never ships.

### Where the authorization boundary actually is

Three layers, and only one of them is load-bearing:

1. **Edge middleware** redirects anonymous traffic away from `/account` and `/admin` and marks
   private responses `no-store`. It runs on the Edge runtime with **no database access**, so it can
   only observe that a session cookie _exists_ — not that it is valid, unexpired, or privileged. It
   is a cheap first gate, not a control.
2. **The layout** (`app/admin/layout.tsx`) resolves the session from Postgres and checks the role.
   This is where every admin page passes through, so a new page cannot be added without it.
3. **Each action** independently re-checks a _specific permission_. Hiding a button is presentation;
   this is the authorization. `order:refund` is deliberately withheld from `STAFF`, so a staff
   member who crafts the request still cannot move money.

Guest surfaces get the same treatment by a different mechanism: a guest has no account to scope an
order to, so checkout issues an httpOnly **claim cookie** binding the order to the browser that
started it. Abandoning a checkout and viewing a confirmation both require that claim — an order id
alone is never enough, because order numbers appear in emails and on packing slips.

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

| Layer       | Tool                   | What it covers                                                                                                                                    |
| ----------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Vitest                 | Money arithmetic, pricing/tax/shipping, coupon rules, order state machine, RBAC, webhook signature verification                                   |
| Integration | Vitest + real Postgres | Cart merge on login, concurrent checkout (overselling), order placement transaction, webhook idempotency, review eligibility, admin authorization |
| E2E         | Playwright             | Browse → filter → PDP → add to cart → checkout → pay (fake provider) → order confirmation; login/register; admin product creation                 |

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

## 10. What shipped against this plan

Everything in sections 1–8 is built and exercised by tests. Four decisions were
revised while implementing, and the reasons are worth recording:

| Planned                              | Shipped                                                                                                                           | Why                                                                                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tags excluded from the search vector | Tags folded in via `array_to_tsvector`, with a CHECK constraint stating the non-empty-lowercase requirement that function imposes | Searching "diamond ring" missed a diamond solitaire whose prose never used the word. The constraint makes the hazard explicit rather than latent.                                   |
| `similarity()` for typo tolerance    | `word_similarity()`                                                                                                               | `similarity()` scores a query against the _whole_ name, so "emerld" against "Vaani Emerald Pendant" is 0.21 — a miss. `word_similarity` scores the best matching word: 0.57.        |
| One login rate limit                 | Split into a generous per-IP ceiling and a strict per-account limit                                                               | A tight per-IP limit locks out everyone behind an office or carrier NAT long before it troubles an attacker with proxies. The limit that defends an account belongs on the account. |
| Guest order scoping unspecified      | An httpOnly checkout claim cookie                                                                                                 | A guest has no account to scope an order to, and an order number alone is not a secret — it appears in emails and on packing slips.                                                 |

Two production-readiness gaps surfaced only by running the thing:

- `revalidateTag` throws outside a request context, so cache invalidation could
  roll back the admin write that had just succeeded. It is now best-effort.
- The production env guard made `pnpm build && pnpm start` impossible locally,
  which is exactly how such guards end up weakened. It now also checks the app's
  own origin: a deployment answering on localhost is not a production
  deployment.

## 11. Phase 2: what changed

A second pass over the shipped application — security review, accessibility,
motion, and one new feature. `SECURITY-REVIEW.md` is the full assessment.

**Security.** Nine findings, all fixed with regression tests; each negative test
was run against the original code to confirm it fails there. The substantive one
was an authorization gate written as a list of rejections
(`a && b && a !== b`), which collapses to `false` whenever either side is null
— it let an anonymous caller past the ownership check on a customer's order.
Production stopped those calls anyway, at the signature check below it, which is
precisely why it needed fixing: a gate that works only because of what happens
after it stops working the moment that other thing moves.

**Accessibility.** `axe-core` now runs over eleven pages at WCAG 2.1 A and AA on
both viewports, failing the build on any violation. It found that the muted text
token was 3.47:1 sitewide — under the 4.5:1 floor on every page — and that two
status colours were worse. Every token was re-derived by measurement against
each background it actually composites over.

**Motion.** Scroll-linked reveals built on `animation-timeline: view()` rather
than an IntersectionObserver. A JS reveal has to start its content hidden, so a
script failure or a strict CSP leaves the page blank; this is decoration on
content that is already painted, and browsers without scroll-driven animations
simply get a fade. `prefers-reduced-motion` detaches the timeline — collapsing
`animation-duration`, which the global rule does, has no effect on an animation
whose progress comes from scroll position rather than from time.

**Back-in-stock alerts.** Deliberately one-shot: a request is consumed when the
email goes out. No standing subscription means no unsubscribe token to mint, no
unsubscribe route to secure, and no address retained after it has served its
purpose. It is also the only place a visitor can make the server mail somebody
else, so it is rate limited per browser _and_ per target address.

**Mobile.** The `mobile` Playwright project existed but CI only ever ran
`--project=chromium`, so it had never been green. Running it surfaced three
failures, all fixture leakage across the two projects rather than product bugs —
an address cap reached by accumulated test data, a wishlist left populated, a
login budget spent twice over. CI now runs both projects.

---

## 12. Phase 3: the category's own conventions

Research into how Indian jewellery is actually sold, turned into product.

**Price breakup.** The defining feature of the category — Tanishq, CaratLane and
Mia all publish metal weight × rate, making charges, stones and GST line by
line, because a customer comparing two gold rings cannot compare sticker prices
when most of the difference is weight they cannot see.

The design decision that matters is what happens when the breakdown is wrong:
`server/catalog/price-breakdown.ts` **drops it silently**. Components must sum
to the ex-tax price to the paisa; anything else renders nothing and logs why. It
is explicitly not a second pricing engine — it never decides what anything
costs, and it takes the GST figure from `priceOrder` rather than recomputing it,
because a second opinion about tax is exactly the bug a breakdown exists to rule
out.

Building it found a real one. The product page said **"Inclusive of GST"** while
`priceOrder` adds GST on top, so the page showed one number and the checkout
charged a larger one. `e2e/pricing.spec.ts` now reads the breakup off the
product page and the totals off the checkout and asserts they agree.

**Seed coherence.** The catalogue had three sets of numbers — price, metal
weight, stone weight — invented independently, and they contradicted each other:
a 10.8 g 22K signet ring priced at ₹89,000 is _below the melt value of its own
gold_. Fifteen of twenty-six variants were in that state. Weights are now
derived from the price at real market rates, stone weights come from the specs
that state them, and making charges are the remainder — so the breakdown
reconciles by construction. Two pieces priced below the cost of their own
diamonds had their prices corrected.

**Indian ring sizing.** The catalogue used 6–9, which are US numbers; in the
Indian system those are child sizes. The help page already said "We use Indian
ring sizes", so the data was contradicting the copy. Sizes are now 12–22, and
`content/ring-sizes.ts` carries the chart with circumference derived from
diameter so the two columns cannot drift.

**Delivery estimates.** `server/delivery/estimate.ts` is pure and clock-injected,
because a promised date is a promise: cut-off times, Sundays and IST are tested
across a fortnight of order times for every zone. Deliberately not a table —
zones change roughly never, and moving them into an admin screen would take a
promise the shop is held to out of code review.

**Assurances.** Four claims beside the buy button, each linking to the policy it
comes from. Writing them caught two overstatements against the real policy —
"30-day returns" where the policy says fifteen, and "IGI or GIA" where it says
IGI — and an e2e test now asserts the claim and the policy still agree.

**Gift options.** Jewellery is overwhelmingly bought as a gift, and the order
note field was carrying the load — "please gift wrap it" buried in a paragraph
the packing bench has to read and interpret. Now an explicit choice on the
order snapshot (not the customer profile: what was asked for at the time is what
gets packed, and a later profile edit must not change a parcel already on the
bench), flagged in the admin list as well as on the order, and shown back to the
customer so a wrong message is found before the parcel is.

Wrapping is free, which is both authentic for the category and the reason it
does not touch `priceOrder` — a charge would have to go through the pricing
engine rather than be bolted on beside it.

**Performance.** Measured on a throttled mid-range phone (4× CPU, slow 4G)
rather than assumed. LCP is under 1s on every page and the shared bundle is
103 kB, but the product page measured **CLS 0.186** — nearly twice the "poor"
threshold — while every other page measured 0.000, so nothing in the aggregate
pointed at it.

The cause was the breadcrumb: it wrapped to two lines in the metric-adjusted
fallback font and reflowed to one when the web font swapped in, moving
everything below it 22px up. It now cannot wrap — one line, scrolling sideways
on a phone, which is the better layout there anyway. CLS 0.186 → 0.000.

`e2e/performance.spec.ts` guards this in two ways, because the obvious way
does not work: reverting the fix and re-running the vitals budgets **did not
reliably fail them**, since whether the shift happens depends on whether the
font lands before or after first paint. The budgets are kept as a coarse guard
and labelled as one; the actual guard asserts the structural property — the
trail is `nowrap` and one line high at 320px — which fails deterministically on
the old markup.

**Engraving.** The catalogue already promised it — the signet's description
says "Hand engraving is included", its specs list it, and the returns policy is
written around it ("Engraved pieces cannot be returned... This is stated on the
product page before you order"). There was no way to say what to cut, so the
checkout note field was carrying it.

The interesting part is not storing a string; it is what "the same item" means
once a piece can be personalised. Two size-18 signets reading different
initials are two lines; two reading the same are one line of quantity two. That
cannot be expressed over a nullable column, because Postgres treats NULL as
distinct from NULL — `@@unique([cartId, variantId, engravingText])` would
silently permit two plain lines of the same variant. So `CartItem` carries an
`engravingKey` that collapses absent to `''`, and a CHECK constraint keeps it in
lockstep with the text so no call site can get it wrong.

The non-returnable warning appears on the product page as the text is typed,
not at checkout: that sentence is only fair where the decision is made.

---

## 13. Explicit assumptions

1. Single storefront, single currency (**INR**), shipping within India.
2. **GST 3%** on jewellery — configurable per category, with an environment-level default.
3. One warehouse; no split fulfilment.
4. Guest checkout is allowed; an order is linked to a user account when one is signed in.
5. Reviews require a delivered purchase of that product (see `ReviewService`), which is the honest
   definition of "verified".
6. Prices are entered and stored GST-inclusive is **false** — prices are ex-tax and GST is added at
   checkout, shown as a separate line.
