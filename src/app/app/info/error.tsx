"use client";

import { ListError } from "@/app/app/pengiriman/_list/list-states";

export default function InfoError({ reset }: { reset: () => void }) {
  return <ListError reset={reset} title="Info terbaru" what="Info terbaru" />;
}
