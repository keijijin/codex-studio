import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'out', 'release', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  // Agent file tools must go through WorkspaceFs (S2). Allowlisted infra files may use fs.
  {
    files: [
      'packages/tools/src/tools/write.ts',
      'packages/tools/src/tools/str-replace.ts',
      'packages/tools/src/tools/delete.ts',
      'packages/tools/src/tools/read.ts',
      'packages/tools/src/tools/memory-append.ts',
      'packages/tools/src/utils/file-ops.ts',
      'packages/agent-core/src/memory.ts',
      'packages/agent-core/src/team-runner.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'fs', message: 'Use WorkspaceFs / ctx.fs instead of fs' },
            { name: 'fs/promises', message: 'Use WorkspaceFs / ctx.fs instead of fs/promises' },
            { name: 'node:fs', message: 'Use WorkspaceFs / ctx.fs instead of node:fs' },
            {
              name: 'node:fs/promises',
              message: 'Use WorkspaceFs / ctx.fs instead of node:fs/promises',
            },
          ],
        },
      ],
    },
  },
)
