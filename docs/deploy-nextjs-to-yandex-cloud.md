# Deploy Next.js to Yandex Cloud Functions

`@yc-next/cli` is a deployment adapter and CLI for running Next.js on Yandex Cloud Functions. It is designed for teams that want a single-command path from `next build` to a public Yandex Cloud URL without hand-writing `yc serverless` and API Gateway steps.

## What it does

The adapter plugs into Next.js's Deployment Adapter API and emits a Yandex Cloud deployment bundle. The CLI then uploads that bundle, creates or updates the Cloud Function, configures an API Gateway, and prints a public URL.

This works for:

- App Router routes
- API routes
- Server-rendered pages
- Middleware
- `public/*`
- `/_next/static/*`

## Why use a deployment adapter for Yandex Cloud

Deploying Next.js to Yandex Cloud manually usually means stitching together several pieces:

- standalone build output
- ZIP packaging
- Object Storage uploads for larger bundles
- Cloud Function version creation
- API Gateway route wiring
- public invocation setup

`@yc-next/cli` wraps that path into a repeatable workflow that fits normal Next.js development.

## Basic flow

1. Install `@yc-next/cli` in a Next.js 16 project.
2. Point `experimental.adapterPath` at `yc-adapter.config.mjs`.
3. Run `npx next build`.
4. Run `npx yc-next deploy`.
5. Open the generated Yandex Cloud API Gateway URL.

## Runtime environment variables

You can pass runtime env vars to the deployed function in three ways:

- declare `runtimeEnv` in `yc-adapter.config.mjs`
- pass `--env-file .env.production`
- pass one-off overrides with `--env KEY=VALUE`

This is useful for database URLs, internal API origins, feature flags, and secrets that must exist in the function runtime rather than only during the local build.

## Related docs

- [Running Next.js on Yandex Cloud Functions](./nextjs-on-yandex-cloud-functions.md)
- [Using Prisma with Next.js on Yandex Cloud](./nextjs-prisma-yandex-cloud.md)
- [README](../README.md)
