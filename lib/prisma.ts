import { env } from "@/env";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/prisma/generated/prisma/client";

/**
 * The whole client is cached on the global, in every environment.
 *
 * Previously both a `PrismaPg` and a `PrismaNeon` pool were constructed at
 * module load — one of them always thrown away — and only the `PrismaClient`
 * was cached, and only outside production. Each dev hot-reload therefore leaked
 * two connection pools. Building the adapter inside the factory means exactly
 * one pool is ever created, and only on the first call.
 */
const globalForPrisma = global as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  // Neon's serverless driver over HTTP on Vercel; node-postgres locally.
  // Both read the validated env value, so there is one source of truth for the
  // connection string.
  const adapter =
    env.VERCEL === "1"
      ? new PrismaNeon({ connectionString: env.DATABASE_URL })
      : new PrismaPg({ connectionString: env.DATABASE_URL });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;
