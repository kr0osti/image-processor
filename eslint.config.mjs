import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextCoreWebVitals,
  // Turn off stylistic rules that conflict with Prettier; formatting itself is
  // checked separately with `pnpm format:check`.
  prettier,
  {
    rules: {
      "no-unused-vars": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // The base rule misreads TypeScript (e.g. parameter names in function types)
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  {
    // CLI scripts, Jest config/setup and tests print to the terminal on purpose,
    // and server-side code logs to stdout, which is the container log
    files: ["*.js", "config/**", "scripts/**", "__tests__/**", "app/api/**", "app/utils/**"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["__tests__/**"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "node_modules/**",
    "public/**",
    "error/**",
    "next-env.d.ts",
  ]),
]);
