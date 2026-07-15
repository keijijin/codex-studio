/// <reference types="vite/client" />

import type { CodexApi } from '@codex/shared'

declare global {
  interface Window {
    codex: CodexApi
  }
}

export {}
