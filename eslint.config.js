// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * ESLint flat config: recommended + strict typescript-eslint rules, plus project invariants. Network access is
 * confined to src/inspectors/http/fetch.ts (opt-in, authorized passive requests); child processes only in src/exec/process.ts (opt-in command execution and hardened read-only git).
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const NO_PROCESS = {
  name: "node:child_process",
  message: "Only src/exec/process.ts starts processes (opt-in verification and read-only git).",
};
const NET = ["node:http", "node:https", "node:net", "node:tls", "node:dgram", "node:http2"].map((name) => ({
  name,
  message: "Network access lives only in src/inspectors/http/fetch.ts.",
}));

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "node_modules/", "test/fixtures/**", "examples/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: [NO_PROCESS, ...NET] }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/exec/process.ts"],
    rules: { "no-restricted-imports": ["error", { paths: NET }] },
  },
  {
    files: ["test/**/*.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off", "no-restricted-imports": "off" },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        document: "readonly",
        window: "readonly",
      },
    },
  }
);
