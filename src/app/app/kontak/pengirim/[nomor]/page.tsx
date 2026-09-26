import type { Metadata } from "next";

import { ContactDetail, type ContactDetailProps } from "@/app/app/kontak/contact-detail";

// The contact's name stays out of the document title (browser history, shared screens).
export const metadata: Metadata = { robots: { index: false }, title: "Detail pengirim" };

/** T-241: `/app/kontak/pengirim/<n>` — the per-tenant contact number, never a name or phone. */
export default function PengirimDetailPage(props: ContactDetailProps) {
  return <ContactDetail role="pengirim" {...props} />;
}
