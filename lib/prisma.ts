import { PrismaClient } from "@/prisma/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { env } from "@/env";

const globalForPrisma = global as unknown as {
  prisma: PrismaClient;
};

const pgAdapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const neonAdaptor = new PrismaNeon({
  connectionString: env.DATABASE_URL,
});

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter: env.VERCEL === "1" ? neonAdaptor : pgAdapter,
  });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export { prisma };
