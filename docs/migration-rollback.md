# Migration recovery

GeraiCUAN migrations are append-only. Do not delete, edit, or reverse an already-applied migration in production.

## Before release

1. Record the deployed commit as `Base` and `Rollback-Ref` in `RELEASE.md`.
2. Run CI's empty-database and representative-upgrade checks.
3. For a migration that changes or removes production data, capture a PostgreSQL backup and record its `backup://` or `snapshot://` reference in `RELEASE.md` before deployment.

## Failed migration

1. Stop the release before application traffic uses a partially migrated schema.
2. Preserve the failed database and migration logs; do not delete tenant shipment, party, audit, contact, or provider records.
3. If the application artifact has not started and the migration is additive, redeploy `Rollback-Ref` only when its schema compatibility is verified.
4. Otherwise, ship a new additive forward-fix migration. Backfill separately, validate tenant isolation, then tighten constraints only after the data is valid.
5. Restore from the recorded backup only when the forward fix cannot preserve data and an approved recovery decision exists.

The supported default is a forward fix. A Git rollback alone is not a database rollback.
