import "server-only";

import { readFile } from "node:fs/promises";

import type {
  MengantarOrderTransportLookup,
  MengantarOrderTransportBinding,
} from "@/lib/mengantar-order";

const ENABLED_VALUE = "1";
const FIXTURE_FLAG = "GERAICUAN_ENABLE_SANCTIONED_ORDER_FIXTURE";
const FIXTURE_PATH = "tests/fixtures/mengantar-order.sanitized.json";

/** Documented shapes (T-237, D-26/D-27): `POST /order` item and `POST /time` data. */
type PaidOrderFixture = {
  contract: string;
  paid: {
    response: {
      success: true;
      data: Array<{
        _id: string;
        ORDER_ID: string;
        batch: string;
        batch_id: string;
        isPaid: true;
        cnote_no: string;
      }>;
    };
  };
  pickupTime: {
    response: { success: true; data: { _id: string } };
  };
};

export class SanctionedOrderFixtureUnavailableError extends Error {
  constructor() {
    super("Sanctioned order fixture is unavailable.");
  }
}

export function isSanctionedOrderFixtureEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env[FIXTURE_FLAG] === ENABLED_VALUE
  );
}

let fixturePromise: Promise<PaidOrderFixture> | undefined;

async function loadPaidFixture(): Promise<PaidOrderFixture> {
  if (!isSanctionedOrderFixtureEnabled()) {
    throw new SanctionedOrderFixtureUnavailableError();
  }

  fixturePromise ??= readFile(FIXTURE_PATH, "utf8").then((content) => {
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      throw new SanctionedOrderFixtureUnavailableError();
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new SanctionedOrderFixtureUnavailableError();
    }
    const fixture = value as Partial<PaidOrderFixture>;
    const first = fixture.paid?.response?.data?.[0];
    if (
      fixture.contract !== "Mengantar POST /order sanitized fixture" ||
      fixture.paid?.response?.success !== true ||
      !first ||
      typeof first._id !== "string" ||
      first._id.trim().length === 0 ||
      typeof first.batch_id !== "string" ||
      typeof fixture.pickupTime?.response?.data?._id !== "string" ||
      first.isPaid !== true ||
      typeof first.cnote_no !== "string" ||
      first.cnote_no.trim().length === 0
    ) {
      throw new SanctionedOrderFixtureUnavailableError();
    }

    return fixture as PaidOrderFixture;
  });

  return fixturePromise;
}

export const resolveSanctionedOrderFixtureTransport: MengantarOrderTransportLookup =
  async (scope) => {
    const fixture = await loadPaidFixture();
    const item = fixture.paid.response.data[0]!;
    const binding: MengantarOrderTransportBinding = {
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      pickupAddressId: scope.pickupAddressId,
      credentialSource: scope.credentialSource,
      accountIdentity:
        scope.credentialSource === "platform_default"
          ? "platform_default"
          : `managed://mengantar/${scope.tenantId}/${scope.outletId}`,
      transport: {
        async submit(body) {
          if (body.orders.length !== 1 || body.pickup.address_id !== scope.pickupAddressId) {
            throw new SanctionedOrderFixtureUnavailableError();
          }
          return {
            success: true,
            data: [{ ...item }],
            batch: item.batch,
            batch_id: item.batch_id,
            courier: body.courier,
            errors: [],
          };
        },
        // Echoes the request like the documented `POST /time` response does.
        async reservePickupTime(request) {
          const data = fixture.pickupTime.response.data;
          return {
            success: true,
            data: { ...data, time: request.time, address: { _id: request.address_id } },
          };
        },
      },
    };
    return binding;
  };
