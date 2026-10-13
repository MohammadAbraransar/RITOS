import { PrismaClient } from "@prisma/client";
import { config } from "@/server/config";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Every interactive transaction: a remote database needs more than Prisma's 5s / 2s defaults.
    transactionOptions: { timeout: config.dbTransactionTimeoutMs, maxWait: config.dbTransactionMaxWaitMs },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
