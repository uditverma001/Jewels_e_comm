# Working in this repository

Read **ARCHITECTURE.md** for why things are the way they are, and **README.md**
for how to run them. This file is the short list of rules that are easy to break
by accident.

## Layering

```
app/**           render and adapt. No business logic, no SQL.
app/actions/**   verify origin → validate with Zod → call a service → revalidate.
server/**        ALL business logic. Framework-free and directly testable.
server/**/…      services decide; repositories read and write.
server/integrations/  third parties behind interfaces, each with a dev driver.
```

Nothing in `src/server` may import from `src/app`. That constraint is what keeps
the whole domain liftable into a standalone service later.

## Non-negotiables

- **Money is integer minor units (paise).** Never a float, never a string. All
  arithmetic goes through `src/server/money`, which is the only place that
  rounds. Columns carry a `*Minor` suffix so the unit is impossible to misread.
- **Never trust a number from the client.** Checkout re-reads prices from the
  database, re-validates the coupon, and recomputes tax and shipping. The client
  sends an address, a delivery choice and a coupon _code_ — nothing else that
  affects what is charged.
- **There is exactly one pricing implementation.** If you need a total anywhere,
  call `priceOrder`. A second implementation will disagree with the first, and
  the customer will be shown one number and charged another.
- **Payment status comes from the provider, never from the browser.** The
  webhook is the authority. Record the event under its unique id _before_
  processing so replays are no-ops.
- **Stock is protected by one conditional `UPDATE`**, not by read-then-write.
  Anything that decrements inventory must be atomic in a single statement.
- **Orders are immutable snapshots.** Editing a product must never change what
  an old order says.
- **Scope every account query by owner in the `where` clause.** Never fetch by
  id and check ownership afterwards.
- **Validate at the boundary with Zod, and construct Prisma inputs explicitly.**
  Never spread a request body into a query — the fields next door are price and
  role.

## Adding things

**A new server action** — start with `assertSameOrigin()`, then a permission
check if it is privileged, then `parseInput(schema, input)`. Return
`ActionResult`; never throw across the RSC boundary.

**A new admin page** — put it under `app/admin`. The layout does the role check,
but the action still needs its own `requirePermission(...)`. Hiding a button is
presentation, not authorization.

**A new facet** — it is data, not a migration: add an `Attribute` and its
`AttributeValue` rows, then add the code to `FACET_CODES`.

**A new product field that customers filter on** — think twice. Filterable
things belong in the attribute tables; display-only things belong in
`ProductSpec`. A new column is for something on nearly every query.

**A schema change** — `pnpm db:migrate`. If you hand-edit the SQL, remember that
Prisma cannot see generated columns, so anything it cannot describe needs a
matching declaration in `schema.prisma` or it will try to drop it.

## Testing

- Unit tests for pure logic — money, pricing, the state machine, redirects.
- Integration tests against **real Postgres** for anything whose correctness is
  the database's: atomic reservation, transactional order creation,
  unique-constraint idempotency. A mocked Prisma client tests the mock.
- E2E for the flows a customer actually performs. Tests share a database, so a
  test that changes data must put it back.

Run `pnpm check` before you push.
