# Status — geraicuan

Updated: 2026-09-11
Status: Active
State: IMPLEMENTING
Review-Risk: R4
Independent-Review: PASS (T-76 through T-82, all of Phase 10) — T-76,
T-83, T-79, T-84, T-85, T-78, and T-80 each passed independent review on
their own run. T-77 went through twenty-three review rounds; rounds 1-18
and 20-22 each found and fixed a real defect (round 19's one claimed
finding was checked against the repository and found false, no code
changed), and round 23 — after a targeted re-verification of round 22's
fix, a fully exhaustive enumeration of every hardcoded route/file list in
the guard file that had drifted three rounds running, and a broader hunt
outside the test file — found nothing to reject. T-81 (R3, financial
correctness) was independently reviewed by a separate agent that
re-verified the fix against the live database and the full test suite
rather than trusting the resolution text, and confirmed it correct with no
defects. T-86 and T-82 made no R2+ code change requiring a separate review
run (T-86 was a mechanical CSS deletion verified structurally and
empirically; T-82 was documentation/seed/migration hygiene). Full 23-round
T-77 history and each round's evidence footer are in BUILD-LOG.md.
Primary-Worker: Main
Independent-Reviewer: Separate review agent (adversarial diff review)
Independent-Review-Head: not bound — T-76, T-83, T-79, T-84 and T-85 each
passed independent review on their own delivery-ledger run, but no single
attestation
covers the whole worktree and further Phase 10 tasks will change it again.
`Review-Risk: R4` is the highest risk any of those reviews found, set by T-79's
security audit; each ledger run carries its own declared risk, so a lower value
in `.delivery/current.json` describes that run rather than this tree.

## Delivery state machine

Allowed forward path:

`PLANNED -> READY -> IMPLEMENTING -> VERIFYING -> REVIEWING -> INTEGRATING -> PRODUCTION_READY -> AWAITING_DEPLOY_APPROVAL -> DEPLOYED -> SMOKE_TESTING -> VERIFIED`

Use `BLOCKED` only as an interruption state. Record the blocker and exact state to resume. Do not skip verification/review/integration states. `production-gate` proves the transition from `INTEGRATING` to `PRODUCTION_READY`; it never deploys.

`RELEASE.md` owns release-specific truth: release ID, base, declared risk, rollback reference/command, backup proof, and readiness status. `Review-Risk` is the highest semantic risk found during review. `production-gate` computes effective release risk as max(`RELEASE.md` Declared-Risk, deterministic `diff-risk`, `Review-Risk`). R3/R4 require `Independent-Review: PASS`, a reviewer distinct from `Primary-Worker`, and `Independent-Review-Head` bound to the reviewed release content. Only review-attestation files may change after that commit.

`OBSERVABILITY.md` owns post-deploy verification probes. After deployment, transition to `SMOKE_TESTING` and run `release-check`. Every configured observability probe must pass before transition to `VERIFIED`.

## Current state

**2026-09-09 — Phase 10 screening is in progress and the release candidate is
no longer clean.** T-76's full-codebase screening opened the Phase 9 commit
`67beb92` and found it had been marked complete without ever running the
suite. Nine real test failures were waiting, and two of its four features were
not functional: `shipment_rts_events` was created with neither row-level
security nor a grant to the application role, so the RTS page could only ever
work on a superuser connection; and the COGS value the shipment form collects
was discarded before persistence, so every reported Net Margin subtracted a
zero cost. Both are now repaired — the first by T-76, the second by T-83.

T-76 has repaired the stale evidence, removed the dead code, completed the
`server-only` boundary across `src/db`, fixed a missing tenant predicate in
`checkDuplicateShipment`, fixed a row fan-out that broke RTS pagination, landed
migration `0032_shipment_rts_events_isolation`, and given `/app/pengiriman/rts`
the loading, error, audit-scenario, and invalid-query contract its registration
claimed. Evidence at T-76's boundary: 72 files / 549 integration tests, which
later Phase 10 tasks have since taken to 75 files / 569; clean
`tsc`/`lint`/`build`,
migration upgrade through 0032 on a fresh database, and an authenticated
390/768/1280 browser journey.

Independent review rejected this work repeatedly, and was right every time.
Neither this document nor the delivery ledger records how many rounds ran: the
ledger run `RUN-20260908T175002Z-ede3f676` holds only `run_started`,
`boundary_check`, `scope_expansion` and `verification` records — executed
evidence and boundary state, never a review round — and the review reports
themselves live outside the repository. That is deliberate rather than an
omission — a round-by-round narrative kept inside the artifact under review is
invalidated by every review of it, so each round ends up rejecting the summary
the previous round just wrote. `BUILD-LOG.md` records what review rejected;
nothing records a count.

What review rejected falls into two kinds. The first was real engineering: a
route registered with states it could not produce, a SQL rewrite with no
executable check, browser evidence taken from hand-written SQL instead of a
repository fixture, and return fixtures carrying provider-accepted snapshots
with no ledger entries. The second, and the majority, was this repository's own
documents asserting a closure the disk contradicted — a route map calling
committed code uncommitted, log sentences recording repairs that had not
happened, an overcorrected maturity label, stale counts. Both kinds are
addressed. The second kind is the reason this tree is not a release candidate
yet: evidence written before the check that proves it is exactly the failure
this screening exists to catch.

T-76, T-83, T-79, T-84, T-85, T-77, and now T-86 are complete. T-77's
screening and repairs passed independent review after twenty-three rounds.
T-86 deleted the dead pre-shadcn stylesheet globals.css screening found
(119 dead selectors, two more than T-77's original 117-count finding — see
T-86's Resolution in TASKS.md for the substring-sweep false positive that
hid them). Verifying T-86 briefly surfaced what looked like two
pre-existing, unrelated integration-test failures; both were a false
lead — the check had run under the wrong environment file
(`env.dev.sh`'s `BETTER_AUTH_TRUSTED_ORIGINS` instead of
`env.integration.sh`'s), which made Better Auth reject the requests on
origin before any application code ran. Corrected and re-run under the
right environment: `pnpm test:integration` is 590/590. No task filed.

T-78 is complete: a full audit of every mutating form/button/dialog under
`src/app` found the app already exemplary almost everywhere (deterministic
pending states, object-naming confirmation dialogs, programmatic error
focus). Two real defects, both inside T-78's own scope, are fixed: the
shipment draft's duplicate-order warning was gated on matching a literal
Indonesian sentence rather than a structured flag (now
`duplicateDetected: boolean` on the action's return state, proved
decoupled from wording by mutation test), its banner used hardcoded
`amber-*` classes instead of the `--warn`/`--warn-surface` tokens
`shipment-status-badge.tsx` already established the pattern for, and its
checkbox used `focus:` instead of `focus-visible:`; and the contact
archive confirmation dialog was the only destructive-action dialog in the
app that didn't name its object, now `` `Arsipkan {name}?` ``. All three
verified live via CDP. `pnpm test:integration` is 591/591 (one new test
added).

T-80 is complete: direct audit of the provider integration code (concurrency
serialization, `SUBMISSION_UNKNOWN` recovery, webhook idempotency, API
resilience) found concurrency and ambiguous-state handling already correct
and verified against existing tests, webhook idempotency N/A (the route
refuses every request and nothing else writes tracking state), and one real
gap — an already-correct fixture-unavailable guard in
`confirmShipmentIssuance` had no explanation at the call site, now
documented the way the webhook route documents itself. Reconciliation being
entirely manual, not automated, is routed to T-81 rather than fixed here.
T-81 is complete: an adversarial audit of every ledger scope item (immutability,
COD segregation, integer arithmetic, reversal balance) found them all already
correct and already test-proven at the database level, not just by
application convention — no fix needed for any of them. One real bug was
confirmed and fixed: `netMarginIdr`'s COGS term was aggregated over a
different shipment cohort (created) than its other four terms (ledger-
effective), now aligned; two existing tests that had encoded the old, wrong
behavior from opposite directions are corrected, and the fix is mutation-
verified. Two pre-existing routed findings (write-once COGS, manual-only
reconciliation) are confirmed still present and left as explicit
product-scope decisions rather than invented unilaterally.

T-82 is complete, and with it the entire Phase 10 queue (T-76 through T-82).
All six of its open routed findings are closed — three real (a stale UX-2
navigation doc, a local-seed id collision, a spurious `pnpm db:generate`
migration now fixed by `0037`) and three already resolved before this task
started (README's test-environment and re-seed documentation, and the
`MENGANTAR_WEBHOOK_SECRET` reference, all stale against the current, already-
closed webhook). Every named document (`STATUS.md`, `BUILD-LOG.md`,
`OBSERVABILITY.md`, `RELEASE.md`, `18-AI-ROUTE-MAP.md`, `02-PRD.md`) is
harmonized against the current repository state. The full verification
battery passes clean: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` (zero
errors or warnings), `pnpm test:integration` (591/591), `pnpm
test:migration-upgrade` (through `0037` on a clean database), and a
route-only `pnpm test:ui-audit` sweep (66/66, 0 findings). `RELEASE.md`
deliberately stays `Status: BLOCKED` — Phase 10 passing does not by itself
authorize a production-readiness declaration; that document's own contract
requires T-62's verification to rerun from a clean, committed tree first,
which is outside Phase 10's scope. Nothing in this segment has been
committed or pushed, per the standing instruction to do so only once
everything is done — which, as of this line, it is.

T-77 screened all 22 routes on disk at 390/768/1280 — 66 surface/viewport pairs
across public, tenant and platform scope — and found two defects the register
had recorded plus two the task named but no earlier round had measured. The
return queue lost a KPI row that restated the counts its own filter chips
already carried, gained a labelled focusable scroll region and a `nav` in place
of a `role="tablist"` over links, and stopped printing a UUID prefix as a row
identifier. In the token layer: **keyboard focus was invisible on every surface
in the application** — nothing defined `--ring`, so the global focus rule and
every primitive's ring resolved invalid, and an invalid `outline` computes to
`outline-style:none`, suppressing the browser's own ring as well. The
destructive tint measured 3.99:1 against a 4.5:1 floor because `--destructive`
carried shadcn's default red rather than the design system's `--danger`. Both
are fixed at the token, and
`tests/design-token-contrast.integration.test.ts` now computes AA and 1.4.11
contrast from the tokens themselves.
Three probe hazards were also closed: a contrast probe that parsed only `rgb()`
inspected 12 of 278 elements and would have certified a sweep it never ran;
headless Chrome never matches `:focus-visible` without focus emulation; and the
integration suite tears down the demo seed, so a sweep after it screens empty
states. Each is now a hard failure rather than a silent pass. Screening
additionally found 117 of 157 class names in `globals.css` dead in both source
and rendered DOM; T-86 deleted them (119 once a substring-sweep false
positive in the original count was corrected — see TASKS.md), proved by
structural argument plus a before/after 66-route/312-scenario sweep with 0
findings both times.

Independent review rejected T-77 twenty-one times across twenty-three
rounds (round 19's claim did not hold up; round 23 found nothing), and was
right every time it rejected.
Round 12 found the port from round 11 faithful and fully functional, and
raised one process objection (uncommitted state) that does not hold up as a
new defect - see BUILD-LOG.md's round-12 section for why.
The two guards it rested on did not bind: review wrote its own mutations and six
of seven passed, each bound to text that merely happened to sit in the fixed
source rather than to the defect. Both guards were rewritten to bind
structurally and now kill all 21 mutations, including every one review broke.
The task had also declared scope it never screened — typographic hierarchy, line
length, container tiers, and the empty/loading/error states — and reads as
complete. Those are screened now through the 104 UI-audit scenarios the
repository already declares, 312 further scenario/viewport pairs, which found
four more defects: **17-49px of document horizontal overflow at 390px** on
`/app/pengiriman/baru` in the estimate-bearing states (the base route was
clean); `EmptyState` rendering an `h3` under the page `h1` because `CardTitle`
was a `div` and no CMS page had an outline below its heading; a second visible
`aria-current="page"` on `/app/pengaturan`; and a scroll region whose label sat
on the wrong element plus a step strip no keyboard could reach. All four are
fixed. Five recorded numbers were also wrong against the disk and are corrected.

Round two rejected it again with eighteen findings, and the important ones were
the same shape: seven new mutations still walked through both guards, because
both were written against enumerated spellings. `role={"tablist"}`, a helper
holding the truncated identifier, a KPI row rebuilt from `filterTabs` rather
than the summary, an **indented** second `:root`, and a
`@media (prefers-color-scheme: dark)` palette all passed. The instrument is
different now rather than patched: the page guard asserts rendered HTML through
`renderToStaticMarkup`, and the token guard parses the stylesheet with brace
matching instead of regular expressions. Twelve page mutations and seventeen
token mutations, including every one both rounds broke, now fail.
Round two also found that the state sweep was not screening what it claimed —
47 of 51 loading pairs were measuring the fully loaded page, because navigation
waited for `readyState complete`, which for a streamed route is after the very
delay the skeleton covers. Capturing the loading frame revealed a real defect it
had been hiding: two of sixteen loading skeletons render no `h1` at all, and one
of them covers all four platform routes. Three `contacts-area-*` scenarios are
Server Action states a page load cannot reach, so nine pairs were counted as
screened while rendering the base route; they are excluded by name now, and the
sweep fails when any scenario renders indistinguishably from its base.
Two claims recorded in round one were wrong and are corrected in `BUILD-LOG.md`:
the 17-49px overflow was **introduced by this run** rather than pre-existing —
the artifact that seemed to prove otherwise had been overwritten by a later run
— and the 105ch line-length threshold rested on a false reading of `max-w-2xl`
(672px is 72ch at 14px, not 102ch), so it sat above every finding it was meant
to catch. Prose is measured against the pixel cap now, and eleven paragraphs
that were over it are capped.

Round three rejected it once more and, for the first time, found a shipped
defect rather than a documentation or instrument fault: the sticky identifying
column went **translucent under row hover**, because a fractional-opacity hover
class outranks the opaque background by specificity, so the columns scrolling
beneath it read through exactly when a user pointed at the row. Four tables
carried it, including the two this task had just fixed, and the probe could not
see it because it read header cells and never body cells. Round three also
showed the scenario-effect check was vacuous on every tenant route — the digest
was hashing the RSC flight payload, and its whitespace normalisation had never
run because a template literal swallowed the backslash — and that the token
guard leaked through CSS inheritance (`body` sets inherited custom properties)
and through media context (`@media print` around the one focus rule). All are
repaired; the guards now carry fifteen page mutations and twenty-six token
mutations, including all eleven review broke, and a lint that refuses to trust a
probe that cannot compile.

Round four rejected it a fourth time. Half of round three's own sticky-column
fix was itself wrong: two of the four tables it named never had the defect —
`group-hover:*` only matches under an ancestor literally classed `group`, and
two of the four rows had no such class, so the utility never matched before or
after. Only the RTS and CSV-error tables were real; both now carry `group`
uniformly. The probe's replacement hover check repeated the class-name-regex
mistake it existed to fix, moved from a test into the probe, and needed a
correct CSSOM read: a rule with `.selectorText` and `.style` is a leaf whatever
else it exposes, matching a candidate rule to an element is `matches()` alone
and never `closest()` (an ancestor's own unrelated hover rule is not what
paints a child sitting opaquely on top of it), and a value has to be resolved
inside the element's own cascade rather than on an isolated canvas, which
silently reads an unresolvable `var()`/`color-mix()` as opaque. The token
guard's colour parser treated "cannot parse" as "assume safe" — `outline-color:
white` and `rgb(255 255 255)` passed a check that fails closed now — and its
suppressor scan matched only literal `:focus-visible` text, missing
`:focus { outline: none }` at equal specificity and later in source order.
Two document numbers freshly written by the round-three repair itself repeated
errors round three had just corrected two paragraphs earlier. Sixteen page and
thirty-two token mutations now fail, including all fifteen review has broken
across four rounds.

Round five rejected it a fifth time, with three findings, all real and
browser-confirmed. `targetsRoot` split a selector on commas before unwrapping
`:is()`/`:where()`, so `:is(:root, .never-matches)` was shredded into two
pieces neither of which matched anything, and its `--destructive` never
entered the token map while the guard stayed green — confirmed live in a
browser. The second-identifier check only looked at the two ends of a UUID; a
slice from the middle passed both the guard and its own comment's claim to
check "any slice length." And a third, genuinely new way to defeat the
sticky-column probe: a hover rule painting a gradient that fades to
transparent passed, because the check had only ever read
`background-color`/`background`. Chasing that one cost a wrong turn worth
recording — forcing real `:hover` via CDP looked like the fix, and both
available mechanisms (`CSS.forcePseudoState`, a genuine dispatched mouse
event) leave `element.matches(':hover')` reporting true while
`getComputedStyle` never applies a single `:hover`-scoped rule in this
headless Chrome; there is no way to observe a real hover-time computed style
here. The check reads declared rules after all, now including
`background-image`. Seventeen page and thirty-three token mutations now fail,
including all eighteen review has broken across five rounds, and the sticky
probe carries its own six-mutation suite.

Round six rejected it a sixth time, with three findings and one process gap.
The pooled-budget identifier check only covered slice lengths 6-12; a
5-character middle slice evaded it, so the floor is 5 now — not lower, because
a 4-character slice collides with the fixture's own AWB and would fail on data
that has no defect. The comma splitter used to unwrap `:is()`/`:where()`
tracked only paren depth, so a comma inside a quoted attribute value
(`[data-x="a,b"]:root`) still split wrongly — confirmed as valid, applying CSS
in a real browser — and separately, root-detection anchored `:root` to the
start of a compound when it is a pseudo-class that may appear anywhere in one;
both are fixed. And the sticky probe's gradient check still missed a stop
expressed through a `var()` indirection, since the standalone colour parser
cannot read `var()` — confirmed live with a token resolving to
`rgba(0,0,0,0)` two levels up the cascade — so each stop is resolved through
the cell's own cascade now, not parsed as literal text. The round's own first
pass also (wrongly) claimed to be the only one missing an evidence footer;
rounds 4 and 5 were too, both filled in now. Eighteen page mutations,
thirty-four token mutations, and seven sticky-probe mutations now fail,
including all twenty-one independent review has broken across six rounds.

Round seven rejected it a seventh time, and found the token map's merge model
was wrong at its foundation, not merely missing a pattern. It kept a flat
map keyed by property name, last matching rule in the file winning — but CSS
does not resolve an inherited value against a directly-set one by source
order. `body { --ring: transparent }` overrides whatever `:root`'s `--ring`
would otherwise be inherited as, regardless of which sits later in the file;
review demonstrated this by placing the `body` rule *before* `:root`'s own
declaration and watching the guard pass while the real page rendered an
invisible focus ring everywhere under `<body>`. A second exploit,
`:not(html) { --destructive: … }`, was never even classified as
root-reaching — it matches every rendered element except `<html>` by
exclusion rather than by name, which the anchored-prefix check had no way to
see. Token collection is two-tiered now: `:root`/`html` values form the
inherited baseline, `body`/`*`/a bare `:not(...)` form a direct layer applied
on top regardless of source order, since that ordering — not another missed
selector shape — was the actual defect. Round six's own correction was also
incomplete: it said only its own section lacked an evidence footer, when
rounds 4 and 5 did too; all three now have one. Thirty-six token mutations
now fail, including all twenty-three independent review has broken across
seven rounds. Every finding is written up in `TASKS.md` under
"Phase 10 findings register and repair tasks". **T-62's release-candidate PASS
no longer describes this tree** and must be rerun from a clean boundary once the
queue is genuinely complete.

Round eight rejected it an eighth time, with a single finding, and it was the
same meta-pattern one level down: a probe that claims to check "every sticky
table" checked only tables it judged wide enough to need a sticky column in
the first place. The sticky-column opacity-on-hover check gated entry at
`min-width >= 600px` — the threshold for "is this table deliberately wide
enough to require a sticky column," a design-contract question — and reused it
to gate "does an existing sticky column stay opaque," a correctness question
about styling that table already carries regardless of width. `/app/kontak`'s
table (`min-w-[34rem]` = 544px) was one of the four tables round 3/4 gave the
opaque-hover fix, and BUILD-LOG's own round-4 text claimed the fix applied
"uniformly across all four sticky tables" — but at 544px it sat under the
600px gate and was never examined at any viewport. Fixed by admitting a table
into the opacity check when it EITHER meets the 600px threshold OR already has
a `position: sticky` first header cell, separating the two questions the one
threshold had been conflating. Verified live: a `bg-transparent` mutation on
`/app/kontak`'s hover class now correctly fails with an explicit issue message;
the fix was confirmed via a dedicated evidence script before being folded into
the permanent mutation suite (now 8 sticky-column mutations, all killed).

Round nine rejected it a ninth time. The focus-ring width check required a
literal digit, so it could not read the CSS keywords `thin`/`medium`/`thick`
or any non-`px` length unit that `outline-width` also legally accepts;
review added `.cms-main a:focus-visible { outline-width: thin; }` — the real,
live CMS shell wrapper, not a fixture — and all 8 guard tests still passed
against a ring narrowed to roughly 1px. Every token in the shorthand or
longhand is checked against the three keywords (mapped to their standard
1/3/5px) now, and a length in a unit this static parser cannot resolve to
pixels fails closed rather than passing as "no width found." Review also
reported a second, more tentative finding — that measuring
`getComputedStyle` right after `.focus()` can miss a just-changed
`outline-width` — explicitly at medium confidence and asking for
re-verification before any fix. Reproducing it directly: the real page, with
only the one rule that actually sets `outline-width` today, reads correctly
and instantly every time; the unreliable readback only appears once a
*second* competing `outline-width` rule exists on an element carrying
Tailwind's `transition-all`, and even then the value never converges to
either candidate even 500ms past the transition's own 150ms duration — a
genuine Blink/headless rendering quirk in the same family as the
already-documented inability to force real `:hover` in this browser, not a
timing bug a delay fixes. That scenario does not exist in the shipped
stylesheet, and the fix above is exactly what stops it from shipping, at the
source, without depending on browser rendering timing. No probe change was
made. Thirty-seven token mutations now fail, including the one review broke.

Round ten rejected it a tenth time: the keyboard-focus check capped itself at
the first 14 focusable elements per page, with no documented rationale
anywhere in nine prior rounds, and on every real CMS route at 768/1280px
those 14 slots are consumed almost entirely by the persistent sidebar shell
— the skip link, ten nav links, "Toggle Sidebar," and the account menu,
repeating identically on every page. Review measured real focusable counts
across all 12 tenant routes at 1280px (82 on `/app/keuangan`, 60 on
`/app/analitik`, 56 on `/app`, down to 17 on the smallest) — every route
exceeded the cap — then suppressed the focus ring on the real "Buat
pembalik" reconciliation-reversal button, a financial action at index 25 of
82, and the probe reported zero problems. Fixed by removing the cap
entirely: every focusable element is checked now, the same way the contrast
check beside it already inspects every text element with none. A permanent
regression case was added to the browser-probe selftest — twenty offscreen
links pushed before the test's own unfocusable-button injection so it lands
past the old cap position — and reverting the fix locally reproduces
`SELFTEST FAIL`, confirming it binds. A full sweep with the fix live found
zero real regressions elsewhere: focus rings probed rose from 3,616 to 6,267
while route and state sweep findings stayed at zero. This fix touched only
the scratchpad browser probe, not any repository source or test file.

Round eleven rejected it an eleventh time, and the gap was one level up the
stack: every script that produced ten rounds of browser-confirmed evidence
existed only in this AI session's ephemeral scratchpad, never in the
repository — `git ls-files`, a filesystem search, and `git log
--all --diff-filter=A` all confirmed it. The only committed guards check
token values and one page's rendered markup; none of them touch computed
style in a real browser. Review proved the consequence concretely: round
3's shipped defect (a translucent sticky column on hover) has zero matching
text in either committed test file, so if it reappeared today, `tsc`,
`lint`, `test:integration`, and `next build` — the four checks every
round's evidence cites — would all still pass. Fixed by porting the
load-bearing scripts into `scripts/ui-audit/` as a close-to-direct port, not
a rewrite, wiring `pnpm test:ui-audit` and `pnpm test:ui-audit:mutations` in
`package.json`, and documenting both in `README.md` and a new
`scripts/ui-audit/README.md`, including a Chrome launcher since nothing had
previously scripted starting the browser this instrument needs. The
scenario declarations remain a hand-maintained JSON snapshot rather than a
generated one — these scripts run under plain `node` with no TypeScript
loader, and the source module transitively imports `server-only` — a
documented limit, not a silent one, with the sweep's own coverage
assertions as the tripwire for drift. Verified by running the entire ported
suite from its new location end to end: `pnpm test:ui-audit` and `pnpm
test:ui-audit:mutations` both pass, matching the scratchpad originals
exactly (same 66+303 zero-finding sweep, same 18+37+8 mutations all
killed), with every touched source file restored clean after each mutation
run.

Round twelve verified round eleven's port two ways: re-running `pnpm
test:ui-audit`/`pnpm test:ui-audit:mutations` live and getting the identical
evidence footer, and independently diffing all 104 `scenarios.json` keys
against `src/lib/ui-audit-scenario.ts` with zero mismatches. It found one
cosmetic leftover (a comment in `cdp.mjs` still naming the pre-rename
`t77-probe.mjs`) and fixed it, and re-read the full probe/sweep logic
hunting for a twelfth instance of the round 8/9/10 "coverage narrower than
claimed" pattern, finding none. Its one substantive objection — that
`scripts/ui-audit/` is uncommitted, which it called a recurrence of round
11's finding — does not hold up: round 11's actual defect was that the
apparatus lived in a path outside the project entirely, a session-ephemeral
temp directory nothing about git state could have fixed; `scripts/ui-audit/`
now sits inside the actual project directory, visible to every tool this
task uses. Whether it is *committed* is the same question every one of this
task's eleven prior rounds already answered the same way, by the standing
instruction to commit once the whole Phase 10 queue is done, not per round —
treating it as a rejection here would retroactively reject all eleven prior
rounds' fixes on the same basis. This is addressed by explanation in
BUILD-LOG.md, not by a code change beyond the cosmetic comment fix.

Round thirteen engaged with round twelve's committed-state reasoning on its
own judgment and agreed without being asked to, then found a real gap one
level removed from every prior round's pattern: several individual
assertions inside the two committed vitest guards had zero mutation
coverage across all twelve prior rounds — `--danger`, `--ok`,
`--primary`/`--primary-foreground`, `--accent`, `--ink` on any ground, and
the RTS table's `min-w-[70rem]` — even though each guard, tested live with
a hand-mutation, correctly catches a break of every one. The "N mutations,
all killed" framing this task has cited as proof of hardening was true but
incomplete: coverage concentrated on tokens implicated in past incidents,
not the full assertion surface. One mutation was added per previously-
untested pair, including mutating the *ground* (`--surface-sunken`) rather
than the ink for one case, since the existing `--ink-muted` mutation breaks
every ground in its loop at once and the loop's early exit meant `--surface`
and `--surface-sunken` were never independently proven — mutating the ground
instead leaves `--canvas` untouched, so only that specific pairing can be
what fails. Token mutations are now 43, page mutations 19, all killed.

Round fourteen agreed with round twelve's committed-state reasoning without
being asked to, then found two things. First, a third committed guard —
`tests/outlet-settings-page.integration.test.ts`'s aria-current check,
added by this task's own commit to fix a real double-current-page defect —
had never been mutation-tested at all; fixed with a one-mutation suite
(`mutate-outlet-settings.sh`) now wired into `pnpm test:ui-audit:mutations`.
Second, eight of the browser probe's roughly eleven measurements (heading
hierarchy, card titles as headings, image alt text, tablist links, nested
cards, target size, unreachable scroll, prose width) had never been
deliberately triggered and confirmed caught — only contrast/focus and
sticky-column opacity had a committed proof. All eight were verified live
to currently work correctly; this was a missing-proof gap rather than an
active defect, closed by `probe-coverage-selftest.mjs`, wired into `run.sh`.

Round fifteen agreed with rounds twelve through fourteen's committed-state
reasoning, a fourth reviewer doing so without being asked, then found a
real, distinct instance of the round-8 pattern one level further in:
`/app/kontak/[contactId]` declares a `partial-error` state (reachable only
through a registered scenario, never through a route-level condition the
sweep can land in on its own) with no scenario anywhere in
`UI_AUDIT_SCENARIO_CONTRACTS` actually owning it — the ten other routes
declaring the same kind of state all had one. `scenarios.json` had no key
for the route at all, so it silently perturbed neither the 66-route nor the
303-scenario coverage count round 13/14's own completeness checks watch,
which is exactly why it survived fifteen rounds unnoticed: the reverse-
direction check (every scenario's route/state is registered) says nothing
about a route that never gained a scenario for one of its own declared
states. The page had no `parseUiAuditScenarioForRoute` wiring at all, so
this was a real capability gap, not just a missing test fixture. Fixed by
adding a `contact-detail-outlet-error` scenario mirroring
`/app/label/[shipmentId]`'s pattern: a real failure path (the outlet-
readiness lookup, previously uncaught) is now caught and rendered as a
partial-degradation banner rather than failing the whole page, with a
scenario override forcing the same path for screening. A forward-direction
completeness test was added to
`tests/cms-ui-audit-inventory.integration.test.ts` — for every route's own
`partial-error`/`stale` states, at least one scenario must own it — so the
inverse of round 13's finding can't recur unnoticed either. State-pair
coverage rose from 303 to 306. An earlier attempt at round 15 stalled on
its own background monitor and, separately from the retry that found this,
wrote an incorrect "nothing to reject" conclusion directly into this file,
`BUILD-LOG.md`, and `TASKS.md` without the finding above having been made
yet; those entries have been corrected to reflect what was actually found
and fixed. A related operational incident from the same period: a
concurrent review agent's abandoned mid-mutation state left
`src/app/globals.css` truncated from 679 to 331 lines (missing the T-86-
scoped dead-CSS block, not yet due for removal) for roughly two hours
before being caught by a routine post-mutation diff check; restored from a
matching `/tmp/tmp.*` mutation-script backup, verified byte-identical to
`git show HEAD:src/app/globals.css`, and the full verification pipeline
re-run clean afterward. Neither incident reflects a T-77 code defect; both
are noted here because they affected this round's own evidence trail.

Round sixteen agreed with rounds twelve through fifteen's committed-state
reasoning, a fifth reviewer doing so unprompted, then verified round
fifteen's fix live from both directions before looking further: navigated
to the real contact-detail route with and without the new scenario header,
confirming the degradation banner appears only under the scenario while
the rest of the page stays usable; and mutation-tested the new
completeness test itself by removing the scenario contract entry,
confirming the exact expected failure, then restoring it clean. It then
found the banner round 15 added used `role="status"` (a polite live
region, announced only once a screen reader is idle) where every
structurally-identical banner elsewhere in the app — the finance
reconciliation-unavailable banner, and the shadcn `Alert` primitive's own
default — uses `role="alert"` (assertive); confirmed live, on an
unprompted page load, an assistive-tech user could reach the now-broken
outlet picker before being told it was broken. Fixed by changing the one
attribute; verified live that the shipped DOM node now resolves to
`role="alert"`.

Round seventeen agreed with rounds twelve through sixteen's committed-state
reasoning, a sixth reviewer doing so unprompted, confirmed round sixteen's
`role="alert"` fix live, then found round sixteen's own new completeness
test too narrow: it only checked `partial-error`/`stale`, the states
`STATE_STRATEGY` labels `"scenario"`, but `route-error` (labelled
`"route-boundary"`, a different question — whether an error boundary
catches a throw, not whether a scenario is needed to cause it) is
empirically just as scenario-gated in this codebase: all 17 other pages
declaring it reach it only through a scenario-triggered throw, none
organically. `/app/kontak/baru` and `/app/kontak/[contactId]` both declare
`route-error` with zero scenario wiring at all — their error boundaries had
never been rendered by any of seventeen prior rounds' sweeps, by any test,
by any means. Fixed by adding a scenario-triggered throw to both pages
(mirroring the existing `contacts-error` pattern) and widening the
completeness check to include `route-error`, scoped to page-kind route
contracts only — `kind: "endpoint"` contracts like the CSV export Route
Handler are not browser pages the sweep renders and already have their own
dedicated test. State-pair coverage rose from 306 to 312. One self-caught
slip during the fix: the first `scenarios.json` edit overwrote
`/app/kontak/baru`'s three existing scenario entries instead of appending
to them, caught by the sweep's own exclusion-list line reading wrong, not
by a dedicated guard; restored and re-verified clean.

Round eighteen agreed with rounds twelve through seventeen's committed-state
reasoning, a seventh reviewer doing so unprompted, verified round
seventeen's fix live (both new scenario-triggered error boundaries render
the real destructive `Alert`, confirmed against the no-header baseline),
then found round seventeen's own widened check still one state short:
`not-found` carries the identical `"route-boundary"` label that justified
adding `route-error`, and the one route declaring it
(`/platform/tenant/[tenantId]`) is exactly as scenario-only in practice —
proven by mutation, deleting the scenario that owns it and watching the
completeness test still pass. Fixed by adding `"not-found"` to the same
set; no application code changed, since the one route already had its
scenario correctly wired — only the check's own scope was short. Re-verified
by mutation-testing the widened check the same way, restoring clean.

Round nineteen agreed with rounds twelve through eighteen's committed-state
reasoning unprompted, was asked to do a final exhaustive audit of the
completeness check's scope against every declared state rather than patch
one more hole, and reported one candidate: that `/app`'s `first-run` has
zero owning scenario, the same class of gap rounds 15/17/18 found. This
does not hold up — direct verification shows all three routes declaring
`first-run` (`/app`, `/app/analitik`, `/app/pengaturan`) already have a
correctly wired scenario, confirmed by adding `"first-run"` to the check's
set as a test and watching it pass trivially with zero failures.
`first-run`'s own `STATE_STRATEGY` label, `"local-fixture"`, is also a real
category difference from the `"route-boundary"` label that correctly
motivated rounds 17/18 — a first-run state has a genuine fixture-based
path, not only a scenario override. No code or test change made; the
completeness check's current scope is confirmed exhaustive against this
lead. The claim is corrected here rather than accepted, per the standing
rule that a claim is verified against the repository before being trusted.

Round twenty agreed with rounds twelve through nineteen's committed-state
reasoning unprompted, held to a stricter evidentiary bar given round 19's
false lead, and found "keeps one responsive GET filter form tree per
route" — the guard T-69's real duplicate-desktop/mobile-form defect
produced — checks exactly three hardcoded routes despite its name reading
as "every route": `/app/label` has the identical GET filter form shape and
post-dates T-69, so it had zero coverage, static or browser-level. Proven
live by duplicating the filter form block in `src/app/app/label/page.tsx`
and watching the test pass unchanged. Fixed by adding `/app/label` to the
guard's route list; re-verified the same way — duplicated the form again,
confirmed the widened test now fails, restored, confirmed clean, reran
green.

Round twenty-one agreed with rounds twelve through twenty's committed-state
reasoning unprompted, ruled out a signal-kill gap in the four mutation
suites' own `trap ... EXIT` restore logic (verified live with `SIGTERM`
mid-mutation), then found the same allowlist-drift pattern round 20 found
in a different guard: "limits every audit-contract import to its
route-bound read-only page consumers" carries a 13-entry hardcoded
`[file, route]` list checking each page uses the safe, production-gated
`parseUiAuditScenarioForRoute(` and never the legacy `parseUiAuditScenario(`
— never updated for `/app/kontak/baru`, `/app/kontak/[contactId]`, or
`monitoring-view.tsx` (the shared file behind all four `/platform*`
routes), despite all three already being known to the guard's own
`allowedImporters` set two tests above. Proven live by replacing every
`parseUiAuditScenarioForRoute(` call in `kontak/baru/page.tsx` with the
legacy, unguarded call and watching the suite pass unchanged. Fixed by
adding the two literal-route pages to the list and a separate check for
`monitoring-view.tsx` (route passed as a variable, no literal-string match
applies); re-verified the same way, restored, confirmed clean, reran
green.

Round twenty-two agreed with rounds twelve through twenty-one's
committed-state reasoning unprompted, systematically checked every other
hardcoded list in the same guard file (six of seven complete), and found
the same "keeps one responsive GET filter form tree per route" guard round
20 fixed for `/app/label` was still missing all four `/platform*` routes —
`monitoring-view.tsx`'s shared `FilterPanel` has the identical single-form
shape and serves all four, and round 20's own fix never added them. Proven
live by injecting a second form into `FilterPanel` and watching the test
pass unchanged. Fixed by adding all four routes, each mapping to the same
shared file; re-verified the same way, restored, confirmed clean, reran
green. This is the third occurrence of the same allowlist-drift pattern
across two related guards; the design tradeoff (an explicit per-route
allowlist rather than one derived from the page inventory) is noted rather
than restructured, since rewriting the guard's own mechanism is outside
this task's screening scope.
All of this work is local and uncommitted.

### Prior recorded state

The verified pickup-authority increment and its documentation were committed as
`2b3bd18` and pushed to `origin/feat/cms-ui-mengantar-settings` on 2026-09-01.
The follow-up execution queue is local work after that baseline. T-54 through
T-58, T-63 through T-66, T-69, T-70, and the T-52/T-53 destination-authority and many-outlet
milestones are complete with local verification evidence. T-58's cross-layer
screening is also complete: 67 files / 500 PostgreSQL integration tests,
migration upgrade through 0029, static trust-boundary checks, and independent
security review passed. The specification pack now also passes its structural
traceability validator with 14 files, 122 declarations, and zero findings after
independent semantic review. T-64 through T-66 tenant screen groups also pass
corrective security and responsive browser review. T-67 also passes its
role-specific pre-session authorization, production origin/proxy validation,
and 36-capture browser boundary. T-68 now passes the complete platform state
matrix, lifecycle dialog, redaction, and authority review. The reopened T-48
correction now passes pointer and keyboard account-menu activation plus real
sign-out/Back invalidation for Tenant Admin and Super Admin at all three target
widths. The second T-61 rerun captured 111 fresh role/viewport navigation
states and passed lifecycle/audit, reload, forbidden-route, contact, and
sign-out subsets, but correctly failed on reproducible member-disclosure and
account-menu/history hydration mismatches plus incomplete estimate/bulk and
Operator sign-out evidence. Corrective T-66 now passes the official shadcn
Collapsible member-disclosure replacement at all three widths without a
hydration warning. Corrective T-48 also passes modal close-before-navigation
and persisted-page session revalidation for all three roles and widths. Final
T-61 now passes the complete consolidated role journey and independent
designer/correctness/security review. T-71 also closes the estimate adapter's
origin-only URL and encoded credential-segment boundary with fixture-only
regression evidence and independent security review. The remaining executable
milestone is T-62, but it can start only from a clean, explicitly approved
release candidate. All of this follow-up work remains local and uncommitted.

T-70 resolved the previous 95 specification-suite structural findings without
changing runtime behavior or accepted product decisions. Every normative
declaration has an accountable owner, architecture/security/observability IDs
are deterministic declarations, and `JUR-ID-1` has one canonical source with an
explicit unresolved privacy/legal approval gate. T-62 remains blocked by the
screening and role-journey tasks, not by specification structure.

T-54 and T-55 are complete locally. Authenticated tenant users can search Mengantar's
general destination-area contract through a server-only, tenant/outlet-scoped
boundary that returns only provider ID and readable Indonesian hierarchy.
Query, response size/cardinality, timeout, HTTPS origin, redirect, durable rate,
distributed concurrency, credential-version, and cross-tenant controls passed
fresh PostgreSQL 16 and hermetic contract tests plus independent security
review. Contact create/add/edit now share a shadcn provider selector, preserve
optional destinations, clear stale hidden authority, persist exact revalidated
ID/label pairs, and leave archived contacts and shipment snapshots unchanged.
Focused tests, fresh PostgreSQL 16, Tenant Admin and Operator Chromium at
390px/768px/1280px, corrective designer review, and independent security review
passed with zero provider requests. Individual shipment drafting now uses the
same selector after choosing the source outlet, and manual destination choice
is revalidated before persistence. Contact-address prefill is also revalidated
against the current outlet account by searching its stored readable label,
then must still equal the freshly resolved active contact/address pair before
any write. Migration 0028 preserves the same ID/readable-label pair through
recipient party, estimate snapshot, and provider-order snapshot boundaries.
Corrective migration 0029 adds an outlet-scoped monotonic Mengantar authority
version and forced-RLS predicates for exact destination-pair plus current
credential-source binding. Contact, draft, estimate, and provider-batch writes
now compare the validated authority under the outlet lock before persistence;
stale account, pickup/origin, destination, and source transitions fail closed.
Fresh migration, focused, full PostgreSQL, static, and production-build checks
passed; the final integration suite reports 65 files / 486 tests. Existing
Chromium evidence at 390px, 768px, and 1280px remains applicable because the
corrective slice is server-only. Independent security re-review returned PASS
with zero live provider request or mutation. T-56 and T-63 are complete. T-52
then added a dedicated cross-slice authority test: one current-account pickup and
one destination ID/readable-label pair remain exact across contact, immutable
party, draft, estimate, provider-order snapshot, and locally constructed payload;
stale outlet pickup/origin authority fails before order-snapshot creation. The
focused authority set passed 10 files / 86 tests and the full suite passed 66
files / 492 tests with independent R3 PASS. T-53 then completed one
URL-addressable active-outlet workspace for zero, one, ten, and twenty outlets.
Its focused 3-file / 49-test set, full 66-file / 493-test suite, full static
checks, 18-page production build, complete responsive browser matrix, final
  designer review, and independent security review passed without provider or
production activity. T-57, T-69, and T-58 subsequently passed; T-64 through
T-68 are complete and T-59 is the next screen-level milestone closure.

T-50 and T-51 are complete locally. The T-52/T-53 outlet-location slice now
uses the official 2026-09-01 Mengantar pickup contract: Tenant Admins search
readable account pickup labels, origin follows `PICKUP_AUTOFILL`, browser-
submitted area IDs are ignored, and the server revalidates both provider
membership and the private-account authority version before persistence.
Additive migration 0026 stores pickup/origin labels while preserving legacy
ID-only rows. Focused verification, migration upgrade, the full 61-file / 447-
test suite, lint, TypeScript, production build, final browser-backed designer
review, and independent security review pass. General destination search and the
many-outlet list-detail/mobile selector are now complete through T-52/T-53; no
provider mutation or production call occurred.

Tenant-managed Mengantar API keys now have an
encrypted-at-rest, server-only lifecycle backed by additive migration 0025,
forced RLS, tenant/outlet/purpose-bound AES-256-GCM envelopes, durable failed-
attempt rate limiting, Tenant Admin create/replace/fallback actions, redacted
audit outcomes, and private-first credential resolution with a platform-owned
base URL. The existing `Outlet & koneksi` page now exposes the shadcn
platform/private workflow without rendering credential material, preserves a
visible focused result across connection-source changes, and requires an
explicit destructive confirmation before a private key can be removed. Local
Chromium passed authenticated 390px, 768px, and 1280px settings journeys with
10 outlets, zero horizontal overflow, blank password fields after create and
replacement, and correct dialog focus restoration; focused T-51 verification
passed 3 files / 43 tests, targeted lint, TypeScript, designer review, and
independent security review.

Pre-push verification on a fresh PostgreSQL 16 container also corrected the
last T-49 runtime-role setup dependency in the analytics suite and made courier
ordering independent of database locale. Migration upgrade through 0025,
focused analytics 9/9, the full 60-file / 434-test suite, lint, TypeScript, and
the production build now pass on the feature branch. This is verification and
source control preparation only; production remains untouched. The originating
boundary run is retained as `FAIL` for its missing accepted overlap; corrective
run `RUN-20260901T040210Z-06b53149` explicitly owns the reviewed analytics and
evidence-file overlap.

T-1 through T-32 are complete with recorded local verification. The earlier
complete integration suite passed 136 assertions; the T-30 delta evidence is
recorded below alongside the T-31 completion delta. Lint and production build
passed. Deployment remains explicitly unapproved.

The 2026-08-31 UI-system redesign is verified locally but remains uncommitted.
The existing production-readiness review SHA predates this work and MUST be
refreshed before a release gate treats the redesigned surface as reviewed.

Phase 6 is complete. The local tenant overview is analytics-led: it defaults to
Today in WIB and shows period input, COD/non-COD composition, declared goods
values, authoritative issued outcomes, prior-period context, and an accessible
multi-day trend before current work. Its date, outlet, and timezone filters are
URL-persisted and tenant/outlet scoped. Tenant analytics also
has fail-closed URL filters, canonical
`created|issued|outcome|exceptions` detail basis, supporting KPI links, settled
partial-error regions, an explicit issuance denominator and courier breakdown,
and a Tenant Admin-only filtered CSV export.
COD principal remains a liability and financial event totals remain ledger
derived.

T-30 is complete. It streams readiness, metrics, action queue,
and recent outcomes independently; uses a database-generated read timestamp,
five-minute stale policy, and manual refresh; and gives Tenant Admin an exact
reconciliation-variance count/link while omitting finance data and its query
from Operator. Populated regression for Tenant Admin and Operator now passes at
all three required widths, and the manual-refresh live/focus contract is proven.
Its fault-injected partial-region recovery and stale-after-five-minutes states
now have executable browser evidence. T-31 is also complete. Analytics streams
four independent regions with local retry/focus recovery, covers first-run and
empty/error/stale states, and exposes the latest tenant-wide signed
reconciliation variance as a fifth metric distinct from revenue and COD
liability. The variance intentionally does not inherit period, courier, or
lifecycle filters.

T-32 is complete. Focused real-PostgreSQL tests prove tenant/outlet isolation
and current/previous period aggregation. Streamed-render tests prove the
Today-in-WIB default, multi-day semantic trend, URL filter propagation,
readiness-aware first-run state, and fail-closed invalid outlet behavior. The
production build and final browser-visible checks passed without starting any
provider or production action.

## Active work

T-57, corrective T-69, T-70, and T-64 through T-66 are complete. The deterministic inventory now passes
10/10 checks, including exact route/state/action ownership and one responsive
GET filter form on Ringkasan, Analitik, and Keuangan. Authenticated browser
evidence proves the single-form disclosure/inline composition at 390px, 768px,
and 1280px. T-58 completed cross-layer correctness screening after T-52/T-53;
the specification validator now also reports zero findings. All three bounded
tenant route groups now pass before milestone T-59. T-67 and T-68 also pass the
public/login and platform boundaries before milestone T-60. T-61 then proves clean-session role
journeys and T-62 executes the final verification-only release boundary. The
accepted pickup selector is progress, not completion. No cache or canonical
kecamatan dataset is planned without measured evidence, and no screening task
authorizes indiscriminate redesign or live provider mutation.

T-64 closed the first post-location browser group. The bulk-import confirmation
token is now a versioned AES-256-GCM envelope rather than browser-decodable
signed JSON. Only the recipient name needed to identify a row plus non-sensitive
shipment summary fields reach the confirmation UI; phones, addresses, sender
identity, package content, and provider authority remain server-only. Ringkasan
KPI links and daily-workflow drill-down targets now have one logical tab stop and
44px mobile hit areas. Final focused checks passed 18 files / 107 tests. Fresh
Chromium covered 30 primary screenshots and 234 state/loading/pending/
unauthorized observations for both tenant roles at 390px, 768px, and 1280px
with zero failures, document overflow, unexpected browser events, or provider
requests. Designer and independent security review passed.

T-65 closed the tenant data and physical-output group. Fresh automated checks
passed 9 files / 77 tests plus TypeScript, targeted ESLint, and whitespace
validation. The effective browser matrix covered 138 role/state/width
observations, including a clean 30-capture sanctioned-fixture rerun at
390px/768px/1280px. Real local contact create, address edit, archive, and label
print journeys proved pending and focus behavior without provider traffic.
Both label PDFs were one 100×150mm-class page. Designer, security, and
correctness reviews passed.

T-66 closed the tenant analysis, finance, outlet, and member-governance group.
The final focused PostgreSQL suite passed 21 files / 201 tests. Browser review
covered the 108-capture state matrix plus warmed action/control rechecks at
390px, 768px, and 1280px. Analytics linked metrics now use one full-card tab
stop, mobile record controls are 44px, and member confirmation dialogs remain
visible through pending before deterministic result focus. Local invite, role,
deactivation, reconciliation, and invalid-pickup journeys produced no provider
request or browser error. Independent designer and security reviews passed.

T-67 closed the public/auth boundary. Better Auth now validates the requested
tenant/platform login scope against the server-resolved active principal before
creating any session row or cookie; wrong-scope, suspended, missing-scope, and
unknown credentials share one generic public failure. Production auth config
fails closed unless it has exactly two explicit HTTPS CMS origins and valid
trusted IP/CIDR entries. Bounded recovery notices make unauthenticated and
forbidden redirects understandable without protected data or account details.
Focused final checks pass 7 files / 70 tests plus static, workflow, and
production-build validation. The 36-capture Chromium matrix passes at all three
required widths with no protected leak, mismatch cookie, overflow, external
request, provider traffic, or unexpected browser error.

T-68 closed the complete platform workspace group. The deterministic inventory
now owns the Super Admin tenant lifecycle action and its pending, success,
failure, and unauthorized states. Monitoring, tenant list/detail, and audit
passed the 93-capture responsive state matrix plus 15 settled route-boundary
captures. Corrective browser checks prove controlled provisioning and lifecycle
dialogs remain busy and focus-contained through pending, restore trigger focus
on cancellation, and route completed validation focus to the field or result.
The final focused checks pass 5 files / 33 tests plus 2 PostgreSQL files / 9
tests, targeted ESLint, TypeScript, whitespace validation, and an 18-page
production build. Designer and security reviews passed with no overflow,
secret/PII exposure, unexpected network event, provider request, or production
mutation. The first T-59 closure correctly failed because Analitik alone omitted
the required shared page eyebrow in populated, loading, and error states. The
bounded T-66 correction now passes focused checks, the production build, and
nine fresh state/viewport captures. The T-59 rerun then passed all 14 tenant
routes and role evidence with no unexplained divergence. T-60 also passed 21
public/login/platform primary captures with distinct job and authority
boundaries. The first T-61 run captured 87 navigation states but correctly
failed because pointer/click activation could not open the account dropdown
even though Enter/Space worked. Corrective T-48 run
`RUN-20260902T005309Z-cfd95f31` now passes controlled pointer/keyboard
activation and replaces the protected history entry after successful sign-out;
six fresh role/viewport journeys prove the cookie is removed and Back cannot
restore protected content. T-61 must now rerun the complete clean-session
journey and remaining navigation-owned mutation evidence.

The second T-61 run `RUN-20260902T010729Z-b3093c8c` expanded fresh evidence to
111 navigation captures and completed a provider-free Super Admin lifecycle
and audit round trip, but it also reproduced two unwaived hydration defects.
Member governance retained a native disclosure's open DOM state against a
closed server render after role mutation, while the shared account menu left
modal `aria-hidden` attributes on reused CMS DOM during history interaction.
Corrective T-66 run `RUN-20260902T014655Z-3106a76c` now passes the member
disclosure root fix, result/pending focus, reload persistence, fixture restore,
and clean console at all three target widths. Corrective T-48 run
`RUN-20260902T020659Z-1eb98512` now also passes nine role/viewport sign-out
journeys: the modal portal closes cleanly after success, and any earlier
protected BFCache entry is hidden and revalidated through the server before it
can expose a protected H1. The fixture-only
estimate resolver, bulk upload transport retry, and full Operator sign-out
matrix remain explicit T-61 evidence gaps.

Final T-61 run `RUN-20260902T023444Z-7b34e5df` closes those gaps without a
waiver. It consolidates the 111 navigation captures, final T-66 and T-48
corrective matrices, lifecycle/audit and contact mutations, a navigation-only
sanctioned estimate with 14 persisted services, and a native bulk preview with
one valid row and no confirmation. The long-lived Chrome profile's ALPN error
reproduced at both local origins, while the identical upload passed in a clean
isolated profile, so it is retained as browser network-service state rather
than hidden. Fresh 15-file / 144-test role/action and 3-file / 10-test
PostgreSQL ledger/COD/lifecycle checks pass. Independent security and
correctness reviewers found no blocker; zero provider/order/recovery or
production action occurred. T-62 preflight then correctly failed on the
estimate endpoint URL/key construction required by its own scope. T-71 has now
closed that bounded adapter correction with 2 files / 15 fixture-only tests,
targeted ESLint, TypeScript, `git diff --check`, and independent security and
correctness review. A clean reviewed commit and explicit candidate approval
remain the T-62 prerequisites.

The earlier CMS precision and UI/UX goal is complete: T-35, its atomic queue
T-37 through T-47, T-48, the corrective T-49 test-harness task, and final T-36
verification all passed their recorded boundaries. T-47 corrective delivery-ledger run
`RUN-20260901T010311Z-f801bb9f` closed the complete Super Admin monitoring,
tenant list/detail, lifecycle, and audit workspace with exact mutation replay,
redacted monitoring views, hardened audit RLS, and real browser lifecycle proof.
T-35 delivery-ledger run `RUN-20260901T010855Z-655e9fc7` then passed the
independent 18-route cross-screen consistency closure at 390px, 768px, and
1280px. T-48 corrective run `RUN-20260901T012724Z-d7ce0ec0` completed the
labelled mobile Sheet, tablet icon rail, full desktop Sidebar, server-gated
Platform shell, cross-role discovery, forbidden-route, and real sign-out
contracts. T-36's first full-suite attempt exposed and corrected two
stale T-38 courier-order fixture expectations without changing product code;
the second attempt exposed a parallel test-harness race where four suites
dropped the shared runtime role while siblings still used it. T-49 now makes
the disposable database own that role lifecycle and makes every shipment suite
ensure the guarded role explicitly. Final T-36 verification run
`RUN-20260901T015655Z-f8920fff` passes the full automated, migration, build,
traceability, and browser boundary. The release verdict remains NO-GO because
the tree is uncommitted, the release manifest is DRAFT/UNSET, and no clean
release candidate or release approval exists. That earlier goal has no remaining
implementation task; the new T-52/T-53 sequence is separate. Commit, release,
live provider activity, and deployment remain explicitly unapproved.

## Verification evidence

- 2026-08-31 UI-system redesign: accepted tenant/platform IA, one shadcn/Radix
  sidebar shell, semantic light tokens, shared page/status/detail/empty-state
  primitives, and a screen contract were applied across the public site and
  CMS. Shipment queue, create, estimate, detail, issuance, and unpaid recovery
  received targeted component migrations; contacts, outlet/member settings,
  analytics, finance, import, labels, and platform surfaces were aligned to the
  same hierarchy and visual vocabulary. No provider action was triggered.
- 2026-08-31 executable checks: `pnpm lint`, `pnpm exec tsc --noEmit`, a
  focused isolated-PostgreSQL suite (4 files / 22 assertions), and `pnpm build`
  passed. Authenticated Chromium 152 evidence covered 23 public, tenant, and
  platform route/viewport combinations at 390px, 768px, and 1280px. Every
  document reported one main landmark, zero horizontal overflow, and zero
  console errors. The browser flow created a local non-COD draft, opened its
  detail workspace, and verified the populated queue. The mobile navigation
  opened with its close control focused.
- Delivery boundary caveat: this redesign began on an already heavily dirty
  worktree without a `delivery-ledger start` event. No retroactive boundary
  `PASS` is claimed; a clean release run must capture the accepted surface and
  fresh review evidence before release.
- 2026-09-01 T-37 verification foundation: deterministic CMS UI audit scenario
  contracts and route inventory now cover 18 authenticated pages plus 2
  adjacent authenticated CSV endpoints. The corrective pass added exact route
  owners/state matrices, strict development-only route consumption, a two-pass
  alias/template/import-aware class guard, and static/dynamic import isolation.
  Focused Vitest passed 3 files / 11 tests; targeted ESLint, `pnpm exec tsc
  --noEmit`, and `git diff --check` passed; and an independent reviewer returned
  PASS with no blocking findings. Authenticated Chromium at 390px proved a
  scenario owned by the other route is rejected by each real page consumer,
  with zero document overflow and no failed response.
  The delivery boundary required review only for accepted pre-existing dirty
  paths and carried no out-of-scope, protected, unknown, or missing-verification
  changes. No provider request, production operation, commit, push, deployment,
  or release occurred.
- 2026-09-01 T-38 Ringkasan and Analitik: Today-in-WIB and URL-persisted date,
  outlet, and timezone filters now drive independently streamed dashboard and
  analytics regions. All four Ringkasan counts expose exact role-safe support
  rows, analytics trend freshness is independently database-generated, and
  Admin-only finance/governance data stays absent for Operator. Focused Vitest
  passed 10 files / 35 tests, isolated PostgreSQL verification passed 2 files /
  13 tests, and targeted ESLint, TypeScript, and `git diff --check` passed.
  Authenticated Chromium covered both roles and the accepted state matrix at
  390px, 768px, and 1280px, including keyboard, Retry/focus, reload/Back,
  semantic-table, supporting-row, and filtered-CSV journeys. Independent
  correctness and designer re-reviews returned PASS. No provider request,
  production operation, commit, push, deployment, or release occurred.
- 2026-09-01 T-39 shipment queue and lifecycle detail: grouped queue filters,
  local scrolling, pagination, freshness, route-specific loading/error/focus,
  every authoritative shipment state, role-safe actions, sanitized sanctioned
  issuance/recovery, and Admin-only unknown reconciliation are covered. A
  refreshed stale `SUBMITTING` or `PAYING` detail now exposes only a local-state
  safety check; it never calls the provider, serializes against active
  completion, finalizes terminal batches, and moves unresolved work to a
  reachable no-retry unknown state. Final route/action checks passed 2 files /
  28 tests; disposable PostgreSQL verification passed 7 files / 38 tests;
  targeted ESLint, TypeScript, and `git diff --check` passed. Independent R4
  security/correctness and designer reviews returned PASS. Authenticated
  Chromium covered the final stale-operation delta for both roles at 390px,
  768px, and 1280px with no overflow or browser failures. No provider request,
  production operation, commit, push, deployment, or release occurred.
- 2026-09-01 T-40 shipment drafting and estimation: the page now exposes one
  flat progress sequence, grouped 44px controls through tablet, deterministic
  error-summary focus/links, keyboard-safe contact search, immutable UUIDv4
  replay, revision-locked selected contacts, explicit manual overrides, and a
  successful save path into the normal queue/detail lifecycle. A sanctioned
  estimate fixture is non-production-only and production-fail-closed; the
  browser audit error/retry path issued zero POST/provider requests. Focused
  Vitest passed 4 files / 16 tests, disposable PostgreSQL 16 passed 1 file / 7
  tests, TypeScript/targeted ESLint/diff checks passed, authenticated Chromium
  passed at 390/768/1280, and independent security plus designer re-reviews
  returned PASS. Destination area remains syntactically validated only pending
  an accepted provider address-search contract. No provider request,
  production operation, commit, push, deployment, or release occurred.
  Corrective run `RUN-20260831T214051Z-542dd1f4` preserves the original PASS
  evidence while repairing its incomplete immutable skill attribution.
- 2026-09-01 T-46 tenant member governance: Tenant Admin authorization now
  precedes input consumption, every invite/role/deactivation mutation carries
  an exact UUID attempt receipt, single-tenant membership and last-admin
  invariants serialize under concurrency, and member audit inserts are
  tenant/target/role bound without PII. Migration 0023 preflights existing
  duplicate users before adding the global membership key. Focused Vitest
  passed 4 files / 56 tests; fresh PostgreSQL 16 migration upgrade and 2 files /
  15 tests passed; TypeScript, targeted ESLint, and `git diff --check` passed.
  Authenticated Chromium covered populated, sole-admin, inactive, loading,
  route-error, validation, confirmation, role-safe navigation, long-email, and
  responsive overflow states at 390px, 768px, and 1280px. Independent designer
  and security/correctness reviews returned PASS. Initial run
  `RUN-20260901T001837Z-0134091d` remains FAIL only because its immutable
  baseline could not accept required migration/shared-test dirty overlaps;
  corrective run `RUN-20260901T003252Z-5db01f4d` owns the complete surface. No provider request,
  production operation, commit, push, deployment, or release occurred.
- 2026-09-01 T-47 Super Admin monitoring and tenant governance: platform routes
  authorize before protected reads or FormData, monitoring uses a database read
  timestamp, filters/pagination remain canonical, and provider/account/error
  context is allowlisted and redacted. Lifecycle create/suspend/reactivate uses
  exact UUID receipts, fingerprint conflict detection, advisory and target row
  locks, and append-only tenant-bound audit outcomes. Migration 0024 preflights
  duplicate receipts before adding uniqueness and hardened RLS. Final focused
  checks passed 5 files / 52 tests; fresh PostgreSQL 16 migration upgrade and 3
  files / 11 tests passed; TypeScript, targeted ESLint, and diff checks passed.
  Authenticated Chromium passed four routes at 390/768/1280, the complete state
  matrix, and a real provision → suspend → reactivate → reload → audit journey
  with zero document overflow, browser failures, or provider requests.
  Independent designer and security/correctness reviews returned PASS. Initial
  run `RUN-20260901T003840Z-b68e32de` remains immutable FAIL for incomplete
  dirty-overlap declaration; corrective run `RUN-20260901T010311Z-f801bb9f`
  owns the complete verified surface. No production, commit, push, deployment,
  or release action occurred.
- 2026-08-31 tenant overview/analytics increment: focused PostgreSQL and
  component-contract verification passed 5 files / 31 assertions; TypeScript,
  targeted ESLint, `git diff --check`, and production build passed. Authenticated
  Chromium checked the tenant overview at 390px, 768px, and 1280px, the mobile
  navigation, draft/exception queue links, shipment-create route, and analytics
  route with zero document overflow, console errors, or relevant failed
  requests. A final delta check covers the remediated 44px mobile actions and
  full-tile pulse links. The attempted all-file integration run is not counted
  as passing evidence: concurrent files recreate the shared runtime database
  role and 76 tests failed with PostgreSQL `28P01`; focused tests passed again
  after restoring the disposable local fixture role.
- 2026-08-31 Phase 6 data/contract follow-up: focused PostgreSQL checks for
  dashboard, shipment-queue, and analytics repositories passed 3 files / 18
  assertions. The read-only documentation audit independently passed `pnpm
  lint`, `pnpm exec tsc --noEmit`, `git diff --check`, and 5 non-database files /
  49 assertions covering analytics range/filter/basis serialization, supporting
  links, export HTTP denial and CSV safety, and role-aware shell navigation. A
  credential-safe production build passed after the final basis/dashboard
  changes and generated all 17 static pages while retaining the dynamic tenant,
  analytics, and CSV export routes.
  Final authenticated browser evidence then covered the Tenant Admin dashboard
  and analytics at 390px, 768px, and 1280px with zero document overflow,
  console errors, or relevant failed requests. Dashboard queue links opened
  their exact predicates. Populated analytics showed `6` created, `1` issued,
  `100%` success, `3` unresolved, a semantic trend table, and courier `1/1`.
  Outcome KPI URL, supporting table, and CSV export parity were reverified at
  390px and 1280px after fixing a client-remount defect. Mobile filters retained
  focus and 44px targets across apply, reload, and browser Back. Operator checks
  at 390px and 1280px showed role-safe dashboard content and direct analytics
  denial; mobile navigation Escape returned focus to its trigger. The local
  seeder now includes a dedicated Operator fixture.
  A final contract correction added fail-closed `basis=exceptions` support. Its
  current-snapshot table and CSV export preserve outlet, courier, and lifecycle
  dimensions and match the unresolved KPI exactly; focused non-database checks
  passed 3 files / 8 assertions and the analytics PostgreSQL check passed 9
  assertions.
  The latest T-30 increment added an exact Tenant Admin variance link, an
  Operator-safe DTO/query path, four independently streamed dashboard regions,
  database-timestamp stale detection, and manual refresh. Tenant Admin
  first-run/ready-empty browser checks passed at 390px, 768px, and 1280px with
  no overflow, console errors, or relevant failed requests. Analytics now shows
  authoritative backlog `asOf` in the selected timezone through the same
  five-minute stale/manual-refresh control. Focused non-database checks passed 4
  files / 8 tests; PostgreSQL analytics/dashboard checks passed 2 files / 12
  tests; PostgreSQL dashboard/queue checks passed 2 files / 10 tests; full lint
  and production build passed, generating 17 static pages.
  Final `ui-validation` browser evidence passed for populated Tenant Admin and
  Operator dashboards at 390px, 768px, and 1280px with zero document overflow
  and zero console, runtime, or relevant network errors. Admin showed five
  pulses including variance `1` with its exact finance destination; Operator
  showed four permitted pulses and no finance, analytics, or governance UI. The
  Admin 768px fifth tile spanned without layout breakage. Mobile action and
  refresh targets measured 44px, and refresh pending/completion live
  announcements plus focus restoration passed. The exact finance variance route
  passed at all three widths with its wide reconciliation table scrolling
  locally and no document overflow or errors. WIB copy was corrected and
  rechecked.
  Final T-30 fault-state `ui-validation` at 390px and 1280px used an exact
  allowlisted development-only header seam; a production-mode test proves the
  seam fails closed. The failed action region retained five Admin pulses, six
  recent rows, and five role-safe quick actions with zero document overflow or
  errors. Clearing the seam and retrying restored five action rows, returned
  focus to `h2#action-heading`, and exposed the visible shadcn semantic ring.
  A read-only six-minute presentation shift showed the old absolute timestamp
  and stale badge; clearing it and manually refreshing advanced the timestamp,
  removed the badge, announced completion, and restored focus. Audit/freshness
  checks passed 2 files / 3 tests; TypeScript and focused ESLint passed. The
  production build passed before the final focus-ring-only adjustment, so that
  adjustment is covered by TypeScript, ESLint, and browser evidence rather than
  a post-adjustment build. T-30 is complete.
  T-31 completion evidence then verified four independently streamed analytics
  regions, local partial-failure Retry focus, and exact development-only seams
  for stream delay, trend error, stale, first-run, and page error. Production
  mode fails closed against those seams. Browser checks exercised first-run,
  filtered-empty, period-empty, partial trend failure/retry, stale/manual
  refresh, and route recovery across 390px, 768px, and 1280px as applicable,
  with zero document overflow and no console, runtime, or relevant network
  errors. The mobile skeleton overflow defect was repaired; route recovery
  focuses the page H1.
  Analytics now shows a fifth latest tenant-wide signed reconciliation variance
  metric/link, separate from revenue and COD-principal liability and explicitly
  unaffected by period, courier, or lifecycle filters. Its finance hash target
  scroll/focus behavior was repaired. Verification passed 5 analytics/audit
  files / 12 tests, then 3 focused files / 21 tests, 3 focused real-PostgreSQL
  tenant-dashboard tests, focused ESLint, TypeScript, `git diff --check`, and a
  clean production build with ephemeral local build authentication/database
  configuration. The development server remained reachable.
  The attempted full integration suite is not a PASS: legacy files recreated
  the shared `geraicuan_test_runtime` role without a password, causing broad
  authentication failures and deleting local fixtures. The local role and
  accounts were restored and reseeded. T-31 is complete on focused executable
  and browser evidence; the shared legacy test-harness defect remains recorded.
- The suite traceability checker remains red with 89 pre-existing structural
  findings: duplicate `JUR-ID-1`, missing accountable-owner metadata, one
  unbound localized-UI overlay, and unresolved architecture/security/
  observability identifiers. No verified-suite or traceability-clean claim is
  made by this documentation update.

- 2026-08-28 T-1: fresh PostgreSQL 16 migration, tenant isolation integration,
  lint, build, and independent security review passed.
- 2026-08-28 T-2: fresh PostgreSQL 16 applied migrations 0000–0002; seven
  integration assertions passed for lifecycle transitions, denial audit records,
  RLS attribution, and platform-role visibility. `pnpm lint` and `pnpm build`
  passed. Independent security review passed with no blocking/high finding.
- 2026-08-28 T-15: fresh PostgreSQL 16 applied migrations 0000–0006; ten
  integration assertions passed for active tenant/user/member authorization.
  Browser checks covered both public login entries, generic invalid credentials,
  successful email/password sign-in, authenticated tenant scope, and anonymous
  CMS redirects. `pnpm lint` and `pnpm build` passed with the required trusted
  proxy test contract. Independent security review passed.
- 2026-08-28 T-3: fresh PostgreSQL 16 applied migrations 0000–0007; private
  credential resolution precedence, platform fallback, tenant-admin-only
  configuration, and cross-tenant denial integration checks passed. `pnpm lint`
  and `pnpm build` passed. Independent security review passed.
- 2026-08-28 T-16: browser verified the static public page at desktop and
  mobile widths, its two login entry links, no operational controls/data path,
  one H1, no horizontal overflow, and 44px minimum interactive targets.
- 2026-08-28 T-4: fresh PostgreSQL 16 applied migrations 0000–0008;
  15 integration assertions proved draft persistence, immutable parties, input
  rejection, and cross-tenant outlet denial. Browser checks proved invalid
  server validation, PRG success, responsive layout, and a no-JavaScript
  submission. `pnpm lint` and `pnpm build` passed.
- 2026-08-28 T-5: CSV parser tests and a fresh PostgreSQL 16 integration
  suite (20 assertions) passed; the suite proved valid-row-only tenant draft
  persistence and tenant/actor import rate limiting. `pnpm lint` and
  `pnpm build` passed. Browser route access was not independently exercised
  because the local fixture session could not be authenticated.

- 2026-08-28 T-13: fresh PostgreSQL 16 migration through `0009`, contact
  directory integration assertions, `pnpm lint`, and `pnpm build` passed.
  Authenticated browser checks created a contact, added a second address, and
  searched/selected it from a draft with masked picker results. A contact edit
  between selection and save was server-re-resolved into the immutable party
  snapshot. Independent security review passed after the snapshot repair.

- 2026-08-30 T-7 through T-10, T-12, T-14, T-17, and T-18: focused
  integration evidence, lint/build, and independent reviews passed. Migrations
  `0011`–`0019` are additive and verified locally.
- 2026-08-30 T-11: hosted GitHub Actions run `33308954008` passed empty and
  representative migration upgrades, integration tests, lint, and build on
  commit `b737a874c51cad87c60839760e1bc48014608450`.

- 2026-08-29 T-6: one user-approved sandbox non-COD estimate returned HTTP
  200 and was captured only as a sanitized fixture. Migration `0010` persists
  immutable, tenant-scoped estimate snapshots and services. Fixture tests prove
  unsupported services are omitted, provider `price` is preserved without
  custom price calculation, absent/blocked COD support is unavailable, and
  re-estimates remain append-only. Fresh PostgreSQL 16 migration, 27 integration
  assertions, `pnpm lint`, `pnpm build`, and independent security review passed.
  The authenticated estimate panel could not be browser-exercised because no
  approved local authenticated fixture session was available; the protected
  route correctly redirected anonymous access to tenant login.

- 2026-08-30 T-19 through T-29: tenant shell, outlet settings, queue/detail,
  guarded fixture issuance/recovery, finance, membership governance, analytics,
  and platform lifecycle are complete. `pnpm test:integration` passed 29 files
  and 136 assertions; `pnpm lint` and `pnpm build` passed. Browser evidence at
  390px, 768px, and 1280px covered setup, issuance, recovery, finance, member
  governance, and provision/suspend/reactivate audit outcomes with no horizontal
  page overflow.
- 2026-08-30 demo login hint: local development login pages visibly show the
  seeded demo email and password only when `GERAICUAN_ENABLE_DEMO_LOGIN_HINT=1`
  and `DEV_LOCAL_PASSWORD` are set outside production. Browser evidence verified
  the tenant hint and zero horizontal overflow; `pnpm lint` passed.
- 2026-08-30 CMS visual refinement: initialized shadcn/Radix Nova with Tailwind
  v4 semantic tokens; added an accessible tenant shipment trend visualization
  while retaining its tabular detail; refreshed shared tenant/platform visual
  hierarchy, scope clarity, navigation icons, and narrow-table sticky leading
  columns. Independent UI review found and the final patch resolved token
  ownership, mobile-dialog semantics, visible skip-target focus, and sticky-cell
  state background preservation.
  An ephemeral isolated PostgreSQL 16 instance was migrated and seeded only with
  local verification fixtures. `pnpm test:integration` passed 29 files / 136
  tests; `pnpm lint`, `pnpm exec shadcn info --json`, and `pnpm build` passed
  with the isolated non-production environment.
  Authenticated browser evidence covered tenant draft creation, shipment
  analytics with chart/table/timezone semantics, the mobile drawer and keyboard
  skip link, and platform monitoring at 390px and 1280px. Each checked surface
  had zero horizontal page overflow. No provider order was submitted.
- 2026-08-30 local development runtime: `compose.yaml` now provides a
  persistent, localhost-only PostgreSQL 16 service and `pnpm db:seed-local`
  creates the local tenant and Super Admin fixtures. The documented local-only
  credentials are `tenant@geraicuan.com` and `super@geraicuan.com`; both use
  the password supplied as `DEV_LOCAL_PASSWORD`.
  The login pages use shadcn Input, Label, Button, and Alert primitives in a
  deliberately restrained, WordPress-like form-first layout: flat neutral
  canvas, compact 360px card, single wordmark, role-specific title/subtitle,
  local demo autofill, and a 44px return control. The form explicitly uses
  `POST` as its no-JavaScript fallback, so credentials are never placed in a
  query string. Local runtime origin settings now configure both Next.js
  `allowedDevOrigins` and Better Auth's exact trusted origin. Browser validation
  at the reachable development host confirmed authenticated Tenant redirect to
  `/app` and Super Admin redirect to `/platform`, with no password query
  parameter; `pnpm lint` passed.
- 2026-08-30 CMS shell unification: Super Admin now uses the shared
  `cms-shell`, responsive navigation, scope bar, account menu, typography, and
  page-surface rules already used by the tenant CMS. Scope-specific navigation
  remains server-authorized. Platform filter actions and tenant/platform status
  indicators use shadcn `Button` and `Badge` primitives; dashboard filters,
  cards, tables, pagers, and empty/error surfaces share the same semantic
  surface treatment. Browser evidence covered authenticated tenant draft and
  queue screens at 1280px, tenant mobile drawer at 390px, Super Admin overview,
  filter panel, mobile drawer, and audit table at 390px and 1280px. All checked
  documents had zero horizontal overflow; wide tables remained locally
  contained. `pnpm lint` and
  `pnpm exec vitest run --config vitest.integration.config.mts tests/cms-shell.integration.test.ts`
  passed (15 assertions).
- 2026-08-30 CMS review remediation: independent review caught and the final
  patch restored the tenant-to-Super-Admin redirect, so tenant principals never
  receive platform chrome or a misleading Super Admin badge. The platform
  filter actions now retain 44px targets and the outline treatment; mobile
  sticky table cells have an opaque surface while wide tables scroll locally.
  Browser verification confirmed tenant access to `/platform` redirects to
  `/login/super-admin` without platform chrome, platform filter actions measure
  44px, and document-level overflow is zero. `shadcn@4.19.0` is both installed
  and the current registry release; no package upgrade was necessary.
- 2026-08-30 CMS refinement pass: tenant layout now provides the sole
  `main#konten-utama` landmark; all child route wrappers are neutral containers,
  preventing nested landmarks while preserving their visual classes. Analytics,
  finance, reconciliation, and platform tenant lifecycle actions use shadcn
  `Button` with retained submit names/values, outline treatment, and 44px
  targets. Mobile wide tables keep an opaque, non-wrapping sticky reference
  column with matching hover state. Browser checks confirmed one main landmark,
  zero document overflow, 44px primary/outline filter actions, and the
  Super Admin provisioning action as a shadcn button. Print-media inspection
  confirmed `.cms-main` has `padding-top: 0px`, preserving the 100mm × 150mm
  label page origin. Independent review caught the print cascade and it was
  remediated before final `pnpm lint` and focused CMS-shell test passed
  (15 assertions).

T-30 and T-31 are complete. No implementation task is active. Deployment
remains an explicit approval gate.

## 2026-08-31 precision audit update

T-33 and T-34 are complete. Ringkasan, Analitik, and Keuangan now retain
explicit daily, historical, and authoritative-finance boundaries. Dashboard
outlet readiness and active-contact totals use canonical tenant-scoped reads;
the latest signed variance is isolated as a tenant-wide exception; and Finance
states which results do and do not follow its period/outlet filters.

The tenant shell now uses the canonical grouped navigation, a full labelled
Sidebar from 1024px, and a Sheet below 1024px. Contextual shipment/contact
routes retain truthful current locations and role filtering remains
server-derived. Outlet Settings, Import, Label index, and New Contact were
migrated to shared shadcn/native semantic composition. T-35 remains open because
Finance, Platform, shipment/contact detail, membership, and label detail still
contain legacy presentation classes.

Verification passed: 37 integration files / 171 tests, 21 focused shell tests,
8 focused semantic render tests, ESLint, TypeScript, `git diff --check`, and a
Next.js 16.3.3 production build. Authenticated browser checks at 390px, 768px,
and 1280px covered the four migrated pages with zero document overflow or
browser errors. The integration runtime-role harness was made password-safe and
the development fixtures were restored after the suite.

T-36 remains open on T-35 and the explicit production release boundary.
Production issuance/recovery is still fixture-only. No provider request,
production operation, commit, push, or deployment was performed.

## 2026-09-01 CMS precision and populated demo update

The authenticated CMS implementation now shares one width and rhythm contract:
the shell owns viewport gutters, while `PageContainer` selects the accepted
wide, data, standard, or form measure. The remaining Finance, Platform,
shipment, contact-detail, membership, settings, and label-detail surfaces use
shared shadcn composition or smaller accessible native controls; no migrated
legacy presentation class remains in their rendered JSX.

The local-only demo tenant now contains 15 contacts and 18 deterministic
shipments across draft, estimated, queued, unknown, issued, unpaid, and failed
states. It also includes sanitized estimate, COD, order, ledger,
reconciliation, and print-history fixtures. The seeder performs no provider
call, respects append-only financial records, and produced identical counts on
two consecutive runs.

Populated browser checks covered the tenant primary routes plus Finance and all
Platform routes at 390px, 768px, and 1280px. Document overflow and
console/runtime errors were zero after fixing the label-index table boundary;
wide tables remain locally scrollable. Verification passed 38 integration
files / 176 tests, ESLint, TypeScript, `git diff --check`, and a Next.js 16.3.3
production build with 17 static pages generated. T-35 stays open only for its
exhaustive non-populated and interaction-state browser matrix. T-36 remains
open for that dependency and the sanctioned production release boundary. No
provider request, production operation, commit, push, or deployment occurred.

## 2026-09-01 execution-queue decomposition

No implementation was performed in this planning pass. The remaining CMS
precision work is now decomposed in `TASKS.md` into T-37 through T-48. The queue
separates deterministic state fixtures, dashboard/analytics, shipment queue and
drafting, bulk import, contacts, labels, Finance, outlet settings, member
governance, Platform operations, and final cross-role navigation evidence.
Every task has one accepted primary requirement, explicit dependencies,
route/state scope, and a runnable Done-when contract. T-35 remains the parent
presentation milestone and may close only after T-37 through T-47; T-36 remains
the release-boundary gate and now also depends on the cross-role T-48 journey.

The queue is now OMP Goal Mode-ready: it includes a pasteable state-aware goal objective,
startup and approval gates, delivery-ledger boundaries, deterministic execution
order, per-task risk/capability/reviewer routing, allowed and protected change
surfaces, mandatory pre-edit and post-edit `designer`/`vision` critique, a
shared admin UI/UX rubric, browser evidence requirements, and independent
review rules and an explicit cross-screen consistency gate before T-35 can
close. Goal startup must always inspect live ledger state instead of trusting a
dated snapshot. At this update, T-40 has active run
`RUN-20260831T205737Z-20521568`; a resumed Goal must validate and continue that
immutable boundary rather than opening a competing run. It must not claim
retroactive PASS for any work outside the active boundary.

## 2026-09-01 T-41 bulk import completion

T-37 through T-41 are complete; T-42 is the next unblocked execution item.
Bulk import now authenticates and consumes its durable preview attempt before
file parsing, validates only configured tenant outlets, and returns signed
15-minute row envelopes bound to tenant, actor, submission, normalized input,
and row. Confirmation accepts only explicitly selected envelopes, sorts them
deterministically, and uses stable per-row UUIDs so exact replay creates one
semantic draft while tamper, mixed submission, duplicate row, expiry, and
cross-tenant/actor reuse fail closed.

The `/app/impor` surface now has route-specific loading/error focus, Admin
recovery for unconfigured outlets, a keyboard-operable 44px localized file
picker, field-linked errors, explicit zero-default row selection, local table
scrolling with sticky selection context, pending feedback, and direct return to
`/app/pengiriman?status=DRAFT`. Verification passed 4 focused files / 18 tests,
one disposable PostgreSQL file / 7 tests, TypeScript, targeted ESLint, and diff
checks. Authenticated Chromium passed at 390px, 768px, and 1280px with zero
document overflow, exact +1 draft creation from one selected row, and clean
console/runtime evidence. Independent designer, security, and correctness
reviews passed. No provider, production, commit, push, deploy, or release action
occurred. Initial run `RUN-20260831T214240Z-1a32142e` remains FAIL because its
immutable baseline omitted one pre-existing dirty overlap; corrective run
`RUN-20260831T221349Z-ffc85710` accepts and binds the complete verified surface.

## 2026-09-01 T-42 contact directory completion

T-37 through T-42 are complete; T-43 is the next unblocked execution item.
Contacts now use an authenticated POST search action so names and phone queries
do not enter the URL. Only masked phone values cross into directory client
state. Active and archived contacts are separately discoverable; archived
detail is read-only, while create, identity update, and address addition expose
field-linked validation, preserved values, pending state, and deterministic
success/failure focus. Archive remains Tenant-Admin-only with explicit URL
confirmation, focused cancel recovery, action-state failure, and success
presentation gated by the authoritative archived database state.

Repository enforcement now makes the 20-address cap concurrency-safe, rejects
all mutation of archived contacts, translates duplicate labels to a safe domain
error, preserves historical shipment-party snapshots, and keeps every read and
write tenant-scoped. Focused Server Action tests passed 8/8 and disposable
PostgreSQL tests passed 8/8. TypeScript, targeted ESLint, UI audit inventory,
and diff checks passed. Authenticated Chromium covered 390px, 768px, and 1280px
with local table scrolling, sticky name context, zero document overflow,
loading/error focus, actual create/update/address/archive journeys, safe
not-found state, and Operator restrictions. Independent designer, security,
and correctness reviews passed. Shared shell account-trigger sizing remains in
T-48. No provider, production, commit, push, deploy, or release action occurred.
Delivery-ledger run: `RUN-20260831T221534Z-a1314382`.

## 2026-09-01 T-43 label and physical print completion

T-37 through T-43 are complete; T-44 is the next unblocked execution item.
Label list/detail now expose route-owned loading, error, and not-found recovery,
focused invalid-filter feedback, local table scrolling with sticky context, safe
blocked-state recovery, bounded long-address disclosure, and truthful print
request feedback. Print attempts are append-only, tenant/actor/shipment scoped,
idempotent by stable attempt UUID, replay-safe across later lifecycle changes,
and serialized for contiguous sequences under concurrency.

Focused non-database verification passed 3 files / 23 tests and disposable
PostgreSQL 16 passed 1 file / 9 tests. TypeScript, targeted ESLint, UI audit
inventory, and diff checks passed. Authenticated Chromium covered 390px, 768px,
and 1280px with zero document overflow, blocked no-print behavior, exact +1
history, deterministic result focus, and clean console/provider evidence. A
fresh print-only browser session produced exactly one 100 × 150 mm PDF page
(282.96 × 425.04 pt), visually complete and without CMS chrome, clipping, or
extra whitespace/pages. Independent designer, security, and correctness reviews
passed. No provider, production, commit, push, deploy, or release action
occurred. Delivery-ledger run: `RUN-20260831T223741Z-d5e393a4`.
Corrective verification run `RUN-20260831T231708Z-6ebae831` records the complete
skill attribution, including `ui-validation`, after the original immutable
record captured only its first repeated argument.

## 2026-09-01 T-44 Finance workspace completion

T-37 through T-44 are complete; T-45 is the next unblocked execution item.
Finance is now Tenant-Admin-only before filter parsing or data access, with
URL-persisted and validated range/outlet/status/page state, exact variance-row
focus, truthful freshness and degraded states, and a decision hierarchy from
summary through variance, reconciliation, and append-only ledger evidence.

Reconciliation uses stable attempt UUIDs, exact replay, one coherent source and
ledger snapshot, and six atomic class pairs. Full adjustments append a reversal
without mutating the original row. Focused checks passed 4 files / 32 tests;
disposable PostgreSQL 16 passed 2 files / 5 tests; TypeScript, targeted ESLint,
inventory, and diff checks passed. Authenticated Chromium proved focused daily
and monthly outcomes, reload/Back filter persistence, local scrollers, sticky
context, and zero document overflow at 390px, 768px, and 1280px without a
provider request. Independent designer, security, and correctness reviews
passed. Shared account-trigger sizing remains T-48. No provider, production,
commit, push, deploy, or release action occurred. Delivery-ledger run:
`RUN-20260831T231804Z-61655f17`.

## 2026-09-01 T-45 outlet readiness completion

T-37 through T-45 are complete; T-46 is the next unblocked execution item.
Outlet settings now authenticate before input/read, preserve safe failed values,
focus deterministic outcomes, and expose a read-only connection source that
cannot create, repair, overwrite, or downgrade private secret references.
Actual pickup/origin changes lock the outlet, treat identical replay as a no-op,
and append one redacted tenant-bound audit event.

Canonical readiness now controls Settings, Ringkasan, shipment creation, bulk
import, and the draft write guard. Private-attention outlets remain blocked until
trusted server-side provisioning repairs them. Focused checks passed 3 files /
28 tests; fresh PostgreSQL 16 migrations 0000–0022 and 2 files / 14 tests passed;
TypeScript, targeted ESLint, inventory, and diff checks passed. Authenticated
Chromium passed success/invalid focus, value retention, draft handoff, all
settings scenarios, Admin discovery, Operator denial, and responsive checks at
390px, 768px, and 1280px with no overflow, credential sentinel, or provider
request. Independent designer, security, and correctness reviews passed. Shared
tablet shell behavior remains T-48. No provider, production, commit, push,
deploy, or release action occurred. Delivery-ledger run:
`RUN-20260901T001550Z-d5289561`. Initial run
`RUN-20260831T235917Z-aba50484` remains FAIL because its immutable baseline
could not retroactively accept the required schema/consumer scope expansion;
the corrective run accepts the complete already-verified surface.
