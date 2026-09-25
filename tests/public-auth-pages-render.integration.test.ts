import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

/**
 * T-181 / T-183 render contracts for the public tenant-host pages: every field
 * labelled, the surface marked, and no page offering what another host owns.
 */
describe("public tenant-host pages", () => {
  it("renders the store sign-up with every field, the terms and the sign-in link", async () => {
    const { default: RegistrationPage } = await import("@/app/daftar/page");
    const html = renderToStaticMarkup(createElement(RegistrationPage));

    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(">Daftarkan toko Anda</h1>");
    expect(html).toContain('data-surface="tenant"');
    for (const [id, label] of [
      ["storeName", "Nama toko"],
      ["whatsapp", "Nomor WhatsApp toko"],
      ["ownerName", "Nama pemilik"],
      ["email", "Email"],
      ["password", "Kata sandi"],
      ["passwordConfirmation", "Ulangi kata sandi"],
    ]) {
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`>${label}</label>`);
    }
    expect(html).toContain('name="terms"');
    expect(html).toContain('value="setuju"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain('href="/login/tenant"');
    expect(html).toContain("auth-submit");
    expect(html.match(/aria-label="Tampilkan kata sandi"/g)).toHaveLength(2);
  });

  it("renders recovery request, verification resend and an unusable reset link", async () => {
    const { default: ForgotPasswordPage } = await import("@/app/lupa-password/page");
    const { default: VerifyEmailPage } = await import("@/app/verifikasi-email/page");
    const { default: ResetPasswordPage, metadata } = await import("@/app/atur-ulang-password/page");

    const forgot = renderToStaticMarkup(createElement(ForgotPasswordPage));
    expect(forgot).toContain(">Lupa kata sandi</h1>");
    expect(forgot).toContain('id="email"');
    expect(forgot).toContain("Kirim tautan");

    const verify = renderToStaticMarkup(createElement(VerifyEmailPage));
    expect(verify).toContain(">Kirim ulang verifikasi email</h1>");
    expect(verify).toContain("Kirim tautan verifikasi");

    const noToken = renderToStaticMarkup(await ResetPasswordPage({}));
    expect(noToken).toContain("Tautan sudah tidak berlaku");
    expect(noToken).toContain('href="/lupa-password"');
    expect(noToken).not.toContain('name="password"');

    const failed = renderToStaticMarkup(await ResetPasswordPage({
      searchParams: Promise.resolve({ error: "INVALID_TOKEN", token: "a".repeat(24) }),
    }));
    expect(failed).toContain("Tautan sudah tidak berlaku");

    const valid = renderToStaticMarkup(await ResetPasswordPage({
      searchParams: Promise.resolve({ token: "a".repeat(24) }),
    }));
    expect(valid).toContain('name="token"');
    expect(valid).toContain('id="passwordConfirmation"');
    // The token in this URL never leaves as a referrer.
    expect(metadata.referrer).toBe("no-referrer");
  });

  it("renders the sign-up verification page as a password confirmation, never a one-click verification (T-198)", async () => {
    const { default: ConfirmEmailPage, metadata } = await import("@/app/verifikasi-email/konfirmasi/page");
    const token = `${"a".repeat(20)}.${"b".repeat(40)}.${"c".repeat(43)}`;

    const page = renderToStaticMarkup(await ConfirmEmailPage({ searchParams: Promise.resolve({ token }) }));
    expect(page.match(/<h1\b/g)).toHaveLength(1);
    expect(page).toContain(">Verifikasi email</h1>");
    expect(page).toContain("Masukkan kata sandi yang Anda buat saat mendaftarkan toko");
    expect(page).toContain(`name="token" value="${token}"`);
    expect(page).toContain('for="password"');
    expect(page).toContain(">Kata sandi pendaftaran</label>");
    expect(page).toContain('autoComplete="current-password"');
    expect(page).toContain('data-surface="tenant"');

    for (const searchParams of [{}, { token: "not-a-token" }, { token: [token, token] }]) {
      const unusable = renderToStaticMarkup(await ConfirmEmailPage({ searchParams: Promise.resolve(searchParams) }));
      expect(unusable).toContain("Tautan sudah tidak berlaku");
      expect(unusable).toContain('href="/verifikasi-email"');
      expect(unusable).not.toContain('name="password"');
    }
    expect(metadata.referrer).toBe("no-referrer");
  });
});
