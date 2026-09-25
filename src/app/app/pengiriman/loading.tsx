import { Plus } from "lucide-react";
import Link from "next/link";

import { ListSkeleton } from "@/app/app/pengiriman/_list/list-states";
import { Button } from "@/components/ui/button";

export default function ShipmentHistoryLoading() {
  return (
    <ListSkeleton
      actions={
        <Button asChild>
          <Link href="/app/pengiriman/baru">
            <Plus aria-hidden="true" />
            Buat kiriman
          </Link>
        </Button>
      }
      description="Kelola draf, penerbitan resi, dan tindak lanjut kiriman."
      label="Memuat histori kiriman"
      tiles={6}
      title="Histori kiriman"
    />
  );
}
