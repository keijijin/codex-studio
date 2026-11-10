export type MdViewMode = 'edit' | 'preview'

export type EditorTabKind = 'text' | 'pdf'

export function isMarkdownFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase()
  return ext === 'md' || ext === 'markdown'
}

export function isPdfFile(name: string): boolean {
  return name.split('.').pop()?.toLowerCase() === 'pdf'
}

export function defaultMdViewMode(name: string): MdViewMode {
  return isMarkdownFile(name) ? 'preview' : 'edit'
}

export function defaultTabKind(name: string): EditorTabKind {
  return isPdfFile(name) ? 'pdf' : 'text'
}
