import { PlatformSkeleton } from "../_components/platform-skeleton";

export default function PlatformAuditLoading() {
  return <PlatformSkeleton cards={[10]} description="Tindakan Super Admin, pendaftaran, dan perubahan tenant. Tidak dapat diubah." label="Memuat jejak audit" title="Audit" />;
}
