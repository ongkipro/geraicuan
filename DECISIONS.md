# Decision Register — geraicuan

Updated: 2026-09-25

Record accepted decisions that materially constrain product behavior,
architecture, security, data, operations, or delivery. Repository evidence must
support each decision; AI output alone is not evidence.

| ID | Status | Decision | Drivers | Evidence | Supersedes |
|---|---|---|---|---|---|
| ADR-0001 | Accepted 2026-09-25 | Rebuild the CMS presentation layer from zero on official shadcn/ui blocks and the owner's HTML reference; domain layer unchanged ([ADR-0001](docs/adr/ADR-0001-ui-v3-rebuild.md)) | Owner judged the accreted UI imprecise; masking-first scope | Owner messages 2026-09-25; `~/Documents/work/notes/geraicuan-html/` | Spec 10 v2.x, spec 20 |

Use stable IDs such as `DEC-001`. When a decision needs detailed alternatives or
consequences, add a repository-owned ADR and link it from this register. Never
rewrite history silently: mark the old decision superseded and add the new one.
