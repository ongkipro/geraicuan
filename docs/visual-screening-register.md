# Visual Screening Register — GeraiCUAN

- Owner: T-201 (Phase 16). Contract: `docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md` v2.0 — each finding is repaired through its own task; this register never authorizes a redesign by itself.
- Reviewed HEAD: `9b76fe8` + uncommitted T-200/T-201 worktree. Screenshots (78 PNG, 1440 and 390) are local evidence in the session scratchpad and are not committed.
- Status per finding: see section (e) for the T-202 repair status; before T-202 all were `OPEN`. **V-9** conflicts with the accepted local-scroll table rule (spec 10 §9, T-120/T-127) and needs an owner decision before any change. The `/app/pengiriman/baru` row was captured after the T-201 revert to solid cards (glass 1 = the shared header, radius 10.08).

- Screening date: 2026-09-25. App: dev server `http://localhost:3127`, local demo data.
- Method: chrome-devtools MCP in isolated contexts `screen-tenant` (tenant@geraicuan.com, Tenant Admin) and `screen-platform` (super@geraicuan.com). Each route was captured at 1440x900 and 390x844 as a full-page PNG, plus one metrics script run per capture.
- Read-only: no form was submitted except the two logins. Nothing was saved, confirmed, approved, invited, or imported.
- Reference: the "GeraiOS v0.5" professional shadcn dashboard pattern described in the brief.
- Screenshot names are `<route-slug>-<width>.png` (local evidence, not committed).

## How to read the metrics

- **ovf@390**: `max(html.scrollWidth, body.scrollWidth) - html.clientWidth`. A value of 0 or less means the document has no horizontal overflow. The headless Chrome window shows a 15 px classic scrollbar, so at a 390 window the layout width is really 375 CSS px, a slightly harsher test than a phone. Wide tables scroll inside their own container. Those are listed separately as "inner table width".
- **glass**: count of elements whose class contains `ios-glass` or `backdrop-blur`. The app header (`backdrop-blur-xl`) accounts for 1 on every `/app` and `/platform` page, so glass = 1 means "header only".
- **radii**: distinct computed `border-radius` values on `[data-slot=card]`.
- **<12px**: visible text nodes with a computed font size below 12 px.
- Full-page captures of pages with charts (`/app`, `/platform`) show an empty or collapsed chart. Viewport captures (`app-chart-1440.png`, `platform-chart-1440.png`) show both charts rendering correctly, so this is a capture artifact from animate-on-view and is **not** a finding.

---

## (a) Route table

| # | Route (id used) | ovf@390 | glass (1440/390) | card radii | inner table width @390 | Verdict |
|---|---|---|---|---|---|---|
| 1 | `/` | none | 0/0 | – | – | Clean marketing page; copy contradicts `/daftar` (V-20); raw `emerald-50/800` |
| 2 | `/login/tenant` | none | 0/0 | – | – | Clean; the separate "Tampilkan" button squeezes the password input at 390 (V-27) |
| 3 | `/login/super-admin` | none | 0/0 | – | – | Deliberately different dark scheme with a yellow badge; acceptable as a scope cue |
| 4 | `/daftar` | none | 0/0 | – | – | Clean; section heading "Kata sandi" duplicates the field label; heading spacing uneven |
| 5 | `/lupa-password` | none | 0/0 | – | – | Clean |
| 6 | `/verifikasi-email` | none | 0/0 | – | – | Clean |
| 7 | `/verifikasi-email/konfirmasi` (no token) | none | 0/0 | – | – | Invalid-link state is explicit and good |
| 8 | `/atur-ulang-password` (no token) | none | 0/0 | – | – | Invalid-link state is explicit and good |
| 9 | `/app` | none | 21/21 | 12.96, 18 | 395 | Heaviest glass use; iOS-blue primary; 11 px deltas; 11 courier mini-tables make the page 6,534 px tall on mobile |
| 10 | `/app/pengiriman` | none | 2/2 | – | 913 | Solid table, but H1 ≠ nav label, courier names inconsistent, table only scrolls sideways on mobile |
| 11 | `/app/pengiriman/baru` | none | 1/1 | 10.08 | – | Good 5-step form; input heights of 32/36/38 px and arbitrary widths |
| 12 | `/app/pengiriman/GC-10060` → `/10060` (ISSUED) | none | 1/1 | 10.08 | 693 | Raw enums (ISSUED, ORDER_ACCEPTED), money left-aligned, duplicate CTA, clipped nested-scroll rail |
| 13 | `/app/pengiriman/GC-10061` → `/10061` (ESTIMATED) | none | 1/1 | 10.08 | 649 | Same as #12; the rail clips the timeline to "Draf"; mixed-language ETA strings |
| 14 | `/app/pengiriman/rts` | none | 2/2 | – | 1067 | Consistent tiles; Title Case action "Semua Kiriman"; lowercase courier codes |
| 15 | `/app/impor` | none | 1/1 | 10.08 | 1018 | H1 "Impor massal" ≠ nav "Impor CSV"; rule column truncated on desktop |
| 16 | `/app/label` | none | 2/2 | – | 913 | H1 "Label & riwayat cetak" ≠ nav "Cetak resi"; no footer count or pagination |
| 17 | `/app/label/10060` | none | 1/1 | 10.08 | – (label sheet 411 px) | Good empty state; label preview clipped at 390 (V-17); <12 px text is print scale (exempt) |
| 18 | `/app/kontak/pengirim` | none | 8/8 | – | card list | Only page with a mobile card list; iOS-blue "Pengirim baru" beside indigo "Cari" |
| 19 | `/app/kontak/penerima` | none | 21/21 | – | card list | Same as #18; "+1 alamat" link is 24 px tall at 390 |
| 20 | `/app/kontak/baru` | none | 1/1 | 10.08 | – | Clean; H1 "Buat kontak" vs button "Pengirim baru" |
| 21 | `/app/kontak/71000000-…-0008?dari=penerima` | none | 1/1 | 10.08 | – | 4 filled primary buttons; header layout unlike other pages |
| 22 | `/app/cek-resi` | none | 2/2 | 18 | – | No eyebrow; iOS-blue button; glass side card |
| 23 | `/app/cek-tarif` | none | 2/2 | 18 | – | Title Case "Cek Tarif"; iOS-blue button; glass side card |
| 24 | `/app/analitik` | none | 9/9 | 12.96, 10.08 | 557 | Good KPI pattern, but raw palette icons and a 10,586 px mobile page |
| 25 | `/app/laporan/pengiriman` | none | 4/4 | – | 666 (2,006 px at 1440) | Table needs horizontal scroll even on desktop; "Lifecycle" in the UI |
| 26 | `/app/laporan/cetak-resi` | none | 2/2 | – | 977 | Clean audit table; "Admin tenant" vs "Tenant Admin" |
| 27 | `/app/keuangan` | none | 6/6 | 12.96, 10.08 | 1439 (1,711 px at 1440) | 8,856 px desktop page; raw provider enums; 49 of 49 badges without an icon; date input shows US locale |
| 28 | `/app/pengaturan` | none | 4/4 | 18 | – | Narrow content column; glass cards |
| 29 | `/app/pengaturan/pickup` | none | 3/3 | 18 | – | OK; glass cards |
| 30 | `/app/pengaturan/outlet` | none | 3/3 | 18 | – | Content width differs from sibling settings pages |
| 31 | `/app/pengaturan/koneksi` | none | 2/2 | 18 | – | OK; "Siap" badge without an icon |
| 32 | `/app/anggota` | none | 4/4 | 18 | – | Duplicate "Undang anggota" (header and form) |
| 33 | `/platform` | none | 9/9 | 12.96, 10.08 | 424 | Good health tiles; native-select period filter differs from tenant pages |
| 34 | `/platform/tenant` | none | 1/1 | – | 927 | Status badges Aktif/Provisioning/Diarsipkan look identical |
| 35 | `/platform/tenant/70000000-…-0001` | none | 16/16 | 12.96, 10.08 | 424 | Danger action (Tangguhkan) sits near the top; 7,814 px on mobile |
| 36 | `/platform/pendaftaran` | none | 1/1 | 10.08 | – | Clear queue; the reject button stretches to full width |
| 37 | `/platform/audit` | none | 1/1 | – | 819 | Raw action codes (PLATFORM_MONITORING_VIEWED) instead of Indonesian sentences |
| – | mobile nav sheet (`/app/anggota`) | – | – | – | – | Grouped and readable; screenshot `app-mobile-nav-390.png` |

Not screened: the `/app/kontak` redirect (redirect only) and the CSV route handlers (not pages).

**Global metrics.**

- Document overflow at 390 is **0 on all 37 routes**.
- The 390 captures found no text below 12 px except the 11 px KPI deltas on `/app` and the print-scale label preview.
- At 1440, a 10 px `⌘/Ctrl K` kbd hint appears in the header of every app page.
- Across the app, cards use 3 distinct radii: 10.08 px, 12.96 px and 18 px.

---

## (b) Findings

| ID | Sev | Route(s) | Viewport | What is wrong | Evidence | Rule broken |
|---|---|---|---|---|---|---|
| V-1 | high | `/app`, `/app/kontak/pengirim`, `/app/kontak/penerima`, `/app/cek-resi`, `/app/cek-tarif` | both | Two primary colours. `.ios-btn-primary` is `#007aff` with a blue glow and 12 px radius (`src/app/globals.css:538-552`, 6 usages). The `--primary` token button is `rgb(46,71,186)` with a 7.2 px radius. Both appear side by side: "Pengirim baru" next to "Cari", and "Buat kiriman" next to "Terapkan". "Buat kiriman" is iOS blue on `/app` but indigo on `/app/pengiriman`. | app-1440.png, app-kontak-pengirim-1440.png, app-cek-tarif-1440.png, app-pengiriman-1440.png; computed `bg=rgb(0,122,255)` vs `rgb(46,71,186)` | One primary colour; semantic tokens only |
| V-2 | high | `/app` (21), `/app/kontak/penerima` (21), `/platform/tenant/[id]` (16), `/app/analitik` (9), `/platform` (9), `/app/kontak/pengirim` (8), `/app/keuangan` (6), all settings (2–4), `/app/cek-*` (2) | both | Glassmorphism. `.ios-glass-card` uses an 85% card mix and `backdrop-filter: blur(20px)` (11 source usages). KPI cards use `backdrop-blur-xl`, and the header uses `backdrop-blur-xl`. On `/app`, 14 cards are `ios-glass-card` and 4 are `backdrop-blur-xl`. | app-1440.png; per-page glass counts in table (a) | Solid cards, no glass or blur |
| V-3 | medium | same pages as V-2, plus every page that uses shadcn Card | both | Three card radii: 10.08 px (shadcn Card), 12.96 px (`rounded-2xl` KPI cards) and 18 px (`ios-glass-card` 1.125 rem). Mixed within one page on `/app` (12.96 + 18), `/app/analitik`, `/app/keuangan` and `/platform` (12.96 + 10.08). | radii column in (a) | One card radius |
| V-4 | medium | `/app`, `/app/analitik`, `/app/keuangan`, `/` | both | Raw palette classes: KPI icon tiles and accents use `bg/text/border-{blue,emerald,indigo,amber,rose}-{400,500,600}`; `/app` also has `bg-blue-600/700` and `shadow-blue-500`; `/` has `bg-emerald-50 text-emerald-800`. Every page has `hover:border-neutral-300/600` on the input primitive. | metrics `raw` list; app-1440.png KPI icons | Semantic tokens only |
| V-5 | high | `/app`, `/app/pengiriman`, `/app/pengiriman/rts`, `/app/label`, `/app/laporan/pengiriman`, `/app/pengiriman/[id]` | both | One courier, several names. The dashboard recap says "J&T", "ID Express", "Lion Parcel", "POS Indonesia" and "Shopee Express". Lists and reports say "JT", "iDexpress", "lion", "pos", "spx" and "anteraja" (all lowercase). The estimate table also shows raw service codes such as "SapCargo", "SAPLite" and "iDexpressCargo". | app-1440.png vs app-pengiriman-1440.png, app-laporan-pengiriman-1440.png | Same term for the same thing |
| V-6 | high | `/app/pengiriman/[id]`, `/app/keuangan`, `/platform/audit` | both | Raw system or provider enums reach users. Detail "Hasil penyedia" shows `ISSUED`, `COMPLETED` and `ORDER_ACCEPTED`. Keuangan "Status Mengantar" shows `DELIVERED`, `PENDING PICKUP`, `RTS` and `DELIVERY PROBLEM`, and a ledger source reads "Rekonsiliasi reconciliati…". Audit "Aksi" shows `PLATFORM_MONITORING_VIEWED` and `TENANT_SELF_REGISTERED`, although spec 18 requires "formatted Indonesian action sentences". ETA strings mix "1-2 Day", "2 - 3 days", "1 - 2 Hari", "4 HARI" and "1 - 2 Days". | app-pengiriman-GC-10060-1440.png, app-keuangan-1440.png, platform-audit-1440.png | Concise, consistent Indonesian copy |
| V-7 | high | `/app/pengiriman`, `/app/impor`, `/app/label`, `/app/keuangan`, `/app/pengaturan`, `/app/kontak/baru` | both | Nav label ≠ H1, which breaks wayfinding. "Histori kiriman" opens "Pengiriman"; "Impor CSV" opens "Impor massal"; "Cetak resi" opens "Label & riwayat cetak", which then collides with the report "Riwayat cetak resi"; "Keuangan" opens "Ledger & rekonsiliasi"; "Pengaturan" opens "Profil toko". The button "Pengirim baru" opens "Buat kontak". The back link says "Kembali ke antrean", but no page is called "antrean". | desktop screenshots of each route | Consistent page header; same term everywhere |
| V-8 | medium | all app routes | both | Header pattern drifts. `/app/cek-resi` and `/app/cek-tarif` have no eyebrow. The contact detail puts the back link above the eyebrow and has 3 header actions. Eyebrows are arbitrary: "Operasional tenant", "Operasional kiriman", "Pengiriman", "Data", "Kontak", "Wawasan", "Label termal", "Operasi platform", "Platform", "Tenant" and "Audit". The H1 "Cek Tarif" and the action "Semua Kiriman" are Title Case. `<title>` varies between "GeraiCUAN" only (most pages), "Retur (RTS) \| GeraiCUAN", "Cek resi", "Cek Tarif", "Anggota tenant \| GeraiCUAN" and "Pendaftaran toko · GeraiCUAN". | eyebrow/title metrics; app-cek-tarif-1440.png; m-kontak (app-kontak-detail-1440.png) | Consistent page header (eyebrow, H1, description, ≤1 primary action) |
| V-9 | medium | `/app/pengiriman`, `/app/pengiriman/rts`, `/app/label`, `/app/impor`, `/app/laporan/*`, `/app/keuangan`, `/platform/tenant`, `/platform/audit` | 390 | Every data table except Kontak keeps its desktop table on mobile inside a horizontal scroller, at 666–1,439 px wide. On first view the user sees only ID and status. Kontak switches to a card list, so the mobile list pattern is inconsistent. | app-pengiriman-390.png, app-pengiriman-rts-390.png, app-label-390.png | Tables usable at 390; consistency |
| V-10 | high | `/app/pengiriman/[id]` | 390 | On mobile, Status, "Tindakan berikutnya" (the primary CTA) and "Riwayat status" render after all detail cards, about 3,000 px down. The main job on the page is buried. | app-pengiriman-GC-10060-390.png (3,790 px tall) | Primary action discoverable; mobile priority |
| V-11 | medium | `/app/pengiriman/[id]` | 1440 | The right rail `<aside>` is sticky with `max-height: 804px; overflow: auto`. This creates a nested scroll with no affordance. At 900 px height the timeline is cut; on 10061 only "Draf" is visible. | app-pengiriman-GC-10061-1440.png; computed styles | No hidden, clipped content; explicit states |
| V-12 | medium | `/app/pengiriman/10060` vs `/10061`, `/app/keuangan` | 1440 | Money is formatted inconsistently. The read-only estimate table on 10060 left-aligns "Ongkir" (14 numeric cells) in a monospace font, and "Tidak dikembalikan" is also monospace. The same table on 10061 right-aligns it. Keuangan shows decimals ("Rp 402.250,44") while every other page shows whole rupiah. | app-pengiriman-GC-10060-1440.png vs -10061-1440.png | Right-aligned tabular numbers; one money format |
| V-13 | medium | `/app/keuangan` (49 of 49), `/platform/audit` (8 of 8), `/platform/tenant` (5 of 5), settings, kontak, estimate tables | both | Status badges have no icon. On `/platform/tenant`, "Aktif", "Provisioning" and "Diarsipkan" are identical grey pills. Shipment lifecycle badges do carry icons, so the treatment differs across pages. | badgeNoIcon metric; platform-tenant-1440.png | Status = icon + text, never colour or shape only |
| V-14 | medium | tenant filtered pages vs `/platform/*`, `/app/keuangan`, `/app/label`, `/app/kontak/*` | both | Filters do not match. Tenant pages use a date-range popover and "Terapkan"; platform uses a native `<select>` "30 hari terakhir" plus "Reset"; keuangan says "Terapkan filter" under an extra "Filter keuangan" label. Label has an AWB search plus facet; Kontak uses segmented tabs; Pengiriman, RTS and Label use summary tiles. | platform-1440.png vs app-analitik-1440.png, app-keuangan-1440.png | One filter-bar pattern |
| V-15 | medium | `/app/pengiriman/baru` | 1440 | Form control heights are 32, 36 or 38 px (measured) and widths are ad hoc (96, 128, 192, 224, 320, 647, 672 and 681 px), so the left edge and the rhythm feel uneven. | app-pengiriman-baru-1440.png; measured sizes | 8 px rhythm; consistent control sizing |
| V-16 | medium | `/app/analitik`, `/app/keuangan`, `/platform/tenant/[id]`, `/app` | 390 (and 1440 for keuangan) | Pages are extremely long. On mobile: analitik 10,586 px, keuangan 9,933 px, platform tenant detail 7,814 px, dashboard 6,534 px (11 courier mini-tables alone take about 3,000 px). Keuangan is 8,856 px on desktop, with an unpaginated "Pencairan" table of about 45 rows. | app-analitik-390.png, app-keuangan-1440.png, app-390.png | Density; explicit pagination |
| V-17 | medium | `/app/label/[id]` | 390 | The thermal label preview (411 px) is clipped at the right edge instead of being scaled: "GERAICUAN", "NON-COD" and the address are cut. | app-label-10060-390.png | No overflow or clipping at 390 |
| V-18 | low | `/app`; header on all app pages | 1440 / 390 | KPI delta pills are 11 px and wrap to 3 lines at 390 ("+14 (127%) vs 7 hari sebelumnya"). The header kbd hint is 10 px. | app-390.png, app-1440.png | Text ≥ 12 px |
| V-19 | medium | `/app`, `/app/analitik`, `/app/keuangan`, `/platform` | both | Four KPI card variants. Deltas appear as green pills on `/app`, as plain "↑ 317% lebih tinggi" on analitik, not at all on keuangan, and as Kritis/Perhatian badges on platform. Uppercase tracked labels wrap to 3–4 lines at 390. Coloured icon tiles differ per card. Keuangan leaves an empty grid slot (3+2). | app-1440.png, app-analitik-1440.png, app-keuangan-1440.png | KPI: label → large value → context line, one variant |
| V-20 | high | `/` | both | The landing page says "Akun tenant dibuat melalui undangan tim GeraiCUAN. Belum ada pendaftaran mandiri.", but `/login/tenant` links "Daftarkan toko" and `/daftar` is live. The hero card label "SHIPMENT" is in English. | home-1440.png, login-tenant-1440.png | Consistent, correct copy |
| V-21 | low | global | both | Small naming drift: "Tenant Admin" (header, anggota) vs "Admin tenant" (cetak-resi); skip link "Lompat ke konten utama" (/) vs "Lewati ke konten utama" (/app); "GMT+7" (header clock) vs "WIB (UTC+07:00)" (pages); dates "25 Sep, 10.13", "25 Sep 2026 10.13 WIB" and "25 Sep 2026, 10.08" (no zone). | app-laporan-cetak-resi-1440.png, app-1440.png, platform-tenant-1440.png | Same term for the same thing |
| V-22 | low | global | both | English terms in the Indonesian UI: Lifecycle, Ledger, Batch, Provisioning, p50/p95, Snapshot, pickup, "Default GeraiCUAN", hazardous, SHIPMENT. | laporan, keuangan, platform screenshots | Indonesian copy consistency |
| V-23 | low | `/app/pengiriman/[id]`, `/app/anggota` | 1440 | Duplicate CTAs: "Buka label dan riwayat cetak" appears twice in adjacent rail cards; "Undang anggota" appears in the header and again as the form submit. | app-pengiriman-GC-10060-1440.png, app-anggota-1440.png | At most one primary action |
| V-24 | medium | `/app/kontak/[id]` | both | Four filled primary buttons on one page (Pakai di kiriman baru, Simpan kontak, Simpan peran, Simpan alamat), plus two header outline actions. | app-kontak-detail-1440.png  | One primary action |
| V-25 | low | `/app/pengaturan`, `/pickup`, `/koneksi` vs `/outlet` | 1440 | The settings content column is about 430–450 px on three pages but wider on Outlet, leaving large empty space at 1440. | app-pengaturan-*-1440.png | Consistent layout grid |
| V-26 | low | `/app/kontak/penerima`, `/app/kontak/pengirim` | 390 | The "+1 alamat" link is 24 px tall. The search placeholder is truncated ("Cari nama atau nomor te"). | app-kontak-penerima-390.png, app-kontak-pengirim-390.png | 44 px touch targets; copy fits |
| V-27 | low | `/login/*`, `/daftar` | 390 | "Tampilkan" is a separate outline button, so the password input shrinks to about 120 px. An inline icon toggle is the shadcn norm. | login-tenant-390.png, daftar-390.png | Clean shadcn input pattern |
| V-28 | low | `/app/pengiriman`, `/app/pengiriman/[id]`, `/app/label`, `/app/laporan/pengiriman` | both | Address data mixes UPPERCASE ("COBLONG, BANDUNG", "DAGO, COBLONG, BANDUNG, JAWA BARAT, 40135") with Title Case. | app-pengiriman-1440.png | Consistent data presentation |
| V-29 | low | `/app`, `/app/analitik`, `/app/impor`, `/app/keuangan` | 1440 | The hint "Geser tabel untuk melihat kolom lainnya" shows on desktop even when the table fits. | app-1440.png | Explicit, relevant states only |
| V-30 | low | all app pages | both | The header clock ticks seconds ("08:50:55 GMT+7") and takes a full row on mobile. | app-390.png | Density; no noise |
| V-31 | medium | `/app/keuangan` | 1440 | Native date and month inputs render in the browser's locale ("09/25/2026", "August 2026") while the app is id-ID. Whether an Indonesian browser shows id-ID is **unverified**. | app-keuangan-1440.png | Indonesian copy consistency |
| V-32 | low | `/app/analitik`, `/app/keuangan` vs `/app/laporan/pengiriman` vs the rest | 1440 | Three section-heading styles: a blue left-bar H2 (analitik, keuangan), a small uppercase tracked label ("TOTAL PER KURIR"), and plain H2 elsewhere. | app-analitik-1440.png, app-laporan-pengiriman-1440.png | Consistent type hierarchy |
| V-33 | low | `/app/laporan/*`, `/app` vs `/app/pengiriman`, `/app/analitik` | 1440 | Shipment IDs appear as blue mono bold (reports, dashboard) or blue sans regular (queue, analitik). | screenshots named | Table style consistency |
| V-34 | low | `/app/pengiriman` vs `/app/pengiriman/rts` vs `/app/keuangan` | 1440 | Table row heights vary within and across tables (41–97 px). Per page: pengiriman 77/81/82/93 px, laporan 41–84 px. Stacked cells cause this. | rowH metric | Consistent row height |
| V-35 | low | `/platform/pendaftaran` | 1440 | "Tolak pendaftaran" (outline) stretches to fill the row next to a compact "Setujui toko", which reverses the visual weight of the two actions. | platform-pendaftaran-1440.png | Button style consistency |
| V-36 | low | `/platform/tenant/[id]` | both | The destructive "Tangguhkan tenant" sits in the second block from the top, not in a danger zone at the end. | platform-tenant-detail-1440.png | Admin UX safety (secondary to visual) |
| V-37 | low | every card | both | Added by independent review (T-201): spec 10 §2.2 sets card/section titles to `font-semibold`; `src/components/ui/card.tsx` `CardTitle` uses `font-medium`. | `card.tsx:39` | Type scale weights |
| V-38 | medium | all `/app` and `/platform` pages | both | Added by independent review: the top bar is `bg-background/80 backdrop-blur-xl` (`src/app/_components/cms-shell.tsx:102`); spec 10 §3 requires a solid bar without blur. This is the "glass = 1" baseline counted on every page. | `cms-shell.tsx:102` | Solid, no glass or blur |
| V-39 | high | every form control | both | Added by independent review: `--input` equals `--border` (`oklch(0.922 0 0)`, ≈1.26:1 on white) and `Input`/`SelectTrigger` use `border-input` alone, so the resting field boundary misses the 3:1 non-text contrast rule in spec 10 §2.1. | `globals.css` `--input`; `ui/input.tsx` | Control boundary 3:1 |
| V-40 | low | `/app/pengiriman/baru` | 390 | The sticky bottom action bar uses arbitrary values (`border-[color:var(--hairline)]`, `shadow-[…]`, `pb-[max(…)]`) instead of the scale; spec 10 §1.6 treats off-scale values as defects (the safe-area padding is a justified exception to record). | `baru/page.tsx` sticky bar | Precision |

**Unverified or not screened:**

- Dark mode.
- The Operator role view: operator redirects and nav differences were not captured.
- Populated error states: only the invalid-token states, the label/print-history empty state and the "Hasil penyedia" empty state were observed; one loading state ("Menyiapkan detail kiriman") was seen.
- Dialogs: none opened, to avoid mutation risk.
- Touch targets: the 44 px scan flagged only the items listed. Radio and checkbox inputs sit inside 44 px labels (verified on the 10061 service radios).

---

## (c) Cross-page inconsistencies

**Terminology**

- Courier names differ between the dashboard and the lists (V-5).
- Nav labels differ from H1s: Histori kiriman/Pengiriman, Impor CSV/Impor massal, Cetak resi/Label & riwayat cetak/Riwayat cetak resi, Keuangan/Ledger & rekonsiliasi, Pengaturan/Profil toko, Pengirim baru/Buat kontak, "antrean" (V-7).
- Role: "Tenant Admin" vs "Admin tenant". Time: "GMT+7" vs "WIB (UTC+07:00)". Three date formats. Skip-link wording differs (V-21).
- English leaks: Lifecycle, Ledger, Batch, Provisioning, Snapshot, pickup, raw enums (V-6, V-22).
- Landing page vs self-registration (V-20).

**Header layout**

- The eyebrow is missing on the Cek pages. Eyebrow vocabulary is arbitrary (V-8).
- Action count ranges from 0 to 3: the contact detail has a back link plus 3 actions; the dashboard has 2 actions; Anggota duplicates its CTA.
- Title Case slips in: "Cek Tarif", "Semua Kiriman". `<title>` has 4 patterns.

**Buttons**

- Two primaries: iOS `#007aff` with glow and 12 px radius vs token indigo with 7.2 px radius (V-1).
- Filter submit wording varies: "Terapkan" vs "Terapkan filter". Only platform has "Reset".
- Several filled primaries per page on the contact detail (V-24). Outline full-width reject on Pendaftaran (V-35).

**Tables**

- Only Kontak has a mobile card list; every other table scrolls sideways (V-9).
- Money alignment and font change between the two detail variants; keuangan shows decimals (V-12).
- ID styling (V-33) and row heights (V-34) vary. The scroll hint shows on desktop (V-29).
- Pagination: a numbered pager (pengiriman, audit), plain "halaman 1 dari 1" text (RTS), or none (label, the keuangan pencairan table).

**Badges**

- Lifecycle badges have an icon and text. Settings, keuangan, audit, platform tenant, kontak and COD-support badges are text only (V-13).
- Status colour carries meaning in "Total" cells on the dashboard (green and red numbers).

**Cards and surfaces**

- Three radii, glass vs solid, and coloured icon tiles (V-2, V-3, V-4).
- KPI cards come in 4 variants (V-19). Section heading styles come in 3 variants (V-32).

**Spacing and sizing**

- Form control heights are 32, 36 or 38 px, with ad hoc widths (V-15).
- The settings column width differs between pages (V-25).
- Mobile pages run from 6,500 to 10,600 px (V-16).

---

## (d) Top 10 fixes, in order

1. **Delete the iOS layer in `src/app/globals.css`** (`.ios-glass-card`, `.ios-btn-primary`, `.ios-squircle`) and its 18 usages in 8 files (`settings-layout.tsx`, `dashboard-regions.tsx`, `cek-resi/*`, `cek-tarif/*`, `kontak/contact-*`). Replace them with plain shadcn `Card` and `Button` (default variant). Also drop the `backdrop-blur-xl` classes on cards. This single change fixes V-1 and V-2 and most of V-3.
2. **Use one card radius**: keep the shadcn Card radius (10 px). Remove the `rounded-2xl` override on the KPI cards (V-3).
3. **Swap raw palette classes for semantic tokens** in the KPI icons and accents on `/app`, analitik and keuangan. Use `bg-muted text-muted-foreground`, or the status tokens only where a state is being expressed (V-4).
4. **Adopt one courier display-name map** (JNE, J&T, SiCepat, ID Express, Lion Parcel, SAP, Ninja, AnterAja, POS Indonesia, Shopee Express, Paxel) and apply it everywhere a courier code is rendered (V-5).
5. **Translate every user-visible enum through one Indonesian label map.** This covers provider order and batch status, Mengantar delivery status, audit actions (sentences, per spec 18), ledger sources and ETA strings (normalise to "1–2 hari"). This fixes V-6 and V-22.
6. **Make nav label = H1 = `<title>`** for every route, with sentence case and one eyebrow vocabulary taken from the sidebar group (Pengiriman / Data / Cek / Laporan / Pengelolaan / Platform). Add the eyebrow to the Cek pages (V-7, V-8).
7. **Give status badges icon + text everywhere**, reusing the lifecycle badge component for tenant status, keuangan, audit results, settings readiness and COD support (V-13).
8. **Fix the shipment detail layout.**
   - On mobile, render Status and Tindakan berikutnya first (V-10).
   - On desktop, remove the rail's `max-height` and `overflow:auto` so the timeline is never clipped (V-11).
   - Right-align the Ongkir column and use the standard font in both estimate tables (V-12).
   - Remove the duplicate CTA (V-23).
9. **Add a mobile card-list rendering to the shared data-table** (the Kontak pattern already exists) for the queue, RTS, label, reports, keuangan and platform lists. Paginate the keuangan pencairan table (V-9, V-16).
10. **Unify the filter bar and the KPI card.**
    - One filter component: date-range popover, "Terapkan", optional "Reset", for tenant and platform alike (V-14).
    - One KPI card: label → value → one context line; one delta style; at least 12 px text; no 3-line uppercase labels at 390 (V-18, V-19).
    - Also fix the landing copy that contradicts `/daftar` (V-20): a one-line change.

---

## (e) T-202 repair status (2026-09-25)

Independent review (separate read-only agent): PASS with should-fixes, all applied except the nits listed in TASKS.md T-202.

Re-screen: dev server `http://localhost:3127` on a disposable seeded database (`db:seed-local` on 127.0.0.1:55461), chrome-devtools isolated contexts, same-origin iframes at 1440 and 390 with one metrics pass per route: 20 tenant routes, 3 shipment details, 1 label, 5 platform routes, 3 public/auth routes. Result on every route at both widths: document overflow ≤ 0, **0 elements with a backdrop filter**, **one card radius (10.08 px)**, no raw enum from the V-6 list, no visible text below 12 px outside the thermal label and `kbd`, H1 = nav label = `<title>` (static `<Page> · GeraiCUAN`; shipment and tenant detail use "Detail kiriman"/"Detail tenant"). `rg "ios-|backdrop-blur|rounded-2xl" src/app src/components` → only the three ui overlay scrims (dialog, sheet, alert-dialog), the documented exception.

| ID | Status | Evidence / reason |
|---|---|---|
| V-1 | FIXED | `ios-*` layer removed; one `--primary` Button everywhere (rg clean; dashboard 1440 screenshot) |
| V-2 | FIXED | glass count 0 on all screened routes; top bar solid |
| V-3 | FIXED | one radius 10.08 px on every route with cards |
| V-4 | FIXED | StatCard single neutral variant; raw palette accents removed from dashboard, analitik, keuangan, platform, landing |
| V-5 | FIXED | `serviceDisplayName`/`courierDisplayName` (`src/lib/labels/courier.ts`) in lists, reports, detail, estimate (incl. the COD Ongkir charge heading), dashboard, analitik, platform; `tests/courier-labels` |
| V-6 | FIXED | `src/lib/labels/{provider,finance,audit}.ts`; audit renders Indonesian sentences; unknown provider codes read "Respons lain dari Mengantar (kode X)"; no raw enum found on any screened route |
| V-7 | FIXED | nav label = H1 = title on all tenant and platform routes (dashboard "Dasbor", platform "Ringkasan"/"Tenant"/"Pendaftaran"/"Audit"); back link "Kembali ke histori kiriman" |
| V-8 | FIXED | eyebrow = sidebar group (Utama, Pengiriman, Data, Cek, Laporan, Pengelolaan, Platform); sentence case; one title pattern |
| V-9 | FIXED (T-203) | owner chose app-style cards (2026-09-25); every list page renders `RecordList` below `md` and hides its table (390 re-screen: 0 record tables visible; aggregates keep a local scroller) |
| V-10 | FIXED | `DetailLayout asideFirst`: the rail leads in the DOM (focus and reading order) and is placed in the right column at the split; 390: rail at y≈237, provider result heading at y≈2,496; 1440: rail x≈1,041 (right column) |
| V-11 | FIXED | rail no longer sticky/max-height; nested scroll containers on detail = 0 at 1440 |
| V-12 | FIXED | Ongkir right-aligned `tabular-nums` in both estimate tables; money keeps `font-mono` per spec 10 §2.2. Keuangan "Pencairan" keeps the sen (T-178, the accepted exception: rounding showed equal Dana cair and Ekspektasi beside a non-zero Selisih); every other amount is whole rupiah |
| V-13 | FIXED | `ToneBadge` icon + text for tenant status, audit result, keuangan, settings, kontak, COD support |
| V-14 | FIXED | platform uses the shared `DateRangeFilter` + "Terapkan"; "Terapkan"/"Reset" wording everywhere. Residual: the dashboard outlet filter is still a native select (height differs slightly) |
| V-15 | FIXED | /baru controls 32 px desktop / 44 px below md; scale widths |
| V-16 | FIXED (T-203) | at 390 after T-203: keuangan 18,041 → 7,759 px, laporan pengiriman 10,182 → 4,066, cetak resi 6,798 → 2,632, analitik 10,144 → 4,112, platform tenant detail 7,190 → 6,274 (record lists with an initial slice + "Tampilkan N lainnya", secondary tables in disclosures). Was PARTIAL in T-202: | keuangan "Pencairan" paginated (20/page, `?pencairan=N`); dashboard courier recap is one table (390: 6,534 → 3,742 px); keuangan 390 9,933 → 8,476 px; analitik 390 still 10,144 px and platform tenant detail 7,190 px — further reduction needs V-9 or a content decision |
| V-17 | FIXED | label preview scaled on screen only (390: zoom 0.82, sheet 309 px inside the viewport); print resets to 1 |
| V-18 | FIXED | no text < 12 px; delta pill never wraps, context at most two lines |
| V-19 | FIXED | one StatCard + shared `KpiDelta`; platform health badges in the context line; no empty grid slot on keuangan |
| V-20 | FIXED | landing offers "Daftarkan toko" and "Masuk"; "SHIPMENT" → "Kiriman" |
| V-21 | FIXED | "Tenant Admin" everywhere; skip link "Lewati ke konten utama"; clock "WIB" |
| V-22 | FIXED | Lifecycle, Ledger, Snapshot, Batch, Provisioning, p50/p95, workspace, hazardous replaced; CSV column header `lifecycle` unchanged (file contract) |
| V-23 | FIXED | one label CTA on detail; one invite button on anggota; `/baru` shows one "Simpan & cek tarif" per width (aside card only at the split, sticky bar below it); landing header "Masuk" is outline |
| V-24 | FIXED | contact detail has one filled primary |
| V-25 | FIXED | settings content uses the full column on all four settings pages |
| V-26 | FIXED | "+1 alamat" 44 px; placeholder fits |
| V-27 | FIXED | inline icon toggle inside the password field, 48 px field, accessible label; unused `.auth-password*` CSS removed |
| V-28 | FIXED | `areaDisplayCase` (presentation only; stored data untouched) |
| V-29 | FIXED on /impor | cause was a no-wrap column making the table genuinely wider; the hint already hides when the table fits |
| V-30 | FIXED | clock without seconds, "WIB", hidden below md; kbd hint 12 px |
| V-31 | PARTIAL | native date/month inputs follow the browser language (not controllable); the chosen date/month is echoed in Indonesian under each field and in the confirmation |
| V-32 | FIXED | plain `text-base font-semibold` H2 section headings |
| V-33 | FIXED | shared `shipmentIdLinkClassName`; report IDs are real links |
| V-34 | PARTIAL | hover overrides and desktop 44 px buttons removed; stacked cells (T-148) still vary row height by content |
| V-35 | FIXED | "Tolak pendaftaran" outline at content width; one primary |
| V-36 | FIXED | "Zona berbahaya · Siklus tenant" is the last section of tenant detail at 1440 and 390; confirmation unchanged |
| V-37 | FIXED | `CardTitle` `font-semibold` |
| V-38 | FIXED | top bar solid, no blur |
| V-39 | FIXED | `--input` at ≥ 3:1 |
| V-40 | FIXED | sticky bar uses `border-t`/`shadow-md`; safe-area padding kept as the recorded exception |

