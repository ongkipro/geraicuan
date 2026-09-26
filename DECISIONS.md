# Decision Register — geraicuan

Updated: 2026-09-26

Record accepted decisions that materially constrain product behavior,
architecture, security, data, operations, or delivery. Repository evidence must
support each decision; AI output alone is not evidence.

| ID | Status | Decision | Drivers | Evidence | Supersedes |
|---|---|---|---|---|---|
| ADR-0001 | Accepted 2026-09-25 | Rebuild the CMS presentation layer from zero on official shadcn/ui blocks and the owner's HTML reference; domain layer unchanged ([ADR-0001](docs/adr/ADR-0001-ui-v3-rebuild.md)) | Owner judged the accreted UI imprecise; masking-first scope | Owner messages 2026-09-25; `~/Documents/work/notes/geraicuan-html/` | Spec 10 v2.x, spec 20 |
| D-14 | Accepted 2026-09-26 | GeraiCUAN is a free SaaS for gerai expedition aggregators with three cores: kirim, cetak resi (masked label), invoice (nota). Invoice = one immutable charge document per issued shipment, not payment evidence (spec 02 §v3.1, spec 05 DATA-14) | Owner direction 2026-09-26; boundary adopted from GeraiOS spec 11 |
| D-15 | Accepted 2026-09-26 | Invoice v3.1 charges the provider `price` + insurance only; no gerai extra-fee lines yet | Owner chose "Belum, ongkir saja" |
| D-16 | Accepted 2026-09-26 | The AdsBookCMS-shape `POST /order` probe is prepared but not run; T-153 stays the gate | Owner chose "Tunda dulu"; a live probe creates a real order |
| D-17 | Accepted 2026-09-26 | Mengantar-app look deltas (spec 10 §13) wait for the owner's analysis to finish; screens follow the owner's HTML reference meanwhile | Owner chose "Tunggu analisisnya selesai" |
| D-18 | Accepted 2026-09-26 | Adopt the Mengantar-app look (spec 10 §13 deltas D1–D6, D9, D11, D12; D7/D8 rejected for the 40+ floor) as spec 10 v3.2, applied once through global tokens and the shell after the Phase 18 screens land (T-228) | Owner: GeraiCUAN should look and behave like app.mengantar.com on shadcn/ui; chose "Setelah layar selesai". Supersedes D-17 |
| D-19 | Accepted 2026-09-26 | Pickup vehicle (Motor/Mobil/Truk) is stored and shown like handover type, not sent to Mengantar until T-153 | Mengantar's app shows a Volume choice on Pick Up (analysis §9.2); supersedes the earlier "no vehicle field" rule (spec 10 §12) |
| D-20 | Accepted 2026-09-26 | Add from the Mengantar study: label information editor with live preview, two-step print-format modal, Mengantar-style order detail, full parcel-status vocabulary | Owner selected all four |
| D-21 | Accepted 2026-09-26 | (a) Masuk (tenant and Super Admin) and Daftar split at ≥ 1024 px into a left visual panel (brand, headline, the three cores, static nota mock) and the card; below 1024 px the card alone. Daftar is three client-side steps (Akun, Gerai, Awalan) with one server submission; the Server Action stays the trust boundary. (b) A new or changed shipment prefix is 2–3 capitals/digits (e.g. PHI, A29); stored 4–5 character prefixes stay valid. Sign-up stores the chosen prefix unlocked (migration 0060: trigger guard, not `CHECK NOT VALID`, which would block allocation for legacy rows; `register_tenant_self_service_with_prefix` wraps the unchanged 0051 function) | Owner 2026-09-26: "login kiri design visual → kanan login … register bikin flow step … initial invoice … max 3 karakter misal a29, phi"; spec 02 PR-83/PR-44, spec 05 DATA-10/DATA-12, spec 17 UX-v3.10 |

Use stable IDs such as `DEC-001`. When a decision needs detailed alternatives or
consequences, add a repository-owned ADR and link it from this register. Never
rewrite history silently: mark the old decision superseded and add the new one.
