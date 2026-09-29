# Tasks: GeraiCuan Landing Page & Onboarding Acquisition Website

## Rules for Implementation
- One task per request / commit. Mark `[x]` upon completion.
- Do ONLY the task's stated scope. No unrequested abstractions or dependencies.
- Every task traces to exactly one accepted primary requirement.
- Verify each task locally with executable evidence before marking complete.

---

## Task Queue

### T-1 — Bootstrap Layout Shell & Design Tokens
- **Primary requirement**: REQ-LP-8
- **Constraints**: REQ-LP-9
- **Dependencies**: None
- **Context**: Initialize the Next.js App Router layout shell (`src/app/layout.tsx`, `src/app/globals.css`) with Tailwind CSS v4 design tokens, color variables (`--color-canvas-bg`, `--color-canvas-surface`, `--color-brand-primary`, `--color-profit-emerald`), and font declarations (Inter/Plus Jakarta Sans + JetBrains Mono).
- **Done when**: Run `pnpm dev` and assert that the base HTML shell renders with correct CSS variables, background `#0B0F17`, and zero console warnings.

---

### T-2 — Sticky Header, Announcement Bar & Portal Navigation
- **Primary requirement**: REQ-LP-8
- **Constraints**: REQ-LP-9
- **Dependencies**: T-1
- **Context**: Build the top announcement bar (`BETA PRIORITAS — Pendaftaran Gerai Gelombang Pertama`) and sticky navbar (`<Navbar />`) featuring the GeraiCuan logo, section anchor links, and dual portal action links (`/login/tenant` and `/login/super-admin`).
- **Done when**: Click each navigation link in browser preview; assert that sticky backdrop blur engages on scroll and portal links resolve without dead ends.

---

### T-3 — Hero Section & Live Counter POS Interactive Mockup Sandbox
- **Primary requirement**: REQ-LP-1
- **Constraints**: REQ-LP-8, REQ-LP-9
- **Dependencies**: T-2
- **Context**: Construct the 2-column Hero section (`<HeroSection />`). Left column renders high-impact value proposition headlines, sub-copy, trust pills, and dual CTAs. Right column renders an interactive sandbox mockup of the GeraiCuan Counter POS interface allowing visitors to toggle sample package weights (1 kg vs 3 kg), see live rate recalculations with gross margin chips (+Rp2.800), and trigger an instant 100x150 mm thermal label preview modal.
- **Done when**: Load on desktop and mobile viewports; assert zero horizontal scroll, responsive single-column collapse on `< 768px`, and verify that clicking package weight chips reactively updates the rates and margin display.

---

### T-4 — Multi-Carrier Ecosystem Badges & Trust Metrics
- **Primary requirement**: REQ-LP-2
- **Constraints**: REQ-LP-9
- **Dependencies**: T-3
- **Context**: Implement the courier ecosystem section (`<CourierEcosystem />`) displaying official logos of supported logistics partners (J&T, SiCepat, JNE, Ninja, Anteraja, Paxel, ID Express, Lion Parcel) alongside trust metrics (100% genuine carrier AWBs, < 3s issuance time).
- **Done when**: Inspect rendered badges; assert grayscale-to-color hover transition and accessible `alt` text for screen readers.

---

### T-5 — The Hard Reality & 4-Step Counter Workflow
- **Primary requirement**: REQ-LP-4
- **Constraints**: REQ-LP-9
- **Dependencies**: T-4
- **Context**: Build the operational reality and workflow section (`<CounterWorkflow />`). Includes 3 pain-point warning cards (multi-tab chaos, cashier fraud, scale discrepancies) followed by a 4-step linear progression (Input & Kontak, Timbang Fisik, Terima Bayar, Cetak Resi).
- **Done when**: Verify section layout in desktop and mobile viewports; assert correct step numbering and sequential visual connector lines.

---

### T-6 — Feature Bento Grid Deep-Dive (GeraiCUAN + GeraiCuan Synthesis)
- **Primary requirement**: REQ-LP-5
- **Constraints**: REQ-LP-9
- **Dependencies**: T-5
- **Context**: Implement the 7-card bento grid (`<FeatureBentoGrid />`) detailing the synthesized feature set: (1) Bulk CSV Intake for local olshop, (2) Standard 100x150 mm Thermal Label with Safe Reprint, (3) 1-Click WhatsApp Resi Share via native web-intent, (4) Transparent COD & 11% VAT breakdown, (5) Multi-Branch Organization hierarchy, (6) Outbox Idempotency network fault-tolerance, and (7) Reusable Customer Directory.
- **Done when**: Render bento grid; verify responsive 3-column (desktop) to 1-column (mobile) reflow and that all 7 feature cards render with unique icons, high-contrast typography, and operational pain-point solutions.

---

### T-7 — Interactive Reactive Profit Simulator Component
- **Primary requirement**: REQ-LP-3
- **Constraints**: REQ-LP-9
- **Dependencies**: T-6
- **Context**: Build the client-side interactive profit calculator (`<ProfitSimulator />`). Implements two range sliders (parcels/day: 10–500; average shipping fee: Rp10,000–Rp50,000) with reactive monetary calculation computing monthly shipping turnover, gross margin (20%), and COD fee additions, rendered with tabular monospace numbers in Indonesian Rupiah.
- **Done when**: Drag sliders and assert immediate reactive recalculation of monetary values in `< 16ms` without UI lag, accompanied by smooth number transitions and the direct CTA link to the application form.

---

### T-8 — Competitive Comparison Matrix & FAQ Accordion
- **Primary requirement**: REQ-LP-6
- **Constraints**: REQ-LP-9
- **Dependencies**: T-7
- **Context**: Construct the 8-point comparison matrix table (`<ComparisonTable />`) pitting GeraiCuan against Manual Multi-tab and Generic PPOB software, followed by an accessible Radix/shadcn FAQ accordion (`<FaqSection />`) addressing thermal printers, courier agreements, QRIS handling, and Mengantar account pairing.
- **Done when**: Expand/collapse FAQ items with keyboard (Space/Enter); verify smooth accordion transition and verify responsive horizontal scrollability of the comparison table on mobile screens.

---

### T-9 — Whitelist Lead Capture Form with Zod Validation
- **Primary requirement**: REQ-LP-7
- **Constraints**: REQ-LP-9
- **Dependencies**: T-8
- **Context**: Build the high-converting whitelist application form (`<LeadCaptureForm />`) with fields: Owner Name, WhatsApp Number, Store Name, City/Regency, Daily Parcel Volume, and Mengantar Status. Implement client/server Zod validation, error handling, loading states, and direct submission feedback.
- **Done when**: Submit an invalid payload and verify inline error prompts; submit a valid payload and verify success confirmation card display with WhatsApp redirection payload.

---

### T-10 — Core Web Vitals, Accessibility & Cross-Browser Audit
- **Primary requirement**: REQ-LP-9
- **Constraints**: REQ-LP-1, REQ-LP-8
- **Dependencies**: T-1 through T-9
- **Context**: Execute production build, inspect bundle sizes, run automated Lighthouse audit, verify color contrast ratios ($\ge 4.5:1$), and test full keyboard navigation flow from top to bottom.
- **Done when**: Production build passes with zero TypeScript/lint errors; Google Lighthouse achieves score $\ge 95$ across Performance, Accessibility, Best Practices, and SEO.
