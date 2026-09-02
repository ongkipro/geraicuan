import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import AnalyticsError from "@/app/app/analitik/error";
import AnalyticsLoading from "@/app/app/analitik/loading";
import TenantError from "@/app/app/error";
import TenantLoading from "@/app/app/loading";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const error = new Error("sanitized test failure");
const reset = vi.fn();

describe("dashboard route error and loading states", () => {
  it.each([
    [
      "Ringkasan",
      TenantError,
      "dashboard-page-heading",
    ],
    [
      "Analitik",
      AnalyticsError,
      "analytics-page-heading",
    ],
  ] as const)(
    "renders the %s error with a stable focus target and retry announcements",
    (_, ErrorState, headingId) => {
      const html = renderToStaticMarkup(
        createElement(ErrorState, { error, reset }),
      );

      expect(html).toContain(`id="${headingId}"`);
      expect(html).toContain('tabindex="-1"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('role="status"');
      expect(html).toContain("max-w-7xl");
      if (headingId === "analytics-page-heading") expect(html).toContain("Wawasan");
    },
  );

  it("mirrors the dashboard's major regions without adding route gutters", () => {
    const html = renderToStaticMarkup(createElement(TenantLoading));

    expect(html).toContain("max-w-7xl");
    expect(html).not.toContain("px-4");
    expect(html).toContain('aria-label="Memuat kesiapan outlet"');
    expect(html).toContain("lg:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]");
    expect(html).toContain("Memuat ringkasan operasional tenant");
  });

  it("uses the final analytics region skeletons inside the wide page container", () => {
    const html = renderToStaticMarkup(createElement(AnalyticsLoading));

    expect(html).toContain("max-w-7xl");
    expect(html).toContain('aria-label="Memuat ringkasan analitik"');
    expect(html).toContain('aria-label="Memuat exception rekonsiliasi"');
    expect(html).toContain('aria-label="Memuat tren analitik"');
    expect(html).toContain('aria-label="Memuat performa kurir"');
    expect(html).toContain('aria-label="Memuat tabel kiriman"');
    expect(html).toContain("Wawasan");
  });
});
