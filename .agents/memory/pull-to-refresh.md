---
name: Mobile pull-to-refresh transform gotcha
description: Why the pull-to-refresh wrapper must not keep a CSS transform when idle
---

# Pull-to-refresh content transform

The mobile pull-to-refresh effect works by translating the WHOLE wrapped page
content (including the page's own mobile dark hero, which renders inside the
wrapper) downward, and showing the refresh icon in the revealed gap above it.
That keeps the icon out from behind the dark header.

**Constraint:** never leave a CSS `transform` applied while idle. Any non-`none`
transform (even `translateY(0)`) makes that element a containing block, which
re-scopes `position: fixed` / `sticky` descendants. Several pages render mobile
`fixed` floating buttons / batch bars and `sticky` table headers INSIDE the
wrapped content, so a permanent transform breaks them.

**How to apply:** apply the transform only while actively pulling/refreshing,
plus a short (~340ms) settle window for a smooth release, then drop it entirely
(style `undefined`). Skip the settle on initial mount (guard with a ref) so a
freshly-loaded idle page is genuinely transform-free.
