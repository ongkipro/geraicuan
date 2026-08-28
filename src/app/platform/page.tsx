import { redirect } from "next/navigation";

import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

export default async function PlatformCmsPage() {
  try {
    await requireCmsScope("platform");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) {
      redirect("/login/super-admin");
    }
    throw error;
  }

  return <main><h1>CMS Platform</h1><p>Akses Super Admin aktif.</p></main>;
}
