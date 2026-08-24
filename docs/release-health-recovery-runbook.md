# Release health recovery cleanup alerts

## Alert contract

The release build writes this stable event to stderr when it cannot finish
cleaning abandoned release recovery remnants:

```text
RELEASE_HEALTH_RECOVERY_CLEANUP_FAILURE operation=restore|publish reason=cleanup_incomplete
```

The release pipeline should collect that event as a high-priority operator
alert. For collectors that consume files, set `RELEASE_HEALTH_ALERT_FILE` in
the release environment. Each event is appended as one JSONL record containing
only `event`, `operation`, and `reason`. Do not include the build workspace,
history filename, lock marker, or lock token in a notification.

## Safe recovery

1. Stop or pause additional releases for the affected operation so recovery
   attempts do not overlap.
2. Preserve the failed release logs and the alert record. Do not delete lock
   markers or reclaim directories manually.
3. Wait for any active release job to finish or expire its lease, then rerun
   the same release-history operation through the normal pipeline.
4. If the cleanup alert repeats, have the release operator inspect the host
   filesystem and process state using the platform's privileged procedures.
   The checker intentionally withholds those details from monitoring alerts.
5. Keep the release blocked until the cleanup operation succeeds and the
   published health check passes.