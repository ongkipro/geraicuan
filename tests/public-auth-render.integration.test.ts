import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";
import SuperAdminLoginPage from "@/app/login/super-admin/page";
import TenantLoginPage from "@/app/login/tenant/page";

describe("Public and authentication render contracts", () => {
  it("keeps every public decision action at least 44px without exposing CMS controls", () => {
    const html = renderToStaticMarkup(createElement(Home));
    const actions = [
      ...html.matchAll(/<a[^>]+href="(?:\/login\/(?:tenant|super-admin)|#cara-kerja)"[^>]*>/g),
    ].map(([tag]) => tag);

    expect(actions).toHaveLength(6);
    expect(actions.every((tag) => tag.includes("min-h-11"))).toBe(true);
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).not.toContain("Kelola anggota");
    expect(html).not.toContain("Jalankan rekonsiliasi");
    expect(html).not.toContain("Simpan lokasi");
  });

  it.each([
    ["Tenant", TenantLoginPage, "/app"],
    ["Super Admin", SuperAdminLoginPage, "/platform"],
  ] as const)("renders one role-specific %s login job", async (_label, Page, destination) => {
    const html = renderToStaticMarkup(await Page({}));

    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(`Masuk ${_label}`);
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('href="/"');
    expect(html).not.toContain(destination === "/app" ? "operasional platform" : "Operator outlet");
  });

  it("keeps generic failure copy and the local demo action on the 44px shadcn button contract", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/login/_components/login-form.tsx"),
      "utf8",
    );

    expect(source).toContain('credentials: "same-origin"');
    expect(source).toContain('"x-geraicuan-login-scope"');
    expect(source).toContain("Email atau kata sandi salah.");
    expect(source).not.toMatch(/akun (?:tidak ditemukan|dinonaktifkan)/i);
    expect(source).toContain('className="min-h-11"');
    expect(source).not.toContain("auth-demo-fill");
  });

  it("renders only bounded recovery notices and keeps them in the field description", async () => {
    const sessionHtml = renderToStaticMarkup(
      await TenantLoginPage({
        searchParams: Promise.resolve({ notice: "session-required" }),
      }),
    );
    const ignoredHtml = renderToStaticMarkup(
      await SuperAdminLoginPage({
        searchParams: Promise.resolve({ notice: "untrusted-detail" }),
      }),
    );

    expect(sessionHtml).toContain('id="login-notice"');
    expect(sessionHtml).toContain("Sesi diperlukan untuk membuka workspace ini.");
    expect(sessionHtml).toContain('aria-describedby="login-notice"');
    expect(ignoredHtml).not.toContain('id="login-notice"');
    expect(ignoredHtml).not.toContain("untrusted-detail");
  });
});
