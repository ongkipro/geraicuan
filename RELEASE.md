# Release Manifest — geraicuan

Release-ID: RC-1
Base: 2b3bd18121325ac70d153dd2bb38809cc8612e65
Environment: production
Declared-Risk: R2
Rollback-Ref: 2b3bd18121325ac70d153dd2bb38809cc8612e65
Rollback-Command: git checkout 2b3bd18121325ac70d153dd2bb38809cc8612e65
Backup-Proof: NOT_REQUIRED
Status: READY

## Contract

This file defines the current release boundary. It is repository truth for release-specific metadata and MUST describe only the release currently being prepared.

- `Base` is the last deployed/accepted commit and must be an ancestor of `HEAD`.
- `Declared-Risk` is the human/agent-declared release risk (`R0`–`R4`).
- `Rollback-Ref` is the commit to restore if deployment fails; normally it equals `Base`.
- `Rollback-Command` is an explicit supported repository/runbook command, not an assertion such as `true`. Do not put secrets here.
- `Backup-Proof` is `NOT_REQUIRED` unless migration risk requires a structured `backup://`, `snapshot://`, or artifact reference.
- Set `Status: READY` only after the release scope is frozen for production gating.
