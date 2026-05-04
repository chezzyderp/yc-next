#!/usr/bin/env node
import { Command, Option } from "commander";
import dotenv from "dotenv";
import { runDeploy } from "./commands/deploy.js";
import { runDestroy } from "./commands/destroy.js";

dotenv.config({ quiet: true });

const program = new Command();

program
  .name("yc-next")
  .description("Deploy a Next.js 16 app to Yandex Cloud Functions.")
  .showHelpAfterError();

program
  .command("deploy")
  .description("Build a deployment from .next/yc/manifest.json, upload it to YC, and wire up the API Gateway.")
  .option("--manifest <path>", "Path to manifest.json", ".next/yc/manifest.json")
  .option("--memory <size>", "Function memory", "1024m")
  .option("--timeout <duration>", "Execution timeout", "30s")
  .option("--runtime <name>", "YC runtime", "nodejs22")
  .option("--entrypoint <name>", "Handler entrypoint", "index.handler")
  .option("--prefix <name>", "Function-name prefix when bundle has no preset name", process.env.YC_FUNCTION_PREFIX ?? "next")
  .option("--bucket <name>", "Object Storage bucket (default <function>-deploys)", process.env.YC_STORAGE_BUCKET)
  .option("--gateway-name <name>", "API Gateway name (default derived from manifest)")
  .addOption(new Option("--no-gateway", "Skip API Gateway setup"))
  .addOption(new Option("--no-public", "Do not grant unauthenticated invoke access"))
  .addOption(new Option("--force-object-storage", "Always upload via Object Storage even for tiny ZIPs"))
  .action(async (options) => {
    await runDeploy(options);
  });

program
  .command("destroy")
  .description("Delete every resource recorded in .next/yc/state.json.")
  .option("--manifest-dir <path>", "Where state.json lives", ".next/yc")
  .option("-y, --yes", "Required to actually delete")
  .action(async (options) => {
    await runDestroy(options);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);

  process.stderr.write(`${message}\n`);
  process.exit(1);
});
