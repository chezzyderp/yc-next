export interface CreatePostInput {
  title: string;
  content: string | null;
}

export function parseCreatePostInput(payload: unknown): CreatePostInput {
  const body = payload as Record<string, unknown> | null | undefined;
  const title = typeof body?.title === "string" ? body.title.trim() : "";

  if (!title) {
    throw new Error("title is required");
  }

  const rawContent = typeof body?.content === "string" ? body.content.trim() : "";

  return {
    title,
    content: rawContent ? rawContent : null,
  };
}
