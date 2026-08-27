import type { IDisposable, IPosition, editor, languages } from 'monaco-editor'
import { IPC_CHANNELS } from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'

let disposable: IDisposable | null = null
let seq = 0

/**
 * Register a single global inline completions provider (Tab / Esc ghost text).
 * Skips while Agent/Ask is streaming to avoid focus contention (N2-4).
 */
export function ensureInlineCompletionProvider(
  monaco: typeof import('monaco-editor'),
): void {
  if (disposable) return

  disposable = monaco.languages.registerInlineCompletionsProvider(
    { pattern: '**' },
    {
      freeInlineCompletions() {},
      async provideInlineCompletions(
        model: editor.ITextModel,
        position: IPosition,
        _context: languages.InlineCompletionContext,
        token: { isCancellationRequested: boolean },
      ): Promise<languages.InlineCompletions | null> {
        const settings = useAppStore.getState().settings
        if (!settings?.tabCompletion?.enabled) return null
        if (useAppStore.getState().isStreaming) return null

        const debounceMs = settings.tabCompletion.debounceMs ?? 400
        const mySeq = ++seq
        await new Promise((r) => setTimeout(r, debounceMs))
        if (token.isCancellationRequested || mySeq !== seq) return null
        if (useAppStore.getState().isStreaming) return null

        const offset = model.getOffsetAt(position)
        const value = model.getValue()
        const prefix = value.slice(Math.max(0, offset - 4000), offset)
        const suffix = value.slice(offset, offset + 500)
        if (prefix.trim().length < 4) return null

        try {
          const result = await window.codex.invoke(IPC_CHANNELS.COMPLETION_REQUEST, {
            prefix,
            suffix,
            language: model.getLanguageId(),
            path: model.uri.path,
          })
          if (token.isCancellationRequested || mySeq !== seq) return null
          if (!result.text?.trim()) return null

          return {
            items: [
              {
                insertText: result.text,
                range: new monaco.Range(
                  position.lineNumber,
                  position.column,
                  position.lineNumber,
                  position.column,
                ),
              },
            ],
          }
        } catch {
          return null
        }
      },
    },
  )
}
