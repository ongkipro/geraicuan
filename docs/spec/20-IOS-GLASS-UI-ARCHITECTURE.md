> **SUPERSEDED 2026-09-25 (T-201).** The owner chose the GeraiOS professional shadcn pattern without glass. `10-DESIGN-SYSTEM-WHITELABEL.md` v2.0 is the only design contract; nothing in this document is a requirement. Glass classes still present in code are defects listed in `docs/visual-screening-register.md`. Kept for provenance only.

# Spec 20: iOS / Glassmorphism UI/UX Architecture

> **Authoritative Specification** for GeraiCUAN Apple-Inspired Glass Interface  
> **Target Surfaces**: CMS Tenant Shell, Navigation, Dashboard (`/app`), Analytics (`/app/analitik`), and Shared Cards.

---

## 1. Design Philosophy: The Modern Liquid Glass Standard

The GeraiCUAN interface adopts a high-precision, clean, and distraction-free visual language inspired by modern Apple human interface standards (iOS / iPadOS / macOS Sonoma):

1. **Frosted Glass (Glassmorphism) with Depth**
   - Translucent surfaces (`backdrop-blur-xl`, `bg-card/75` or `bg-background/80`) that let context and subtle colors breathe through.
   - Micro-borders: 1px translucent borders (`border-white/30` or `border-border/50`) simulating light refraction on glass edges.
   - Multi-layer soft elevation: diffuse shadows (`0 8px 30px -4px rgba(0,0,0,0.04)`) instead of heavy, muddy dropshadows.

2. **Squircle Geometry & Tactile Feedback**
   - True Apple squircle radiuses (`rounded-2xl` for cards, `rounded-xl` for inner components, `rounded-full` for status capsules).
   - Micro-interactions: subtle hover elevation (`hover:-translate-y-0.5 hover:shadow-md`) and active press scale (`active:scale-[0.98]`).

3. **Vibrant Semantic Color Accents**
   - Every metric and status uses an energetic, refined iOS-like tinted aura:
     - **Shipments Created / Primary**: iOS System Blue (`#007AFF` / `rgb(37 99 235)`)
     - **COD / Financial Movement**: Mint & Emerald (`#34C759` / `rgb(16 185 129)`)
     - **Non-COD / Digital**: Royal Indigo & Purple (`#5856D6` / `rgb(99 102 241)`)
     - **Issuance / AWB**: Warm Amber & Orange (`#FF9500` / `rgb(245 158 11)`)
     - **Exceptions / RTS**: Coral Red (`#FF3B30` / `rgb(239 68 68)`)

4. **Minimal Text & High-Signal Hierarchy**
   - Eliminate verbose AI instructions, redundant captions, and explanatory paragraphs.
   - Numbers are the heroes: large, bold, tabular numerals (`text-3xl font-extrabold tracking-tight tabular-nums`).
   - Labels are concise uppercase identifiers (`text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80`).
   - Comparison deltas are displayed as compact pill capsules (`rounded-full px-2.5 py-0.5 text-xs font-semibold`).

---

## 2. Navigation Architecture (Sidebar & Header)

### 2.1 Sidebar (macOS / iPadOS Aesthetic)
- **Background**: Translucent frosted glass panel (`bg-sidebar/80 backdrop-blur-xl border-r border-sidebar-border/50`).
- **Brand Plaque**: iOS app-style icon squircle with gradient shine and bold initials (`GC`).
- **Active Navigation Items**: Capsule pill active state with subtle colored tint and left accent glow (`rounded-xl bg-primary/10 text-primary font-semibold shadow-xs`).
- **Collapsible Groups**: Minimalist disclosure headers with smooth rotating chevrons and hairline hierarchy tree connectors.

### 2.2 Header Shell (iOS Spotlight & Status)
- **Surface**: Sticky frosted navigation bar (`sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50`).
- **Quick Search**: Spotlight-inspired search pill with rounded-full border and subtle shortcut badge (`⌘K`).
- **Identity & Role**: Clean store name with rounded secondary pill badge.
- **Clock**: Compact micro-timestamp with monospaced tabular numerals.

---

## 3. Home Dashboard Architecture (`/app`)

### 3.1 Primary Action Bar
- **"+ Buat kiriman"**: Vibrant iOS primary action pill with subtle radial glow (`rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md shadow-blue-500/20 active:scale-[0.98]`).
- **"Impor CSV"**: Translucent secondary glass button (`rounded-xl border border-border/70 bg-background/70 backdrop-blur-md hover:bg-muted/70`).

### 3.2 Control Center Period Filter
- Unified glass filter container with soft rounded corners (`rounded-2xl border border-border/60 bg-card/75 backdrop-blur-xl shadow-xs`).
- Segmented popover date-range picker with crisp calendar cells and contrast-certified focus rings.

### 3.3 Four-Column Stat Card Grid
- Each card is an isolated frosted tile:
  - Header: Left title (`text-sm font-medium text-foreground`), Right colored icon squircle badge (`size-9 rounded-xl flex items-center justify-center`).
  - Value: Bold, high-contrast number (`text-3xl font-extrabold tracking-tight tabular-nums text-foreground`).
  - Comparison: iOS capsule badge indicating delta (`+12 (109%) vs 7 hari sebelumnya`) with green/red/neutral tint.

### 3.4 Summary Tables & Recent Shipments
- Cards have `rounded-2xl` boundaries, delicate hairline dividers, and zebra stripes with zero opacity leaks.
- Actionable recent shipments lead with exception indicators and direct action buttons (`Lihat detail →`).

---

## 4. Operational Lists & Queue Architecture (`/app/pengiriman`, `/app/pengiriman/rts`, `/app/label`)

### 4.1 State Summary Panel (`StateSummaryPanel`)
- **Visual Form**: Segmented iOS glass squircle cards in a responsive grid (`rounded-xl border backdrop-blur-md`).
- **Inactive State**: Subtle translucent glass (`border-border/60 bg-card/60 hover:bg-card/90 hover:border-border hover:shadow-xs`).
- **Active State**: System Blue highlight (`border-primary/80 bg-primary/5 shadow-xs ring-1 ring-primary/20 text-foreground`) with checkmark indicator for accessibility.
- **Numbers**: Bold monospace tabular numerals (`font-mono text-base font-bold tabular-nums`).

### 4.2 Queue Table Wrappers
- Enclose tables in squircle glass shells (`rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl shadow-xs overflow-hidden`).
- Sticky table headers remain 100% opaque to prevent content leak on scroll while respecting WCAG contrast.

---

## 5. Analytics Experience (`/app/analitik`)

### 5.1 KPI Accents
- **Kiriman Dibuat**: Blue squircle accent (`accent="blue"`).
- **Resi Terbit**: Emerald squircle accent (`accent="emerald"`).
- **Tingkat Penerbitan Resi**: Indigo squircle accent (`accent="indigo"`).
- **Pengecualian Belum Selesai**: Rose squircle accent (`accent="rose"`).

### 5.2 Financial Breakdown
- **Biaya Kirim Mengantar**: Amber squircle accent (`accent="amber"`).
- **Biaya COD**: Rose squircle accent (`accent="rose"`).
- **Estimasi Dana Dicairkan**: Emerald squircle accent (`accent="emerald"`).
- **Termasuk PPN**: Indigo squircle accent (`accent="indigo"`).

### 5.3 Filter & Reconciliation Callout
- Filter container uses `.ios-glass-card` with `rounded-2xl`.
- Reconciliation alert styled as modern iOS system notice with subtle border glow.

---

## 6. Financial & Ledger Workspace (`/app/keuangan`)

- **Decision Summary Cards**: Enhanced with semantic `accent` props (indigo for liability, amber for provider costs, emerald for non-COD recovery).
- **Variance Tables**: Clean zebra stripes and tabular numbers with explicit status tones.

---

## 7. Utilities & Quick Lookups (`/app/cek-resi`, `/app/cek-tarif`)

- Form containers styled with `.ios-glass-card` and `rounded-2xl`.
- Action buttons styled as `.ios-btn-primary` with tactile press feedback.
- Helper aside notes ("Tips pencarian", "Perlu diingat") styled as soft glass callout cards.

---

## 8. Contact Directory (`/app/kontak/pengirim`, `/app/kontak/penerima`)

- Search toolbar and segmented pills housed in an integrated glass container.
- Contact cards/rows with smooth hover state and quick action buttons.

---

## 9. Settings Workspace (`/app/pengaturan/...`)

- macOS System Settings-inspired navigation with active pill selection.
- Setting section cards housed in squircle frosted glass panels (`rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl`).

---

## 10. Invariants & Guardrails (Non-Negotiable)

1. **Test Compliance**:
   - Maintain 100% pass on all 24 tests in `tests/dashboard-period-page.integration.test.ts`.
   - Maintain 100% pass on `tests/cms-shell.integration.test.ts`, `tests/cms-shell-render.integration.test.ts`.
   - Maintain 100% pass on `tests/state-summary-panel.integration.test.ts`, `tests/analytics-*.integration.test.ts`.
2. **Accessibility & Targets**:
   - Zero contrast failures on 1440px desktop, 390px mobile, and dark mode.
   - Minimum 44px touch targets on mobile touch controls.
   - Zero horizontal layout overflow (`overflow <= 0`).
3. **Data Authority**:
   - COD remains an append-only liability, never revenue.
   - Provider AWB remains the sole authority for shipment tracking.
