export interface RouteTemplateEntry {
  path: string;
  type: string;
  pattern: string;
}

export interface HandlerTemplateOptions {
  appDirRelative: string;
}

export function renderHandler({ appDirRelative }: HandlerTemplateOptions) {
  return `"use strict";

const path = require("node:path");
const { createHandler } = require("./runtime/next-server.js");

const handler = createHandler({
  appDir: path.join(__dirname, ${JSON.stringify(`standalone/${appDirRelative}`)}),
});

exports.handler = handler;
`;
}
