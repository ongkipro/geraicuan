# Security Architecture: GeraiCUAN

- Status: Draft
- Threat review owner: [TBD owner=Security reviewer; due=before production approval]

## Controls
- **SEC-1 Credential boundary:** Mengantar API key/base URL are injected only into trusted server runtime. A validated per-outlet private configuration takes precedence; otherwise the server resolves platform defaults from environment. Do not store plaintext in PostgreSQL, source control, browser payloads, analytics, error text, or logs. Persist only a managed-secret reference and masked display metadata.
- **SEC-2 Authorization/isolation:** Deny by default; server authorization and PostgreSQL RLS enforce `TEN-1`/`TEN-2`. Never trust tenant ID, price, service, AWB, or role from the browser.
- **SEC-3 Upstream integrity:** Validate provider response schema, bind results to the submitting tenant/outlet/batch, use idempotency, and reconcile unknown submission states before retry.
- **SEC-4 Input and output safety:** Validate imported rows, addresses, phone numbers, amounts, weights, and print rendering inputs. Escape all label/UI fields; limit file size/type and row count.
- **SEC-5 Auditability:** Audit role, tenant state, connection-reference, submission, recovery, and print/reprint events with actor, tenant, target, correlation ID, and redacted outcome.

## Residual risks
Provider API behavior and insurance payload are current-doc assumptions pending a sanitized sandbox estimate. There is no approved production secret, deployment, or penetration-test evidence in this staged plan.
