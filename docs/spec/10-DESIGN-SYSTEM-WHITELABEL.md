# Design System — GeraiCUAN UI v3

| Field | Value |
|---|---|
| Status | Accepted — the single design contract for every GeraiCUAN surface |
| Version | 3.2 / 2026-09-26 (the v3.3 brand-colour trial, D-22, was reverted by the owner the same day — D-24; §2.0 is kept as a record only. UI rebuilt from zero, [ADR-0001](../adr/ADR-0001-ui-v3-rebuild.md); v3.1 adopts the GeraiOS v0.5 token, status, component-state and validation contracts — `~/Projects/geraios/docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md`, `docs/UI_UX_ANATOMY.md`; **v3.2 adopts the Mengantar-app look** (D-18, PR-85, T-228): §13 deltas D1–D6, D9, D11, D12 through the tokens and the shared shell/components; D7 and D8 rejected for the 40+ floor) |
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

### 2.0 Brand palette trial (v3.3, D-22) — REVERTED (D-24); §2.1 v3.2 values are in force

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

### 2.1 Colour (v3.2, Mengantar look — in force)

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
| Content width | max 1120px at every breakpoint, centred in the main area (owner 2026-09-26; the 1400px 2xl step was dropped as too wide) |
| Section gap | 24px between regions; 16px between fields |
| Card | **no border, radius 16px (`rounded-2xl`), `shadow-card`**, padding 24px (16px below 768px) |
| Inner tile | `--tile` or a pastel tint, no border, radius 10px (`rounded-xl`), padding 16px |
| Controls | Button/input/select 40px desktop, 44px touch; radius 8px; input padding-x 12px; button padding-x 16px, 15px/500. Tabs triggers the same 40/44px (T-254; the shadcn default was 30px) |
| Large primary (flow submit) | 48px, 15px/700 |
| Badge | 24px, radius full, padding-x 10px, 13px/500, icon 14px + word |
| Table | header row 44px, body rows ≥ 48px, cell padding 12–16px |
| Sidebar | 256px, transparent on the canvas, no right rule; item 44px, 15px/500 navy, icon 20px in a 40×40 box; current item = white pill + `shadow-card`, primary text 600, icon box primary with a white icon (radius 8), 4px primary bar at the right edge |
| Top bar | 64px, full width above the sidebar, solid `--primary`, white text, `shadow-resting` |
| Elevation | `shadow-card` on cards and the status strip; `shadow-resting` on the top bar and sticky bars; `shadow-md` on popovers and menus; dialogs `shadow-lg` |

### 2.4 Ergonomic rationale (from GeraiOS `UI_UX_ANATOMY.md`)
Operators are 40+ (presbyopia), sit 60–90 cm from a 14–24" screen past scales, printers and parcels, under shop lighting with glare, and one misread digit in a resi, phone or COD amount ships a parcel wrongly or loses money. Hence: nothing functional below 13px; resi, phone and money bold and large where they are the point of the screen (resi on detail/label 18–20px mono bold, totals 24px bold); controls 40–44px; generous gaps so nothing overlaps at 125–200% browser zoom.

## 3. Shell (`sidebar-16` pattern; v3.2 Mengantar look)

- **Top bar** (full width, 64px, sticky, solid `--primary`, white text): sidebar trigger (below 1024px; hamburger on the phone, panel icon beside the rail) · brand (white "GC" square with primary text + "GeraiCUAN", the wordmark from 768px) · a white 30% rule · gerai name + role badge + "N outlet terdaftar" (the role badge and line from 640px) · white "Cari halaman…" field with ⌘K (a white search icon below 640px) · date · time WIB at 85% white (from 768px).
- **Sidebar** (below the top bar, on the canvas, no panel or rule): flat groups with uppercase 13px labels (groups and order unchanged, below); each item an icon in a 40×40 box + label 15/500 navy; the current item is a white pill with `shadow-card`, primary label 600, its icon box filled primary with a white icon, and a 4px primary bar at the right edge; account row in the footer (avatar initial, name, email, menu: Anggota & akses, Keluar) above a `--border` rule. Desktop ≥ 1024 full; 768–1023 icon rail with tooltips (the 40px icon box alone); < 768 a Sheet opened from the top bar.
- **Focused layout** (D11; `/app/pengiriman/baru`): no sidebar; the top bar holds the brand, the 3-step stepper centred (white on primary: current = white chip, done = check, pending = outlined; below 768px only the current step keeps its label) and a close ✕ (44px, "Tutup, kembali ke Histori kiriman") to `/app/pengiriman`; the content column (max 1120px) is centred; the summary rail stays sticky and never outgrows the window (§4.8, T-249). Step 1 shows its sub-progress "n/4 bagian lengkap" under its label from 768px (the bottom bar carries it below).
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

### 4.6 Status tiles (queue filters) — stat strip
T-248 (owner 2026-09-26: "jadikan bento aja", then "rapikan lagi biar kecil2"): the pastel tile cards became one compact **stat strip**: 72 px segments plus the composition bar and its legend, about 116 px tall on desktop (the T-246 tiles were about 150 px). `StatusTiles` is shared by Histori (6 tiles), Retur (5) and Cetak resi (4).

- **Container.** One white card (radius 16, `shadow-card`, no padding). Its segments are separated by 1 px `--border` dividers, vertical and horizontal (the grid's `gap-px` over `bg-border`).
- **Segment.** Each segment is its filter link, with the same href as the page's status filter, and its count is that filter's row count (PR-52).
  - Line 1: the §4.12 status icon (16 px, tone ink) inline with the label, 13/500 muted, never truncated. Dibatalkan uses `Ban` and Terkirim `PackageCheck`.
  - Line 2: the count, 20/600 tabular, on one line, followed by its share in muted 13 px.
  - The first tile is the page's "all" filter (Semua kiriman / Semua retur / Semua resi) and shows no share.
  - The hint is screen-reader text only.
  - There is no per-segment bar, and no pastel tint (the `--tile-*` tints stay for Cek tarif / Cek resi).
  - Segment layout: padding 12×10 in the phone grid and 16×12 from a 36rem strip; minimum height 64 px.
- **States.** Hover uses `--accent`. Focus draws a 3 px inset ring. Selected: 2 px `--primary` bottom indicator, primary label and count, `aria-current`.
- **Composition bar.** One stacked bar (6 px) runs under the segments and always fills the full width.
  - It has one segment per non-"all" tile with a count above 0, then **Lainnya**: the part of `total` no tile names (spec 19 QUE-OTHER / RTS-OTHER / LBL-OTHER = base − Σ status tiles, never negative).
  - Width = count ÷ `total`, the page's spec 19 QUE-SHARE / RTS-SHARE / LBL-SHARE base. On Histori, Lainnya is drafts, Siap dilanjutkan, RTS and so on; on Retur and Cetak resi it is 0 by construction.
  - Colours are by tone: ok, info, warn, danger, muted ink for neutral, and `--input` grey for Lainnya. Segments are split by 2 px of card.
  - Full-tone segments meet the 3:1 non-text floor on the card (the tone inks ≥ 4.5, `--input` 3.36).
- **Active filter.** While a status segment is selected (owner 2026-09-26: "bar bawahnya active juga kamu bedakan"), its bar segment stays full tone and grows to 8 px. Every other segment, and its legend dot, dims to 35 % opacity. The dimmed segments fall below 3:1 on purpose, as context; the legend text and the sentence below carry their values. With "Semua" selected, every segment is full tone.
- **Legend.** One 13 px muted line under the bar: a dot and "label (n)" per segment, ending with "Lainnya (n)". The active label is 500 ink. The line wraps on a phone.
- **Accessibility.** The bar and legend are `aria-hidden`. A screen-reader sentence repeats them: "Komposisi dari N: <label> n (x%), <active label> n (x%, dipilih), …, Lainnya n (x%)." A zero base draws nothing and no sentence.
- **Height.** The strip is about 116 px tall at desktop with the legend: 72 px segments, the 8 px bar row and a 36 px legend line.
- **Layout.** It follows the tile count inside `StatusTiles`, never a page override. The breakpoints are container queries on the strip, so the sidebar is already paid for.
  - Six and five tiles: 3 columns in rows, then one row from a 56rem strip (1280 px viewport). In that row, cells start at their content width and share the rest equally. Equal cells left 103 px for "Dalam perjalanan" at 1280 px and wrapped it.
  - Four tiles: 2 × 2, then one row from a 36rem strip (720 px viewport).
  - When a row is one cell short (five tiles in three columns), the last cell spans two, so no divider frames a hole.
  - Labels wrap only below the one-row width.
- **Loading.** `ListSkeleton` draws the same strip.

### 4.6b Report summary (Laporan pengiriman "Ringkasan")
T-251 (owner 2026-09-26: "ini card sepertinya perlu di rapikan juga"): the six §4.7 KPI cards (two rows, about 360 px at 1440) became two panels, 128 px at 1440. `ReportKpiStrip` in `src/app/app/laporan/pengiriman/analytics-sections.tsx`.

- **Panels.** Both use the §4.6 container: a white card (radius 16, `shadow-card`, no padding) whose cells are split by 1 px `--border` dividers. No icon chips.
  - **Volume** — Total kiriman, Terkirim, Retur, Gagal and Masih berjalan.
  - **Uang COD** — Nilai COD and Estimasi cair.
- **Placement.** The panels sit side by side (2/3 and 1/3) once the summary is at least 64rem wide, which is a 1440 px viewport. Below that they stack. At 1280 px the volume panel would get only 632 px and wrap its labels, so the switch is a container query on the summary, not `lg`.
- **Volume cell.**
  - Line 1: the label, 13/500 muted. An outcome label starts with an 8 px dot in its bar colour, and that dot is the bar's legend.
  - Line 2: the count, 20/600 tabular.
  - Line 3 (Terkirim and Retur only): the rate with its base, 13 px muted — "x% dari N kiriman" for Terkirim, "x% dari N selesai" for Retur.
  - These are report figures, not filters, so a cell has no link, hover or selected state.
  - Cells form one content-sized row from a 36rem panel. Narrower, they form 3 columns, and the last cell spans two.
- **Composition bar.** One 6 px stacked bar along the volume panel's bottom edge, split by 2 px of card. Segments run Terkirim (`ok`), Retur (`warn`), Gagal (`danger`) and Masih berjalan (`primary`), the Dasbor's outcome dot colours. Each width is count ÷ Total kiriman.
  - The four buckets are disjoint and sum to the total exactly (spec 19 RPT-SHP-OUTCOME-COMPOSITION), so there is no Lainnya segment.
  - A zero bucket takes no width.
- **Money cell.**
  - In a narrow panel (under 28rem, which is the 1440 side-by-side layout and phones), the label and the amount share one line, amount at the right, with the caption under them.
  - From a 28rem panel, label, amount and caption stack.
  - Estimasi cair carries a secondary "Estimasi" badge (§4.11), and its caption is "Perkiraan, bukan dana diterima". Nilai COD's caption is "Ditagih kurir dari N kiriman COD".
  - Nothing names COD principal as revenue.
  - There is no estimasi-vs-potongan bar: nilai COD − estimasi cair is not a defined cohort metric (spec 19 defines the identity only per row).
- **Accessibility.** Every figure is a `<dd>` after its `<dt>` label. Each panel is a labelled group ("Volume kiriman", "Uang COD"). The bar is `aria-hidden`. An sr-only sentence says that the four outcomes sum to the total. The "?" help on "Ringkasan" explains Retur's base, Gagal (gagal + dibatalkan) and Masih berjalan.
- **Height** (T-251, dev data):

  | Viewport | Layout | Height |
  |---|---|---|
  | 1440 | side by side | 128 px |
  | 1280, 1024, 720 | stacked | 97 + 24 gap + 92 = 213 px |
  | 390 | stacked | 317 px |

### 4.6c Report sections (Laporan pengiriman, T-254)
Owner 2026-09-26: "app/laporan/pengiriman -> rapikan ui ux". Order: filter row → Ringkasan (§4.6b) → trend → breakdowns → list.

- **Section header.** Every section uses the §4.3 anatomy: title 18/700, "?" help at the right, no description line (§1.5). Ringkasan sits on the ground with the same title size. The 40 px "?" is pulled into the title's line box (`SectionHelp`, `-my-2`), so it centres on the title and adds no space under it.
- **Grid.** From `xl`, Tren harian (3/5) and Distribusi status (2/5) share a row and both cards take the row's height. Total per kurir, Performa kurir, Wilayah tujuan, Rute teratas and Daftar kiriman are full width. The wilayah table beside a five-route table left a ~530 px hole at 1440 (T-235 layout).
- **Tren harian.** The legend carries each series' period total ("COD 86 kiriman", "Non-COD 48 kiriman"; on the value tab "Nilai COD Rp …"), as a `<dl>`. Line swatches: solid for COD, dashed for Non-COD. The tooltip formats counts in id-ID. The data-table disclosure heads its date column "Tanggal (WIB)".
- **Distribusi status.** Four rows instead of up to fourteen: the Ringkasan buckets in the same order and dot colours, each with "n · x%" and an 8 px share bar (share of the total, in the bucket colour). A bucket with more than one status is a native `<details>` whose summary is the row (44/40 px). Open, it lists the statuses in lifecycle order with badge and "n · x%", behind a 2 px left rule. A single-status bucket has no disclosure.
- **Tables in report cards.** `table-fixed`. Numeric columns are 96 px wide (80 px below `lg`), right-aligned and tabular, so the wilayah and route tables line up. Below `md` they become record lists: name and count on line 1, then a 13 px muted line with the other figures. The wilayah volume bar (8 px, `--chart-1`, from zero, relative to the largest known wilayah) sits under the name and replaces T-235's separate bar chart. "Wilayah tidak dikenal" has no bar. The "Tampilkan semua" remainder scrolls inside a 384 px box with its header pinned (from `md`).
- **Performa kurir.** Rows 36 px, bars 20 px (were 44 / 24).
- **States.** Each card keeps its own empty line or alert, as in spec 17. `loading.tsx` draws the final shape: the Ringkasan panels, the 3/5 + 2/5 row, then full-width cards.

### 4.7 KPI card
Used by the Dasbor, contact detail and platform pages; Laporan pengiriman uses §4.6b instead (T-251). White borderless card: label 15px muted + icon 20px primary in a 40px `--accent` circle chip at the right → value 30/700 navy → delta pill (neutral; arrow + "Naik/Turun n (x%)") + "vs periode sebelumnya" 13px.

### 4.8 Flow (Buat kiriman) — see spec 17 §UX-v3.6
Focused layout (§3, D11). Two columns from 1024px: form + sticky summary rail (360px) inside the centred 1120px column. Stepper in the top bar (3 steps). Numbered section cards (white, borderless, radius 16, `shadow-card`) (number chip 24px, title 16/600, status badge right). Option cards (payment, handover, size): 1px `--input`; selected `--accent` + `--primary` border + radio. Mobile: rail hidden, sticky bottom bar (total + primary).

T-249 (owner 2026-09-26: "sentuhan visual untuk step by step nya biar jelas"; rail: "biar dinamis 1 layar … soalnya penting"):
- **Section states.** Each of the five sections is complete, current, pending or locked. Complete = every required (*) field of the section filled, the same fields the form already marks, nothing new is validated (`requiredFieldsMissing`); current = the section holding focus, else the first incomplete one; section 5 is locked until an estimate exists; after the save sections 1–4 are complete and 5 current.
- **Marker.** One marker per state, shared by card, spine and rail row: complete = `--ok` circle with a check; current = `--primary` circle with the number; pending = `--input` outline with the number; locked = dashed `--input` on `--muted` with a lock. Colour/check change ≤ 150 ms, none under `prefers-reduced-motion`.
- **Spine (≥ 1024px).** The cards sit right of a 32px gutter; the marker is on the header's centre line and a 2px segment runs to the next marker, `--ok` when both ends are complete, `--border` otherwise. Below 1024px there is no spine; the marker (28px) sits inline before the title.
- **Header status (right).** "Lengkap" (ok badge with check), "n isian belum diisi" (13px muted), or for locked section 5 "Terbuka setelah cek tarif" with a lock; saved sections keep "Tersimpan". The H2 carries the number and state for screen readers.
- **Summary rail, bounded.** The column rises beside the H1 (top 96px before and after sticking) and is at most `100svh − 7rem` tall, a flex column of three regions:
  - header: title, source badge (Estimasi / Tarif resmi), freshness, and the "Langkah pengisian" row — five 40px in-page links with the same markers (current on `--accent`, `aria-current="step"`, accessible name "Bagian n: title — state") and "n/4 lengkap" (announced); a link scrolls to its section and focuses its first control;
  - body (scrolls on its own, `min-height: 0`): route in two one-line rows (Asal area · Tujuan area, truncated with `title`; the sender's name and phone are the "Pengirim di label" row), the shipment rows, "Rincian komponen biaya"; fades at the top/bottom edge only while content is hidden there; a tab stop with a name only while it scrolls;
  - pinned footer: the total line, the primary action and its guard. The Buat kiriman guard names the incomplete sections, two at most then "+n lainnya", clamped to two lines.
  - Measured (T-249): footer bottom ≤ window height at 1440×900, 1366×768 and 1280×720, empty and fully filled COD.
- **Below 1024px.** The bottom bar shows "n/4 bagian lengkap" (announced), the caption and the total, then "Rincian" (outline) and the primary; "Rincian" opens the whole summary in a bottom `Sheet` (title, badge, route, rows, costs, total, "Tutup"); Escape or Tutup returns focus to "Rincian". The page keeps 128px of bottom padding, taller than the bar (≈ 105px at 390).

### 4.9 Detail
Two columns from 1024px: main + right rail (status, next action, timeline). Below 1024px the rail comes first. Back link above the H1: 13px/600 `--primary` with a 16px arrow, 24px tall from `md` and 44px on touch (T-246: one anatomy on shipment, label, invoice and contact pages). Resi and shipment number in the identity strip 18px mono bold (§2.4). Paired outline actions in the rail wrap instead of shrinking below their label.

### 4.10 Settings
Left sub-menu (Profil gerai, Informasi label, Titik pickup, Outlet, Mitra kurir, Koneksi Mengantar, Anggota & akses) + content column (max 760px) of cards. **T-252:** from 1024px the sub-menu is a 256px rail, sticky at `top-24`, items 40px; below 1024px it is one horizontally scrolling row of 44px pills in the same card (no visible scrollbar, the current pill scrolled into view, a card-coloured fade on whichever edge still hides pills), so content starts ~60px below it instead of below seven stacked rows. Every settings page, Anggota & akses included, has the H1 "Pengaturan" (the current sidebar item); the document title names the page ("Anggota & akses · Pengaturan"). Each card's save names what it saves ("Simpan WhatsApp", "Simpan brand gerai", "Simpan informasi label", "Simpan pilihan kurir"); one filled primary per card. Optional fields carry "(opsional)" in the label. Every settings dropdown is a shadcn Select whose `SelectValue` renders the chosen label as children (visible in the server HTML, T-236); an optional Select starts on its muted placeholder (Radix's empty value, so `data-placeholder` is in the server HTML — **T-253**: Kategori usaha "Pilih kategori usaha") and, once set, offers a muted "Kosongkan kategori" item below a separator that returns it to the placeholder. **T-253 shared Select:** the list opens as a popper below the trigger, start-aligned, at least the trigger's width and at most the available viewport width/height (scrolls), items 40px (44px below md) with a check on the chosen one; triggers are exactly 40/44px. Settings forms keep one field per row except paired short fields in a 2-column grid (Nama gerai | WhatsApp, Email CS | Situs web). A read-only value (Nama gerai, a locked Awalan) sits in a `bg-muted` bordered 40px frame under its label. A switch row (Mitra kurir, Informasi label) is itself the hit target: the switch's `::after` fills the positioned row, so label, description and logo toggle it (≥ 44px on touch, one tab stop, the switch keeps its 32 × 18px look). A card's save sits in its footer, including Koneksi Mengantar's "Simpan/Ganti API key". Choices between modes (Koneksi Mengantar, label size, member role) use the shared `OptionCard`. Mitra kurir rows reuse the colour courier logos (`public/couriers/*.svg`) with one `Switch` each (T-243), as borderless inner tiles with the switch centred on the row; a courier switched off shows its logo grayscale at 50 % beside "Tidak ditawarkan" (T-246). Pickup notes and contact addresses are inner tiles too — no bordered or dashed box inside a card.

### 4.11 Component appearance rules
- Primary buttons are solid and reserved for the next safe action; secondary actions outline/ghost; dangerous actions use destructive wording that names the shipment/object and consequence, behind an AlertDialog.
- A disabled action states its unmet guard in one line next to it (e.g. "Pilih layanan dan centang Paket sudah dicek fisik").
- Inputs keep a visible label above the field and reserve inline error space; an error summary at the top links to invalid fields.
- Mengantar-authoritative facts (resi, provider status, settled amounts) are labelled as such and never mixed with GeraiCUAN estimates without a label ("Estimasi", "Tarif resmi").
- Screen styling never rescales the printed thermal label.

### 4.11a Contact detail surface (T-246, owner 2026-09-26: "bg white untuk halaman kecuali card atas biar gak rancu")
The one page-level exception to §1.4: on `/app/kontak/<peran>/<n>` the content area is white (`bg-card`, set by the page's own wrapper through `main:has()`, not by the shell). Only the four KPI cards keep card chrome, with a 1px `--border` added so they still read as cards on white. Every region below is a flat section: title 18/700 + count badge, optional one-line description, action right, and a hairline `--border` above it (24px either side). Addresses are white items with a 1px border (the primary one `--primary` at 40 %), two columns from `md`. Name, phone, kategori and roles are one "Data kontak" form with one save. Zona hati-hati is a quiet section with a destructive-outline "Arsipkan kontak" behind the AlertDialog (Tenant Admin only). **T-250 (owner 2026-09-26):** below the KPI row the sections sit in two columns once the content column is ≥ 896px (`@4xl` container query): main `minmax(0,1fr)` (Riwayat kiriman, Alamat) and a 340px side column (Data kontak, Zona hati-hati), 48px whitespace apart with no vertical rule; the side column is sticky at `top-24` when the viewport is ≥ 896px tall. Each section is its own `@container/section`, so addresses go 2-up only with two or more and ≥ 512px, and the Data kontak fields stack in the side column (two columns from 576px). In the side column Peran is two compact 44px checkbox rows, not option cards, and the save button is full width. Below 896px: one column, Data kontak · Alamat · Riwayat kiriman · Zona hati-hati.

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
| CANCELLED | Dibatalkan | neutral | `Ban` |
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
| `DateRangePicker` | shadcn Calendar + Popover | presets Hari ini, Kemarin, 7 hari terakhir, 30 hari terakhir, Bulan ini (T-240); trigger names the preset, the filter-row summary line states the dates |

### 5.1 Component state contract
| Component | Required states | Interaction / accessibility |
|---|---|---|
| Sender/recipient picker | searching, no match, several matches, selected, new entry | Scoped to the tenant; shows enough to tell duplicates apart; saving for reuse is explicit |
| Destination area picker | searching, no match, selected + verified, provider error | Combobox semantics; verified check only after server validation |
| Product rows | empty, editing, invalid, complete | Quantity and weight per row; totals announced after edits |
| Payment selector | Non-COD default, COD, COD Ongkir, unavailable for route | Fee and amounts shown as separate labelled lines; unsupported COD explained |
| Quote/summary rail | estimate, final (Tarif resmi), changed, unavailable; body scrolled (fade hints) | Shows source and freshness; total re-announced on change; never taller than the window — header and pinned footer (total, primary, guard) stay visible, only the body scrolls; below 1024px the same content opens in a bottom Sheet from "Rincian" (T-249) |
| Section progress (Buat kiriman) | complete, current, pending, locked | Marker + header status per section, spine ≥ 1024px, rail row of five in-page links with `aria-current="step"` on the current one; counts from the form's required fields only (T-249) |
| Status badge | every status in §4.12 | Text + icon; programmatic name |
| Confirmation dialog | submit, print/reprint, archive, suspend, role change | Focus moves in; Escape closes only non-submitting dialogs; focus returns to the trigger; names the object |
| Timeline | loading, populated, no events | Chronological list; every time with WIB |
| Data table | loading, empty, filtered-empty, error, paginated | Header cells; keyboard-reachable row link; no PII in the URL |
| Toast/alert | success, warning, error | `role=status` for non-blocking, `role=alert` only for urgent failures; never the only record of an outcome |

## 6. States
Every region renders: loading (skeleton of its final shape), system-empty (why + next action), filtered-empty (filters + "Hapus filter"), error (cause + retry, siblings unaffected), pending (disabled control with progress word), success (announced beside the control). Alerts: `role="status"` for information, `role="alert"` only for failures.

## 7. Content
Indonesian, sentence case, one term per concept (kiriman, resi, titik pickup, gerai, Perlu perhatian). **Roles and the business in UI copy (D-23):** `TENANT_ADMIN` reads "Pemilik gerai", `OPERATOR` "Operator", `SUPER_ADMIN` "Admin platform" (the platform login is "Masuk Admin Platform" with the badge "Khusus tim GeraiCUAN"); the business is always "gerai" ("Daftar gerai", "Buat gerai", "lintas gerai"). "Tenant" and "Super Admin" are internal terms for code, specs, audit codes and routes (`/login/tenant`, `/login/super-admin`, `/platform/tenant`) and never appear in rendered text, metadata, toasts or email. Buttons name the consequence ("Simpan & cek tarif", "Konfirmasi & terbitkan AWB"). Money `Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0})`. Dates "25 Sep 2026, 10.13 WIB". Areas shown as "Kecamatan, Kota" in lists; full label only on detail.

## 8. Responsive
Checked at 1440, 1024, 768, 390. No page-level horizontal overflow at 390. Lists become record cards below 768px. Two-column flows/details stack below 1024px (detail rail first, flow rail hidden behind the bottom bar).

## 9. Accessibility
Landmarks and one H1 per page; every control labelled; focus visible (2px `--primary`, offset 2px); status = icon + word; 44px touch targets; one DOM order for all widths; reduced motion respected.

## 10. Thermal label (unchanged, T-176)
`label-sheet.tsx` and its print CSS keep their geometry: 10×15 cm (10×10 package + 10×5 sender stub) or 10×10 cm, pure black on white, Code 128 barcode, text ≥ 7pt. Screen chrome around the preview follows this document; the sheet itself is exempt from §2.
- **Brand on the sheet (T-243).** The head row carries the courier's black print logo (`public/couriers/print/<courier>.svg`, 6.5 mm high, service name beside it; bold text when a courier has no print file) and, right of the GeraiCUAN mark, the gerai logo in a fixed box (≤ 20 × 7 mm, `grayscale(1) contrast(1.15)`). The catatan resi takes the sender row's second 7 pt line. All three are inline styles; `label.css` and every row height are unchanged at 10 × 15 and 10 × 10, and nothing replaces a courier-required field.
- **Preview frame (T-243).** `LabelPreviewFrame` shows the sheet as paper on a neutral desk (edge + shadow), a caption with the exact size ("10 × 15 cm · skala 1:1 saat dicetak · tampil N%"), and a `ToggleGroup` zoom (Pas layar / 100% / 150%; the desk scrolls, the page never does). Informasi label adds a "Data contoh" badge, sticks beside the switches from `lg`, and stacks below them on phones behind a "Lihat pratinjau" jump link. Controls outside the sheet keep the 13 px floor and keyboard access.

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
| D12 pastel status tiles without border | Applied, then replaced for the queue filters by the §4.6 stat strip (T-248) | `KpiCard`, `--tile-*` |

Functional facts from the study used elsewhere: Mengantar's own order form has a **Dropshipper** switch (sender masking is a native provider concept → PR-71/PR-84), a *Rincian pembayaran* box (normal fee, special fee, estimated amount received) and pickup rows Tipe · Alamat · Waktu · Volume (→ PR-70).

## 14. Invoice sheet (PR-80)

80 mm roll: printable width 72 mm, body 11 pt sans, resi 14 pt mono bold, total 13 pt bold `tabular-nums`, rules 0.5 pt, black only. A4: 16 px body, two columns, same blocks. Anatomy: spec 17 UX-v3.9. Print CSS lives beside the label print CSS (`label.css` pattern), one `@page` per medium. When the gerai has a logo it prints grayscale at the top of the gerai block (`.invoice-logo`, T-243).

## 15. Sign-in and sign-up (PR-83)

One `AuthShell` card (max-width 448 px) on the canvas: brand mark, H1 24 px, fields 48 px with labels above, password field with a 44 px show/hide button (`aria-pressed`), one filled primary, secondary links as text links below. Errors: text under the field + one `Alert` summary. Super Admin: same card on the `--foreground` navy ground with the "Khusus tim GeraiCUAN" badge (D-23).

**Split layout (T-225, D-21).** `AuthShell visual` (Masuk tenant, Masuk Super Admin, Daftar) adds at ≥ 1024 px a sticky full-height left panel, 44 % wide (max 640 px), padding 48/64 px, tokens only (no hex or arbitrary colours, so a palette swap in `globals.css` carries through): `bg-primary` ground (Super Admin: `bg-foreground` with a `border-background/15` divider), `text-primary-foreground`; GC mark on a `bg-primary-foreground` 40 px square, pills and icon squares `bg-primary-foreground/15`, nota mock `bg-card` + `shadow-xl`, a 13 px "Gratis" pill (tenant only), one 32 px/700 headline, the three cores as 18 px/600 items with 36 px icon squares (`Send`, `Printer`, `ReceiptText`) separated by "·", and a 320 px static nota mock (card, −2° rotation, `INV-SBN-10001` · `SBN-10001` · Total ongkir) built from markup and `aria-hidden`. The card column keeps the surface badge; its brand row hides at ≥ 1024 px. Below 1024 px the panel is not rendered visible and the page is the card alone. The Daftar stepper: three 32 px numbered chips (current = filled primary, done = primary outline + check, pending = `--input` outline) joined by 2 px rules, labels 15 px. Screen contract: spec 17 UX-v3.10.
