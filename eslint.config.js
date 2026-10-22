import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import sonarjs from 'eslint-plugin-sonarjs'
import globals from 'globals'

const vitestGlobals = {
  vi: 'readonly',
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly'
}

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      // Code Vue/Nuxt de l'ancien front, gardé en lecture seule (voir son README).
      'reference/**'
    ]
  },
  js.configs.recommended,
  // SonarJS — mirrors the SonarLint analyzer (same rule ids); the
  // threshold set in sonarlint.rules (.vscode/settings.json) is the
  // plugin default for S3776 (15).
  sonarjs.configs.recommended,
  {
    rules: {
      // Type-aware rules with a systemic false-positive rate on this
      // codebase (untyped API JSON, DOM guards) — same offs as onrari.
      'sonarjs/no-redundant-optional': 'off',
      'sonarjs/null-dereference': 'off',
      'sonarjs/argument-type': 'off',
      'sonarjs/function-return-type': 'off',
      'sonarjs/different-types-comparison': 'off'
    }
  },
  ...tseslint.configs.recommended,
  {
    files: ['packages/widget/**/*.spec.ts'],
    languageOptions: {
      globals: vitestGlobals
    }
  },
  {
    files: ['packages/widget/**/*.ts'],
    languageOptions: {
      globals: globals.browser
    }
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module'
    },
    rules: {
      'prefer-const': 'error',
      'no-console': 'error',
      'no-undef': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  },
  {
    // Données de l'API injectées via textContent uniquement (cahier §7.4).
    files: ['packages/widget/src/**/*.ts'],
    ignores: ['packages/widget/src/**/*.spec.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['innerHTML', 'outerHTML', 'insertAdjacentHTML'].map((property) => ({
          property,
          message: 'Utiliser textContent : aucune donnée API ne doit être interprétée en HTML.'
        }))
      ]
    }
  },
  {
    files: ['packages/widget/scripts/**/*.mjs', 'packages/widget/*.config.ts'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ['packages/widget/src/logger.ts', 'packages/widget/scripts/**/*.mjs'],
    rules: {
      'no-console': 'off'
    }
  },
  prettier
)
