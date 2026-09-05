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
    // Layering guard: the app layer talks to services, never straight to the data layer.
    // Reaching past services loses the authorization + validation that lives there, and it
    // is how service-role reads/writes end up issued from route handlers. See
    // docs/architecture-rules.md and ADR 0001.
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/data/*', '@/lib/data'],
              message:
                'src/app must not import the data layer directly. Call a service in @/lib/services (add a thin wrapper if none exists) so the authorization and validation are not bypassed.',
            },
          ],
        },
      ],
    },
  },
  {
    // The dependency direction is app -> services -> data. A lib module importing from
    // src/app inverts it and couples domain code to a route group's file layout - even for
    // a type, which belongs in the lib layer instead.
    files: ['src/lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '@/app'],
              message:
                'src/lib must not import from src/app. Move the shared type or helper into src/lib (e.g. @/lib/attachments/view) and import it from both sides.',
            },
          ],
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
    // Generated Playwright artifacts (HTML report bundles + trace viewer JS).
    // ESLint does not read .gitignore, so these need their own entry or a run
    // that has produced a report will fail the lint gate on vendored bundles.
    'playwright-report*/**',
    'test-results/**',
  ]),
])

export default eslintConfig
