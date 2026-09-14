import { Check, Circle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SHIPMENT_STATUS_PRESENTATION,
  type ShipmentStatus,
} from "@/lib/shipment-queue";

const BASE_STEPS: ShipmentStatus[] = ["DRAFT", "ESTIMATED", "SUBMISSION_QUEUED"];

function stage(status: ShipmentStatus) {
  if (status === "DRAFT") return 0;
  if (status === "ESTIMATED") return 1;
  if (status === "SUBMISSION_QUEUED") return 2;
  return 3;
}

export function ShipmentLifecycleTimeline({ status }: { status: ShipmentStatus }) {
  const currentStage = stage(status);
  const steps = currentStage === 3 ? [...BASE_STEPS, status] : BASE_STEPS;

  return (
    <Card aria-labelledby="shipment-lifecycle-timeline-heading" className="h-full" role="region">
      <CardHeader>
        <CardTitle id="shipment-lifecycle-timeline-heading">Riwayat status</CardTitle>
      </CardHeader>
      <CardContent>
      <ol className="grid gap-0">
        {steps.map((step, index) => {
          const complete = index < currentStage;
          const current = index === currentStage;
          const presentation = SHIPMENT_STATUS_PRESENTATION[step];
          return (
            <li className="relative flex min-h-14 gap-3 pb-4 last:min-h-0 last:pb-0" key={step}>
              {index < steps.length - 1 ? <span aria-hidden="true" className="absolute left-[9px] top-5 h-[calc(100%-0.25rem)] w-px bg-border" /> : null}
              {complete ? <Check aria-hidden="true" className="relative z-10 mt-0.5 size-5 rounded-full bg-primary p-1 text-primary-foreground" /> : <Circle aria-hidden="true" className={`relative z-10 mt-0.5 size-5 bg-card ${current ? "fill-primary text-primary" : "text-muted-foreground"}`} />}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={current ? "font-medium" : "text-sm text-muted-foreground"}>{presentation.label}</p>
                  {current ? <Badge variant="secondary">Status saat ini</Badge> : null}
                </div>
                {current ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{presentation.guidance}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
      </CardContent>
    </Card>
  );
}
