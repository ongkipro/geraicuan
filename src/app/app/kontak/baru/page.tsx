import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ContactForm } from "@/app/app/kontak/contact-form";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
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

  return <PageContainer width="form"><PageHeader description="Satu kontak dapat dipakai sebagai pengirim, penerima, atau keduanya." eyebrow="Data" title="Buat kontak" /><ContactForm /></PageContainer>;
}
