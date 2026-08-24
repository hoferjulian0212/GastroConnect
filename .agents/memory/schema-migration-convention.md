---
name: Schema migration convention
description: Development schema workflow and the production-safe checkout exception
---

Ordinary development schema changes use `npm run db:push --force` (drizzle-kit
push). Checkout-critical changes use the dedicated
`npm run db:migrate-checkout-resilience` command, which records a versioned
migration and must run before application startup.

**Why:** Runtime DDL and blocking index creation can delay or interrupt live
checkout. The checkout migration preflights legacy duplicates and uses
concurrent indexes, while keeping ordinary local development lightweight.

**How to apply:** For checkout orders, notification delivery, idempotency, or
stock-reservation schema, extend and run the dedicated migration rather than
adding DDL to startup. Do not silently delete duplicate business history to
make a unique index succeed. For unrelated development schema changes, use the
existing Drizzle push workflow unless they also affect live checkout.
