import { ListSkeleton } from "@/app/app/pengiriman/_list/list-states";

export default function RtsLoading() {
  return (
    <ListSkeleton
      description="Pantau retur, tindak lanjuti kendala kurir, dan cek barang yang kembali ke outlet."
      label="Memuat retur"
      tiles={5}
      title="Retur (RTS)"
    />
  );
}
