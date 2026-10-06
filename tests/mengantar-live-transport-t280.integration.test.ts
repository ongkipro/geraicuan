import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MengantarHttpTransportError,
  mengantarAnswerMessage,
  requestMengantar,
} from "@/lib/mengantar-http";
import {
  isLiveMengantarOrdersEnabled,
  LiveMengantarOrdersDisabledError,
  resolveLiveMengantarOrderTransport,
} from "@/lib/mengantar-live-transport";
import {
  MengantarOrderConflictError,
  MengantarOrderRefusedError,
  MengantarOrderSubmissionUnknownError,
  readMengantarOrderAnswer,
} from "@/lib/mengantar-order";

// T-280 (D-42): the live client, without the network. A synthetic key only.
const credentials = { apiKey: "SYNTHETIC-KEY/with?chars", baseUrl: "https://api.mengantar.test/" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  vi.stubGlobal("fetch", async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ init, url });
    return handler(url, init);
  });
  return calls;
}

describe("requestMengantar (T-280)", () => {
  it("builds the documented credential-bearing URL server-side and sends JSON once, with no redirect", async () => {
    const calls = stubFetch(() => new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }));
    const answer = await requestMengantar(credentials, "POST", "/order", { body: { courier: "JNE" } });

    expect(answer).toEqual({ body: { data: [], success: true }, status: 200 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.origin).toBe("https://api.mengantar.test");
    expect(calls[0]!.url.pathname).toBe(`/api/public/${encodeURIComponent(credentials.apiKey)}/order`);
    expect(calls[0]!.init).toMatchObject({ body: JSON.stringify({ courier: "JNE" }), cache: "no-store", method: "POST", redirect: "error" });
    expect((calls[0]!.init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("returns any HTTP status with its body, and an empty or non-JSON body as undefined", async () => {
    stubFetch(() => new Response("<html>bad gateway</html>", { status: 502 }));
    expect(await requestMengantar(credentials, "GET", "/order", { query: { order_id: "X1" } })).toEqual({ body: undefined, status: 502 });
    const calls = stubFetch(() => new Response(null, { status: 204 }));
    expect(await requestMengantar(credentials, "DELETE", "/order", { body: { ids: ["a"] } })).toEqual({ body: undefined, status: 204 });
    expect(calls[0]!.init.method).toBe("DELETE");
  });

  it("throws one credential-free error on network failure, redirect, or an oversize body", async () => {
    stubFetch(() => { throw new TypeError(`fetch failed for https://api.mengantar.test/api/public/${credentials.apiKey}/order`); });
    const failure = await requestMengantar(credentials, "POST", "/order", { body: {} }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MengantarHttpTransportError);
    expect(String((failure as Error).message)).not.toContain("SYNTHETIC-KEY");
    expect(JSON.stringify(failure)).not.toContain("SYNTHETIC-KEY");

    stubFetch(() => new Response("x".repeat(1_000_001), { status: 200 }));
    await expect(requestMengantar(credentials, "GET", "/order")).rejects.toBeInstanceOf(MengantarHttpTransportError);
  });

  it("refuses a base URL that is not a bare https origin, and an empty key, before any request", async () => {
    const calls = stubFetch(() => new Response("{}", { status: 200 }));
    for (const baseUrl of ["http://api.mengantar.test/", "https://user:pw@api.mengantar.test/", "https://api.mengantar.test/v1", "not a url"]) {
      await expect(requestMengantar({ ...credentials, baseUrl }, "GET", "/order")).rejects.toBeInstanceOf(MengantarHttpTransportError);
    }
    await expect(requestMengantar({ ...credentials, apiKey: " " }, "GET", "/order")).rejects.toBeInstanceOf(MengantarHttpTransportError);
    expect(calls).toHaveLength(0);
  });
});

describe("readMengantarOrderAnswer (T-280, T-227 #2)", () => {
  it("retries 409, refuses 400/403 (nothing created), and leaves every other outcome unknown, 422 included", () => {
    expect(() => readMengantarOrderAnswer({ body: {}, status: 409 })).toThrow(MengantarOrderConflictError);
    for (const status of [400, 403]) {
      const error = (() => { try { readMengantarOrderAnswer({ body: { message: "COURIER_DISABLED" }, status }); } catch (caught) { return caught; } })();
      expect(error).toBeInstanceOf(MengantarOrderRefusedError);
      expect(error).toMatchObject({ providerMessage: "COURIER_DISABLED", safeCode: `ORDER_PROVIDER_REFUSED_${status}` });
    }
    for (const status of [401, 404, 422, 500, 502, 504]) {
      expect(() => readMengantarOrderAnswer({ body: {}, status })).toThrow(MengantarOrderSubmissionUnknownError);
    }
    expect(() => readMengantarOrderAnswer({ body: undefined, status: 200 })).toThrow(MengantarOrderSubmissionUnknownError);
    expect(readMengantarOrderAnswer({ body: { success: true }, status: 200 })).toEqual({ success: true });
  });

  it("keeps only a short, credential-free provider message", () => {
    expect(mengantarAnswerMessage({ message: "invalid\u0000 pickup\n time" })).toBe("invalid pickup time");
    expect(mengantarAnswerMessage({ error: "x".repeat(500) })).toHaveLength(200);
    expect(mengantarAnswerMessage({ message: "see https://h/api/public/KEY/order" })).toBeNull();
    expect(mengantarAnswerMessage(["message"])).toBeNull();
    expect(mengantarAnswerMessage(undefined)).toBeNull();
    // A message quoting the key itself never reaches the operator.
    expect(mengantarAnswerMessage({ message: "bad key SECRET-123" }, "SECRET-123")).toBeNull();
    expect(mengantarAnswerMessage({ message: "bad key SECRET-123" }, "OTHER")).toBe("bad key SECRET-123");
    expect(mengantarAnswerMessage({ message: "bad key A%2FB" }, "A/B")).toBeNull();
  });
});

describe("the live switch (D-42, D-5)", () => {
  it("is off unless MENGANTAR_LIVE_ORDERS_ENABLED=1, and production also needs its own approval flag", () => {
    vi.stubEnv("MENGANTAR_LIVE_ORDERS_ENABLED", "");
    expect(isLiveMengantarOrdersEnabled()).toBe(false);
    vi.stubEnv("MENGANTAR_LIVE_ORDERS_ENABLED", "1");
    vi.stubEnv("NODE_ENV", "test");
    expect(isLiveMengantarOrdersEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MENGANTAR_LIVE_ORDERS_PRODUCTION_APPROVED", "");
    expect(isLiveMengantarOrdersEnabled()).toBe(false);
    vi.stubEnv("MENGANTAR_LIVE_ORDERS_PRODUCTION_APPROVED", "1");
    expect(isLiveMengantarOrdersEnabled()).toBe(true);
  });

  it("resolves no transport, and reads no credential, while switched off", async () => {
    vi.stubEnv("MENGANTAR_LIVE_ORDERS_ENABLED", "0");
    const tx = new Proxy({}, { get() { throw new Error("credentials were read"); } });
    await expect(resolveLiveMengantarOrderTransport(
      { courier: "JNE", credentialSource: "platform_default", outletId: "o", pickupAddressId: "p", tenantId: "t" },
      tx as never,
      { role: "OPERATOR", tenantId: "t", userId: "u" } as never,
    )).rejects.toBeInstanceOf(LiveMengantarOrdersDisabledError);
  });
});
