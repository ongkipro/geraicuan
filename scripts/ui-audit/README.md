# UI audit scripts

Browser-driven verification for T-77 (comprehensive UI/UX, typography, and
multi-viewport screening) and every task after it that touches rendered CMS
surfaces. See root `README.md`'s "Browser-based UI audit" section for how to
run it, and `TASKS.md`/`BUILD-LOG.md` (search "T-77 review round") for the
defects each check was written to catch and why.

**Why this exists as a committed script tree rather than one-off browser
checks:** independent review (round 11) found that ten prior rounds of this
audit had produced real, browser-confirmed evidence entirely from an
AI session's ephemeral scratchpad — nothing that produced that evidence
survived the session, so a future contributor reintroducing a fixed defect
(for example, round 3's translucent sticky column) would see `tsc`, `lint`,
`test:integration`, and `next build` all pass, because none of those commands
ever exercised computed style in a real browser. This directory is the fix:
the same instrument, committed, wired to `pnpm test:ui-audit`.

## Files

- `cdp.mjs` — minimal dependency-free Chrome DevTools Protocol driver (Node's
  global `WebSocket` + `fetch`, no puppeteer/playwright dependency).
- `start-chrome.sh` — starts a headless Chrome with CDP if one isn't already
  reachable on `CDP_PORT`. Idempotent.
- `probe.mjs` — the shared measurement: contrast (WCAG AA/1.4.11), keyboard
  focus rings, heading hierarchy, prose width, sticky-column opacity on
  hover, layout/gutters, and more. Exported as a single `PROBE` template
  string, evaluated in-page via CDP. Every other script here imports it, so
  a probe fix lands once for every consumer.
- `probe-lint.mjs` — lints every template-literal export in `probe.mjs` for
  the two ways it has silently broken before: a stray backtick inside a
  comment ending the template early, and a single backslash in a regex class
  (`\d`, `\s`) that a template literal swallows to a bare letter.
- `contrast-selftest.mjs` — proves the shared probe still binds: injects a
  known contrast failure and a known missing-focus-ring failure into a real
  page and asserts the probe catches both, plus a regression case (twenty
  offscreen links) proving the focus check examines elements well past
  position 14 (see round 10).
- `sweep.mjs` — the full orchestrator: 69 route/viewport pairs plus 300+
  scenario/viewport pairs declared in `scenarios.json`, reporting aggregate
  findings.
- `scenarios.json` — a snapshot of the scenario/state declarations from
  `src/lib/ui-audit-scenario.ts` (`UI_AUDIT_SCENARIO_CONTRACTS` and related
  exports), in the flat shape `sweep.mjs` consumes. **This is hand-maintained,
  not generated** — `.mjs` scripts here run under plain `node` with no
  TypeScript loader, and the exporting module pulls in `server-only`, which
  throws when imported outside a Server Component. If a scenario is added,
  renamed, or removed in `src/lib/ui-audit-scenario.ts`, update this file to
  match by hand; `sweep.mjs`'s own coverage assertions (`run.sh` fails if the
  route-pair or scenario-pair count moves) are the tripwire that should catch
  the two files drifting apart.
- `rts-a11y.mjs` — a few RTS-specific assertions (`/app/pengiriman/rts`)
  the general sweep does not carry: document overflow, scroll-region
  labelling/reachability, filter nav landmark, the retired truncated-ID line
  staying gone, and exactly one current-page vs. one active-filter marker.
- `sticky-check.mjs`, `kontak-check.mjs` — single-page evidence scripts for
  the sticky-column opacity check, used by `mutate-sticky.sh`.
- `run.sh` — the top-level gate: re-seeds the demo DB, lints the probe, runs
  the selftest, runs the full sweep, runs the RTS a11y check, and fails
  loudly on any coverage shrinkage, finding, console error, or scenario that
  rendered indistinguishably from its base route.
- `mutate-page.sh` — mutation suite (19 mutations) against
  `tests/rts-presentation.integration.test.ts`'s page guard.
- `mutate-tokens.sh` — mutation suite (43 mutations) against
  `tests/design-token-contrast.integration.test.ts`'s token/contrast guard.
- `mutate-sticky.sh` — mutation suite (8 mutations, across
  `src/app/app/pengiriman/rts/page.tsx`, `src/app/globals.css`, and
  `src/app/app/kontak/contact-directory-browser.tsx`) against the sticky
  probe inside `probe.mjs`. Needs the dev server and demo seed.
- `mutate-outlet-settings.sh` — mutation suite (1 mutation) against
  `tests/outlet-settings-page.integration.test.ts`'s aria-current guard.
- `probe-coverage-selftest.mjs` — proves the probe checks that
  `contrast-selftest.mjs` and `sticky-check.mjs` don't already cover
  (heading hierarchy, card titles as headings, image alt text, tablist
  links, nested cards, target size, unreachable scroll regions, prose
  width) each catch a live-injected violation. Round 14 found these
  measurements existed and were summed into the sweep's headline numbers
  but had never once been deliberately triggered and confirmed caught.
- `env.dev.sh`, `env.integration.sh` — thin wrappers around the two env
  blocks root `README.md` already documents, so these scripts don't retype
  them. Both require `POSTGRES_PASSWORD` to already be exported.

## What this does not cover

`.output/` (gitignored) holds run artifacts — screenshots and the raw sweep
JSON — for inspection after a run; nothing reads them back as input. A stale
Chrome profile at the default `/tmp/geraicuan-ui-audit-chrome-profile` is
safe to delete if `start-chrome.sh` ever needs a clean start. If Chrome
accumulates leaked tabs across many runs (each script closes its own tab on
success; a crash mid-script can leak one), the browser can get slow enough to
produce spurious failures unrelated to code — check
`curl -s http://127.0.0.1:9411/json/list | python3 -c "import json,sys;print(len(json.load(sys.stdin)))"`
and close stale tabs via `/json/close/<id>` if that count climbs unexpectedly.
