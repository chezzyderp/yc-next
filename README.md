# nextjs-yandex-cloud-adapter

A production-ready [Next.js 16](https://nextjs.org/) deployment adapter that emits [Yandex Cloud Functions](https://cloud.yandex.com/en/services/functions) compatible bundles. It reads your standalone Next.js build, maps App Router routes, API routes, and middleware, and packages them into ZIP archives that can be uploaded directly to Yandex Cloud.

## Installation

```bash
npm install nextjs-yandex-cloud-adapter --save-dev
```

Peer dependencies:

- `next@^16.0.0`
- Node.js 18 or newer during build and at runtime (Yandex Cloud Functions Node.js 18 runtime)

## Usage

Enable the adapter inside `next.config.js` using the official Deployment Adapter API:

```js
import yandexCloudAdapter from "nextjs-yandex-cloud-adapter";

const config = {
  experimental: {
    deploymentAdapter: yandexCloudAdapter({
      oneFunction: false,
      functionName: "next-app",
      outputDir: ".next/yc",
    }),
  },
};

export default config;
```

Run your normal build:

```bash
npm run build
```

After the build completes the adapter writes ZIP bundles and a manifest to `.next/yc`. Each ZIP contains:

- The generated handler (`index.js`)
- The Next.js standalone output (`standalone/.next/**` + pruned `node_modules`)
- Shared runtime helpers (YC request/response converters and router)
- The route entrypoint(s)

## Single-function vs Multi-function Modes

| Mode | Description |
| ---- | ----------- |
| `oneFunction: false` (default) | Creates one ZIP per route or middleware. Ideal when you want independent scaling or selective deployments. |
| `oneFunction: true` | Generates a single router function that dispatches requests to all routes inside one ZIP (`<functionName>.zip`). Useful when managing one Cloud Function with internal routing. |

## Deploying to Yandex Cloud

1. Build your Next.js project as usual (`npm run build`).
2. Inspect `.next/yc/manifest.json` to view generated bundles.
3. Upload a ZIP to Yandex Cloud Functions (Node.js 18 runtime). Example using the CLI:

   ```bash
   yc serverless function version create \
     --function-name my-next-app \
     --runtime nodejs18 \
     --entrypoint index.handler \
     --memory 512m \
     --execution-timeout 10s \
     --source-path .next/yc/app-route-users.zip
   ```

4. Create an HTTP trigger (via CLI or console) pointing to the deployed function(s).
5. Repeat for each ZIP or deploy the router ZIP when `oneFunction: true`.

### Example Manifest excerpt

```json
{
  "adapter": "yandex-cloud",
  "mode": "multi",
  "bundles": [
    {
      "name": "app-route-users",
      "route": "/users",
      "zipFile": ".next/yc/app-route-users.zip"
    },
    {
      "name": "api-route-api-test",
      "route": "/api/test",
      "zipFile": ".next/yc/api-route-api-test.zip"
    }
  ]
}
```

## How it Works

1. Forces standalone output via `modifyConfig` (Next.js output tracing ensures only required `node_modules` are copied).
2. Reads `.next/server` manifests and file structure to detect App Router routes, API routes, SSR pages, and middleware.
3. Generates either dedicated handlers or a router-based multi-entry handler.
4. Copies `.next/standalone` (which already contains pruned dependencies) plus shared YC runtime helpers into each bundle.
5. Builds deterministic ZIP archives ready for `yc` CLI upload or console import.

## License

[MIT](./LICENSE)
# nextjs-yandex-cloud-adapter
# nextjs-yandex-cloud-adapter
