"use client";

import { ContactRoleDirectoryError } from "@/app/app/kontak/contact-role-boundaries";

export default function RecipientDirectoryError({ reset }: { reset: () => void }) {
  return <ContactRoleDirectoryError reset={reset} role="penerima" />;
}
