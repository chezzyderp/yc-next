import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    DEMO_MESSAGE: process.env.DEMO_MESSAGE ?? null,
    DATABASE_URL_SET: typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.length > 0,
    NODE_ENV: process.env.NODE_ENV ?? null,
  });
}
