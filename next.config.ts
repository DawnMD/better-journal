import { NextConfig } from "next";
import "./env";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Instant navigations: a default <Link> loads the route's static App Shell
  // (layouts, headings, Suspense fallbacks) and the reader's data streams in
  // behind it. Nothing per-user is cached on the server; `ensureStatic` on the
  // root layout keeps the shell from quietly turning dynamic again.
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    return [
      // There is no journal index: the dashboard is the home of the signed-in
      // app, and it checks the session itself.
      { source: "/journal", destination: "/dashboard", permanent: false },
    ];
  },
  // `next dev` would otherwise write an AGENTS.md into the repo root on every
  // run. Agent guidance for this repo lives in CLAUDE.md.
  agentRules: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  /** ... */
};

export default nextConfig;
