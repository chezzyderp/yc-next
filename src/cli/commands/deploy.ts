import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { promises as fsp } from "node:fs";
import dotenv from "dotenv";
import {
  allowUnauthenticatedInvoke,
  ensureBucket,
  ensureFunction,
  yc,
  ycInherit,
} from "../lib/yc.js";
import { uploadZip } from "../lib/storage.js";
import { applyGateway, buildOpenApiSpec, findGatewayByName } from "../lib/gateway.js";
import { DeploymentState, readState, writeState } from "../lib/state.js";
import { c, log } from "../lib/log.js";

const OBJECT_STORAGE_THRESHOLD_BYTES = 3.5 * 1024 * 1024;

export interface DeployOptions {
  manifest: string;
  memory: string;
  timeout: string;
  runtime: string;
  entrypoint: string;
  prefix: string;
  bucket?: string;
  gatewayName?: string;
  gateway: boolean;
  public: boolean;
  forceObjectStorage?: boolean;
  env: string[];
  envFile?: string;
}

interface ManifestBundle {
  name: string;
  functionName?: string;
  route?: string;
  pattern?: string;
  type?: string;
  zipFile: string;
  routes?: { path: string; type: string; pattern: string }[];
}

interface Manifest {
  adapter: string;
  mode: "single" | "multi";
  outputDir: string;
  runtimeEnvKeys?: string[];
  bundles: ManifestBundle[];
}

export async function runDeploy(options: DeployOptions): Promise<void> {
  const manifestPath = path.resolve(process.cwd(), options.manifest);

  if (!existsSync(manifestPath)) {
    fail(`Manifest not found at ${manifestPath}. Run \`next build\` first.`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

  if (!manifest.bundles?.length) {
    fail(`Manifest ${manifestPath} contains no bundles.`);
  }

  const baseDir = path.dirname(manifestPath);
  const outputDir = manifest.outputDir ?? baseDir;
  const gatewayName = options.gatewayName ?? deriveDefaultGatewayName(manifest);
  const folderId = process.env.YC_FOLDER_ID ?? readFolderIdFromYc();
  const cloudId = process.env.YC_CLOUD_ID;
  const ids = { folderId, cloudId };
  const runtimeEnv = collectRuntimeEnv({
    declaredKeys: manifest.runtimeEnvKeys ?? [],
    envFile: options.envFile,
    inline: options.env,
  });

  if (Object.keys(runtimeEnv).length) {
    log.detail(`runtime env: ${Object.keys(runtimeEnv).sort().join(", ")}`);
  }

  if (!folderId) {
    fail("YC_FOLDER_ID is not set and `yc config get folder-id` returned nothing.");
  }

  const previous = await readState(outputDir);
  const state: DeploymentState = {
    deployedAt: new Date().toISOString(),
    folderId,
    cloudId,
    functions: [],
    uploadedObjects: [],
    gateway: previous?.gateway,
  };

  for (const bundle of manifest.bundles) {
    const zipPath = resolveZipPath(bundle.zipFile, baseDir);
    const functionName = deriveFunctionName(bundle, options.prefix);
    const label = bundle.name ?? bundle.route ?? path.basename(zipPath);

    log.step(`${c.bold(label)} ${c.dim("→")} function ${c.cyan(functionName)}`);

    const functionId = ensureFunction(functionName, ids);
    const stat = await fsp.stat(zipPath);
    const useObjectStorage = options.forceObjectStorage === true || stat.size > OBJECT_STORAGE_THRESHOLD_BYTES;

    let versionArgs: string[];

    if (useObjectStorage) {
      const bucket = options.bucket ?? `${functionName}-deploys`;

      ensureBucket(bucket, ids);

      log.detail(`uploading ${formatSize(stat.size)} → s3://${bucket}`);

      const upload = await uploadZip({ bucket, zipPath, functionName });

      state.uploadedObjects.push(upload);
      versionArgs = buildVersionArgs({
        functionName,
        runtime: options.runtime,
        entrypoint: options.entrypoint,
        memory: options.memory,
        timeout: options.timeout,
        objectStorage: upload,
      });
    } else {
      versionArgs = buildVersionArgs({
        functionName,
        runtime: options.runtime,
        entrypoint: options.entrypoint,
        memory: options.memory,
        timeout: options.timeout,
        sourcePath: zipPath,
      });
    }

    if (folderId) {
      versionArgs.push("--folder-id", folderId);
    }

    if (cloudId) {
      versionArgs.push("--cloud-id", cloudId);
    }

    if (process.env.YC_SERVICE_ACCOUNT_ID) {
      versionArgs.push("--service-account-id", process.env.YC_SERVICE_ACCOUNT_ID);
    }

    for (const [key, value] of Object.entries(runtimeEnv)) {
      versionArgs.push("--environment", `${key}=${value}`);
    }

    const versionStatus = ycInherit(versionArgs);

    if (versionStatus !== 0) {
      fail(`yc serverless function version create failed for ${functionName}`);
    }

    if (options.public) {
      allowUnauthenticatedInvoke(functionName);
    }

    state.functions.push({ name: functionName, id: functionId, publicAccess: options.public });
  }

  if (options.gateway) {
    const routes = collectRoutes(manifest, state);

    if (!routes.length) {
      log.warn("Skipping API Gateway setup (no routes resolved).");
    } else {
      const fallback = pickFallbackFunctionId(manifest, state, routes);
      const spec = buildOpenApiSpec({ title: gatewayName, routes, fallbackFunctionId: fallback });
      const existing = previous?.gateway?.id ?? (await findGatewayByName(gatewayName, ids))?.id;

      log.step(`API Gateway ${c.cyan(gatewayName)}${existing ? c.dim(` (id ${existing})`) : ""}`);

      const info = await applyGateway({ name: gatewayName, spec, existingId: existing, ids });

      state.gateway = info;
    }
  }

  await writeState(outputDir, state);
  log.raw("");
  log.success(c.bold("Deployment complete"));

  if (state.gateway) {
    log.url("URL", `https://${state.gateway.domain}`);
  } else if (state.functions.length === 1) {
    const id = state.functions[0].id;

    log.url("Invoke", `https://functions.yandexcloud.net/${id}`);
  }
}

function buildVersionArgs(opts: {
  functionName: string;
  runtime: string;
  entrypoint: string;
  memory: string;
  timeout: string;
  sourcePath?: string;
  objectStorage?: { bucket: string; object: string };
}): string[] {
  const args = [
    "serverless",
    "function",
    "version",
    "create",
    "--function-name",
    opts.functionName,
    "--runtime",
    opts.runtime,
    "--entrypoint",
    opts.entrypoint,
    "--memory",
    opts.memory,
    "--execution-timeout",
    opts.timeout,
  ];

  if (opts.objectStorage) {
    args.push(
      "--package-bucket-name",
      opts.objectStorage.bucket,
      "--package-object-name",
      opts.objectStorage.object,
    );
  } else if (opts.sourcePath) {
    args.push("--source-path", opts.sourcePath);
  }

  return args;
}

function deriveFunctionName(bundle: ManifestBundle, functionPrefix: string): string {
  if (bundle.functionName) {
    return bundle.functionName;
  }

  if (bundle.name) {
    return sanitize(`${functionPrefix}-${bundle.name}`);
  }

  return sanitize(`${functionPrefix}-bundle`);
}

function deriveDefaultGatewayName(manifest: Manifest): string {
  const single = manifest.bundles.find((bundle) => bundle.functionName);

  if (single?.functionName) {
    return `${single.functionName}-gw`;
  }

  return "nextjs-yc-app-gw";
}

function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/--+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function resolveZipPath(value: string, base: string): string {
  return path.isAbsolute(value) ? value : path.resolve(base, value);
}

function collectRoutes(manifest: Manifest, state: DeploymentState) {
  const result: { route: string; functionId: string }[] = [];

  for (const bundle of manifest.bundles) {
    const fnName = bundle.functionName
      ? bundle.functionName
      : state.functions.find((f) => f.name.endsWith(`-${bundle.name}`))?.name;
    const fn = state.functions.find((f) => f.name === fnName);

    if (!fn) {
      continue;
    }

    if (manifest.mode === "single" && bundle.routes) {
      for (const route of bundle.routes) {
        result.push({ route: route.path, functionId: fn.id });
      }

      continue;
    }

    if (bundle.route) {
      result.push({ route: bundle.route, functionId: fn.id });
    }
  }

  return result;
}

function pickFallbackFunctionId(
  manifest: Manifest,
  state: DeploymentState,
  routes: { route: string; functionId: string }[],
): string {
  const rootMatch = routes.find((r) => r.route === "/");

  if (rootMatch) {
    return rootMatch.functionId;
  }

  const single = manifest.bundles.find((b) => b.functionName);

  if (single) {
    const fn = state.functions.find((f) => f.name === single.functionName);

    if (fn) {
      return fn.id;
    }
  }

  return state.functions[0]!.id;
}

export function collectRuntimeEnv({
  declaredKeys,
  envFile,
  inline,
}: {
  declaredKeys: string[];
  envFile?: string;
  inline: string[];
}): Record<string, string> {
  const result: Record<string, string> = {};

  if (envFile) {
    const resolved = path.resolve(process.cwd(), envFile);

    if (!existsSync(resolved)) {
      fail(`--env-file not found at ${resolved}`);
    }

    const parsed = dotenv.parse(readFileSync(resolved));

    Object.assign(result, parsed);
  }

  for (const pair of inline) {
    const eq = pair.indexOf("=");

    if (eq <= 0) {
      fail(`Invalid --env "${pair}", expected KEY=VALUE`);
    }

    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);

    result[key] = value;
  }

  // declaredKeys (from adapter config) win — explicit code reference is the source of truth
  for (const key of declaredKeys) {
    const value = process.env[key];

    if (value === undefined) {
      log.warn(`runtimeEnv key ${key} declared in adapter config but not present in process.env (skipped).`);
      continue;
    }

    result[key] = value;
  }

  return result;
}

function readFolderIdFromYc(): string | undefined {
  const result = yc<unknown>(["config", "get", "folder-id"], { silent: true });

  if (result.status !== 0) {
    return undefined;
  }

  const value = result.stdout.trim();

  return value.length ? value : undefined;
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function fail(message: string, code = 1): never {
  log.error(message);
  process.exit(code);
}
