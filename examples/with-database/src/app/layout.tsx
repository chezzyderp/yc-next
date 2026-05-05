import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YC Next Prisma Example",
  description: "Next.js 16 + Prisma + PostgreSQL on Yandex Cloud Functions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
