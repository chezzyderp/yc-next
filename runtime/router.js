"use strict";

function normalizePathname(pathname) {
  if (!pathname) return "/";
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}

function createRouter(routeDefinitions, lifecycle) {
  if (!lifecycle || typeof lifecycle.ycEventToRequest !== "function" || typeof lifecycle.webResponseToYc !== "function") {
    throw new Error("Router lifecycle helpers are required.");
  }
  const compiled = routeDefinitions.map((definition) => compileDefinition(definition));
  return async function router(event, context = {}) {
    const request = await lifecycle.ycEventToRequest(event);
    const url = new URL(request.url);
    const pathname = normalizePathname(url.pathname);
    for (const route of compiled) {
      if (!route.matcher.test(pathname)) continue;
      const response = await route.invoke(request, context);
      return lifecycle.webResponseToYc(response);
    }
    return {
      statusCode: 404,
      headers: { "content-type": "text/plain" },
      body: `No route matched ${pathname}`,
    };
  };
}

function compileDefinition(definition) {
  const matcher = new RegExp(definition.pattern);
  let cachedHandler;
  return {
    ...definition,
    matcher,
    invoke(request, context) {
      if (!cachedHandler) {
        const loaded = definition.load();
        cachedHandler = loaded?.default || loaded?.handler || loaded;
        if (typeof cachedHandler !== "function") {
          throw new Error(`Route ${definition.path} does not export a handler function.`);
        }
      }
      return cachedHandler(request, context);
    },
  };
}

module.exports = { createRouter, normalizePathname };
