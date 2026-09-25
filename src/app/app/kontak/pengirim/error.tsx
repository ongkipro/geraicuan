"use client";

import { ContactRoleDirectoryError } from "@/app/app/kontak/contact-role-boundaries";

export default function SenderDirectoryError({ reset }: { reset: () => void }) {
  return <ContactRoleDirectoryError reset={reset} role="pengirim" />;
}
