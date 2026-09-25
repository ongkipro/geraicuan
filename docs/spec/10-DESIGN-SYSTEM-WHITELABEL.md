# Design System — GeraiCUAN UI v3

| Field | Value |
|---|---|
| Status | Accepted — the single design contract for every GeraiCUAN surface |
| Version | 3.0 / 2026-09-25 (UI rebuilt from zero, [ADR-0001](../adr/ADR-0001-ui-v3-rebuild.md)) |
| Owner | Product owner (Paduka Ongki) |
| Visual source | The owner's HTML reference `~/Documents/work/notes/geraicuan-html/` (26 pages, served at `http://100.127.67.86:3333/` during development) and `~/Documents/work/notes/geraicuan-ui-analysis.md`. Values below were **measured** from the rendered reference at 1440×900 on 2026-09-25. |
| Component source | Official shadcn/ui primitives in `src/components/ui/*` (reinstalled from the registry 2026-09-25) and the registry blocks `dashboard-01`, `sidebar-07`, `sidebar-16` as composition patterns |
| Behaviour source | `docs/spec/17-UX-FLOWS-SCREEN-CONTRACTS.md` §UX-v3 |
| Supersedes | Spec 10 v1–v2.2 and spec 20 (glass); their text remains in git history only |

One brand, no white-labelling in MVP. Locale `id-ID`, IDR, timezone WIB (`Asia/Jakarta`). The business is a **gerai**, never *toko* (user-typed names excepted).

---

## 1. Principles

1. **The reference is the look.** When this document and the reference disagree on a visual value, the reference wins and this document is corrected; when the reference breaks an accessibility rule below, this document wins and the deviation is listed in §12.
2. **Built for operators aged 40+.** Body 15–16px, nothing that must be read below 13px, secondary text dark grey (#5C5C5C, ≥ 6:1), controls 40px on desktop and 44px on touch, input borders clearly visible (#A3A3A3).
3. **Clean minimal, colour only where it changes a decision.** Neutral page; blue only for the one primary action, links and the current nav item; status colours only on status badges, variance and danger.
4. **One frame level.** A region is a white bordered card on the grey ground, or plain content on the ground. Nothing framed inside a card; tables inside cards have no outer border.
5. **No AI slop.** No explanatory sentence under every heading or field, no duplicated headings, no meta lines ("data diperbarui otomatis…", "geser tabel…", "diurutkan dari…"), no badge that restates the heading. One freshness line per page at most. Long explanations live behind one "?" help popover.
6. **shadcn used plainly.** Compose installed primitives; change a primitive only through the tokens in §2 or a documented size variant in §4. No per-page restyling of a primitive.

## 2. Tokens (`src/app/globals.css`)

### 2.1 Colour

| Token | Value | Use |
|---|---|---|
| `--background` (page ground) | `#F7F7F7` | Body behind the content |
| `--card`, `--popover`, `--sidebar` | `#FFFFFF` | Cards, menus, dialogs, sidebar, top bar |
| `--foreground` | `#1A1A1A` | Text, values, headings |
| `--muted-foreground` | `#5C5C5C` | Descriptions, table headers, meta |
| `--border` | `#E5E5E5` | Card outlines, dividers, sidebar/top-bar rule |
| `--input` | `#A3A3A3` | Resting border of inputs, selects, outline buttons |
| `--primary` / hover | `#2E47BA` / `#243A9B`, text white | The one primary action, links, focus ring |
| `--accent` | `#EEF2FF` + text `#2E47BA` | Current nav item, selected option card, selected tab |
| `--muted` | `#F2F4F7` | Neutral badge fill, skeleton, hover row |
| Success | text `#087443` on `#ECFDF3` | Terkirim, Resi terbit, Siap, Aktif, Cocok |
| Warning | text `#A15C07` on `#FFFAEB` | Menunggu, Antre retur, Perlu perhatian, Ada selisih |
| Danger / `--destructive` | text `#B42318` on `#FFF1F0` | Gagal, Bermasalah, Perlu rekonsiliasi, destructive actions |
| Chart | Okabe-Ito `#0072B2 #009E73 #E69F00 #CC79A7 #D55E00` | Series only, each with marker/label |

Contrast floors: body text ≥ 7:1, secondary ≥ 6:1, control boundary ≥ 2.5:1 (#A3A3A3 on white is the owner's accepted value), focus ring 2px `--primary` offset 2px.

### 2.2 Type (Inter; numbers `tabular-nums`; `ui-monospace` only for AWB/resi, shipment number, prefix)

| Role | Size / weight / line height | Measured in reference |
|---|---|---|
| Page title H1 | 26px / 700 / 39px | `h1` 26/700/39 |
| Eyebrow | 13px / 500 / uppercase / tracking 0.025em / muted | 13/500/0.325px |
| Page description | 15px / 400 / muted | 15px #5C5C5C |
| Card title H2 | 16px / 600 | — |
| Body, table cells, controls, nav | 15px / 400 (nav 16px) | td 15px, nav 16px |
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
| Card | 1px `--border`, radius 10px, padding 24px (16px below 768px), no shadow |
| Controls | Button/input/select 40px desktop, 44px touch; radius 8px; input padding-x 12px; button padding-x 16px, 15px/500 |
| Large primary (flow submit) | 48px, 15px/700 |
| Badge | 24px, radius full, padding-x 10px, 13px/500, icon 14px + word |
| Table | header row 44px, body rows ≥ 48px, cell padding 12–16px |
| Sidebar | 256px, item 40px (44px touch), icon 20px, active `--accent` |
| Top bar | 64px, white, bottom `--border` |
| Elevation | none on cards; `shadow-md` only on popovers, menus, sticky bars; dialogs `shadow-lg` |

## 3. Shell (`sidebar-07` + `sidebar-16` patterns)

- **Sidebar** (white, right rule): brand block (logo square "GC", GeraiCUAN, role) → flat groups with uppercase labels and an icon per item → account row in the footer (avatar initial, name, email, menu: Anggota & akses, Keluar). Desktop ≥ 1024 full; 768–1023 icon rail with tooltips; < 768 a Sheet opened from the top bar.
- **Top bar** (64px, sticky): sidebar trigger · gerai name + role badge + "N outlet" line · search "Cari halaman…" with ⌘K · date · time WIB.
- **Menu (tenant):** Dasbor · PENGIRIMAN: Buat kiriman, Histori kiriman, Retur (RTS), Cetak resi · DATA: Pengirim, Penerima · CEK: Cek resi, Cek tarif · LAPORAN: Laporan pengiriman, Riwayat cetak resi (Tenant Admin) · PENGELOLAAN: Pengaturan (Tenant Admin). **Platform:** Ringkasan, Tenant, Pendaftaran, Audit.

## 4. Anatomy

### 4.1 Page
`Eyebrow` (sidebar group) → `H1` (= menu label = document title "<Label> · GeraiCUAN") → one description line → actions right (max one filled primary; others outline) → 24px → filter row (optional) → regions.

### 4.2 Filter row
One line on the ground: date-range button (calendar icon) · outlet select · other primary filters · `Terapkan` (outline) · "Hapus filter" link when not default. Controls have sr-only names, no visible labels above. Under it at most one 13px muted line with the active period.

### 4.3 Card
Header: title (16/600) + optional count badge or "?" help at the right; optional one-line description only when the reference has it; a 1px divider under the header only when the body is a table. Body: content with 16px rhythm. Footer: right-aligned actions or a single link.

### 4.4 Data table (list pages)
Inside one card: toolbar row (search, status tabs or facet, secondary actions) → table (≤ 7 columns desktop; stacked two-line cells: primary 15px ink + secondary 13px muted) → footer (count "N kiriman" + pagination). Shipment number/AWB mono link in `--primary`; money right-aligned. Below 768px the table becomes a **record list** (§4.5). No scroll hints, no sort sentences.

### 4.5 Record card (mobile list row)
Line 1 identity link (16/600) + status badge right · line 2 who/where (15px) · line 3 courier · resi (13px muted, resi mono) · line 4 value left (15/600) + time right (13px muted). After 10 rows: "Tampilkan N lainnya".

### 4.6 Status tiles (queue filters)
Up to 6 tiles in one row (2 columns on phone): label 15/500 · count 26/700 · one short line 13px muted. Selected: `--accent` fill + `--primary` border + check.

### 4.7 KPI card
Label 15px muted + icon 20px muted right → value 30/700 → delta pill (neutral; arrow + "Naik/Turun n (x%)") + "vs periode sebelumnya" 13px.

### 4.8 Flow (Buat kiriman) — see spec 17 §UX-v3.6
Two columns from 1024px: form (max 720px) + sticky summary rail (320px). Stepper card on top (3 steps). Numbered section cards (number chip 24px, title 16/600, status badge right). Option cards (payment, handover, size): 1px `--input`; selected `--accent` + `--primary` border + radio. Mobile: rail hidden, sticky bottom bar (total + primary).

### 4.9 Detail
Two columns from 1024px: main + right rail (status, next action, timeline). Below 1024px the rail comes first. Back link above the eyebrow.

### 4.10 Settings
Left sub-menu (Profil gerai, Titik pickup, Outlet, Koneksi Mengantar, Anggota & akses) + content column (max 760px) of cards.

## 5. Components (`src/components/ui` + `src/components/app`)

| Component | Source | Notes |
|---|---|---|
| Button, Input, Select, Textarea, Checkbox, RadioGroup, Field | shadcn primitives | size variants set to §2.3 (40/44px) |
| Card, Badge, Alert, Separator, Skeleton, Tooltip, Popover, Dialog, AlertDialog, Sheet, DropdownMenu, Command, Calendar, Chart, Table, Sidebar | shadcn primitives | tokens only |
| `AppShell`, `AppSidebar`, `SiteHeader` | composed from `sidebar-07`/`sidebar-16` | §3 |
| `PageHeader`, `FilterBar`, `DataCard`, `RecordList`, `StatusTiles`, `StatusBadge`, `KpiCard`, `HelpHint`, `CourierLogo`, `EmptyState`, `Money` | new in `src/components/app/` | §4; one implementation each |
| `DateRangePicker` | shadcn Calendar + Popover | presets Hari ini, 7 hari, 30 hari, Bulan ini |

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
Side-by-side browser comparison with its reference HTML at 1440 and 390, section by section; measured: overflow ≤ 0, every text size on §2.2, controls ≥ 40/44px, one filled primary per page, no raw hex/arbitrary px in page code, no meta sentences from §1.5. Screenshots stored with the task evidence.

## 12. Deviations from the reference
- Nav group labels 12px in the reference → 13px (40+ floor).
- Reference detail pages colour the resi/COD in blue → ink bold (blue reserved for actions).
- Reference vehicle selector (Motor/Mobil/Truk) → not built (no Mengantar field).
