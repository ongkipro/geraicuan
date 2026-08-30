import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ContactForm } from "@/app/app/kontak/contact-form";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

export const metadata: Metadata = { robots: { index: false } };

export default async function NewContactPage() {
  try {
    const principal = await requireCmsScope("tenant");
    if (principal.scope !== "tenant") redirect("/login/tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }

  return <main className="ship-shell"><a className="sales-skip" href="#form-kontak">Lewati ke formulir kontak</a><header className="ship-header"><p className="ship-wordmark">GeraiCUAN</p><Link href="/app/kontak">Kembali ke direktori</Link></header><section className="ship-intro"><p className="sales-eyebrow">KONTAK BARU</p><h1>Buat kontak</h1><p>Satu kontak dapat dipakai sebagai pengirim, penerima, atau keduanya.</p></section><ContactForm /></main>;
}
