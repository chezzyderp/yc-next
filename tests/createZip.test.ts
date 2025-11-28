import { describe, expect, it } from "vitest";
import path from "node:path";
import AdmZip from "adm-zip";

import createZip from "../src/build/createZip.js";
import { createTempDir, removeDir, writeFile } from "./helpers.js";

describe("createZip", () => {
  it("packs directory contents", async () => {
    const dir = await createTempDir("zip");
    const source = path.join(dir, "source");
    const target = path.join(dir, "bundle.zip");
    await writeFile(path.join(source, "file.txt"), "hello");

    await createZip({ sourceDir: source, outputFile: target });

    const zip = new AdmZip(target);
    const entry = zip.getEntry("file.txt");
    expect(entry).toBeDefined();
    expect(zip.readAsText(entry!)).toBe("hello");

    await removeDir(dir);
  });
});
