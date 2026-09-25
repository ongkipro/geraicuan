"use client";

import { ListError } from "@/app/app/pengiriman/_list/list-states";

export default function RtsError({ reset }: { reset: () => void }) {
  return <ListError reset={reset} title="Retur (RTS)" what="Daftar retur" />;
}
