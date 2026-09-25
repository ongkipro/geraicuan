import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";

export default function LabelNotFound() {
  return (
    <>
      <PageHeader eyebrow="Pengiriman" title="Label tidak ditemukan" />
      <DataCard>
        <EmptyState
          action={
            <Button asChild variant="outline">
              <Link href="/app/label">Buka daftar cetak resi</Link>
            </Button>
          }
          description="Kiriman ini tidak ada atau bukan milik gerai Anda."
          icon={FileQuestion}
          title="Label tidak tersedia"
        />
      </DataCard>
    </>
  );
}
