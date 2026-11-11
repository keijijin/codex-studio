import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { cpSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'path'
import type { Plugin } from 'vite'

const require = createRequire(import.meta.url)

/** Copy pdf.js cmap / font / wasm dirs with original filenames (hashed ?url breaks pdf.js). */
function copyPdfjsAssetsPlugin(): Plugin {
  const dirs = ['cmaps', 'standard_fonts', 'wasm'] as const

  const resolvePdfjsRoot = (): string => {
    return dirname(require.resolve('pdfjs-dist/package.json'))
  }

  const copyInto = (targetRoot: string) => {
    const pdfjsRoot = resolvePdfjsRoot()
    for (const dir of dirs) {
      const src = join(pdfjsRoot, dir)
      if (!existsSync(src)) continue
      cpSync(src, join(targetRoot, 'pdfjs', dir), { recursive: true })
    }
  }

  return {
    name: 'copy-pdfjs-assets',
    configureServer() {
      // Dev: Vite serves `public/` as static files.
      copyInto(resolve(__dirname, 'packages/renderer/public'))
    },
    closeBundle() {
      // Prod: electron-vite emits renderer into out/renderer
      copyInto(resolve(__dirname, 'out/renderer'))
    },
  }
}

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
    plugins: [react(), copyPdfjsAssetsPlugin()],
    optimizeDeps: {
      include: ['monaco-editor', 'pdfjs-dist'],
      exclude: ['pdfjs-dist/build/pdf.worker.min.mjs', 'pdfjs-dist/build/pdf.renderer.min.mjs'],
    },
    assetsInclude: ['**/*.wasm', '**/*.bcmap', '**/*.pfb'],
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
