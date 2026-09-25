# ADR-0001 — Rebuild the CMS presentation layer from zero (UI v3)

| Field | Value |
|---|---|
| Status | Accepted (owner, 2026-09-25) |
| Date | 2026-09-25 |
| Decider | Product owner (Paduka Ongki) |
| Related | `docs/spec/02-PRD.md` §v3, `docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md` v3.0, `docs/spec/17-UX-FLOWS-SCREEN-CONTRACTS.md` §UX-v3, `TASKS.md` Phase 18 |

## Context

- The product purpose was narrowed on 2026-09-25: GeraiCUAN creates a Mengantar order and prints the gerai's own label that masks the Mengantar airway bill ("masking resi"), then follows the shipment to delivery or return. Impor CSV, Keuangan and Analitik were removed (T-204).
- The presentation layer accreted through many rounds (spec 10 v1 → v2.2, spec 20 glass, T-200–T-206). The owner judged the result imprecise and cluttered ("banyak ai slop", "gak presisi", "berantakan") on Buat kiriman, Histori kiriman, Retur and Laporan pengiriman, and asked on 2026-09-25: "backup keseluruhan dan kau develop ui ux dari 0 dengan mengabaikan yang ada saat ini. kalo perlu pakai shadcn ui admin dashboard full"; then "jadi buat prd, anatomi, design md, dll".
- The owner supplied a complete static reference: `~/Documents/work/notes/geraicuan-html/` (26 pages, Tailwind) with its analysis `~/Documents/work/notes/geraicuan-ui-analysis.md`.
- The domain layer (Drizzle schema and RLS, repositories, server actions, provider client, money rules, label printing) is verified by 1,477 integration tests and is not the problem.

## Decision

1. Rebuild **only the presentation layer** of the tenant and platform CMS from zero: shell, navigation, every page component, loading/error/empty states and their render tests. Server actions, repositories, schema, provider integration, money logic, label sheet geometry and authorization stay and are consumed as-is.
2. Base the new layer on **official shadcn/ui blocks and primitives** installed fresh from the registry — `dashboard-01` (sidebar + charts + data table composition), `sidebar-07` (icon-collapsible sidebar), `sidebar-16` pattern (sticky site header) — styled by one token set taken from the owner's HTML reference and sized for readers aged 40+.
3. The owner's HTML reference is the **visual specification**; spec 17 §UX-v3 is the **behavioural specification** (jobs, states, permissions); spec 10 v3.0 is the **design contract** (tokens, anatomy, components).
4. **Clean slate** (owner, 2026-09-25: "BERSIHKAN UI UX SAAT INI, BANGUN DARI 0"): first remove the current presentation layer — `src/app/_components/**`, `src/components/cms/**`, every page/layout/loading/error/not-found component and client form component under `src/app/app/**` and `src/app/platform/**`, the `.cms-*`/`.auth-*` presentation CSS, and their render tests — keeping every `actions.ts`, route handler (`route.ts`), data loader import target in `src/db`/`src/lib`, and the thermal label sheet. Then reinstall `src/components/ui/*` fresh from the shadcn registry and build the new shell and pages from zero. The app is expected to be incomplete between the clean-out and the rebuild of each route; that window is accepted by the owner.
5. Keep the owner-approved behaviour decisions: two-stage shipment creation (Simpan & cek tarif → pilih layanan & terbitkan), handover type and pickup schedule stored and shown but not sent to Mengantar until T-153 verifies the request contract, no vehicle field, courier logos as SVG, the term *gerai* never *toko*, one filled primary action per page.

## Alternatives considered

- **Replace route by route beside the old layer.** Rejected by the owner in favour of a clean slate.
- **Keep iterating the current layer.** Rejected by the owner after several rounds; the accreted classes, helper components and pinned render tests make precision slow.
- **Apply a shadcn preset (`shadcn apply --preset b2bR2wL3EO`, tried 2026-09-25).** Rejected: the radix-mira preset shrinks controls to 28px and text to 10–13px (unsuitable for 40+), mixes icon libraries and overwrote accessibility fixes.
- **Rewrite the whole application.** Rejected: the domain layer is correct, tested and security-reviewed; rewriting it adds risk without addressing the complaint.

## Consequences

- Most render tests under `tests/*render*`, `*-page*`, `cms-*`, `shipment-route-states` and similar are rewritten with their pages; domain, repository, action, provider, money and label tests must stay green untouched.
- Spec 10 v2.x and spec 20 are superseded by spec 10 v3.0; historical sections in spec 17 remain as history under a superseded note.
- Rollback: the full pre-rebuild tree is archived at `~/.local/state/geraicuan-backups/full-repo-before-ui-rebuild-20260925T230759.tgz` (0600); each rebuilt route is one commit once the owner authorises commits.
- Every screen ships only after side-by-side browser comparison with its reference HTML at 1440 and 390 and the spec 10 v3.0 screening checks.
