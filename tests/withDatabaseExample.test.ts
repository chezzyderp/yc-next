import { describe, expect, it } from "vitest";

import { parseCreatePostInput } from "../examples/with-database/src/lib/post-input.js";

describe("with-database post input parser", () => {
  it("accepts a valid title/content payload and trims whitespace", () => {
    expect(
      parseCreatePostInput({
        title: "  Hello Prisma  ",
        content: "  Running on Yandex Cloud  ",
      }),
    ).toEqual({
      title: "Hello Prisma",
      content: "Running on Yandex Cloud",
    });
  });

  it("rejects a missing or blank title", () => {
    expect(() => parseCreatePostInput({ title: "   " })).toThrow("title is required");
    expect(() => parseCreatePostInput({})).toThrow("title is required");
  });

  it("normalizes empty content to null", () => {
    expect(
      parseCreatePostInput({
        title: "Post",
        content: "   ",
      }),
    ).toEqual({
      title: "Post",
      content: null,
    });
  });
});
