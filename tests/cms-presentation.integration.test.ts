import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";

describe("CMS presentation contract", () => {
  // Widths were retuned in Phase 13 (wide 88rem, data 7xl, form 5xl). Bind to the contract instead
  // of literal classes: every width caps the page, never adds route gutters, and a wider width never
  // renders narrower than a smaller one (form <= standard <= data <= wide).
  const tailwindRem: Record<string, number> = { "3xl": 48, "4xl": 56, "5xl": 64, "6xl": 72, "7xl": 80 };
  function maxWidthRem(width: "wide" | "data" | "standard" | "form") {
    const html = renderToStaticMarkup(createElement(PageContainer, { width }, "Content"));
    expect(html).toContain("min-w-0");
    expect(html).not.toContain("px-4");
    const named = html.match(/\bmax-w-(\dxl)\b/)?.[1];
    const arbitrary = html.match(/\bmax-w-\[(\d+(?:\.\d+)?)rem\]/)?.[1];
    const rem = named ? tailwindRem[named] : arbitrary ? Number(arbitrary) : undefined;
    expect(rem, `${width} max width`).toBeTypeOf("number");
    return rem as number;
  }

  it.each(["wide", "data", "standard", "form"] as const)("caps the %s page width without adding route gutters", (width) => {
    maxWidthRem(width);
  });

  it("orders page widths from form to wide", () => {
    const [form, standard, data, wide] = (["form", "standard", "data", "wide"] as const).map(maxWidthRem);
    expect(form).toBeLessThanOrEqual(standard);
    expect(standard).toBeLessThan(data);
    expect(data).toBeLessThan(wide);
  });

  it("keeps header actions touch-sized and the heading hierarchy semantic", () => {
    const html = renderToStaticMarkup(createElement(PageHeader, {
      actions: createElement("button", { type: "button" }, "Action"),
      eyebrow: "Scope",
      title: "Page title",
    }));

    expect(html).toContain("<h1");
    expect(html).toContain("[&amp;&gt;*]:min-h-11");
  });
});
