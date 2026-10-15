/**
 * Flat ESLint config covering all three workspaces.
 *
 * One config at the root rather than one per workspace: the rules are the same
 * everywhere and the only real difference is which globals exist — Node in the
 * server and shared packages, the DOM in the client.
 */
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Build output and the staged add-on tree, which is generated and would
    // otherwise be linted as if it were source.
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'addon/rootfs/app/**',
      'client/public/**',
      // Temporary trees from `npm run check:addon`.
      '.addon-check-*/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      // An unused name is usually a leftover, but a deliberately ignored
      // argument is normal in Express middleware signatures, where position
      // is what gives a parameter meaning.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'object-shorthand': 'error',
    },
  },

  {
    files: ['server/**/*.ts', 'shared/**/*.ts', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
);
