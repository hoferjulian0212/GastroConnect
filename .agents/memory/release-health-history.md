---
name: Release health history
description: Retention boundary for comparing published health checks across releases.
---

Release health comparison is only useful when the JSONL history file is stored in a durable release or CI artifact location and supplied through `RELEASE_HEALTH_HISTORY_FILE`.

**Why:** A deployment build workspace can be replaced between releases, so a local history file can disappear even though the checker itself succeeds.

**How to apply:** Configure the release pipeline to restore the prior history before the check, append the new result, publish the updated file, and use the comparison command against that retained artifact.