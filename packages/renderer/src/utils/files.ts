export type MdViewMode = 'edit' | 'preview'

export function isMarkdownFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase()
  return ext === 'md' || ext === 'markdown'
}

export function defaultMdViewMode(name: string): MdViewMode {
  return isMarkdownFile(name) ? 'preview' : 'edit'
}
