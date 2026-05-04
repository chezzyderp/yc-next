import path from "node:path";
import { promises as fs } from "node:fs";
import { createWriteStream } from "node:fs";
import archiver from "archiver";

export default async function createZip({
  sourceDir,
  outputFile,
}: {
  sourceDir: string;
  outputFile: string;
}) {
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.rm(outputFile, { force: true }).catch(() => {});

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
