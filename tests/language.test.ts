import { describe, expect, it } from 'vitest'
import { detectReplyLanguage, formatLanguageInstruction } from '@codex/agent-core'

describe('language', () => {
  it('detects Japanese prompts', () => {
    expect(detectReplyLanguage('README.mdを要約して')).toBe('ja')
    expect(detectReplyLanguage('この関数を説明して')).toBe('ja')
  })

  it('detects English prompts', () => {
    expect(detectReplyLanguage('Summarize README.md')).toBe('en')
  })

  it('emits a strong Japanese instruction', () => {
    const block = formatLanguageInstruction('ja')
    expect(block).toContain('日本語')
    expect(block).toContain('必須')
  })
})
