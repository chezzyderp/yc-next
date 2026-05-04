import path from "node:path";
import { deleteApiGateway, deleteFunction } from "../lib/yc.js";
import { deleteObject } from "../lib/storage.js";
import { deleteState, readState } from "../lib/state.js";
import { c, log } from "../lib/log.js";

export interface DestroyOptions {
  manifestDir: string;
  yes?: boolean;
}

export async function runDestroy(options: DestroyOptions): Promise<void> {
  const stateDir = path.resolve(process.cwd(), options.manifestDir);
  const state = await readState(stateDir);

  if (!state) {
    log.error(`No deployment state found at ${c.dim(`${stateDir}/state.json`)}. Nothing to destroy.`);
    process.exit(1);
  }

  log.raw(c.bold(`Deployment from ${c.dim(state.deployedAt)}:`));
  log.raw(`  ${c.yellow(`${state.functions.length} function(s)`)}`);

  for (const fn of state.functions) {
    log.raw(`    ${c.dim("-")} ${fn.name} ${c.dim(`(${fn.id})`)}`);
  }

  if (state.gateway) {
    log.raw(`  ${c.yellow("1 API Gateway")} ${c.dim(`(id ${state.gateway.id}, ${state.gateway.domain})`)}`);
  }

  log.raw(`  ${c.yellow(`${state.uploadedObjects.length} uploaded object(s)`)} in Object Storage`);

  if (!options.yes) {
    log.raw("");
    log.warn(`Pass ${c.bold("--yes")} to confirm deletion.`);
    process.exit(2);
  }

  const ids = { folderId: state.folderId, cloudId: state.cloudId };

  log.raw("");

  let failures = 0;

  if (state.gateway) {
    log.step(`Deleting API Gateway ${c.dim(state.gateway.id)}`);

    const result = deleteApiGateway(state.gateway.id);

    if (result.status !== 0) {
      log.warn(`failed: ${result.stderr.trim() || result.stdout.trim()}`);
      failures += 1;
    }
  }

  for (const fn of state.functions) {
    log.step(`Deleting function ${c.cyan(fn.name)}`);

    const result = deleteFunction(fn.name, ids);

    if (result.status !== 0) {
      log.warn(`failed: ${result.stderr.trim() || result.stdout.trim()}`);
      failures += 1;
    }
  }

  for (const obj of state.uploadedObjects) {
    log.step(`Deleting ${c.dim(`s3://${obj.bucket}/${obj.object}`)}`);

    try {
      await deleteObject(obj);
    } catch (error) {
      log.warn(`failed: ${(error as Error).message}`);
      failures += 1;
    }
  }

  await deleteState(stateDir);
  log.raw("");

  if (failures > 0) {
    log.warn(`Destroy finished with ${failures} failure(s); state.json is gone but inspect YC console to confirm cleanup.`);
    process.exit(3);
  }

  log.success(c.bold("Destroy complete"));
}
