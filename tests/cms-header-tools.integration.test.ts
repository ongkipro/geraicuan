import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clock = vi.hoisted(() => ({ now: null as Date | null }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: () => [clock.now, vi.fn()],
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({push:vi.fn()}) }));
import { CmsHeaderClock } from "@/app/_components/cms-header-tools";

beforeEach(() => { clock.now = null; });
describe("WIB header clock", () => {
  it("starts with a stable placeholder and no per-second live announcement", () => {
    const html = renderToStaticMarkup(createElement(CmsHeaderClock));
    expect(html).toContain('--:--:--');
    expect(html).toContain('aria-live="off"');
    expect(html).not.toContain('dateTime=');
  });
  it.each([
    ["2026-12-31T16:59:59.000Z", "31 Des 2026", "23:59:59"],
    ["2026-12-31T17:00:00.000Z", "01 Jan 2027", "00:00:00"],
    ["2026-02-28T17:00:01.000Z", "01 Mar 2026", "00:00:01"],
  ])("formats %s at the WIB calendar boundary", (instant, date, time) => {
    clock.now = new Date(instant);
    const html = renderToStaticMarkup(createElement(CmsHeaderClock));
    expect(html).toContain(date);
    expect(html).toContain(time);
    expect(html).toContain('GMT+7');
    expect(html).toContain(`dateTime="${instant}"`);
  });
});
