import path from "node:path";
import { promises as fs } from "node:fs";
import { createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import archiver from "archiver";

export default async function createZip({ sourceDir, outputFile }: { sourceDir: string; outputFile: string }) {
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.rm(outputFile, { force: true }).catch(() => {});

  try {
    await zipWithArchiver(sourceDir, outputFile);
  } catch (error) {
    await zipWithCli(sourceDir, outputFile);
  }
}

async function zipWithArchiver(sourceDir: string, outputFile: string) {
  await new Promise<void>((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const stream = createWriteStream(outputFile);
    stream.on("close", resolve);
    stream.on("error", reject);
    archive.on("error", reject);
    archive.pipe(stream);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function zipWithCli(sourceDir: string, outputFile: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("zip", ["-qr", outputFile, "."], { cwd: sourceDir, stdio: "inherit" });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`zip command exited with code ${code}`));
    });
  });
}
