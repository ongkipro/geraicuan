import { describe, expect, it } from "vitest";

import { resolveLocalSeedTarget } from "../scripts/local-database-target.mjs";

/**
 * T-198: `pnpm db:seed-local` (and its `--reset`) connects only to a local
 * target. pg honours query parameters over the URL's host, so every override
 * is refused and the seed connects with the parsed fields, never the string.
 */
describe("the local seed target guard", () => {
  it("accepts the loopback test database and a disposable seed database, as explicit fields", () => {
    expect(resolveLocalSeedTarget("postgresql://postgres:s3cr%2Ft@127.0.0.1:55433/geraicuan_test")).toEqual({
      database: "geraicuan_test",
      host: "127.0.0.1",
      password: "s3cr/t",
      port: 55433,
      user: "postgres",
    });
    expect(resolveLocalSeedTarget("postgres://seed@127.0.0.1/geraicuan_demo_seed")).toEqual({
      database: "geraicuan_demo_seed",
      host: "127.0.0.1",
      password: undefined,
      port: 5432,
      user: "seed",
    });
  });

  it.each([
    ["a host query parameter", "postgres://u:p@127.0.0.1/geraicuan_test?host=db.staging.example"],
    ["a port query parameter", "postgres://u:p@127.0.0.1:55433/geraicuan_test?port=6543"],
    ["an options query parameter", "postgres://u:p@127.0.0.1/geraicuan_test?options=-c%20search_path%3Devil"],
    ["an sslmode query parameter", "postgres://u:p@127.0.0.1/geraicuan_test?sslmode=require"],
    ["an ssl query parameter", "postgres://u:p@127.0.0.1/geraicuan_test?ssl=true"],
    ["an empty query", "postgres://u:p@127.0.0.1/geraicuan_test?"],
    ["a fragment", "postgres://u:p@127.0.0.1/geraicuan_test#x"],
    ["a remote host", "postgres://u:p@db.staging.example/geraicuan_test"],
    ["localhost", "postgres://u:p@localhost/geraicuan_test"],
    ["IPv6 loopback", "postgres://u:p@[::1]/geraicuan_test"],
    ["another loopback address", "postgres://u:p@127.0.0.2/geraicuan_test"],
    ["an encoded unix socket host", "postgres://u:p@%2Fvar%2Frun%2Fpostgresql/geraicuan_test"],
    ["a unix socket path", "/var/run/postgresql geraicuan_test"],
    ["the socket scheme", "socket://u:p@/var/run/postgresql?db=geraicuan_test"],
    ["an empty host", "postgres://u:p@/geraicuan_test"],
    ["a production database name", "postgres://u:p@127.0.0.1/geraicuan"],
    ["a database name with a suffix", "postgres://u:p@127.0.0.1/geraicuan_test_other"],
    ["a nested path", "postgres://u:p@127.0.0.1/geraicuan_test/extra"],
    ["no user", "postgres://127.0.0.1/geraicuan_test"],
    ["another scheme", "mysql://u:p@127.0.0.1/geraicuan_test"],
  ])("refuses %s without echoing the URL", (_label, url) => {
    let message = "";
    try {
      resolveLocalSeedTarget(url);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/^This seeder only permits/);
    expect(message).not.toContain(":p@");
  });

  it("the seed script connects with the validated fields, never the connection string", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("scripts/seed-local-dev-users.mjs", "utf8");
    expect(source).toContain("const target = resolveLocalSeedTarget(databaseUrl);");
    expect(source).toMatch(/new Client\(\{ \.\.\.target,/);
    expect(source).not.toMatch(/connectionString/);
  });
});
