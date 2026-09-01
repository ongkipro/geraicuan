import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";

describe("CMS presentation contract", () => {
  it.each([
    ["wide", "max-w-7xl"],
    ["data", "max-w-6xl"],
    ["standard", "max-w-5xl"],
    ["form", "max-w-4xl"],
  ] as const)("maps the %s page width without adding route gutters", (width, className) => {
    const html = renderToStaticMarkup(createElement(PageContainer, { width }, "Content"));

    expect(html).toContain(className);
    expect(html).toContain("min-w-0");
    expect(html).not.toContain("px-4");
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
