"use client";

import { ContactRouteError } from "@/app/app/kontak/contact-route-error";

export default function TrackingLookupError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ContactRouteError eyebrow="Cek" reset={reset} title="Cek resi" />;
}
