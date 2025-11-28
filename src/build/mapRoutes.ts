import path from "node:path";
import { promises as fs } from "node:fs";

export type RouteType = "app-route" | "ssr-app" | "ssr-page" | "api-route";

export interface RouteDefinition {
  type: RouteType | "middleware";
  path: string;
  entrypoint: string;
  pattern: string;
}

export interface MiddlewareDefinition {
  name?: string;
  files: string[];
  entrypoint: string | null;
  matchers?: { regexp?: string }[];
}

export interface RouteMappingResult {
  routes: RouteDefinition[];
  middleware: MiddlewareDefinition[];
}

const ROUTE_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);

export default async function mapRoutes({ distDir }: { distDir: string }): Promise<RouteMappingResult> {
  const serverDir = distDir;
  const appDir = path.join(serverDir, "app");
  const apiDir = path.join(serverDir, "pages", "api");
  const pagesDir = path.join(serverDir, "pages");
  const middlewareManifestPath = path.join(serverDir, "middleware-manifest.json");

  const [appRouteHandlers, appPages, apiRoutes, pagesRoutes, middleware] = await Promise.all([
    collectAppRouteHandlers(appDir, serverDir),
    collectAppPages(appDir, serverDir),
    collectApiRoutes(apiDir, serverDir),
    collectPagesSSR(pagesDir, serverDir),
    collectMiddleware(middlewareManifestPath, serverDir),
  ]);

  const routes = [...appRouteHandlers, ...appPages, ...apiRoutes, ...pagesRoutes];
  return { routes, middleware };
}

async function collectAppRouteHandlers(appDir: string, serverDir: string) {
  if (!(await pathExists(appDir))) return [];
  const files = await listMatchingFiles(appDir, (file) => isRouteFile(file, "route"));
  return files.map((file) =>
    buildRouteDefinition({
      absolutePath: file,
      relativeFile: path.relative(path.join(serverDir, "app"), file),
      prefix: "/",
      type: "app-route",
    })
  );
}

async function collectAppPages(appDir: string, serverDir: string) {
  if (!(await pathExists(appDir))) return [];
  const files = await listMatchingFiles(appDir, (file) => isRouteFile(file, "page"));
  return files.map((file) =>
    buildRouteDefinition({
      absolutePath: file,
      relativeFile: path.relative(path.join(serverDir, "app"), file),
      prefix: "/",
      type: "ssr-app",
    })
  );
}

async function collectApiRoutes(apiDir: string, serverDir: string) {
  if (!(await pathExists(apiDir))) return [];
  const files = await listMatchingFiles(apiDir, (file) => ROUTE_EXTENSIONS.has(path.extname(file)));
  return files.map((file) =>
    buildRouteDefinition({
      absolutePath: file,
      relativeFile: path.relative(path.join(serverDir, "pages", "api"), file),
      prefix: "/api",
      type: "api-route",
      appendFileSegment: true,
    })
  );
}

async function collectPagesSSR(pagesDir: string, serverDir: string) {
  if (!(await pathExists(pagesDir))) return [];
  const files = await listMatchingFiles(pagesDir, (file) => {
    if (!ROUTE_EXTENSIONS.has(path.extname(file))) return false;
    const relative = path.relative(pagesDir, file);
    if (relative.startsWith(`api${path.sep}`)) return false;
    const base = path.basename(relative);
    if (base.startsWith("_")) return false;
    if (base === "middleware.js") return false;
    return true;
  });
  return files.map((file) =>
    buildRouteDefinition({
      absolutePath: file,
      relativeFile: path.relative(path.join(serverDir, "pages"), file),
      prefix: "/",
      type: "ssr-page",
      appendFileSegment: true,
    })
  );
}

async function collectMiddleware(manifestPath: string, serverDir: string): Promise<MiddlewareDefinition[]> {
  if (!(await pathExists(manifestPath))) return [];
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    const middleware = manifest.middleware || {};
    const entries = Object.values(middleware) as {
      name?: string;
      files?: string[];
      matchers?: { regexp?: string }[];
    }[];
    return entries.map((entry) => {
      const files = (entry.files || []).map((file: string) => path.join(serverDir, file));
      return {
        name: entry.name,
        files,
        entrypoint: files[0] || null,
        matchers: entry.matchers || [],
      } satisfies MiddlewareDefinition;
    });
  } catch (error) {
    return [];
  }
}

async function listMatchingFiles(root: string, predicate: (file: string) => boolean) {
  const results: string[] = [];
  if (!(await pathExists(root))) return results;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!predicate(fullPath)) continue;
      results.push(fullPath);
    }
  }
  return results;
}

function buildRouteDefinition({ absolutePath, relativeFile, prefix, type, appendFileSegment = false }: {
  absolutePath: string;
  relativeFile: string;
  prefix: string;
  type: RouteDefinition["type"];
  appendFileSegment?: boolean;
}): RouteDefinition {
  const segments = extractSegments(relativeFile, { appendFileSegment });
  const pathString = buildPathString(segments, prefix);
  const pattern = buildRegexFromSegments(segments, prefix);
  return {
    type,
    path: pathString,
    entrypoint: absolutePath,
    pattern,
  };
}

function extractSegments(relativeFile: string, { appendFileSegment }: { appendFileSegment: boolean }) {
  const pieces = relativeFile.split(path.sep);
  const fileName = pieces.pop() || "";
  const segments = pieces
    .map((segment) => {
      if (!segment) return null;
      if (segment.startsWith("@")) return null;
      if (segment.startsWith("(") && segment.endsWith(")")) return null;
      return segment;
    })
    .filter(Boolean) as string[];

  if (appendFileSegment) {
    const fileSegment = path.basename(fileName, path.extname(fileName));
    if (fileSegment && fileSegment !== "index") segments.push(fileSegment);
  }

  return segments;
}

function buildPathString(segments: string[], prefix: string) {
  if (!segments.length) return prefix === "/" ? "/" : normalizeSlashes(prefix);
  return normalizeSlashes(`${prefix}/${segments.join("/")}`);
}

function buildRegexFromSegments(segments: string[], prefix: string) {
  const prefixSegments = prefix === "/" ? [] : prefix.split("/").filter(Boolean);
  const combined = [...prefixSegments, ...segments];
  if (!combined.length) return "^/?$";
  const parts = combined.map((segment) => {
    if (isOptionalCatchAll(segment)) return "(?:/(.*))?";
    if (isCatchAll(segment)) return "/(.+)";
    if (isDynamicSegment(segment)) return "/([^/]+?)";
    return `/${escapeRegex(segment)}`;
  });
  return `^${parts.join("")}/?$`;
}

function normalizeSlashes(value: string) {
  return value
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, (match, offset, input) => (input === "/" ? "/" : ""));
}

function isDynamicSegment(segment: string) {
  return segment.startsWith("[") && segment.endsWith("]") && !segment.startsWith("[[...") && !segment.startsWith("[...");
}

function isCatchAll(segment: string) {
  return segment.startsWith("[...") && segment.endsWith("]") && !segment.startsWith("[[...");
}

function isOptionalCatchAll(segment: string) {
  return segment.startsWith("[[...") && segment.endsWith("]]");
}

function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+*?.-]/g, (match) => `\\${match}`);
}

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch (error) {
    return false;
  }
}

function isRouteFile(file: string, base: string) {
  return [".js", ".mjs", ".cjs"].some((ext) => file.endsWith(`${path.sep}${base}${ext}`));
}
