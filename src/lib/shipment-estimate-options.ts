import "server-only";

import { calculateCodAmountsOrNull } from "@/db/cod-totals-repository";
import { codChargeBreakdown, shippingMengantarDeductsIdr, type CodChargeBreakdown } from "@/lib/mengantar-cod-fee";
import type { PaymentMethod } from "@/lib/payment-method";

/** One service the issuance step offers (moved here from the removed issuance panel, T-208). */
export type ShipmentEstimateOption = {
  /** T-193: `codChargeBreakdown` of the amount confirmation would submit. */
  codBreakdown: CodChargeBreakdown | null;
  codEligible: boolean;
  deliveryEstimate: string;
  estimateServiceId: string;
  insuranceAmountIdr: number | null;
  providerService: string;
  shippingAmountIdr: number;
  /** T-186: the shipping Mengantar deducts, the COD Ongkir break-even basis. */
  shippingDeductedIdr?: number;
};

type EstimateService = {
  codEligible: boolean;
  deliveryEstimate: string;
  estimateServiceId: string;
  insuranceAmountIdr: number | null;
  normalPriceIdr: number | null;
  providerService: string;
  shippingAmountIdr: number;
  specialPriceIdr: number | null;
};

/**
 * T-200: the issuance choices for one estimated shipment, shared by the shipment
 * detail and the one-page creation flow so both confirm exactly the same values.
 */
export function buildShipmentEstimateOptions(input: {
  codFormulaRetired: boolean;
  declaredValueIdr: number;
  paymentMethod: PaymentMethod;
  services: readonly EstimateService[];
}): ShipmentEstimateOption[] {
  return input.services.map((service) => {
    // COD only: a COD Ongkir amount is the charge chosen with the service.
    const fullCod = input.paymentMethod === "COD" && service.codEligible && !input.codFormulaRetired;
    // A total past the Postgres integer range fails closed as "COD not available", never as a route error.
    const amounts = fullCod ? calculateCodAmountsOrNull(input.declaredValueIdr, service.shippingAmountIdr) : null;
    return {
      codBreakdown: amounts ? codChargeBreakdown(amounts) : null,
      codEligible: service.codEligible && (!fullCod || amounts !== null),
      deliveryEstimate: service.deliveryEstimate,
      estimateServiceId: service.estimateServiceId,
      insuranceAmountIdr: service.insuranceAmountIdr,
      providerService: service.providerService,
      shippingAmountIdr: service.shippingAmountIdr,
      shippingDeductedIdr: shippingMengantarDeductsIdr(service),
    };
  });
}
