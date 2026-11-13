import { Pool, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

neonConfig.webSocketConstructor = WebSocket;

// Use the Neon POOLER connection URL. WebSockets support interactive transactions;
// unlike HTTP-only queries, joins/locks/atomic membership renewals remain safe.
const globalForDb = globalThis as unknown as { fitnessPool?: Pool };
function getPool() {
  if (!globalForDb.fitnessPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not configured. Add it to .env.local or your production environment.");
    globalForDb.fitnessPool = new Pool({ connectionString, max: 5 });
  }
  return globalForDb.fitnessPool;
}

// Lazy connection lets a credential-free demo build and render without connecting.
export const db = drizzle({ client: getPool(), schema });
