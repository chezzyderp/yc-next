import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { promises as fsp } from "node:fs";
import AdmZip from "adm-zip";

import { readFileSync } from "node:fs";

const exampleDir = path.resolve(__dirname, "../examples/example-next-app");
const yandexCloudYcDir = path.join(exampleDir, ".next/yc");
const manifestPath = path.join(yandexCloudYcDir, "manifest.json");
const hasBuild = existsSync(manifestPath);
const bundleZipPath = hasBuild
  ? path.resolve(yandexCloudYcDir, JSON.parse(readFileSync(manifestPath, "utf8")).bundles[0].zipFile)
  : "";

async function unpackBundle(zipPath: string) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "yc-e2e-"));
  const zip = new AdmZip(zipPath);

  zip.extractAllTo(dir, true);

  return dir;
}

interface YcResponse {
  statusCode: number;
  headers: Record<string, string>;
  isBase64Encoded: boolean;
  body: string;
}

function invokeHandler(bundleDir: string, event: Record<string, unknown>): YcResponse {
  const script = `
    const mod = require(${JSON.stringify(path.join(bundleDir, "index.js"))});
    const event = ${JSON.stringify(event)};
    mod.handler(event)
      .then((result) => process.stdout.write("\\n__YC_RESULT__" + JSON.stringify(result) + "__YC_RESULT__"))
      .catch((err) => { console.error(err?.stack ?? err); process.exit(1); });
  `;
  const result = spawnSync("node", ["-e", script], {
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
  });

  if (result.status !== 0) {
    throw new Error(`handler crashed (exit ${result.status}):\n${result.stderr}`);
  }

  const match = result.stdout.match(/__YC_RESULT__([\s\S]+?)__YC_RESULT__/);

  if (!match) {
    throw new Error(`could not parse handler output:\n${result.stdout}`);
  }

  return JSON.parse(match[1]);
}

describe.runIf(hasBuild)("end-to-end against example-next-app", () => {
  it("serves an app-route as JSON", async () => {
    const bundleDir = await unpackBundle(bundleZipPath);
    const response = invokeHandler(bundleDir, {
      httpMethod: "GET",
      rawPath: "/api/hello",
      headers: { host: "example.test" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.isBase64Encoded).toBe(false);
    expect(JSON.parse(response.body)).toEqual({
      message: "Hello from Yandex Cloud adapter demo",
    });

    await fsp.rm(bundleDir, { recursive: true, force: true });
  }, 30_000);

  it("serves a server-rendered app page as HTML", async () => {
    const bundleDir = await unpackBundle(bundleZipPath);
    const response = invokeHandler(bundleDir, {
      httpMethod: "GET",
      rawPath: "/",
      headers: { host: "example.test" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"] ?? "").toMatch(/text\/html/);
    expect(response.body).toMatch(/<!DOCTYPE html>/i);

    await fsp.rm(bundleDir, { recursive: true, force: true });
  }, 30_000);
});

describe.skipIf(hasBuild)("end-to-end against example-next-app (skipped)", () => {
  it("skipped: run `npm --prefix example-next-app run build` first", () => {
    expect(true).toBe(true);
  });
});
