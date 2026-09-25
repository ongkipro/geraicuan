import { PlatformSkeleton } from "../_components/platform-skeleton";

export default function PlatformAuditLoading() {
  return <PlatformSkeleton cards={[10]} label="Memuat jejak audit" title="Audit" />;
}
