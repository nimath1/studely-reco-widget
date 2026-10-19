import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
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
      'reference/**',
      'apps/api/prisma/generated/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ['apps/api/**/*.spec.ts', 'apps/widget/**/*.spec.ts'],
    languageOptions: {
      globals: vitestGlobals
    }
  },
  {
    files: ['apps/widget/**/*.ts'],
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
    files: ['apps/widget/src/**/*.ts'],
    ignores: ['apps/widget/src/**/*.spec.ts'],
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
    files: ['apps/widget/scripts/**/*.mjs', 'apps/widget/*.config.ts'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ['apps/widget/src/logger.ts', 'apps/widget/scripts/**/*.mjs'],
    rules: {
      'no-console': 'off'
    }
  },
  prettier
)
