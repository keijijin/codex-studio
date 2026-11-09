import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const sharedAlias = {
  '@codex/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
  '@codex/indexer': resolve(__dirname, 'packages/indexer/src/index.ts'),
  '@codex/llm-adapters': resolve(__dirname, 'packages/llm-adapters/src/index.ts'),
  '@codex/tools': resolve(__dirname, 'packages/tools/src/index.ts'),
  '@codex/agent-core': resolve(__dirname, 'packages/agent-core/src/index.ts'),
  '@codex/media': resolve(__dirname, 'packages/media/src/index.ts'),
  '@codex/mcp-client': resolve(__dirname, 'packages/mcp-client/src/index.ts'),
}

/** Native / special deps that must not be bundled into Electron main. */
const mainExternals = [
  '@vscode/ripgrep',
  /^@vscode\/ripgrep-/,
  'node-pty',
  '@resvg/resvg-js',
  /^@resvg\/resvg-js-/,
  // Keep MCP SDK external (ESM); main bundle resolves it at runtime.
  '@modelcontextprotocol/sdk',
  /^@modelcontextprotocol\/sdk\//,
]

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@codex/shared',
          '@codex/indexer',
          '@codex/llm-adapters',
          '@codex/tools',
          '@codex/agent-core',
          '@codex/media',
          '@codex/mcp-client',
        ],
      }),
    ],
    resolve: {
      alias: sharedAlias,
    },
    build: {
      rollupOptions: {
        external: mainExternals,
        input: {
          index: resolve(__dirname, 'packages/app/src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    // Sandboxed preload cannot load ESM (.mjs) or external deps — emit a single CJS bundle.
    plugins: [],
    resolve: {
      alias: sharedAlias,
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'packages/app/src/preload/index.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          inlineDynamicImports: true,
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
