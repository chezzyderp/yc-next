# example-next-app

Minimal smoke-test app for `@yc-next/cli`.

This example is intentionally small. It exists to verify that the adapter can:

- build a Next.js 16 app into a YC-compatible bundle
- serve App Router pages and API routes
- receive runtime environment variables in production

## Local development

```bash
npm install
npm run dev
```

## Build with the adapter

```bash
npm run build
```

That produces `.next/yc/manifest.json`, which `yc-next deploy` consumes.

## Runtime env verification

`yc-adapter.config.mjs` declares:

```js
runtimeEnv: ["DATABASE_URL"]
```

The app also exposes `GET /api/echo-env`, which returns:

- `DEMO_MESSAGE` from runtime env
- `DATABASE_URL_SET` as a boolean
- `NODE_ENV`

This route is meant for deploy-time verification without echoing secret values back to the client.

Example deploy flow from this directory:

```bash
npx next build
DATABASE_URL=postgres://example npx yc-next deploy --env DEMO_MESSAGE=hello-from-yc
```

Then open:

```text
https://<gateway-domain>/api/echo-env
```

Expected shape:

```json
{
  "DEMO_MESSAGE": "hello-from-yc",
  "DATABASE_URL_SET": true,
  "NODE_ENV": "production"
}
```
