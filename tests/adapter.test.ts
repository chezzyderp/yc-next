import { describe, expect, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import AdmZip from "adm-zip";

import yandexCloudAdapter from "../src/index.js";
import { createTempDir, removeDir, writeFile } from "./helpers.js";

async function createFakeNextBuild(root: string) {
  const dist = path.join(root, ".next");
  const serverDir = path.join(dist, "server");
  const standalone = path.join(dist, "standalone");
  await writeFile(path.join(serverDir, "app/users/route.js"), "module.exports = async () => new Response('ok');");
  await writeFile(path.join(standalone, ".next/server/app/users/route.js"), "module.exports = async () => new Response('ok');");
  // ensure standalone has node_modules placeholder
  await writeFile(path.join(standalone, "package.json"), "{\"type\":\"module\"}");
}

describe("yandexCloudAdapter", () => {
  it("modifies config to standalone", () => {
    const adapter = yandexCloudAdapter();
    const config = adapter.modifyConfig({ experimental: {} });
    expect(config.output).toBe("standalone");
    expect(config.experimental.manualClientBasePath).toBe(true);
  });

  it("builds route bundles", async () => {
    const projectDir = await createTempDir("adapter-build");
    await createFakeNextBuild(projectDir);
    const adapter = yandexCloudAdapter();
    await adapter.onBuildComplete({ build: { dir: projectDir, config: { distDir: ".next" } } });

    const manifestPath = path.join(projectDir, ".next/yc/manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    expect(manifest.bundles).toHaveLength(1);
    const zipFile = manifest.bundles[0].zipFile;
    const zip = new AdmZip(zipFile);
    expect(zip.getEntry("runtime/yc-request.js")).toBeDefined();
    expect(zip.getEntry("index.js")).toBeDefined();

    await removeDir(projectDir);
  });

  it("builds single-function router when configured", async () => {
    const projectDir = await createTempDir("adapter-router");
    await createFakeNextBuild(projectDir);
    const adapter = yandexCloudAdapter({ oneFunction: true, functionName: "all" });
    await adapter.onBuildComplete({ build: { dir: projectDir, config: { distDir: ".next" } } });
    const manifest = JSON.parse(await fs.readFile(path.join(projectDir, ".next/yc/manifest.json"), "utf8"));
    expect(manifest.mode).toBe("single");
    expect(manifest.bundles[0].routes).toHaveLength(1);

    await removeDir(projectDir);
  });
});
