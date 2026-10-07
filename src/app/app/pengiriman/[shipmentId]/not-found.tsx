import { PackageSearch } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Unknown number or another gerai's shipment: the same answer, no hint which (PR-44). */
export default function ShipmentDetailNotFound() {
  return (
    <>
      <PageHeader title="Kiriman tidak ditemukan" />
      <Card>
        <EmptyState
          action={<Button asChild variant="outline"><Link href="/app/pengiriman">Buka histori kiriman</Link></Button>}
          description="Nomor ini tidak ada di gerai Anda. Periksa nomor kiriman atau cari dari histori."
          icon={PackageSearch}
          title="Detail kiriman tidak tersedia"
        />
      </Card>
    </>
  );
}
