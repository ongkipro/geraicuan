import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * WCAG 2.1 AA contrast, computed from the tokens rather than eyeballed.
 *
 * Browser screening found the failure this guards: `--destructive` carried
 * shadcn's default red while the design system defines its own `--danger`, and
 * the primitives tint with `bg-destructive/10 text-destructive`. That pairing
 * measured 3.99:1 on the destructive badge ("Kritis" on `/platform`,
 * "Admin terakhir" on `/app/anggota`) and the destructive button ("Arsipkan
 * kontak", "Tangguhkan tenant") — below the 4.5:1 AA floor for text that size.
 *
 * The token file is the only place the pairing can be fixed, so it is the
 * only place worth asserting. A browser sweep proves a rendered page; this
 * proves the palette cannot drift back between sweeps.
 */

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/**
 * The stylesheet, parsed rather than pattern-matched.
 *
 * Two earlier versions of this file used regular expressions and independent
 * review walked through both. An indented `  :root { }` appended at the end of
 * the file defeated `/(^|\n):root/`, and `@media (prefers-color-scheme: dark)
 * { :root { … } }` defeated everything, because a regex that finds a block by
 * looking for the next `}` cannot see into a nested one. Both shipped a real
 * regression: the browser resolved shadcn's red and a washed-out ring.
 *
 * This walks the file with brace matching, so nesting, indentation and at-rules
 * are structure rather than text. It is a small parser, not a complete one —
 * it does not resolve `@import`, and this stylesheet is the only input it is
 * asked about.
 */
type Rule = {
  /** Selector chain from the outermost at-rule inward, e.g. ["@media (…)", ":root"]. */
  readonly path: readonly string[];
  readonly selector: string;
  readonly declarations: ReadonlyMap<string, string>;
};

/** Declarations directly in a block body, ignoring anything inside a nested one. */
function declarationsOf(body: string) {
  let flat = "";
  let depth = 0;
  for (const char of body) {
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (depth === 0) flat += char;
  }
  const map = new Map<string, string>();
  for (const part of flat.split(";")) {
    const colon = part.indexOf(":");
    if (colon === -1) continue;
    const property = part.slice(0, colon).trim();
    if (!/^[-a-zA-Z][-a-zA-Z0-9]*$/.test(property)) continue;
    map.set(property, part.slice(colon + 1).trim());
  }
  return map;
}

function parseBlocks(body: string, path: readonly string[]): Rule[] {
  const rules: Rule[] = [];
  let index = 0;
  let start = 0;
  while (index < body.length) {
    if (body[index] !== "{") { index += 1; continue; }
    let depth = 1;
    let cursor = index + 1;
    while (cursor < body.length && depth > 0) {
      if (body[cursor] === "{") depth += 1;
      else if (body[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    // A selector runs from the previous statement boundary, not from the
    // previous block: `@custom-variant …;` sits between `}` and the next
    // `:root {`, and taking everything since the last `}` swallowed it, so no
    // rule matched `:root` at all and every token read as undefined.
    const preamble = body.slice(start, index);
    const selector = preamble.slice(preamble.lastIndexOf(";") + 1).trim();
    const inner = body.slice(index + 1, cursor - 1);
    const here = [...path, selector];
    rules.push({ path, selector, declarations: declarationsOf(inner) });
    if (inner.includes("{")) rules.push(...parseBlocks(inner, here));
    index = cursor;
    start = cursor;
  }
  return rules;
}

/** Comments stripped first: this stylesheet quotes its own rules, braces included. */
const parseCss = (source: string) =>
  parseBlocks(source.replace(/\/\*[\s\S]*?\*\//g, ""), []);

/**
 * Root custom properties, in cascade order, later declarations winning.
 *
 * Every rule that targets the document root counts — `:root`, `html`, `*`, and
 * compound forms like `:root.dark` — wherever it appears, including inside an
 * at-rule. Independent review shipped a working regression through two earlier
 * versions of this: an indented second `:root` at the end of the file, and a
 * `@media (prefers-color-scheme: dark)` block. Both are ordinary rules to a
 * parser and invisible to a pattern.
 */
const cssRules = parseCss(css);

/**
 * Does this rule apply on screen?
 *
 * `@media print` is not a screen context, so a rule wrapped in it is inert for
 * every user — independent review moved the one global focus rule into it and
 * the guard stayed green while the ring vanished from the whole application.
 * Anything else (a width query, a colour-scheme query, no query at all) can
 * apply, so it counts.
 */
const appliesOnScreen = (rule: Rule) =>
  ![...rule.path, rule.selector].some((part) => /@media[^{]*\bprint\b/.test(part));

/**
 * Does this rule set custom properties that reach the whole document?
 *
 * Custom properties inherit, so `body` reaches every element the primitives
 * render, and so does `*`. Matching only `:root` and `html` left
 * `body { --destructive: … }` free to restore shadcn's red with the guard
 * green — confirmed in a browser, not argued.
 */
/** Split on commas outside parens, brackets, and quoted strings.
 *
 * A plain `.split(",")` shreds the selector list inside `:is(:root, .foo)`
 * into `:is(:root` and `.foo)` — neither unwraps or matches — so that whole
 * rule went unseen. Tracking only paren depth repeats the same mistake for
 * `[data-x="a,b"]:root`: the comma sits inside a quoted attribute value, not
 * a selector list, and a paren-only tracker still splits there, breaking
 * `:root` off from its attribute selector so neither fragment matches.
 * Bracket depth and quote state are tracked for the same reason parens are. */
function splitTopLevel(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (char === "," && depth === 0) {
      parts.push(selector.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(selector.slice(start));
  return parts;
}

/**
 * Does this one compound selector (no combinators) set a custom property by
 * *inheritance* from the document root, or *directly* on the elements it
 * matches?
 *
 * The distinction matters because inheritance loses to a direct rule
 * regardless of which one is later in the file. `:root { --ring: red }` sets
 * a value every element inherits; `body { --ring: transparent }` sets the
 * property directly on `<body>` and everything under it, which overrides
 * whatever it would otherwise have inherited - independent review confirmed
 * this live and confirmed that treating token collection as "whichever
 * matching rule is textually last wins" is wrong whenever the two rules
 * target different real elements. `:root`/`html` are "root": read once at
 * the top and inherited down. `body`, `*`, and a bare `:not(...)` (matching
 * everything except what it negates - `:not(html)` reaches the entire
 * rendered page) are "direct": scoped narrower than the whole document,
 * `.foo:not(.bar)` does not qualify, which is why `:not` only counts here
 * when nothing precedes it in the compound.
 *
 * `html`/`body` are type selectors: CSS syntax only allows one at the very
 * start of a compound (`html[lang]`, never `[lang]html`), so anchoring `^` is
 * correct for those two, and for a leading `:not(...)`. `:root` is a
 * pseudo-class and may appear anywhere in the compound -
 * `[data-theme]:root` is exactly how a themed root is usually written - so it
 * is matched anywhere in `bare`, as a whole token so it cannot match inside a
 * longer pseudo-class name.
 */
type Cascade = "root" | "direct" | null;
function compoundCascade(bare: string): Cascade {
  if (/^html\b/.test(bare)) return "root";
  if (/^body\b/.test(bare)) return "direct";
  if (/^\*(?![\w-])/.test(bare)) return "direct";
  if (/^:not\(/.test(bare)) return "direct";
  if (/:root\b(?!-)/.test(bare)) return "root";
  return null;
}

/** Unwrap one layer of `:is(...)`/`:where(...)`, then re-split: the interior
 * is itself a selector list and may need the same treatment recursively. A
 * rule matches an element through whichever branch of the list applies to
 * it, so if any branch is "direct" the rule can act directly on some real
 * element even though another branch of the same list is merely "root". */
function unwrapCascade(part: string): Cascade {
  const bare = part.trim();
  const own = compoundCascade(bare);
  if (own) return own;
  const wrapped = bare.match(/^:(?:where|is)\((.*)\)$/);
  if (!wrapped) return null;
  const branches = splitTopLevel(wrapped[1]).map(unwrapCascade);
  if (branches.includes("direct")) return "direct";
  if (branches.includes("root")) return "root";
  return null;
}

function ruleCascade(selector: string): Cascade {
  const branches = splitTopLevel(selector).map(unwrapCascade);
  if (branches.includes("direct")) return "direct";
  if (branches.includes("root")) return "root";
  return null;
}

// Root-level values first, direct-level values layered on top so they always
// win regardless of which appears later in the file - a full CSS specificity
// model is out of scope, and this file has no competing rules within either
// level for the same property, so source order deciding ties within a level
// is sufficient.
const rootTokens = new Map<string, string>();
const directTokens = new Map<string, string>();
for (const rule of cssRules) {
  if (!appliesOnScreen(rule)) continue;
  const cascade = ruleCascade(rule.selector);
  if (!cascade) continue;
  const target = cascade === "direct" ? directTokens : rootTokens;
  for (const [property, value] of rule.declarations) {
    if (property.startsWith("--")) target.set(property, value);
  }
}
const tokens = new Map<string, string>([...rootTokens, ...directTokens]);

it("imports no stylesheet this guard cannot see", () => {
  // The parser does not resolve `@import`, so anything imported is invisible to
  // every assertion below. The three the file carries are known; a fourth would
  // silently take the palette out of scope.
  // Any @import spelling — quoted, or url("…") — not just the one this file
  // happens to use. An import this pattern misses is invisible to the parser
  // and could carry an unseen palette.
  const imports = [...css.matchAll(/^@import\s+(?:url\()?"([^"]+)"\)?/gm)].map((m) => m[1]);
  expect(imports).toEqual(["tailwindcss", "tw-animate-css", "shadcn/tailwind.css"]);
});

type Rgb = { r: number; g: number; b: number };

function resolve(value: string, depth = 0, scope: ReadonlyMap<string, string> = tokens): string {
  if (depth > 8) throw new Error(`token cycle at ${value}`);
  const reference = value.match(/^var\((--[a-z0-9-]+)\)$/);
  if (!reference) return value;
  const target = scope.get(reference[1]);
  if (!target) throw new Error(`undefined token ${reference[1]}`);
  return resolve(target, depth + 1, scope);
}

/** oklab -> linear sRGB, per the CSS Color 4 conversion matrices. */
function oklabToLinear(L: number, a: number, b: number) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

const encode = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, c * 255));
};

// A handful of CSS keywords a mutated declaration could plausibly use. Not
// exhaustive by design: an unrecognised value fails the check that calls
// parse() rather than passing it, so a real gap here is loud, not silent.
const NAMED: Record<string, Rgb> = {
  white: { r: 255, g: 255, b: 255 },
  black: { r: 0, g: 0, b: 0 },
  red: { r: 255, g: 0, b: 0 },
  gray: { r: 128, g: 128, b: 128 },
  grey: { r: 128, g: 128, b: 128 },
  silver: { r: 192, g: 192, b: 192 },
};

function parse(raw: string, scope: ReadonlyMap<string, string> = tokens): Rgb {
  const value = resolve(raw, 0, scope).trim();

  const named = NAMED[value.toLowerCase()];
  if (named) return named;

  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  const oklch = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (oklch) {
    const [L, C, H] = [Number(oklch[1]), Number(oklch[2]), Number(oklch[3])];
    const rad = (H * Math.PI) / 180;
    const linear = oklabToLinear(L, C * Math.cos(rad), C * Math.sin(rad));
    return { r: encode(linear.r), g: encode(linear.g), b: encode(linear.b) };
  }

  const rgbFn = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+[\d.]+%?)?\s*\)$/i);
  if (rgbFn) {
    return { r: Number(rgbFn[1]), g: Number(rgbFn[2]), b: Number(rgbFn[3]) };
  }

  // Only the two-argument, unweighted form the design system actually writes
  // (globals.css's own \`color-mix(in srgb,var(--hairline),transparent 12%)\`
  // shape, generalised to two opaque colours at a stated percentage of the
  // first). Anything more exotic falls through to the throw below.
  const mix = value.match(/^color-mix\(\s*in\s+\w+\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)\s*\)$/i);
  if (mix) {
    const a = parse(mix[1], scope);
    const b = parse(mix[3], scope);
    const p = Number(mix[2]) / 100;
    return {
      r: a.r * p + b.r * (1 - p),
      g: a.g * p + b.g * (1 - p),
      b: a.b * p + b.b * (1 - p),
    };
  }

  throw new Error(`unsupported colour syntax: ${value}`);
}

/** Tailwind's `/10` modifier: the colour at 10% alpha, composited on `on`. */
const tint = (color: Rgb, on: Rgb, alpha: number): Rgb => ({
  r: color.r * alpha + on.r * (1 - alpha),
  g: color.g * alpha + on.g * (1 - alpha),
  b: color.b * alpha + on.b * (1 - alpha),
});

/** HSL hue in degrees; achromatic colours report NaN so a grey ramp cannot pass a spread check. */
function hueOf({ r, g, b }: Rgb) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 8) return Number.NaN;
  let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

function luminance({ r, g, b }: Rgb) {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

const token = (name: string) => parse(tokens.get(name) ?? `missing ${name}`);

describe("design token contrast", () => {
  it("converts a known colour correctly", () => {
    // Guards the conversion itself: without this the whole file could pass by
    // computing nonsense. White and the design-system red are both known.
    const round = ({ r, g, b }: Rgb) => ({ r: Math.round(r), g: Math.round(g), b: Math.round(b) });
    expect(round(parse("oklch(1 0 0)"))).toEqual({ r: 255, g: 255, b: 255 });
    // shadcn's default red, the value this token used to carry.
    expect(round(parse("oklch(0.577 0.245 27.325)"))).toEqual({ r: 231, g: 0, b: 11 });
    expect(round(parse("#b42318"))).toEqual({ r: 180, g: 35, b: 24 });
    expect(contrast({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 })).toBe(21);
  });

  it("meets AA for every semantic status colour on its own surface", () => {
    for (const [ink, surface] of [
      ["--danger", "--danger-surface"],
      ["--ok", "--ok-surface"],
      ["--warn", "--warn-surface"],
    ] as const) {
      expect(contrast(token(ink), token(surface)), `${ink} on ${surface}`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  it("meets AA where the primitives tint destructive over a card", () => {
    // `bg-destructive/10 text-destructive` in badge.tsx and button.tsx. The
    // badge renders at 12px and the button label at 14px, so neither qualifies
    // as large text and both need the full 4.5:1.
    const destructive = token("--destructive");
    const card = token("--card");
    expect(contrast(destructive, tint(destructive, card, 0.1)))
      .toBeGreaterThanOrEqual(4.5);

    // The hover state darkens the tint, which only helps, but assert it so a
    // future variant change cannot quietly invert the relationship.
    expect(contrast(destructive, tint(destructive, card, 0.2)))
      .toBeGreaterThanOrEqual(4.5);
  });

  it("meets AA for body and muted text on every ground they sit on", () => {
    for (const ink of ["--ink", "--ink-muted"] as const) {
      for (const ground of ["--canvas", "--surface", "--surface-sunken", "--table-stripe"] as const) {
        expect(contrast(token(ink), token(ground)), `${ink} on ${ground}`)
          .toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  /**
   * T-172 review: a pinned first column carries `bg-inherit` so it tracks the row
   * it sits in. `even:bg-muted/40` made that inherited value translucent, and the
   * cells scrolling underneath a pinned column showed through it on every second
   * row. Every fill a row can take must therefore be opaque, and the stripe must
   * still differ from the card or the striping is decoration with no effect.
   */
  it("gives table rows only opaque fills that a pinned cell can inherit", () => {
    const table = readFileSync(join(process.cwd(), "src/components/ui/table.tsx"), "utf8");
    // Every element a pinned cell can inherit from, not only TableRow: the footer
    // is a row too, and it shipped `bg-muted/50` while nothing used it yet.
    const fills = ["TableRow", "TableFooter", "TableHeader"].flatMap((name) => {
      const body = table.match(new RegExp(`function ${name}[\\s\\S]*?\\n}`))?.[0];
      expect(body, `${name} source`).toBeTruthy();
      // `[...]` must be inside the character class or Tailwind's arbitrary-value
      // syntax (`bg-[oklch(0.97_0_0_/_0.4)]`) is never captured at all, and the
      // alpha hiding inside it goes unseen.
      return (body!.match(/bg-[\w.,%[\]()/_-]+/g) ?? []).map((fill) => `${name}: ${fill}`);
    });
    expect(fills.length, "table fills found").toBeGreaterThan(2);
    for (const fill of fills) {
      expect(fill, "a row fill a pinned cell inherits must be opaque")
        .not.toMatch(/\/|transparent/);
    }
    // The same fill can be moved into the CSS module, out of reach of the classes.
    // T-209: the v3 table has no CSS module; when one exists again its fills are held to the same rule.
    const tableModulePath = join(process.cwd(), "src/components/ui/table.module.css");
    const tableModuleCss = existsSync(tableModulePath) ? readFileSync(tableModulePath, "utf8") : "";
    for (const declaration of tableModuleCss.match(/background(?:-color)?:[^;]+;/g) ?? []) {
      expect(declaration, "a module row fill must be opaque")
        .not.toMatch(/transparent|\/\s*[0-9.]+%?\s*\)|rgba\(|hsla\(/);
    }

    const darkScope = new Map(tokens);
    for (const rule of cssRules.filter((r) => r.selector === ".dark" && appliesOnScreen(r))) {
      for (const [property, value] of rule.declarations) {
        if (property.startsWith("--")) darkScope.set(property, value);
      }
    }
    for (const [scheme, scope] of [["light", tokens], ["dark", darkScope]] as const) {
      const raw = scope.get("--table-stripe");
      expect(raw, `${scheme} --table-stripe`).toBeTruthy();
      // An alpha channel is exactly the defect: `oklch(… / 40%)`, `#rrggbbaa`,
      // `transparent`, or a `color-mix` that keeps one.
      expect(raw, `${scheme} --table-stripe must be opaque`)
        .not.toMatch(/\/|transparent|color-mix|^#(?:[0-9a-f]{4}|[0-9a-f]{8})$/i);
      expect(parse(raw!, scope), "an invisible stripe is not a stripe")
        .not.toEqual(parse("var(--surface)", scope));
    }
  });

  it("keeps the essential analytics line strokes visible on the chart surface", () => {
    for (const stroke of ["--chart-4", "--chart-2"]) {
      expect(contrast(token(stroke), token("--card")), stroke).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the chart ramp categorical: series differ by hue, not only by lightness", () => {
    // Spec 10/19 promise a colour-blind-safe (Okabe-Ito) ramp. Phase 13 briefly
    // shipped the preset single-hue blue ramp, whose five series sat within
    // ~14 degrees of each other and differed only in lightness — still green on
    // the 3:1 check above. Hue is measured, so a lightness-only ramp fails.
    const hues = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"].map((name) => hueOf(token(name)));
    // No 90-degree sector may hold every series.
    const sorted = [...hues].sort((a, b) => a - b);
    const largestGap = Math.max(...sorted.map((hue, i) => (i === 0 ? hue + 360 - sorted.at(-1)! : hue - sorted[i - 1])));
    expect(360 - largestGap, "hue spread of --chart-1..5").toBeGreaterThanOrEqual(90);
    // The two essential trend strokes (created vs issued) are far apart in hue.
    expect(hueDistance(hueOf(token("--chart-4")), hueOf(token("--chart-2"))), "--chart-4 vs --chart-2 hue")
      .toBeGreaterThanOrEqual(60);
  });

  it("meets AA for the one interactive accent, filled and as a link", () => {
    expect(contrast(token("--primary-foreground"), token("--primary"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--primary"), token("--canvas"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--accent-hover"), token("--canvas"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--accent-foreground"), token("--accent"))).toBeGreaterThanOrEqual(4.5);
    // `hover:bg-primary-hover` on the default button keeps its label.
    expect(contrast(token("--primary-foreground"), token("--primary-hover"))).toBeGreaterThanOrEqual(4.5);
  });

  it("shares the accepted brand navy between actions and sidebar navigation", () => {
    // v3.3 (D-22): GeraiCUAN brand navy replaces Mengantar blue.
    expect(token("--primary")).toEqual(parse("#0b2d4f"));
    for (const [sidebar, shared] of [
      ["--sidebar-primary", "--primary"],
      ["--sidebar-primary-foreground", "--primary-foreground"],
      // v3.2 (D-18): the current item is a white pill (card), not the accent tint.
      ["--sidebar-accent", "--card"],
      ["--sidebar-accent-foreground", "--accent-foreground"],
      ["--sidebar-ring", "--ring"],
    ] as const) {
      expect(token(sidebar), sidebar).toEqual(token(shared));
    }
    expect(contrast(token("--sidebar-accent-foreground"), token("--sidebar-accent")))
      .toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--sidebar-ring"), token("--sidebar"))).toBeGreaterThanOrEqual(3);
  });

  it("paints a focus ring that meets the 3:1 WCAG 1.4.11 asks of it", () => {
    // Nothing defined `--ring` at all, so the global rule
    // `:focus-visible { outline: 3px solid var(--ring) }` and every
    // `focus-visible:ring-ring/50` on the primitives resolved to an invalid
    // value. An invalid outline computes to `outline-style: none`, which also
    // suppresses the browser's own ring — keyboard focus was invisible on
    // every surface in the application.
    expect(tokens.get("--ring"), "--ring must be defined").toBeDefined();
    for (const ground of ["--canvas", "--surface", "--surface-sunken"] as const) {
      expect(contrast(token("--ring"), token(ground)), `--ring on ${ground}`)
        .toBeGreaterThanOrEqual(3);
    }

    // The rule that paints it, and the base-layer default it has to agree
    // with. The scaffold shipped `outline-ring/50`; that half-alpha ring
    // measures 2.4:1 on the canvas, so it cannot be the indicator.
    // The rule that paints it, found as a rule rather than as a line of text.
    const painter = cssRules.find(
      (rule) => rule.selector === ":focus-visible"
        && appliesOnScreen(rule)
        && /^2px solid var\(--ring\)$/.test(rule.declarations.get("outline") ?? ""),
    );
    expect(painter, "the base-layer native :focus-visible fallback").toBeDefined();

    // And nothing may switch the ring back off, by any of the properties that
    // make an outline invisible. Independent review turned it off three ways
    // past an earlier version of this check: `outline-width:0`,
    // `outline-color:transparent`, and `outline:none` on a narrower selector.
    // Whether a ring is visible is a measurement, not a list of spellings.
    // Independent review hid it three ways past an enumerated check:
    // `outline-width: 0.5px`, `outline-color: var(--canvas)` (a white ring on
    // the white canvas), and a `@media print` wrapper. Width and colour are
    // resolved and judged here instead.
    const invisible = (rule: Rule) => {
      const value = (name: string) => (rule.declarations.get(name) ?? "").trim();
      const shorthand = value("outline");
      const style = /\b(none|hidden)\b/.test(shorthand) || /^(?:none|hidden)$/.test(value("outline-style"));
      if (style) return "outline removed";

      // A bare `0` is a length too: matching only `Npx` let `outline-width: 0`
      // through after this check was rewritten, a mutation an earlier version
      // had killed.
      const lengthOf = (text: string) => text.match(/(?:^|\s)(-?[\d.]+)(?:px)?(?:\s|$)/)?.[1];

      // `outline-width` also accepts the keywords `thin`/`medium`/`thick`
      // (which resolve to concrete browser pixel widths, not to a length
      // this file can parse as a number) and any other CSS length unit
      // (`em`, `rem`, `%`, ...), which this static parser cannot resolve to
      // pixels without the element's live cascade. Independent review found
      // that `lengthOf`, requiring a literal digit, silently treated both as
      // "no width found" and let `outline-width: thin` (≈1px) through as if
      // the ring were unconstrained. Every whitespace-separated token in the
      // shorthand or the longhand is checked instead of just the first
      // number: a keyword resolves to its browser pixel width, a plain
      // number or `Npx` resolves as before, and any other length unit is
      // unverifiable and fails closed rather than passing silently.
      const WIDTH_KEYWORD_PX: Record<string, number> = { thin: 1, medium: 3, thick: 5 };
      const OTHER_LENGTH_UNIT = /^-?[\d.]+(?:em|rem|ex|ch|pt|pc|cm|mm|in|q|vw|vh|vmin|vmax|%)$/i;
      const widthOf = (text: string): number | "unverifiable" | undefined => {
        for (const token of text.trim().split(/\s+/)) {
          const keyword = WIDTH_KEYWORD_PX[token.toLowerCase()];
          if (keyword !== undefined) return keyword;
          if (/^-?[\d.]+(?:px)?$/.test(token)) return Number(token.replace(/px$/, ""));
          if (OTHER_LENGTH_UNIT.test(token)) return "unverifiable";
        }
        return undefined;
      };
      const widthResolved = widthOf(shorthand) ?? widthOf(value("outline-width"));
      if (widthResolved === "unverifiable") {
        return `outline-width "${value("outline-width") || shorthand}" is not a pixel value this check can verify`;
      }
      if (widthResolved !== undefined && widthResolved < 2) return `outline ${widthResolved}px is not a visible ring`;

      // A large negative offset pulls the outline behind the element it is
      // meant to circle, drawn but never seen.
      const offsetText = lengthOf(value("outline-offset"));
      if (offsetText !== undefined && Number(offsetText) < -8) {
        return `outline-offset ${offsetText}px draws the ring off-screen`;
      }

      const colourText = value("outline-color")
        || shorthand.replace(/^[\d.]+px\s+\w+\s*/, "").trim();
      if (!colourText) return null;
      // `transparent` and a zero alpha are invisible by definition, and the
      // colour parser cannot represent them — swallowing its throw is how
      // `outline-color: transparent` slipped back past this check.
      if (/^transparent$/i.test(colourText) || /rgba?\([^)]*[,/]\s*0(?:\.0+)?\s*\)$/.test(colourText)) {
        return `outline colour ${colourText} is invisible`;
      }
      let colour: Rgb;
      // Fail closed: a colour syntax `parse()` cannot read is a gap in the
      // parser, not evidence the ring is fine. Swallowing this and returning
      // `null` is exactly how `outline-color: white` and `rgb(255 255 255)`
      // — a white ring on the white canvas — got past this check.
      try { colour = parse(colourText); }
      catch (error) { return `outline colour ${colourText} could not be verified (${(error as Error).message})`; }
      const worst = Math.min(
        ...(["--canvas", "--surface", "--surface-sunken"] as const)
          .map((ground) => contrast(colour, token(ground))),
      );
      return worst < 3 ? `outline colour ${colourText} measures ${worst}:1` : null;
    };
    // Any rule capable of drawing an outline on a focused element, not only
    // one whose selector spells `:focus-visible`. `:focus { outline: none }`
    // has equal specificity to the global rule and later source order, so it
    // wins outright — and it never contains the literal text this scan was
    // looking for.
    const suppressors = cssRules
      .filter((rule) => /:focus(?:-visible)?\b/.test(rule.selector) && appliesOnScreen(rule))
      .map((rule) => [rule.selector, invisible(rule)] as const)
      .filter(([, reason]) => reason !== null)
      .map(([selector, reason]) => `${selector}: ${reason}`);
    expect(suppressors).toEqual([]);

    // The base-layer default has to agree with it, at full alpha.
    expect(css.replace(/\/\*[\s\S]*?\*\//g, ""))
      .not.toMatch(/@apply[^;]*\boutline-ring\/\d+/);
  });

  it("includes the dark companion without automatic activation", () => {
    const dark = cssRules.find((rule) => rule.selector === ".dark");
    expect(dark).toBeDefined();
    expect(dark?.declarations.get("--background")).toBe("oklch(0.145 0 0)");
    // v3.3 (D-22): the light brand green keeps dark labels and links readable.
    expect(dark?.declarations.get("--primary")).toBe("#34d399");
    expect(dark?.declarations.get("--input")).toBe("oklch(1 0 0 / 15%)");
  });

  it("wires no mechanism that activates the dormant dark palette", () => {
    // Spec 10 keeps dark mode out of product scope: the `.dark` token block may
    // exist, but nothing may switch it on. An earlier guard forbade the block
    // outright (and caught `[data-theme]` and negated media queries); when the
    // block was accepted, the guard shrank to one `prefers-color-scheme` rule
    // check and stopped seeing class- or attribute-based activation. Every
    // activation route is checked here instead, in CSS and in source.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");

    // 1. Media activation, in any spelling — `(prefers-color-scheme: dark)`,
    //    `not all and (prefers-color-scheme: light)`, or inside a custom variant.
    expect(bare, "prefers-color-scheme in globals.css").not.toMatch(/prefers-color-scheme/);
    // 2. The `dark:` variant stays bound to the `.dark` class and nothing else.
    expect([...bare.matchAll(/@custom-variant\s+dark\b[^;{]*[;{]/g)].map((m) => m[0].replace(/\s+/g, " ")))
      .toEqual(["@custom-variant dark (&:is(.dark *));"]);
    // 3. Attribute activation and UA-level scheme switches.
    expect(bare, "data-theme selector").not.toMatch(/data-theme/);
    expect(bare, "light-dark()").not.toMatch(/light-dark\(/);
    expect(bare, "color-scheme: dark").not.toMatch(/color-scheme\s*:[^;}]*\bdark\b/);
    // 4. Only the dormant class carries `.dark`: `.dark` alone, or beside
    //    `:root` in the shared alias rule. `:not(.dark)`-style inversions and
    //    compounds that would apply without the class are refused.
    const darkSelectors = cssRules
      .filter((rule) => /\.dark\b/.test(rule.selector))
      .flatMap((rule) => splitTopLevel(rule.selector).map((part) => part.trim()))
      .filter((part) => part !== ":root" && part !== ".dark");
    expect(darkSelectors).toEqual([]);

    // 5. Source: nothing applies the class, sets a theme attribute, reads the
    //    system preference, or installs a theme provider.
    const sourceFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) sourceFiles.push(path);
      }
    };
    walk(join(process.cwd(), "src"));
    expect(sourceFiles.length, "source files scanned").toBeGreaterThan(20);
    const activators = [
      /data-theme/,
      /prefers-color-scheme/,
      /next-themes/,
      /colorScheme/,
      /classList\s*\.\s*(?:add|toggle|replace)\([^)]*["'`]dark["'`]/,
      // A literal class token `dark` in any string: `className="dark"`,
      // `cn("dark", …)`, `<html className="h-full dark">`. Tailwind `dark:`
      // variants and names like `text-dark` are not the class.
      /["'`](?:[^"'`\n]*\s)?dark(?:\s[^"'`\n]*)?["'`]/,
    ];
    const hits = sourceFiles.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return activators.filter((pattern) => pattern.test(text)).map((pattern) => `${file.slice(process.cwd().length + 1)}: ${pattern}`);
    });
    expect(hits).toEqual([]);
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
    expect(Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })).not.toContain("next-themes");
  });

  it("meets AA for text, destructive, accent, and focus ring in the dark palette", () => {
    // `.dark` layers over the root tokens: the semantic aliases (`--ink`,
    // `--canvas`, …) are `var()` references, so they resolve against the dark
    // values the moment the class applies. Measured, not assumed to mirror light.
    const dark = cssRules.filter((rule) => rule.selector === ".dark" && appliesOnScreen(rule));
    expect(dark.length, "a .dark rule").toBeGreaterThan(0);
    const scope = new Map(tokens);
    for (const rule of dark) {
      for (const [property, value] of rule.declarations) {
        if (property.startsWith("--")) scope.set(property, value);
      }
    }
    const darkToken = (name: string) => parse(scope.get(name) ?? `missing ${name}`, scope);
    const grounds = ["--canvas", "--surface", "--surface-sunken", "--table-stripe"] as const;

    for (const ink of ["--ink", "--ink-muted"] as const) {
      for (const ground of grounds) {
        expect(contrast(darkToken(ink), darkToken(ground)), `dark ${ink} on ${ground}`)
          .toBeGreaterThanOrEqual(4.5);
      }
    }
    // `dark:bg-destructive/20` in badge.tsx and button.tsx, and the /30 hover.
    const destructive = darkToken("--destructive");
    for (const alpha of [0.2, 0.3]) {
      expect(contrast(destructive, tint(destructive, darkToken("--card"), alpha)), `dark destructive /${alpha}`)
        .toBeGreaterThanOrEqual(4.5);
    }
    for (const fill of ["--primary", "--primary-hover"] as const) {
      expect(contrast(darkToken("--primary-foreground"), darkToken(fill)), `dark label on ${fill}`)
        .toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(darkToken("--primary"), darkToken("--canvas"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkToken("--accent-foreground"), darkToken("--accent"))).toBeGreaterThanOrEqual(4.5);
    for (const ground of grounds) {
      expect(contrast(darkToken("--ring"), darkToken(ground)), `dark --ring on ${ground}`)
        .toBeGreaterThanOrEqual(3);
    }
    for (const [sidebar, shared] of [
      ["--sidebar-primary", "--primary"],
      ["--sidebar-primary-foreground", "--primary-foreground"],
      // v3.2 (D-18): the current item is a white pill (card), not the accent tint.
      ["--sidebar-accent", "--card"],
      ["--sidebar-accent-foreground", "--accent-foreground"],
      ["--sidebar-ring", "--ring"],
    ] as const) {
      expect(darkToken(sidebar), `dark ${sidebar}`).toEqual(darkToken(shared));
    }
    expect(contrast(darkToken("--sidebar-accent-foreground"), darkToken("--sidebar-accent")))
      .toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkToken("--sidebar-ring"), darkToken("--sidebar"))).toBeGreaterThanOrEqual(3);
    for (const stroke of ["--chart-4", "--chart-2"]) {
      expect(contrast(darkToken(stroke), darkToken("--card")), `dark ${stroke}`).toBeGreaterThanOrEqual(3);
    }
  });
  // T-155: the CMS ground steps down so white cards read as cards, and one restrained
  // resting elevation exists. Both must stay defined in light and dark, and the ground
  // must keep the ink pairs the suite already measures.
  it("defines the sunken CMS ground and one resting elevation in both schemes", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    // T-228 (spec 10 v3.2 §2.1, D-18): the CMS ground is `--background`, Mengantar's #F2F4F8;
    // `--muted` is the neutral badge/skeleton fill, no longer the ground.
    expect(css).toMatch(/\[data-slot="sidebar-inset"\]\s*\{[^}]*background:\s*var\(--background\)/);
    // v3.3 (D-22): the GeraiCUAN brand ground.
    expect(token("--background")).toEqual(parse("#f8fafc"));
    // `:root, .dark {` at the top is the alias block; the dark palette is the standalone
    // `.dark {` rule further down.
    const darkIndex = css.indexOf("\n.dark {");
    const light = css.slice(0, darkIndex);
    const dark = css.slice(darkIndex);
    expect(light, "light elevation token").toMatch(/--elevation-resting:/);
    expect(dark, "dark elevation token").toMatch(/--elevation-resting:/);
    expect(css, "elevation exposed as a utility").toMatch(/--shadow-resting:\s*var\(--elevation-resting\)/);
  });

});
