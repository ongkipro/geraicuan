# Courier logos

Mengantar courier logos served from `public/couriers/<key>.svg` and rendered by
`src/components/cms/courier-logo.tsx`. They are trademarks of their owners and
are used nominatively, only to identify which courier carries a shipment. No
file here grants a licence to the mark itself.

Every file was cleaned the same way: XML prolog, DOCTYPE, `<title>`, comments,
`id`/`data-name` attributes and `<style>` classes removed (classes inlined as
`fill`), `viewBox` cropped to the drawn area plus 2% padding, and `width`/`height`
set to the `viewBox` size so `h-6 w-auto` keeps the aspect ratio. None contain
scripts, `<image>`, base64 rasters or external references;
`tests/courier-logo.integration.test.ts` enforces that.

Retrieved 2026-09-25. `ninja.svg` was deleted on 2026-09-26 (D-29, owner "ninja hapus aja"): a historical Ninja shipment shows the plain name "Ninja".

| File | Source | Licence / usage note | Redrawn |
| --- | --- | --- | --- |
| `jne.svg` | Official site header: https://www.jne.co.id/cfind/source/images/logo.svg | Trademark of its owner; nominative use. | No |
| `jt.svg` | Wikimedia Commons, https://commons.wikimedia.org/wiki/File:J%26T_Express_logo.svg (official site https://jet.co.id serves only a PNG) | Commons licence: "Public domain", with a "trademarked" restriction; described as own work based on the official-website logo. Nominative use. | No (Commons vector, cleaned) |
| `sicepat.svg` | Official site header: https://fe-cft.cdn.sicepat.express/web-company-v3/public/company-logo.svg | Trademark of its owner; nominative use. | No |
| `sap.svg` | Official site header: https://www.sapx.id/assets/frontend-3.0/img/logo/sapx-logo.svg | Trademark of its owner; nominative use. | No |
| `idexpress.svg` | Official site header: https://idexpress.com/images/logo.svg | Trademark of its owner; nominative use. | No |
| `anteraja.svg` | No vector published by the owner (https://anteraja.id serves `logo-anteraja.png` only); reference: that PNG and the owner's `anteraja-logo.png` | Trademark of its owner; nominative use. Brand pink `#EC0B78` sampled from the official PNG. | Yes: hand-drawn approximation of the loop-and-arrow mark plus "anteraja" as SVG text (rounded/Arial bold fallback). Replace with an official vector if AnterAja provides one. |
| `lion.svg` | Official site footer: https://stg-website-lionparcel.s3.ap-southeast-1.amazonaws.com/assets/logo/lp_logo_footer_new.svg (linked from https://lionparcel.com) | Trademark of its owner; nominative use. | No |
| `spx.svg` | Official site: https://spx.co.id/logo/spx-express.svg (byte-identical to the owner's reference `spx-logo.svg`) | Trademark of its owner; nominative use. | No |
| `paxel.svg` | Official site: https://paxel.co/images/icon/logo-purple.svg | Trademark of its owner; nominative use. | No — tagline group ("Paketmu Sehari Sampai") removed so the mark is legible at 24px |
| `pos.svg` | Owner's reference folder `geraicuan-html/img/pos-logo.svg` (Pos Indonesia 2023 "POS IND" logo; https://www.posindonesia.co.id serves only PNG/JPEG) | Trademark of its owner; nominative use. Original upstream URL of the reference file is unknown. | No — unfilled 200×200 background `<rect>` removed |

Rejected: the owner's `ic-jne-navbar.svg` (a PNG embedded as base64 inside an
SVG wrapper) and `ic-sicepat-colored-24.svg` (icon only, no wordmark); the
official files above replace them. Third-party logo-aggregator downloads were
not used because their provenance cannot be checked.
