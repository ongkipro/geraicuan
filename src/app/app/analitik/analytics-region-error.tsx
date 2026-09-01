import { CircleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RetryRegionButton } from "@/components/cms/retry-region-button";

export function AnalyticsRegionError({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {description}
        <div className="mt-3"><RetryRegionButton /></div>
      </AlertDescription>
    </Alert>
  );
}
