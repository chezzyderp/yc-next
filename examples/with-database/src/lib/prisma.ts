import { PrismaClient } from "@prisma/client";

declare global {
  interface GlobalThis {
    __prisma__?: PrismaClient;
  }
}

export const prisma =
  globalThis.__prisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma__ = prisma;
}
