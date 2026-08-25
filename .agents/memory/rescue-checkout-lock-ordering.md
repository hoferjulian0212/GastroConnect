---
name: Rescue checkout lock ordering
description: The transaction lock-order invariant that makes concurrent Rescue allocation deterministic.
---

Checkout transactions that reference promotions must lock all referenced promotion rows in a stable sorted order before inserting order items.

**Why:** An order-item insert takes a foreign-key key-share lock on its promotion. If two concurrent transactions both insert first and then try to upgrade the same promotion row to a write lock, PostgreSQL can deadlock instead of returning the intended Rescue capacity conflict.

**How to apply:** Preserve this ordering for every checkout or bulk-order path that reserves offer capacity. For multiple promotions, de-duplicate and sort IDs before locking. Keep the quota check, counter update, allocation-ledger insert, stock reservation, and order creation in the same transaction.