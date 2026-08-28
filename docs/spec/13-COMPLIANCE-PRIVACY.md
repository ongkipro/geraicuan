# Privacy and Compliance: GeraiCUAN

- Status: Draft — not a legal determination
- Candidate jurisdiction: Indonesia
- Qualified owner: [TBD owner=privacy/legal owner; due=before production approval]

## JUR-ID-1 — Indonesian personal-data applicability review
- Trigger facts: GeraiCUAN processes names, phones, and addresses of Indonesian senders/recipients for tenant shipment creation.
- Authority/source: Indonesia UU No. 27 Tahun 2022, https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022
- Retrieval date: 2026-08-28
- Decision: Unknown pending qualified review
- Engineering impact: PRIV-1, SEC-1, SEC-2, DATA-1
- Recheck trigger: Before production deployment or a material processing/location change.

## PRIV-1 — Data lifecycle proposal
Collect only tenant account data and shipment data needed to obtain estimates, create Mengantar orders, print labels, maintain reusable tenant-scoped sender/recipient contacts, and maintain operational audit history. Contacts are never shared between tenants or repurposed by a future product without a separately documented purpose and qualified privacy review. Product retention is five years for shipment, ledger, and audit records; archived reusable contacts are deleted after 90 days unless represented by a retained immutable shipment snapshot. Limit staff and Super Admin monitoring access by role and data minimization. This is a product policy, not a legal-compliance determination. Do not log plaintext recipient addresses, phones, or credentials.

## Data inventory
| Data | Purpose | Recipient | Status |
|---|---|---|---|
| Tenant user identity | Authentication and access | GeraiCUAN | Required |
| Sender/recipient names, phone, address | Reusable tenant contacts; estimate, order, label | Mengantar for selected shipment only | Required |
| Package, COD, declared value | Provider order and label | Mengantar | Required |
| Provider IDs/AWB/status | Lifecycle and reprint | GeraiCUAN | Required |
