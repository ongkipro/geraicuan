import "server-only";

import { readFile } from "node:fs/promises";

import { normalizeMengantarProviderIdentifier } from "@/lib/mengantar-order";
import type {
  ShipmentReconciliationLookup,
  ShipmentReconciliationLookupResult,
} from "@/lib/shipment-reconciliation";

const ENABLED_VALUE = "1";
const FIXTURE_FLAG = "GERAICUAN_ENABLE_SANCTIONED_RECONCILIATION_FIXTURE";
const FIXTURE_PATH = "tests/fixtures/mengantar-order.sanitized.json";

type ReconciliationFixture = {
  contract: string;
  paid: {
    response: {
      success: true;
      data: Array<{
        cnote_no: string;
        isPaid: true;
        order_id: string;
      }>;
    };
  };
};

export class SanctionedReconciliationFixtureUnavailableError extends Error {
  constructor() {
    super("Sanctioned reconciliation fixture is unavailable.");
  }
}

export function isSanctionedReconciliationFixtureEnabled() {
  return process.env.NODE_ENV !== "production"
    && process.env[FIXTURE_FLAG] === ENABLED_VALUE;
}

let fixturePromise: Promise<ReconciliationFixture> | undefined;

async function loadFixture() {
  if (!isSanctionedReconciliationFixtureEnabled()) {
    throw new SanctionedReconciliationFixtureUnavailableError();
  }
  fixturePromise ??= readFile(FIXTURE_PATH, "utf8").then((content) => {
    try {
      const fixture = JSON.parse(content) as Partial<ReconciliationFixture>;
      const item = fixture.paid?.response?.data?.[0];
      if (
        fixture.contract !== "Mengantar POST /order sanitized fixture"
        || fixture.paid?.response?.success !== true
        || !item
        || item.isPaid !== true
      ) {
        throw new SanctionedReconciliationFixtureUnavailableError();
      }
      normalizeMengantarProviderIdentifier(
        item.order_id,
        "SANCTIONED_RECONCILIATION_ORDER_ID_UNSAFE",
      );
      normalizeMengantarProviderIdentifier(
        item.cnote_no,
        "SANCTIONED_RECONCILIATION_CNOTE_UNSAFE",
      );
      return fixture as ReconciliationFixture;
    } catch {
      throw new SanctionedReconciliationFixtureUnavailableError();
    }
  });
  return fixturePromise;
}

export const resolveSanctionedReconciliationFixture:
  ShipmentReconciliationLookup = async (key) => {
    const fixture = await loadFixture();
    const item = fixture.paid.response.data[0]!;
    const result: ShipmentReconciliationLookupResult = {
      ...key,
      cnoteNo: item.cnote_no,
      isPaid: item.isPaid,
      providerOrderId: item.order_id,
      status: "ISSUED",
    };
    return result;
  };
