"use strict";

const path = require("node:path");
const { IncomingMessage, ServerResponse } = require("node:http");
const { Socket } = require("node:net");
const { Buffer } = require("node:buffer");

const BINARY_MIME_RE = /^(?:image\/|audio\/|video\/|font\/|application\/(?:octet-stream|pdf|zip|gzip|x-protobuf|wasm|x-tar|vnd\.ms-|vnd\.openxmlformats-))/i;

function lowercaseHeaders(headers = {}) {
  const out = {};

  for (const [key, value] of Object.entries(headers)) {
    if (!key || value == null) continue;

    const lower = key.toLowerCase();

    if (Array.isArray(value)) {
      out[lower] = value.map((item) => String(item));
      continue;
    }

    out[lower] = String(value);
  }

  return out;
}

function buildUrl(event) {
  // YC API Gateway resolves the URL into `event.url` (already includes query string).
  // Direct YC HTTP function invocations expose `event.rawPath` plus `event.rawQueryString`.
  // We also accept the AWS API Gateway v2 shape via `event.requestContext.http.path` for portability.
  if (typeof event.url === "string" && event.url.length) {
    return event.url;
  }

  const rawPath = event.rawPath || event?.requestContext?.http?.path || event.path || "/";
  const rawQuery = event.rawQueryString;

  if (rawQuery) {
    return `${rawPath}?${rawQuery}`;
  }

  const params = event.multiValueQueryStringParameters || {};
  const single = event.queryStringParameters || {};
  const search = new URLSearchParams();

  for (const [key, values] of Object.entries(params)) {
    if (!Array.isArray(values)) {
      continue;
    }

    for (const value of values) {
      if (value != null) {
        search.append(key, String(value));
      }
    }
  }

  for (const [key, value] of Object.entries(single)) {
    if (value != null) {
      search.append(key, String(value));
    }
  }

  const query = search.toString();

  return query ? `${rawPath}?${query}` : rawPath;
}

function decodeBody(body, isBase64Encoded) {
  if (body == null || body === "") return null;
  if (isBase64Encoded) return Buffer.from(body, "base64");
  if (typeof body === "string") return Buffer.from(body, "utf8");

  return Buffer.from(body);
}

function createMockReq(event) {
  const socket = new Socket();
  const req = new IncomingMessage(socket);

  req.method = (event.httpMethod || event?.requestContext?.http?.method || "GET").toUpperCase();
  req.url = buildUrl(event);
  req.headers = lowercaseHeaders(event.headers);

  const body = decodeBody(event.body, event.isBase64Encoded);

  if (body) req.push(body);

  req.push(null);
  req.complete = true;

  return req;
}

function createMockRes(req) {
  const socket = new Socket();
  const res = new ServerResponse(req);

  res.assignSocket(socket);

  const chunks = [];
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  res.write = function patchedWrite(chunk, encoding, cb) {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf8"));
    }

    if (typeof encoding === "function") encoding();
    else if (typeof cb === "function") cb();

    return true;
  };

  res.end = function patchedEnd(chunk, encoding, cb) {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf8"));
    }

    res.emit("finish");
    res.emit("close");
    socket.destroy();

    if (typeof encoding === "function") encoding();
    else if (typeof cb === "function") cb();

    return res;
  };

  // suppress real socket writes
  void originalWrite;
  void originalEnd;

  return {
    res,
    finished: new Promise((resolve) => {
      res.once("finish", () => resolve());
      res.once("close", () => resolve());
    }),
    collect() {
      return Buffer.concat(chunks);
    },
  };
}

function flattenHeaders(headers) {
  const out = {};
  let cookies;

  for (const [key, value] of Object.entries(headers || {})) {
    if (value == null) continue;

    const lower = key.toLowerCase();

    if (lower === "set-cookie") {
      cookies = Array.isArray(value) ? value.slice() : [String(value)];
      continue;
    }

    out[lower] = Array.isArray(value) ? value.join(", ") : String(value);
  }

  return { headers: out, cookies };
}

function isBinaryContent(contentType) {
  if (!contentType) return false;

  return BINARY_MIME_RE.test(contentType);
}

function buildYcResponse(res, body) {
  const { headers, cookies } = flattenHeaders(res.getHeaders());
  const contentType = headers["content-type"];
  const isBinary = isBinaryContent(contentType);

  const result = {
    statusCode: res.statusCode || 200,
    headers,
    isBase64Encoded: isBinary,
    body: isBinary ? body.toString("base64") : body.toString("utf8"),
  };

  if (cookies && cookies.length) result.multiValueHeaders = { "set-cookie": cookies };

  return result;
}

function loadNextConfig(appDir) {
  const requiredServerFilesPath = path.join(appDir, ".next", "required-server-files.json");
  const raw = require("node:fs").readFileSync(requiredServerFilesPath, "utf8");
  const parsed = JSON.parse(raw);

  return parsed.config;
}

const STATIC_MIME = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
};

function tryReadAsset(absolutePath) {
  const fs = require("node:fs");

  try {
    return fs.readFileSync(absolutePath);
  } catch {
    return null;
  }
}

function buildAssetResponse(absolutePath, buffer, cacheControl) {
  const ext = path.extname(absolutePath).toLowerCase();
  const contentType = STATIC_MIME[ext] ?? "application/octet-stream";
  const isBinary =
    !contentType.startsWith("text/") &&
    !contentType.includes("json") &&
    !contentType.includes("javascript") &&
    !contentType.includes("svg");

  return {
    statusCode: 200,
    headers: {
      "content-type": contentType,
      "cache-control": cacheControl,
    },
    isBase64Encoded: isBinary,
    body: isBinary ? buffer.toString("base64") : buffer.toString("utf8"),
  };
}

function tryServeStatic(appDir, urlPath) {
  if (urlPath.includes("..")) {
    return null;
  }

  if (urlPath.startsWith("/_next/static/")) {
    const relative = urlPath.replace(/^\/_next\/static\//, "");
    const absolutePath = path.join(appDir, ".next", "static", relative);
    const buffer = tryReadAsset(absolutePath);

    if (!buffer) {
      return null;
    }

    return buildAssetResponse(absolutePath, buffer, "public, max-age=31536000, immutable");
  }

  if (urlPath === "/" || urlPath.startsWith("/_next/")) {
    return null;
  }

  const publicAbsolutePath = path.join(appDir, "public", urlPath);
  const publicBuffer = tryReadAsset(publicAbsolutePath);

  if (!publicBuffer) {
    return null;
  }

  return buildAssetResponse(publicAbsolutePath, publicBuffer, "public, max-age=0, must-revalidate");
}

function createHandler({ appDir, nextConfig } = {}) {
  if (!appDir) {
    throw new Error("createHandler requires { appDir } pointing to the standalone app directory.");
  }

  process.env.NODE_ENV = process.env.NODE_ENV || "production";

  const conf = nextConfig ?? loadNextConfig(appDir);

  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(conf);

  const NextServerCtor = require(
    require.resolve("next/dist/server/next-server", { paths: [appDir] }),
  ).default;
  const server = new NextServerCtor({
    dir: appDir,
    dev: false,
    minimalMode: true,
    customServer: false,
    conf,
    hostname: "localhost",
    port: 3000,
  });
  const requestHandler = server.getRequestHandler();

  return async function ycHandler(event = {}) {
    const url = buildUrl(event);
    const pathname = url.split("?", 1)[0];
    const staticResponse = tryServeStatic(appDir, pathname);

    if (staticResponse) {
      return staticResponse;
    }

    const req = createMockReq(event);
    const { res, finished, collect } = createMockRes(req);

    try {
      await requestHandler(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain");
        res.end(`Internal Server Error: ${error?.message ?? "unknown"}`);
      } else if (!res.writableFinished) {
        res.end();
      }
    }

    await finished;

    return buildYcResponse(res, collect());
  };
}

module.exports = { createHandler };
