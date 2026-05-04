#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, createReadStream } from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

const OBJECT_STORAGE_THRESHOLD_BYTES = 3.5 * 1024 * 1024;

const args = parseArgs(process.argv.slice(2));
const manifestPath = path.resolve(process.cwd(), args.manifest ?? ".next/yc/manifest.json");
const runtime = args.runtime ?? "nodejs22";
const memory = args.memory ?? "512m";
const timeout = args.timeout ?? "10s";
const entrypoint = args.entrypoint ?? "index.handler";
const functionPrefix = args["function-prefix"] ?? process.env.YC_FUNCTION_PREFIX ?? "next";
const explicitBucket = args.bucket ?? process.env.YC_STORAGE_BUCKET;
const forceObjectStorage = args.useObjectStorage === true;

const folderId = process.env.YC_FOLDER_ID;
const cloudId = process.env.YC_CLOUD_ID;
const serviceAccountId = process.env.YC_SERVICE_ACCOUNT_ID;

if (!existsSync(manifestPath)) {
  fail(`Manifest not found at ${manifestPath}. Run \`next build\` first.`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (!manifest?.bundles?.length) {
  fail(`Manifest ${manifestPath} does not contain any bundles.`);
}

const baseDir = path.dirname(manifestPath);

let cachedS3Client;

for (const bundle of manifest.bundles) {
  const zipPath = resolveZipPath(bundle.zipFile, baseDir);
  const functionName = deriveFunctionName({ bundle, functionPrefix });
  const label = bundle.name ?? bundle.route ?? path.basename(zipPath);

  console.log(`\nDeploying bundle ${label} → function ${functionName}`);

  await ensureFunctionExists({ name: functionName });

  const stat = await fsp.stat(zipPath);
  const useObjectStorage = forceObjectStorage || stat.size > OBJECT_STORAGE_THRESHOLD_BYTES;
  const versionArgs = useObjectStorage
    ? await prepareObjectStorageVersionArgs({ functionName, zipPath, sizeBytes: stat.size })
    : prepareInlineVersionArgs({ functionName, zipPath });

  appendCommonFlags(versionArgs);

  const result = spawnSync("yc", versionArgs, { stdio: "inherit" });

  if (result.status !== 0) {
    fail(`yc failed for bundle ${label} (exit ${result.status ?? "?"})`, result.status ?? 1);
  }
}

console.log("\nDeployment complete.");

function parseArgs(list) {
  const parsed = {};

  for (let i = 0; i < list.length; i += 1) {
    const token = list[i];

    if (!token.startsWith("--")) {
      continue;
    }

    const eq = token.indexOf("=");

    if (eq !== -1) {
      parsed[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }

    const key = token.slice(2);
    const next = list[i + 1];

    if (next === undefined || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    i += 1;
  }

  return parsed;
}

function resolveZipPath(value, base) {
  return path.isAbsolute(value) ? value : path.resolve(base, value);
}

function deriveFunctionName({ bundle, functionPrefix }) {
  if (bundle.functionName) {
    return bundle.functionName;
  }

  if (bundle.name) {
    return sanitize(`${functionPrefix}-${bundle.name}`);
  }

  return sanitize(`${functionPrefix}-bundle`);
}

function sanitize(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/--+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function prepareInlineVersionArgs({ functionName, zipPath }) {
  return [
    "serverless",
    "function",
    "version",
    "create",
    "--function-name",
    functionName,
    "--runtime",
    runtime,
    "--entrypoint",
    entrypoint,
    "--memory",
    memory,
    "--execution-timeout",
    timeout,
    "--source-path",
    zipPath,
  ];
}

async function prepareObjectStorageVersionArgs({ functionName, zipPath, sizeBytes }) {
  console.log(
    `  ZIP ${path.basename(zipPath)} is ${(sizeBytes / 1024 / 1024).toFixed(2)} MB, uploading via Object Storage...`,
  );

  const upload = await uploadToObjectStorage({ zipPath, functionName });

  return [
    "serverless",
    "function",
    "version",
    "create",
    "--function-name",
    functionName,
    "--runtime",
    runtime,
    "--entrypoint",
    entrypoint,
    "--memory",
    memory,
    "--execution-timeout",
    timeout,
    "--package-bucket-name",
    upload.bucket,
    "--package-object-name",
    upload.object,
  ];
}

function appendCommonFlags(versionArgs) {
  if (folderId) {
    versionArgs.push("--folder-id", folderId);
  }

  if (cloudId) {
    versionArgs.push("--cloud-id", cloudId);
  }

  if (serviceAccountId) {
    versionArgs.push("--service-account-id", serviceAccountId);
  }
}

async function uploadToObjectStorage({ zipPath, functionName }) {
  const bucket = explicitBucket ?? `${functionName}-deploys`;

  await ensureBucket(bucket);

  const object = `${functionName}/${crypto.randomUUID()}-${path.basename(zipPath)}`;
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: object,
      Body: createReadStream(zipPath),
    }),
  );

  return { bucket, object };
}

function getS3Client() {
  if (cachedS3Client) {
    return cachedS3Client;
  }

  const accessKeyId = process.env.YC_STORAGE_ACCESS_KEY;
  const secretAccessKey = process.env.YC_STORAGE_SECRET_KEY;

  if (!accessKeyId || !secretAccessKey) {
    fail("YC_STORAGE_ACCESS_KEY and YC_STORAGE_SECRET_KEY must be set to upload large ZIPs via Object Storage.");
  }

  cachedS3Client = new S3Client({
    region: process.env.YC_STORAGE_REGION ?? "ru-central1",
    endpoint: process.env.YC_STORAGE_ENDPOINT ?? "https://storage.yandexcloud.net",
    credentials: { accessKeyId, secretAccessKey },
  });

  return cachedS3Client;
}

async function ensureBucket(bucketName) {
  const check = spawnSync("yc", ["storage", "bucket", "get", bucketName], { stdio: "ignore" });

  if (check.status === 0) {
    return;
  }

  const createArgs = ["storage", "bucket", "create", "--name", bucketName];

  if (folderId) {
    createArgs.push("--folder-id", folderId);
  }

  if (cloudId) {
    createArgs.push("--cloud-id", cloudId);
  }

  const create = spawnSync("yc", createArgs, { stdio: "inherit" });

  if (create.status !== 0) {
    fail(`Failed to create bucket ${bucketName}`);
  }
}

async function ensureFunctionExists({ name }) {
  const checkArgs = ["serverless", "function", "get", "--name", name];

  if (folderId) {
    checkArgs.push("--folder-id", folderId);
  }

  if (cloudId) {
    checkArgs.push("--cloud-id", cloudId);
  }

  const check = spawnSync("yc", checkArgs, { stdio: "ignore" });

  if (check.status === 0) {
    return;
  }

  const createArgs = ["serverless", "function", "create", "--name", name];

  if (folderId) {
    createArgs.push("--folder-id", folderId);
  }

  if (cloudId) {
    createArgs.push("--cloud-id", cloudId);
  }

  const create = spawnSync("yc", createArgs, { stdio: "inherit" });

  if (create.status !== 0) {
    fail(`Failed to create Yandex Cloud Function ${name}`);
  }
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}
