---
name: Wouter location includes the query string
description: Page-detection checks must strip the query before matching
---
In this app `useLocation()` returns the path WITH the query string attached (it uses wouter's browser-location). So `===` comparisons and `$`-anchored route regexes (e.g. detecting a detail page like `/role/orders/:id$`) silently return false whenever a URL carries `?foo=bar`.

**Why:** several flows navigate with query params (e.g. opening an order/complaint with `?action=` or `?orderId=`). A page that should be treated as a "detail" page then leaks chrome (mobile top bar, bottom nav, extra hero) because the guard misfired.

**How to apply:** always compute `const pathOnly = location.split("?")[0]` and run page-type checks against `pathOnly`, not the raw `location`.
