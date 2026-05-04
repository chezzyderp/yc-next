import { promises as fsp } from "node:fs";
import path from "node:path";
import os from "node:os";
import { ycInherit, yc } from "./yc.js";

export interface RouteToFunction {
  route: string;
  functionId: string;
}

interface GatewayInfo {
  id: string;
  domain: string;
}

export function buildOpenApiSpec({
  title,
  routes,
  fallbackFunctionId,
}: {
  title: string;
  routes: RouteToFunction[];
  fallbackFunctionId: string;
}): string {
  const lines: string[] = [];

  lines.push("openapi: 3.0.0");
  lines.push("info:");
  lines.push(`  title: ${jsonish(title)}`);
  lines.push(`  version: 1.0.0`);
  lines.push("paths:");

  const seen = new Set<string>();

  for (const entry of routes) {
    const route = normalizeRoute(entry.route);

    if (seen.has(route)) {
      continue;
    }

    seen.add(route);
    lines.push(`  ${jsonish(route)}:`);
    lines.push(`    x-yc-apigateway-any-method:`);
    lines.push(`      x-yc-apigateway-integration:`);
    lines.push(`        type: cloud_functions`);
    lines.push(`        function_id: ${entry.functionId}`);
  }

  if (!seen.has("/")) {
    lines.push(`  /:`);
    lines.push(`    x-yc-apigateway-any-method:`);
    lines.push(`      x-yc-apigateway-integration:`);
    lines.push(`        type: cloud_functions`);
    lines.push(`        function_id: ${fallbackFunctionId}`);
  }

  lines.push(`  /{path+}:`);
  lines.push(`    x-yc-apigateway-any-method:`);
  lines.push(`      x-yc-apigateway-integration:`);
  lines.push(`        type: cloud_functions`);
  lines.push(`        function_id: ${fallbackFunctionId}`);
  lines.push(`      parameters:`);
  lines.push(`        - name: path`);
  lines.push(`          in: path`);
  lines.push(`          required: true`);
  lines.push(`          schema:`);
  lines.push(`            type: string`);

  return lines.join("\n") + "\n";
}

function jsonish(value: string): string {
  if (/^[A-Za-z0-9._/-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function normalizeRoute(route: string): string {
  if (!route.startsWith("/")) {
    return `/${route}`;
  }

  return route;
}

export async function applyGateway({
  name,
  spec,
  existingId,
  ids,
}: {
  name: string;
  spec: string;
  existingId?: string;
  ids: { folderId?: string; cloudId?: string };
}): Promise<GatewayInfo> {
  const specPath = path.join(os.tmpdir(), `${name}-${Date.now()}.yaml`);

  await fsp.writeFile(specPath, spec, "utf8");

  try {
    if (existingId) {
      const updateArgs = ["serverless", "api-gateway", "update", "--id", existingId, `--spec=${specPath}`];

      if (ycInherit(updateArgs) !== 0) {
        throw new Error(`Failed to update API Gateway ${existingId}`);
      }

      const info = yc<GatewayInfo>(["serverless", "api-gateway", "get", "--id", existingId], {
        silent: true,
        parseJson: true,
      });

      if (!info.json?.domain) {
        throw new Error(`Gateway ${existingId} updated but could not read domain`);
      }

      return { id: existingId, domain: info.json.domain };
    }

    const createArgs = ["serverless", "api-gateway", "create", "--name", name, `--spec=${specPath}`];

    if (ids.folderId) {
      createArgs.push("--folder-id", ids.folderId);
    }

    if (ids.cloudId) {
      createArgs.push("--cloud-id", ids.cloudId);
    }

    const create = yc<GatewayInfo>(createArgs, { silent: true, parseJson: true });

    if (create.status !== 0 || !create.json?.id || !create.json.domain) {
      throw new Error(`Failed to create API Gateway ${name}: ${create.stderr || create.stdout}`);
    }

    return { id: create.json.id, domain: create.json.domain };
  } finally {
    await fsp.rm(specPath, { force: true });
  }
}

export async function findGatewayByName(name: string, ids: { folderId?: string }): Promise<GatewayInfo | null> {
  const args = ["serverless", "api-gateway", "list"];

  if (ids.folderId) {
    args.push("--folder-id", ids.folderId);
  }

  const result = yc<GatewayInfo[]>(args, { silent: true, parseJson: true });

  if (result.status !== 0 || !Array.isArray(result.json)) {
    return null;
  }

  const found = result.json.find((entry) => (entry as unknown as { name: string }).name === name);

  if (!found) {
    return null;
  }

  return { id: found.id, domain: found.domain };
}
