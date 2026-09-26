import "server-only";

import { readFile } from "node:fs/promises";

import type {
  MengantarPayUnpaidTransportBinding,
  MengantarPayUnpaidTransportLookup,
} from "@/lib/mengantar-unpaid-recovery";

const ENABLED_VALUE = "1";
const FIXTURE_FLAG = "GERAICUAN_ENABLE_SANCTIONED_UNPAID_RECOVERY_FIXTURE";
const FIXTURE_PATH = "tests/fixtures/mengantar-pay-unpaid.sanitized.json";
const SAFE_PROVIDER_VALUE = /^[A-Z0-9-]{1,160}$/;

/** Documented shape (T-237): request `{courier, batch_id}`, response `{success, data: <count>, cnote_no}`. */
type PayUnpaidFixture = {
  contract: string;
  issued: {
    request: { batch_id: string; courier: string };
    response: {
      success: true;
      data: 1;
      cnote_no: [string];
    };
  };
};

export class SanctionedUnpaidRecoveryFixtureUnavailableError extends Error {
  constructor() {
    super("Sanctioned unpaid recovery fixture is unavailable.");
  }
}

export function isSanctionedUnpaidRecoveryFixtureEnabled() {
  return (
    process.env.NODE_ENV !== "production"
    && process.env[FIXTURE_FLAG] === ENABLED_VALUE
  );
}

let fixturePromise: Promise<PayUnpaidFixture> | undefined;

async function loadPayUnpaidFixture(): Promise<PayUnpaidFixture> {
  if (!isSanctionedUnpaidRecoveryFixtureEnabled()) {
    throw new SanctionedUnpaidRecoveryFixtureUnavailableError();
  }

  fixturePromise ??= readFile(FIXTURE_PATH, "utf8").then((content) => {
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      throw new SanctionedUnpaidRecoveryFixtureUnavailableError();
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new SanctionedUnpaidRecoveryFixtureUnavailableError();
    }
    const fixture = value as Partial<PayUnpaidFixture>;
    const request = fixture.issued?.request;
    const response = fixture.issued?.response;
    const cnoteNo = response?.cnote_no?.[0];
    if (
      fixture.contract !== "Mengantar POST /order/pay-unpaid sanitized fixture"
      || response?.success !== true
      || response.data !== 1
      || !request
      || typeof request.batch_id !== "string"
      || !SAFE_PROVIDER_VALUE.test(request.batch_id)
      || typeof request.courier !== "string"
      || !SAFE_PROVIDER_VALUE.test(request.courier)
      || !Array.isArray(response.cnote_no)
      || response.cnote_no.length !== 1
      || typeof cnoteNo !== "string"
      || !SAFE_PROVIDER_VALUE.test(cnoteNo)
    ) {
      throw new SanctionedUnpaidRecoveryFixtureUnavailableError();
    }

    return fixture as PayUnpaidFixture;
  });

  return fixturePromise;
}

export const resolveSanctionedUnpaidRecoveryFixtureTransport:
  MengantarPayUnpaidTransportLookup = async (scope) => {
    const fixture = await loadPayUnpaidFixture();
    const expected = fixture.issued.request;
    const response = fixture.issued.response;
    const binding: MengantarPayUnpaidTransportBinding = {
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      pickupAddressId: scope.pickupAddressId,
      credentialSource: scope.credentialSource,
      accountIdentity:
        scope.credentialSource === "platform_default"
          ? "platform_default"
          : `managed://mengantar/${scope.tenantId}/${scope.outletId}`,
      transport: {
        async payUnpaid(request) {
          if (
            request.batch_id !== expected.batch_id
            || request.courier.trim().toUpperCase()
              !== expected.courier.trim().toUpperCase()
          ) {
            throw new SanctionedUnpaidRecoveryFixtureUnavailableError();
          }
          return {
            success: true,
            data: response.data,
            cnote_no: [...response.cnote_no],
          };
        },
      },
    };
    return binding;
  };
