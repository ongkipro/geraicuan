import { ListSkeleton } from "@/app/app/pengiriman/_list/list-states";

export default function LabelIndexLoading() {
  return (
    <ListSkeleton
      label="Memuat daftar resi"
      tiles={3}
      title="Cetak resi"
    />
  );
}
