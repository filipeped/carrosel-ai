// Config minimal pra quando rodar eslint. Nao bloqueia build — so pra
// identificar problemas localmente. next lint deprecated a partir do Next 16,
// este arquivo serve pro codemod "next-lint-to-eslint-cli" futuro.
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["node_modules/**", ".next/**", "public/**", "data/**", "scripts/**"],
  },
];
