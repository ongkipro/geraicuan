import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { platformAccessRedirect, resolvePlatformAccess } from "@/app/platform/platform-access";

/** Platform frame: Super Admin scope on the platform host, else the Super Admin login (pre-v3 guard). */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const access = await resolvePlatformAccess();
  if (access.status !== "authorized") {
    redirect(platformAccessRedirect(access));
  }

  return (
    <AppShell
      account={{ email: "Akses platform", name: "Admin platform" }}
      scope={{ kind: "platform" }}
      subtitle="Data seluruh gerai"
      title="Platform GeraiCUAN"
    >
      {children}
    </AppShell>
  );
}
