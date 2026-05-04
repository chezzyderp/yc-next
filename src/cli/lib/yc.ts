import { spawnSync } from "node:child_process";

interface YcOptions {
  silent?: boolean;
  parseJson?: boolean;
}

export interface YcResult<T = unknown> {
  status: number;
  stdout: string;
  stderr: string;
  json?: T;
}

export function yc<T = unknown>(args: string[], options: YcOptions = {}): YcResult<T> {
  const finalArgs = options.parseJson ? [...args, "--format", "json"] : args;
  const result = spawnSync("yc", finalArgs, {
    encoding: "utf8",
    stdio: options.silent ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "inherit"],
  });
  const out: YcResult<T> = {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };

  if (options.parseJson && out.status === 0 && out.stdout.trim()) {
    try {
      out.json = JSON.parse(out.stdout) as T;
    } catch {
      // leave json undefined; caller decides
    }
  }

  return out;
}

export function ycInherit(args: string[]): number {
  const result = spawnSync("yc", args, { stdio: "inherit" });

  return result.status ?? -1;
}

export function ensureFunction(name: string, ids: { folderId?: string; cloudId?: string }): string {
  const checkArgs = ["serverless", "function", "get", "--name", name];

  appendIds(checkArgs, ids);

  const check = yc<{ id: string }>(checkArgs, { silent: true, parseJson: true });

  if (check.status === 0 && check.json?.id) {
    return check.json.id;
  }

  const createArgs = ["serverless", "function", "create", "--name", name];

  appendIds(createArgs, ids);

  const create = yc<{ id: string }>(createArgs, { silent: true, parseJson: true });

  if (create.status !== 0 || !create.json?.id) {
    throw new Error(`Failed to create function ${name}: ${create.stderr || create.stdout}`);
  }

  return create.json.id;
}

export function ensureBucket(name: string, ids: { folderId?: string; cloudId?: string }): void {
  const check = yc(["storage", "bucket", "get", name], { silent: true });

  if (check.status === 0) {
    return;
  }

  const createArgs = ["storage", "bucket", "create", "--name", name];

  appendIds(createArgs, ids);

  const create = ycInherit(createArgs);

  if (create !== 0) {
    throw new Error(`Failed to create bucket ${name}`);
  }
}

export function allowUnauthenticatedInvoke(name: string): void {
  const result = yc(["serverless", "function", "allow-unauthenticated-invoke", name], { silent: true });

  if (result.status !== 0) {
    throw new Error(`Failed to grant public access to function ${name}: ${result.stderr || result.stdout}`);
  }
}

export function deleteFunction(name: string, ids: { folderId?: string; cloudId?: string }): YcResult {
  const args = ["serverless", "function", "delete", "--name", name];

  appendIds(args, ids);

  return yc(args, { silent: true });
}

export function deleteApiGateway(id: string): YcResult {
  return yc(["serverless", "api-gateway", "delete", "--id", id], { silent: true });
}

function appendIds(args: string[], ids: { folderId?: string; cloudId?: string }): void {
  if (ids.folderId) {
    args.push("--folder-id", ids.folderId);
  }

  if (ids.cloudId) {
    args.push("--cloud-id", ids.cloudId);
  }
}
