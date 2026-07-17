/** Detect preferred reply language from user text. */
export type ReplyLanguage = 'ja' | 'en' | 'auto'

const JA_CHAR_RE = /[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]/

export function detectReplyLanguage(text: string): ReplyLanguage {
  if (JA_CHAR_RE.test(text)) return 'ja'
  // Latin-heavy prompts default to English; otherwise leave auto
  if (/[A-Za-z]{3,}/.test(text)) return 'en'
  return 'auto'
}

/** Strong instruction appended to system prompts. */
export function formatLanguageInstruction(lang: ReplyLanguage): string {
  if (lang === 'ja') {
    return `\n\n## Language (必須)
ユーザーは日本語で指示しています。回答・要約・説明・見出しはすべて日本語で書いてください。
コード識別子・ファイルパス・コマンドはそのままで構いませんが、地の文は英語にしないでください。`
  }
  if (lang === 'en') {
    return `\n\n## Language
The user wrote in English. Reply entirely in English (code identifiers and paths may stay as-is).`
  }
  return `\n\n## Language
Reply in the same language as the user's latest message. If they wrote in Japanese, reply fully in Japanese.`
}
