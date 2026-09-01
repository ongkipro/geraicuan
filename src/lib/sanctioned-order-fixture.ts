import "server-only";

import { readFile } from "node:fs/promises";

import type {
  MengantarOrderTransportLookup,
  MengantarOrderTransportBinding,
} from "@/lib/mengantar-order";

const ENABLED_VALUE = "1";
const FIXTURE_FLAG = "GERAICUAN_ENABLE_SANCTIONED_ORDER_FIXTURE";
const FIXTURE_PATH = "tests/fixtures/mengantar-order.sanitized.json";

type PaidOrderFixture = {
  contract: string;
  paid: {
    response: {
      success: true;
      data: Array<{
        order_id: string;
        isPaid: true;
        cnote_no: string;
      }>;
    };
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
      typeof first.order_id !== "string" ||
      first.order_id.trim().length === 0 ||
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
        async submit(orders) {
          if (orders.length !== 1) {
            throw new SanctionedOrderFixtureUnavailableError();
          }
          return {
            success: true,
            data: [
              {
                order_id: item.order_id,
                isPaid: item.isPaid,
                cnote_no: item.cnote_no,
              },
            ],
          };
        },
      },
    };
    return binding;
  };
