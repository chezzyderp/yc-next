# with-database

Production-oriented example for `@yc-next/cli` using Next.js 16, Prisma, and PostgreSQL.

This example keeps the UI intentionally small and focuses on the server-side pattern:

- `DATABASE_URL` is declared in `runtimeEnv`
- Prisma Client is created through a singleton helper
- `GET /api/posts` reads recent rows
- `POST /api/posts` inserts a row

## Install

```bash
npm install
cp .env.example .env
```

Set `DATABASE_URL` to a reachable PostgreSQL instance.

## Initialize the database

```bash
npx prisma generate
npx prisma migrate dev --name init
```

## Run locally

```bash
npm run dev
```

Try the API:

```bash
curl -sS http://localhost:3000/api/posts
curl -sS -X POST http://localhost:3000/api/posts \
  -H 'content-type: application/json' \
  -d '{"title":"Hello Prisma","content":"Created from the example app"}'
```

## Deploy to Yandex Cloud

This example declares:

```js
runtimeEnv: ["DATABASE_URL"]
```

So the deploy machine must have `DATABASE_URL` in its local environment:

```bash
npx next build
DATABASE_URL='postgresql://...' npx yc-next deploy
```

Or from a deploy-time env file:

```bash
npx next build
DATABASE_URL='postgresql://...' npx yc-next deploy --env-file .env.production
```

If `DATABASE_URL` exists both in `--env-file` and local `process.env`, the adapter-declared `runtimeEnv` value from local `process.env` wins.

## Notes

- This is a serverless example, so keep Postgres connection counts low.
- For larger workloads, prefer a pooled or proxy-backed Postgres setup.
