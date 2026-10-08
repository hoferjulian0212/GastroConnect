---
name: External Git LFS routing
description: Prevent internal task-workspace LFS endpoints from being used for external Git pushes
---

External Git remotes must use their own LFS endpoint, not an inherited internal Replit SSH endpoint.

**Why:** An external GitHub remote retained a remote-specific LFS override pointing at an internal task workspace. Git-pane pushes failed at the Replit SSH proxy even though the ordinary Git remote URL pointed at GitHub. Disabling LFS locking alone would not fix the wrong upload destination.

**How to apply:** Before pushing a repurposed task-workspace remote to GitHub, verify its endpoint with Git LFS. Remove only the external remote's stale LFS override so its endpoint derives from its Git URL. Leave internal remotes intact and keep LFS enabled so media objects are uploaded. Verify Git authentication separately; correcting LFS routing does not repair a rejected GitHub token.
