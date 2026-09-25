import type { Metadata } from "next";

import { ContactDirectory } from "@/app/app/kontak/contact-directory";
import type { ContactDirectorySearchParams } from "@/app/app/kontak/contact-directory-query";

export const metadata: Metadata = { robots: { index: false }, title: "Penerima" };

export default function PenerimaDirectoryPage({ searchParams }: { searchParams: Promise<ContactDirectorySearchParams> }) {
  return <ContactDirectory role="penerima" searchParams={searchParams} />;
}
