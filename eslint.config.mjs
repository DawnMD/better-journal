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
  {
    // Layouts are the App Shell, which `ensureStatic = 'shell'` on the root
    // layout requires to be static. Reading a cookie, a header or the session
    // here would make the shell of every route beneath it render per request.
    // Pages read the request inside their own Suspense boundary instead.
    files: ["app/**/layout.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/headers",
              message:
                "A layout is part of the static App Shell. Read the request in a page, inside Suspense.",
            },
            {
              name: "@clerk/nextjs/server",
              message:
                "A layout is part of the static App Shell. Check the session in a page, inside Suspense.",
            },
            {
              name: "@/server/lib/reader-calendar",
              message:
                "A layout is part of the static App Shell. Seed the reader zone in a page, inside Suspense.",
            },
          ],
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
