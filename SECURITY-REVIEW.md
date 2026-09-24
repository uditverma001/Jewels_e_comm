# Security review — phase 2

A vulnerability assessment of the Aurelia storefront, carried out against the code and a running
instance. This records what was examined, what was found, what was fixed, and — just as usefully —
what was checked and turned out to be sound.

Severities describe the risk **as the code actually shipped**, not the worst thing the pattern could
become. Where a flaw was real but something else downstream happened to stop it, that is stated
plainly rather than inflated.

---

## Scope and method

| Surface                                                                   | How it was examined                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 44 server actions, in 10 files (every mutation in the app at review time) | Read line by line for the guard sequence                     |
| 5 route handlers                                                          | Read in full; auth, limits and body handling                 |
| Auth, session, RBAC, CSRF, tokens                                         | Read in full                                                 |
| Payments, inventory, orders, cart, coupons                                | Read in full, plus integration tests against real Postgres   |
| Injection surfaces                                                        | Repo-wide sweep for raw SQL, `dangerouslySetInnerHTML`       |
| HTTP headers and CSP                                                      | Live responses inspected; browser console checked for blocks |
| Dependencies                                                              | `pnpm audit`                                                 |
| Accessibility                                                             | axe-core, 11 pages, WCAG 2.1 A + AA, both viewports          |

Every fix below carries a regression test. Where a test asserts the absence of a bug, it was also
run against the original code to confirm it fails there — a negative test that never failed is not
evidence of anything.

---

## Findings

### 1. Authorization gate collapsed when either side was null — Medium

`verifyCheckoutCallback` decided ownership with:

```ts
if (order.userId && actorUserId && order.userId !== actorUserId) throw forbidden();
```

A `null` on either side makes the whole condition false, so the gate silently permitted two cases it
was written to stop: an **anonymous** caller against a signed-in customer's order, and a
**signed-in stranger** against a guest's order.

In production every such call was still rejected a few lines later — a forged signature fails the
HMAC check, and a replayed signature from the attacker's own purchase fails because the `Payment`
row is looked up by `(orderId, providerOrderId)` together. So this was not exploitable as shipped.
It is reported as Medium rather than Informational because an authorization check that only works
because of what happens after it will stop working the moment that other thing is refactored, and
nothing would have failed to warn us.

**Fixed** by replacing the rejection list with a positive `callerOwnsOrder`: a guest order is owned
solely by the browser holding the httpOnly checkout claim; a customer's order by that customer, or
by that same claim (so a session expiring mid-payment does not strand someone who has been charged).

### 2. The payment simulator waved through any signed-in caller — Medium (development)

`simulateFakePaymentAction` pre-checked `if (!user && !hasCheckoutClaim(orderId))`, which passes
unconditionally whenever anyone is signed in. This matters more than finding 1: the simulator
**mints its own valid signature**, so the binding that protects the real callback is absent by
design. Any signed-in user could have driven a stranger's order to paid on a development instance.

**Fixed** by deleting the pre-check and letting `verifyCheckoutCallback` be the single ownership
authority — which, after finding 1, it now actually is.

### 3. Content-Security-Policy permitted inline script everywhere — Medium

Every route was served `script-src 'self' 'unsafe-inline' 'unsafe-eval'`. A policy containing
`'unsafe-inline'` permits precisely what an XSS payload is, and `'unsafe-eval'` hands an injection a
code-execution primitive; the policy was documentation rather than a control.

**Fixed** with a route-split policy (`src/server/security/csp.ts`). The private surfaces — already
`force-dynamic`, so a nonce costs nothing — get `'nonce-…' 'strict-dynamic'` and no inline script.
The ISR-cached catalogue keeps `'unsafe-inline'`, because a nonce there would force per-request
rendering and discard the cache. `'unsafe-eval'` is now development-only.

This is a deliberate trade and is documented as one in `ARCHITECTURE.md §5`. What bounds the
residual risk is that no customer-supplied HTML reaches the DOM anywhere in the app.

### 4. One secret served two trust domains — Medium

`SESSION_SECRET` was also the bearer token for `/api/maintenance` and the HMAC key for the
development payment provider. The maintenance token has to be pasted into a scheduler's
configuration — cron UIs, CI variables, job logs — which is a materially more exposed place than an
application secret store. A leak from the scheduler would have handed over the other uses too.

**Fixed**: `MAINTENANCE_TOKEN` is its own variable, required in production, and boot fails if it is
set to the same value as `SESSION_SECRET`.

### 5. Constant-time comparison leaked the secret's length — Low

The maintenance endpoint guarded `timingSafeEqual` with `if (a.length !== b.length) return false`,
which is necessary (it throws on unequal lengths) and also turns the token's length into something
an attacker can measure by response timing.

**Fixed** by comparing SHA-256 digests, so every comparison is a fixed 32 bytes.

### 6. The CSRF allowlist was built from the request's own headers — Low

`assertSameOrigin` added the incoming `Host` and `X-Forwarded-Host` to the set of permitted origins,
letting a request vouch for itself. Not reachable from a browser — script cannot set either header
cross-origin — but the check is supposed to be independent of the caller.

**Fixed**: the allowlist now comes from `APP_URL` plus an explicit `ADDITIONAL_ORIGINS` list.

> This one has a deployment consequence worth knowing: `APP_URL` must match the origin customers
> actually browse. If the site answers on both apex and `www`, list the other in
> `ADDITIONAL_ORIGINS` or every mutation returns 403. It surfaced immediately — an integration test
> that claimed to send a same-origin request had in fact been passing only because of the header
> fallback.

### 7. The webhook buffered the body before checking its size — Low

`MAX_BODY_BYTES` was enforced after `await request.text()`, by which point the oversized payload was
already in memory. This is the one endpoint that is unauthenticated until the signature check.

**Fixed** with a `content-length` pre-check, keeping the post-read check as the backstop for chunked
requests.

### 8. An unauthenticated endpoint had no rate limit — Low

`POST /api/products/by-ids` runs a join per call and had no limit. **Fixed** with a dedicated
`productHydrate` bucket.

### 9. Five vulnerable transitive dependencies — Low (build-time)

`pnpm audit` reported 3 high and 2 moderate: four in `postcss` (via `next`) and one in
`deepmerge-ts` (via `prisma`). All are build-time paths that process our own source, not request
input, so the practical exposure was low.

**Fixed** with `pnpm.overrides` pinning `postcss >=8.5.23` and `deepmerge-ts >=8.0.0`. `pnpm audit`
now reports no known vulnerabilities.

---

### 10. Accessibility: the muted text colour failed WCAG AA sitewide — Medium

Not a security finding, but found by the same sweep and worth the same treatment.
`--color-stone-500` — the token behind every eyebrow, breadcrumb, caption and SKU
— measured **3.47:1** against the ivory backgrounds, under the 4.5:1 AA floor for
text at that size. It failed on all eight public pages plus account and admin.
The three status colours failed too: `success` at 3.80:1, and `warning` so far off
that the warning badge had been patched with a hardcoded darker text colour, which
is the tell that the token was wrong rather than the component.

A `<dl>` in the account summary also wrapped each `<dt>`/`<dd>` pair in an `<a>`,
which is invalid and costs the description-list semantics entirely.

**Fixed** by measuring rather than guessing: each token was sampled through a
canvas read-back against every background it composites over — ivory, white, and
the badge tints as they land on both storefront and admin panels — and set to the
lightest value clearing 4.5:1 with margin. `e2e/accessibility.spec.ts` now runs
axe over eleven pages under WCAG 2.1 A and AA and fails the build on any
violation.

---

## Checked and found sound

Worth recording, because "we looked" is information:

- **SQL injection** — no `$queryRawUnsafe`, no `$executeRawUnsafe`, no `Prisma.raw`. Every raw query
  is a tagged template; the faceted search interpolates only through `Prisma.sql`/`Prisma.join`.
- **JSON-LD injection** — the three `dangerouslySetInnerHTML` call sites all pass through `jsonLd()`,
  which escapes `<` to `<`, so a product name cannot break out of the `<script>` block.
- **Review integrity** — a review requires an order line for that product in a **`DELIVERED`** order
  belonging to the reviewer, plus a unique `(productId, userId)` index. "Verified" means something.
- **Cart integrity** — adding an item re-reads the variant with `isActive`, `deletedAt: null` and
  `product.status = 'ACTIVE'` in the `where`, so an archived or draft piece cannot be bought by id.
- **IDOR on order views** — both the account order page and the guest confirmation scope ownership
  inside the query rather than checking after the fetch.
- **Order cancellation** — `cancelOrder` compares `order.userId !== requireOwnerUserId` directly, so
  a guest order (`userId: null`) correctly rejects every signed-in caller. This is the pattern
  finding 1 should have used.
- **RBAC** — permissions are compile-time constants; `order:refund` is withheld from `STAFF`; the
  admin layout and every individual action check independently.
- **Password storage** — Argon2id at OWASP parameters; verification failures return `false` rather
  than throwing, so a corrupted hash is indistinguishable from a wrong password.
- **Session handling** — opaque 256-bit tokens, SHA-256 at rest, status re-checked from the database
  on every request, full revocation on password reset, all-but-current on password change.
- **Rate limiting** — the per-account login limit is now proven end to end: nine wrong passwords
  lock the account, and the **correct** password is refused too, which is what makes it useful
  against credential stuffing rather than merely annoying.

---

## Residual risk

- The public catalogue keeps `'unsafe-inline'` in `script-src` (finding 3). Closing it means giving
  up ISR on the highest-traffic pages. Revisit if Next.js gains build-time nonce support, or if the
  catalogue ever renders customer-supplied markup — at which point this stops being a trade and
  becomes a bug.
- Account enumeration is possible on **registration**, which returns "an account already exists".
  Deliberate: a generic message leaves a real customer stuck, and the register rate limit (5 per 15
  minutes) makes bulk probing impractical. Login and password reset are both non-enumerable.
- The fixed-window rate limiter permits up to 2× the limit across a window boundary. Acceptable for
  abuse control; it is not a billing meter.
- Back-in-stock alerts let a visitor cause mail to be sent to an address they typed. The content is
  fixed, the volume is one message per piece, and it is rate limited per browser and per target
  address — but it is the one outbound path a stranger can trigger, and worth watching if abuse
  reports ever appear.
- CI now runs `pnpm audit --audit-level=moderate`, but as `continue-on-error`. Advisories are
  published between builds, so a hard failure would block releases of code that did not change; the
  annotation is the signal. Someone still has to read it.
