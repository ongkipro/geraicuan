# Release Manifest — geraicuan

Release-ID: RC-1
Base: 67beb92e4135da15afc7357d905a4473f7e17020
Environment: production
Declared-Risk: R4
Rollback-Ref: 2b3bd18121325ac70d153dd2bb38809cc8612e65
Rollback-Command: git checkout 2b3bd18121325ac70d153dd2bb38809cc8612e65
Backup-Proof: REQUIRED — migrations 0032 through 0036 change row-level
  security, table grants and column privileges. Capture a database backup
  before applying them and record its reference here.
Status: BLOCKED

## Why this manifest is BLOCKED

`RC-1` was prepared against `2b3bd18` and marked READY by T-62. That boundary no
longer describes this repository. Commit `67beb92` then shipped the Phase 9
market features without independent review or a passing test suite, and the
Phase 10 screening that followed has now finished.

What has changed since the READY declaration:

- Migrations `0032` through `0036` alter row-level security, table grants and
  column privileges; `0037` is an additive, independently-verified no-op
  (drizzle-kit metadata normalization — a stale CHECK-constraint snapshot
  representation, not a schema change; `pnpm db:generate` now reports "No
  schema changes"). `Backup-Proof` is therefore still required for `0032`
  through `0036`, unaffected by `0037`.
- `Declared-Risk` rose to `R4` when T-79's security audit closed a provider
  ingestion endpoint that implemented an unverified contract, and found the
  only tenant-owned table shipped without row-level security. Both are fixed.
- `Base` moved to `67beb92`, the commit this work sits on top of. The rollback
  reference deliberately stays at `2b3bd18`, the last boundary that passed a
  release gate.
- Phase 10 (`T-76` through `T-82`) is now complete: every task passed
  independent review where required (T-77 after twenty-three rounds; T-81 at
  R3), `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test:integration` (591/591),
  `pnpm test:migration-upgrade` (through `0037`), and `pnpm build` (zero
  errors or warnings, using the documented production env block) all pass
  against the current working tree. Every change since `67beb92` remains
  uncommitted at the time of writing, per this repository's own standing
  instruction to commit once, at the end, after the full Phase 10 queue is
  verified — not incrementally per task.

Do not gate or deploy from this file. `STATUS.md` is the runtime authority and
`TASKS.md` is the execution queue; both describe what remains. Phase 10
verification passing does not by itself return `Status` to `READY`: this
manifest's own contract requires T-62's verification to be rerun from a clean,
committed tree first, which has not happened. `Status` stays `BLOCKED` until
that rerun occurs after this segment's work is committed.

## Contract

This file defines the current release boundary. It is repository truth for release-specific metadata and MUST describe only the release currently being prepared.

- `Base` is the last deployed/accepted commit and must be an ancestor of `HEAD`.
- `Declared-Risk` is the human/agent-declared release risk (`R0`–`R4`).
- `Rollback-Ref` is the commit to restore if deployment fails; normally it equals `Base`.
- `Rollback-Command` is an explicit supported repository/runbook command, not an assertion such as `true`. Do not put secrets here.
- `Backup-Proof` is `NOT_REQUIRED` unless migration risk requires a structured `backup://`, `snapshot://`, or artifact reference.
- Set `Status: READY` only after the release scope is frozen for production gating.
