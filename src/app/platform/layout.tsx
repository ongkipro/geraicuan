import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { CmsShell } from "@/app/_components/cms-shell";
import { resolvePlatformAccess } from "@/app/platform/platform-access";

export default async function PlatformLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await resolvePlatformAccess();
  if (access.status !== "authorized") redirect("/login/super-admin");

  return (
    <CmsShell
      account={{ initials: "SA", label: "Super Admin", secondary: "Akses platform" }}
      destination="/login/super-admin"
      roleLabel="Super Admin"
      scope="platform"
      scopeDescription="Data agregat lintas tenant"
      scopeTitle="Platform GeraiCUAN"
    >
      {children}
    </CmsShell>
  );
}
