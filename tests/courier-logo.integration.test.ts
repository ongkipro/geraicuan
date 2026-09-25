import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CourierLogo } from "@/components/cms/courier-logo";
import { courierDisplayName, MENGANTAR_COURIERS } from "@/lib/mengantar-couriers";

const publicDir = join(process.cwd(), "public");
const render = (courier: string, className?: string) => renderToStaticMarkup(createElement(CourierLogo, { className, courier }));

describe("CourierLogo", () => {
  it.each(MENGANTAR_COURIERS)("renders a shipped, self-contained SVG for %s", (courier) => {
    const html = render(courier);
    const src = html.match(/src="([^"]+)"/)?.[1];

    expect(src).toBe(`/couriers/${courier.toLowerCase()}.svg`);
    expect(html).toContain(`alt="${renderToStaticMarkup(courierDisplayName(courier))}"`);
    expect(html).toContain('class="h-6 w-auto"');

    const file = join(publicDir, src!);
    expect(existsSync(file)).toBe(true);
    const svg = readFileSync(file, "utf8");
    expect(svg).toMatch(/^<svg [^>]*viewBox="[^"]+"/);
    // No embedded rasters, scripts, handlers or external references.
    expect(svg).not.toMatch(/<script|<image|<foreignObject|base64|href=|url\(|\son[a-z]+=/i);
  });

  it("resolves a service key to its courier's logo", () => {
    expect(render("JNECargo")).toContain('src="/couriers/jne.svg"');
    expect(render("SAPLite")).toContain('alt="SAP"');
    expect(render("iDexpressCargo")).toContain('src="/couriers/idexpress.svg"');
  });

  it("merges a caller's size classes", () => {
    expect(render("JT", "h-8")).toContain('class="w-auto h-8"');
  });

  it("falls back to the display name for a courier it has no logo for", () => {
    const html = render("UnknownCo");
    expect(html).not.toContain("<img");
    expect(html).toContain(">UnknownCo</span>");
  });
});
