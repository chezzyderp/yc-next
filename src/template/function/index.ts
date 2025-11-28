const HEADER = `"use strict";

const { ycEventToRequest } = require("./runtime/yc-request.js");
const { webResponseToYc } = require("./runtime/yc-response.js");
`;

export interface RouteTemplateEntry {
  path: string;
  type: string;
  pattern: string;
  entrypoint: string;
}

export function renderSingleRouteHandler({ entrypoint, routePath, routeType }: { entrypoint: string; routePath: string; routeType: string }) {
  return (
    HEADER +
    `
const entryModule = require(${JSON.stringify(entrypoint)});
const routeHandler = entryModule.default || entryModule.handler || entryModule;

if (typeof routeHandler !== "function") {
  throw new Error(${JSON.stringify(`Route ${routePath} (${routeType}) does not export a handler function.`)});
}

exports.handler = async function ycAdapterHandler(event, context = {}) {
  const request = await ycEventToRequest(event);
  const response = await routeHandler(request, context);
  return webResponseToYc(response);
};
`
  );
}

export function renderMultiRouteHandler({ routes }: { routes: RouteTemplateEntry[] }) {
  const definitions = routes
    .map((route) => {
      return `  {
    path: ${JSON.stringify(route.path)},
    type: ${JSON.stringify(route.type)},
    pattern: ${JSON.stringify(route.pattern)},
    load: () => require(${JSON.stringify(route.entrypoint)}),
  }`;
    })
    .join(",\n");

  return (
    HEADER +
    `const { createRouter } = require("./runtime/router.js");

const router = createRouter([
${definitions}
], { ycEventToRequest, webResponseToYc });

exports.handler = function handler(event, context) {
  return router(event, context);
};
`
  );
}
