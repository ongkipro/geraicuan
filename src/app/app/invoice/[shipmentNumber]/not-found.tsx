import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";

export default function InvoiceNotFound() {
  return (
    <>
      <PageHeader eyebrow="Pengiriman" title="Invoice tidak ditemukan" />
      <DataCard>
        <EmptyState
          action={
            <Button asChild variant="outline">
              <Link href="/app/pengiriman">Buka histori kiriman</Link>
            </Button>
          }
          description="Kiriman ini tidak ada atau bukan milik gerai Anda."
          icon={FileQuestion}
          title="Invoice tidak tersedia"
        />
      </DataCard>
    </>
  );
}
