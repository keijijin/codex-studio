export interface AgentBenchmarkCase {
  id: string
  category: 'read' | 'search' | 'write' | 'shell' | 'multi'
  prompt: string
  mockResponses: Array<
    | { type: 'tool'; tool: string; args: Record<string, unknown> }
    | { type: 'text'; content: string }
  >
  expectedTools: string[]
  expectedEvents: Array<'tool_call_start' | 'tool_call_result' | 'text_delta' | 'done'>
}

/** 20 benchmark scenarios for Agent orchestrator (mock LLM). */
export const AGENT_BENCHMARK_CASES: AgentBenchmarkCase[] = [
  {
    id: 'read-01',
    category: 'read',
    prompt: 'README.md の内容を教えて',
    mockResponses: [
      { type: 'tool', tool: 'Read', args: { path: 'README.md' } },
      { type: 'text', content: 'README の概要です。' },
    ],
    expectedTools: ['Read'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'read-02',
    category: 'read',
    prompt: 'greet.ts を読んで',
    mockResponses: [
      { type: 'tool', tool: 'Read', args: { path: 'src/greet.ts' } },
      { type: 'text', content: 'greet 関数があります。' },
    ],
    expectedTools: ['Read'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'grep-01',
    category: 'search',
    prompt: 'add 関数を grep して',
    mockResponses: [
      { type: 'tool', tool: 'Grep', args: { pattern: 'function add', path: 'src' } },
      { type: 'text', content: 'math.ts に add があります。' },
    ],
    expectedTools: ['Grep'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'grep-02',
    category: 'search',
    prompt: 'Hello を検索',
    mockResponses: [
      { type: 'tool', tool: 'Grep', args: { pattern: 'Hello' } },
      { type: 'text', content: 'greet.ts に一致。' },
    ],
    expectedTools: ['Grep'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'glob-01',
    category: 'search',
    prompt: 'TypeScript ファイル一覧',
    mockResponses: [
      { type: 'tool', tool: 'Glob', args: { pattern: '**/*.ts' } },
      { type: 'text', content: '2 ファイル見つかりました。' },
    ],
    expectedTools: ['Glob'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'glob-02',
    category: 'search',
    prompt: 'src 配下の ts',
    mockResponses: [
      { type: 'tool', tool: 'Glob', args: { pattern: 'src/**/*.ts' } },
      { type: 'text', content: 'src 配下の TS 一覧。' },
    ],
    expectedTools: ['Glob'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'write-01',
    category: 'write',
    prompt: 'notes.txt を作成',
    mockResponses: [
      { type: 'tool', tool: 'Write', args: { path: 'notes.txt', content: 'test note' } },
      { type: 'text', content: 'ファイルを作成しました。' },
    ],
    expectedTools: ['Write'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'strreplace-01',
    category: 'write',
    prompt: 'greet のメッセージを変更',
    mockResponses: [
      { type: 'tool', tool: 'StrReplace', args: { path: 'src/greet.ts', old_string: 'Hello', new_string: 'Hi' } },
      { type: 'text', content: '置換しました。' },
    ],
    expectedTools: ['StrReplace'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'delete-01',
    category: 'write',
    prompt: 'notes.txt を削除',
    mockResponses: [
      { type: 'tool', tool: 'Delete', args: { path: 'notes.txt' } },
      { type: 'text', content: '削除しました。' },
    ],
    expectedTools: ['Delete'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'shell-01',
    category: 'shell',
    prompt: 'git status を実行',
    mockResponses: [
      { type: 'tool', tool: 'Shell', args: { command: 'git status' } },
      { type: 'text', content: 'git status の結果です。' },
    ],
    expectedTools: ['Shell'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'shell-02',
    category: 'shell',
    prompt: 'ls src',
    mockResponses: [
      { type: 'tool', tool: 'Shell', args: { command: 'ls src' } },
      { type: 'text', content: 'src の一覧。' },
    ],
    expectedTools: ['Shell'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'multi-01',
    category: 'multi',
    prompt: 'glob してから read',
    mockResponses: [
      { type: 'tool', tool: 'Glob', args: { pattern: 'src/*.ts' } },
      { type: 'tool', tool: 'Read', args: { path: 'src/math.ts' } },
      { type: 'text', content: 'math.ts の内容です。' },
    ],
    expectedTools: ['Glob', 'Read'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'multi-02',
    category: 'multi',
    prompt: 'grep して説明',
    mockResponses: [
      { type: 'tool', tool: 'Grep', args: { pattern: 'export function' } },
      { type: 'text', content: 'export された関数一覧。' },
    ],
    expectedTools: ['Grep'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'read-03',
    category: 'read',
    prompt: 'math.ts の add を説明',
    mockResponses: [
      { type: 'tool', tool: 'Read', args: { path: 'src/math.ts' } },
      { type: 'text', content: 'add は加算関数です。' },
    ],
    expectedTools: ['Read'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'grep-03',
    category: 'search',
    prompt: 'greet を検索',
    mockResponses: [
      { type: 'tool', tool: 'Grep', args: { pattern: 'greet' } },
      { type: 'text', content: 'greet の参照。' },
    ],
    expectedTools: ['Grep'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'glob-03',
    category: 'search',
    prompt: 'README を glob',
    mockResponses: [
      { type: 'tool', tool: 'Glob', args: { pattern: 'README.md' } },
      { type: 'text', content: 'README が見つかりました。' },
    ],
    expectedTools: ['Glob'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'write-02',
    category: 'write',
    prompt: 'tmp/output.txt に書き込み',
    mockResponses: [
      { type: 'tool', tool: 'Write', args: { path: 'tmp/output.txt', content: 'output' } },
      { type: 'text', content: '書き込み完了。' },
    ],
    expectedTools: ['Write'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'multi-03',
    category: 'multi',
    prompt: 'read README と greet',
    mockResponses: [
      { type: 'tool', tool: 'Read', args: { path: 'README.md' } },
      { type: 'tool', tool: 'Read', args: { path: 'src/greet.ts' } },
      { type: 'text', content: '2 ファイルを確認しました。' },
    ],
    expectedTools: ['Read', 'Read'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'shell-03',
    category: 'shell',
    prompt: 'pwd',
    mockResponses: [
      { type: 'tool', tool: 'Shell', args: { command: 'pwd' } },
      { type: 'text', content: 'カレントディレクトリ。' },
    ],
    expectedTools: ['Shell'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
  {
    id: 'multi-04',
    category: 'multi',
    prompt: '調査してから str replace',
    mockResponses: [
      { type: 'tool', tool: 'Read', args: { path: 'src/math.ts' } },
      { type: 'tool', tool: 'StrReplace', args: { path: 'src/math.ts', old_string: 'a + b', new_string: 'a + b // sum' } },
      { type: 'text', content: '変更を適用しました。' },
    ],
    expectedTools: ['Read', 'StrReplace'],
    expectedEvents: ['tool_call_start', 'tool_call_result', 'text_delta', 'done'],
  },
]
