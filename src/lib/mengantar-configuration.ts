import "server-only";

import { db } from "@/db/client";
import {
  OutletSettingsDeniedError,
  OutletSettingsInvalidError,
  updateOutletReadiness,
} from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";

export class MengantarConfigurationDeniedError extends Error {
  constructor() {
    super("Mengantar configuration is not authorized.");
  }
}

export async function configureMengantarConnection(
  principalId: string,
  tenantId: string,
  input: { outletId: string; pickupAddressId: string; originAreaId: string },
) {
  if (!input.outletId || !input.pickupAddressId.trim() || !input.originAreaId.trim()) {
    throw new MengantarConfigurationDeniedError();
  }

  try {
    return await withTenantContext(db, principalId, tenantId, (tx, context) =>
      updateOutletReadiness(tx, context, {
        outletId: input.outletId,
        defaultPickupAddressId: input.pickupAddressId,
        defaultOriginAreaId: input.originAreaId,
        connectionMode: "platform_default",
      }));
  } catch (error) {
    if (
      error instanceof OutletSettingsDeniedError
      || error instanceof OutletSettingsInvalidError
    ) {
      throw new MengantarConfigurationDeniedError();
    }
    throw error;
  }
}
