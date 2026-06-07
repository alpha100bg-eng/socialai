import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Anchor the workspace root to this subproject, not the monorepo root
    root: path.resolve(__dirname),
  },
  // Playwright and native modules must NOT be bundled
  serverExternalPackages: ['playwright', 'playwright-core', '@playwright/test'],
};

export default nextConfig;
