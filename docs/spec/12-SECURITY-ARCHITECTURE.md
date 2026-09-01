# Security Architecture: GeraiCUAN

- Status: Draft
- Threat review owner: [TBD owner=Security reviewer; due=before production approval]

## Controls
- **SEC-1 Credential boundary:** Mengantar API keys are accepted only by an authenticated Tenant Admin Server Action, encrypted immediately with a dedicated runtime key, and resolved only inside trusted server modules. Provider base URL remains platform-controlled and is never tenant input. A validated per-outlet private key takes precedence; otherwise the server resolves the complete platform default. Do not store plaintext in PostgreSQL, source control, browser payloads, analytics, error text, audit metadata, screenshots, or logs. Connection/read models expose only non-secret state and timestamps—never key fragments, credential-bearing URLs, ciphertext, nonce/tag material, or managed-secret references.
- **SEC-2 Authorization/isolation:** Deny by default; server authorization and PostgreSQL RLS enforce `TEN-1`/`TEN-2`. Never trust tenant ID, price, service, AWB, or role from the browser.
- **SEC-3 Upstream integrity:** Validate provider response schema, bind results to the submitting tenant/outlet/batch, use idempotency, and reconcile unknown submission states before retry.
- **SEC-4 Input and output safety:** Validate imported rows, addresses, phone numbers, amounts, weights, and print rendering inputs. Escape all label/UI fields; limit file size/type and row count.
- **SEC-5 Auditability:** Audit role, tenant state, connection-reference, submission, recovery, and print/reprint events with actor, tenant, target, correlation ID, and redacted outcome.
- **SEC-6 Secret mutation safety:** Authenticate and authorize before reading secret-bearing form fields; constrain request size and key length; never preserve a submitted key in returned action state; rate-limit create/replace/verification attempts per tenant, actor, and outlet; use authenticated encryption with purpose/tenant/outlet-bound additional data; keep the prior working key if replacement fails; and require explicit confirmation plus a complete platform default before removing a private connection.

## Residual risks
Provider API behavior and insurance payload are current-doc assumptions pending a sanitized sandbox estimate. There is no approved production secret, deployment, or penetration-test evidence in this staged plan.
