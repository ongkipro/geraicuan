"use client";

import { ListError } from "@/app/app/pengiriman/_list/list-states";

export default function ShipmentHistoryError({ reset }: { reset: () => void }) {
  return <ListError reset={reset} title="Histori kiriman" what="Histori kiriman" />;
}
