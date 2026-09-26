import "server-only";

import { readFile } from "node:fs/promises";

import type { SupportedEstimateService } from "@/db/estimate-repository";
import {
  MengantarEstimateError,
  normalizeMengantarEstimateServices,
} from "@/lib/mengantar-estimate";

const FIXTURE_FLAG = "GERAICUAN_ENABLE_SANCTIONED_ESTIMATE_FIXTURE";
const FIXTURE_PATH = "tests/fixtures/mengantar-estimate.sandbox.json";

export function isSanctionedEstimateFixtureEnabled() {
  return process.env.NODE_ENV !== "production" && process.env[FIXTURE_FLAG] === "1";
}

export async function loadSanctionedEstimateFixture(
  request: { weightGrams?: number } = {},
): Promise<SupportedEstimateService[]> {
  if (!isSanctionedEstimateFixtureEnabled()) throw new MengantarEstimateError();

  let value: unknown;
  try {
    value = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
  } catch {
    throw new MengantarEstimateError();
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MengantarEstimateError();
  }
  const fixture = value as { environment?: unknown; response?: { body?: { data?: unknown; success?: unknown } } };
  if (
    fixture.environment !== "sandbox" ||
    fixture.response?.body?.success !== true
  ) {
    throw new MengantarEstimateError();
  }
  return normalizeMengantarEstimateServices(fixture.response.body.data, request);
}
