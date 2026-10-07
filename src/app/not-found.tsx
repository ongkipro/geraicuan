import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/app/login/_components/auth-shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { robots: { index: false }, title: "Halaman tidak ditemukan" };

/**
 * M12: every URL no route matches (and any `notFound()` without its own boundary) lands here,
 * in Indonesian with a way back, instead of the framework's bare English 404. Who is signed in is
 * unknown at this level, so the one action is neutral: `/` sends a session to its CMS and
 * everyone else to the entry page.
 */
export default function NotFound() {
  return (
    <AuthShell
      description="Alamat ini tidak ada atau sudah dipindahkan. Periksa kembali tautannya."
      surface="tenant"
      title="Halaman tidak ditemukan"
    >
      <Button asChild className="w-full text-[length:inherit]" size="lg">
        <Link href="/">Kembali ke beranda</Link>
      </Button>
    </AuthShell>
  );
}
