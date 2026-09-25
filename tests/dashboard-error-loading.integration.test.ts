import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import TenantError from "@/app/app/error";
import TenantLoading from "@/app/app/loading";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const error = new Error("sanitized test failure");
const reset = vi.fn();

// Loading and error states stand in for their page. If their container width,
// eyebrow, or title differ, the layout and the h1 jump when the page resolves.
// Read from the parsed JSX of each file — one element's attributes at a time —
// so neither a class name that changes with design nor a neighbouring element
// can decide the result.
function parse(route: string, file: string) {
  const path = join(process.cwd(), "src/app/app", route, file);
  if (!existsSync(path)) return null;
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function firstElementAttributes(source: ts.SourceFile | null, tag: string) {
  if (!source) return null;
  let found = null as Record<string, string> | null;
  const visit = (node: ts.Node) => {
    if (found) return;
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === tag) {
      const attributes: Record<string, string> = {};
      for (const property of node.attributes.properties) {
        if (!ts.isJsxAttribute(property) || !property.initializer) continue;
        const name = property.name.getText(source);
        const value = property.initializer;
        if (ts.isStringLiteral(value)) attributes[name] = value.text;
        else if (ts.isJsxExpression(value) && value.expression && ts.isStringLiteral(value.expression)) attributes[name] = value.expression.text;
        else attributes[name] = "<expression>";
      }
      found = attributes;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found as Record<string, string> | null;
}

const header = (route: string, file: string) => firstElementAttributes(parse(route, file), "PageHeader");
// T-149: the CMS ships one frame. No call site may pass a `width` prop — a
// literal `undefined` here (not a hard-coded "wide" fallback) so a reintroduced
// `width="data"` on either the page or its loading/error state is caught by
// `assertStatesMirror` below instead of two constants comparing equal to each other.
const width = (route: string, file: string) => firstElementAttributes(parse(route, file), "PageContainer")?.width;

function skeletonOrder(route: string, file: string) {
  const source = parse(route, file);
  const names: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node)) {
      const name = node.tagName.getText(source!);
      if (/^[A-Z]\w+Skeleton$/.test(name)) names.push(name);
    }
    ts.forEachChild(node, visit);
  };
  if (source) visit(source);
  return names;
}

// Routes whose page declares a static title; loading and error repeat the
// page's eyebrow, title, and width.
const STATIC_HEADER_ROUTES = [
  "",
  "anggota",
  "kontak/baru",
  "label",
  "pengaturan",
  "pengiriman",
  "pengiriman/baru",
  "pengiriman/rts",
];

// Exempt from title parity only: `label/[shipmentId]` shows a
// progress title while loading, and detail pages title themselves from data.
// Their eyebrow and width must still match. The
// shared `/platform` loading and error states stand in for four pages with
// different titles and are covered by the platform eyebrow check below.
const TITLE_EXEMPT_ROUTES = ["kontak/[contactId]", "label/[shipmentId]", "pengiriman/[shipmentId]"];

function assertStatesMirror(route: string, compareTitle: boolean) {
  const page = header(route, "page.tsx");
  expect(page?.eyebrow, `${route || "/"} page eyebrow`).toBeTruthy();
  expect(page?.eyebrow).not.toBe("<expression>");

  for (const file of ["loading.tsx", "error.tsx"]) {
    const source = parse(route, file);
    if (!source) continue;
    const state = firstElementAttributes(source, "PageHeader");
    expect(state, `${route || "/"} ${file} renders a PageHeader`).not.toBeNull();
    expect(state?.eyebrow, `${file} eyebrow`).toBe(page?.eyebrow);
    if (compareTitle) expect(state?.title, `${file} title`).toBe(page?.title);
    expect(width(route, file), `${file} width`).toBe(width(route, "page.tsx"));
    expect(width(route, file), `${route || "/"} ${file} must not choose a frame width`).toBeUndefined();
  }
}

describe("dashboard route error and loading states", () => {
  it.each([
    ["Dasbor", TenantError, "dashboard-page-heading"],
  ] as const)(
    "renders the %s error with a stable focus target and retry announcements",
    (_, ErrorState, headingId) => {
      const html = renderToStaticMarkup(createElement(ErrorState, { error, reset }));

      expect(html).toContain(`id="${headingId}"`);
      expect(html).toContain('tabindex="-1"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('role="status"');
    },
  );

  // Spec 10 shared CMS shell: every page carries the shared page eyebrow.
  it.each(STATIC_HEADER_ROUTES)("gives /app/%s a page eyebrow its loading and error states repeat", (route) => {
    assertStatesMirror(route, true);
  });

  it.each(TITLE_EXEMPT_ROUTES)(
    "keeps /app/%s loading and error eyebrow and width on the page's",
    (route) => {
      assertStatesMirror(route, false);
    },
  );

  // T-188: Pengirim and Penerima are thin routes over one directory body and
  // one pair of boundaries, so parity is checked where the headers live, and
  // each route's boundaries must render the shared ones for its own role.
  it("keeps the Pengirim and Penerima loading and error headers on the shared directory's", () => {
    const shared = (file: string) => {
      const path = join(process.cwd(), "src/app/app/kontak", file);
      return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    };
    const pageHeaders = (source: ts.SourceFile) => {
      const found: { eyebrow?: string; title?: string; width?: string }[] = [];
      const visit = (node: ts.Node) => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === "PageHeader") {
          const attributes: Record<string, string> = {};
          for (const property of node.attributes.properties) {
            if (ts.isJsxAttribute(property) && property.initializer) attributes[property.name.getText(source)] = property.initializer.getText(source);
          }
          found.push(attributes);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      return found;
    };
    const [page] = pageHeaders(shared("contact-role-directory.tsx"));
    const states = pageHeaders(shared("contact-role-boundaries.tsx"));
    expect(page?.eyebrow).toBe('"Data"');
    expect(page?.title).toBe("{label}");
    expect(states).toHaveLength(2);
    for (const state of states) {
      expect(state.eyebrow).toBe(page?.eyebrow);
      expect(state.title).toBe(page?.title);
      expect(state.width).toBeUndefined();
    }
    for (const role of ["pengirim", "penerima"]) {
      const loading = readFileSync(join(process.cwd(), "src/app/app/kontak", role, "loading.tsx"), "utf8");
      const failure = readFileSync(join(process.cwd(), "src/app/app/kontak", role, "error.tsx"), "utf8");
      expect(loading).toContain(`<ContactRoleDirectoryLoading role="${role}" />`);
      expect(failure).toContain(`<ContactRoleDirectoryError reset={reset} role="${role}" />`);
    }
  });

  it("passes the platform page eyebrow and keeps the shared platform states on one eyebrow", () => {
    const view = join(process.cwd(), "src/app/platform/_components/monitoring-view.tsx");
    const source = ts.createSourceFile(view, readFileSync(view, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    expect(firstElementAttributes(source, "PageHeader")?.eyebrow).toBe("<expression>");
    const platformState = (file: string) => {
      const path = join(process.cwd(), "src/app/platform", file);
      return firstElementAttributes(ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), "PageHeader");
    };
    const loadingEyebrow = platformState("loading.tsx")?.eyebrow;
    expect(loadingEyebrow, "platform loading eyebrow").toBeTruthy();
    expect(platformState("error.tsx")?.eyebrow).toBe(loadingEyebrow);
    // The shared states stand in for the overview page, whose eyebrow they repeat.
    expect(readFileSync(view, "utf8")).toMatch(new RegExp(`overview:\\{eyebrow:"${loadingEyebrow}"`));
  });

  it("mirrors the dashboard's regions in the page's own order without route gutters", () => {
    const html = renderToStaticMarkup(createElement(TenantLoading));

    expect(html).not.toContain("px-4");
    expect(html).toContain("Memuat ringkasan operasional tenant");
    // The period-support skeleton only renders when a supporting drill-down is
    // requested, so a route-level loading state does not show it.
    const conditional = new Set(["PeriodSupportSkeleton"]);
    expect(skeletonOrder("", "loading.tsx")).toEqual(
      skeletonOrder("", "page.tsx").filter((name) => !conditional.has(name)),
    );
  });
});
