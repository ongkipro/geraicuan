import { readFileSync } from "node:fs";
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
const targetsRoot = (selector: string) =>
  selector.split(",").some((part) => /^(?::root\b|html\b|\*)/.test(part.trim()));
const tokens = new Map<string, string>();
for (const rule of cssRules) {
  if (!targetsRoot(rule.selector)) continue;
  for (const [property, value] of rule.declarations) {
    if (property.startsWith("--")) tokens.set(property, value);
  }
}

type Rgb = { r: number; g: number; b: number };

function resolve(value: string, depth = 0): string {
  if (depth > 8) throw new Error(`token cycle at ${value}`);
  const reference = value.match(/^var\((--[a-z0-9-]+)\)$/);
  if (!reference) return value;
  const target = tokens.get(reference[1]);
  if (!target) throw new Error(`undefined token ${reference[1]}`);
  return resolve(target, depth + 1);
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

function parse(raw: string): Rgb {
  const value = resolve(raw);

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

  throw new Error(`unsupported colour syntax: ${value}`);
}

/** Tailwind's `/10` modifier: the colour at 10% alpha, composited on `on`. */
const tint = (color: Rgb, on: Rgb, alpha: number): Rgb => ({
  r: color.r * alpha + on.r * (1 - alpha),
  g: color.g * alpha + on.g * (1 - alpha),
  b: color.b * alpha + on.b * (1 - alpha),
});

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
      for (const ground of ["--canvas", "--surface", "--surface-sunken"] as const) {
        expect(contrast(token(ink), token(ground)), `${ink} on ${ground}`)
          .toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("meets AA for the one interactive accent, filled and as a link", () => {
    expect(contrast(token("--primary-foreground"), token("--primary"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--accent"), token("--canvas"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--accent-hover"), token("--canvas"))).toBeGreaterThanOrEqual(4.5);
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
        && /^3px solid var\(--ring\)$/.test(rule.declarations.get("outline") ?? ""),
    );
    expect(painter, "the global :focus-visible outline rule").toBeDefined();

    // And nothing may switch the ring back off, by any of the properties that
    // make an outline invisible. Independent review turned it off three ways
    // past an earlier version of this check: `outline-width:0`,
    // `outline-color:transparent`, and `outline:none` on a narrower selector.
    const invisible = (rule: Rule) => {
      const value = (name: string) => (rule.declarations.get(name) ?? "").trim();
      const shorthand = value("outline");
      return /^(?:none|0|0px)\b/.test(shorthand)
        || /\btransparent\b/.test(shorthand)
        || value("outline-style") === "none"
        || /^0(?:px)?$/.test(value("outline-width"))
        || /^(?:transparent|rgba?\([^)]*,\s*0\s*\))$/.test(value("outline-color"));
    };
    const suppressors = cssRules
      .filter((rule) => rule.selector.includes(":focus-visible") && invisible(rule))
      .map((rule) => rule.selector);
    expect(suppressors).toEqual([]);

    // The base-layer default has to agree with it, at full alpha.
    expect(css.replace(/\/\*[\s\S]*?\*\//g, ""))
      .not.toMatch(/@apply[^;]*\boutline-ring\/\d+/);
  });

  it("ships no dark theme, which the design system puts out of MVP scope", () => {
    // `docs/spec/10-DESIGN-SYSTEM-WHITELABEL.md`: "Dark mode is out of scope
    // for MVP" and "Do not use ... speculative dark mode". Nothing adds the
    // `.dark` class and no `.dark` token block exists, so the `dark:`
    // utilities the vendored shadcn primitives carry never match. Asserted so
    // a half-finished dark palette cannot appear without a decision: adding
    // one means screening every pairing above a second time.
    // Two shapes, both of which independent review shipped past earlier
    // versions of this check: a selector carrying `.dark` anywhere, and a
    // `prefers-color-scheme: dark` at-rule redefining the palette. The second
    // is the more common spelling and bypasses every assertion above it.
    const darkSelectors = cssRules
      .filter((rule) => !rule.selector.startsWith("@") && /\.dark\b/.test(rule.selector))
      .map((rule) => rule.selector);
    expect(darkSelectors).toEqual([]);

    const darkMedia = cssRules
      .filter((rule) => [...rule.path, rule.selector]
        .some((part) => /@media[^{]*prefers-color-scheme\s*:\s*dark/.test(part)))
      .filter((rule) => [...rule.declarations.keys()].some((name) => name.startsWith("--")))
      .map((rule) => [...rule.path, rule.selector].join(" > "));
    expect(darkMedia).toEqual([]);
  });
});
