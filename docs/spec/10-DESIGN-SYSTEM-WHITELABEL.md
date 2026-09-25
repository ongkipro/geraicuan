# Design System and UI Contract: GeraiCUAN

| Field | Value |
|---|---|
| Status | Accepted — single design contract for every GeraiCUAN surface |
| Version / updated | 2.2 / 2026-09-25 (T-204: owner HTML reference `~/Documents/work/notes/geraicuan-html/` — bordered flat cards, flat icon sidebar, one-line filter row, masking-first menu) |
| Owner | Product owner (Paduka Ongki) |
| Pattern source | The GeraiOS v0.5 professional shadcn dashboard pattern, adopted by owner decision 2026-09-25 ("pakai gerai os itu bagus patternnya … shadcn ui professional dashboard … presisi"; "Pattern GeraiOS, tanpa glass") |
| Supersedes | `20-IOS-GLASS-UI-ARCHITECTURE.md` (glass/squircle/colourful accents) and the accreted per-task palette notes of spec 10 v1 (condensed in §13) |
| Runtime authority | `src/app/globals.css` (tokens), `src/components/ui/*` (shadcn/Radix primitives), `src/components/cms/*` (shared CMS compositions). Where code and this document differ, the difference is a defect to record in the visual register (`docs/visual-screening-register.md`), not a second design system |
| Locale | Bahasa Indonesia (`id-ID`), IDR, explicit timezone (default `Asia/Jakarta`, shown as WIB) |

No white-labeling in MVP: one GeraiCUAN brand, no tenant logo, colour, font, domain, CSS or asset upload.

---

## 1. Direction

**Calm operational clarity.** GeraiCUAN is a working tool for shipping outlets, not a showcase. Every screen answers one job, shows its scope (tenant, outlet, period, timezone), and offers one obvious next safe action.

Rules that decide every visual choice:

1. **shadcn/ui, used plainly.** Compose from the installed primitives (`Button`, `Card`, `Table`, `Badge`, `Alert`, `Field`/`Input`/`Select`, `Tabs`, `Dialog`/`AlertDialog`, `DropdownMenu`, `Sidebar`, `Skeleton`, `Command`). Do not restyle a primitive per page; change the shared component or the token.
2. **Solid, not glass.** Surfaces are opaque: white cards on a lightly sunken canvas. **Forbidden:** `backdrop-blur`, translucent card fills (`bg-card/70` etc.), `ios-*` classes, gradients, glows/coloured shadows, scale-on-press, hover lift (`-translate-y`), nested cards.
3. **One accent.** Blue `--primary` (#2E47BA) marks interaction and current location only. Status uses the semantic ok/warn/danger/info tones with text and icon. Charts use the Okabe-Ito ramp. No other hues (no per-KPI rainbow accents).
4. **Hierarchy by type and space, not decoration.** Page title → section title → body → meta. Numbers are prominent through size and tabular alignment, not colour.
5. **Density for operators.** Compact but not crowded; tables are the decision tool for lists; no decorative KPI grids where a queue answers the job.
6. **Frame budget — one level only** (owner 2026-09-25: "professional, tidak banyak frame/border"). The CMS ground is `--surface-sunken`; a region is either a white card (1px `--border` outline, radius 10px, no shadow, 16px padding on mobile / 24px from `md`) or plain content on the ground. Inside a card nothing is framed: no bordered boxes, sub-cards, dashed placeholders or title bands — group with spacing, a subheading or one hairline divider. Tables inside a card have no outer border (header row `bg-muted`, row dividers). Toolbars and filter rows are unframed. Lines remain only on form controls, the sidebar edge, the top-bar rule, table header/row dividers, dialogs/popovers/menus and the thermal label; dashed lines only for a file drop zone.
7. **Precision.** Every value comes from the scale in §2. An off-scale value (arbitrary `text-[11px]`, `rounded-[1.1rem]`, `p-[13px]`, raw hex in a page) is a defect.
8. **Built for readers aged 40+** (owner 2026-09-25: "market kita kurang lebih 40+"). Larger type than a generic dashboard (§2.2), secondary text at ≥7:1, 40px controls on desktop and 44px targets on touch, one idea per line, labels in words rather than icons alone, and nothing that must be read below 13px.
9. **Colour budget — clean minimal, colour only where it changes a decision** (owner 2026-09-25: "clean minimal + coloring minimal visual untuk point-point penting"). A screen is neutral (ink, muted ink, white, sunken grey) plus at most: the one `--primary` action and links/current nav; status badges (ok/warn/danger/info, always with icon + word); a money variance or overdue value in `--warn`/`--danger`; destructive actions. Everything else — totals, counts, headings, icons, chart frames, table cells — stays neutral. A number is never green or red just because it is a number.

## 2. Tokens

### 2.1 Colour (light; `.dark` values exist but no activation route ships)

Pages and components use **semantic classes only** (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-[var(--ok)]` via `toneClass`, …). Raw Tailwind palette classes (`blue-600`, `emerald-500`, `slate-*`, …) and hex/rgb literals are not allowed in `src/app/**` or `src/components/**`; the thermal label (§10.4) and the auth platform surface (§10.1) are the only documented exceptions.

| Token | Value | Use |
|---|---|---|
| `--background` / canvas | `oklch(1 0 0)` | Document ground outside the CMS content area |
| `--muted` / `--surface-sunken` | `oklch(0.97 0 0)` | CMS content ground, table header, skeleton, subtle fills |
| `--card` / `--popover` | `oklch(1 0 0)` | Work surfaces, menus, dialogs |
| `--foreground` / `--ink` | `oklch(0.145 0 0)` | Headings, body, dominant values |
| `--muted-foreground` | `oklch(0.45 0 0)` | Secondary text, captions, table meta (≈7.5:1 on card, ≈7:1 on the sunken ground — the 40+ floor, §1.8) |
| `--border` / hairline | `oklch(0.922 0 0)` | Decorative dividers and card outlines only |
| `--input` / field border | resting field boundary; must reach 3:1 where it is the only boundary | Form controls |
| `--primary` / `--primary-foreground` | `#2E47BA` / `#FFFFFF` | The next safe action, links, focus ring, current nav |
| `--primary-hover` | `#243A9B` | Hover/pressed of primary |
| `--accent` / `--accent-foreground` | `#EEF2FF` / `#2E47BA` | Selected nav item, selected row, hover surface, step numbers |
| `--ok` / `--ok-surface` | `#087443` / `#ECFDF3` | Success, issued, delivered, positive desirable change |
| `--warn` / `--warn-surface` | `#A15C07` / `#FFFAEB` | Needs attention, pending, gated, "Perhatian" |
| `--danger` / `--danger-surface`, `--destructive` | `#B42318` / `#FFF1F0` | Failure, "Kritis", destructive actions only |
| `--ring` | `#2E47BA` | The single 2px full-alpha focus ring, offset 2px |
| `--chart-1…5` | `#0072B2 #009E73 #E69F00 #CC79A7 #D55E00` (Okabe-Ito) | Categorical series only, always with a marker/dash/label; `--chart-3` never an unmarked stroke |
| `--table-stripe` | `oklch(0.976 0 0)` (opaque) | Alternate table rows |

Contrast floor: text 4.5:1 (large 3:1); control boundaries and focus 3:1. `tests/design-token-contrast` is the executable authority.

### 2.2 Typography

Inter (self-hosted) for all UI text **including numbers** (with `tabular-nums`). `ui-monospace` only for identifiers compared character by character: AWB/resi, shipment number and its prefix, technical codes. Money, counts, phone numbers and dates are sans `tabular-nums`.

The scale lives in `globals.css` `@theme` (`--text-*`), so every `text-*` utility follows it; pages never set a pixel size.

| Token | Size / line height | Role |
|---|---|---|
| `text-xs` | 13 / 18px | Floor. Eyebrow, table header, badge, timestamp, helper under a field. Never for sentences that carry an instruction |
| `text-sm` | 15 / 22px | UI default: table cells, controls, descriptions, card body, nav items, record-list lines |
| `text-base` | 16 / 24px | Card/section title (h2, `font-semibold`), record-list title, form fields (prevents iOS zoom), reading text |
| `text-lg` | 18 / 26px | Sub-page emphasis (e.g. selected service total), dialog title |
| `text-xl` | 20 / 28px | Rare: empty-state title on a full page |
| `text-2xl` | 26 / 32px | Page title (h1, `font-bold tracking-tight`), one per page |
| `text-3xl` | 30 / 36px | KPI value (`font-bold tabular-nums`), one size for every StatCard |

Weights: 400 body; 500 labels, controls, nav; 600 section titles, record titles, money in lists; 700 page title, KPI, totals. No `font-extrabold`, no uppercase-tracked labels. Sentence case everywhere. Line length for prose ≤ `max-w-2xl` (~70 characters).

Money is right-aligned in tables, left-aligned in record lists (footer start) and always `Intl` IDR; whole rupiah except the keuangan settlement table (T-178 sen).

### 2.3 Spacing, size, radius, elevation, motion

| Scale | Rule |
|---|---|
| Spacing | 4px grid. Page gutter `px-4 sm:px-6`; section stack `gap-6`; card padding `--card-spacing` (16px; `size="sm"` 12px); field stack `gap-4`/`gap-5`; label→control `gap-1.5`; inline icon→text `gap-2` |
| Width | CMS content `PageContainer`; forms use `FormLayout` (main + 22rem rail from `@4xl`); settings content ≤47.5rem |
| Controls | `Button`/`Input`/`Select` `h-10` (40px) on desktop, `sm` `h-9` only inside dense tables/toolbars, `lg` `h-11`; `min-h-11` (44px) below `md` for every touch target; primary submit on flows `min-h-11`; badge `h-6`; nav items `h-10`; table row ≥ 46px (`py-3` cells); icons `size-4` in controls, `size-5` in headers |
| Radius | One scale from `--radius` (0.45rem): controls/badges `rounded-md`, cards/dialogs/table shells `rounded-xl`. No `rounded-2xl`/pill buttons; round only for avatars, step numbers and severity dots |
| Elevation | Cards: `shadow-resting`, no outline ring (the tonal step from the sunken ground separates them). Popovers/menus/sticky bars: `shadow-md` with a hairline. Dialogs: `shadow-lg`. Nothing else casts a shadow |
| Motion | 150ms colour/opacity transitions; Radix enter/exit only; honour `prefers-reduced-motion`. No transforms on hover/press |

## 3. App shell

One `cms-shell` for tenant and Super Admin (`src/app/_components/cms-shell.tsx`, `cms-navigation.tsx`):

- **Sidebar** (`variant="sidebar"`; desktop full ≥1024px, tablet icon rail with tooltips, mobile sheet) with a single right hairline: brand block (GeraiCUAN + role), then a **flat list** — uppercase small group labels (PENGIRIMAN, DATA, CEK, LAPORAN, PENGELOLAAN / PLATFORM) naming their lists, every item with its own lucide icon, 40px rows (44px below `md`), hover `bg-muted`, exactly one current item (`aria-current="page"`, `bg-accent text-accent-foreground` semibold). No tree lines, per-group collapsibles or flyouts. Account row in the footer.
- **Top bar**: sidebar toggle, scope (tenant/outlet name + role badge, or platform scope), `⌘K` search, WIB clock. Sticky, solid `bg-background` with a bottom hairline — no blur.
- **Content**: full-bleed sunken ground (no inset panel, no rounded frame), `PageContainer` gutters, one `PageHeader` first.
- A forbidden direct route is rejected or redirected before render; the shell never highlights Ringkasan as a fallback for an unauthorized destination.
- Navigation content is scope- and role-filtered on the server; a nav count appears only for work needing a human action (spec 19 ACT-NEEDED) and is omitted rather than `0`. Contextual descendants keep their parent current.

GeraiOS shell rules adopted: persistent scope identity in the shell, grouped navigation by job (Pengiriman, Data, Cek, Laporan, Pengelolaan / Platform), one clear active item, account actions in the footer menu, a clock and search in the top bar.

**Menu (masking-first product, owner 2026-09-25).** Dasbor · PENGIRIMAN: Buat kiriman, Histori kiriman, Retur (RTS), Cetak resi · DATA: Pengirim, Penerima · CEK: Cek resi, Cek tarif · LAPORAN: Laporan pengiriman, Riwayat cetak resi · PENGELOLAAN: Pengaturan. Impor CSV, Keuangan and Analitik are removed (their tables stay in the database).

**Filter row.** One line on the ground (`.cms-filter-bar`, wraps at 390): date-range button · outlet select · other primary filters · `Terapkan` (outline) · "Hapus filter" link when a filter differs from its default. Controls carry accessible names (sr-only), not visible labels above them; the active range summary sits under the row in `text-xs` muted.

## 4. Page anatomy

Every CMS page is, top to bottom:

1. `PageHeader` — eyebrow (the sidebar group name: Pengiriman, Data, Cek, Laporan, Pengelolaan, Platform) → h1 title (**identical to the navigation label and the document `<title>` "Label · GeraiCUAN"**) → one-line description (≤2 lines, no implementation jargon) → right-aligned actions: **at most one primary**, others `outline`/`ghost`. On mobile actions go full width below the text.
2. Optional scope/filter toolbar (one GET form; primary controls visible, secondary in a labelled disclosure).
3. Content regions in the pattern order (§5). Each region is a `Card` (plain `CardHeader`, no band) or a section on the ground under a `sectionHeadingClassName` heading — never a card inside a card.
4. Region-level states replace the region body, never the whole page (§7).

## 5. Page patterns

Each authenticated route adopts exactly one pattern. Patterns govern presentation only; authorization, validation, lifecycle, ledger and provider rules live in their own specs.

| Pattern | Routes | Structure |
|---|---|---|
| 1 Command center | `/app`, `/platform` | Header with scope + period → StatCard summary row (compact counts 2-col on mobile, money cards stacked) → comparative trend chart + its data table (disclosure) → **Perlu perhatian** ranked list (one list, severity badge, condition, scope, count, one action link) → recent records. `/platform` puts Perlu perhatian first |
| 2 Queue | `/app/pengiriman`, `/app/pengiriman/rts`, `/app/kontak/pengirim`, `/app/kontak/penerima`, `/app/label`, `/platform/tenant`, `/platform/pendaftaran`, `/platform/audit` | Header (job + one primary) → `StateSummaryPanel` or status tabs with counts in the URL → search + filter chips (`Hapus filter`) → table in `DataTableShell` → `DataTablePagination`. Row actions in a `⋯` menu with only valid actions. Bulk bar only for safe multi-row actions. System-empty ≠ filtered-empty |
| 3 Detail | `/app/pengiriman/[id]`, `/app/kontak/[id]`, `/app/label/[id]`, `/platform/tenant/[id]` | Back link/breadcrumb → title + status badge + the one valid next action → key-facts `DefinitionGrid` → grouped sections (two columns ≥1024px: facts left, timeline/actions right) → human-readable timeline → danger zone at the bottom |
| 4 Settings | `/app/pengaturan/*`, `/app/anggota` | `SettingsLayout` rail (≥lg) or index list (mobile) → `SettingsCard` stack: title, optional status badge, description, body, footer with its own save. Readiness strip first when the object can be not-ready |
| 5 Flow | `/app/pengiriman/baru`, `/app/kontak/baru`, provisioning dialog; single-step lookups `/app/cek-resi`, `/app/cek-tarif` (no stepper, result below the form) | GeraiOS form pattern: numbered section cards (step number in a round `bg-accent` marker, `aria-hidden`), labels above fields, inline errors + linked error summary, one primary action naming its consequence, sticky summary rail ≥`@4xl` (steps + summary + action) and a sticky bottom action bar below it. `/app/pengiriman/baru` is the one-page flow: *Isi data → Cek tarif (automatic) → Terbitkan resi* (T-200) |
| 6 Analysis | `/app/laporan/*` (T-204: Analitik and Keuangan removed; courier performance lives in Laporan pengiriman) | One unframed filter row (`.cms-filter-bar`, primary controls visible, secondary in a disclosure) → StatCard row → each chart followed by its complete table (disclosure) → authoritative detail table. Keuangan: summary → variance queue → ledger. The selected period and timezone sit beside every KPI and chart. Bars start at zero; tooltips are never the only way to read a value. Reconciliation is a compact alert after the operational KPIs; its colour follows the variance count, not the signed total, and an exact zero reads neutral (no `+Rp 0`) |

## 6. Shared components

| Component | Contract |
|---|---|
| `PageHeader` | §4; h1 focusable for route focus management |
| `RecordList` / `RecordItem` | `src/components/cms/record-list.tsx`. One white card, rows divided by hairlines, `md:hidden`; `initial={n}` shows the first n rows and puts the rest behind one "Tampilkan N lainnya" `<details>` (long pages on a phone); `className` styles the list itself. Row anatomy: **title** (the one link, `text-base font-semibold`, ≥44px target) + **status** badge right → **primary** line (`text-sm` ink: who/where) → **secondary** line (`text-sm` muted: courier · resi, outlet) → **footer**: value start (`text-sm font-semibold tabular-nums`) and time end (muted). Max four lines; everything else lives on the detail page. At most one row action, and only where the table row has it (an icon action, or one `outline` `size="sm"` button for a consequential step such as "Buat pembalik"); `RecordItem` passes `id`/data attributes to the `<li>` for focus targets |
| `StatCard` | Solid `Card`: label (`text-sm font-medium text-muted-foreground`, sentence case) → value (`text-3xl font-bold tabular-nums`) → context line (period/basis, `text-xs`) → optional `KpiDelta` pill: neutral, arrow + word ("Naik 3 (33%)", "Turun 4", "Tidak berubah"); `--warn` only when the change in that direction needs attention (§1.9). Optional icon is `size-4 text-muted-foreground`, no coloured squircle. One radius, one padding, no accent prop colours |
| `ShipmentStatusBadge` / `ToneBadge` | Only source of lifecycle/severity presentation: square `rounded-md` lifecycle badge, round severity badge; always icon + text; tones from `toneClass`/`toneIcon` |
| `StateSummaryPanel` | Two forms, both frameless (§1.6): segmented tabs on a `--muted` track (pressed = `--background` + resting shadow) or solid cards with the resting shadow (pressed = `--accent` fill + `--primary` ring + check glyph); `aria-pressed`; tabular counts; `min-h-11` (tabs `min-h-10` from md); 2px focus ring |
| `DataTableShell` / `Table` | Header `bg-muted` + bottom rule; opaque zebra (`--table-stripe`); hover/selected `--accent`; pinned identity column opaque with 1px divider; one scroll owner with a hint only when overflowing; money right-aligned sans `tabular-nums`; stacked cells per T-148 (time: date + muted `HH.MM WIB`; courier/service over AWB; recipient name, phone, district–city) |
| `DataTablePagination` | Desktop numbered links; mobile summary + four 44px controls |
| `DateRangeFilter` | Native `<details>` in the page GET form; popover ≥md, bottom sheet below; `id-ID`, week starts Monday; range ends `--primary`, band `--muted`; 44px cells below md |
| `SettingsLayout` / `SettingsCard` | T-156 anatomy (rail `lg:w-44 xl:w-56`, content ≤47.5rem; card = section with h2, badge, description, body, divided footer) |
| `EmptyState` | Icon, title stating why it is empty, next action; filtered-empty names the filters and offers reset |
| `Alert` | `default`/`destructive` + icon; `role=status` for non-blocking, `role=alert` only for urgent failures; never the only record of an outcome |
| `ShipmentIssuancePanel` | The only issuance UI (detail and `/baru`): service table with radio, breakdown for the selected service, explicit confirmation checkbox, primary "Konfirmasi dan terbitkan AWB", release-gate alert while fixture-only |
| Forms | `Field` + `FieldLabel` above control; 1px resting border, exactly one 2px focus indicator; error text + `aria-invalid`; `SelectValue` renders the chosen label on first paint |

## 7. States and feedback

Every data region implements: **loading** (skeleton mirroring the final layout), **system-empty** (why + setup action), **filtered-empty** (active filters + reset), **error** (cause + local retry; sibling regions stay), **stale** (generated-at + refresh), **pending/submitting** (disabled control with progress label), **success** (announced next to the control). Loading/error route files repeat the page's eyebrow and title. Destructive or costly actions follow the confirmation ladder: reversible saves directly; costly/access-removing uses `AlertDialog` stating the consequence; tenant suspension/archive additionally requires typing the tenant name.

## 8. Content and locale

- Indonesian, sentence case, concise; one term per concept across the product (e.g. *kiriman*, *resi/AWB* shown as "Resi", *titik pickup*, *Perlu perhatian*). **The business is a *gerai*, never *toko*** (owner 2026-09-25): "Daftarkan gerai", "Profil gerai", "Nama gerai", "Masuk ke gerai Anda". Stored names typed by users (e.g. a contact called "Toko Kain Haji Umar") are data and stay as typed. Buttons name their consequence (`Simpan & cek tarif`, `Konfirmasi dan terbitkan AWB`, `Buat 12 draf`).
- No implementation or enum text on screen (`ESTIMATED`, `PLATFORM_MONITORING_VIEWED`, provider statuses, ledger sources); every enum reaches the page through one Indonesian label map, and audit events render as Indonesian sentences.
- One courier display-name map everywhere a courier or service code renders (e.g. `JT` → "J&T", `lion` → "Lion Parcel", `pos` → "POS Indonesia", `spx` → "Shopee Express", `anteraja` → "AnterAja", `iDexpress` → "ID Express"); delivery estimates normalise to "1–2 hari".
- Money via `Intl.NumberFormat("id-ID", {style:"currency", currency:"IDR", maximumFractionDigits:0})`; dates/times with the timezone label (WIB). Provider values are labelled as Mengantar estimates with retrieval time; COD principal is never labelled revenue.
- Shipment number `PREFIX-NNNNN` (PR-44: 2–5 uppercase letters/digits, default `GC`) never wraps.

## 9. Responsive and accessibility

- Breakpoints: mobile <768 (sheet nav, stacked regions, 44px targets), tablet 768–1023 (icon rail), desktop ≥1024 (full sidebar, two-column detail/settings/flow).
- No document-level horizontal overflow at 390px. **List pages below `md` render a `RecordList`** (§6) instead of the table — owner 2026-09-25: "mobile like web apps view" (resolves V-9); the table keeps `md` and up. Tables that are not lists of records (estimate/service choice, breakdowns, report totals) keep a labelled, focusable local scroller on mobile. Forms keep one DOM tree for all widths; a list may render its rows twice (cards + table) because the two are read-only views of the same rows.
- WCAG 2.2 AA target: semantic landmarks and headings, visible 2px focus, keyboard-operable everything, status never by colour alone, charts with direct labels + complete tables, reduced motion respected.

## 10. Special surfaces

### 10.1 Sign-in, sign-up and recovery (PR-62/T-183)
Operators aged 40+: 17px body, 28px heading, 48px fields, 52px primary, 44px links. Tenant surface on the light ground with the brand blue top rule; Super Admin surface on a dark ground with its own badge so the two cannot be confused (the dark ground and amber badge are the documented colour exceptions, in `globals.css` `.auth-*`).

### 10.2 Public landing (T-184, `apps/landing`)
Static Astro site; copies the used `:root` tokens verbatim (checked by `scripts/ui-audit/landing-page.mjs` `token-parity`); 18px body, 44px targets, zero client JavaScript; two intents only (Daftarkan gerai, Masuk). Editorial utility with the thermal-label proof point; no CMS data.

### 10.3 Settings and members
`/app/anggota` is a SettingsCard stack (Ringkasan akses, Daftar anggota, Undang anggota); the last active Tenant Admin shows its lock badge and protection sentence instead of controls.

### 10.4 Thermal label (T-176)
Designed for a 203 dpi head, pure black on white, no tints. **10 × 15 cm** default (10 × 10 package label + cut line at 100 mm + 10 × 5 sender stub) or **10 × 10 cm** alone, via `@page label-100x150` / `label-100x100`. Text floor 7pt; bold for courier, AWB, recipient name/phone, area, COD box; Code 128 B, 0.25mm module, 10-module quiet zones, bars 10mm (stub 9mm); AWB >29 chars prints as text with a warning. Recipient density tiers keep the area line before the street address. The stub never carries recipient identity, address, contents, value or COD breakdown. Preview equals print (box-by-box audit).

## 11. Required surfaces and screen contracts

| Screen | Primary job | Critical states | Guardrails |
|---|---|---|---|
| Landing (Astro) | Understand, then register or sign in | normal, CMS link unavailable | No operational data; CTA to tenant origin only |
| Tenant / Super Admin login | Enter the right CMS | invalid credential, suspended, expired | Generic failure wording; never route tenant staff to platform |
| Tenant home | Choose the next safe action | loading, system-empty, partial failure, stale, readiness/unpaid/submission exception | Operator sees no finance/governance data |
| Buat kiriman | Create one shipment and issue the AWB on one page | draft, estimating, estimate error, COD unavailable, submitting, issued, unpaid, failed, unknown | Explicit confirmation; print only after provider AWB; release gate visible while fixture-only |
| Impor CSV | Validate and create many drafts | schema error, partial valid rows, created | Row-level outcome; partial failure never hidden |
| Kiriman / RTS / Label queues | Find, compare, inspect, act | loading, empty, filtered-empty, error | No provider mutation as a bulk action |
| Analitik / Laporan / Keuangan | Explain and reconcile | loading, no data, stale, variance | COD principal non-revenue; charts have tables |
| Pengaturan / Anggota | Configure outlet, pickup, Mengantar account, members | not-ready, saving, error, last-admin lock | No secret fragments; readiness badge and checklist from one server result |
| Platform monitoring / tenants / audit | Act on platform health and tenants | loading, empty, alert, filter mismatch | Credentials and PII redacted; events in readable Indonesian |

## 12. Screening standard

- Screen the whole product after material UI change: all tenant, platform, public and auth routes at **390 and 1440** (768 for shell changes). Compare shell gutters, header geometry, section rhythm, control/row density, status vocabulary, forms, tables/charts, and every state in §7.
- Record findings in `docs/visual-screening-register.md` with route, viewport, evidence and the rule in this document that is broken; repair each through its own task. A passing screen is not redesigned to make an audit look productive.
- Reject: glass/blur, translucent cards, per-card accent colours, nested cards, decorative KPI grids, off-scale sizes, duplicate responsive form trees, hidden identifiers, colour- or hover-only meaning, raw enums on screen, document overflow at 390.
- Acceptance needs rendered browser evidence (journey + keyboard/focus + overflow), not a screenshot or green build alone.

## 13. Provenance (condensed)

- v1 accumulated per-task decisions: Tokophi-referenced blue (T-109/T-110), preset `b1Ymqvgky` (T-111), supplied palette (T-112), black-and-white shadcn-admin (T-118), shared blue interaction palette (T-132, **retained** as `--primary`), layered ground + resting elevation + card band + one tone vocabulary (T-155/T-172, **retained**), state summary panel (T-162), date-range control (T-163), settings menu/card (T-156), control precision (PR-38), stacked table cells (T-148), shipment number prefix (PR-44), thermal label (T-176). Their still-valid rules are folded into §2–§10; the full history remains in `git log -p docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md` and `BUILD-LOG.md`.
- Spec 20 (iOS glass, 2026-09-18) was partially applied to StatCard, StateSummaryPanel, settings layout, several queue/lookup pages and dialogs; v2.0 withdraws it. Removing those classes is tracked per finding in the visual register.
- The GeraiOS v0.5 pattern contributes: calm operational clarity, semantic-token-only styling, the typographic and spacing scale discipline, the shell with persistent scope and grouped navigation, the page header with one primary action, numbered form sections with a summary rail, status badges with icon + text, and list/detail/form/settings screen patterns. GeraiOS's teal palette is **not** adopted; GeraiCUAN keeps its accepted blue (T-132).
