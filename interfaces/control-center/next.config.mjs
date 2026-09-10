import path from "node:path";
import { fileURLToPath } from "node:url";
const configuredDevOrigins = (process.env.PRITHA_CONTROL_CENTER_ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const configuredDistDir = String(process.env.PRITHA_CONTROL_CENTER_DIST_DIR || "").trim();

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..") },
  agentRules: false,
  // Proxy buffering exceeds the original-file limit so upload streams reach
  // their own byte guard without accepting a truncated 100 MiB prefix.
  experimental: { proxyClientMaxBodySize: 110 * 1024 * 1024 },
  ...(configuredDistDir ? { distDir: configuredDistDir } : {}),
  allowedDevOrigins: ["localhost", "127.0.0.1", "**.ts.net", ...configuredDevOrigins],
  devIndicators: false,
  async redirects() {
    // Redirect the legacy entry point before AppShell runs host diagnostics.
    // Next preserves the original query, including repeated parameters.
    return [{ source: "/codex", destination: "/task-chat", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
