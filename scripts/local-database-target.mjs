// T-198: the target guard of `pnpm db:seed-local`. A hostname check on
// `new URL()` alone is not enough: pg honours query parameters, so
// `postgres://u:p@127.0.0.1/geraicuan_test?host=db.remote.example` passes a
// hostname check and connects remotely. The string is parsed with pg's own
// parser, every field is checked, and the caller connects with these fields,
// never with the connection string.
//
// No hostname guard can see through a tunnel: a 127.0.0.1 port forwarded to a
// remote server passes this check (README, "Local demo data").
import { createRequire } from "node:module";

// pg-connection-string is not a direct dependency; resolve the copy pg itself uses.
const pgRequire = createRequire(createRequire(import.meta.url).resolve("pg"));
const { parse } = pgRequire("pg-connection-string");

export const LOCAL_SEED_DATABASE = /^(geraicuan_test|geraicuan_[a-z0-9]+_seed)$/;

const REFUSAL =
  "This seeder only permits the local geraicuan_test database or a disposable geraicuan_<name>_seed database on 127.0.0.1, given as postgres://user:password@127.0.0.1:port/database with no query parameters.";

/** The only fields a local target may carry; anything else (host, options, ssl…) is a refusal. */
const FIELDS = new Set(["database", "host", "password", "port", "user"]);

/**
 * Returns `{ host, port, database, user, password }` for a local seed target, or
 * throws without echoing the URL (it carries a password).
 */
export function resolveLocalSeedTarget(databaseUrl) {
  if (
    typeof databaseUrl !== "string"
    || !/^postgres(ql)?:\/\/[^/?#\s]*@?[^/?#\s]+\/[^/?#\s]+$/.test(databaseUrl)
  ) {
    throw new Error(REFUSAL);
  }
  let config;
  try {
    config = parse(databaseUrl);
  } catch {
    throw new Error(REFUSAL);
  }
  const extra = Object.entries(config).some(
    ([key, value]) => !FIELDS.has(key) && value !== undefined && value !== null,
  );
  const port = config.port === "" || config.port === undefined ? 5432 : Number(config.port);
  if (
    extra
    // Exactly the IPv4 loopback: no `localhost` (it may resolve elsewhere), no
    // unix socket path, no IPv6.
    || config.host !== "127.0.0.1"
    || !Number.isInteger(port) || port < 1 || port > 65_535
    || typeof config.database !== "string" || !LOCAL_SEED_DATABASE.test(config.database)
    || typeof config.user !== "string" || config.user.length === 0
  ) {
    throw new Error(REFUSAL);
  }
  return {
    database: config.database,
    host: config.host,
    password: config.password || undefined,
    port,
    user: config.user,
  };
}
