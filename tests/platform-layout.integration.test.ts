import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: { status: "anonymous" } as
    | { status: "authorized"; principal: { scope: "platform"; userId: string } }
    | { status: "anonymous" }
    | { status: "forbidden"; userId: string },
  shell: vi.fn(({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-platform-shell": true }, children),
  ),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("@/app/_components/cms-shell", () => ({
  CmsShell: mocks.shell,
}));

vi.mock("@/app/platform/platform-access", () => ({
  resolvePlatformAccess: vi.fn(async () => mocks.access),
}));

import PlatformLayout from "@/app/platform/layout";

describe("platform shell authorization boundary", () => {
  beforeEach(() => {
    mocks.access = { status: "anonymous" };
    mocks.shell.mockClear();
  });

  it.each([
    [{ status: "anonymous" } as const, "session-required"],
    [{ status: "forbidden", userId: "tenant-user" } as const, "access-unavailable"],
  ])("redirects $0.status actors before rendering Platform chrome", async (access, notice) => {
    mocks.access = access;

    await expect(
      PlatformLayout({ children: createElement("p", null, "Protected") }),
    ).rejects.toThrow(`REDIRECT:/login/super-admin?notice=${notice}`);
    expect(mocks.shell).not.toHaveBeenCalled();
  });

  it("renders the shared Platform shell only for an authorized principal", async () => {
    mocks.access = {
      principal: { scope: "platform", userId: "super-user" },
      status: "authorized",
    };

    const element = await PlatformLayout({
      children: createElement("p", null, "Protected"),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('data-platform-shell="true"');
    expect(markup).toContain("Protected");
    expect(mocks.shell).toHaveBeenCalledOnce();
  });
});
