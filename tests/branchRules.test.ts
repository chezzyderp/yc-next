import { describe, expect, it } from "vitest";

import { isAllowedBranchName } from "../scripts/check-branch-name.mjs";

describe("branch naming policy", () => {
  it("accepts the allowed prefixed branch names", () => {
    expect(isAllowedBranchName("feat/runtime-env")).toBe(true);
    expect(isAllowedBranchName("fix/publish-flow")).toBe(true);
    expect(isAllowedBranchName("chore/release-setup")).toBe(true);
    expect(isAllowedBranchName("docs/readme-assets")).toBe(true);
    expect(isAllowedBranchName("refactor/adapter-manifest")).toBe(true);
    expect(isAllowedBranchName("test/deploy-precedence")).toBe(true);
    expect(isAllowedBranchName("ci/branch-policy")).toBe(true);
    expect(isAllowedBranchName("release/0.2.1")).toBe(true);
  });

  it("accepts protected default branches that CI may run on", () => {
    expect(isAllowedBranchName("main")).toBe(true);
  });

  it("rejects non-conforming branch names", () => {
    expect(isAllowedBranchName("feature/runtime-env")).toBe(false);
    expect(isAllowedBranchName("hotfix/publish-flow")).toBe(false);
    expect(isAllowedBranchName("bugfix/thing")).toBe(false);
    expect(isAllowedBranchName("my-branch")).toBe(false);
    expect(isAllowedBranchName("feat")).toBe(false);
    expect(isAllowedBranchName("feat/")).toBe(false);
    expect(isAllowedBranchName("feat/UPPERCASE")).toBe(false);
  });
});
