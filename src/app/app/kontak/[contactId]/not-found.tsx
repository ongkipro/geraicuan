import { ContactRound } from "lucide-react";
import Link from "next/link";

import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";

/** An unknown id, a malformed id and another tenant's contact read the same (no existence oracle). */
export default function ContactNotFound() {
  return (
    <>
      <PageHeader eyebrow="Data" title="Kontak tidak ditemukan" />
      <DataCard>
        <EmptyState
          action={(
            <>
              <Button asChild variant="outline"><Link href="/app/kontak/pengirim">Daftar pengirim</Link></Button>
              <Button asChild variant="outline"><Link href="/app/kontak/penerima">Daftar penerima</Link></Button>
            </>
          )}
          description="Kontak mungkin sudah dihapus atau bukan milik gerai ini."
          icon={ContactRound}
          title="Detail kontak tidak tersedia"
        />
      </DataCard>
    </>
  );
}
