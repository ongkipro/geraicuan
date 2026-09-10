#!/usr/bin/env bash
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
source scripts/ui-audit/env.integration.sh
F=src/app/globals.css
B="$(mktemp)"
cp "$F" "$B"; trap 'cp "$B" "$F"' EXIT
fails=0
run() { pnpm exec vitest run --config vitest.integration.config.mts tests/design-token-contrast.integration.test.ts >/dev/null 2>&1; }
check() { if run; then echo "SURVIVED: $1"; fails=$((fails+1)); else echo "killed:   $1"; fi; cp "$B" "$F"; }

# --- round 1's nine ----------------------------------------------------------
sed -i 's|^  --destructive:var(--danger);|  --destructive:oklch(0.577 0.245 27.325);|' "$F"
check 'r1: shadcn default red on --destructive'
sed -i 's|^  --ink-muted:var(--muted-foreground);|  --ink-muted:oklch(0.62 0.03 256.802);|' "$F"
check 'r1: muted text lightened past AA'
sed -i 's|^  --warn:#a15c07;|  --warn:#d9950e;|' "$F"
check 'r1: warn lightened past AA on its surface'
sed -i 's|^  --accent-hover:oklch(0.43 0.22 264);|  --accent-hover:oklch(0.72 0.16 264);|' "$F"
check 'r1: link hover lightened past AA'
printf '\n.dark { --background:oklch(0.2 0 0); }\n' >> "$F"
check 'r1: bare .dark palette'
sed -i 's|^  --ring:var(--accent);||' "$F"
check 'r1: --ring removed'
sed -i 's|^  --ring:var(--accent);|  --ring:oklch(0.85 0.02 256);|' "$F"
check 'r1: ring lightened past the 3:1 floor'
sed -i 's|@apply border-border outline-ring;|@apply border-border outline-ring/50;|' "$F"
check 'r1: half-alpha outline on the base layer'
sed -i 's|^:focus-visible { outline:3px solid var(--ring); outline-offset:2px; }||' "$F"
check 'r1: global focus-visible rule deleted'
printf '\n:root { --destructive:oklch(0.577 0.245 27.325); --ring:oklch(0.92 0.02 264); }\n' >> "$F"
check 'r1: second :root block at end of file'
printf '\n:root.dark { --background:oklch(0.2 0 0); }\n' >> "$F"
check 'r1: :root.dark palette'
printf '\nbutton:focus-visible, a:focus-visible { outline:none; }\n' >> "$F"
check 'r1: outline:none for buttons and links'
printf '\nhtml.dark { --canvas:oklch(0.2 0 0); }\n' >> "$F"
check 'r1: html.dark palette'

# --- the three review broke in round 2 ---------------------------------------
printf '\n  :root {\n    --destructive:oklch(0.577 0.245 27.325);\n    --ring:#dbe4ff;\n  }\n' >> "$F"
check 'r2: INDENTED second :root block at end of file'

printf '\n@media (prefers-color-scheme: dark) {\n  :root { --background:oklch(0.15 0 0); --foreground:oklch(0.55 0 0); --card:oklch(0.18 0 0); --ring:#2f3a56; }\n}\n' >> "$F"
check 'r2: dark palette via prefers-color-scheme'

printf '\n*:focus-visible { outline-width: 0; box-shadow: none; }\n' >> "$F"
check 'r2: focus ring switched off by outline-width:0'

printf '\n:focus-visible { outline-color: transparent; }\n' >> "$F"
check 'r2: focus ring switched off by outline-color:transparent'

# --- the eight review broke in round 3 ---------------------------------------
printf '\nbody { --destructive:oklch(0.577 0.245 27.325); }\n' >> "$F"
check 'r3: shadcn red via body, which custom properties inherit from'

printf '\nbody { --ink-muted:oklch(0.68 0.03 256); --muted-foreground:oklch(0.68 0.03 256); }\n' >> "$F"
check 'r3: muted ink lightened via body'

printf '\n:where(html) { --destructive:oklch(0.577 0.245 27.325); }\n' >> "$F"
check 'r3: shadcn red via :where(html)'

python3 - "$F" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
old=":focus-visible { outline:3px solid var(--ring); outline-offset:2px; }"
new="@media print {\n:focus-visible { outline:3px solid var(--ring); outline-offset:2px; }\n}"
assert old in s
open(p,'w').write(s.replace(old,new,1))
PY
check 'r3: the one focus rule moved into @media print'

printf '\n:focus-visible { outline-color: var(--canvas); }\n' >> "$F"
check 'r3: white ring on the white canvas'

printf '\n:focus-visible { outline-width:0.5px; outline-offset:-4px; }\n' >> "$F"
check 'r3: hairline ring at 0.5px'

printf '\n@media not all and (prefers-color-scheme: light) {\n  body { --background:oklch(0.15 0 0); --foreground:oklch(0.55 0 0); --canvas:oklch(0.15 0 0); }\n}\n' >> "$F"
check 'r3: dark palette via a negated colour-scheme query'

printf '\n[data-theme="dark"] { --background:oklch(0.15 0 0); --canvas:oklch(0.15 0 0); }\n' >> "$F"
check 'r3: dark palette via a data-theme selector'

sed -i '1i @import "./dark.css";' "$F"
check 'r3: palette moved into an unresolved @import'

# --- the round 4 review broke -------------------------------------------------
printf '\n:focus-visible { outline-color: white; }\n' >> "$F"
check 'r4: white ring on the white canvas, as a named colour'

printf '\n:focus-visible { outline-color: rgb(255 255 255); }\n' >> "$F"
check 'r4: white ring via rgb()'

printf '\n:focus { outline: none; }\n' >> "$F"
check 'r4: outline killed on :focus, not :focus-visible'

printf '\n:focus-visible { outline-offset: -9999px; }\n' >> "$F"
check 'r4: ring pulled off-screen by a large negative offset'

printf '\n:is(:root) { --destructive: oklch(0.577 0.245 27.325); }\n' >> "$F"
check 'r4: shadcn red via :is(:root)'

sed -i '1i @import url("./dark.css");' "$F"
check 'r4: palette moved into an @import written as url(...)'

# --- round 5 review broke ------------------------------------------------
printf '\n:is(:root, .never-matches-anything-zz) { --destructive: oklch(0.577 0.245 27.325); }\n' >> "$F"
check 'r5: shadcn red via a selector list nested inside :is()'

# --- round 6 review broke -------------------------------------------------
printf '\n[data-x="a,b"]:root { --destructive: oklch(0.577 0.245 27.325); }\n' >> "$F"
check 'r6: shadcn red via a comma inside a quoted attribute value'

# --- round 7 review broke -------------------------------------------------
# body sets --ring DIRECTLY on body and everything under it, which overrides
# whatever :root's own --ring would otherwise be inherited - regardless of
# which one sits later in the file. Inserted before :root's own declaration
# deliberately, so a naive "last rule in file wins" model would have let
# :root win and missed this.
python3 - "$F" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
marker = "  --accent-hover:oklch(0.43 0.22 264);"
assert marker in s
open(p,'w').write(s.replace(marker, "body { --ring: transparent; }\n" + marker, 1))
PY
check 'r7: --ring overridden by a body rule placed before :root sets it'

printf '\n:not(html) { --destructive: oklch(0.577 0.245 27.325); }\n' >> "$F"
check 'r7: shadcn red via :not(html), matching every rendered element but html itself'

# --- round 9 review broke -------------------------------------------------
# lengthOf required a literal digit, so a CSS width KEYWORD (thin/medium/
# thick) silently read as "no width found" rather than as the ~1px it
# resolves to in the browser. .cms-main is the real, live CMS shell wrapper.
printf '\n.cms-main a:focus-visible { outline-width: thin; }\n' >> "$F"
check 'r9: focus ring narrowed via the outline-width keyword "thin" instead of a px number'

# --- round 13 review broke -------------------------------------------------
# Round 13 found the "N mutations, all killed" count was not proof the whole
# assertion surface was ever exercised: several individual token pairs inside
# these describe blocks had zero mutation across every prior round, even
# though the guard itself, tested live, catches a break of each one. One
# mutation per previously-untested pair, isolating each token from every
# other token it aliases (`--accent`, `--ink`, `--surface-sunken` are
# themselves `var()` indirections onto shadcn primitives; overriding the
# alias directly breaks only the named pair, not every consumer of the
# primitive underneath it).
printf '\n:root { --danger: #e8a29c; }\n' >> "$F"
check 'r13: --danger lightened past AA on --danger-surface'

printf '\n:root { --ok: #8fd9b8; }\n' >> "$F"
check 'r13: --ok lightened past AA on --ok-surface'

printf '\n:root { --primary-foreground: oklch(0.6 0 0); }\n' >> "$F"
check 'r13: --primary-foreground darkened past AA on --primary'

printf '\n:root { --accent: oklch(0.9 0.02 264); }\n' >> "$F"
check 'r13: --accent lightened past AA on --canvas, independent of --accent-hover'

printf '\n:root { --ink: oklch(0.75 0 0); }\n' >> "$F"
check 'r13: --ink (not --ink-muted) lightened past AA'

# --ink-muted's own value was already mutated in round 1, but that mutation
# breaks every ground in the loop at once and the loop stops at the first
# failure (--canvas) — never proving --surface or --surface-sunken are
# independently caught. Mutating the ground instead of the ink isolates
# exactly that: --canvas is untouched, so only the --surface-sunken pairing
# can be what fails.
printf '\n:root { --surface-sunken: oklch(0.64 0.03 256.802); }\n' >> "$F"
check 'r13: --surface-sunken darkened toward --ink-muted, breaking that pair specifically'

if run; then echo "baseline: PASS"; else echo "baseline: FAIL"; fails=$((fails+1)); fi
exit $fails
