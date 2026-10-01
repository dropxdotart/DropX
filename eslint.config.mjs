import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // react-three-fiber scenes drive three.js objects imperatively inside
  // useFrame (instance matrices, camera, textures) — that's the intended
  // r3f pattern, but the React Compiler immutability rule reads it as
  // mutating hook values. Scoped off for the 3D scene code only.
  {
    files: ["src/components/game3d/**"],
    rules: { "react-hooks/immutability": "off" },
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
