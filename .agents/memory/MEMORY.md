# Memory Index

- [Schema source of truth](schema-source-of-truth.md) — GastroConnect applies DB schema via `db:push`, not migration files; `migrations/` is stale, don't generate new ones.
- [No-auth architecture](no-auth-architecture.md) — app has NO login; every endpoint trusts caller-provided IDs by design, so per-endpoint IDOR findings are app-wide, not regressions.
- [Backend hot-reload](backend-hot-reload.md) — new/changed server modules need a workflow restart; symptom: new API route returns SPA HTML, not JSON.
- [Partner map](partner-map.md) — Google map w/ free Leaflet+Nominatim fallback (no key); South Tyrol is a soft bias not a hard country filter, or no partner gets pinned.
- [Integration request flows](integration-request-flows.md) — PMS/ERP/WhatsApp "connect" features share one admin-approval pattern; admin notif deep-link intentionally uses requester role (mirrors ERP), don't "fix" in isolation.
