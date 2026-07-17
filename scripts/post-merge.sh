#!/bin/bash
set -e

# Install any new dependencies brought in by the merged task.
npm install

# IMPORTANT: no `drizzle-kit push` here. In this project push proposes
# DROPPING the live `user_sessions` and `app_migrations` tables (data loss)
# and then hangs on its interactive confirmation prompt. All schema changes
# are applied by the app itself at startup via idempotent SQL migrations
# (see server/storage.ts / runAdminMigration), so simply restarting the
# "Start application" workflow — which reconciliation does — is sufficient.
