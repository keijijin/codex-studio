import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const sharedAlias = {
  '@codex/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
  '@codex/indexer': resolve(__dirname, 'packages/indexer/src/index.ts'),
  '@codex/llm-adapters': resolve(__dirname, 'packages/llm-adapters/src/index.ts'),
  '@codex/tools': resolve(__dirname, 'packages/tools/src/index.ts'),
  '@codex/agent-core': resolve(__dirname, 'packages/agent-core/src/index.ts'),
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@codex/shared', '@codex/indexer', '@codex/llm-adapters', '@codex/tools', '@codex/agent-core'] })],
    resolve: {
      alias: sharedAlias,
    },
    build: {
      rollupOptions: {
        external: ['@vscode/ripgrep', /^@vscode\/ripgrep-/, 'node-pty'],
        input: {
          index: resolve(__dirname, 'packages/app/src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@codex/shared'] })],
    resolve: {
      alias: sharedAlias,
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'packages/app/src/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'packages/renderer'),
    css: {
      postcss: resolve(__dirname, 'packages/renderer/postcss.config.js'),
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'packages/renderer/index.html'),
        },
      },
    },
    plugins: [react()],
    optimizeDeps: {
      include: ['monaco-editor'],
    },
    worker: {
      format: 'es',
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'packages/renderer/src'),
        ...sharedAlias,
      },
    },
  },
})
