# nextjs-yandex-cloud-adapter

A production-ready [Next.js 16](https://nextjs.org/) deployment adapter that emits [Yandex Cloud Functions](https://cloud.yandex.com/en/services/functions) compatible bundles. It reads your standalone Next.js build, maps App Router routes, API routes, and middleware, and packages them into ZIP archives that can be uploaded directly to Yandex Cloud.

## Installation

```bash
npm install nextjs-yandex-cloud-adapter --save-dev
```

Peer dependencies:

- `next@^16.0.0`
- Node.js 20 or newer during build and at runtime (Yandex Cloud Functions `nodejs20`+ runtime)

## Usage

Next.js 16 loads deployment adapters via `experimental.adapterPath` — a path to a module whose default export is the adapter factory invocation. Create an adapter config file alongside `next.config.ts`:

```js
// yc-adapter.config.mjs
import yandexCloudAdapter from "nextjs-yandex-cloud-adapter";

export default yandexCloudAdapter({
  oneFunction: true,
  functionName: "next-app",
  outputDir: ".next/yc",
});
```

Reference it from `next.config.ts`:

```ts
import { createRequire } from "node:module";
import type { NextConfig } from "next";

const require = createRequire(import.meta.url);

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    adapterPath: require.resolve("./yc-adapter.config.mjs"),
  },
};

export default nextConfig;
```

Run your normal build:

```bash
npm run build
```

After the build completes the adapter writes ZIP bundles and a manifest to `.next/yc`. Each ZIP contains:

- The generated handler (`index.js`) which boots a `NextNodeServer` and dispatches the incoming Yandex Cloud Functions event through it.
- The Next.js standalone output (`standalone/**`) including pruned `node_modules` and the manifests required by `NextNodeServer`.
- The shared runtime helper (`runtime/next-server.js`) that bridges YC HTTP events to Node `IncomingMessage`/`ServerResponse`.

The same handler powers App Router routes, API routes, server-rendered pages, middleware, and `/_next/static/*` — Next.js itself routes the incoming request once the standalone server is up.

## Single-function vs Multi-function Modes

| Mode | Description |
| ---- | ----------- |
| `oneFunction: true` (default) | One ZIP serves the whole app behind a single Cloud Function and trigger. The most efficient option today. |
| `oneFunction: false` | Emits one ZIP per detected route. Currently each ZIP duplicates the full standalone, so total upload size scales linearly with route count — only worth it if you need per-route memory/timeout configs. Per-route trimming via `.nft.json` is on the roadmap. |

In multi-mode, code-level isolation between routes is **not enforced inside the function** — every bundle still boots the full Next.js server and is technically capable of handling any route. The actual routing happens at the API Gateway layer, which maps each public path to the corresponding YC function. The ZIP-per-route shape pays off only when YC settings (memory, timeout, concurrency, scaling reserve) need to differ per endpoint.

## Static and public assets

By default the adapter bundles both `.next/static/*` and `public/*` into the ZIP, and `runtime/next-server.js` serves them itself **before** Next.js sees the request. That means a fresh deploy to a single Cloud Function is genuinely self-contained: HTML, RSC payloads, fonts, images and `/favicon.ico` all work without any extra infrastructure.

Trade-off: serving every PNG and `.woff2` through a Cloud Function invocation is more expensive (and slower) than a CDN. If your asset surface is large or you already run a CDN, opt out of bundling and host them externally:

```js
yandexCloudAdapter({
  includeStaticAssets: false,
});
```

With that flag set, the adapter **does not** copy `.next/static/*` or `public/*` into the bundle. You become responsible for:

1. Uploading both directories somewhere reachable. Yandex Object Storage with public-read works; so does any CDN you already use. Preserve the path structure (`<bucket>/_next/static/...` and `<bucket>/<file>` for `public/`).
2. Setting [`assetPrefix`](https://nextjs.org/docs/app/api-reference/config/next-config-js/assetPrefix) in `next.config` to that origin so the HTML Next.js renders points at the CDN:
   ```ts
   const nextConfig = {
     output: "standalone",
     assetPrefix: process.env.ASSET_PREFIX, // e.g. "https://cdn.example.com"
   };
   ```
3. Re-running the build before redeploy so the inlined HTML references the new prefix.

`/_next/static/*` filenames already carry a content hash, so they can be served with `Cache-Control: public, max-age=31536000, immutable`. `public/*` filenames are user-supplied and should be served with a short cache-control unless you fingerprint them yourself.

## Deploying to Yandex Cloud

1. Build your Next.js project as usual (`npm run build`).
2. Inspect `.next/yc/manifest.json` to view generated bundles.
3. Upload a ZIP to Yandex Cloud Functions (Node.js 20+ runtime). Example using the CLI:

   ```bash
   yc serverless function version create \
     --function-name my-next-app \
     --runtime nodejs20 \
     --entrypoint index.handler \
     --memory 512m \
     --execution-timeout 10s \
     --source-path .next/yc/app-route-users.zip
   ```

4. Create an HTTP trigger (via CLI or console) pointing to the deployed function(s).
5. Repeat for each ZIP or deploy the router ZIP when `oneFunction: true`.

### CLI deployment helper

After running `next build`, you can reuse the included script to push every bundle in `manifest.json` to Yandex Cloud Functions:

```bash
# Export your Yandex Cloud identifiers once
export YC_FOLDER_ID=<folder-id>
export YC_SERVICE_ACCOUNT_ID=<service-account-id>

# Optional defaults
export YC_FUNCTION_PREFIX=my-next

# Required only for large (>3.5 MB) bundles or when forcing Object Storage
export YC_STORAGE_ACCESS_KEY=<s3-access-key>
export YC_STORAGE_SECRET_KEY=<s3-secret-key>
export YC_STORAGE_BUCKET=my-next-bundles   # optional, defaults to <function>-deploys

# Deploy all bundles
node scripts/deploy-yc.mjs --manifest .next/yc/manifest.json
```

Flags you can override:

- `--runtime nodejs22` – target runtime (default `nodejs20`).
- `--memory 512m` – allocated memory per function.
- `--timeout 15s` – execution timeout.
- `--function-prefix api` – prefix for auto-generated function names when the manifest doesn’t contain a preset `functionName`.
- `--entrypoint index.handler` – handler entrypoint used during deployment.
- `--bucket my-bucket` – target Object Storage bucket; defaults to `<functionName>-deploys`.
- `--useObjectStorage` – force S3 upload even for small archives.

The script iterates over `bundles[]` in the manifest, resolves ZIP paths, and calls `yc serverless function version create` for each bundle. Provide `YC_CLOUD_ID` if you operate across multiple clouds.

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

1. `modifyConfig` forces `output: "standalone"` and `outputFileTracingRoot` so Next.js emits a self-contained build.
2. After the build, the adapter reads `.next/server` manifests to enumerate App Router routes, API routes, SSR pages, and middleware (used for `manifest.json` metadata).
3. For each bundle it copies `.next/standalone/**` plus the manifests `NextNodeServer` needs at runtime (`required-server-files.json`, `BUILD_ID`, `routes-manifest.json`, etc.).
4. A thin generated `index.js` invokes `runtime/next-server.js#createHandler({ appDir })`, which boots `NextNodeServer` once per cold start and dispatches each YC event through `getRequestHandler()` via a Node `IncomingMessage`/`ServerResponse` shim.
5. Every bundle is zipped deterministically and listed in `.next/yc/manifest.json` for the deployment script to consume.

## License

[MIT](./LICENSE)
