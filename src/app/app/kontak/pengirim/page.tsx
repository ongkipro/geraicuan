import type { Metadata } from "next";

import { ContactDirectory } from "@/app/app/kontak/contact-directory";
import type { ContactDirectorySearchParams } from "@/app/app/kontak/contact-directory-query";

export const metadata: Metadata = { robots: { index: false }, title: "Pengirim" };

export default function PengirimDirectoryPage({ searchParams }: { searchParams: Promise<ContactDirectorySearchParams> }) {
  return <ContactDirectory role="pengirim" searchParams={searchParams} />;
}
