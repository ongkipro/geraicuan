import { describe, expect, it } from "vitest";

import {
  createTypeaheadRunner,
  degradesAutoSearch,
  type TypeaheadOutcome,
  type TypeaheadState,
} from "@/lib/use-typeahead-search";

/**
 * T-245 step a: the busy degrade. The server holds one advisory lock per tenant+actor while a
 * provider search runs (`withLocationSearchConcurrencyGuard`), so a second search that starts
 * before the first returns is refused with `busy`. The client used to fire a new search on
 * every 350 ms pause regardless of an in-flight one, and mapped `busy` to "stop auto-searching",
 * so typing through a slow provider answer silently froze the typeahead behind "Coba lagi".
 * The runner below is the scheduling the hook uses; these cases pin the fixed behaviour.
 */

type Deferred = { query: string; resolve: (outcome: TypeaheadOutcome<string>) => void };

function harness() {
  const calls: Deferred[] = [];
  const states: TypeaheadState<string>[] = [];
  const runner = createTypeaheadRunner<string>({
    cache: new Map(),
    minLength: 3,
    onState: (state) => states.push(state),
    scope: () => "outlet-1",
    search: (query) => new Promise((resolve) => calls.push({ query, resolve })),
  });
  return { calls, runner, states, last: () => states.at(-1) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** What the pickers pass back: the server's `busy` answer, degrade decided by the shared rule. */
function serverAnswer(error?: string): TypeaheadOutcome<string> {
  return error
    ? { degrade: degradesAutoSearch(error), error, items: [], message: "x", success: false }
    : { items: ["Dago, Coblong"], success: true };
}

describe("typeahead scheduling against a single-flight server lock", () => {
  it("never starts a second search while one is in flight, then runs only the latest query", async () => {
    const { calls, runner, last } = harness();
    runner.request("Dag");
    runner.request("Dago");
    runner.request("Dago B");
    // One request reaches the server; the refinements wait instead of colliding with the lock.
    expect(calls.map((call) => call.query)).toEqual(["Dag"]);
    expect(last()?.loading).toBe(true);

    calls[0].resolve(serverAnswer());
    await settle();
    // The stale answer is not shown; the latest query goes next, exactly once.
    expect(calls.map((call) => call.query)).toEqual(["Dag", "Dago B"]);
    expect(last()?.loading).toBe(true);

    calls[1].resolve({ items: ["Dago, Coblong, Kota Bandung"], success: true });
    await settle();
    expect(last()).toMatchObject({ degraded: false, items: ["Dago, Coblong, Kota Bandung"], loading: false, query: "Dago B" });
  });

  it("keeps auto-searching after a busy refusal (from another tab or a save in progress)", async () => {
    const { calls, runner, last } = harness();
    runner.request("Coblong");
    calls[0].resolve(serverAnswer("busy"));
    await settle();
    expect(last()).toMatchObject({ degraded: false, error: "busy", loading: false });

    runner.request("Coblong Bandung");
    expect(calls.map((call) => call.query)).toEqual(["Coblong", "Coblong Bandung"]);
    calls[1].resolve(serverAnswer());
    await settle();
    expect(last()).toMatchObject({ degraded: false, items: ["Dago, Coblong"], searched: true });
  });

  it("still stops auto-searching on the durable rate limit, until an explicit retry", async () => {
    const { calls, runner, last } = harness();
    runner.request("Coblong");
    calls[0].resolve(serverAnswer("rate_limited"));
    await settle();
    expect(last()).toMatchObject({ degraded: true, error: "rate_limited" });

    runner.request("Coblong Bandung");
    expect(calls).toHaveLength(1);
    runner.retry("Coblong Bandung");
    expect(calls.map((call) => call.query)).toEqual(["Coblong", "Coblong Bandung"]);
  });

  it("turns a rejected Server Action into a retryable error instead of an endless spinner", async () => {
    const calls: string[] = [];
    const states: TypeaheadState<string>[] = [];
    const runner = createTypeaheadRunner<string>({
      cache: new Map(),
      minLength: 3,
      onState: (state) => states.push(state),
      scope: () => "outlet-1",
      search: async (query) => {
        calls.push(query);
        throw new Error("network");
      },
    });
    runner.request("Coblong");
    await settle();
    expect(states.at(-1)).toMatchObject({ degraded: false, error: "unavailable", loading: false });
    runner.request("Coblong Ban");
    await settle();
    expect(calls).toEqual(["Coblong", "Coblong Ban"]);
  });
});
