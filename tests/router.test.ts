import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createRouter } = require("../runtime/router.js");
const { ycEventToRequest } = require("../runtime/yc-request.js");
const { webResponseToYc } = require("../runtime/yc-response.js");

describe("router", () => {
  it("dispatches to matching route", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const router = createRouter(
      [
        {
          path: "/api/test",
          pattern: "^/api/test/?$",
          load: () => ({ default: handler }),
        },
      ],
      { ycEventToRequest, webResponseToYc },
    );

    const result = await router({ rawPath: "/api/test", headers: { host: "example.test" } });
    expect(handler).toHaveBeenCalledOnce();
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe("ok");
  });

  it("returns 404 when no match", async () => {
    const router = createRouter([], { ycEventToRequest, webResponseToYc });
    const result = await router({ rawPath: "/missing", headers: { host: "example.test" } });
    expect(result.statusCode).toBe(404);
  });
});
