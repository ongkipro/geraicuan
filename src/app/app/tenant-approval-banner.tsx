import { Clock } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TENANT_APPROVAL_COPY } from "@/lib/tenant-approval";

/**
 * PR-60: shown above every tenant page while the store awaits approval. It is a
 * status, not an error: nothing is broken, the store is waiting.
 */
export function TenantApprovalBanner() {
  return (
    <Alert
      className="approval-banner mb-6"
      data-testid="tenant-approval-banner"
      role="status"
    >
      <Clock aria-hidden="true" />
      <AlertTitle className="text-base font-semibold">{TENANT_APPROVAL_COPY.title}</AlertTitle>
      <AlertDescription className="text-sm leading-6 text-foreground">
        {TENANT_APPROVAL_COPY.body}
      </AlertDescription>
    </Alert>
  );
}
