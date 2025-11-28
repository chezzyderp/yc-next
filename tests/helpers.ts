import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export async function createTempDir(prefix = "yc-adapter-test") {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  return dir;
}

export async function ensureDir(target: string) {
  await fs.mkdir(target, { recursive: true });
}

export async function writeFile(filePath: string, contents: string) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, contents, "utf8");
}

export async function removeDir(target: string) {
  await fs.rm(target, { recursive: true, force: true });
}
