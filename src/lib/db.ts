import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./env";

const globalDb = globalThis as typeof globalThis & { tourflowDb?: PrismaClient };

export function getDb(): PrismaClient {
  if (!globalDb.tourflowDb) globalDb.tourflowDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: getDatabaseUrl() }) });
  return globalDb.tourflowDb;
}
