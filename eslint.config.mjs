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
      '@typescript-eslint/no-explicit-any': 'error',
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
  {
    files: [
      'backend/src/**/*.ts',
      'scripts/src/**/*.ts',
      'lib/*/src/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-require-imports': 'error',
      'no-restricted-globals': [
        'error',
        {
          name: 'require',
          message:
            'El código bundleable debe usar imports ESM analizables por el build.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression:not([source.type="Literal"])',
          message:
            'Los import() del código bundleable deben usar un módulo literal para que el build pueda auditarlo.',
        },
        {
          selector: 'Identifier[name="createRequire"]',
          message:
            'createRequire evita el inventario estático de dependencias del build.',
        },
        {
          selector: 'MemberExpression[computed=false][property.name="require"]',
          message:
            'Las cargas require mediante propiedades evitan el inventario estático del build.',
        },
        {
          selector: 'MemberExpression[computed=true][property.value="require"]',
          message:
            'Las cargas require mediante propiedades evitan el inventario estático del build.',
        },
        {
          selector:
            'MemberExpression[computed=true][property.value="createRequire"]',
          message:
            'createRequire evita el inventario estático de dependencias del build.',
        },
      ],
    },
  },
);
