import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/e2e/**', '**/release/**', '**/out/**'],
  },
  resolve: {
    alias: {
      '@codex/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@codex/tools': resolve(__dirname, 'packages/tools/src/index.ts'),
      '@codex/llm-adapters': resolve(__dirname, 'packages/llm-adapters/src/index.ts'),
      '@codex/agent-core': resolve(__dirname, 'packages/agent-core/src/index.ts'),
      '@codex/indexer': resolve(__dirname, 'packages/indexer/src/index.ts'),
    },
  },
})
