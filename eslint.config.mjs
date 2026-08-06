import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const typedSourceFiles = [
  'backend/src/**/*.ts',
  'frontend/src/**/*.{ts,tsx}',
  'scripts/src/**/*.ts',
  'lib/*/src/**/*.{ts,tsx}',
];

export default defineConfig(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    'lib/api-client-react/src/generated/**',
    'lib/api-zod/src/generated/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      // Keep the rule active; deliberate sanitizers carry a motivated local
      // suppression immediately beside their regular expression.
      'no-control-regex': 'error',
      'no-duplicate-imports': [
        'error',
        { allowSeparateTypeImports: true },
      ],
      // Avoid declaration-order-only rewrites; TypeScript already catches
      // invalid assignments and this gate is focused on behavioral defects.
      'prefer-const': 'off',
      // Temporary debt: the lint script budgets the current 18 occurrences,
      // so a new explicit `any` fails quality until this baseline is reduced.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: typedSourceFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
);
