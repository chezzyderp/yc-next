"use strict";

const { Buffer } = require("node:buffer");

function decodeBody(body, isBase64Encoded) {
  if (body == null) return null;
  if (body === "") return Buffer.alloc(0);
  if (isBase64Encoded) return Buffer.from(body, "base64");
  if (typeof body === "string") return Buffer.from(body, "utf8");
  return Buffer.from(body);
}

function getMethod(event) {
  return (
    event?.httpMethod ||
    event?.requestContext?.http?.method ||
    event?.requestContext?.method ||
    "GET"
  ).toUpperCase();
}

function getHeaders(event) {
  const headers = new Headers();
  const sourceHeaders = event?.headers || {};
  for (const [key, value] of Object.entries(sourceHeaders)) {
    if (!key) continue;
    if (value == null) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, String(item)));
      continue;
    }
    headers.append(key, String(value));
  }

  const multiValueHeaders = event?.multiValueHeaders || {};
  for (const [key, values] of Object.entries(multiValueHeaders)) {
    if (!Array.isArray(values)) continue;
    values.forEach((value) => {
      if (value == null) return;
      headers.append(key, String(value));
    });
  }

  return headers;
}

function buildUrl(event) {
  const headerEntries = Object.entries(event?.headers || {}).reduce((acc, [key, value]) => {
    if (!key) return acc;
    acc[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    return acc;
  }, {});
  const proto = (headerEntries["x-forwarded-proto"] || headerEntries["x-forwarded-protocol"] || "https").toLowerCase();
  const host = headerEntries["x-forwarded-host"] || headerEntries.host || "localhost";
  const rawPath = event?.rawPath || event?.path || event?.requestContext?.http?.path || "/";
  const query = buildQuery(event);
  return `${proto}://${host}${rawPath}${query ? `?${query}` : ""}`;
}

function buildQuery(event) {
  if (event?.rawQueryString) return event.rawQueryString;
  const params = event?.multiValueQueryStringParameters || {};
  const singleParams = event?.queryStringParameters || {};
  const search = new URLSearchParams();
  for (const [key, values] of Object.entries(params)) {
    if (!Array.isArray(values)) continue;
    values.forEach((value) => {
      if (value == null) return;
      search.append(key, String(value));
    });
  }
  for (const [key, value] of Object.entries(singleParams)) {
    if (value == null) continue;
    search.append(key, String(value));
  }
  return search.toString();
}

async function ycEventToRequest(event = {}) {
  if (typeof Request !== "function") {
    throw new Error("Global Request constructor is not available. Node.js 18+ is required.");
  }
  const method = getMethod(event);
  const headers = getHeaders(event);
  const bodyBuffer = decodeBody(event.body, event.isBase64Encoded);
  const init = { method, headers };
  if (bodyBuffer !== null && method !== "GET" && method !== "HEAD") {
    init.body = bodyBuffer;
    init.duplex = "half";
  }
  const request = new Request(buildUrl(event), init);
  return request;
}

module.exports = { ycEventToRequest };
