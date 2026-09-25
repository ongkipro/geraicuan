import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { resolvePlatformAccess } from "@/app/platform/platform-access";

/** Platform frame: Super Admin scope on the platform host, else the Super Admin login (pre-v3 guard). */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const access = await resolvePlatformAccess();
  if (access.status !== "authorized") {
    redirect(
      `/login/super-admin?notice=${access.status === "anonymous" ? "session-required" : "access-unavailable"}`,
    );
  }

  return (
    <AppShell
      account={{ email: "Akses platform", name: "Super Admin" }}
      scope={{ kind: "platform" }}
      subtitle="Data agregat lintas tenant"
      title="Platform GeraiCUAN"
    >
      {children}
    </AppShell>
  );
}
