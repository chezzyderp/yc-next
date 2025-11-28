"use strict";

const { Buffer } = require("node:buffer");

async function webResponseToYc(response) {
  if (!response) {
    return {
      statusCode: 204,
      headers: {},
      body: "",
      isBase64Encoded: false,
    };
  }

  if (typeof Response === "function" && !(response instanceof Response)) {
    throw new Error("Expected a Web Response object from the Next.js entrypoint.");
  }

  const headers = {};
  response.headers?.forEach((value, key) => {
    if (headers[key]) {
      headers[key] = Array.isArray(headers[key]) ? [...headers[key], value] : [headers[key], value];
      return;
    }
    headers[key] = value;
  });

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = getHeader(headers, "content-type");
  const isBinary = shouldEncodeAsBinary(contentType);
  const body = isBinary ? buffer.toString("base64") : buffer.toString("utf8");
  const normalizedHeaders = flattenHeaders(headers);

  return {
    statusCode: response.status || 200,
    headers: normalizedHeaders,
    body,
    isBase64Encoded: isBinary,
  };
}

function flattenHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      if (key.toLowerCase() === "set-cookie") {
        result[key] = value;
        continue;
      }
      result[key] = value.join(", ");
      continue;
    }
    result[key] = value;
  }
  return result;
}

function shouldEncodeAsBinary(contentType) {
  if (!contentType) return true;
  const lowered = contentType.toLowerCase();
  return !(
    lowered.startsWith("text/") ||
    lowered.includes("json") ||
    lowered.includes("xml") ||
    lowered.includes("javascript") ||
    lowered.includes("svg")
  );
}

function getHeader(headers, name) {
  const value = headers[name] || headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

module.exports = { webResponseToYc };
