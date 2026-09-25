"use client";

import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";

import {
  administrationNavigation,
  SETTINGS_INDEX_HREF,
} from "@/app/app/pengaturan/settings-nav";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { SettingsLayout } from "@/components/cms/settings-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";


export default function TenantMembersError({ reset }: { reset: () => void }) {
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    alertRef.current?.focus();
  }, []);

  return (
    <PageContainer>
      <SettingsLayout
        currentHref="/app/anggota"
        header={
          <PageHeader
            description="Undang anggota, ubah peran, dan nonaktifkan akses tenant."
            eyebrow="Pengelolaan"
            title="Anggota & akses"
          />
        }
        indexHref={SETTINGS_INDEX_HREF}
        items={administrationNavigation}
        navLabel="Menu pengaturan"
      >
        <Alert className="lg:max-w-xl" ref={alertRef} role="alert" tabIndex={-1} variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Pengelolaan anggota belum dapat dimuat</AlertTitle>
          <AlertDescription className="space-y-4">
            <p>Coba lagi. Tidak ada perubahan peran atau status yang dijalankan dari keadaan galat ini.</p>
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11" onClick={reset} type="button">Coba lagi</Button>
              <Button asChild className="min-h-11" variant="outline"><Link href="/app">Kembali ke ringkasan</Link></Button>
            </div>
          </AlertDescription>
        </Alert>
      </SettingsLayout>
    </PageContainer>
  );
}
