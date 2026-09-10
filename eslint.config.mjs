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
        // The palette is OURS. Every colour a screen paints comes from the tokens in
        // globals.css - the brand blues, the three status families, and the slate
        // neutral ramp. A borrowed Tailwind hue puts a colour on screen that appears
        // nowhere else in the product, and reaching for one is also how the same idea
        // ends up drawn four ways: text-red-500/600/700/800 all meant "danger".
        //
        // `slate` is deliberately absent from the blocked list - design-system.md 4.6
        // names it the neutral ramp.
        {
          selector:
            'Literal[value=/\\b(bg|text|border|ring|divide|fill|stroke|placeholder|from|to|via|outline|decoration|accent)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|zinc|neutral|stone)-[0-9]/]',
          message:
            'Use the design system, not a borrowed Tailwind hue. Brand: primary / primary-strong / secondary / secondary-ink. Status: success|warning|danger with -surface / -tint / -border / -ink. Neutral: the slate ramp. See docs/design-system.md 1.',
        },
        {
          selector:
            'TemplateElement[value.raw=/\\b(bg|text|border|ring|divide|fill|stroke|placeholder|from|to|via|outline|decoration|accent)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|zinc|neutral|stone)-[0-9]/]',
          message:
            'Use the design system, not a borrowed Tailwind hue. Brand: primary / primary-strong / secondary / secondary-ink. Status: success|warning|danger with -surface / -tint / -border / -ink. Neutral: the slate ramp. See docs/design-system.md 1.',
        },
      ],
    },
  },
  {
    // The tag palette is a USER-CHOSEN colour vocabulary: a person picks a colour to tell
    // their own tags apart, so it needs more distinct hues than the product's own palette
    // carries. It is the one place a borrowed hue is the point rather than a lapse.
    files: ['src/app/(prt)/tags/tone.ts'],
    rules: { 'no-restricted-syntax': 'off' },
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
