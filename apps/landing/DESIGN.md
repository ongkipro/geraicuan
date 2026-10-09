# GeraiCuan landing — design record (T-296)

Author: claude-opus-5-5
Scope: the public Astro site in `apps/landing` (geraicuan.com, PR-63, D-11). The CMS design system stays in `docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md`; this file covers only the landing pages.

## Brief and audience

- Owner redesign from another device (`origin/landing-page`, `a2f7a7e`, 2026-10-09): GeraiCuan positioned as a free multi-courier **loket** (shipping counter) inside existing shops — konter pulsa, fotokopi, kelontong, minimarket, new agents.
- Owner decisions (2026-10-09): port that site into `apps/landing` (the branch itself is never merged: it deletes the application); its commercial claims are true (komisi 20%–25%, Rp 3.000–15.000 per paket, gratis tanpa franchise, kurir jemput, anti-nombok selisih berat, 12+ ekspedisi); domain stays `geraicuan.com`.
- Primary job: a shop owner understands the offer, estimates the income, and signs up (`app.geraicuan.com/daftar`) or signs in.

## References (captured and inspected)

- `design/refs/mengantar/` (mengantar.com, 390 and 1440). Transferred: courier logos as one clean strip with names; benefit grid of short heading + one line; FAQ as a plain accordion; one dark closing band. Its own claims ("Diskon kirim hingga 30%", "Fee COD 3%") back the commission copy; its "Gratis ongkir return" is not used, because the CMS books a return charge.
- `design/refs/kiriminaja/` (kiriminaja.com, 390 and 1440). Transferred: lead with the courier breadth and COD in the first two screens. Not transferred: a live cek-ongkir widget in the hero (the public site carries no application data, PR-14/D-11) and decorative gradient washes.

## Direction

- Colors: navy `#071E3D` / `#0B2D5B` (hero, pickup and closing bands), brand blue `#1A73E8` (one primary action), sky `#38BDF8` (hero sub-line and commission figure only), pale blue `#E3F2FF` (the GeraiCuan column), slate neutrals. From the owner's 2026 brand guideline (`src/input.css` on the branch). White on `#1A73E8` measures 4.50:1 (AA, at the limit); sky on navy 7.76:1; slate-500 on slate-50 4.54:1.
- Type: Inter only, self-hosted by Astro. `portfolio-scan.py` lists Inter as recurring (×9); kept because the brand guideline and the CMS both use it (brand-asset exception, §2.1).
- Layout concept: a photographic navy hero with the offer and four stats, then alternating white / slate-50 sections; feature groups use a left heading column with a two-column list ruled by a 2 px blue top line instead of boxed cards. Boldness is spent once, in the hero.
- Differs from the recent `adsbookcms` stores (Inter + Cinzel, 0.625rem cards, photo-led commerce) on color strategy (navy + one blue accent), layout concept (ruled lists, comparison table, calculator), and signature element (the real thermal label and COD arithmetic).
- Shape: rounded-full buttons (owner's site), 2xl radius only on photos, the calculator and the table frame; no card around list items.
- Motion: none beyond hover colors; `scroll-behavior` respects reduced motion. The owner's three-slide autoplay hero became one static image (no pause control needed, faster LCP).

## Page anatomy

- `/` hero → couriers → business types (illustrations) → conventional-agent problems → comparison table → advantages → commission calculator → one shipment through the counter (steps + illustrated tariff list) → thermal label + COD precision (PR-63 proof) → closing CTA.
- `/fitur` three feature groups (couriers, counter speed, control); `/cara-kerja` 4 steps, pickup, equipment; `/simulasi` calculator, comparison, FAQ; `/kontak` WhatsApp, hours, coverage, self sign-up steps.
- One WhatsApp call to action on the whole site, on `/kontak`, outside the hero, secondary style with a monochrome icon; the footer lists the number as text (owner rule).

## Claims changed from the owner's copy (product truth, checked in code)

- "Gratis Selamanya" → "Gratis" (PR-81); "Rp 0" price badges → "Gratis".
- Courier strip: Ninja removed (discontinued, D-29); Paxel and SPX described as quoted in cek ongkir but not yet orderable (`mengantar-couriers.ts`); J&T Cargo and Sentral Cargo replaced by the cargo services the CMS orders (JNE, SAP, SiCepat, ID Express). "12+" reads "12+ layanan ekspedisi" (8 couriers plus their cargo services).
- "Langsung aktif / aktif 5 menit" → email verification and admin approval (D-8, D-10), Mengantar connection after login.
- "Notifikasi WhatsApp otomatis" → "kirim resi via WhatsApp" from the shipment page (T-287, a manual action).
- "Dana COD langsung cair ke kasir / tarik kapan saja" → Mengantar disburses to the gerai's own Mengantar account; GeraiCuan shows the estimate in Pencairan COD.
- "Laporan keuangan realtime" → Uang gerai, Pencairan COD and the CSV report (Keuangan was removed in v3).
- The three named testimonials were removed: nothing has been deployed, so no real customer exists yet.
- Added shipped capabilities: masking/gerai name on the label (PR-71), invoice on 80 mm or A4 (PR-76–PR-80), retur, cancel (owner only), cek resi, handover queue (T-263).

## Owner content still needed

- Real testimonials or partner logos once gerai are live.
- Confirmation that "powered by mengantar" in the logo is permitted by Mengantar.
- A source or terms link for the 20%–25% commission, the "ekspedisi resmi" wording, and the competitor figures (Rp 5–25 jt franchise, 5%–10% commission).
- The operator's legal identity (company name, address) for the footer.
- Photos: the shop illustrations are generated (garbled sign text, third-party brand signs); real photos would replace them.

## Render critique

Renders: `design/renders/index-390.png`, `design/renders/index-1440.png`, `design/renders/fitur-390.png`, `design/renders/fitur-1440.png`, `design/renders/simulasi-390.png`, `design/renders/simulasi-1440.png`, `design/renders/cara-kerja-390.png`, `design/renders/cara-kerja-1440.png`, `design/renders/kontak-390.png`, `design/renders/kontak-1440.png`. Document overflow is 0 on every page at 390 and 1440.

- Macro pass (first render of `/`): the 390 header CTA wrapped to two lines, and the comparison table hid the GeraiCuan column off-screen on a phone. Fixed: `whitespace-nowrap` and a smaller logo; the GeraiCuan column moved to second position. The calculator's "40 paket / hari" wrapped at 390; now one line.
- Hero: the offer, commission line and two actions read before the photo; the overlay keeps body text at AA over the image; the stat row is a `dl` whose flex column puts each figure above its label without breaking reading order.
- Couriers: one strip, Paxel last and explained in the lead; no claim that every logo is orderable.
- Business types: equal 3-column grid is the right repeated structure for comparable items; captioned as illustrations so generated photos are not read as partners.
- Comparison and advantages: ruled lists, not boxed cards; the only framed elements are the table, the calculator and the label, each with a reason (horizontal scroll region, a tool, a physical object).
- Proof section: the label mirrors the current CMS sheet (Nilai barang + Ongkir only, T-270) and the COD table's numbers come from the same integer arithmetic as the CMS (118.962 / 3.961 / 100.001).
- Section heads alternate centered (marketing sections) and left-aligned (feature groups, proof, problems); acceptable for a sales page, not every section shares one alignment.
- Review round 1 (codex, REVISE), fixed: the phone comparison is now a stacked list (GeraiCuan value first, both alternatives in one line) and the table shows from `md`; the calculator says "Estimasi komisi" with the visible formula "40 paket × 30 hari × Rp 3.500" and that operating costs are not deducted; the franchise range reads Rp 5–25 jt on every page; on a phone the label follows the COD table directly; the hero links "Dari mana komisi 20%–25% berasal?" to the FAQ (first answer open); each counter step carries one running example (Ibu Contoh, 1 kg J&T Rp 15.000, tunai, resi JP…); subpage headers are left-aligned and `/simulasi` and `/kontak` drop the sign-up button so the calculator and WhatsApp come first; each page has its own closing heading; footer links are grouped "Halaman" / "Akun gerai"; pickup coverage follows Mengantar's area instead of "seluruh Indonesia". The "empty photo slots" were lazy images missing from the capture; the capture now scrolls the page first.
- Review round 2 (codex, REVISE): its main finding, the header covering headings, stats and the calculator, was a capture artifact (the lazy-image scroll left the sticky header mid-page in the full-page screenshot); captures now switch lazy images to eager without scrolling, and the header sits at the top. Also fixed: "Keunggulan" and "Perangkat" follow the left-heading + two-column concept; `/simulasi` comparison is stacked on a phone with the franchise value on every row; Rp 3.500 is labelled "Asumsi"; the COD row in the table carries the label's black outline and "angka yang sama tercetak di label"; closing headings are one step smaller; `/kontak` ends with the sign-up button inside "Mendaftar sendiri" instead of a second band.
- Review round 3 (codex, REVISE), fixed: the courier strip splits "Bisa langsung dipesan" (8 logos) from the quote-only line (Paxel, SPX) and the lead explains "12+" (8 couriers plus the JNE, SAP, SiCepat and ID Express cargo services); the calculator states its assumption between the slider and the result; the phone comparison keeps the pale-blue GeraiCuan line; every closing band shows the three activation steps (daftar + verifikasi, persetujuan admin, koneksi Mengantar); the WhatsApp block on `/kontak` drops its rounded frame for a heavier rule. Its "most important change" (one real transaction captured from tariff choice to label, plus owner photos) needs owner content and staged CMS captures.
- Review round 4 (codex, REVISE: one transaction as the visual spine). Done within honest limits: on `/` the counter flow now precedes the proof and pairs the four steps (one running example, Ibu Contoh, 1 kg to Bandung) with an illustrated Cek tarif list labelled "data rekaan" whose chosen quote (J&T Rp 15.000) is the shipping cost in the COD table and the courier on the sample label below; backgrounds alternate simulator (slate) → flow (white) → proof (slate). Real shop photos remain owner content.
- Review round 5 (codex, REVISE, cap reached): remaining ask is real shop and pickup photos in place of the generated illustrations, kept at the same layout sizes. Gate result: FAIL on `review` only; owner content needed.
- Not taken (owner content, listed above): sources for "resmi", the competitor franchise ranges and the 20%–25% discount; the operator identity in the footer; product screenshots of the cashier screen (no production data may appear on the public site, and staged CMS captures are owner content to supply); the problem section stays three parallel points from the owner's copy.
- Remaining trade-off: `/` is long on a phone (≈13.3k px) because it carries the owner's full story plus the PR-63 proof; subpages repeat parts by design.
