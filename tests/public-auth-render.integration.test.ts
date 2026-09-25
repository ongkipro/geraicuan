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
    ["Tenant", TenantLoginPage, "Masuk ke toko Anda", "/app"],
    ["Super Admin", SuperAdminLoginPage, "Masuk Super Admin", "/platform"],
  ] as const)("renders one role-specific %s login job", async (_label, Page, heading, destination) => {
    const html = renderToStaticMarkup(await Page({}));

    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(`>${heading}</h1>`);
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('href="/"');
    expect(html).not.toContain(destination === "/app" ? "operasional platform" : "Operator outlet");
  });

  it("offers sign-up and recovery on the tenant login only, on distinct surfaces (PR-62, T-183)", async () => {
    const tenant = renderToStaticMarkup(await TenantLoginPage({}));
    const platform = renderToStaticMarkup(await SuperAdminLoginPage({}));

    expect(tenant).toContain('data-surface="tenant"');
    expect(tenant).toContain('href="/daftar"');
    expect(tenant).toContain('href="/lupa-password"');
    expect(tenant).toContain("Untuk toko");
    expect(platform).toContain('data-surface="platform"');
    expect(platform).toContain("Khusus Super Admin");
    expect(platform).not.toContain('href="/daftar"');
    expect(platform).not.toContain('href="/lupa-password"');
    expect(platform).not.toMatch(/<a[^>]*>(?:[^<]*Daftarkan toko|Lupa kata sandi\?)<\/a>/);
    expect(platform).toContain("Hubungi pengelola platform");
    // Both keep the contract the browser audits sign in with.
    for (const html of [tenant, platform]) {
      expect(html.indexOf("<form")).toBe(html.lastIndexOf("<form"));
      expect(html).toContain('id="email"');
      expect(html).toContain('id="password"');
      expect(html).toContain("auth-submit");
      expect(html).toContain('aria-label="Tampilkan kata sandi"');
      expect(html).toContain('aria-controls="password"');
    }
  });

  it("explains a verified email as awaiting approval and a failed link with a resend path", async () => {
    const verified = renderToStaticMarkup(await TenantLoginPage({
      searchParams: Promise.resolve({ notice: "email-terverifikasi" }),
    }));
    const failed = renderToStaticMarkup(await TenantLoginPage({
      searchParams: Promise.resolve({ error: "TOKEN_EXPIRED", notice: "email-terverifikasi" }),
    }));
    const platformIgnored = renderToStaticMarkup(await SuperAdminLoginPage({
      searchParams: Promise.resolve({ notice: "email-terverifikasi" }),
    }));

    expect(verified).toContain("Email terverifikasi");
    expect(verified).toContain("menunggu persetujuan Super Admin");
    expect(failed).toContain("Tautan verifikasi tidak berlaku");
    expect(failed).toContain('href="/verifikasi-email"');
    expect(failed).not.toContain("menunggu persetujuan Super Admin");
    expect(platformIgnored).not.toContain('id="login-notice"');
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
    // "Not verified" is answered only after Better Auth accepted the password.
    expect(source).toContain('body?.code === "EMAIL_NOT_VERIFIED"');
    expect(source).not.toMatch(/tidak terdaftar|belum terdaftar/i);
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
    expect(sessionHtml).toContain("Sesi Anda sudah berakhir atau belum dimulai.");
    expect(sessionHtml).toContain('aria-describedby="login-notice"');
    expect(ignoredHtml).not.toContain('id="login-notice"');
    expect(ignoredHtml).not.toContain("untrusted-detail");
  });
});
