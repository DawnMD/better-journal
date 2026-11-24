import { NextConfig } from "next";
import "./env";

const nextConfig: NextConfig = {
  reactCompiler: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  /** ... */
};

export default nextConfig;
