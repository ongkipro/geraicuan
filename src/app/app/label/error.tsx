"use client";

import { ListError } from "@/app/app/pengiriman/_list/list-states";

export default function LabelIndexError({ reset }: { reset: () => void }) {
  return <ListError reset={reset} title="Cetak resi" what="Daftar resi" />;
}
