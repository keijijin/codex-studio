import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

export const CODEX_EDITOR_THEME = 'codex-dark'

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    switch (label) {
      case 'json':
        return new jsonWorker()
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker()
      case 'html':
      case 'handlebars':
      case 'razor':
      case 'xml':
        return new htmlWorker()
      case 'typescript':
      case 'javascript':
        return new tsWorker()
      default:
        return new editorWorker()
    }
  },
}

loader.config({ monaco })

monaco.editor.defineTheme(CODEX_EDITOR_THEME, {
  base: 'vs-dark',
  inherit: true,
  rules: [
    // XML
    { token: 'tag', foreground: '4EC9B0', fontStyle: 'bold' },
    { token: 'metatag', foreground: 'C586C0', fontStyle: 'bold' },
    { token: 'metatag.content', foreground: 'C586C0' },
    { token: 'attribute.name', foreground: '9CDCFE' },
    { token: 'attribute.value', foreground: 'CE9178' },
    { token: 'delimiter.xml', foreground: '808080' },

    // Java
    { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },
    { token: 'keyword.java', foreground: '569CD6', fontStyle: 'bold' },
    { token: 'type', foreground: '4EC9B0' },
    { token: 'type.java', foreground: '4EC9B0' },
    { token: 'type.identifier', foreground: '4EC9B0' },
    { token: 'annotation', foreground: 'DCDCAA' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'string.java', foreground: 'CE9178' },
    { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
    { token: 'comment.java', foreground: '6A9955', fontStyle: 'italic' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'number.java', foreground: 'B5CEA8' },
    { token: 'operator', foreground: 'D4D4D4' },
    { token: 'operator.java', foreground: 'D4D4D4' },
  ],
  colors: {
    'editor.background': '#1e1e1e',
    'editorLineNumber.foreground': '#5a5a5a',
    'editorLineNumber.activeForeground': '#cccccc',
    'editorCursor.foreground': '#aeafad',
    'editor.selectionBackground': '#264f78',
    'editor.inactiveSelectionBackground': '#3a3d41',
    'editor.lineHighlightBackground': '#2a2d2e',
    'editorIndentGuide.background': '#404040',
    'editorIndentGuide.activeBackground': '#707070',
    'editorBracketMatch.background': '#00640080',
    'editorBracketMatch.border': '#888888',
  },
})
