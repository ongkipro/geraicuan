# Observability and Rate Limits: GeraiCUAN

- Status: Draft

## Signals

### OBS-1 — Governance audit signal
- Status: Accepted
- Owner: Operations owner
- Source: PR-1, PR-11, PR-21, PR-23
- Statement: Audit Super Admin tenant lifecycle, monitoring access, and tenant-admin membership/connection/contact changes.

### OBS-2 — Provider lifecycle signal
- Status: Accepted
- Owner: Operations owner
- Source: PR-6, PR-8, PR-10, SEC-1
- Statement: Emit redacted provider estimate/order/pay-unpaid lifecycle events with tenant ID, outlet ID, credential source (`private` or `platform_default` only), actor ID, correlation ID, courier, safe provider status, latency, and retry/queue result.

### OBS-3 — Label event signal
- Status: Accepted
- Owner: Operations owner
- Source: PR-7, SEC-5
- Statement: Emit label render/print/reprint events with shipment ID, actor, tenant, and outcome; never label content, address, phone, or credentials.

### OBS-4 — Aggregate analytics signal
- Status: Accepted
- Owner: Operations owner
- Source: PR-11, PR-15, PR-20, PR-26
- Statement: Produce Super Admin and tenant analytics aggregates for active/suspended tenants, outlet/configuration health, memberships, shipment lifecycle counts, issued/unpaid/failed batches, provider latency/errors, queue depth, usage, ledger/reconciliation state, and audit activity; records retain tenant/outlet/date filter dimensions and use the shared timezone range contract.

## Alerts
Alert on repeated provider authentication/schema failures, queue backlog, high unknown-submission rate, abnormal cross-tenant authorization denials, and sustained estimate/order failures. Thresholds and on-call ownership are [TBD owner=Operations owner; due=before production approval].

## RATE-1 — Abuse and provider protection
- Owner: Operations owner

Rate-limit address search, estimates, imports, order submission, and recovery by authenticated tenant and actor. Use bounded retries with jitter for transient upstream failures; do not retry non-idempotent order creation before reconciliation. The dynamic-AWB per-account queue is a concurrency control, not a rate limit.

## Privacy
Logs use allowlisted fields, server-side redaction, and short operational retention pending PRIV-1 decision. Provider credential-bearing URLs are prohibited from logs and traces.

## RATE-2 — Provider settlement pull (PR-43)

- One pull per Tenant Admin per 60 seconds: the `settlement-pull` row in `shipment_rate_limits` is claimed atomically and committed before any provider request, so failed or timed-out pulls and parallel tabs cannot fan out against a shared provider key.
- At most 62 days per pull, 50 records per page and 40 pages per invoice type and for orders; larger results fail with an explicit "choose a shorter period" message.
- Errors shown to users are fixed Indonesian messages; provider URLs, credential-bearing paths and raw provider errors are never logged, rendered or rethrown.
- Evidence of each pull is the `provider_settlement_pulls` row itself (actor, period, counts), shown as "Tarikan terakhir" in Keuangan.

### Pre-claim payload rejection (T-152 follow-up, 2026-09-16)

When `buildMengantarOrderPayload` refuses a batch (missing COD total, unverified destination area, unconvertible weight), the batch is **not** claimed and nothing reaches the provider. The orchestrator emits the same lifecycle event shape as other failures with `outcome: "failure"`, `safeProviderStatus: "NOT_CALLED"`, `retryResult: "rejected"`, `queueResult: "not_applicable"` and the `payloadRejectionCode`, so a rejection is visible in telemetry instead of surfacing as an unhandled Server Action error. Sibling batches in the same run are still attempted; the refused batch stays `SUBMISSION_QUEUED` and resumable.
