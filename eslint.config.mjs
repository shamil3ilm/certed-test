import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      // Design-system guard: no arbitrary font sizes in classNames. Use a named
      // step from the typography scale (text-micro, text-meta, text-xs, text-sm,
      // ...) defined in src/app/globals.css @theme; add a new step there if none
      // fits, so a size lives in one place instead of scattered text-[13px] magic.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/text-\\[[0-9.]+(px|rem|em)\\]/]',
          message:
            'No arbitrary font size (text-[Npx]). Use a scale token (text-micro/text-meta/text-xs/...) or add a step to @theme in globals.css.',
        },
        {
          selector: 'TemplateElement[value.raw=/text-\\[[0-9.]+(px|rem|em)\\]/]',
          message:
            'No arbitrary font size (text-[Npx]). Use a scale token (text-micro/text-meta/text-xs/...) or add a step to @theme in globals.css.',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Generated coverage report (its bundled JS carries its own eslint-disable
    // directives) - never lint it.
    'coverage/**',
  ]),
])

export default eslintConfig
