import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/e2e/**', '**/release/**', '**/out/**'],
    coverage: {
      provider: 'v8',
      include: ['packages/**/src/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        '**/vite-env.d.ts',
        '**/env.d.ts',
        'packages/app/src/preload/**',
        'packages/renderer/src/**',
        // Electron bootstrap / IPC — covered by E2E
        'packages/app/src/main/index.ts',
        'packages/app/src/main/ipc/**',
        'packages/app/src/main/utils/paths.ts',
        'packages/app/src/main/services/agent.ts',
        'packages/app/src/main/services/chat.ts',
        'packages/app/src/main/services/e2e-mock-agent.ts',
        'packages/app/src/main/services/file-watcher.ts',
        'packages/app/src/main/services/terminal-service.ts',
        'packages/app/src/main/services/settings.ts',
        'packages/app/src/main/services/llm-config.ts',
        'packages/app/src/main/services/audit-log.ts',
        // Network providers — mock in integration tests
        'packages/llm-adapters/src/anthropic-provider.ts',
        'packages/llm-adapters/src/openai-provider.ts',
        'packages/llm-adapters/src/ollama-provider.ts',
        'packages/llm-adapters/src/models.ts',
        'packages/indexer/src/ripgrep.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 40,
        functions: 35,
        branches: 30,
        statements: 40,
      },
    },
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
