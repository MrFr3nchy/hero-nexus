import { FlatCompat } from '@eslint/eslintrc';
import prettier from 'eslint-plugin-prettier';
import unusedImports from 'eslint-plugin-unused-imports';
import heroNexus from './eslint-rules/index.mjs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    plugins: {
      prettier,
      'unused-imports': unusedImports,
      'hero-nexus': heroNexus,
    },
    rules: {
      'prettier/prettier': 'error',
      // Design-language rule 10: controls on one row share one size.
      'hero-nexus/one-size-per-row': 'error',
      'arrow-body-style': 'off',
      'prefer-arrow-callback': 'off',
      // Unused variables and imports. One rule owns each: the core
      // `no-unused-vars` cannot read TypeScript and flags every parameter
      // named in a function *type* (`onChange: (next: T) => void`), and
      // `unused-imports/no-unused-vars` is typescript-eslint's rule with the
      // `_` convention added, so running that one bare as well only repeats
      // it without the convention.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      // `./cli deploy` builds into .next.new and keeps .next.old for a
      // one-rename rollback. Both are build output; linting them takes
      // minutes and reports nothing.
      '.next.*/**',
      // Ops scripts, run by node on the droplet rather than bundled: plain
      // CommonJS, and the TypeScript ruleset has nothing useful to say
      // about them.
      'deploy/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
    ],
  },
];

export default eslintConfig;
