import Link from "next/link";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function PlatformTenantNotFound() {
  return (
    <PageContainer width="wide">
      <PageHeader
        description="Tenant mungkin sudah dihapus, diarsipkan, atau tidak tersedia pada lingkup platform ini."
        eyebrow="Detail tenant"
        title="Tenant tidak ditemukan"
      />
      <Alert>
        <AlertTitle>Detail tidak tersedia</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>Tidak ada data tenant yang ditampilkan. Kembali ke daftar untuk memilih tenant yang tersedia.</p>
          <Button asChild className="min-h-11" variant="outline">
            <Link href="/platform/tenant" prefetch={false}>Kembali ke daftar tenant</Link>
          </Button>
        </AlertDescription>
      </Alert>
    </PageContainer>
  );
}
