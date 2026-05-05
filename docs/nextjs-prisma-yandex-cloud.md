# Using Prisma with Next.js on Yandex Cloud

If your Next.js app talks to PostgreSQL through Prisma, `@yc-next/cli` supports that pattern by passing runtime environment variables into the deployed Yandex Cloud Function.

## Recommended setup

The repository includes an example app in [`examples/with-database`](../examples/with-database) that shows a production-oriented setup:

- Next.js 16
- Prisma ORM
- PostgreSQL
- `DATABASE_URL` passed as runtime env
- API routes using a shared Prisma client singleton

## Why runtime env matters

Database credentials should not be baked into the bundle at build time. Instead, they should be available when the Cloud Function starts.

Use either:

- `runtimeEnv: ["DATABASE_URL"]` in `yc-adapter.config.mjs`
- `npx yc-next deploy --env-file .env.production`
- `npx yc-next deploy --env DATABASE_URL=...`

## Prisma pattern in serverless

The Prisma example uses a shared client singleton so development reloads do not create unnecessary client instances. This keeps the example aligned with the common Prisma pattern used in Next.js API routes and route handlers.

## Deploy flow

1. Configure `DATABASE_URL`.
2. Run `npx next build`.
3. Run `npx yc-next deploy --env-file .env.production`.
4. Verify the deployed route can read and write data through Prisma.

## Related docs

- [Deploy Next.js to Yandex Cloud Functions](./deploy-nextjs-to-yandex-cloud.md)
- [Running Next.js on Yandex Cloud Functions](./nextjs-on-yandex-cloud-functions.md)
- [with-database example](../examples/with-database/README.md)
