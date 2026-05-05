import { NextResponse } from "next/server";

import { parseCreatePostInput } from "@/lib/post-input";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const posts = await prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({ posts });
  } catch {
    return NextResponse.json({ error: "failed to load posts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = parseCreatePostInput(await request.json());
    const post = await prisma.post.create({ data: input });

    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "title is required") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "failed to create post" }, { status: 500 });
  }
}
