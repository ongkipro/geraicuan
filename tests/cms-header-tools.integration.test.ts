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
  it("renders no stand-in time before mount (T-203), only a reserved slot", () => {
    const html = renderToStaticMarkup(createElement(CmsHeaderClock));
    expect(html).not.toContain('--.--');
    expect(html).not.toContain('WIB');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('dateTime=');
  });
  it.each([
    // V-30: minutes only and the WIB label every page uses (was seconds + "GMT+7").
    ["2026-12-31T16:59:59.000Z", "31 Des 2026", "23.59 WIB"],
    ["2026-12-31T17:00:00.000Z", "1 Jan 2027", "00.00 WIB"],
    ["2026-02-28T17:00:01.000Z", "1 Mar 2026", "00.00 WIB"],
  ])("formats %s at the WIB calendar boundary", (instant, date, time) => {
    clock.now = new Date(instant);
    const html = renderToStaticMarkup(createElement(CmsHeaderClock));
    expect(html).toContain(date);
    expect(html).toContain(time);
    expect(html).not.toContain('GMT+7');
    expect(html).toContain(`dateTime="${instant}"`);
    expect(html).toContain('aria-live="off"');
  });
});
