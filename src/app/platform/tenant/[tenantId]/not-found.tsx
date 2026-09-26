import { SearchX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function TenantNotFound() {
  return (
    <>
      <PageHeader eyebrow="Gerai" title="Gerai tidak ditemukan" />
      <Card>
        <EmptyState
          action={<Button asChild variant="outline"><Link href="/platform/tenant">Kembali ke daftar gerai</Link></Button>}
          description="Tautan salah atau gerai tidak lagi tersedia."
          icon={SearchX}
          title="Gerai ini tidak ada"
        />
      </Card>
    </>
  );
}
