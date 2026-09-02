<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# GeraiCUAN Repository Contract

## Canonical Product Documents
- Requirements: `docs/spec/02-PRD.md`.
- Technical design: `docs/spec/03-TECHNICAL-DESIGN.md`.
- Architecture and data: `docs/spec/04-SYSTEM-ARCHITECTURE.md`, `docs/spec/05-DATA-MODEL.md`.
- Tenancy, IAM, security, privacy, operations, and UX: `docs/spec/06-TENANT-ISOLATION.md` through `docs/spec/16-OBSERVABILITY-RATE-LIMITING.md`.
- AI Code Navigation Map: `docs/spec/18-AI-ROUTE-MAP.md`.
- Execution queue: root `TASKS.md`. Execute one task only after its requirement and constraints are accepted.
- Runtime and release truth: `STATUS.md`, `BUILD-LOG.md`, `OBSERVABILITY.md`, and `RELEASE.md`.

## Non-Negotiable Invariants
- Next.js App Router, PostgreSQL, Drizzle, Better Auth, and Coolify are selected decisions. Verify installed versions before implementation.
- Every tenant-owned record, query, job, cache key, export, and provider operation carries server-derived tenant and outlet scope. PostgreSQL RLS is defense in depth, never the only authorization control.
- Resolve Mengantar credentials server-side: complete private outlet configuration first, then platform environment defaults. Never emit credentials, credential-bearing URLs, recipient PII, or secret fragments to browser code, logs, errors, fixtures, or commits.
- Provider `cnote_no` is the only AWB authority. Dynamic-AWB courier batches must serialize per Mengantar account. Never retry unknown order submission before reconciliation.
- COD principal is a liability, not revenue. Ledger entries are append-only and derive only from authoritative state transitions.
- The public site is a sales page plus login entry points. Shipment, provider, contacts, analytics, finance, and tenant management are authenticated CMS-only capabilities.

## Verification
- Browser-visible work requires real-browser evidence.
- Provider work requires sanitized contract fixtures and never creates an order without explicit approval.
- Every implementation task records its executed check in repository-owned evidence before completion.
