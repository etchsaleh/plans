import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * Hexagonal dependency rules (see docs/PLAN.md §7):
 *   domain       → (nothing)
 *   ports        → domain
 *   application  → domain, ports
 *   contracts    → domain, ports
 *   adapters     → domain, ports, lib, (contracts in tests)
 *   composition  → everything server-side
 *   app/worker   → composition, application (types), domain, ui, lib
 */
const elements = [
  { type: "domain", pattern: "src/domain/**" },
  { type: "ports", pattern: "src/ports/**" },
  { type: "application", pattern: "src/application/**" },
  { type: "contracts", pattern: "src/contracts/**" },
  { type: "adapters", pattern: "src/adapters/**" },
  { type: "composition", pattern: "src/composition/**" },
  { type: "worker", pattern: "src/worker/**" },
  { type: "app", pattern: "src/app/**" },
  { type: "ui", pattern: "src/ui/**" },
  { type: "lib", pattern: "src/lib/**" },
];

const allowed = {
  domain: ["domain"],
  ports: ["domain", "ports"],
  application: ["domain", "ports", "application"],
  contracts: ["domain", "ports", "contracts"],
  adapters: ["domain", "ports", "adapters", "lib", "contracts"],
  composition: ["domain", "ports", "application", "adapters", "composition", "lib"],
  worker: ["composition", "application", "domain", "ports", "lib", "worker"],
  app: ["composition", "application", "domain", "ports", "ui", "lib", "app"],
  ui: ["ui", "lib", "domain"],
  lib: ["lib"],
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": elements,
      "boundaries/include": ["src/**/*"],
      "import/resolver": { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: Object.entries(allowed).map(([from, to]) => ({
            from: { element: { type: from } },
            allow: to.map((t) => ({ to: { element: { type: t } } })),
          })),
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/ui/spell/**"]),
]);
