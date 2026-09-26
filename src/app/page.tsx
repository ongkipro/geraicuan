import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/app/login/_components/auth-shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  description: "CMS operasional pengiriman gerai: buat kiriman, terbitkan resi, cetak label bermasking.",
  title: { absolute: "GeraiCUAN — CMS operasional pengiriman gerai" },
};

/** Public entry (single-origin mode): the two ways in, and sign-up. */
export default function HomePage() {
  return (
    <AuthShell
      description="Buat kiriman, terbitkan resi, dan cetak label dengan identitas gerai Anda."
      footer={
        <Link className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href="/login/super-admin">
          Masuk Admin Platform
        </Link>
      }
      surface="tenant"
      title="Pengiriman gerai, rapi dari resi sampai label"
    >
      <div className="flex flex-col gap-3">
        <Button asChild className="w-full text-[length:inherit]" size="lg">
          <Link href="/login/tenant">Masuk ke gerai</Link>
        </Button>
        <Button asChild className="h-12 w-full text-[length:inherit]" variant="outline">
          <Link href="/daftar">Daftarkan gerai</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
