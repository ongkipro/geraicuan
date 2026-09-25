import { ListSkeleton } from "@/app/app/pengiriman/_list/list-states";

export default function RtsLoading() {
  return (
    <ListSkeleton
      label="Memuat retur"
      tiles={5}
      title="Retur (RTS)"
    />
  );
}
