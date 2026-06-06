---
name: React Query key conventions
description: How query keys map to request URLs in this app's default queryFn
---

The default `queryFn` in `client/src/lib/queryClient.ts` builds the request URL by
joining the `queryKey` array segments with `/`.

**Rule:** an endpoint that takes **path params** (REST style, e.g.
`/api/orgs/:id/members`) can use an array key like `["/api/orgs", id, "members"]`
→ joins to `/api/orgs/{id}/members`. An endpoint that takes **query params**
(e.g. `/api/vertreter-assignments/responsible?supplierId=&restaurantId=`) MUST
use a single-string key, e.g.
``[`/api/vertreter-assignments/responsible?supplierId=${a}&restaurantId=${b}`]``.
Using an array key for a query-param endpoint produces a wrong URL (params
become path segments) and the request 404s/mismatches.

**Why:** there is no custom queryFn per query; the shared default fetcher only
knows how to `join("/")`. Keep the invalidation key identical to the fetch key.

**How to apply:** when adding a useQuery for any `?`-param endpoint, build the
full URL string once and reuse it for both `queryKey` and `invalidateQueries`.
