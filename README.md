# nextjs-yandex-cloud-adapter

Run a [Next.js 16](https://nextjs.org/) app on [Yandex Cloud Functions](https://yandex.cloud/services/functions). The package plugs into Next.js's experimental Deployment Adapter API, packages a self-contained bundle, and ships a CLI that creates the Cloud Function, sets up an API Gateway, and tears everything down again on demand.

```bash
npx next build
npx yc-next deploy
# › example-app → function example-app
#   uploading 15.68 MB → s3://yc-functions
# › API Gateway example-app-gw
# ✓ Deployment complete
# URL: https://d5dflufgm348hnrpnril.y3q8o1jq.apigw.yandexcloud.net
```

The same single command serves App Router routes, API routes, server-rendered pages, middleware, `/_next/static/*` and `public/*` from one Cloud Function — no separate hosting for assets, no manual `yc serverless` invocations.

---

## Status

The adapter and CLI run live against Node 16 builds on `nodejs22` Cloud Functions today. What works end-to-end:

- App Router / Pages Router routes
- API routes (`/api/*`)
- Server-rendered pages (RSC + streaming)
- Middleware
- `/_next/static/*` and `public/*` served from the bundle
- Path-based routing through a generated API Gateway

What's on the roadmap:

- Per-route bundle trimming via `.nft.json` (multi-mode currently duplicates the standalone)
- Image Optimization (`next/image`) endpoint
- Custom domain attachment via Cert Manager
- ISR / on-demand revalidation
- GitHub Action wrapper

---

## Quickstart

Five steps from zero to a public URL.

### 1. Prerequisites

- **Node.js 20+** locally and a Next.js 16 project.
- **Yandex Cloud CLI** ([install](https://yandex.cloud/docs/cli/quickstart)) — run `yc init` once to log in. After that `yc config get folder-id` returns your default folder.
- **Object Storage HMAC keys** for the service account that will host the deploy bucket. Bundles larger than ~3.5 MB (i.e. anything real-world) cannot be uploaded inline by `yc serverless function version create` and have to go through S3-compatible Object Storage. Create the service account in the YC console, grant it the `storage.editor` role, and [generate static keys](https://yandex.cloud/docs/iam/operations/sa/create-access-key).

### 2. Install

```bash
npm install nextjs-yandex-cloud-adapter --save-dev
```

### 3. Wire up the adapter

Create `yc-adapter.config.mjs` next to `next.config.ts`:

```js
// yc-adapter.config.mjs
import yandexCloudAdapter from "nextjs-yandex-cloud-adapter";

export default yandexCloudAdapter({
  functionName: "my-next-app",
});
```

Reference it from `next.config.ts`:

```ts
import { createRequire } from "node:module";
import path from "node:path";
import type { NextConfig } from "next";

const require = createRequire(import.meta.url);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname),
  experimental: {
    adapterPath: require.resolve("./yc-adapter.config.mjs"),
  },
};

export default nextConfig;
```

> `outputFileTracingRoot` is recommended explicitly — without it Next.js's lockfile-based heuristic can pick a parent directory and pollute the workspace's `package.json` during `next build`.

### 4. Configure secrets

Copy `.env.example` from this repo (or write your own) and fill in:

```bash
YC_FOLDER_ID=...
YC_STORAGE_ACCESS_KEY=...
YC_STORAGE_SECRET_KEY=...
```

`YC_FOLDER_ID` defaults to `yc config get folder-id` when unset; the storage keys are required only when bundles cross the inline-upload threshold.

### 5. Build and deploy

```bash
npx next build
npx yc-next deploy
```

The build writes `.next/yc/manifest.json` with the bundles. `deploy` pushes them up, wires an API Gateway, marks the function publicly invokable, and prints the URL on the last line.

To take it back down:

```bash
npx yc-next destroy --yes
```

This reads `.next/yc/state.json` (written by `deploy`) and deletes every Cloud Function, API Gateway, and uploaded ZIP it touched.

---

## CLI reference

```text
yc-next deploy [options]    Build a deployment from .next/yc/manifest.json
yc-next destroy [options]   Tear down resources recorded in .next/yc/state.json
yc-next help [command]      Show usage for a specific command
```

### `yc-next deploy`

| Flag | Default | Description |
| ---- | ------- | ----------- |
| `--manifest <path>` | `.next/yc/manifest.json` | Path to the manifest emitted by `next build`. |
| `--memory <size>` | `1024m` | Per-function memory. |
| `--timeout <duration>` | `30s` | Function execution timeout. |
| `--runtime <name>` | `nodejs22` | YC runtime. Currently the only Node runtime available. |
| `--entrypoint <name>` | `index.handler` | Handler entrypoint inside the ZIP. |
| `--prefix <name>` | `next` | Function-name prefix for bundles without a preset name. |
| `--bucket <name>` | `<functionName>-deploys` | Object Storage bucket for ZIP uploads. |
| `--gateway-name <name>` | derived from manifest | Override API Gateway name. |
| `--no-gateway` | gateway on | Skip API Gateway setup (handy if you front the function with something else). |
| `--no-public` | public on | Skip `allow-unauthenticated-invoke`; the URL will need an IAM token. |
| `--force-object-storage` | off | Always upload via Object Storage, even for tiny ZIPs. |

### `yc-next destroy`

| Flag | Default | Description |
| ---- | ------- | ----------- |
| `--manifest-dir <path>` | `.next/yc` | Where `state.json` lives. |
| `--yes` | dry-run | Required to actually delete. Without it the command only prints the plan and exits with code 2. |

### Environment variables

The CLI reads `.env` automatically.

- `YC_FOLDER_ID` (required if `yc config get folder-id` returns nothing)
- `YC_CLOUD_ID` (optional, only for accounts spanning multiple clouds)
- `YC_SERVICE_ACCOUNT_ID` (optional, attached to the function version)
- `YC_STORAGE_ACCESS_KEY` / `YC_STORAGE_SECRET_KEY` (required for >3.5 MB bundles)
- `YC_STORAGE_BUCKET` (alternative to `--bucket`)
- `YC_STORAGE_REGION`, `YC_STORAGE_ENDPOINT` (only if you point at a non-default endpoint)
- `YC_FUNCTION_PREFIX` (alternative to `--prefix`)

---

## Adapter options

```ts
yandexCloudAdapter({
  oneFunction: true,        // emit one ZIP for the whole app (default)
  functionName: "my-app",   // YC function name (also used as gateway prefix)
  outputDir: ".next/yc",    // where bundles + manifest land
  includeStaticAssets: true // bundle .next/static + public into the ZIP
});
```

### `oneFunction: true | false`

| Mode | Description |
| ---- | ----------- |
| `true` (default) | One ZIP serves the whole app behind a single Cloud Function. The most efficient option today. |
| `false` | Emits one ZIP per detected route. Each ZIP currently duplicates the full standalone, so total upload size scales linearly with route count — only useful when YC settings (memory, timeout, concurrency) need to differ per endpoint. The API Gateway dispatches each path to its own function. |

In multi-mode, code-level isolation between routes is **not** enforced inside the function — every bundle still boots the full Next.js server and is technically capable of handling any route. The actual routing happens at the API Gateway layer. Per-route trimming via `.nft.json` is on the roadmap.

### `includeStaticAssets: true | false`

By default the adapter bundles both `.next/static/*` and `public/*` into the ZIP, and the runtime serves them itself **before** Next.js sees the request. That makes a fresh deploy genuinely self-contained: HTML, RSC payloads, fonts, images and `/favicon.ico` all work without any extra infrastructure.

Set to `false` if you upload assets to a CDN (or a separate Object Storage bucket with public read) and set `assetPrefix` in `next.config`:

```ts
const nextConfig: NextConfig = {
  output: "standalone",
  assetPrefix: process.env.ASSET_PREFIX, // e.g. "https://cdn.example.com"
};
```

You then need to:

1. Upload `.next/static/**` and `public/**` to the CDN, preserving paths (`<cdn>/_next/static/...` and `<cdn>/<file>`).
2. Re-run the build before redeploy so the inlined HTML references the new prefix.

`/_next/static/*` filenames carry a content hash, so they can be served with `Cache-Control: public, max-age=31536000, immutable`. `public/*` filenames are user-supplied and should use a short cache-control unless you fingerprint them yourself.

---

## How it works

1. `modifyConfig` forces `output: "standalone"` so Next.js emits a self-contained build.
2. After the build the adapter reads `.next/server` manifests to enumerate App Router routes, API routes, SSR pages, and middleware (recorded into `manifest.json` for the CLI to use).
3. For every bundle it copies `.next/standalone/**` and the manifests `NextNodeServer` needs at runtime (`required-server-files.json`, `BUILD_ID`, `routes-manifest.json`, ...). It also overrides `.next/package.json` with `{"type":"commonjs"}` so webpack-bundled routes don't get loaded as ESM.
4. The generated `index.js` is a thin shim that calls `runtime/next-server.js#createHandler({ appDir })`. That helper boots `NextNodeServer` once per cold start, then dispatches each YC HTTP event through `getRequestHandler()` via a Node `IncomingMessage`/`ServerResponse` shim. Static assets are served from disk before the request hits Next.js.
5. Bundles are zipped deterministically and listed in `.next/yc/manifest.json` for `yc-next deploy` to consume.

---

## Limits and gotchas

- **YC function ZIP limits**: 100 MB compressed, 256 MB unzipped. The example app comes in around 16 MB; substantial dependency trees can push close to the cap. Watch the bundle size.
- **Cold starts**: booting `NextNodeServer` adds ~1-3 s on top of YC's normal cold start. Increase `--memory` (more memory = faster CPU on YC) or set `concurrency` higher to keep instances warm.
- **Runtime**: YC currently only exposes `nodejs22`. Older Node versions are not selectable.
- **Path routing**: Cloud Functions' bare invoke URL (`functions.yandexcloud.net/<id>`) does not pass paths to the function — it's reserved for routing-by-id. You need an API Gateway in front. The CLI sets one up automatically.
- **`outputFileTracingRoot`**: when you have multiple lockfiles in your repo tree (monorepos, sibling packages), Next.js's heuristic may pick a parent directory as the workspace root and copy that parent's `package.json` into your build. Always set `outputFileTracingRoot: path.resolve(__dirname)` in `next.config` to pin it.
- **HMAC keys ≠ user account**: HMAC keys are bound to a service account, and YC respects the SA's bucket ACL. If the SA can't see the bucket, `PutObject` fails with `AccessDenied`. Either pre-create a bucket the SA owns or use `--bucket` to point at one it can write to.
- **Image optimization**: `next/image` runs server-side via Sharp by default. The adapter ships Sharp from the standalone, but production tuning (cache headers, concurrent invocations) hasn't been validated. If you need it now, treat it as experimental.

---

## License

[MIT](./LICENSE)
