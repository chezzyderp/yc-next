import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ycEventToRequest } = require("../runtime/yc-request.js");

describe("ycEventToRequest", () => {
  it("converts YC HTTP event into Request", async () => {
    const event = {
      httpMethod: "post",
      headers: {
        host: "example.test",
        "x-forwarded-proto": "https",
        "content-type": "application/json",
      },
      body: Buffer.from(JSON.stringify({ ok: true })).toString("base64"),
      isBase64Encoded: true,
      rawPath: "/api/demo",
      queryStringParameters: { value: "42" },
    };

    const request = await ycEventToRequest(event);
    expect(request.method).toBe("POST");
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(new URL(request.url).href).toBe("https://example.test/api/demo?value=42");
    expect(await request.json()).toEqual({ ok: true });
  });

  it("omits body for GET", async () => {
    const event = {
      httpMethod: "GET",
      headers: { host: "example.test" },
      body: Buffer.from("ignored").toString("base64"),
      isBase64Encoded: true,
      rawPath: "/",
    };

    const request = await ycEventToRequest(event);
    expect(request.method).toBe("GET");
    expect(request.bodyUsed).toBe(false);
  });
});
