import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isSanctionedEstimateFixtureEnabled,
  loadSanctionedEstimateFixture,
} from "@/lib/sanctioned-estimate-fixture";

const previousFlag = process.env.GERAICUAN_ENABLE_SANCTIONED_ESTIMATE_FIXTURE;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (previousFlag === undefined) {
    delete process.env.GERAICUAN_ENABLE_SANCTIONED_ESTIMATE_FIXTURE;
  } else {
    process.env.GERAICUAN_ENABLE_SANCTIONED_ESTIMATE_FIXTURE = previousFlag;
  }
});

describe("sanctioned estimate fixture", () => {
  it("fails closed unless its explicit non-production flag is enabled", async () => {
    delete process.env.GERAICUAN_ENABLE_SANCTIONED_ESTIMATE_FIXTURE;
    expect(isSanctionedEstimateFixtureEnabled()).toBe(false);
    await expect(loadSanctionedEstimateFixture()).rejects.toThrow(
      "Mengantar estimate is unavailable.",
    );
  });

  it("stays disabled in production even when the fixture flag is present", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.GERAICUAN_ENABLE_SANCTIONED_ESTIMATE_FIXTURE = "1";

    expect(isSanctionedEstimateFixtureEnabled()).toBe(false);
    await expect(loadSanctionedEstimateFixture()).rejects.toThrow(
      "Mengantar estimate is unavailable.",
    );
  });

  it("normalizes the sanitized fixture without a network request", async () => {
    process.env.GERAICUAN_ENABLE_SANCTIONED_ESTIMATE_FIXTURE = "1";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const services = await loadSanctionedEstimateFixture();

    expect(services.length).toBeGreaterThan(0);
    expect(services).toEqual(expect.arrayContaining([
      expect.objectContaining({ currency: "IDR", providerService: "SAP" }),
    ]));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
