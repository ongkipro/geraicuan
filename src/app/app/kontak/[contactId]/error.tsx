"use client";

import { ContactRouteError } from "@/app/app/kontak/contact-route-error";

export default function ContactDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ContactRouteError reset={reset} title="Detail kontak" />;
}
