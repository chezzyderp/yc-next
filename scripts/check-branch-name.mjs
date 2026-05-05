import { execSync } from "node:child_process";

const ALLOWED_BRANCH_NAME =
  /^(main|(?:feat|fix|chore|docs|refactor|test|ci)\/[a-z0-9]+(?:-[a-z0-9]+)*|release\/[a-z0-9]+(?:[.-][a-z0-9]+)*)$/;

export function isAllowedBranchName(name) {
  return ALLOWED_BRANCH_NAME.test(name);
}

export function getCurrentBranchName() {
  if (process.env.GITHUB_HEAD_REF) {
    return process.env.GITHUB_HEAD_REF;
  }

  if (process.env.GITHUB_REF_NAME) {
    return process.env.GITHUB_REF_NAME;
  }

  if (process.argv[2]) {
    return process.argv[2];
  }

  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

export function formatBranchNameError(name) {
  return [
    `Invalid branch name: "${name}"`,
    "Allowed patterns:",
    "  main",
    "  feat/<short-name>",
    "  fix/<short-name>",
    "  chore/<short-name>",
    "  docs/<short-name>",
    "  refactor/<short-name>",
    "  test/<short-name>",
    "  ci/<short-name>",
    "  release/<short-name>",
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const branchName = getCurrentBranchName();

  if (!isAllowedBranchName(branchName)) {
    process.stderr.write(`${formatBranchNameError(branchName)}\n`);
    process.exit(1);
  }
}
