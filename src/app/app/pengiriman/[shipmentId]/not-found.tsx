import Link from "next/link";
import { PackageX } from "lucide-react";

import { EmptyState } from "@/components/cms/empty-state";
import { FocusHeadingOnMount } from "@/app/app/pengiriman/[shipmentId]/focus-heading-on-mount";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Button } from "@/components/ui/button";

export default function ShipmentNotFound() {
  const headingId = "shipment-not-found-heading";
  return (
    <PageContainer>
      <FocusHeadingOnMount id={headingId} />
      <PageHeader eyebrow="Pengiriman" focusTargetId={headingId} title="Detail kiriman" />
      <section role="status"><EmptyState action={<Button asChild><Link href="/app/pengiriman">Kembali ke histori kiriman</Link></Button>} description="Kiriman mungkin tidak ada atau tidak termasuk dalam lingkup tenant aktif. Tidak ada data tenant lain yang ditampilkan." icon={PackageX} title="Detail kiriman tidak tersedia" /></section>
    </PageContainer>
  );
}
