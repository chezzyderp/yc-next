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
