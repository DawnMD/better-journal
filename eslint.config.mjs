import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The reader zone has exactly one source: `useReaderZone()`. Reading the
    // browser zone anywhere else answers with the Node process's zone on the
    // server render and disagrees with the server prefetch (ADR-0001).
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    ignores: ["components/reader-zone.tsx", "tests/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.callee.object.name='Intl'][property.name='resolvedOptions']",
          message:
            "Read the reader zone from useReaderZone() (components/reader-zone.tsx), not from Intl.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
