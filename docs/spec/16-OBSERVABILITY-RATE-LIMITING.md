# Observability and Rate Limits: GeraiCUAN

- Status: Draft

## Signals
- **OBS-1:** Audit Super Admin tenant lifecycle, monitoring access, and tenant-admin membership/connection/contact changes.
- **OBS-2:** Emit redacted provider estimate/order/pay-unpaid lifecycle events with tenant ID, outlet ID, credential source (`private` or `platform_default` only), actor ID, correlation ID, courier, safe provider status, latency, and retry/queue result.
- **OBS-3:** Emit label render/print/reprint events with shipment ID, actor, tenant, and outcome; never label content, address, phone, or credentials.
- **OBS-4:** Produce Super Admin and tenant analytics aggregates for active/suspended tenants, outlet/configuration health, memberships, shipment lifecycle counts, issued/unpaid/failed batches, provider latency/errors, queue depth, usage, ledger/reconciliation state, and audit activity; records retain tenant/outlet/date filter dimensions and use the shared timezone range contract.

## Alerts
Alert on repeated provider authentication/schema failures, queue backlog, high unknown-submission rate, abnormal cross-tenant authorization denials, and sustained estimate/order failures. Thresholds and on-call ownership are [TBD owner=Operations owner; due=before production approval].

## RATE-1 — Abuse and provider protection
Rate-limit address search, estimates, imports, order submission, and recovery by authenticated tenant and actor. Use bounded retries with jitter for transient upstream failures; do not retry non-idempotent order creation before reconciliation. The dynamic-AWB per-account queue is a concurrency control, not a rate limit.

## Privacy
Logs use allowlisted fields, server-side redaction, and short operational retention pending PRIV-1 decision. Provider credential-bearing URLs are prohibited from logs and traces.
