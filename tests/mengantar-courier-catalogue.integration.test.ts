import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { providerCourierFromService } from "@/db/order-batch-repository";
import { normalizeMengantarEstimateServices } from "@/lib/mengantar-estimate";
import {
  MENGANTAR_COURIERS,
  isMengantarServiceOffered,
  courierDisplayName,
  courierRecapOrder,
  mengantarCourierOfService,
} from "@/lib/mengantar-couriers";

/**
 * The courier list is the provider's, not ours.
 *
 * Kept by hand it was wrong twice over: `spx` (Shopee Express) was never listed,
 * so a Shopee Express shipment could not appear in the dashboard recap at all;
 * and `iDexpressCargo` fell past a five-name prefix ladder and became a courier
 * of its own, so one carrier would have been recapped as two.
 *
 * `tests/fixtures/mengantar-couriers.catalogue.json` is captured evidence —
 * `GET /order/estimate?courier=all` over three real routes — and
 * `scripts/capture-mengantar-couriers.mjs` re-records it. This file is what
 * makes the evidence binding: add a courier to the catalogue without adding it
 * here and the suite says so by name.
 */
const catalogue = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/mengantar-couriers.catalogue.json"), "utf8"),
) as {
  serviceKeys: string[];
  routesSampled: Array<{ destination: string; quoted: number; supported: number }>;
  services: Array<{ serviceKey: string; quotedOn: number; supportedOn: number }>;
};

describe("Mengantar courier catalogue", () => {
  it("was captured over more than one route, so route support is not read as absence", () => {
    expect(catalogue.routesSampled.length).toBeGreaterThanOrEqual(3);
    expect(catalogue.serviceKeys.length).toBeGreaterThanOrEqual(16);
    // `paxel` is quoted everywhere and serves none of the sampled routes: being
    // offered and serving a route are different questions, and the list answers
    // the first. A capture that confused them would drop it.
    expect(catalogue.serviceKeys).toContain("paxel");
  });

  it("names every courier the provider quotes, except the removed Ninja (D-29)", () => {
    const unmapped = catalogue.serviceKeys
      .filter((key) => isMengantarServiceOffered(key))
      .filter((key) => mengantarCourierOfService(key) === null);
    expect(unmapped, `service keys no courier in MENGANTAR_COURIERS claims: ${unmapped.join(", ")}`)
      .toEqual([]);

    const couriers = [...new Set(catalogue.serviceKeys.filter(isMengantarServiceOffered).map((key) => mengantarCourierOfService(key)))];
    for (const courier of couriers) {
      expect(MENGANTAR_COURIERS, `${courier} is quoted but not listed`).toContain(courier);
    }
  });

  it("collapses a courier's services onto the courier, including the cargo tiers", () => {
    expect(mengantarCourierOfService("JNECargo")).toBe("JNE");
    expect(mengantarCourierOfService("SiCepatCargo")).toBe("SiCepat");
    // The two that the hand-kept ladder got wrong.
    expect(mengantarCourierOfService("iDexpressCargo")).toBe("iDexpress");
    expect(mengantarCourierOfService("spx")).toBe("spx");
    // Casing is the provider's, not ours: `SapCargo` sits beside `SAPLite`.
    expect(mengantarCourierOfService("SapCargo")).toBe("SAP");
    expect(mengantarCourierOfService("SAPLite")).toBe("SAP");
    expect(mengantarCourierOfService("Wahana")).toBeNull();
  });

  /**
   * A prefix match is only unambiguous while no courier name prefixes another.
   * Nothing in the catalogue collides today, so the resolver stays a plain
   * prefix match; the day Mengantar ships a `SAPX`, this fails and whoever adds
   * it has to choose the rule deliberately instead of inheriting `SAP`.
   */
  it("keeps the courier names free of prefix collisions", () => {
    const collisions = MENGANTAR_COURIERS.flatMap((courier) =>
      MENGANTAR_COURIERS
        .filter((other) => other !== courier && other.toLowerCase().startsWith(courier.toLowerCase()))
        .map((other) => `${courier} prefixes ${other}`),
    );
    expect(collisions).toEqual([]);
  });

  it("keeps the issued-order grouping and the recap on the same vocabulary", () => {
    for (const key of catalogue.serviceKeys.filter(isMengantarServiceOffered)) {
      expect(providerCourierFromService(key), key).toBe(mengantarCourierOfService(key));
    }
    // D-29: Ninja left the catalogue; a historical Ninja order groups under its own name.
    expect(mengantarCourierOfService("Ninja")).toBeNull();
    expect(providerCourierFromService("Ninja")).toBe("Ninja");
    // A courier the list does not name still reaches the recap rather than
    // disappearing, and reaches it under its own name.
    expect(providerCourierFromService("Wahana")).toBe("Wahana");
    expect(courierRecapOrder(["Wahana", "JNE"])).toEqual([...MENGANTAR_COURIERS, "Wahana"]);
  });

  /**
   * Naming a courier is not the same as quoting it. The estimate normalizer
   * validates each service key before it reaches the operator, so a tightened
   * pattern would drop a courier from every quote while the recap still listed
   * it — `spx` and `iDexpress` are exactly the mixed-case keys such a pattern
   * tends to lose.
   */
  it("lets every catalogued service key through the estimate normalizer, except a discontinued courier (D-29)", () => {
    const priced = Object.fromEntries(catalogue.serviceKeys.map((key) => [key, {
      price: 12_000,
      currency: "IDR",
      estimate_delivery: "2 - 3 days",
      estimatedPrice: 12_000,
      estimatedSpecialPrice: 9_000,
      codFee: 0,
      unsupported: false,
      unsupported_cod: false,
    }]));
    const quoted = normalizeMengantarEstimateServices(priced).map((service) => service.providerService);

    expect([...quoted].sort()).toEqual(catalogue.serviceKeys.filter((key) => key !== "Ninja").sort());
  });

  it("gives every listed courier a name an operator would recognise", () => {
    for (const courier of MENGANTAR_COURIERS) {
      const label = courierDisplayName(courier);
      expect(label.length, courier).toBeGreaterThan(1);
      // A lowercase provider key is a key, not a name: `spx` and `pos` must not
      // reach the screen as they are stored.
      if (courier === courier.toLowerCase()) {
        expect(label, `${courier} is shown as its raw provider key`).not.toBe(courier);
      }
    }
    expect(courierDisplayName("spx")).toBe("Shopee Express");
  });
});
