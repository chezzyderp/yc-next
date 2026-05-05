import { spawnSync } from "node:child_process";

const from = process.argv[2] || process.env.GITHUB_BASE_SHA;
const to = process.argv[3] || process.env.GITHUB_HEAD_SHA;

if (!from || !to) {
  process.stderr.write("Expected commit range: <from> <to>\n");
  process.exit(1);
}

const result = spawnSync(
  "npm",
  ["exec", "commitlint", "--", "--from", from, "--to", to, "--verbose"],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

process.exit(result.status ?? 1);
