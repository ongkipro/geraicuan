import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { platformAccessRedirect, resolvePlatformAccess } from "@/app/platform/platform-access";
import { AuthShell } from "@/app/login/_components/auth-shell";
import { TwoFactorSetup } from "@/app/verifikasi-dua-langkah/two-factor-setup";

export const metadata: Metadata = { robots: { index: false }, title: "Aktifkan verifikasi dua langkah" };

/**
 * T-286 (M2): a Super Admin signed in with a password only lands here before any `/platform`
 * page opens (`resolvePlatformAccess` answers `two-factor-required`). Everyone else is sent where
 * their access says; an enrolled Super Admin goes on to `/platform`.
 */
export default async function TwoFactorEnrollmentPage() {
  const access = await resolvePlatformAccess();
  if (access.status === "authorized") redirect("/platform");
  if (access.status !== "two-factor-required") redirect(platformAccessRedirect(access));

  return (
    <AuthShell
      description="Akun admin platform wajib memakai kode dari aplikasi autentikator setiap kali masuk. Siapkan sekali, sekitar dua menit."
      surface="platform"
      title="Aktifkan verifikasi dua langkah"
    >
      <TwoFactorSetup />
    </AuthShell>
  );
}
