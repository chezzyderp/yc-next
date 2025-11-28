#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcRuntime = path.join(root, "runtime");
const distRuntime = path.join(root, "dist", "runtime");

async function main() {
  await fs.rm(distRuntime, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(distRuntime, { recursive: true });
  await fs.cp(srcRuntime, distRuntime, { recursive: true });
}

main().catch((error) => {
  console.error("Failed to copy runtime files", error);
  process.exitCode = 1;
});
