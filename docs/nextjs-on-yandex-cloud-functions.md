# Running Next.js on Yandex Cloud Functions

This repository focuses on one specific goal: running a real Next.js app on Yandex Cloud Functions with minimal deployment friction.

## What works today

The current adapter and CLI support these Next.js features on Yandex Cloud Functions:

- App Router routes
- Pages Router routes
- API routes
- server-rendered pages
- React Server Components and streaming
- middleware
- static files from `public/*`
- static build output from `/_next/static/*`

Routing is exposed through a generated Yandex Cloud API Gateway so the app behaves like a single public deployment rather than a set of manually managed function URLs.

## How the deployment is structured

At build time, the adapter writes a Yandex Cloud manifest into `.next/yc`. That manifest describes:

- the function bundle
- the entrypoint
- routing metadata
- static asset handling
- optional runtime env passthrough

At deploy time, the CLI reads that manifest and creates the cloud resources needed to serve the app.

## Why Yandex Cloud Functions

Yandex Cloud Functions are a good fit when you want:

- serverless deployment on Yandex Cloud
- simple API Gateway exposure
- pay-per-use style execution
- a small operational surface area for side projects or production services

## Current limitations

Some parts of the broader Next.js hosting surface are still roadmap items:

- `next/image` optimization endpoint
- ISR and on-demand revalidation
- finer per-route bundle trimming
- custom domain attachment workflow in the CLI

## Related docs

- [Deploy Next.js to Yandex Cloud Functions](./deploy-nextjs-to-yandex-cloud.md)
- [Using Prisma with Next.js on Yandex Cloud](./nextjs-prisma-yandex-cloud.md)
