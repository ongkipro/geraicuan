// The measurement itself, shared by the route sweep and the state sweep.
// Kept in one place so a probe fix cannot land in one sweep and not the other.
// The design system caps description prose at max-w-2xl.
const PROSE_CAP_PX = 672;

export const PROBE = `JSON.stringify((() => {
  const PROSE_CAP_PX = ${PROSE_CAP_PX};
  const de = document.documentElement;

  // --- colour helpers -------------------------------------------------
  // Tailwind v4 emits oklch and Chrome reports computed colour as lab(), so an
  // rgb()-only parser inspects almost nothing and certifies a sweep it never
  // performed. A canvas accepts every syntax the engine itself accepts.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const parse = (css) => {
    if (!css || css === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    ctx.globalCompositeOperation = 'copy';
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]; return (hi + 0.05) / (lo + 0.05); };
  const backdrop = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg.a > 0) { stack.push(bg); if (bg.a === 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  };

  // --- layout and landmarks -------------------------------------------
  const overflow = de.scrollWidth - de.clientWidth;
  const wide = [...document.querySelectorAll('*')]
    .filter(e => e.scrollWidth > de.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible')
    .slice(0, 3).map(e => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : ''));
  const mains = document.querySelectorAll('main').length;
  const current = [...document.querySelectorAll('[aria-current="page"]')].filter(visible).length;
  // A horizontally scrolling container has to be announced and reachable. It
  // is announced by a label, and reachable either by its own tab stop or by
  // tabbing through focusable content inside it — a strip of links scrolls
  // itself into view natively, a table of static cells does not. Reporting the
  // element identity as well: an earlier run flagged a count with no way to
  // tell which of two nested containers it meant.
  const unreachableScroll = [...document.querySelectorAll('*')]
    .filter(e => getComputedStyle(e).overflowX === 'auto' && e.scrollWidth > e.clientWidth + 1)
    .filter(e => {
      const announced = e.getAttribute('aria-label') || e.getAttribute('aria-labelledby')
        || e.getAttribute('role') === 'region';
      const reachable = e.tabIndex >= 0
        || e.querySelector('a[href], button, input, select, textarea, [tabindex="0"]');
      return !announced || !reachable;
    })
    .map(e => e.tagName.toLowerCase()
      + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ').slice(0, 2).join('.') : '')
      + (e.getAttribute('aria-label') ? ' labelled' : ' unlabelled')
      + (e.tabIndex >= 0 ? ' focusable' : ' not-focusable'));
  const unlabelledScroll = unreachableScroll.length;
  const imgNoAlt = [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).length;
  const tablistLinks = [...document.querySelectorAll('[role="tablist"]')].filter(t => t.querySelector('a[href]')).length;
  const cards = document.querySelectorAll('[data-slot="card"]').length;
  const nestedCards = document.querySelectorAll('[data-slot="card"] [data-slot="card"]').length;

  // --- heading hierarchy ----------------------------------------------
  // Exactly one h1, and no skipped level. A page whose section titles are divs
  // has no outline below its h1; a page that jumps h1 -> h3 announces a
  // subsection that has no section.
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter(visible).map(h => ({ level: Number(h.tagName[1]), text: h.textContent.trim().slice(0, 30) }));
  const h1 = headings.filter(h => h.level === 1).length;
  const headingSkips = [];
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) {
      headingSkips.push('h' + headings[i - 1].level + ' -> h' + headings[i].level + ' at "' + headings[i].text + '"');
    }
  }
  // Section titles rendered as a div rather than a heading: a card that has a
  // title but contributes nothing to the outline.
  const titlesNotHeadings = [...document.querySelectorAll('[data-slot="card-title"]')]
    .filter(visible)
    .filter(el => !/^H[1-6]$/.test(el.tagName) && !el.getAttribute('role'))
    .map(el => el.textContent.trim().slice(0, 28));

  // --- line length ------------------------------------------------------
  // Prose wider than about 95 characters is the readability limit the design
  // contract asks about. Measured from the rendered box and the font metrics
  // rather than guessed from a class name.
  const longLines = [];
  for (const el of document.querySelectorAll('p, li, dd')) {
    if (!visible(el)) continue;
    // Prose only. textContent on a container concatenates its descendants,
    // so a two-column list row measures as one long "line" that no reader ever
    // sees. Require the element's own direct text to be the bulk of it.
    const own = [...el.childNodes]
      .filter(n => n.nodeType === 3).map(n => n.nodeValue).join('').trim();
    const text = (el.textContent || '').trim();
    if (own.length < text.length * 0.8) continue;
    if (text.length < 90) continue;
    const cs = getComputedStyle(el);
    ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    // Measured in CSS ch, the advance of "0" — the unit the 45-75 readability
    // guideline is normally expressed in, and the one max-w-prose (65ch) uses.
    // Dividing by the average character width of the element's own text gives
    // a different, larger number because spaces and lowercase pull the average
    // down; that is a different metric, not a stricter reading of this one.
    const per = ctx.measureText('0').width || parseFloat(cs.fontSize) * 0.5;
    const ch = el.getBoundingClientRect().width / per;
    // Measured against the design system's own cap in pixels, not in ch.
    // max-w-2xl is 672px, which is 72ch at 14px and 84ch at 12px - one ch
    // threshold cannot express one pixel cap across font sizes. An earlier
    // version used 105ch on the false belief that 672px was about 102ch; 102ch
    // was what uncapped prose measured, so the threshold sat above every
    // finding it was meant to catch.
    const width = el.getBoundingClientRect().width;
    if (width > PROSE_CAP_PX + 1) {
      longLines.push({ px: Math.round(width), ch: Math.round(ch), text: text.slice(0, 30) });
    }
  }

  // --- shell gutter and container tier ---------------------------------
  // The CMS shell carries 16/24/32px responsive gutters on .cms-main; the
  // public and auth pages are their own layouts. Read whichever exists rather
  // than reading main, which has no padding and reports 0 everywhere.
  // The CMS shell carries its gutter on .cms-main; the public page carries the
  // same 16/24/32 rhythm on its own centred containers, and the auth page is a
  // centred card with page padding. Reading main instead reports 0 on all of
  // them, which is the probe's answer rather than the page's.
  // The auth page is a centred card on a plain ground, not a shell: it has one
  // fixed page padding at every width and no responsive gutter to check. It is
  // reported as its own kind rather than measured against the shell rhythm.
  const authPage = document.querySelector('.auth-page');
  const shell = document.querySelector('.cms-main')
    || document.querySelector('main [class*="mx-auto"][class*="px-"]')
    || authPage
    || document.querySelector('main');
  const gutterOf = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const l = Math.round(parseFloat(cs.paddingLeft));
    const r = Math.round(parseFloat(cs.paddingRight));
    return l === r ? l : l + '/' + r;
  };
  const gutter = gutterOf(shell);
  const shellKind = document.querySelector('.cms-main') ? 'cms' : (authPage ? 'auth' : 'page');
  // PageContainer tiers: wide 80rem, data 72rem, standard 64rem, form 56rem.
  // PageContainer is the centred one; a bare max-w- match picks up the first
  // tooltip or truncation cap on the page and reports 160px everywhere.
  const tierEl = document.querySelector('main [class*="mx-auto"][class*="max-w-"]');
  const tier = tierEl ? Math.round(parseFloat(getComputedStyle(tierEl).maxWidth)) : null;

  // --- target size (WCAG 2.5.8) -------------------------------------------
  // The normative exemptions, applied rather than approximated: a target is
  // exempt when it is inline in a sentence, and when 24px-diameter circles
  // centred on it and on every other target do not intersect (the spacing
  // exemption). A lone link in a table cell with room around it passes on
  // spacing; two adjacent 20px icon buttons do not. An earlier version of this
  // probe measured the raw under-24px count and then discarded it entirely,
  // which is worse than not measuring: 116 elements were counted and none
  // reached the verdict.
  // A control clipped to a pixel by the sr-only pattern is not a pointer
  // target: the import form hides its file input that way and drives it from a
  // 44px button. Excluding by rendered size rather than by class so any
  // spelling of the pattern is covered.
  const targets = [...document.querySelectorAll('a[href],button,input,select,[role="button"]')]
    .filter(visible)
    .map(e => ({ el: e, box: e.getBoundingClientRect() }))
    .filter(({ box }) => box.width > 2 && box.height > 2);
  const centre = ({ box }) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  const smallTargets = targets
    .filter(t => t.box.height < 24 || t.box.width < 24)
    .filter(({ el }) => {
      // Inline in a sentence.
      const parent = el.parentElement;
      if (!parent) return true;
      const inlineFlow = getComputedStyle(el).display.startsWith('inline');
      const siblingText = [...parent.childNodes]
        .some(n => n.nodeType === 3 && n.nodeValue.trim().length > 0);
      return !(inlineFlow && siblingText);
    })
    .filter((t) => {
      // Spacing exemption, as written: a 24px-diameter circle centred on the
      // undersized target must not intersect another target, nor the circle of
      // another undersized target. Centre-distance alone only covers the
      // second half, and would pass an undersized control tucked against a
      // large one.
      const a = centre(t);
      return targets.some((other) => {
        if (other.el === t.el || other.el.contains(t.el) || t.el.contains(other.el)) return false;
        const small = other.box.height < 24 || other.box.width < 24;
        if (small) {
          const b = centre(other);
          return Math.hypot(a.x - b.x, a.y - b.y) < 24;
        }
        // Circle (radius 12) against the other target's bounding box.
        const nx = Math.max(other.box.left, Math.min(a.x, other.box.right));
        const ny = Math.max(other.box.top, Math.min(a.y, other.box.bottom));
        return Math.hypot(a.x - nx, a.y - ny) < 12;
      });
    })
    .map(({ el, box }) => el.tagName.toLowerCase() + ':'
      + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 18)
      + ' ' + Math.round(box.width) + 'x' + Math.round(box.height));

  // A fingerprint of what is actually on screen, so a scenario that changed
  // nothing cannot be counted as screened. 56 of 312 scenario pairs were
  // byte-identical to their base route in an earlier sweep and reported as
  // covered.
  // Volatile text removed before hashing. These pages render clock-derived
  // strings, so two loads of the same page never produced the same digest and
  // the "scenario had no effect" check could not fire on any tenant route -
  // it only ever ran on the platform routes whose text happens to be stable.
  // Visible text only, and volatile text normalised out of it.
  //
  // document.body.textContent includes the contents of every <script>, so
  // this was hashing the RSC flight payload: a fresh self.__next_r nonce,
  // module ids and per-request UUIDs on every load. Two loads of the same page
  // therefore never agreed, and the "scenario had no effect" check could not
  // fire on any tenant route - it only ever ran where the payload happened to
  // be stable.
  //
  // Backslashes are doubled because this whole probe is a template literal and
  // a single one never reaches the browser; the original whitespace collapse
  // read as /s+/ and had been replacing the letter "s".
  const visibleText = [];
  {
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const el = node.parentElement;
        if (!el || /^(?:SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(el.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        return visible(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    for (let n = walk.nextNode(); n; n = walk.nextNode()) visibleText.push(n.nodeValue);
  }
  const fingerprint = visibleText.join(" ")
    .replace(/\\d{1,2}[.:]\\d{2}(?:[.:]\\d{2})?(?:\\s*WIB)?/g, "<time>")
    .replace(/\\d{1,2}\\s+\\w{3,}\\s+\\d{4}/g, "<date>")
    .replace(/\\d+\\s+(?:detik|menit|jam|hari)\\s+(?:yang\\s+)?lalu/gi, "<ago>")
    .replace(/\\s+/g, " ").trim();
  // A real hash of the whole text, not a length plus a prefix: two renders can
  // coincide on both, and one pair in 303 did - analytics-stale was reported as
  // having no effect when it demonstrably adds a staleness banner.
  let textHash = 5381;
  for (let i = 0; i < fingerprint.length; i++) textHash = ((textHash * 33) ^ fingerprint.charCodeAt(i)) >>> 0;
  const domDigest = textHash.toString(36) + ':' + fingerprint.length
    + ':' + document.querySelectorAll('tbody tr').length
    + ':' + document.querySelectorAll('[data-slot=\\'skeleton\\']').length;

  // --- sticky identifying column ---------------------------------------
  // The contract asks that a wide table scroll inside a labelled region with an
  // opaque sticky column. Only the region half was ever screened, and the table
  // this task rebuilt had no sticky column while the sibling queue it copied
  // did. A transparent sticky cell is worse than none: the scrolled content
  // reads through it.
  const stickyIssues = [];
  let stickyOk = 0;
  for (const table of document.querySelectorAll('table')) {
    const container = table.closest('[data-slot="table-container"]') || table.parentElement;
    if (!container || container.scrollWidth <= container.clientWidth + 1) continue;
    // Two different questions, gated two different ways. Whether a table is
    // *required* to have a sticky column at all is scoped to deliberately wide
    // tables - the ones built wider than any viewport on purpose, which
    // declare a min-width of 600px or more; a three-column table that merely
    // overflows a 390px phone is not what the design contract asks about, and
    // treating every overflow as a violation would demand a frozen column on
    // every table in the product. But whether an EXISTING sticky column stays
    // opaque is a different question, and gating it behind the same
    // "deliberately wide" test excluded /app/kontak's table entirely: it
    // declares min-w-[34rem] (544px, under the 600px floor) yet genuinely has
    // a sticky first column that overflows and needs checking at 390px - the
    // exact width the fix on this table was made for. A table qualifies for
    // the opacity check if it clears the wide-table floor OR if it already
    // marks its first column sticky, so a table given the fix without being
    // "wide" by this rule's own definition is still verified.
    const declared = parseFloat(getComputedStyle(table).minWidth);
    const isDeclaredWide = Number.isFinite(declared) && declared >= 600;
    const firstHeaderSticky = getComputedStyle(table.querySelector('thead th') || table).position === 'sticky';
    if (!isDeclaredWide && !firstHeaderSticky) continue;
    const name = (table.getAttribute('class') || '').split(' ').find(c => c.startsWith('min-w-')) || 'table';
    // Header *and* body cells. Reading only the header measured 49 columns as
    // opaque while every body cell went translucent under row hover, which is
    // the state the comment above calls worse than no sticky column.
    const first = table.querySelector('thead th');
    const bodyCells = [...table.querySelectorAll('tbody tr')].map(r => r.firstElementChild).filter(Boolean);
    if (!first) { stickyIssues.push(name + ': no header cell'); continue; }
    // Whether the cell stays opaque under hover cannot be observed directly:
    // forcing real :hover in this headless Chrome was tried two ways
    // (CDP CSS.forcePseudoState and a real Input.dispatchMouseEvent at the
    // cell's own coordinates) and both leave element.matches(':hover')
    // reporting true while getComputedStyle never applies a single
    // :hover-scoped rule - confirmed directly, a row's own built-in
    // hover:bg-muted/50 computed as fully transparent under both. So this
    // reads declared rules instead, correcting three real gaps earlier
    // versions had: a CSSOM walk that misclassified nearly every leaf
    // CSSStyleRule as a container (CSS nesting gives every style rule an
    // empty .cssRules) and silently dropped it; matching a candidate rule
    // with closest() as well as matches(), which credited an ancestor's own
    // unrelated hover rule - every TableRow's built-in hover:bg-muted/50 -
    // as painting the cell sitting opaquely on top of it; and reading only
    // background-color/background, never background-image, so a hover rule
    // painting a gradient that fades to transparent passed unseen.
    const allRules = [];
    const flattenRules = (rules) => {
      for (let i = 0; i < rules.length; i++) {
        let rule;
        try { rule = rules[i]; } catch { continue; }
        if (rule.selectorText && rule.style) allRules.push(rule);
        let children = null;
        try { children = rule.cssRules; } catch { children = null; }
        if (children && children.length > 0 && !(rule.selectorText && rule.style)) flattenRules(children);
      }
    };
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      flattenRules(rules);
    }
    const hoverRulesFor = (cell) => allRules.filter((rule) => {
      if (!/:hover/.test(rule.selectorText)) return false;
      const probeSelector = rule.selectorText.replace(/:hover/g, '').trim();
      if (!probeSelector) return false;
      try { return cell.matches(probeSelector); } catch { return false; }
    });
    // A colour resolved inside the cell's own subtree, so var()/color-mix()
    // read against the real cascade rather than a detached element's.
    const resolveInCell = (cell, css) => {
      const resolver = document.createElement('span');
      resolver.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
      cell.appendChild(resolver);
      resolver.style.setProperty('--probe-value', css);
      resolver.style.backgroundColor = 'var(--probe-value)';
      const value = getComputedStyle(resolver).backgroundColor;
      resolver.remove();
      return value;
    };
    // A gradient function's own colour stops, checked for a transparent or
    // partial-alpha stop - the shape round 5 demonstrated
    // (linear-gradient(var(--muted), transparent)). Each candidate is resolved
    // through resolveInCell rather than the standalone parse(): round 6 showed
    // a stop written as var(--some-token) - itself resolving to a transparent
    // colour two levels up the cascade - matches the pattern below but cannot
    // be read by parse(), which only understands literal colour syntax.
    const gradientHasTransparentStop = (image, cell) => {
      const stops = image.match(/(?:var\\(--[\\w-]+\\)|#[0-9a-f]{3,8}|rgba?\\([^)]*\\)|hsla?\\([^)]*\\)|oklch\\([^)]*\\)|oklab\\([^)]*\\)|color-mix\\([^)]*\\)|\\btransparent\\b|\\bcurrentColor\\b)/gi) ?? [];
      return stops.some((stop) => {
        if (/^transparent$/i.test(stop)) return true;
        const resolved = resolveInCell(cell, stop);
        try { return parse(resolved).a < 1; } catch { return /transparent|currentcolor/i.test(resolved); }
      });
    };
    let bad = null;
    for (const cell of [first, ...bodyCells.slice(0, 3)]) {
      const cs = getComputedStyle(cell);
      if (cs.position !== 'sticky') { bad = 'first column not sticky'; break; }
      if (parse(cs.backgroundColor).a < 1) { bad = 'sticky column not opaque at rest'; break; }
      for (const rule of hoverRulesFor(cell)) {
        const colour = rule.style.getPropertyValue('background-color') || rule.style.getPropertyValue('background');
        if (colour) {
          const resolved = resolveInCell(cell, colour);
          if (parse(resolved).a < 1) { bad = 'sticky column paints a translucent background on hover: ' + colour; break; }
        }
        const image = rule.style.getPropertyValue('background-image');
        if (image && image !== 'none' && gradientHasTransparentStop(image, cell)) {
          bad = 'sticky column paints a background-image with a transparent stop on hover: ' + image;
          break;
        }
      }
      if (bad) break;
    }
    if (bad) { stickyIssues.push(name + ': ' + bad); continue; }
    stickyOk += 1;
  }

  // --- WCAG 2.1 AA text contrast ----------------------------------------
  const lowContrast = [];
  let contrastInspected = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue.trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (fg.a === 0) continue;
    const bg = backdrop(el);
    const c = ratio(over(fg, bg), bg);
    contrastInspected++;
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (Number(cs.fontWeight) >= 700 && size >= 18.66);
    const need = large ? 3 : 4.5;
    if (c + 0.005 < need) {
      lowContrast.push({
        text: text.slice(0, 40), ratio: Math.round(c * 100) / 100, need,
        color: cs.color, on: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')',
        size, weight: cs.fontWeight,
        where: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').slice(0, 2).join('.') : ''),
      });
    }
  }

  // --- keyboard focus ring ------------------------------------------------
  // WCAG 1.4.11 asks 3:1 of a focus indicator. Requires focus emulation: a
  // headless page is not focused, so :focus-visible never matches and the
  // probe silently measures nothing.
  // Every focusable element is checked, not a prefix: independent review
  // found a slice(0, 14) cap here with no documented rationale, and on
  // any CMS route at 768/1280px the first 14 tab stops are the skip link,
  // the ~10 persistent sidebar nav links, and the account menu - the same
  // shell chrome repeated on every page - so page-specific controls past
  // roughly the 10th-15th tab stop (the majority of routes like
  // /app/keuangan and /app/analitik) were never examined at all. The
  // contrast check above inspects every text element with no such cap;
  // focus/computedStyle per element is equally cheap.
  const weakFocusRing = [];
  let focusProbed = 0;
  const focusables = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex="0"]')]
    .filter(e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; });
  for (const el of focusables) {
    el.focus();
    if (document.activeElement !== el || !el.matches(':focus-visible')) continue;
    focusProbed++;
    const cs = getComputedStyle(el);
    const width = parseFloat(cs.outlineWidth);
    const shown = width >= 2 && cs.outlineStyle !== 'none';
    const ground = backdrop(el.parentElement || document.body);
    const c = shown ? ratio(over(parse(cs.outlineColor), ground), ground) : 0;
    if (!shown || c + 0.005 < 3) {
      weakFocusRing.push({
        where: el.tagName.toLowerCase() + ':' + (el.textContent || '').trim().slice(0, 18),
        outline: cs.outlineWidth + ' ' + cs.outlineStyle, ratio: Math.round(c * 100) / 100,
      });
    }
  }
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

  return {
    overflow, wide, mains, h1, headingSkips, titlesNotHeadings, unreachableScroll,
    stickyIssues, stickyOk, domDigest,
    longLines: longLines.slice(0, 4), longLineCount: longLines.length,
    current, unlabelledScroll, imgNoAlt, tablistLinks, cards, nestedCards,
    gutter, shellKind, tier,
    smallTargets: smallTargets.slice(0, 6), smallTargetCount: smallTargets.length,
    contrastInspected, contrastFails: lowContrast.length, contrast: lowContrast.slice(0, 6),
    focusProbed, weakFocusRing: weakFocusRing.length, focusDetail: weakFocusRing.slice(0, 3),
  };
})())`;

// The probe is a template literal, so every backslash in it must be doubled or
// the regular expression that reaches the browser is a different one. Three
// separate edits shipped a broken pattern this way, each discovered only when a
// sweep died half an hour in. Compiling here fails the import instead.
try {
  new Function(`return ${PROBE}`);
} catch (error) {
  throw new Error(`PROBE does not compile: ${error.message}`);
}

