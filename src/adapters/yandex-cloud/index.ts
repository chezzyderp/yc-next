import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { promises as fsp } from "node:fs";

import mapRoutes from "../../build/mapRoutes.js";
import createZip from "../../build/createZip.js";
import { renderMultiRouteHandler, renderSingleRouteHandler } from "../../template/function/index.js";

export interface YandexCloudAdapterOptions {
  oneFunction?: boolean;
  functionName?: string;
  outputDir?: string;
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
  routes: { path: string; type: string; pattern: string; entrypoint: string }[];
}

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
    oneFunction: false,
    functionName: "next-app",
    outputDir: ".next/yc",
    ...userOptions,
  };

  return {
    name: "yandex-cloud",
    modifyConfig(config: Record<string, unknown> = {}) {
      const nextConfig = { ...config };
      nextConfig.output = "standalone";
      nextConfig.skipMiddlewareUrlNormalize = true;
      nextConfig.outputFileTracingRoot = nextConfig.outputFileTracingRoot || process.cwd();
      nextConfig.experimental = {
        ...(nextConfig.experimental || {}),
        manualClientBasePath: true,
      };
      return nextConfig;
    },
    async onBuildComplete(context: BuildContext = {}) {
      const projectDir = context?.build?.dir ?? context?.dir ?? process.cwd();
      const distDirName = context?.build?.config?.distDir ?? context?.nextConfig?.distDir ?? ".next";
      const distDir = path.resolve(projectDir, distDirName);
      const serverDir = path.join(distDir, "server");
      const standaloneDir = path.join(distDir, "standalone");
      const resolvedOutput = resolveOutputDir({ projectDir, distDir, configured: options.outputDir });
      const tempDir = path.join(resolvedOutput, "__tmp__");
      await ensureDir(resolvedOutput);
      await ensureDir(tempDir);

      await assertDir(standaloneDir, "Next standalone output not found. Ensure output: \"standalone\".");
      await assertDir(serverDir, "Next server build output not found. Build may have failed.");
      await assertDir(RUNTIME_DIR, "Adapter runtime files are missing from the package.");

      const routesMapping = await mapRoutes({ distDir: serverDir });
      const middlewareEntries = (routesMapping.middleware || [])
        .filter((entry) => entry.entrypoint)
        .map((entry) => ({
          type: "middleware" as const,
          path: entry.name || "/middleware",
          entrypoint: entry.entrypoint!,
          pattern: entry.matchers?.[0]?.regexp || "^.*$",
        }));
      const bundleTargets = [...routesMapping.routes, ...middlewareEntries];
      if (!bundleTargets.length) {
        throw new Error("No Next.js routes were detected in the build output.");
      }

      const bundles: (RouteBundle | RouterBundle)[] = [];
      if (options.oneFunction) {
        const bundle = await buildRouterBundle({
          routes: bundleTargets,
          functionName: options.functionName || "next-app",
          runtimeDir: RUNTIME_DIR,
          standaloneDir,
          serverDir,
          tempDir,
          outputDir: resolvedOutput,
        });
        bundles.push(bundle);
      } else {
        const slugCount = new Map<string, number>();
        for (const route of bundleTargets) {
          const slug = createRouteSlug(route, slugCount);
          const bundle = await buildSingleRouteBundle({
            route,
            slug,
            runtimeDir: RUNTIME_DIR,
            standaloneDir,
            serverDir,
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
      await fsp.writeFile(path.join(resolvedOutput, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    },
  };
}

async function buildSingleRouteBundle({
  route,
  slug,
  runtimeDir,
  standaloneDir,
  serverDir,
  tempDir,
  outputDir,
}: {
  route: { path: string; type: string; pattern: string; entrypoint: string };
  slug: string;
  runtimeDir: string;
  standaloneDir: string;
  serverDir: string;
  tempDir: string;
  outputDir: string;
}): Promise<RouteBundle> {
  const workDir = path.join(tempDir, slug);
  await prepareWorkspace({ workDir, runtimeDir, standaloneDir });
  const entrypointPath = resolveEntrypointPath({ serverDir, route });
  const handlerSource = renderSingleRouteHandler({
    entrypoint: entrypointPath,
    routePath: route.path,
    routeType: route.type,
  });
  await fsp.writeFile(path.join(workDir, "index.js"), handlerSource, "utf8");
  const zipFile = path.join(outputDir, `${slug}.zip`);
  await createZip({ sourceDir: workDir, outputFile: zipFile });
  await fsp.rm(workDir, { recursive: true, force: true });
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
  serverDir,
  tempDir,
  outputDir,
}: {
  routes: { path: string; type: string; pattern: string; entrypoint: string }[];
  functionName: string;
  runtimeDir: string;
  standaloneDir: string;
  serverDir: string;
  tempDir: string;
  outputDir: string;
}): Promise<RouterBundle> {
  const slug = slugify(functionName);
  const workDir = path.join(tempDir, slug);
  await prepareWorkspace({ workDir, runtimeDir, standaloneDir });
  const templateRoutes = routes.map((route) => ({
    path: route.path,
    type: route.type,
    pattern: route.pattern,
    entrypoint: resolveEntrypointPath({ serverDir, route }),
  }));
  const handlerSource = renderMultiRouteHandler({ routes: templateRoutes });
  await fsp.writeFile(path.join(workDir, "index.js"), handlerSource, "utf8");
  const zipFile = path.join(outputDir, `${slug}.zip`);
  await createZip({ sourceDir: workDir, outputFile: zipFile });
  await fsp.rm(workDir, { recursive: true, force: true });
  return {
    name: slug,
    functionName,
    zipFile,
    routes: templateRoutes,
  };
}

async function prepareWorkspace({ workDir, runtimeDir, standaloneDir }: { workDir: string; runtimeDir: string; standaloneDir: string }) {
  await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  await fsp.mkdir(workDir, { recursive: true });
  await fsp.cp(standaloneDir, path.join(workDir, "standalone"), { recursive: true });
  await fsp.cp(runtimeDir, path.join(workDir, "runtime"), { recursive: true });
}

function resolveOutputDir({ projectDir, distDir, configured }: { projectDir: string; distDir: string; configured?: string }) {
  const desired = configured ?? path.join(distDir, "yc");
  return path.isAbsolute(desired) ? desired : path.resolve(projectDir, desired);
}

function resolveEntrypointPath({ serverDir, route }: { serverDir: string; route: { entrypoint: string } }) {
  const relative = path.relative(serverDir, route.entrypoint);
  if (relative.startsWith("..")) {
    throw new Error(`Route entrypoint ${route.entrypoint} is outside of the server directory.`);
  }
  return toPosix(path.join("./standalone/.next/server", relative));
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

function toPosix(value: string) {
  return value.split(path.sep).join("/");
}

function createRouteSlug(route: { path: string; type: string }, slugCount: Map<string, number>) {
  const raw = route.path === "/" ? "root" : route.path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/(^-|-$)/g, "").toLowerCase();
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
    if (!candidate) continue;
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
