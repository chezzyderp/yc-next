import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { webResponseToYc } = require("../runtime/yc-response.js");

describe("webResponseToYc", () => {
  it("serializes text responses", async () => {
    const response = new Response("hello", { status: 202, headers: { "content-type": "text/plain" } });
    const yc = await webResponseToYc(response);
    expect(yc.statusCode).toBe(202);
    expect(yc.body).toBe("hello");
    expect(yc.isBase64Encoded).toBe(false);
  });

  it("serializes binary responses as base64", async () => {
    const buffer = new Uint8Array([0, 1, 2]);
    const response = new Response(buffer, { headers: { "content-type": "application/octet-stream" } });
    const yc = await webResponseToYc(response);
    expect(yc.body).toBe(Buffer.from(buffer).toString("base64"));
    expect(yc.isBase64Encoded).toBe(true);
  });
});
