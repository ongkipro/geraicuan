import { SearchX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function TenantNotFound() {
  return (
    <>
      <PageHeader eyebrow="Tenant" title="Tenant tidak ditemukan" />
      <Card>
        <EmptyState
          action={<Button asChild variant="outline"><Link href="/platform/tenant">Kembali ke daftar tenant</Link></Button>}
          description="Tautan salah atau tenant tidak lagi tersedia."
          icon={SearchX}
          title="Tenant ini tidak ada"
        />
      </Card>
    </>
  );
}
