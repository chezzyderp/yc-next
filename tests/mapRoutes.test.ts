import { describe, expect, it } from "vitest";
import path from "node:path";

import mapRoutes from "../src/build/mapRoutes.js";
import { createTempDir, removeDir, writeFile } from "./helpers.js";

describe("mapRoutes", () => {
  it("detects app, api, and page routes", async () => {
    const dir = await createTempDir("map-routes");
    const serverDir = path.join(dir, "server");
    await writeFile(path.join(serverDir, "app/users/route.js"), "export default function handler() {}");
    await writeFile(path.join(serverDir, "app/dashboard/page.js"), "export default function Page() {}");
    await writeFile(path.join(serverDir, "pages/api/test.js"), "export default function handler() {}");
    await writeFile(path.join(serverDir, "pages/blog.js"), "export default function handler() {}");

    const result = await mapRoutes({ distDir: serverDir });
    const paths = result.routes.map((route) => route.path).sort();
    expect(paths).toEqual(["/api/test", "/blog", "/dashboard", "/users"]);

    await removeDir(dir);
  });

  it("reads middleware manifest when present", async () => {
    const dir = await createTempDir("map-routes-manifest");
    const serverDir = path.join(dir, "server");
    await writeFile(path.join(serverDir, "middleware-manifest.json"), JSON.stringify({
      middleware: {
        "src/middleware": {
          name: "middleware",
          files: ["middleware.js"],
          matchers: [{ regexp: "/.*" }],
        },
      },
    }));
    await writeFile(path.join(serverDir, "middleware.js"), "export default function middleware() {}");

    const result = await mapRoutes({ distDir: serverDir });
    expect(result.middleware).toHaveLength(1);
    expect(result.middleware[0].entrypoint).toContain("middleware.js");

    await removeDir(dir);
  });
});
