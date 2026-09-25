import { describe, expect, it } from "vitest";

import { deliveryEstimateLabel, serviceDisplayName } from "@/lib/labels/courier";
import { areaDisplayCase } from "@/lib/label-format";

describe("T-202 courier and delivery-estimate labels (spec 10 §8, V-5/V-6)", () => {
  it("shows one display name per courier and service key", () => {
    expect(serviceDisplayName("JT")).toBe("J&T");
    expect(serviceDisplayName("lion")).toBe("Lion Parcel");
    expect(serviceDisplayName("pos")).toBe("POS Indonesia");
    expect(serviceDisplayName("spx")).toBe("Shopee Express");
    expect(serviceDisplayName("anteraja")).toBe("AnterAja");
    expect(serviceDisplayName("iDexpressCargo")).toBe("ID Express Cargo");
    expect(serviceDisplayName("SapCargo")).toBe("SAP Cargo");
    expect(serviceDisplayName("SAPLite")).toBe("SAP Lite");
    expect(serviceDisplayName("SiCepat")).toBe("SiCepat");
    expect(serviceDisplayName("JNE")).toBe("JNE");
    expect(serviceDisplayName("UnknownCo")).toBe("UnknownCo");
    expect(serviceDisplayName(null)).toBe("—");
  });

  it("normalises provider delivery estimates to Indonesian", () => {
    expect(deliveryEstimateLabel("1-2 Day")).toBe("1–2 hari");
    expect(deliveryEstimateLabel("2 - 3 days")).toBe("2–3 hari");
    expect(deliveryEstimateLabel("1 - 2 Hari")).toBe("1–2 hari");
    expect(deliveryEstimateLabel("4 HARI")).toBe("4 hari");
    expect(deliveryEstimateLabel("-")).toBe("—");
    expect(deliveryEstimateLabel("Next day")).toBe("Next day");
  });

  it("shows UPPERCASE area segments in Title Case without touching mixed case (V-28)", () => {
    expect(areaDisplayCase("DAGO, COBLONG, BANDUNG, JAWA BARAT, 40135")).toBe("Dago, Coblong, Bandung, Jawa Barat, 40135");
    expect(areaDisplayCase("KAB. BANDUNG, DKI JAKARTA")).toBe("Kab. Bandung, DKI Jakarta");
    expect(areaDisplayCase("Kebayoran Baru, JAKARTA SELATAN")).toBe("Kebayoran Baru, Jakarta Selatan");
    expect(areaDisplayCase("iDexpress Hub, Coblong")).toBe("iDexpress Hub, Coblong");
  });
});
