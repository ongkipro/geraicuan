# Design System — GeraiCUAN UI v3

| Field | Value |
|---|---|
| Status | Accepted — the single design contract for every GeraiCUAN surface |
| Version | 3.3 / 2026-09-26 (**v3.3 GeraiCUAN brand colours**, D-22: navy primary, green accent — §2.0; layout unchanged from v3.2. UI rebuilt from zero, [ADR-0001](../adr/ADR-0001-ui-v3-rebuild.md); v3.1 adopts the GeraiOS v0.5 token, status, component-state and validation contracts — `~/Projects/geraios/docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md`, `docs/UI_UX_ANATOMY.md`; **v3.2 adopts the Mengantar-app look** (D-18, PR-85, T-228): §13 deltas D1–D6, D9, D11, D12 through the tokens and the shared shell/components; D7 and D8 rejected for the 40+ floor) |
| Owner | Product owner (Paduka Ongki) |
| Visual source | Layout and content: the owner's HTML reference `~/Documents/work/notes/geraicuan-html/` (26 pages, served at `http://100.127.67.86:3333/` during development) and `~/Documents/work/notes/geraicuan-ui-analysis.md`, measured at 1440×900 on 2026-09-25. Look (colour, shell, cards, tiles, header): the Mengantar app study `~/Documents/work/notes/mengantar-app-ui-analysis.md` §1–§3, §7–§9 (v3.2). |
| Component source | Official shadcn/ui primitives in `src/components/ui/*` (reinstalled from the registry 2026-09-25) and the registry blocks `dashboard-01`, `sidebar-07`, `sidebar-16` as composition patterns |
| Behaviour source | `docs/spec/17-UX-FLOWS-SCREEN-CONTRACTS.md` §UX-v3 |
| Supersedes | Spec 10 v1–v2.2 and spec 20 (glass); their text remains in git history only |

One brand, no white-labelling in MVP. Locale `id-ID`, IDR, timezone WIB (`Asia/Jakarta`). The business is a **gerai**, never *toko* (user-typed names excepted).

---

## 1. Principles

1. **The references are the look.** The owner's HTML reference sets layout and content; the Mengantar-app study (v3.2) sets colour, shell, cards, tiles and the page header. When this document and a reference disagree on a visual value, the reference wins and this document is corrected; when a reference breaks an accessibility rule below, this document wins and the deviation is listed in §12.
2. **Built for operators aged 40+.** Body 15–16px, nothing that must be read below 13px, secondary text slate `#4F5B6B` (≥ 6:1 on white, ≥ 6.1:1 on every fill it sits on), controls 40px on desktop and 44px on touch, input borders clearly visible (`#8C8C8C`, ≥ 3:1 on white and canvas).
3. **Clean minimal, colour only where it changes a decision.** Blue-grey canvas and navy ink; the primary blue for the top bar, the one primary action, outline buttons, links and the current nav item; status colours only on status badges, pastel status tiles, variance and danger.
4. **One frame level.** A region is a white borderless card (radius 16, soft shadow) on the canvas, or plain content on the canvas. The only thing inside a card is a borderless inner tile (`--tile`, radius 10); tables inside cards have no outer border.
5. **No AI slop.** No explanatory sentence under every heading or field, no duplicated headings, no meta lines ("data diperbarui otomatis…", "geser tabel…", "diurutkan dari…"), no badge that restates the heading. One freshness line per page at most. Long explanations live behind one "?" help popover.
6. **shadcn used plainly.** Compose installed primitives; change a primitive only through the tokens in §2 or a documented size variant in §4. No per-page restyling of a primitive.

## 2. Tokens (`src/app/globals.css`)

### 2.0 Brand palette (v3.3, D-22 — supersedes the v3.2 colour values in §2.1; layout, sizes and anatomy unchanged)

Owner palette (2026-09-26): navy `#0B2D4F` / `#071E33`, green `#10B981` / `#059669` / `#34D399` / `#D1FAE5`, ground `#F8FAFC`, text `#0F172A` / `#475569` / `#94A3B8`, border `#E2E8F0`, success `#10B981`, info `#2563EB`, warning `#F59E0B`, danger `#DC2626`. Mapped to tokens under the 40+ floor (WCAG ratios computed in sRGB):

| Token | Value | Ratio / rule |
|---|---|---|
| `--primary` (top bar, primary buttons, links, sidebar icon square) | `#0B2D4F`, hover `#071E33` | white on it 13.98 |
| `--brand` (active-item bar, success accents) | `#10B981` | accent only: white text on it is 2.54 — never a text background with white text |
| `--brand-light` ("CUAN" in the top-bar wordmark) | `#34D399` | on navy only, 7.27 |
| `--brand-strong` (green text) / `--ok` | `#047857` | 5.48 on white, 5.21 on `#ECFDF5` |
| `--ring` | `#059669` | ≥ 3:1 on every ground (3.6 on `#F8FAFC`) |
| `--background` / `--card` | `#F8FAFC` / `#FFFFFF` | — |
| `--foreground` | `#0F172A` | 17.06 on ground |
| `--muted-foreground` | `#475569` | ≥ 6.9 on every ground and tile |
| owner `--text-muted #94A3B8` | not a text token | 2.56 on white — decorative icons/disabled only |
| `--border` / `--input` | `#E2E8F0` / `#7B8AA0` | input ≥ 3.35 (the owner's `#E2E8F0` would be 1.23 for a field boundary) |
| `--accent` (selected option, hover) | `#ECFDF5` with navy text | 13.27 |
| `--warn` text / fill | `#B45309` / `#F59E0B` for icons and fills | owner `#F59E0B` as text is 2.15 |
| `--danger` text, `--destructive` | `#B91C1C` | owner `#DC2626` on its own tint is 4.41 |
| `--info` | `#2563EB` | 5.17 |
| tiles | `#F8FAFC`, info `#EFF6FF`, ok `#ECFDF5`, warn `#FFFBEB`, danger `#FEF2F2` | muted text ≥ 6.9 on each |

The thermal label and the invoice sheet stay black on white. Dark palette (dormant) uses `#34D399` as primary with navy foreground.

### 2.1 Colour (v3.2, Mengantar look — values superseded by §2.0)

| Token | v3.1 | **v3.2** | Use |
|---|---|---|---|
| `--background` (canvas) | `#F7F7F7` | **`#F2F4F8`** | Body behind everything, sidebar ground |
| `--card`, `--popover` | `#FFFFFF` | `#FFFFFF` | Cards (borderless), menus, dialogs, the current nav pill |
| `--foreground` (ink) | `#1A1A1A` | **`#203551`** navy | Text, values, headings |
| `--muted-foreground` | `#5C5C5C` | **`#4F5B6B`** | Descriptions, table headers, meta (≥ 13px; D7 rejected) |
| `--border` | `#E5E5E5` | **`#E3E8F0`** | Dividers inside cards, sidebar footer rule (cards themselves have none) |
| `--input` | `#949494` | **`#8C8C8C`** | Resting border of inputs, selects, the date-range field (D8 rejected: Mengantar `#BFCEE0` is faint; `#949494` was 2.75:1 on the new canvas) |
| `--primary` / hover | `#2E47BA` / `#243A9B` | same, text white | Top bar, the one primary action, outline buttons, links, focus ring, current-item icon square |
| `--accent` | `#EEF2FF` + `#2E47BA` | same | Selected option card, KPI icon chip, outline-button hover |
| `--muted` | `#F2F4F7` | **`#EEF1F6`** | Neutral badge fill, skeleton, hover row, segmented control |
| `--secondary` | `#F2F4F7` | **`#EEF1F6`** | Count badges, role badge |
| `--sidebar` / `--sidebar-accent` | `#FFFFFF` / `#EEF2FF` | **`#F2F4F8` / `#FFFFFF`** | Sidebar on the canvas; the current item is a white pill with primary text |
| `--tile` (new) | — | **`#F6F8FC`**, radius 10 | Inner tile inside a card; neutral status tile |
| `--tile-info` / `-ok` / `-warn` / `-danger` (new) | — | **`#EDF4FB` / `#EFFAF3` / `#FFFBEB` / `#FFF5F5`** | Pastel status tiles, one tint per meaning (tiles only; badges keep the tones below) |
| `--shadow-card` (new) | none | **`0 1px 3px rgb(32 53 81 / 8%), 0 15px 20px rgb(217 223 232 / 40%)`** | Every card. Mengantar's `0 15px 20px rgba(217,223,232,.2)` alone measured invisible on `#F2F4F8` (a white card is only 1.1:1 against the canvas), so the alpha is doubled and a 1px navy contact shadow gives the edge |
| Success | `#087443` on `#ECFDF3` | same | Terkirim, Resi terbit, Siap, Aktif, Cocok |
| Warning | `#A15C07` on `#FFFAEB` | same | Menunggu, Antre retur, Perlu perhatian, Ada selisih |
| Danger / `--destructive` | `#B42318` on `#FFF1F0` | same | Gagal, Bermasalah, Perlu rekonsiliasi, destructive actions |
| Info | `#245A85` on `#E9F1F8` | same | Diestimasi, Antre kirim, Dalam perjalanan, Retur dalam perjalanan |
| Chart | Okabe-Ito `#0072B2 #009E73 #E69F00 #CC79A7 #D55E00` | same | Series only, each with marker/label |

Semantic classes only in `src/app/**` and `src/components/**` (`bg-background`, `text-muted-foreground`, `border-input`, `bg-tile-warn`, `shadow-card`, `text-h1`, …); no raw palette classes (`slate-*`, `blue-*`, …) or hex, except the thermal label and the Super Admin auth ground.

Measured contrast (WCAG 2.1, sRGB, 2026-09-26, computed from the tokens and re-measured from computed colours on every screened route):

| Pair | Ratio | Floor |
|---|---|---|
| Ink `#203551` on card / canvas / tile / muted | 12.43 / 11.29 / 11.69 / 10.8 | 4.5 |
| Muted `#4F5B6B` on card / canvas / tile / muted fill | 6.91 / 6.27 / 6.49 / 6.10 | 4.5 (target ≥ 6 on white, ≥ 5.5 on canvas) |
| Muted on pastel tiles ok / warn / danger / info | 6.46 / 6.66 / 6.46 / 6.23 | 4.5 |
| Ink on pastel tiles ok / warn / danger | 11.62 / 11.99 / 11.62 | 4.5 |
| White on primary (top bar, primary button) / on hover | 7.70 / 9.75 | 4.5 |
| Top-bar secondary line (white 85% on primary = `#E0E3F5`) | 6.04 | 4.5 |
| Primary on card / canvas / accent / tile | 7.70 / 6.99 / 6.89 / 7.24 | 4.5 |
| Status text on its soft fill: success / warning / danger / info | 5.55 / 4.97 / 5.98 / 6.40 | 4.5 |
| Input `#8C8C8C` on card / canvas | 3.36 / 3.05 | 3.0 (non-text) |
| Border `#E3E8F0` on card | 1.23 | decorative only, never the sole boundary of a control |

Browser sweep (T-228, 19 routes × 1440/1024/390): smallest visible text 13px, lowest `#4F5B6B` pair 6.10:1, no visible text pair below 4.5:1. Focus ring 2px `--primary`, offset 2px.

### 2.2 Type (Inter; numbers `tabular-nums`; `ui-monospace` only for AWB/resi, shipment number, prefix)

| Role | Size / weight / line height | Measured in reference |
|---|---|---|
| Page title H1 | **32px / 700 / 40px navy** (`text-h1`), 26px below 768px | Mengantar H1 36/600 → 32/700 (v3.2, D5) |
| Page description (only where a screen contract needs it) | 15px / 400 / muted | Mengantar has none (v3.2) |
| Card title H2 | 18px / 700 | reference card headings 18/700 |
| Body, table cells, controls, nav | 15px / 400; nav 15px / 500 (current 600) | td 15px, nav 15/500 |
| Table header | 13px / 500 / muted / no fill / sentence case | th 13/500 |
| Meta, helper, badge | 13px / 500 | badge 13/500 |
| Nav group label | 13px / 600 / uppercase / tracking 0.05em / muted | 12/600 (raised to 13, §12) |
| KPI value | 30px / 700 | — |
| Total (money highlight) | 24px / 700 / `--primary` | buat-kiriman total |

### 2.3 Space, size, radius, elevation

| Item | Value |
|---|---|
| Spacing scale | 4 · 8 · 12 · 16 · 24 · 32 · 48 px only |
| Page padding | 32px desktop, 16px below 768px |
| Content width | max 1120px, left-aligned in the main area |
| Section gap | 24px between regions; 16px between fields |
| Card | **no border, radius 16px (`rounded-2xl`), `shadow-card`**, padding 24px (16px below 768px) |
| Inner tile | `--tile` or a pastel tint, no border, radius 10px (`rounded-xl`), padding 16px |
| Controls | Button/input/select 40px desktop, 44px touch; radius 8px; input padding-x 12px; button padding-x 16px, 15px/500 |
| Large primary (flow submit) | 48px, 15px/700 |
| Badge | 24px, radius full, padding-x 10px, 13px/500, icon 14px + word |
| Table | header row 44px, body rows ≥ 48px, cell padding 12–16px |
| Sidebar | 256px, transparent on the canvas, no right rule; item 44px, 15px/500 navy, icon 20px in a 40×40 box; current item = white pill + `shadow-card`, primary text 600, icon box primary with a white icon (radius 8), 4px primary bar at the right edge |
| Top bar | 64px, full width above the sidebar, solid `--primary`, white text, `shadow-resting` |
| Elevation | `shadow-card` on cards and status-tile groups; `shadow-resting` on the top bar and sticky bars; `shadow-md` on popovers and menus; dialogs `shadow-lg` |

### 2.4 Ergonomic rationale (from GeraiOS `UI_UX_ANATOMY.md`)
Operators are 40+ (presbyopia), sit 60–90 cm from a 14–24" screen past scales, printers and parcels, under shop lighting with glare, and one misread digit in a resi, phone or COD amount ships a parcel wrongly or loses money. Hence: nothing functional below 13px; resi, phone and money bold and large where they are the point of the screen (resi on detail/label 18–20px mono bold, totals 24px bold); controls 40–44px; generous gaps so nothing overlaps at 125–200% browser zoom.

## 3. Shell (`sidebar-16` pattern; v3.2 Mengantar look)

- **Top bar** (full width, 64px, sticky, solid `--primary`, white text): sidebar trigger (below 1024px; hamburger on the phone, panel icon beside the rail) · brand (white "GC" square with primary text + "GeraiCUAN", the wordmark from 768px) · a white 30% rule · gerai name + role badge + "Data tenant · N outlet terdaftar" (the role badge and line from 640px) · white "Cari halaman…" field with ⌘K (a white search icon below 640px) · date · time WIB at 85% white (from 768px).
- **Sidebar** (below the top bar, on the canvas, no panel or rule): flat groups with uppercase 13px labels (groups and order unchanged, below); each item an icon in a 40×40 box + label 15/500 navy; the current item is a white pill with `shadow-card`, primary label 600, its icon box filled primary with a white icon, and a 4px primary bar at the right edge; account row in the footer (avatar initial, name, email, menu: Anggota & akses, Keluar) above a `--border` rule. Desktop ≥ 1024 full; 768–1023 icon rail with tooltips (the 40px icon box alone); < 768 a Sheet opened from the top bar.
- **Focused layout** (D11; `/app/pengiriman/baru`): no sidebar; the top bar holds the brand, the 3-step stepper centred (white on primary: current = white chip, done = check, pending = outlined; below 768px only the current step keeps its label) and a close ✕ (44px, "Tutup, kembali ke Histori kiriman") to `/app/pengiriman`; the content column (max 1120px) is centred; the summary rail stays sticky.
- **Menu (tenant):** Dasbor · PENGIRIMAN: Buat kiriman, Histori kiriman, Retur (RTS), Cetak resi · DATA: Pengirim, Penerima · CEK: Cek resi, Cek tarif · LAPORAN: Laporan pengiriman, Riwayat cetak resi (Tenant Admin) · PENGELOLAAN: Pengaturan (Tenant Admin). **Platform:** Ringkasan, Tenant, Pendaftaran, Audit.

## 4. Anatomy

### 4.1 Page
`H1` 32/700 navy (= menu label = document title "<Label> · GeraiCUAN"), **no eyebrow** → a description line **only where the screen contract (spec 17) needs one — prefer none** → actions right (max one filled primary; others primary-outline; a "?" `HelpHint` instead of Mengantar's Tutorial button) → 24px → filter row (optional) → regions. `PageHeader` accepts and ignores a legacy `eyebrow` prop.

### 4.2 Filter row
One line on the ground: date-range button (calendar icon) · outlet select · other primary filters · `Terapkan` (outline) · "Hapus filter" link when not default. Controls have sr-only names, no visible labels above. Under it at most one 13px muted line with the active period.

### 4.3 Card
White, borderless, radius 16, `shadow-card`. Header: title (18/700) + optional count badge or "?" help at the right; optional one-line description only when the reference has it; a 1px divider under the header only when the body is a table. Body: content with 16px rhythm. Footer: right-aligned actions or a single link.

### 4.4 Data table (list pages)
Inside one card: toolbar row (search, status tabs or facet, secondary actions) → table (≤ 7 columns desktop; stacked two-line cells: primary 15px ink + secondary 13px muted) → footer (count "N kiriman" + pagination). Shipment number/AWB mono link in `--primary`; money right-aligned. Below 768px the table becomes a **record list** (§4.5). No scroll hints, no sort sentences.

### 4.5 Record card (mobile list row)
Line 1 identity link (16/600) + status badge right · line 2 who/where (15px) · line 3 courier · resi (13px muted, resi mono) · line 4 value left (15/600) + time right (13px muted). After 10 rows: "Tampilkan N lainnya".

### 4.6 Status tiles (queue filters)
One white card holding up to 6 borderless pastel tiles in one row (2 columns on phone; radius 10): label 15/500 · count 26/700 · one short line 13px muted. Tint by meaning (`--tile` neutral, `--tile-info`, `--tile-ok`, `--tile-warn`, `--tile-danger`), from the tile's `tone` or its shipment-status key via the §4.12 mapping. Selected: 2px `--primary` ring + check.

### 4.7 KPI card
White borderless card: label 15px muted + icon 20px primary in a 40px `--accent` circle chip at the right → value 30/700 navy → delta pill (neutral; arrow + "Naik/Turun n (x%)") + "vs periode sebelumnya" 13px.

### 4.8 Flow (Buat kiriman) — see spec 17 §UX-v3.6
Focused layout (§3, D11). Two columns from 1024px: form + sticky summary rail (360px) inside the centred 1120px column. Stepper in the top bar (3 steps). Numbered section cards (white, borderless, radius 16, `shadow-card`) (number chip 24px, title 16/600, status badge right). Option cards (payment, handover, size): 1px `--input`; selected `--accent` + `--primary` border + radio. Mobile: rail hidden, sticky bottom bar (total + primary).

### 4.9 Detail
Two columns from 1024px: main + right rail (status, next action, timeline). Below 1024px the rail comes first. Back link above the H1.

### 4.10 Settings
Left sub-menu (Profil gerai, Titik pickup, Outlet, Koneksi Mengantar, Anggota & akses) + content column (max 760px) of cards.

### 4.11 Component appearance rules
- Primary buttons are solid and reserved for the next safe action; secondary actions outline/ghost; dangerous actions use destructive wording that names the shipment/object and consequence, behind an AlertDialog.
- A disabled action states its unmet guard in one line next to it (e.g. "Pilih layanan dan centang Paket sudah dicek fisik").
- Inputs keep a visible label above the field and reserve inline error space; an error summary at the top links to invalid fields.
- Mengantar-authoritative facts (resi, provider status, settled amounts) are labelled as such and never mixed with GeraiCUAN estimates without a label ("Estimasi", "Tarif resmi").
- Screen styling never rescales the printed thermal label.

### 4.12 Shipment status presentation (one mapping, `src/lib/shipment-queue.ts` → `StatusBadge`)
| Status | Label | Tone | Icon (lucide) |
|---|---|---|---|
| DRAFT | Draf | neutral | `FilePen` |
| ESTIMATED | Diestimasi | info | `Calculator` |
| SUBMISSION_QUEUED | Antre kirim | info | `Clock` |
| SUBMISSION_UNKNOWN | Perlu rekonsiliasi | danger | `CircleAlert` |
| ISSUED | Resi terbit | success | `CircleCheck` |
| AWAITING_UPSTREAM_PAYMENT | Menunggu pembayaran | warning | `Clock` |
| IN_TRANSIT | Dalam perjalanan | info | `Truck` |
| DELIVERED | Terkirim | success | `PackageCheck` |
| PROBLEM | Bermasalah | danger | `TriangleAlert` |
| RTS_QUEUED | Antre retur | warning | `Undo2` |
| RTS_IN_TRANSIT | Retur dalam perjalanan | info | `Truck` |
| RTS_RECEIVED | Retur diterima | success | `PackageCheck` |
| FAILED | Gagal | danger | `CircleX` |
Labels come from `SHIPMENT_STATUS_PRESENTATION`; the tone/icon table is implemented once in `StatusBadge`. No page maps statuses itself.

### 4.13 Queue columns (Histori kiriman, desktop)
| Column | Content | Align / width | Hidden below |
|---|---|---|---|
| Nomor kiriman | `GC-10058` mono link + outlet (13px muted) | left, 160px | — |
| Status / Pembayaran | StatusBadge + payment line (13px) | left, 200px | — |
| Penerima | Name + "Kecamatan, Kota" | left, flexible | — |
| Ekspedisi / Resi | CourierLogo + resi mono (or "Belum ada resi") | left, 200px | `lg` |
| Paket | Content + weight | left, 180px | `xl` |
| Aktivitas | Date + time WIB | left, 140px | `lg` |
Below 768px: record cards (§4.5).

## 5. Components (`src/components/ui` + `src/components/app`)

| Component | Source | Notes |
|---|---|---|
| Button, Input, Select, Textarea, Checkbox, RadioGroup, Field | shadcn primitives | size variants set to §2.3 (40/44px) |
| Card, Badge, Alert, Separator, Skeleton, Tooltip, Popover, Dialog, AlertDialog, Sheet, DropdownMenu, Command, Calendar, Chart, Table, Sidebar | shadcn primitives | tokens only |
| `AppShell`, `AppSidebar`, `SiteHeader` | composed from `sidebar-07`/`sidebar-16` | §3 |
| `PageHeader`, `FilterBar`, `DataCard`, `RecordList`, `StatusTiles`, `StatusBadge`, `KpiCard`, `HelpHint`, `CourierLogo`, `EmptyState`, `Money` | new in `src/components/app/` | §4; one implementation each |
| `DateRangePicker` | shadcn Calendar + Popover | presets Hari ini, 7 hari, 30 hari, Bulan ini |

### 5.1 Component state contract
| Component | Required states | Interaction / accessibility |
|---|---|---|
| Sender/recipient picker | searching, no match, several matches, selected, new entry | Scoped to the tenant; shows enough to tell duplicates apart; saving for reuse is explicit |
| Destination area picker | searching, no match, selected + verified, provider error | Combobox semantics; verified check only after server validation |
| Product rows | empty, editing, invalid, complete | Quantity and weight per row; totals announced after edits |
| Payment selector | Non-COD default, COD, COD Ongkir, unavailable for route | Fee and amounts shown as separate labelled lines; unsupported COD explained |
| Quote/summary rail | estimate, final (Tarif resmi), changed, unavailable | Shows source and freshness; total re-announced on change |
| Status badge | every status in §4.12 | Text + icon; programmatic name |
| Confirmation dialog | submit, print/reprint, archive, suspend, role change | Focus moves in; Escape closes only non-submitting dialogs; focus returns to the trigger; names the object |
| Timeline | loading, populated, no events | Chronological list; every time with WIB |
| Data table | loading, empty, filtered-empty, error, paginated | Header cells; keyboard-reachable row link; no PII in the URL |
| Toast/alert | success, warning, error | `role=status` for non-blocking, `role=alert` only for urgent failures; never the only record of an outcome |

## 6. States
Every region renders: loading (skeleton of its final shape), system-empty (why + next action), filtered-empty (filters + "Hapus filter"), error (cause + retry, siblings unaffected), pending (disabled control with progress word), success (announced beside the control). Alerts: `role="status"` for information, `role="alert"` only for failures.

## 7. Content
Indonesian, sentence case, one term per concept (kiriman, resi, titik pickup, gerai, Perlu perhatian). Buttons name the consequence ("Simpan & cek tarif", "Konfirmasi & terbitkan AWB"). Money `Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0})`. Dates "25 Sep 2026, 10.13 WIB". Areas shown as "Kecamatan, Kota" in lists; full label only on detail.

## 8. Responsive
Checked at 1440, 1024, 768, 390. No page-level horizontal overflow at 390. Lists become record cards below 768px. Two-column flows/details stack below 1024px (detail rail first, flow rail hidden behind the bottom bar).

## 9. Accessibility
Landmarks and one H1 per page; every control labelled; focus visible (2px `--primary`, offset 2px); status = icon + word; 44px touch targets; one DOM order for all widths; reduced motion respected.

## 10. Thermal label (unchanged, T-176)
`label-sheet.tsx` and its print CSS keep their geometry: 10×15 cm (10×10 package + 10×5 sender stub) or 10×10 cm, pure black on white, Code 128 barcode, text ≥ 7pt. Screen chrome around the preview follows this document; the sheet itself is exempt from §2.

## 11. Screening standard (per screen, before it is done)
Side-by-side browser comparison with its reference HTML at 1440 and 390, section by section; measured: overflow ≤ 0, every text size on §2.2, controls ≥ 40/44px, one filled primary per page, no raw hex/arbitrary px in page code, no meta sentences from §1.5. Plus (GeraiOS §6): the screen's primary action completed with the keyboard only; pending, error and denied states shown; reflow at 200% zoom without hidden primary actions; no sensitive data in the URL, client errors or console. Screenshots stored with the task evidence.

## 12. Deviations from the reference
- Nav group labels and badges 12px in the reference → 13px (40+ floor).
- Reference detail pages colour the resi/COD in blue → ink bold (blue reserved for actions).
- Reference vehicle selector (Motor/Mobil/Truk) → superseded by D-19: stored and shown, not sent until T-153 (T-232).
- Reference input border `#A3A3A3` (2.5:1) → `#8C8C8C` (3.4:1 on card, 3.05:1 on the v3.2 canvas) for the WCAG non-text contrast floor.
- Mengantar (v3.2): secondary text `#6C757D`/`#6C7E95` at 12–14px (D7) → `#4F5B6B` at ≥ 13px; input border `#BFCEE0` (D8) → `#8C8C8C`; card shadow alpha .2 → .4 plus a 1px contact shadow (invisible otherwise); H1 36/600 → 32/700; sidebar item 54px → 44px so the full tenant menu fits a 900px-tall window; top bar 70px → 64px; Tutorial button → `HelpHint`; top-bar courier select, balance and dark switch dropped (out of scope).

## 13. Mengantar-app look — applied (D-18, T-228, v3.2, 2026-09-26)

Input: `~/Documents/work/notes/mengantar-app-ui-analysis.md` (measured study of app.mengantar.com, 2026-09-25/26). **Applied** in one global pass through the tokens (§2.1–§2.3) and the shared shell/components, with no per-screen restyling:

| Delta | Status | Where |
|---|---|---|
| D1 solid primary top bar | Applied | `SiteHeader`, §3 |
| D2 transparent sidebar, white active pill + primary icon square + right bar | Applied | `AppSidebar`, `--sidebar*`, §3 |
| D3 canvas `#F2F4F8` | Applied | `--background` |
| D4 borderless 16px cards with soft shadow; tile the only nesting | Applied (shadow strengthened, §12) | `Card`, `--shadow-card`, `--tile` |
| D5 H1 32px navy, no eyebrow, "?" instead of Tutorial | Applied; description only where spec 17 needs it | `PageHeader`, `text-h1` |
| D6 navy ink `#203551` | Applied | `--foreground` |
| D7 12–14px `#6C7E95` secondary text | **Rejected** — `#4F5B6B` ≥ 13px | §2.4 |
| D8 faint `#BFCEE0` input border | **Rejected** — `#8C8C8C` | §2.4 |
| D9 primary-outline secondary buttons | Applied (field-like triggers such as the date range keep `--input`) | `Button` `outline` |
| D10 Load More | Not adopted (pagination kept) | — |
| D11 focused Buat kiriman | Applied | `AppShell` focused route, `FlowStepper` |
| D12 pastel status tiles without border | Applied | `StatusTiles`, `KpiCard`, `--tile-*` |

Functional facts from the study used elsewhere: Mengantar's own order form has a **Dropshipper** switch (sender masking is a native provider concept → PR-71/PR-84), a *Rincian pembayaran* box (normal fee, special fee, estimated amount received) and pickup rows Tipe · Alamat · Waktu · Volume (→ PR-70).

## 14. Invoice sheet (PR-80)

80 mm roll: printable width 72 mm, body 11 pt sans, resi 14 pt mono bold, total 13 pt bold `tabular-nums`, rules 0.5 pt, black only. A4: 16 px body, two columns, same blocks. Anatomy: spec 17 UX-v3.9. Print CSS lives beside the label print CSS (`label.css` pattern), one `@page` per medium.

## 15. Sign-in and sign-up (PR-83)

One `AuthShell` card (max-width 448 px) on the canvas: brand mark, H1 24 px, fields 48 px with labels above, password field with a 44 px show/hide button (`aria-pressed`), one filled primary, secondary links as text links below. Errors: text under the field + one `Alert` summary. Super Admin: same card on the `--foreground` navy ground with the "Khusus Super Admin" badge.

**Split layout (T-225, D-21).** `AuthShell visual` (Masuk tenant, Masuk Super Admin, Daftar) adds at ≥ 1024 px a sticky full-height left panel, 44 % wide (max 640 px), padding 48/64 px, tokens only (no hex or arbitrary colours, so a palette swap in `globals.css` carries through): `bg-primary` ground (Super Admin: `bg-foreground` with a `border-background/15` divider), `text-primary-foreground`; GC mark on a `bg-primary-foreground` 40 px square, pills and icon squares `bg-primary-foreground/15`, nota mock `bg-card` + `shadow-xl`, a 13 px "Gratis" pill (tenant only), one 32 px/700 headline, the three cores as 18 px/600 items with 36 px icon squares (`Send`, `Printer`, `ReceiptText`) separated by "·", and a 320 px static nota mock (card, −2° rotation, `INV-SBN-10001` · `SBN-10001` · Total ongkir) built from markup and `aria-hidden`. The card column keeps the surface badge; its brand row hides at ≥ 1024 px. Below 1024 px the panel is not rendered visible and the page is the card alone. The Daftar stepper: three 32 px numbered chips (current = filled primary, done = primary outline + check, pending = `--input` outline) joined by 2 px rules, labels 15 px. Screen contract: spec 17 UX-v3.10.
