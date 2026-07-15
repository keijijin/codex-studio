const EXTENSION_LANGUAGE: Record<string, string> = {
  java: 'java',
  xml: 'xml',
  xsd: 'xml',
  xsl: 'xml',
  xslt: 'xml',
  wsdl: 'xml',
  svg: 'xml',
  plist: 'xml',
  csproj: 'xml',
  fsproj: 'xml',
  vbproj: 'xml',
  props: 'xml',
  targets: 'xml',
  nuspec: 'xml',
  pom: 'xml',
  config: 'xml',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  md: 'markdown',
  markdown: 'markdown',
  css: 'css',
  scss: 'scss',
  html: 'html',
  htm: 'html',
  jsp: 'html',
  py: 'python',
  rs: 'rust',
  go: 'go',
  yaml: 'yaml',
  yml: 'yaml',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  properties: 'ini',
  gradle: 'java',
  groovy: 'java',
}

const BASENAME_LANGUAGE: Record<string, string> = {
  'pom.xml': 'xml',
  'build.gradle': 'java',
  'settings.gradle': 'java',
  'gradle.properties': 'ini',
  dockerfile: 'dockerfile',
}

export function guessMonacoLanguage(filename: string): string {
  const base = filename.split(/[/\\]/).pop()?.toLowerCase() ?? filename.toLowerCase()
  const basenameMatch = BASENAME_LANGUAGE[base]
  if (basenameMatch) {
    return basenameMatch
  }

  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : ''
  return EXTENSION_LANGUAGE[ext] ?? 'plaintext'
}

export function isJavaLanguage(language: string): boolean {
  return language === 'java'
}

export function isXmlLanguage(language: string): boolean {
  return language === 'xml'
}
