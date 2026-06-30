import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function createContext() {
  const { userId } = await auth();

  return {
    db: prisma,
    userId,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
