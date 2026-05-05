const createExample = `curl -sS -X POST http://localhost:3000/api/posts \\
  -H 'content-type: application/json' \\
  -d '{"title":"Hello Prisma","content":"Stored in Postgres"}'`;

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 20px",
      }}
    >
      <section
        style={{
          maxWidth: 880,
          margin: "0 auto",
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 28,
          padding: 32,
          boxShadow: "0 30px 80px rgba(28, 37, 44, 0.10)",
          backdropFilter: "blur(10px)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "var(--accent-strong)",
          }}
        >
          Prisma Example
        </p>
        <h1
          style={{
            margin: "12px 0 16px",
            fontSize: "clamp(2.5rem, 6vw, 4.75rem)",
            lineHeight: 0.95,
            maxWidth: 620,
          }}
        >
          PostgreSQL-backed Next.js on Yandex Cloud Functions.
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: 620,
            color: "var(--muted)",
            fontSize: 18,
            lineHeight: 1.6,
          }}
        >
          This example keeps the frontend intentionally small and puts the focus on the
          production pattern: Prisma Client in the runtime, `DATABASE_URL` passed through
          `runtimeEnv`, and a tiny API surface for reads and writes.
        </p>

        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            marginTop: 28,
          }}
        >
          {[
            ["GET /api/posts", "Reads up to 10 recent rows ordered by creation time."],
            ["POST /api/posts", "Accepts JSON with title/content and inserts a record."],
            ["runtimeEnv", "Deploy with local DATABASE_URL and let the adapter pass it through."],
          ].map(([title, copy]) => (
            <div
              key={title}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 20,
                padding: 18,
                background: "rgba(255,255,255,0.55)",
              }}
            >
              <strong style={{ display: "block", marginBottom: 8 }}>{title}</strong>
              <span style={{ color: "var(--muted)", lineHeight: 1.5 }}>{copy}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 28,
            padding: 20,
            borderRadius: 20,
            background: "#1c252c",
            color: "#f8f4ec",
            overflowX: "auto",
          }}
        >
          <pre style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{createExample}</pre>
        </div>
      </section>
    </main>
  );
}
