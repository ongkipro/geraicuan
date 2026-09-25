import { ListSkeleton } from "@/app/app/pengiriman/_list/list-states";

export default function LabelIndexLoading() {
  return (
    <ListSkeleton
      description="Label tersedia setelah nomor resi resmi terbit dari Mengantar."
      label="Memuat daftar resi"
      tiles={3}
      title="Cetak resi"
    />
  );
}
