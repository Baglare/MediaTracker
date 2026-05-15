import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // R19: design_references/ runtime kodu değil; içe aktarılan kaynak
    // dosyalar canlı uygulamadan tüketilmiyor (CLAUDE.md "dosya hiyerarşisi"
    // notuna bak). Bu JSX prototype snapshot'larının lint sorunları
    // (kullanılmayan import'lar, render içinde ref erişimi) gerçek kod
    // kalitesini yansıtmıyor — lint kapsamı dışı.
    "design_references/**",
    "ml-service/.venv/**",
    "ml-service/**/__pycache__/**",
  ]),
]);

export default eslintConfig;
