import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { promises as fsp } from "node:fs";

import mapRoutes from "../../build/mapRoutes.js";
import createZip from "../../build/createZip.js";
import { renderHandler } from "../../template/function/index.js";

export interface YandexCloudAdapterOptions {
  oneFunction?: boolean;
  functionName?: string;
  outputDir?: string;
  /**
   * Whether to bundle `.next/static/*` and `public/*` into each ZIP so the
   * function can serve them itself. Default: `true`.
   *
   * Set to `false` if you upload those assets to a CDN/Object Storage and set
   * `assetPrefix` in `next.config`. Reduces bundle size noticeably for asset-heavy apps.
   */
  includeStaticAssets?: boolean;
}

interface BuildContext {
  build?: {
    dir?: string;
    config?: {
      distDir?: string;
    };
  };
  nextConfig?: {
    distDir?: string;
  };
  dir?: string;
}

interface RouteBundle {
  name: string;
  route: string;
  type: string;
  pattern: string;
  zipFile: string;
}

interface RouterBundle {
  name: string;
  functionName: string;
  zipFile: string;
  routes: { path: string; type: string; pattern: string }[];
}

interface RequiredServerFiles {
  appDir?: string;
  config?: Record<string, unknown>;
  files?: string[];
}

interface MiddlewareManifest {
  middleware?: Record<string, unknown>;
  functions?: Record<string, unknown>;
}

type CopyTracedFiles = (
  tracingRoot: string,
  distDir: string,
  pageKeys: string[],
  appPageKeys: string[],
  outputDir: string,
  config: Record<string, unknown>,
  middlewareManifest: MiddlewareManifest,
  hasNodeMiddleware: boolean,
  hasInstrumentationHook: boolean,
  staticPages: Set<string>,
) => Promise<void>;

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolveExistingDir([
  path.resolve(CURRENT_DIR, "../../"),
  path.resolve(CURRENT_DIR, "../../../"),
]);
const RUNTIME_DIR = resolveExistingDir([
  path.join(PACKAGE_ROOT, "runtime"),
  path.join(PACKAGE_ROOT, "..", "runtime"),
]);

export default function yandexCloudAdapter(userOptions: YandexCloudAdapterOptions = {}) {
  const options: Required<YandexCloudAdapterOptions> = {
    oneFunction: true,
    functionName: "next-app",
    outputDir: ".next/yc",
    includeStaticAssets: true,
    ...userOptions,
  };

  return {
    name: "yandex-cloud",
    modifyConfig(config: Record<string, unknown> = {}) {
      return {
        ...config,
        output: "standalone",
        skipMiddlewareUrlNormalize: true,
        outputFileTracingRoot: config.outputFileTracingRoot ?? process.cwd(),
      };
    },
    async onBuildComplete(context: BuildContext = {}) {
      const projectDir = context?.build?.dir ?? context?.dir ?? process.cwd();
      const distDirName =
        context?.build?.config?.distDir ?? context?.nextConfig?.distDir ?? ".next";
      const distDir = path.resolve(projectDir, distDirName);
      const serverDir = path.join(distDir, "server");
      const resolvedOutput = resolveOutputDir({
        projectDir,
        distDir,
        configured: options.outputDir,
      });
      const tempDir = path.join(resolvedOutput, "__tmp__");

      await ensureDir(resolvedOutput);
      await ensureDir(tempDir);

      await assertDir(serverDir, "Next server build output not found. Build may have failed.");

      const standaloneDir = await ensureStandaloneReady({ projectDir, distDir });

      await assertDir(RUNTIME_DIR, "Adapter runtime files are missing from the package.");

      const appDirRelative = await resolveStandaloneAppDir({ standaloneDir, projectDir });

      await syncRequiredServerFiles({
        distDir,
        standaloneDir,
        appDirRelative,
        includeStaticAssets: options.includeStaticAssets,
      });

      if (options.includeStaticAssets) {
        await syncPublicAssets({ projectDir, standaloneDir, appDirRelative });
      }

      const routesMapping = await mapRoutes({ distDir: serverDir });
      const middlewareEntries = (routesMapping.middleware || [])
        .filter((entry) => entry.entrypoint)
        .map((entry) => ({
          type: "middleware" as const,
          path: entry.name || "/middleware",
          pattern: entry.matchers?.[0]?.regexp || "^.*$",
        }));
      const routeMetadata = [
        ...routesMapping.routes.map((route) => ({
          path: route.path,
          type: route.type,
          pattern: route.pattern,
        })),
        ...middlewareEntries,
      ];

      if (!routeMetadata.length) {
        throw new Error("No Next.js routes were detected in the build output.");
      }

      const bundles: (RouteBundle | RouterBundle)[] = [];

      if (options.oneFunction) {
        const bundle = await buildRouterBundle({
          routes: routeMetadata,
          functionName: options.functionName || "next-app",
          runtimeDir: RUNTIME_DIR,
          standaloneDir,
          appDirRelative,
          tempDir,
          outputDir: resolvedOutput,
        });

        bundles.push(bundle);
      } else {
        const slugCount = new Map<string, number>();

        for (const route of routeMetadata) {
          const slug = createRouteSlug(route, slugCount);
          const bundle = await buildSingleRouteBundle({
            route,
            slug,
            runtimeDir: RUNTIME_DIR,
            standaloneDir,
            appDirRelative,
            tempDir,
            outputDir: resolvedOutput,
          });

          bundles.push(bundle);
        }
      }

      await fsp.rm(tempDir, { recursive: true, force: true });

      const manifest = {
        adapter: "yandex-cloud",
        generatedAt: new Date().toISOString(),
        mode: options.oneFunction ? "single" : "multi",
        outputDir: resolvedOutput,
        bundles,
      };

      await fsp.writeFile(
        path.join(resolvedOutput, "manifest.json"),
        JSON.stringify(manifest, null, 2),
        "utf8",
      );
    },
  };
}

interface RouteMeta {
  path: string;
  type: string;
  pattern: string;
}

interface BundleSpec {
  workDir: string;
  runtimeDir: string;
  standaloneDir: string;
  appDirRelative: string;
  outputDir: string;
}

async function emitBundle(
  { workDir, runtimeDir, standaloneDir, appDirRelative, outputDir }: BundleSpec,
  zipName: string,
) {
  await prepareWorkspace({ workDir, runtimeDir, standaloneDir });

  const handlerSource = renderHandler({ appDirRelative });

  await fsp.writeFile(path.join(workDir, "index.js"), handlerSource, "utf8");

  const zipFile = path.join(outputDir, zipName);

  await createZip({ sourceDir: workDir, outputFile: zipFile });
  await fsp.rm(workDir, { recursive: true, force: true });

  return zipFile;
}

async function buildSingleRouteBundle({
  route,
  slug,
  runtimeDir,
  standaloneDir,
  appDirRelative,
  tempDir,
  outputDir,
}: {
  route: RouteMeta;
  slug: string;
  runtimeDir: string;
  standaloneDir: string;
  appDirRelative: string;
  tempDir: string;
  outputDir: string;
}): Promise<RouteBundle> {
  const zipFile = await emitBundle(
    {
      workDir: path.join(tempDir, slug),
      runtimeDir,
      standaloneDir,
      appDirRelative,
      outputDir,
    },
    `${slug}.zip`,
  );

  return {
    name: slug,
    route: route.path,
    type: route.type,
    pattern: route.pattern,
    zipFile,
  };
}

async function buildRouterBundle({
  routes,
  functionName,
  runtimeDir,
  standaloneDir,
  appDirRelative,
  tempDir,
  outputDir,
}: {
  routes: RouteMeta[];
  functionName: string;
  runtimeDir: string;
  standaloneDir: string;
  appDirRelative: string;
  tempDir: string;
  outputDir: string;
}): Promise<RouterBundle> {
  const slug = slugify(functionName);
  const zipFile = await emitBundle(
    {
      workDir: path.join(tempDir, slug),
      runtimeDir,
      standaloneDir,
      appDirRelative,
      outputDir,
    },
    `${slug}.zip`,
  );

  return {
    name: slug,
    functionName,
    zipFile,
    routes,
  };
}

async function resolveStandaloneAppDir({
  standaloneDir,
  projectDir,
}: {
  standaloneDir: string;
  projectDir: string;
}) {
  const guess = path.relative(path.dirname(standaloneDir), projectDir);
  const candidate = path.join(standaloneDir, guess);
  const candidateServer = path.join(candidate, "server.js");
  const candidateExists = await pathExists(candidateServer);

  if (candidateExists) {
    return toPosix(guess);
  }

  const rootServer = path.join(standaloneDir, "server.js");
  const rootExists = await pathExists(rootServer);

  if (rootExists) {
    return ".";
  }

  const found = await findServerJsDir(standaloneDir);

  if (!found) {
    throw new Error("Could not locate standalone server.js inside .next/standalone.");
  }

  return toPosix(path.relative(standaloneDir, found));
}

const DIST_DIRS_TO_SKIP = new Set(["cache", "standalone", "trace", "diagnostics", "types"]);

async function syncRequiredServerFiles({
  distDir,
  standaloneDir,
  appDirRelative,
  includeStaticAssets,
}: {
  distDir: string;
  standaloneDir: string;
  appDirRelative: string;
  includeStaticAssets: boolean;
}) {
  const targetDir = path.join(standaloneDir, appDirRelative, ".next");

  await ensureDir(targetDir);

  const entries = await fsp.readdir(distDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && DIST_DIRS_TO_SKIP.has(entry.name)) {
      continue;
    }

    if (entry.isDirectory() && entry.name === "static" && !includeStaticAssets) {
      continue;
    }

    if (entry.name === "package.json") {
      continue;
    }

    const source = path.join(distDir, entry.name);
    const target = path.join(targetDir, entry.name);

    await fsp.cp(source, target, { recursive: true, force: true });
  }

  await fsp.writeFile(path.join(targetDir, "package.json"), '{"type":"commonjs"}\n', "utf8");
}

async function syncPublicAssets({
  projectDir,
  standaloneDir,
  appDirRelative,
}: {
  projectDir: string;
  standaloneDir: string;
  appDirRelative: string;
}) {
  const sourceDir = path.join(projectDir, "public");
  const exists = await pathExists(sourceDir);

  if (!exists) {
    return;
  }

  const targetDir = path.join(standaloneDir, appDirRelative, "public");

  await fsp.cp(sourceDir, targetDir, { recursive: true, force: true });
}

async function findServerJsDir(root: string): Promise<string | null> {
  const stack = [root];

  while (stack.length) {
    const current = stack.pop()!;
    const entries = await fsp.readdir(current, { withFileTypes: true });
    const hasServer = entries.some((entry) => entry.isFile() && entry.name === "server.js");

    if (hasServer) {
      return current;
    }

    for (const entry of entries) {
      const skip =
        !entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith(".");

      if (skip) {
        continue;
      }

      stack.push(path.join(current, entry.name));
    }
  }

  return null;
}

async function ensureStandaloneReady({
  projectDir,
  distDir,
}: {
  projectDir: string;
  distDir: string;
}) {
  const standaloneDir = path.join(distDir, "standalone");
  const alreadyEmitted = await pathExists(standaloneDir);

  if (alreadyEmitted) {
    return standaloneDir;
  }

  await emitStandaloneOutput({ projectDir, distDir });

  return standaloneDir;
}

async function emitStandaloneOutput({
  projectDir,
  distDir,
}: {
  projectDir: string;
  distDir: string;
}) {
  const requiredServerFilesPath = path.join(distDir, "required-server-files.json");
  const hasRequiredServerFiles = await pathExists(requiredServerFilesPath);

  if (!hasRequiredServerFiles) {
    throw new Error(
      'Next build did not emit required-server-files.json. Ensure output: "standalone" is set in next.config.',
    );
  }

  const requiredServerFiles = await readJson<RequiredServerFiles>(requiredServerFilesPath, {});
  const tracingRoot = requiredServerFiles.appDir ?? projectDir;
  const middlewareManifest = await readJson<MiddlewareManifest>(
    path.join(distDir, "server", "middleware-manifest.json"),
    { middleware: {}, functions: {} },
  );
  const pagesManifest = await readJson<Record<string, string>>(
    path.join(distDir, "server", "pages-manifest.json"),
    {},
  );
  const appPathsManifest = await readJson<Record<string, string>>(
    path.join(distDir, "server", "app-paths-manifest.json"),
    {},
  );
  const prerenderManifest = await readJson<{ routes?: Record<string, unknown> }>(
    path.join(distDir, "prerender-manifest.json"),
    { routes: {} },
  );
  const staticPages = new Set(Object.keys(prerenderManifest.routes ?? {}));
  const hasNodeMiddleware = Object.keys(middlewareManifest.middleware ?? {}).length > 0;
  const hasInstrumentationHook = await pathExists(
    path.join(distDir, "server", "instrumentation.js"),
  );

  const utilsMod = (await import("next/dist/build/utils.js")) as unknown as {
    copyTracedFiles?: CopyTracedFiles;
    default?: { copyTracedFiles?: CopyTracedFiles };
  };
  const copyTracedFiles = utilsMod.copyTracedFiles ?? utilsMod.default?.copyTracedFiles;

  if (typeof copyTracedFiles !== "function") {
    throw new Error(
      "Unable to load Next.js tracing utilities (next/dist/build/utils#copyTracedFiles).",
    );
  }

  await copyTracedFiles(
    tracingRoot,
    distDir,
    Object.keys(pagesManifest),
    Object.keys(appPathsManifest),
    projectDir,
    requiredServerFiles.config ?? {},
    middlewareManifest,
    hasNodeMiddleware,
    hasInstrumentationHook,
    staticPages,
  );

  const standaloneServerDir = path.join(
    distDir,
    "standalone",
    path.relative(projectDir, distDir),
    "server",
  );

  await fsp.cp(path.join(distDir, "server"), standaloneServerDir, { recursive: true, force: true });
}

async function prepareWorkspace({
  workDir,
  runtimeDir,
  standaloneDir,
}: {
  workDir: string;
  runtimeDir: string;
  standaloneDir: string;
}) {
  await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  await fsp.mkdir(workDir, { recursive: true });
  await fsp.cp(standaloneDir, path.join(workDir, "standalone"), { recursive: true });
  await fsp.cp(runtimeDir, path.join(workDir, "runtime"), { recursive: true });
}

function resolveOutputDir({
  projectDir,
  distDir,
  configured,
}: {
  projectDir: string;
  distDir: string;
  configured?: string;
}) {
  const desired = configured ?? path.join(distDir, "yc");

  return path.isAbsolute(desired) ? desired : path.resolve(projectDir, desired);
}

async function assertDir(target: string, message: string) {
  try {
    const stats = await fsp.stat(target);

    if (!stats.isDirectory()) {
      throw new Error(message);
    }
  } catch (error) {
    throw new Error(message);
  }
}

async function ensureDir(target: string) {
  await fsp.mkdir(target, { recursive: true });
}

async function pathExists(target: string) {
  try {
    await fsp.access(target);

    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fsp.readFile(filePath, "utf8");

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toPosix(value: string) {
  return value.split(path.sep).join("/");
}

function createRouteSlug(route: { path: string; type: string }, slugCount: Map<string, number>) {
  const raw =
    route.path === "/"
      ? "root"
      : route.path
          .replace(/[^a-zA-Z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
          .toLowerCase();
  const base = `${route.type}-${raw || "route"}`;
  const count = slugCount.get(base) || 0;

  slugCount.set(base, count + 1);

  return count === 0 ? base : `${base}-${count}`;
}

function slugify(value: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .replace(/--+/g, "-");

  return cleaned || "next-app";
}

function resolveExistingDir(paths: string[]) {
  for (const candidate of paths) {
    if (!candidate) {
      continue;
    }

    try {
      const stats = fs.statSync(candidate);

      if (stats.isDirectory()) {
        return candidate;
      }
    } catch (error) {
      continue;
    }
  }

  return paths[0];
}
