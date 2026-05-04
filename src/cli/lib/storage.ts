import { createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

let cachedClient: S3Client | undefined;

export function getS3Client(): S3Client {
  if (cachedClient) {
    return cachedClient;
  }

  const accessKeyId = process.env.YC_STORAGE_ACCESS_KEY;
  const secretAccessKey = process.env.YC_STORAGE_SECRET_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "YC_STORAGE_ACCESS_KEY and YC_STORAGE_SECRET_KEY must be set to upload bundles via Object Storage.",
    );
  }

  cachedClient = new S3Client({
    region: process.env.YC_STORAGE_REGION ?? "ru-central1",
    endpoint: process.env.YC_STORAGE_ENDPOINT ?? "https://storage.yandexcloud.net",
    credentials: { accessKeyId, secretAccessKey },
  });

  return cachedClient;
}

export async function uploadZip({
  bucket,
  zipPath,
  functionName,
}: {
  bucket: string;
  zipPath: string;
  functionName: string;
}): Promise<{ bucket: string; object: string }> {
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

export async function deleteObject({ bucket, object }: { bucket: string; object: string }): Promise<void> {
  const client = getS3Client();

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: object }));
}
