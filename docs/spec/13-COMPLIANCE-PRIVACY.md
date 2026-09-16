# Privacy and Compliance: GeraiCUAN

- Status: Draft — not a legal determination
- Candidate jurisdiction: Indonesia
- Qualified owner: [TBD owner=privacy/legal owner; due=before production approval]

## Indonesian personal-data applicability review
- Canonical jurisdiction declaration: JUR-ID-1 in `CONTEXT-RECORD.md`.
- Trigger facts: GeraiCUAN processes names, phones, and addresses of Indonesian senders/recipients for tenant shipment creation.
- Authority/source: Indonesia UU No. 27 Tahun 2022, https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022
- Retrieval date: 2026-08-28
- Decision: Unknown pending qualified review
- Engineering impact: PRIV-1, SEC-1, SEC-2, DATA-1
- Recheck trigger: Before production deployment or a material processing/location change.

## PRIV-1 — Data lifecycle proposal
- Owner: Privacy/legal owner

Collect only tenant account data and shipment data needed to obtain estimates, create Mengantar orders, print labels, maintain reusable tenant-scoped sender/recipient contacts, and maintain operational audit history. Contacts are never shared between tenants or repurposed by a future product without a separately documented purpose and qualified privacy review. Product retention is five years for shipment, ledger, and audit records; archived reusable contacts are deleted after 90 days unless represented by a retained immutable shipment snapshot. Limit staff and Super Admin monitoring access by role and data minimization. This is a product policy, not a legal-compliance determination. Do not log plaintext recipient addresses, phones, or credentials.

## Data inventory
| Data | Purpose | Recipient | Status |
|---|---|---|---|
| Tenant user identity | Authentication and access | GeraiCUAN | Required |
| Sender/recipient names, phone, address | Reusable tenant contacts; estimate, order, label | Mengantar for selected shipment only | Required |
| Package, COD, declared value | Provider order and label | Mengantar | Required |
| Provider IDs/AWB/status | Lifecycle and reprint | GeraiCUAN | Required |

## PRIV-2 — Authorized operational display (PR-36)

Tenant Admins and Operators may view complete sender/recipient phone numbers, provider AWBs, and internal shipment references in authenticated operational contact, draft, shipment, return, and label views. Contact directory and contact search responses contain complete phones only after server-derived tenant authorization; shipment queues retain their existing tenant/outlet query scope. This enables contact selection and shipment handling without copying incomplete identifiers. The product owner explicitly accepted this display policy on 2026-09-15.

This permission does not expand anonymous or Super Admin monitoring access, return additional street addresses in queue payloads, or authorize personal data in logs, errors, fixtures, screenshots, or public URLs. Provider credentials, passwords, keys, tokens, sessions, and existing monitoring redaction remain protected. This is a product display policy, not a legal-compliance determination.

## PRIV-3 — Provider settlement minimization (PR-43)

Mengantar invoice and order responses include receiver name/phone/address, goods description, pickup name and the account holder's email. GeraiCUAN reads none of those fields: the normalizer copies only invoice identifiers, amounts, statuses, timestamps and `cnote_no`, and only rows matched to the tenant's own shipments are stored. Fixtures carry sentinel PII values and tests assert they never appear in normalized output.
