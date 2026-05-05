import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTempDir, removeDir, writeFile } from "./helpers.js";
import { collectRuntimeEnv } from "../src/cli/commands/deploy.js";

const ORIGINAL_ENV = process.env;

describe("collectRuntimeEnv", () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it("merges env-file, inline env, and adapter-declared runtimeEnv with adapter values winning", async () => {
    const dir = await createTempDir("deploy-env");
    const envFile = path.join(dir, "runtime.env");

    await writeFile(
      envFile,
      [
        "DATABASE_URL=postgres://from-file",
        "DEMO_MESSAGE=from-file",
        "SHARED=file",
        "",
      ].join("\n"),
    );

    process.env = {
      ...ORIGINAL_ENV,
      DATABASE_URL: "postgres://from-process",
      FROM_PROCESS: "only-process",
    };

    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const runtimeEnv = collectRuntimeEnv({
      declaredKeys: ["DATABASE_URL", "FROM_PROCESS", "MISSING_KEY"],
      envFile,
      inline: ["DEMO_MESSAGE=from-inline", "INLINE_ONLY=inline", "SHARED=inline"],
    });

    expect(runtimeEnv).toEqual({
      DATABASE_URL: "postgres://from-process",
      DEMO_MESSAGE: "from-inline",
      FROM_PROCESS: "only-process",
      INLINE_ONLY: "inline",
      SHARED: "inline",
    });
    expect(stderrWrite).toHaveBeenCalledTimes(1);
    expect(stderrWrite.mock.calls[0]?.[0]).toContain("MISSING_KEY");

    await removeDir(dir);
  });

  it("fails on invalid inline --env syntax", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit:${code ?? ""}`);
    }) as never);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(() =>
      collectRuntimeEnv({
        declaredKeys: [],
        inline: ["BROKEN"],
      }),
    ).toThrow("process.exit:1");
    expect(exit).toHaveBeenCalledWith(1);
    expect(stderrWrite.mock.calls[0]?.[0]).toContain('Invalid --env "BROKEN"');
  });

  it("fails when --env-file path does not exist", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit:${code ?? ""}`);
    }) as never);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(() =>
      collectRuntimeEnv({
        declaredKeys: [],
        envFile: "definitely-missing.env",
        inline: [],
      }),
    ).toThrow("process.exit:1");
    expect(exit).toHaveBeenCalledWith(1);
    expect(stderrWrite.mock.calls[0]?.[0]).toContain("--env-file not found");
  });
});
