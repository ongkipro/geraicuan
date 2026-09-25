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

export default function OutletSettingsError({ reset }: { reset: () => void }) {
  const errorTitleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    errorTitleRef.current?.focus();
  }, []);

  return (
    <PageContainer>
      <SettingsLayout
        currentHref="/app/pengaturan/outlet"
        header={
          <PageHeader
            description="Kelola lokasi pickup dan koneksi pengiriman outlet."
            eyebrow="Pengelolaan"
            title="Outlet"
          />
        }
        indexHref={SETTINGS_INDEX_HREF}
        items={administrationNavigation}
        navLabel="Menu pengaturan"
      >
        <Alert className="lg:max-w-xl" role="alert" variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle ref={errorTitleRef} tabIndex={-1}>Pengaturan outlet belum dapat dimuat</AlertTitle>
          <AlertDescription className="space-y-4">
            <p>Coba lagi. Jika masalah berlanjut, hubungi pengelola platform tanpa mengirim kredensial.</p>
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
