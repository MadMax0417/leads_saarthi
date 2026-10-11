import "server-only";

import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";
import { describeConnectionFailure, withConnectionRetry } from "@/lib/db-retry";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set.");

// Hard cap per attempt so a hung network cannot stall the whole retry window.
const attemptTimeoutMs = 15_000;

// The Neon HTTP driver reads this hook for every query. Retrying connection
// failures here absorbs scale-to-zero wake-ups and DNS/network blips that
// would otherwise surface as "Failed query: ..." (see lib/db-retry.ts).
neonConfig.fetchFunction = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
  withConnectionRetry(
    () => fetch(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(attemptTimeoutMs)])
        : AbortSignal.timeout(attemptTimeoutMs),
    }),
    {
      onRetry: ({ attempt, attempts, error }) =>
        console.warn(
          `[db] transient connection failure (attempt ${attempt}/${attempts}), retrying: ${describeConnectionFailure(error)}`,
        ),
    },
  );

const client = neon(databaseUrl);

export const db = drizzle({ client, schema });