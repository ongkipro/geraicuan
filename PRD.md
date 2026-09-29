# PRD: GeraiCuan Landing Page & Onboarding Acquisition Website

## Document Control
- **Product Name**: GeraiCuan Landing Page
- **Version**: 1.0 (Synthesized & Hardened)
- **Accountable Owner**: Paduka Ongki
- **Status**: Accepted Planning Baseline
- **Date**: 2026-09-24
- **Primary Surface**: Public Web (Desktop, Tablet, Mobile)
- **Source Artifacts**: `ongkipro/geraicuan` + `ongkipro/geraicuan` + `~/Documents/work/content/geraicuan-landing-page.md`

---

## 1. Overview & Positioning

GeraiCuan is a modern, high-performance web platform designed to acquire and onboard Indonesian physical shipping agency partners (*gerai ekspedisi multi-kurir*). This landing page presents an irresistible business proposition: **transforming any retail counter into a high-margin, multi-carrier shipping hub powered by official Mengantar API integration**.

By combining the operational strengths of **GeraiCUAN** (bulk CSV intake, reusable contact directory, 100x150 mm thermal label printing, transparent COD breakdown) and **GeraiCuan** (counter-first keyboard speed, physical verification gate, anti-fraud append-only cash/QRIS ledger, and verified-pickup profit reporting), the landing page communicates unmatched operational credibility, aesthetic elegance, and direct financial upside to Indonesian store owners.

---

## 2. Product, Audience, and Market Context

### Target Personas
1. **Independent Shipping Outlet Owners (Juragan Agen Kurir)**:
   - Operators already running JNE, SiCepat, J&T, or POS Indonesia agencies who are tired of switching between multiple clunky dashboards and losing profit to single-carrier exclusivity.
2. **Retail Store & PPOB Entrepreneurs**:
   - Owners of grocery stores, photocopy centers, phone credit shops, or computer stores looking to monetize foot traffic with high-margin shipping services without paying exorbitant franchise fees.
3. **Multi-Branch Logistics Operators (Pemilik Jaringan Cabang)**:
   - Entrepreneurs managing 2–50+ retail counters who suffer from cashier fraud, missing parcel discrepancies, and unverified profit claims.

### The Irresistible Offer (The Hook)
- **Zero Software Subscription Fee**: No monthly subscription barriers or upfront software licensing fees.
- **Full 100% Margin Retention**: Outlets charge standard courier rates to retail walk-in customers and capture the full 15%–35% Mengantar discount difference directly as gross profit.
- **Unified Multi-Carrier Access**: J&T, SiCepat, JNE, Ninja, Anteraja, Paxel accessible immediately through a single high-speed counter form.
- **Built-in Cashier Fraud Protection**: Append-only transaction logging with separated cashier/admin/owner permissions.
- **Fast-Track Whitelist Activation**: Simple 1x24 hour verification for verified physical counters.

---

## 3. Goals & Non-Goals

### Measurable Goals
- **Conversion Rate (Lead Capture)**: Achieve $\ge 8.5\%$ conversion from visitor to qualified whitelist registration.
- **Engagement (Simulator Interaction)**: $\ge 60\%$ of desktop visitors interact with the dynamic profit simulator.
- **Performance (Core Web Vitals)**: Google Lighthouse score $\ge 95$ across Performance, Accessibility, and SEO, with Largest Contentful Paint (LCP) $\le 1.8$s on 4G mobile connections.
- **Comprehension**: 100% clarity that GeraiCuan uses Mengantar as the logistics backbone and that standard courier AWB tracking numbers are officially recognized.

### Non-Goals
- **In-Page E-commerce Checkout**: The landing page does not process consumer online bookings or parcel payments.
- **Immediate Self-Serve Account Spawning**: To preserve API integrity and prevent fraud, public users cannot auto-create live shipping accounts without whitelist verification.
- **Custom Courier Rate Manipulation**: The system never promotes or allows artificial markups beyond official courier rate cards.

---

## 4. Requirements (EARS Syntax)

### REQ-LP-1: Hero Section & Interactive Counter Sandbox Mockup
- **Statement**: When a visitor lands on the page, the system shall present an authoritative value proposition headline, dual call-to-action buttons, trust indicators, and a fully interactive desktop preview of the GeraiCuan counter POS interface where visitors can toggle package weights and sample couriers to see live rate comparisons and thermal label previews.
- **Acceptance Criteria**: Hero displays on all viewports without layout shift (CLS $\le 0.05$); visitors can interactively click sample package scenarios (e.g. 1 kg vs 3 kg) and observe reactive rate calculation with margin badges (+Rp2.800) and instant thermal label generation preview.

### REQ-LP-2: Courier Ecosystem Badges
- **Statement**: The system shall render high-contrast, recognizable badges of officially supported couriers (J&T, SiCepat, JNE, Ninja, Anteraja, Paxel, ID Express, Lion Parcel) with an explicit confirmation that all shipments use genuine carrier tracking numbers.
- **Acceptance Criteria**: Badges render crisply on Retina/HiDPI screens in grayscale with color hover transition; alt text accurately reflects courier names.

### REQ-LP-3: Interactive Profit Margin Simulator
- **Statement**: While the visitor adjusts the parcel-volume slider (10 to 1,000 parcels/day) and average shipping fee slider (Rp10,000 to Rp100,000), the system shall dynamically compute and display the estimated monthly gross shipping margin and COD service revenue using formatted Indonesian Rupiah (`id-ID`).
- **Acceptance Criteria**: Calculations update instantly ($< 16$ms frame budget); numbers display using tabular monospace fonts; an explicit disclaimer denotes that earnings represent gross margin estimates before local counter overhead.

### REQ-LP-4: Counter Workflow Demonstration
- **Statement**: The system shall visually guide the visitor through the 4-step counter operational flow: (1) Instant Contact & Address Retrieval, (2) Physical Package Scale & Dimension Verification, (3) Cash/QRIS Payment Collection, and (4) 1-Click Thermal Resi (100x150 mm) Printing.
- **Acceptance Criteria**: Steps are presented sequentially with numbered micro-badges and concise operational explanations.

### REQ-LP-5: Deep-Dive Feature Grid (GeraiCUAN + GeraiCuan Synthesis)
- **Statement**: The system shall display a responsive bento-grid detailing the 7 core operational pillars: (1) Walk-in & Bulk CSV Import, (2) Standard 100x150 mm Thermal Resi with Safe Reprint, (3) 1-Click WhatsApp Resi Share via native web-intent, (4) Clean COD Breakdown & 11% VAT, (5) Multi-Branch Organization Hierarchy, (6) Outbox Pattern Network Fault-Tolerance, and (7) Reusable Customer Directory.
- **Acceptance Criteria**: Each grid card features a dedicated illustrative icon, a concrete operational pain-point mitigation, and high-density typography.

### REQ-LP-6: Competitive Comparison Matrix
- **Statement**: The system shall present an objective comparison table evaluating GeraiCuan against Traditional Manual Web Dashboards and Generic PPOB Systems across 8 operational criteria (Carrier Diversity, Booking Speed, Thermal Resi, Scale Protection, Cashier Anti-Fraud, Margin Transparency, Verified Pickup Profit, and Software Fees).
- **Acceptance Criteria**: GeraiCuan column is highlighted with high-contrast accent styling; mobile layout supports smooth horizontal scroll or accordion collapse without breaking page layout.

### REQ-LP-7: Lead Capture & Whitelist Application Form
- **Statement**: When a visitor submits the whitelist application form with Full Name, Active WhatsApp Number, Store Name, City/Regency, Daily Parcel Estimate, and Mengantar Account Status, the system shall validate all fields with Zod schemas and route the lead to backend persistence with optional WhatsApp direct confirmation.
- **Acceptance Criteria**: Invalid inputs trigger inline error feedback; successful submission renders a confirmation card with next-step onboarding instructions within 1 second.

### REQ-LP-8: Portal Navigation & Session Redirection
- **Statement**: While authenticated or returning users access the navigation bar, the system shall provide dedicated links to `/login/tenant` (for store staff/owners) and `/login/super-admin` (for platform governance).
- **Acceptance Criteria**: Links route directly to the respective portal endpoints; unauthenticated users clicking portal links are prompted with standard secure authentication screens.

### REQ-LP-9: Performance, Responsiveness & Accessibility
- **Statement**: The system shall execute on Next.js App Router with semantic HTML5, zero render-blocking third-party scripts, WCAG 2.1 AA color contrast compliance, and full keyboard accessibility.
- **Acceptance Criteria**: Automated audit achieves $\ge 95$ on Lighthouse; interactive controls have a minimum touch target of 44x44 px.

---

## 5. Non-Functional Requirements & Design Stack
- **Framework**: Next.js 15+ (App Router) + React 19 + TypeScript.
- **Styling**: Tailwind CSS v4 + Radix UI Primitives + Lucide React Icons.
- **Theme**: Deep Slate Charcoal (`#0B0F17`) default dark mode with clean luminous light mode support.
- **Typography**: Inter / Plus Jakarta Sans (Headings & Body), JetBrains Mono (Numbers & Currency).
- **Hosting Target**: Edge-ready (Vercel / Cloudflare Pages / VPS PM2).
