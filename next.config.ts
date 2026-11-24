import { NextConfig } from "next";
import "./env";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // `next dev` would otherwise write an AGENTS.md into the repo root on every
  // run. Agent guidance for this repo lives in CLAUDE.md.
  agentRules: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  /** ... */
};

export default nextConfig;
